import { CheckCircle2, Clock, XCircle, FileText, ExternalLink, ArrowUpRight } from 'lucide-react'
import type { PaymentRecord } from './types'

interface PaymentHistoryProps {
  records: PaymentRecord[]
  onViewDocument: (record: PaymentRecord) => void
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-CH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  })
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

const statusConfig = {
  confirmed: {
    icon: CheckCircle2,
    label: 'Settled',
    color: 'var(--success)',
    bg: 'var(--success-bg)',
    dot: '#34d399',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    color: 'var(--muted)',
    bg: 'rgba(100,116,139,0.08)',
    dot: '#94a3b8',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    color: 'var(--danger)',
    bg: 'var(--danger-bg)',
    dot: '#f87171',
  },
}

const glass = {
  card: {
    background: 'var(--glass-card)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-shadow)',
  } as React.CSSProperties,
}

export function PaymentHistory({ records, onViewDocument }: PaymentHistoryProps) {
  if (records.length === 0) {
    return (
      <div
        className="rounded-2xl p-10 flex flex-col items-center gap-3 text-center"
        style={glass.card}
      >
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ background: 'var(--surface-muted)' }}
        >
          <FileText className="size-6" style={{ color: 'var(--subtle)' }} />
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No payments yet</div>
          <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            Your settled payments will appear here with downloadable wire documents
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {records.slice().reverse().map((record, idx) => {
        const cfg = statusConfig[record.status]
        const Icon = cfg.icon

        return (
          <div
            key={record.id}
            className="group rounded-2xl p-5 transition-all hover:shadow-md"
            style={{ ...glass.card, animationDelay: `${idx * 40}ms` }}
          >
            <div className="flex items-start gap-4">
              {/* Status icon */}
              <div
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: cfg.bg }}
              >
                <Icon className="size-5" style={{ color: cfg.color }} />
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        AWB {record.reference}
                      </span>
                      <span
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        <span className="size-1.5 rounded-full inline-block" style={{ background: cfg.dot }} />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                      {record.toLabel || formatAddress(record.to)}
                      {record.invoiceNumber && (
                        <span className="mx-1.5 opacity-40">·</span>
                      )}
                      {record.invoiceNumber}
                    </div>
                    {record.memo && (
                      <div className="mt-1 text-xs italic" style={{ color: 'var(--subtle)' }}>
                        "{record.memo}"
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {record.amount}
                    </div>
                    <div className="text-xs font-medium mt-0.5" style={{ color: 'var(--muted)' }}>USDC</div>
                    <div className="text-[10px] mt-1" style={{ color: 'var(--subtle)' }}>
                      {formatDate(record.timestamp)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => onViewDocument(record)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:brightness-105 active:scale-[0.98]"
                    style={{ background: 'rgba(11,31,58,0.06)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                  >
                    <FileText className="size-3" />
                    Wire Document
                  </button>

                  {record.explorerUrl && (
                    <a
                      href={record.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5"
                      style={{ color: 'var(--muted)' }}
                    >
                      <ExternalLink className="size-3" />
                      ArcScan
                    </a>
                  )}

                  <div className="ml-auto">
                    <div
                      className="flex items-center gap-1 text-[10px] font-medium"
                      style={{ color: 'var(--subtle)' }}
                    >
                      <ArrowUpRight className="size-3" />
                      {formatAddress(record.to)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
