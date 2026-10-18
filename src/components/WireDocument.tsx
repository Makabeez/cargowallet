import { AnimatePresence, motion } from 'framer-motion'
import { X, ExternalLink, Printer, CheckCircle2 } from 'lucide-react'
import type { PaymentRecord, ForwarderProfile } from './types'

interface WireDocumentProps {
  record: PaymentRecord | null
  profile: ForwarderProfile | null
  onClose: () => void
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-CH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Zurich',
  })
}

function fmtAddr(addr: string) {
  return `${addr.slice(0, 14)}...${addr.slice(-10)}`
}

function DocRow({ label, value, mono = false, last = false }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div
      className="flex items-start justify-between px-5 py-3 gap-4"
      style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}
    >
      <span className="text-xs shrink-0 w-36" style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className={`text-xs font-medium text-right flex-1 break-all ${mono ? 'mono' : ''}`}
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-5 py-2" style={{ background: 'rgba(11,31,58,0.03)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export function WireDocument({ record, profile, onClose }: WireDocumentProps) {
  if (!record) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />

        <motion.div
          className="relative w-full max-w-lg overflow-hidden rounded-3xl"
          style={{
            background: 'white',
            boxShadow: '0 32px 80px rgba(0,0,0,0.28)',
            maxHeight: '92dvh',
            overflowY: 'auto',
          }}
          initial={{ scale: 0.94, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, y: 16, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 42 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Document header */}
          <div
            className="relative overflow-hidden px-6 py-6"
            style={{ background: 'var(--accent)' }}
          >
            {/* Decoration */}
            <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full opacity-[0.06]" style={{ background: 'white' }} />
            <div className="pointer-events-none absolute -bottom-8 right-8 size-32 rounded-full opacity-[0.04]" style={{ background: 'white' }} />

            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="size-4 text-green-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                    Air Cargo Wire Document
                  </span>
                </div>
                <div className="display text-2xl font-bold text-white tracking-tight">
                  Payment Confirmation
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                  <div>
                    <div className="text-[9px] text-white/40 uppercase tracking-widest">Date</div>
                    <div className="text-xs font-medium text-white mt-0.5">{formatDate(record.timestamp)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-white/40 uppercase tracking-widest">Status</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="size-1.5 rounded-full bg-green-400" />
                      <span className="text-xs font-semibold text-white">SETTLED</span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="size-4 text-white" />
              </button>
            </div>
          </div>

          {/* Amount hero */}
          <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
              Amount Transferred
            </div>
            <div className="flex items-baseline gap-2">
              <span className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {record.amount}
              </span>
              <span className="text-xl font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              USD-pegged stablecoin · Circle USDC
            </div>
          </div>

          {/* Document body */}
          <div
            className="overflow-hidden rounded-none divide-y-0"
            style={{ border: 'none', borderTop: '1px solid var(--border)' }}
          >
            <Section title="Freight Details">
              <DocRow label="AWB / Reference" value={record.reference} mono />
              {record.invoiceNumber && <DocRow label="Invoice Number" value={record.invoiceNumber} />}
              {record.toLabel && <DocRow label="Payee / Carrier" value={record.toLabel} />}
              {record.memo && <DocRow label="Description" value={record.memo} last />}
            </Section>

            <Section title="Parties">
              <DocRow
                label="Payer (Forwarder)"
                value={profile ? `${profile.companyName} — IATA ${profile.iataCode}` : fmtAddr(record.from)}
              />
              {profile?.address && <DocRow label="Payer Address" value={profile.address} />}
              <DocRow label="Payer Wallet" value={fmtAddr(record.from)} mono />
              <DocRow label="Payee Wallet" value={fmtAddr(record.to)} mono last />
            </Section>

            <Section title="Blockchain Proof">
              <DocRow label="Network" value="Arc Mainnet (USDC)" />
              <DocRow label="Transaction Hash" value={fmtAddr(record.txHash)} mono />
              <DocRow label="Settlement Time" value="Instant (sub-second)" last />
            </Section>

            {/* Legal note */}
            <div className="px-5 py-4" style={{ background: 'rgba(11,31,58,0.02)' }}>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
                This document confirms an onchain USDC transfer on Arc Testnet. The transaction hash above serves as
                cryptographic proof of payment. Settlement is instant — no 30-day credit period. For testing purposes;
                CHF stablecoin issuance pending.
              </p>
            </div>

            {/* Action footer */}
            <div className="flex gap-2.5 px-5 py-4 no-print" style={{ borderTop: '1px solid var(--border)' }}>
              {record.explorerUrl && (
                <a
                  href={record.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-semibold transition-all hover:scale-[1.01]"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                >
                  <ExternalLink className="size-3.5" />
                  View on ArcScan
                </a>
              )}
              <button
                onClick={() => window.print()}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-semibold text-white transition-all hover:brightness-110 hover:scale-[1.01]"
                style={{ background: 'var(--accent)' }}
              >
                <Printer className="size-3.5" />
                Print / Save PDF
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
