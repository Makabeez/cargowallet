/**
 * Onchain constants for supported chains.
 * Arc Mainnet (5042) and Arc Testnet (5042002) share the same USDC address.
 */

interface UsdcFact {
  address: `0x${string}`
  decimals: number
  symbol: string
}

const USDC_BY_CHAIN: Record<number, UsdcFact> = {
  // Arc Mainnet
  5042: {
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    symbol: 'USDC',
  },
  // Arc Testnet
  5042002: {
    address: '0x3600000000000000000000000000000000000000',
    decimals: 6,
    symbol: 'USDC',
  },
  // Ethereum Mainnet
  1: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    symbol: 'USDC',
  },
}

const EXPLORER_BY_CHAIN: Record<number, string> = {
  5042: 'https://explorer.arc.io',
  5042002: 'https://explorer.testnet.arc.io',
  1: 'https://etherscan.io',
}

export function getUsdc(chainId: number): UsdcFact | undefined {
  return USDC_BY_CHAIN[chainId]
}

export function buildTxExplorerUrl(chainId: number, txHash: string): string {
  const base = EXPLORER_BY_CHAIN[chainId] ?? 'https://explorer.arc.io'
  return `${base}/tx/${txHash}`
}
