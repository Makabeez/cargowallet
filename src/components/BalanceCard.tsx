import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowUpRight, RefreshCw, TrendingUp, Package } from 'lucide-react'
import { getUsdc } from '@/lib/chain'
import { Amount, usdcDecimalsFor } from '@/lib/money'
import { TokenUSDC } from '@web3icons/react'
import type { ForwarderProfile } from './types'

const TARGET_CHAIN_ID = 5042 // Arc Mainnet

interface BalanceCardProps {
  profile: ForwarderProfile | null
  onSendClick: () => void
  totalPaid: number
  paymentCount: number
}

export function BalanceCard({ profile, onSendClick, totalPaid, paymentCount }: BalanceCardProps) {
  const { address, isConnected, chainId } = useAccount()
  const usdcFact = getUsdc(TARGET_CHAIN_ID)
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID

  const { data: balance, isLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const formatted = balance != null
    ? Amount.fromRaw(balance, usdcDecimalsFor(TARGET_CHAIN_ID)).toFixed(2)
    : null

  return (
    <div className="space-y-4">
      {/* Hero balance card */}
      <div
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background: 'linear-gradient(135deg, #0b1f3a 0%, #1461a8 55%, #0d8a7a 100%)',
          boxShadow: '0 12px 40px rgba(11,31,58,0.28), 0 1px 0 rgba(255,255,255,0.06) inset',
        }}
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full opacity-[0.07]" style={{ background: 'white' }} />
        <div className="pointer-events-none absolute -bottom-10 right-16 size-40 rounded-full opacity-[0.05]" style={{ background: 'white' }} />
        <div className="pointer-events-none absolute top-4 right-1/3 size-24 rounded-full opacity-[0.04]" style={{ background: 'white' }} />

        <div className="relative">
          {/* Top row */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex size-5 items-center justify-center rounded-md bg-white/10">
                  <TrendingUp className="size-3 text-white" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                  {profile?.companyName ?? 'Available Balance'}
                </span>
              </div>

              {!isConnected ? (
                <div className="display text-5xl font-bold text-white/30 tabular-nums mt-2">—</div>
              ) : isLoading ? (
                <div className="display text-5xl font-bold text-white/30 tabular-nums mt-2 animate-pulse">···</div>
              ) : (
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="display text-5xl font-bold text-white tabular-nums">{formatted ?? '0.00'}</span>
                  <span className="text-lg font-medium text-white/50 mb-1">USDC</span>
                </div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-white/40">
                  {wrongChain ? 'Switch to Arc Mainnet' : 'USD-pegged · Arc Mainnet'}
                </span>
                {profile?.iataCode && (
                  <span
                    className="mono rounded-full px-2 py-0.5 text-[9px] font-semibold text-white/60"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    IATA {profile.iataCode}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <TokenUSDC variant="branded" size={40} className="opacity-80" />
              <button
                onClick={() => void refetch()}
                className="flex size-7 items-center justify-center rounded-full bg-white/8 hover:bg-white/15 transition-colors"
              >
                <RefreshCw className="size-3 text-white/60" />
              </button>
            </div>
          </div>

          {/* Action button */}
          <button
            disabled={!isConnected || wrongChain}
            onClick={onSendClick}
            className="flex w-full items-center justify-between rounded-2xl bg-white/90 px-5 py-3 transition-all hover:bg-white active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {wrongChain ? 'Switch Network' : 'Send Payment'}
            </span>
            <div
              className="flex size-7 items-center justify-center rounded-full"
              style={{ background: 'var(--accent)' }}
            >
              <ArrowUpRight className="size-3.5 text-white" />
            </div>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Sent', value: `${totalPaid.toFixed(2)}`, unit: 'USDC' },
          { label: 'Payments', value: paymentCount.toString(), unit: 'settled' },
          { label: 'Settlement', value: '< 1s', unit: 'avg time' },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-2xl p-4"
            style={{
              background: 'var(--glass-card)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
            }}
          >
            <div className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{s.value}</div>
            <div className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--muted)' }}>{s.unit}</div>
            <div className="text-[9px] uppercase tracking-widest mt-1 font-semibold" style={{ color: 'var(--subtle)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* CHF note */}
      <div
        className="flex items-start gap-3 rounded-2xl px-4 py-3"
        style={{ background: 'rgba(13,138,122,0.06)', border: '1px solid rgba(13,138,122,0.16)' }}
      >
        <Package className="size-3.5 mt-0.5 shrink-0" style={{ color: 'var(--accent-teal)' }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>Payments settle in USDC (USD-pegged).</span>{' '}
          CHF stablecoin support is planned — the app will switch with one config change once Arc or Circle issues one.
        </p>
      </div>
    </div>
  )
}
