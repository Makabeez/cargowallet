/**
 * USDC amount helpers.
 * All amounts are represented at 6 ERC-20 decimals (the Arc / Circle USDC standard).
 */

import { getUsdc } from './onchain-facts'

export function usdcDecimalsFor(chainId: number): number {
  return getUsdc(chainId)?.decimals ?? 6
}

/**
 * Immutable wrapper around a raw bigint USDC amount.
 */
export class Amount {
  readonly raw: bigint
  readonly decimals: number

  private constructor(raw: bigint, decimals: number) {
    this.raw = raw
    this.decimals = decimals
  }

  static fromRaw(raw: bigint, decimals: number): Amount {
    return new Amount(raw, decimals)
  }

  /** Format to a fixed number of decimal places (default 2). */
  toFixed(dp = 2): string {
    const factor = 10n ** BigInt(this.decimals)
    const whole = this.raw / factor
    const frac = this.raw % factor
    const fracStr = frac.toString().padStart(this.decimals, '0').slice(0, dp)
    return `${whole.toString()}.${fracStr}`
  }

  toString(): string {
    return this.toFixed(2)
  }
}

/**
 * Parse a human-readable USDC string (e.g. "1.50") into an Amount.
 * Throws if the string is not a valid non-negative decimal.
 */
export function parseAmount(chainId: number, value: string): Amount {
  const decimals = usdcDecimalsFor(chainId)
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid amount: "${value}"`)

  const [wholePart, fracPart = ''] = trimmed.split('.')
  const fracPadded = fracPart.padEnd(decimals, '0').slice(0, decimals)

  const raw = BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fracPadded)
  return Amount.fromRaw(raw, decimals)
}
