import { describe, it, expect } from 'bun:test'
import { parseAmount, Amount, usdcDecimalsFor } from './money'

const CHAIN = 5042 // Arc Mainnet — 6 USDC decimals

describe('usdcDecimalsFor', () => {
  it('returns 6 for Arc Mainnet', () => {
    expect(usdcDecimalsFor(5042)).toBe(6)
  })
  it('returns 6 for Arc Testnet', () => {
    expect(usdcDecimalsFor(5042002)).toBe(6)
  })
  it('falls back to 6 for unknown chain', () => {
    expect(usdcDecimalsFor(99999)).toBe(6)
  })
})

describe('Amount.fromRaw / toFixed', () => {
  it('formats 1_000_000 as "1.00"', () => {
    expect(Amount.fromRaw(1_000_000n, 6).toFixed(2)).toBe('1.00')
  })
  it('formats 1_500_000 as "1.50"', () => {
    expect(Amount.fromRaw(1_500_000n, 6).toFixed(2)).toBe('1.50')
  })
  it('formats 700_000 as "0.70"', () => {
    expect(Amount.fromRaw(700_000n, 6).toFixed(2)).toBe('0.70')
  })
  it('formats 300_000 as "0.30"', () => {
    expect(Amount.fromRaw(300_000n, 6).toFixed(2)).toBe('0.30')
  })
  it('formats 10_000_000 as "10.00"', () => {
    expect(Amount.fromRaw(10_000_000n, 6).toFixed(2)).toBe('10.00')
  })
})

describe('parseAmount — valid inputs', () => {
  it('parses "1" as 1_000_000', () => {
    expect(parseAmount(CHAIN, '1').raw).toBe(1_000_000n)
  })
  it('parses "1.5" as 1_500_000', () => {
    expect(parseAmount(CHAIN, '1.5').raw).toBe(1_500_000n)
  })
  it('parses "1.50" as 1_500_000', () => {
    expect(parseAmount(CHAIN, '1.50').raw).toBe(1_500_000n)
  })
  it('parses "0.000001" as 1 (smallest unit)', () => {
    expect(parseAmount(CHAIN, '0.000001').raw).toBe(1n)
  })
  it('parses "10.000000" as 10_000_000', () => {
    expect(parseAmount(CHAIN, '10.000000').raw).toBe(10_000_000n)
  })
  it('parses "0" as 0', () => {
    expect(parseAmount(CHAIN, '0').raw).toBe(0n)
  })
  it('trims whitespace', () => {
    expect(parseAmount(CHAIN, '  1.5  ').raw).toBe(1_500_000n)
  })
})

describe('parseAmount — THROWS on >6 fractional digits (no silent truncation)', () => {
  it('throws on 7 fractional digits', () => {
    expect(() => parseAmount(CHAIN, '1.0000001')).toThrow()
  })
  it('throws on 8 fractional digits', () => {
    expect(() => parseAmount(CHAIN, '0.00000099')).toThrow()
  })
  it('throws on 10 fractional digits', () => {
    expect(() => parseAmount(CHAIN, '1.1234567890')).toThrow()
  })
  it('error message mentions fractional digits and maximum', () => {
    expect(() => parseAmount(CHAIN, '1.0000001')).toThrow(/fractional digits/)
  })
  it('error message mentions the maximum (6)', () => {
    expect(() => parseAmount(CHAIN, '1.0000001')).toThrow(/maximum is 6/)
  })
})

describe('parseAmount — THROWS on invalid format', () => {
  it('throws on empty string', () => {
    expect(() => parseAmount(CHAIN, '')).toThrow()
  })
  it('throws on non-numeric string', () => {
    expect(() => parseAmount(CHAIN, 'abc')).toThrow()
  })
  it('throws on negative number', () => {
    expect(() => parseAmount(CHAIN, '-1')).toThrow()
  })
  it('throws on multiple dots', () => {
    expect(() => parseAmount(CHAIN, '1.2.3')).toThrow()
  })
})
