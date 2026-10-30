# CargoWallet — Air Freight Instant Payments

> Instant USDC settlement for air freight forwarders. No 30-day invoice cycles.

Built on [Arc](https://arc.io) — Circle's blockchain where USDC is the native gas token.

---

## What It Does

Traditional air cargo billing runs on 30-day credit cycles. A forwarder ships cargo, the carrier invoices, the forwarder pays 30 days later — capital is tied up, relationships are strained, and reconciliation is manual.

CargoWallet replaces that with onchain USDC escrow:

1. **Forwarder creates a shipment** — references an Air Waybill (AWB) number, names a carrier and ground handler, sets a BPS split (e.g. 70/30), an amount, and a deadline.
2. **Forwarder funds the escrow** — approves and transfers USDC into the contract. Funds are locked.
3. **On delivery, forwarder confirms** — the contract releases the split: carrier and handler can each claim their USDC instantly.
4. **If not delivered by deadline** — forwarder reclaims the full amount.

Settlement is sub-second on Arc. No bank wire. No correspondent fees. No 30 days.

---

## Contract: AirCargoEscrow

**Network:** Arc Mainnet (chain ID 5042)  
**USDC:** `0x3600000000000000000000000000000000000000` — 6 ERC-20 decimals  
**Contract:** [`0xb56aea1ab82aa8f675eb2fa59d418734046cd92f`](https://explorer.arc.io/address/0xb56aea1ab82aa8f675eb2fa59d418734046cd92f)  
**Deploy tx:** [`0x9a57fc6f5701...`](https://explorer.arc.io/tx/0x9a57fc6f570174e26565f589aef64e74d4e2c71352a84d096947560094505165)  
**Owner:** `0x72454f65aAe03333E309084D5f211AC059212187`  
**Explorer:** https://explorer.arc.io

### State Machine

```
Created → Funded → Released  (confirmDelivery)
                → Refunded   (refund, after deadline)
         → Cancelled         (cancel, before funding)
```

### Key Functions

| Function | Who | Description |
|---|---|---|
| `createShipment(awbRef, carrier, handler, carrierBps, handlerBps, amount, deadline)` | Forwarder | Creates escrow. `awbRef` = `keccak256(awbNumber)` — no plaintext onchain. |
| `fund(shipmentId)` | Forwarder | Pulls USDC from forwarder (ERC-20 approve first). |
| `confirmDelivery(shipmentId)` | Forwarder | Marks delivered, credits carrier/handler claimable balances. |
| `refund(shipmentId)` | Forwarder | Returns USDC after deadline if still Funded. |
| `cancel(shipmentId)` | Forwarder | Cancels before funding. |
| `claim()` | Carrier or Handler | Pulls their credited USDC balance. |
| `setMaxAmount(newMax)` | Owner only | Cap per shipment (default 10 USDC for launch). |
| `setPaused(bool)` | Owner only | Emergency pause — blocks only `createShipment` and `fund`. Recovery functions are always live. |

### Trust Model

**The forwarder controls every lifecycle step for their own shipments.**
Only the address that called `createShipment` can call `fund`, `confirmDelivery`, `refund`, and `cancel` on that shipment. No other party — not the owner, not the carrier, not the handler — can advance or unwind a shipment.

**Confirmation is forwarder-only, not oracle-driven.**
There is no third-party oracle or multi-sig. The forwarder decides when delivery is complete and calls `confirmDelivery` themselves. This is a deliberate design choice for the Swiss freight forwarding market, where the forwarder is the accountable party.

**The owner's powers are strictly limited to two things:**
1. `setMaxAmount` — adjust the per-shipment USDC cap (default: 10 USDC at launch).
2. `setPaused(true)` — emergency pause that blocks new `createShipment` and `fund` calls only.

**The owner has zero access to user funds.** There is no withdrawal function, no sweep, no rescue, and no way for the owner to touch USDC that has been escrowed. This is enforced in the bytecode, not just a policy.

**Funds are always recoverable by users regardless of pause state.**
`confirmDelivery`, `refund`, `cancel`, and `claim` have no pause guard. Even if the owner pauses the contract, every party can still settle, refund, or cancel their own positions.

**Ownership transfer is two-step** (`Ownable2Step`). A `transferOwnership` call only sets a pending owner — the new owner must explicitly call `acceptOwnership`. This prevents accidental permanent lockout from a mistyped address.

### Security Properties

- **Pull payments** — `confirmDelivery` credits claimable balances instead of pushing USDC (avoids blocklist-bricking). Carrier/handler pull via `claim()`.
- **ReentrancyGuard** on all fund-moving functions.
- **Checks-Effects-Interactions** — status updated before any external call.
- **No admin access to user funds** — owner can only set the cap and pause intake; cannot withdraw escrow.
- **No upgradeability** — immutable bytecode.
- **Pause scope** — only `createShipment` and `fund` are blocked when paused; recovery functions are always live.
- **USDC decimals: 6** (ERC-20 interface throughout, never the 18-decimal native gas view).
- **BPS overflow safe** — carrier/handler bps sum cast to `uint256` before comparison, so `BpsNotFull` is always the revert reason for invalid splits.
- **Deadline enforced at funding time** — `fund()` reverts `DeadlineInPast` if the shipment deadline has already passed.

### Review Results

- Balanced security review: **0 critical, 0 high findings** (after fixes applied)
- Slither: 1 false positive (`arbitrary-send-erc20`, mitigated by `msg.sender` guard), 2 low timestamp findings (acceptable on Arc), 1 informational naming style
- Unit tests: **62/62 passing** — happy path, all revert paths, fuzz split arithmetic, reentrancy attempt, Ownable2Step two-step transfer, deadline guard at fund time, bps uint256 overflow

> Arc Studio runs a best-effort internal review. This is NOT a substitute for a paid third-party audit before handling large real-money volumes.

---

## App

### Pages

| Tab | What It Does |
|---|---|
| **Dashboard** | Live USDC balance, quick-send, recent payment history |
| **Escrow** | Create shipment, fund, confirm delivery, refund, view all shipments |
| **Payments** | Direct USDC payments (legacy simple transfer flow) |
| **Profile** | Forwarder company identity (appears on wire documents) |

### Wire Document

Every confirmed payment generates a printable wire document containing:
- Amount, AWB reference, invoice number, carrier/handler names
- Payer and payee wallet addresses
- Blockchain proof: transaction hash, network, settlement time

Print or save as PDF from the app.

---

## Development

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [Foundry](https://book.getfoundry.sh) (`forge`, `cast`, `anvil`)
- A Circle developer account ([console.circle.com](https://console.circle.com))

### Run Locally

```bash
git clone https://github.com/Makabeez/cargowallet.git
cd cargowallet
bun install
bun run dev
```

### Run Tests

```bash
forge test
```

### Build

```bash
bun run build
```

---

## Deployment

### Arc Mainnet Prerequisites

1. Complete Circle mainnet account signup at [console.circle.com](https://console.circle.com)
2. Create a **Standard Developer API Key** (mainnet) in Circle Console
3. Paste into `.env` as `CIRCLE_API_KEY`
4. Register an entity secret (one-time, account-wide) — Arc Studio walks you through this
5. Fund the deployer wallet with USDC (~1 USDC for gas)

### Deploy Command (run via Arc Studio)

```bash
bun run compass:deploy AirCargoEscrow \
  '["0x3600000000000000000000000000000000000000","0x72454f65aAe03333E309084D5f211AC059212187"]' \
  --mode live \
  --signer private-key \
  --blockchain ARC-MAINNET \
  --compass-chain Arc \
  --rpc https://rpc.mainnet.arc.io
```

Set `DEPLOYER_PRIVATE_KEY` in `.env` before running. Remove it immediately after.  
The first constructor arg is the Arc mainnet USDC address; the second is the owner address.

### Post-Deploy Checklist (1–2 USDC end-to-end test)

- [ ] `createShipment` — AWB `176-12345675`, carrier `Swiss WorldCargo`, 70/30 split, 1 USDC, 24h deadline
- [ ] Approve USDC on the contract (`usdc.approve(contractAddress, 1_000_000)`)
- [ ] `fund(shipmentId)` — verify status = Funded on explorer
- [ ] `confirmDelivery(shipmentId)` — verify status = Released, check `claimable[carrier]` = 700_000, `claimable[handler]` = 300_000
- [ ] Carrier calls `claim()` — verify 700_000 USDC received
- [ ] Handler calls `claim()` — verify 300_000 USDC received
- [ ] Check all tx hashes on https://explorer.arc.io

---

## Architecture

```
Arc Mainnet
  └── AirCargoEscrow.sol
        ├── USDC (0x3600...0000, 6 decimals)
        ├── Ownable2Step (admin: cap + pause only; two-step transfer)
        └── ReentrancyGuard

Frontend (React + Vite + wagmi v2 + ConnectKit)
  ├── Arc Mainnet chain config
  ├── EscrowPanel — create / fund / confirm / refund / claim
  ├── ShipmentList — status, split, deadline, explorer links
  └── WireDocument — printable settlement proof
```

---

## Built With Arc Studio

This project was built end-to-end inside [Arc Studio](https://studio.arc.io) by Circle:

- **Contract** — written, reviewed (balanced security review), and fixed by Arc Studio's contract pipeline
- **Tests** — 62 Foundry unit tests written and run by Arc Studio's contract tester
- **Static analysis** — Slither run inside the Arc Studio sandbox
- **Deployment** — Compass engine (CREATE2, deterministic address, fork rehearsal) via Arc Studio
- **Frontend** — React/Vite/wagmi app built and wired to the deployed contract by Arc Studio
- **UI design** — Arc Light design system with Space Grotesk / DM Sans typography

Arc Studio turns a product idea into a deployed onchain app in a single conversation.

---

## License

MIT
