/**
 * Pre-deploy fork verification — AirCargoEscrow
 *
 * Runs against the live anvil fork spun up by compass-deploy.ts --mode verify.
 * All senders are obtained via anvil_impersonateAccount + anvil_setBalance.
 * No private keys are used or needed.
 *
 * Run from /home/user/app:
 *   bun run contracts/test-integration/AirCargoEscrow.integration.test.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
  pad,
  encodeAbiParameters,
  parseAbiParameters,
  decodeFunctionResult,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ─── Configuration ────────────────────────────────────────────────────────────

const FORK_RPC_URL = 'http://127.0.0.1:45419';
const ESCROW = '0x891093E1F194b3B9C58d859A30cfb2c4dC684a82' as Address;
const USDC = '0x3600000000000000000000000000000000000000' as Address;
const OWNER = '0x281F6Ad154382cb9d688E9328EC97B6476eE64B7' as Address; // initialOwner (constructor arg)
const MASTER_MINTER = '0xa1F45991b7928B14f2047E36958D6Ae7D24bbf41' as Address;

// Fresh addresses for carrier (A) and handler (B) — EIP-55 checksummed
const CARRIER = '0xAAaA000000000000000000000000000000000001' as Address;
const HANDLER = '0xBbbb000000000000000000000000000000000002' as Address;

// A fresh "new owner" for Ownable2Step test — EIP-55 checksummed
const NEW_OWNER = '0xccCc000000000000000000000000000000000003' as Address;

// ─── ABI (minimal — only functions we call) ───────────────────────────────────

const ESCROW_ABI = [
  {
    name: 'createShipment',
    type: 'function',
    inputs: [
      { name: 'awbRef', type: 'bytes32' },
      { name: 'carrier', type: 'address' },
      { name: 'handler', type: 'address' },
      { name: 'carrierBps', type: 'uint16' },
      { name: 'handlerBps', type: 'uint16' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
    outputs: [{ name: 'shipmentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'fund',
    type: 'function',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'confirmDelivery',
    type: 'function',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'claim',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'refund',
    type: 'function',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'cancel',
    type: 'function',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setPaused',
    type: 'function',
    inputs: [{ name: '_paused', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setMaxAmount',
    type: 'function',
    inputs: [{ name: 'newMax', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'transferOwnership',
    type: 'function',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'acceptOwnership',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // views
  { name: 'shipments', type: 'function', inputs: [{ name: '', type: 'uint256' }], outputs: [
      { name: 'awbRef', type: 'bytes32' },
      { name: 'forwarder', type: 'address' },
      { name: 'carrier', type: 'address' },
      { name: 'handler', type: 'address' },
      { name: 'carrierBps', type: 'uint16' },
      { name: 'handlerBps', type: 'uint16' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'status', type: 'uint8' },
    ], stateMutability: 'view' },
  { name: 'claimable', type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'owner', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'pendingOwner', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'paused', type: 'function', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { name: 'shipmentCount', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'maxAmount', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  // Custom errors — needed for viem to decode revert reasons
  { name: 'NotForwarder', type: 'error', inputs: [] },
  { name: 'WrongStatus', type: 'error', inputs: [] },
  { name: 'BpsNotFull', type: 'error', inputs: [] },
  { name: 'DeadlineNotPassed', type: 'error', inputs: [] },
  { name: 'DeadlineInPast', type: 'error', inputs: [] },
  { name: 'AmountExceedsCap', type: 'error', inputs: [] },
  { name: 'Paused', type: 'error', inputs: [] },
  { name: 'ZeroAmount', type: 'error', inputs: [] },
  { name: 'ZeroAddress', type: 'error', inputs: [] },
  { name: 'NothingToClaim', type: 'error', inputs: [] },
  { name: 'OwnableUnauthorizedAccount', type: 'error', inputs: [{ name: 'account', type: 'address' }] },
  { name: 'OwnableInvalidOwner', type: 'error', inputs: [{ name: 'owner', type: 'address' }] },
] as const;

// ERC20 ABI (minimal)
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

// FiatToken-specific ABI entries (not ERC20-standard)
const FIAT_TOKEN_ABI = [
  { name: 'configureMinter', type: 'function', inputs: [{ name: 'minter', type: 'address' }, { name: 'minterAllowedAmount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'mint', type: 'function', inputs: [{ name: '_to', type: 'address' }, { name: '_amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TestResult = {
  testName: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  detail?: string;
  expected?: string;
  actual?: string;
  durationMs: number;
};

const results: TestResult[] = [];
let anyFailed = false;

function log(r: TestResult): void {
  console.log(JSON.stringify(r));
  results.push(r);
  if (r.status === 'FAIL') anyFailed = true;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(FORK_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await resp.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`RPC ${method} failed: ${data.error.message}`);
  return data.result;
}

async function impersonate(addr: Address): Promise<void> {
  await rpcCall('anvil_impersonateAccount', [addr]);
  await rpcCall('anvil_setBalance', [addr, '0x56BC75E2D63100000']); // 100 ETH
}

async function increaseTime(seconds: number): Promise<void> {
  await rpcCall('evm_increaseTime', [seconds]);
  await rpcCall('evm_mine', []);
}

async function setNextBlockTimestamp(ts: bigint): Promise<void> {
  await rpcCall('anvil_setNextBlockTimestamp', [Number(ts)]);
}

const RECEIPT_TIMEOUT = 15_000; // 15 s — should be more than enough on a local fork

/** Helper: wait for a receipt with a short timeout. */
async function waitReceipt(publicClient: PublicClient, hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT, pollingInterval: 500 });
}

/** Expect a contract call to revert with a specific error name. */
async function expectRevert(
  publicClient: PublicClient,
  call: () => Promise<unknown>,
  expectedErrorName: string,
): Promise<{ reverted: boolean; errorName: string | null }> {
  try {
    await call();
    return { reverted: false, errorName: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Check if the error name appears in the message
    const containsError = msg.includes(expectedErrorName);
    return { reverted: true, errorName: containsError ? expectedErrorName : `unknown (${msg.slice(0, 120)})` };
  }
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    log({ testName: name, status: 'PASS', detail: 'ok', durationMs: Date.now() - start });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log({ testName: name, status: 'FAIL', detail: msg.slice(0, 300), durationMs: Date.now() - start });
  }
}

// ─── USDC funding helper via FiatToken configureMinter+mint ───────────────────

async function mintUsdc(
  publicClient: PublicClient,
  walletClient: WalletClient,
  to: Address,
  amount: bigint,
): Promise<void> {
  // Impersonate masterMinter and configure our FORWARDER as a minter
  await impersonate(MASTER_MINTER);
  const configureMinterData = encodeFunctionData({
    abi: FIAT_TOKEN_ABI,
    functionName: 'configureMinter',
    args: [to, amount * 2n], // give headroom
  });
  const configHash = await walletClient.sendTransaction({
    account: MASTER_MINTER,
    to: USDC,
    data: configureMinterData,
    chain: null,
  });
  await waitReceipt(publicClient, configHash);

  // Now impersonate `to` and mint
  await impersonate(to);
  const mintData = encodeFunctionData({
    abi: FIAT_TOKEN_ABI,
    functionName: 'mint',
    args: [to, amount],
  });
  const mintHash = await walletClient.sendTransaction({
    account: to,
    to: USDC,
    data: mintData,
    chain: null,
  });
  await waitReceipt(publicClient, mintHash);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = http(FORK_RPC_URL);

  // pollingInterval: 500ms for snappy receipt confirmation on the fork
  const publicClient = createPublicClient({ transport, pollingInterval: 500 });

  const walletClient = createWalletClient({ transport });

  // ── Setup: impersonate all relevant addresses ─────────────────────────────

  await impersonate(OWNER);
  await impersonate(CARRIER);
  await impersonate(HANDLER);
  await impersonate(NEW_OWNER);

  // ── Setup: Arc USDC quirks ────────────────────────────────────────────────
  //
  // The Arc USDC at 0x3600... is a forwarding proxy to an implementation
  // (0xc6ad...). The implementation calls an Arc-specific compliance precompile
  // at 0x1800... before every transfer. On this anvil fork the precompile may
  // not be properly initialised (returns bare 0x01 byte, not valid EVM code).
  // We deploy a minimal always-allow mock so transfers succeed.
  //
  // Additionally, the USDC implementation may start paused in this fork.
  // We impersonate its pauser and unpause it so safeTransferFrom works.

  const ARC_COMPLIANCE_PRECOMPILE = '0x1800000000000000000000000000000000000000' as Address;
  // Returns true (0x20-byte ABI-encoded bool) for any compliance check.
  // Bytecode: PUSH1 1, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0, RETURN
  const MOCK_COMPLIANCE_BYTECODE = '0x600160005260206000F3' as `0x${string}`;
  await rpcCall('anvil_setCode', [ARC_COMPLIANCE_PRECOMPILE, MOCK_COMPLIANCE_BYTECODE]);

  // Unpause the USDC implementation if paused.
  const USDC_IMPL = '0xc6ad664ac6679f4ce74e10e91449c93ec1ae3ca6' as Address;
  const USDC_IMPL_PAUSER = '0xd5112b6a09931d8c6d1a4e9250955f10a8ada933' as Address;

  const implPaused = await publicClient.readContract({
    address: USDC_IMPL, abi: [{ name: 'paused', type: 'function', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' }] as const, functionName: 'paused',
  });
  if (implPaused) {
    await impersonate(USDC_IMPL_PAUSER);
    const unpauseTx = await walletClient.sendTransaction({
      account: USDC_IMPL_PAUSER, to: USDC_IMPL,
      data: '0x3f4ba83a', // unpause() selector
      chain: null,
    });
    await waitReceipt(publicClient, unpauseTx);
  }

  // ── Setup: mint USDC to FORWARDER (= OWNER here, the one creating shipments) ──
  // We'll use OWNER as forwarder so we can also test owner-gated functions in the same run.
  // For clarity: forwarder = OWNER; carrier = CARRIER; handler = HANDLER
  const FORWARDER = OWNER;

  const MINT_AMOUNT = 20_000_000n; // 20 USDC (6 decimals)
  await mintUsdc(publicClient, walletClient, FORWARDER, MINT_AMOUNT);

  // ── Test 1: createShipment ────────────────────────────────────────────────

  const awbRef = keccak256(new TextEncoder().encode('176-12345675'));
  const escrowAmount = 5_000_000n;

  let shipmentId0 = 0n;
  let blockTimestampBeforeCreate = 0n;

  await runTest('1. createShipment — shipmentId=0, status=Created', async () => {
    const block = await publicClient.getBlock();
    blockTimestampBeforeCreate = block.timestamp;
    const deadline = block.timestamp + 86400n;

    const { request } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'createShipment',
      args: [awbRef as Hex, CARRIER, HANDLER, 7000, 3000, escrowAmount, deadline],
      account: FORWARDER,
    });
    const hash = await walletClient.writeContract({ ...request, account: FORWARDER, chain: null });
    const receipt = await waitReceipt(publicClient, hash);

    if (receipt.status !== 'success') throw new Error(`tx reverted: ${hash}`);

    // Read back the returned shipmentId from logs or read shipmentCount
    const shipCount = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'shipmentCount',
    });
    if (shipCount !== 1n) throw new Error(`Expected shipmentCount=1, got ${shipCount}`);

    const s = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'shipments', args: [0n],
    });
    if (s[8] !== 0) throw new Error(`Expected status=Created(0), got ${s[8]}`);
    if (s[1].toLowerCase() !== FORWARDER.toLowerCase())
      throw new Error(`Expected forwarder=${FORWARDER}, got ${s[1]}`);
    if (s[2].toLowerCase() !== CARRIER.toLowerCase())
      throw new Error(`Expected carrier=${CARRIER}, got ${s[2]}`);
    if (s[3].toLowerCase() !== HANDLER.toLowerCase())
      throw new Error(`Expected handler=${HANDLER}, got ${s[3]}`);
    if (s[6] !== escrowAmount)
      throw new Error(`Expected amount=${escrowAmount}, got ${s[6]}`);
    if (s[4] !== 7000)
      throw new Error(`Expected carrierBps=7000, got ${s[4]}`);
    if (s[5] !== 3000)
      throw new Error(`Expected handlerBps=3000, got ${s[5]}`);
    shipmentId0 = 0n;
  });

  // ── Test 2: fund ─────────────────────────────────────────────────────────

  await runTest('2. fund — status=Funded, contract USDC balance=5_000_000', async () => {
    // First approve the escrow contract to pull USDC
    const { request: approveReq } = await publicClient.simulateContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ESCROW, escrowAmount],
      account: FORWARDER,
    });
    const approveHash = await walletClient.writeContract({ ...approveReq, account: FORWARDER, chain: null });
    await waitReceipt(publicClient, approveHash);

    // Now fund
    const { request } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'fund',
      args: [shipmentId0],
      account: FORWARDER,
    });
    const hash = await walletClient.writeContract({ ...request, account: FORWARDER, chain: null });
    const receipt = await waitReceipt(publicClient, hash);

    if (receipt.status !== 'success') throw new Error(`fund tx reverted: ${hash}`);

    const s = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'shipments', args: [shipmentId0],
    });
    if (s[8] !== 1) throw new Error(`Expected status=Funded(1), got ${s[8]}`);

    const escrowBal = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [ESCROW],
    });
    if (escrowBal !== escrowAmount)
      throw new Error(`Expected contract USDC balance=${escrowAmount}, got ${escrowBal}`);
  });

  // ── Test 3: confirmDelivery ───────────────────────────────────────────────

  await runTest('3. confirmDelivery — status=Released, claimable[carrier]=3_500_000, claimable[handler]=1_500_000', async () => {
    const { request } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'confirmDelivery',
      args: [shipmentId0],
      account: FORWARDER,
    });
    const hash = await walletClient.writeContract({ ...request, account: FORWARDER, chain: null });
    const receipt = await waitReceipt(publicClient, hash);

    if (receipt.status !== 'success') throw new Error(`confirmDelivery tx reverted: ${hash}`);

    const s = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'shipments', args: [shipmentId0],
    });
    if (s[8] !== 2) throw new Error(`Expected status=Released(2), got ${s[8]}`);

    const claimableCarrier = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'claimable', args: [CARRIER],
    });
    const claimableHandler = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'claimable', args: [HANDLER],
    });

    // carrierAmt = 5_000_000 * 7000 / 10000 = 3_500_000
    // handlerAmt = 5_000_000 - 3_500_000 = 1_500_000
    if (claimableCarrier !== 3_500_000n)
      throw new Error(`Expected claimable[carrier]=3_500_000, got ${claimableCarrier}`);
    if (claimableHandler !== 1_500_000n)
      throw new Error(`Expected claimable[handler]=1_500_000, got ${claimableHandler}`);
  });

  // ── Test 4: claim carrier ─────────────────────────────────────────────────

  await runTest('4. claim carrier — USDC balance=3_500_000, claimable[carrier]=0', async () => {
    const balBefore = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [CARRIER],
    });

    const { request } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'claim',
      account: CARRIER,
    });
    const hash = await walletClient.writeContract({ ...request, account: CARRIER, chain: null });
    const receipt = await waitReceipt(publicClient, hash);

    if (receipt.status !== 'success') throw new Error(`carrier claim tx reverted: ${hash}`);

    const balAfter = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [CARRIER],
    });
    const gained = balAfter - balBefore;
    if (gained !== 3_500_000n)
      throw new Error(`Expected carrier USDC gain=3_500_000, got ${gained}`);

    const remaining = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'claimable', args: [CARRIER],
    });
    if (remaining !== 0n)
      throw new Error(`Expected claimable[carrier]=0 after claim, got ${remaining}`);
  });

  // ── Test 5: claim handler ─────────────────────────────────────────────────

  await runTest('5. claim handler — USDC balance=1_500_000, claimable[handler]=0', async () => {
    const balBefore = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [HANDLER],
    });

    const { request } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'claim',
      account: HANDLER,
    });
    const hash = await walletClient.writeContract({ ...request, account: HANDLER, chain: null });
    const receipt = await waitReceipt(publicClient, hash);

    if (receipt.status !== 'success') throw new Error(`handler claim tx reverted: ${hash}`);

    const balAfter = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [HANDLER],
    });
    const gained = balAfter - balBefore;
    if (gained !== 1_500_000n)
      throw new Error(`Expected handler USDC gain=1_500_000, got ${gained}`);

    const remaining = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'claimable', args: [HANDLER],
    });
    if (remaining !== 0n)
      throw new Error(`Expected claimable[handler]=0 after claim, got ${remaining}`);
  });

  // ── Test 6: contract balance after full cycle = 0 ────────────────────────

  await runTest('6. contract USDC balance after full cycle = 0', async () => {
    const bal = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [ESCROW],
    });
    if (bal !== 0n)
      throw new Error(`Expected contract USDC balance=0 after full cycle, got ${bal}`);
  });

  // ── Test 7: fund deadline guard ───────────────────────────────────────────

  await runTest('7. fund deadline guard — revert DeadlineInPast after warp', async () => {
    const block = await publicClient.getBlock();
    const shortDeadline = block.timestamp + 10n; // 10 seconds from now

    // Create shipment 1
    const { request: createReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'createShipment',
      args: [awbRef, CARRIER, HANDLER, 5000, 5000, 1_000_000n, shortDeadline],
      account: FORWARDER,
    });
    const createHash = await walletClient.writeContract({ ...createReq, account: FORWARDER, chain: null });
    const createReceipt = await waitReceipt(publicClient, createHash);
    if (createReceipt.status !== 'success') throw new Error(`create shipment 1 failed: ${createHash}`);

    const shipCount = await publicClient.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: 'shipmentCount' });
    const ship1Id = shipCount - 1n; // the one we just created

    // Approve USDC
    const { request: approveReq } = await publicClient.simulateContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ESCROW, 1_000_000n],
      account: FORWARDER,
    });
    const approveHash = await walletClient.writeContract({ ...approveReq, account: FORWARDER, chain: null });
    await waitReceipt(publicClient, approveHash);

    // Warp time PAST the deadline
    await increaseTime(20); // +20 seconds, past the 10s deadline

    // fund() should now revert with DeadlineInPast
    let reverted = false;
    let revertMsg = '';
    try {
      const { request: fundReq } = await publicClient.simulateContract({
        address: ESCROW,
        abi: ESCROW_ABI,
        functionName: 'fund',
        args: [ship1Id],
        account: FORWARDER,
      });
      await walletClient.writeContract({ ...fundReq, account: FORWARDER, chain: null });
    } catch (e: unknown) {
      reverted = true;
      revertMsg = e instanceof Error ? e.message : String(e);
    }

    if (!reverted) throw new Error('Expected fund() to revert with DeadlineInPast but it succeeded');
    if (!revertMsg.includes('DeadlineInPast'))
      throw new Error(`Expected DeadlineInPast revert, got: ${revertMsg.slice(0, 200)}`);
  });

  // ── Test 8: BPS overflow guard ────────────────────────────────────────────

  await runTest('8. BPS overflow guard — revert BpsNotFull (60000+5536 != 10000)', async () => {
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 86400n;

    let reverted = false;
    let revertMsg = '';
    try {
      await publicClient.simulateContract({
        address: ESCROW,
        abi: ESCROW_ABI,
        functionName: 'createShipment',
        args: [awbRef, CARRIER, HANDLER, 60000, 5536, 1_000_000n, deadline],
        account: FORWARDER,
      });
    } catch (e: unknown) {
      reverted = true;
      revertMsg = e instanceof Error ? e.message : String(e);
    }

    if (!reverted) throw new Error('Expected BpsNotFull revert but call succeeded');
    if (!revertMsg.includes('BpsNotFull'))
      throw new Error(`Expected BpsNotFull revert, got: ${revertMsg.slice(0, 200)}`);
  });

  // ── Test 9: Ownable2Step transfer ─────────────────────────────────────────

  await runTest('9. Ownable2Step — transferOwnership sets pendingOwner, acceptOwnership confirms', async () => {
    // Step 1: owner calls transferOwnership(newAddr)
    const { request: transferReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'transferOwnership',
      args: [NEW_OWNER],
      account: OWNER,
    });
    const transferHash = await walletClient.writeContract({ ...transferReq, account: OWNER, chain: null });
    const transferReceipt = await waitReceipt(publicClient, transferHash);
    if (transferReceipt.status !== 'success') throw new Error(`transferOwnership failed: ${transferHash}`);

    // Verify pendingOwner == newAddr and owner still == OWNER
    const pendingOwner = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'pendingOwner',
    });
    const currentOwner = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'owner',
    });

    if (pendingOwner.toLowerCase() !== NEW_OWNER.toLowerCase())
      throw new Error(`Expected pendingOwner=${NEW_OWNER}, got ${pendingOwner}`);
    if (currentOwner.toLowerCase() !== OWNER.toLowerCase())
      throw new Error(`Expected owner still=${OWNER} (before accept), got ${currentOwner}`);

    // Step 2: newAddr calls acceptOwnership()
    const { request: acceptReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'acceptOwnership',
      account: NEW_OWNER,
    });
    const acceptHash = await walletClient.writeContract({ ...acceptReq, account: NEW_OWNER, chain: null });
    const acceptReceipt = await waitReceipt(publicClient, acceptHash);
    if (acceptReceipt.status !== 'success') throw new Error(`acceptOwnership failed: ${acceptHash}`);

    const newOwnerConfirmed = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'owner',
    });
    if (newOwnerConfirmed.toLowerCase() !== NEW_OWNER.toLowerCase())
      throw new Error(`Expected owner=${NEW_OWNER} after accept, got ${newOwnerConfirmed}`);
  });

  // ─── After ownership transfer, NEW_OWNER is now the owner ─────────────────
  // Tests 10 uses NEW_OWNER as the owner for setPaused calls.

  // ── Test 10: Pause scope ──────────────────────────────────────────────────

  await runTest('10a. Pause scope — setPaused(true) blocks createShipment', async () => {
    // NEW_OWNER is now the owner (after test 9)
    const { request: pauseReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'setPaused',
      args: [true],
      account: NEW_OWNER,
    });
    const pauseHash = await walletClient.writeContract({ ...pauseReq, account: NEW_OWNER, chain: null });
    await waitReceipt(publicClient, pauseHash);

    const isPaused = await publicClient.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: 'paused' });
    if (!isPaused) throw new Error('Expected paused=true after setPaused(true)');

    // createShipment should revert with Paused
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 86400n;
    let reverted = false;
    let revertMsg = '';
    try {
      await publicClient.simulateContract({
        address: ESCROW,
        abi: ESCROW_ABI,
        functionName: 'createShipment',
        args: [awbRef, CARRIER, HANDLER, 7000, 3000, 1_000_000n, deadline],
        account: FORWARDER,
      });
    } catch (e: unknown) {
      reverted = true;
      revertMsg = e instanceof Error ? e.message : String(e);
    }
    if (!reverted) throw new Error('Expected createShipment to revert Paused');
    if (!revertMsg.includes('Paused'))
      throw new Error(`Expected Paused revert, got: ${revertMsg.slice(0, 200)}`);
  });

  await runTest('10b. Pause scope — refund succeeds while paused (past deadline)', async () => {
    // We need a shipment that is Funded and past its deadline.
    // Unpause to create+fund it, then re-pause.
    const { request: unpauseReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'setPaused',
      args: [false],
      account: NEW_OWNER,
    });
    const unpauseHash = await walletClient.writeContract({ ...unpauseReq, account: NEW_OWNER, chain: null });
    await waitReceipt(publicClient, unpauseHash);

    const block = await publicClient.getBlock();
    // Use a 2-hour deadline — long enough that create+approve+fund all succeed well within it.
    // We will jump past it explicitly before calling refund.
    const longDeadline = block.timestamp + 7200n;

    // Create shipment
    const { request: createReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'createShipment',
      args: [awbRef, CARRIER, HANDLER, 5000, 5000, 500_000n, longDeadline],
      account: FORWARDER,
    });
    const createHash = await walletClient.writeContract({ ...createReq, account: FORWARDER, chain: null });
    await waitReceipt(publicClient, createHash);

    const count = await publicClient.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: 'shipmentCount' });
    const pauseShipId = count - 1n;

    // Approve and fund
    const { request: approveReq } = await publicClient.simulateContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ESCROW, 500_000n],
      account: FORWARDER,
    });
    const ah = await walletClient.writeContract({ ...approveReq, account: FORWARDER, chain: null });
    await waitReceipt(publicClient, ah);

    const { request: fundReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'fund',
      args: [pauseShipId],
      account: FORWARDER,
    });
    const fh = await walletClient.writeContract({ ...fundReq, account: FORWARDER, chain: null });
    await waitReceipt(publicClient, fh);

    // Re-pause
    const { request: repauseReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'setPaused',
      args: [true],
      account: NEW_OWNER,
    });
    const rph = await walletClient.writeContract({ ...repauseReq, account: NEW_OWNER, chain: null });
    await waitReceipt(publicClient, rph);

    // Jump the chain's timestamp PAST the deadline (longDeadline + 60 seconds)
    // anvil_setNextBlockTimestamp + evm_mine to commit the new timestamp
    await setNextBlockTimestamp(longDeadline + 60n);
    await rpcCall('evm_mine', []);

    // Record forwarder USDC balance before refund
    const balBefore = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [FORWARDER],
    });

    // refund() while paused — should succeed
    const { request: refundReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'refund',
      args: [pauseShipId],
      account: FORWARDER,
    });
    const refundHash = await walletClient.writeContract({ ...refundReq, account: FORWARDER, chain: null });
    const refundReceipt = await waitReceipt(publicClient, refundHash);

    if (refundReceipt.status !== 'success')
      throw new Error(`refund() reverted while paused (tx ${refundHash}) — should NOT be blocked by pause`);

    // Verify shipment is Refunded
    const s = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'shipments', args: [pauseShipId],
    });
    if (s[8] !== 3) throw new Error(`Expected status=Refunded(3), got ${s[8]}`);

    // Verify USDC returned to forwarder
    const balAfter = await publicClient.readContract({
      address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [FORWARDER],
    });
    if (balAfter - balBefore !== 500_000n)
      throw new Error(`Expected forwarder to receive 500_000 back, got delta=${balAfter - balBefore}`);
  });

  // ── Test 11: cancel (bonus coverage) ─────────────────────────────────────

  await runTest('11. cancel — Created shipment cancelled, status=Cancelled', async () => {
    // Unpause first to create
    const { request: unpauseReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'setPaused',
      args: [false],
      account: NEW_OWNER,
    });
    const uh = await walletClient.writeContract({ ...unpauseReq, account: NEW_OWNER, chain: null });
    await waitReceipt(publicClient, uh);

    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 86400n;
    const { request: createReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'createShipment',
      args: [awbRef, CARRIER, HANDLER, 5000, 5000, 1_000_000n, deadline],
      account: FORWARDER,
    });
    const ch = await walletClient.writeContract({ ...createReq, account: FORWARDER, chain: null });
    await waitReceipt(publicClient, ch);

    const count = await publicClient.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: 'shipmentCount' });
    const cancelShipId = count - 1n;

    const { request: cancelReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'cancel',
      args: [cancelShipId],
      account: FORWARDER,
    });
    const cancelHash = await walletClient.writeContract({ ...cancelReq, account: FORWARDER, chain: null });
    const cancelReceipt = await waitReceipt(publicClient, cancelHash);
    if (cancelReceipt.status !== 'success') throw new Error(`cancel failed: ${cancelHash}`);

    const s = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: 'shipments', args: [cancelShipId],
    });
    if (s[8] !== 4) throw new Error(`Expected status=Cancelled(4), got ${s[8]}`);
  });

  // ── Test 12: setMaxAmount ─────────────────────────────────────────────────

  await runTest('12. setMaxAmount — owner updates cap, non-owner reverts', async () => {
    // NEW_OWNER is the current owner
    const { request: setMaxReq } = await publicClient.simulateContract({
      address: ESCROW,
      abi: ESCROW_ABI,
      functionName: 'setMaxAmount',
      args: [20_000_000n],
      account: NEW_OWNER,
    });
    const smh = await walletClient.writeContract({ ...setMaxReq, account: NEW_OWNER, chain: null });
    await waitReceipt(publicClient, smh);

    const maxAmt = await publicClient.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: 'maxAmount' });
    if (maxAmt !== 20_000_000n) throw new Error(`Expected maxAmount=20_000_000, got ${maxAmt}`);

    // Non-owner call should revert
    let reverted = false;
    try {
      await publicClient.simulateContract({
        address: ESCROW,
        abi: ESCROW_ABI,
        functionName: 'setMaxAmount',
        args: [1_000n],
        account: FORWARDER,
      });
    } catch {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected non-owner setMaxAmount to revert');
  });

  // ── Test 13: non-owner cannot pause ──────────────────────────────────────

  await runTest('13. non-owner cannot setPaused (OwnableUnauthorizedAccount)', async () => {
    let reverted = false;
    let revertMsg = '';
    try {
      await publicClient.simulateContract({
        address: ESCROW,
        abi: ESCROW_ABI,
        functionName: 'setPaused',
        args: [true],
        account: CARRIER, // non-owner
      });
    } catch (e: unknown) {
      reverted = true;
      revertMsg = e instanceof Error ? e.message : String(e);
    }
    if (!reverted) throw new Error('Expected non-owner setPaused to revert');
    if (!revertMsg.includes('OwnableUnauthorizedAccount') && !revertMsg.includes('Unauthorized') && !revertMsg.includes('revert'))
      throw new Error(`Expected OwnableUnauthorizedAccount revert, got: ${revertMsg.slice(0, 200)}`);
  });

  // ── Final Summary ────────────────────────────────────────────────────────

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  console.log(JSON.stringify({ summary: `${passed} passed, ${failed} failed, ${skipped} skipped` }));

  process.exit(anyFailed ? 1 : 0);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatalError: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
