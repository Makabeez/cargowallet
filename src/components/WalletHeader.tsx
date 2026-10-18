// Sidebar navigation — replaces the top header
import { ConnectKitButton } from 'connectkit'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import {
  Plane, LayoutDashboard, History, Settings, Package,
  ChevronRight, Wifi
} from 'lucide-react'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const TARGET_CHAIN_ID = 5042 // Arc Mainnet

export type NavTab = 'dashboard' | 'escrow' | 'history' | 'settings'

interface SidebarProps {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
  onSendClick: () => void
}

const NAV = [
  { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'escrow' as NavTab, label: 'Escrow', icon: Package },
  { id: 'history' as NavTab, label: 'Payments', icon: History },
  { id: 'settings' as NavTab, label: 'Profile', icon: Settings },
]

export function Sidebar({ activeTab, onTabChange, onSendClick }: SidebarProps) {
  const { address, isConnected } = useAccount()
  const usdcFact = getUsdc(TARGET_CHAIN_ID)

  const { data: balance } = useReadContract({
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

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null

  return (
    <aside
      className="flex h-dvh w-60 flex-col"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.10)' }}
        >
          <Plane className="size-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <div className="display text-sm font-bold text-white leading-tight tracking-tight">CargoWallet</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--sidebar-muted)' }}>Air Freight Payments</div>
        </div>
      </div>

      {/* Balance pill */}
      {isConnected && (
        <div className="mx-4 mt-4 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--sidebar-muted)' }}>
            Wallet Balance
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="display text-2xl font-bold text-white tabular-nums">
              {formatted ?? '—'}
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--sidebar-muted)' }}>USDC</span>
          </div>
          {shortAddr && (
            <div className="mono mt-1.5 text-[10px]" style={{ color: 'var(--sidebar-muted)' }}>{shortAddr}</div>
          )}
        </div>
      )}

      {/* Send CTA */}
      {isConnected && (
        <div className="px-4 mt-3">
          <button
            onClick={onSendClick}
            className="group w-full flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-teal) 100%)' }}
          >
            <span>Send Payment</span>
            <ChevronRight className="size-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="mt-6 flex-1 space-y-0.5 px-3">
        <div className="px-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sidebar-muted)' }}>
            Navigation
          </span>
        </div>
        {NAV.map(item => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--sidebar-active)' : 'transparent',
                color: active ? 'white' : 'var(--sidebar-muted)',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
              {active && <div className="ml-auto size-1.5 rounded-full bg-blue-400" />}
            </button>
          )
        })}
      </nav>

      {/* Network status */}
      <div className="mx-4 mb-4 rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex size-6 items-center justify-center rounded-lg" style={{ background: 'rgba(5,150,105,0.20)' }}>
          <Wifi className="size-3" style={{ color: '#34d399' }} />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-white leading-none">Arc Mainnet</div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--sidebar-muted)' }}>USDC · Live</div>
        </div>
        <div className="ml-auto flex size-2 items-center justify-center">
          <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* Connect button */}
      <div className="px-4 pb-5">
        <ConnectKitButton />
      </div>
    </aside>
  )
}

// Mobile top bar (shown < lg)
export function MobileTopBar({ onSendClick }: { onSendClick: () => void }) {
  const { address, isConnected } = useAccount()
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 lg:hidden"
      style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.10)' }}>
          <Plane className="size-3.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="display text-sm font-bold text-white">CargoWallet</div>
      </div>
      <div className="flex items-center gap-2">
        {isConnected && shortAddr && (
          <span className="mono hidden text-[11px] sm:block" style={{ color: 'var(--sidebar-muted)' }}>{shortAddr}</span>
        )}
        {isConnected && (
          <button
            onClick={onSendClick}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: 'var(--accent-blue)' }}
          >
            Send
          </button>
        )}
        <ConnectKitButton />
      </div>
    </header>
  )
}
