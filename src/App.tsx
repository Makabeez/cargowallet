import { useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Plane, AlertTriangle } from 'lucide-react'
import { Sidebar, MobileTopBar } from './components/WalletHeader'
import type { NavTab } from './components/WalletHeader'
import { BalanceCard } from './components/BalanceCard'
import { ProfileSetup } from './components/ProfileSetup'
import { PaymentSheet } from './components/PaymentSheet'
import { WireDocument } from './components/WireDocument'
import { PaymentHistory } from './components/PaymentHistory'
import { EscrowPanel } from './components/EscrowPanel'
import type { ForwarderProfile, PaymentRecord } from './components/types'

const TARGET_CHAIN_ID = 5042 // Arc Mainnet

function loadProfile(address: string): ForwarderProfile | null {
  try {
    const raw = localStorage.getItem(`cargowallet_profile_${address}`)
    return raw ? (JSON.parse(raw) as ForwarderProfile) : null
  } catch { return null }
}

function loadRecords(address: string): PaymentRecord[] {
  try {
    const raw = localStorage.getItem(`cargowallet_records_${address}`)
    return raw ? (JSON.parse(raw) as PaymentRecord[]) : []
  } catch { return [] }
}

function saveRecords(address: string, records: PaymentRecord[]) {
  localStorage.setItem(`cargowallet_records_${address}`, JSON.stringify(records))
}

// ── Connected inner app — keyed on address so state resets on wallet switch ──
interface CargoAppProps {
  address: string
}

function CargoApp({ address }: CargoAppProps) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [tab, setTab] = useState<NavTab>('dashboard')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [profile, setProfile] = useState<ForwarderProfile | null>(() => loadProfile(address))
  const [records, setRecords] = useState<PaymentRecord[]>(() => loadRecords(address))
  const [wireDoc, setWireDoc] = useState<PaymentRecord | null>(null)

  const wrongChain = chainId !== TARGET_CHAIN_ID
  const totalPaid = records.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  const handleProfileSave = (p: ForwarderProfile) => setProfile(p)

  const seenRef = { current: new Set<string>() }

  const handlePaymentComplete = (record: PaymentRecord) => {
    if (seenRef.current.has(record.id)) return
    seenRef.current.add(record.id)
    setRecords(current => {
      if (current.some(r => r.id === record.id)) return current
      const updated = [...current, record]
      saveRecords(address, updated)
      return updated
    })
    setWireDoc(record)
    setPaymentOpen(false)
  }

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Sidebar — desktop only */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar
          activeTab={tab}
          onTabChange={setTab}
          onSendClick={() => setPaymentOpen(true)}
        />
      </div>

      {/* Mobile top bar */}
      <MobileTopBar onSendClick={() => setPaymentOpen(true)} />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Decorative blobs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <div style={{ position: 'absolute', top: '5%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,97,168,0.09) 0%, transparent 70%)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', bottom: '10%', left: '5%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(13,138,122,0.07) 0%, transparent 70%)', filter: 'blur(70px)' }} />
        </div>

        <main className="relative z-10 mx-auto max-w-3xl px-4 py-6 pb-12 lg:px-8">
          {/* Wrong chain banner */}
          {wrongChain && (
            <div
              className="mb-5 flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)' }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
                  Wrong network — switch to Arc Mainnet
                </span>
              </div>
              <button
                onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: 'var(--danger)' }}
              >
                Switch
              </button>
            </div>
          )}

          {/* Mobile tab bar */}
          <div
            className="mb-5 flex gap-1 rounded-2xl p-1 lg:hidden"
            style={{ background: 'var(--glass-card)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
          >
            {([
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'escrow', label: 'Escrow' },
              { id: 'history', label: 'Payments' },
              { id: 'settings', label: 'Profile' },
            ] as { id: NavTab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all"
                style={{
                  background: tab === t.id ? 'var(--accent)' : 'transparent',
                  color: tab === t.id ? 'white' : 'var(--muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab heading */}
          <div className="mb-6">
            <h1 className="display text-2xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'escrow' && 'Shipment Escrow'}
              {tab === 'history' && 'Payment History'}
              {tab === 'settings' && 'Forwarder Profile'}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {tab === 'dashboard' && 'Your wallet balance and quick actions'}
              {tab === 'escrow' && 'Lock USDC, confirm delivery, release funds — Arc Mainnet'}
              {tab === 'history' && `${records.length} payment${records.length !== 1 ? 's' : ''} · ${totalPaid.toFixed(2)} USDC total`}
              {tab === 'settings' && 'Your company identity for wire documents'}
            </p>
          </div>

          {/* Content */}
          {tab === 'dashboard' && (
            <BalanceCard
              profile={profile}
              onSendClick={() => setPaymentOpen(true)}
              totalPaid={totalPaid}
              paymentCount={records.length}
            />
          )}
          {tab === 'escrow' && (
            <EscrowPanel profile={profile} />
          )}
          {tab === 'history' && (
            <PaymentHistory
              records={records}
              onViewDocument={setWireDoc}
            />
          )}
          {tab === 'settings' && (
            <ProfileSetup
              walletAddress={address}
              onSave={handleProfileSave}
              existingProfile={profile}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <PaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        profile={profile}
        onPaymentComplete={handlePaymentComplete}
      />
      <WireDocument
        record={wireDoc}
        profile={profile}
        onClose={() => setWireDoc(null)}
      />
    </div>
  )
}

// ── Root: landing when disconnected, app when connected ──
export default function App() {
  const { address, isConnected } = useAccount()

  if (!isConnected || !address) {
    return (
      <div
        className="relative min-h-dvh flex flex-col items-center justify-center px-4 overflow-hidden"
        style={{ background: 'var(--bg-gradient)' }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
          <div style={{ position: 'absolute', top: '12%', left: '8%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,97,168,0.12) 0%, transparent 70%)', filter: 'blur(100px)' }} />
          <div style={{ position: 'absolute', bottom: '12%', right: '8%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(13,138,122,0.10) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        </div>

        <div className="relative z-10 w-full max-w-sm text-center">
          {/* Logo */}
          <div
            className="mx-auto mb-8 flex size-20 items-center justify-center rounded-3xl shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #0b1f3a 0%, #1461a8 55%, #0d8a7a 100%)',
              boxShadow: '0 20px 60px rgba(11,31,58,0.30)',
            }}
          >
            <Plane className="size-9 text-white" strokeWidth={2} />
          </div>

          <h1
            className="display text-4xl font-bold tracking-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
          >
            CargoWallet
          </h1>
          <p className="mt-2 text-base font-medium" style={{ color: 'var(--muted)' }}>
            Air Freight Instant Payments
          </p>

          {/* Feature pills */}
          <div className="mt-6 mb-8 grid grid-cols-2 gap-2">
            {[
              { label: 'Instant Settlement', sub: 'No 30-day credit' },
              { label: 'AWB Referenced', sub: 'Full traceability' },
              { label: 'Wire Document', sub: 'Auto-generated PDF' },
              { label: 'CHF Planned', sub: 'USDC (USD) now · CHF soon' },
            ].map(f => (
              <div
                key={f.label}
                className="rounded-2xl px-4 py-3 text-left"
                style={{
                  background: 'var(--glass-card)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid var(--glass-border)',
                  boxShadow: 'var(--glass-shadow)',
                }}
              >
                <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{f.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{f.sub}</div>
              </div>
            ))}
          </div>

          <ConnectKitButton label="Connect Wallet to Start" />

          <p className="mt-4 text-xs" style={{ color: 'var(--subtle)' }}>
            Arc Mainnet · USDC · Real funds, small amounts
          </p>
        </div>

        {/* Footer — contract address */}
        <footer className="absolute bottom-4 left-0 right-0 flex justify-center">
          <a
            href="https://explorer.arc.io/address/0xb56aea1ab82aa8f675eb2fa59d418734046cd92f"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono transition-opacity hover:opacity-80"
            style={{ color: 'var(--subtle)' }}
          >
            Contract: 0xb56aea1ab82aa8f675eb2fa59d418734046cd92f
          </a>
        </footer>
      </div>
    )
  }

  // Key on address — forces full remount on wallet switch
  return <CargoApp key={address} address={address} />
}
