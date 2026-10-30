/**
 * AirCargoEscrow ABI — generated from the compiled artifact.
 * Single source of truth: do NOT hand-edit. To regenerate:
 *   node -e "const a=JSON.parse(require('fs').readFileSync('contracts/out/AirCargoEscrow.sol/AirCargoEscrow.json','utf8')); console.log(JSON.stringify(a.abi,null,2))"
 * and paste the result here (stripping internalType fields is optional).
 *
 * Deployed: 0xb56aea1ab82aa8f675eb2fa59d418734046cd92f  Arc Mainnet (chainId 5042)
 */
export const ESCROW_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'usdcToken', type: 'address' },
      { name: 'initialOwner', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'acceptOwnership',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'cancel',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'claim',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'claimable',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'confirmDelivery',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'createShipment',
    inputs: [
      { name: 'awbRef',      type: 'bytes32' },
      { name: 'carrier',     type: 'address' },
      { name: 'handler',     type: 'address' },
      { name: 'carrierBps',  type: 'uint16'  },
      { name: 'handlerBps',  type: 'uint16'  },
      { name: 'amount',      type: 'uint256' },
      { name: 'deadline',    type: 'uint64'  },
    ],
    outputs: [{ name: 'shipmentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'fund',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'maxAmount',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'owner',
    inputs: [], outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'paused',
    inputs: [], outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'pendingOwner',
    inputs: [], outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'refund',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'renounceOwnership',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setMaxAmount',
    inputs: [{ name: 'newMax', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setPaused',
    inputs: [{ name: '_paused', type: 'bool' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'shipmentCount',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'shipments',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'awbRef',      type: 'bytes32' },
      { name: 'forwarder',   type: 'address' },
      { name: 'carrier',     type: 'address' },
      { name: 'handler',     type: 'address' },
      { name: 'carrierBps',  type: 'uint16'  },
      { name: 'handlerBps',  type: 'uint16'  },
      { name: 'amount',      type: 'uint256' },
      { name: 'deadline',    type: 'uint64'  },
      { name: 'status',      type: 'uint8'   },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'usdc',
    inputs: [], outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    type: 'event', name: 'Cancelled',
    inputs: [{ name: 'shipmentId', type: 'uint256', indexed: true }],
    anonymous: false,
  },
  {
    type: 'event', name: 'Claimed',
    inputs: [
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount',    type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'Funded',
    inputs: [
      { name: 'shipmentId', type: 'uint256', indexed: true },
      { name: 'amount',     type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'MaxAmountUpdated',
    inputs: [{ name: 'newMax', type: 'uint256', indexed: false }],
    anonymous: false,
  },
  {
    type: 'event', name: 'OwnershipTransferStarted',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner',      type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner',      type: 'address', indexed: true },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'PausedUpdated',
    inputs: [{ name: 'paused', type: 'bool', indexed: false }],
    anonymous: false,
  },
  {
    type: 'event', name: 'Refunded',
    inputs: [
      { name: 'shipmentId', type: 'uint256', indexed: true  },
      { name: 'amount',     type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event', name: 'Released',
    inputs: [
      { name: 'shipmentId', type: 'uint256', indexed: true  },
      { name: 'carrierAmt', type: 'uint256', indexed: false },
      { name: 'handlerAmt', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  // ── KEY EVENT — 3 indexed topics + 6 data fields ──────────────────────────
  // topic[0] = keccak256("ShipmentCreated(uint256,bytes32,address,address,address,uint16,uint16,uint256,uint64)")
  // topic[1] = shipmentId   topic[2] = awbRef   topic[3] = forwarder
  {
    type: 'event', name: 'ShipmentCreated',
    inputs: [
      { name: 'shipmentId', type: 'uint256', indexed: true  },
      { name: 'awbRef',     type: 'bytes32', indexed: true  },
      { name: 'forwarder',  type: 'address', indexed: true  },
      { name: 'carrier',    type: 'address', indexed: false },
      { name: 'handler',    type: 'address', indexed: false },
      { name: 'carrierBps', type: 'uint16',  indexed: false },
      { name: 'handlerBps', type: 'uint16',  indexed: false },
      { name: 'amount',     type: 'uint256', indexed: false },
      { name: 'deadline',   type: 'uint64',  indexed: false },
    ],
    anonymous: false,
  },
  // ── Errors ────────────────────────────────────────────────────────────────
  { type: 'error', name: 'AmountExceedsCap',          inputs: [] },
  { type: 'error', name: 'BpsNotFull',                inputs: [] },
  { type: 'error', name: 'DeadlineInPast',            inputs: [] },
  { type: 'error', name: 'DeadlineNotPassed',         inputs: [] },
  { type: 'error', name: 'NotForwarder',              inputs: [] },
  { type: 'error', name: 'NothingToClaim',            inputs: [] },
  { type: 'error', name: 'OwnableInvalidOwner',       inputs: [{ name: 'owner',   type: 'address' }] },
  { type: 'error', name: 'OwnableUnauthorizedAccount',inputs: [{ name: 'account', type: 'address' }] },
  { type: 'error', name: 'Paused',                    inputs: [] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'SafeERC20FailedOperation',  inputs: [{ name: 'token', type: 'address' }] },
  { type: 'error', name: 'WrongStatus',               inputs: [] },
  { type: 'error', name: 'ZeroAddress',               inputs: [] },
  { type: 'error', name: 'ZeroAmount',                inputs: [] },
] as const
