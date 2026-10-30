# CargoWallet

> Built with Arc Studio — money-powered apps in minutes

This is the **project memory** — what Arc Studio remembers about building this app.

---

## What This App Does

Instant USDC settlement for air freight forwarders on Arc Mainnet. Replaces 30-day invoice cycles with onchain escrow: lock USDC for an AWB shipment, release splits to carrier and handler on delivery, or refund after deadline.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`.
- Chain: Arc Mainnet (Chain ID: 5042)
- Token: USDC (6 decimals, address: 0x3600000000000000000000000000000000000000)

## Deployed Contracts

| Contract | Network | Address | Tx Hash |
|---|---|---|---|
| AirCargoEscrow | Arc Mainnet | [0xb56aea1ab82aa8f675eb2fa59d418734046cd92f](https://explorer.arc.io/address/0xb56aea1ab82aa8f675eb2fa59d418734046cd92f) | [0x9a57fc6f...](https://explorer.arc.io/tx/0x9a57fc6f570174e26565f589aef64e74d4e2c71352a84d096947560094505165) |

- **owner():** 0x72454f65aAe03333E309084D5f211AC059212187 (confirmed onchain)
- **maxAmount():** 10000000 (10 USDC at 6 decimals, confirmed onchain)
- **Deployed:** 2026-10-29T22:42:35Z
- **Deployer EOA:** 0x56086a98bc24a92B32EC57DeB08D73D1c97B23C3

## Key Files

- `src/App.tsx` — Main application shell + tab routing
- `src/components/EscrowPanel.tsx` — Escrow UI (create/fund/confirm/refund/claim)
- `src/components/WalletHeader.tsx` — Dark sidebar nav + wallet connect
- `src/components/BalanceCard.tsx` — USDC balance hero card
- `src/components/PaymentSheet.tsx` — Direct USDC payment flow
- `src/components/PaymentHistory.tsx` — Payment history + wire documents
- `src/components/WireDocument.tsx` — Printable settlement confirmation
- `src/lib/chain.ts` — Chain constants (USDC address, explorer URLs by chainId)
- `src/lib/money.ts` — USDC amount parsing + formatting (throws on >6 fractional digits)
- `contracts/AirCargoEscrow.sol` — Escrow contract
- `contracts/test/AirCargoEscrow.t.sol` — 62 Foundry unit tests
- `contracts/contract-metadata/AirCargoEscrow.json` — Deploy metadata

## To Run

```bash
bun install
bun run dev
```

## To Test Contracts

```bash
forge test
```
