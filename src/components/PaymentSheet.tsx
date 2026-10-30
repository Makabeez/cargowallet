import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, Loader2, ExternalLink, CheckCircle2, AlertCircle,
  ArrowUpRight, FileText, DollarSign, Hash, Truck
} from 'lucide-react'
import { getUsdc, buildTxExplorerUrl } from '@/lib/chain'
import { parseAmount, Amount, usdcDecimalsFor } from '@/lib/money'
import type { ForwarderProfile, PaymentRecord } from './types'

const TARGET_CHAIN_ID = 5042 // Arc Mainnet
const SPRING = { type: 'spring', stiffness: 420, damping: 44 } as const

interface PaymentSheetProps {
  open: boolean
  onClose: () => void
  profile: ForwarderProfile | null
  onPaymentComplete: (record: PaymentRecord) => void
}

const QUICK = ['100', '500', '1000', '5000']

function Field({
  label, value, onChange, placeholder, mono = false, icon: Icon, required = false, error = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; mono?: boolean; icon: React.ComponentType<{ className?: string }>;
  required?: boolean; error?: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
        <Icon className="size-3" />
        {label}{required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-200 ${mono ? 'mono' : ''}`}
        style={{
          background: 'var(--surface-inset)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
          color: 'var(--ink)',
        }}
      />
    </div>
  )
}

export function PaymentSheet({ open, onClose, profile, onPaymentComplete }: PaymentSheetProps) {
  const { address, chainId } = useAccount()
  const usdcFact = getUsdc(TARGET_CHAIN_ID)
  const wrongChain = chainId !== TARGET_CHAIN_ID

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [awbNumber, setAwbNumber] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [memo, setMemo] = useState('')
  const [carrierLabel, setCarrierLabel] = useState('')
  const [touched, setTouched] = useState(false)

  const { data: balance } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const formattedBalance = balance != null
    ? Amount.fromRaw(balance, usdcDecimalsFor(TARGET_CHAIN_ID)).toFixed(2)
    : null

  const { switchChain } = useSwitchChain()
  const { writeContract, data: txHash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const recipientValid = isAddress(recipient)
  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0
  const ready = recipientValid && amountValid && !!awbNumber.trim() && !isPending && !isConfirming && !!usdcFact

  const handleSend = () => {
    setTouched(true)
    if (wrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    if (!ready || !usdcFact || !address) return
    const parsed = parseAmount(TARGET_CHAIN_ID, amount)
    writeContract({
      address: usdcFact.address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, parsed.raw],
      chainId: TARGET_CHAIN_ID,
    })
  }

  const handleReset = () => {
    reset(); setRecipient(''); setAmount(''); setAwbNumber('')
    setInvoiceNumber(''); setMemo(''); setCarrierLabel(''); setTouched(false)
  }

  const explorerUrl = txHash ? buildTxExplorerUrl(TARGET_CHAIN_ID, txHash) : undefined
  const emittedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isSuccess || !txHash || emittedRef.current === txHash) return
    emittedRef.current = txHash
    onPaymentComplete({
      id: txHash, txHash,
      from: address ?? '',
      to: recipient,
      toLabel: carrierLabel || recipient.slice(0, 10) + '...',
      amount, reference: awbNumber, invoiceNumber, memo,
      timestamp: Date.now(), status: 'confirmed', explorerUrl,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  const errMsg = isError
    ? (error?.message?.includes('user rejected') ? 'Transaction cancelled.' : 'Transaction failed — please try again.')
    : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />

          <motion.section
            className="relative w-full sm:max-w-lg overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{
              background: 'rgba(255,255,255,0.97)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              maxHeight: '92dvh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(11,31,58,0.24)',
            }}
            initial={{ y: '100%', scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: '100%', scale: 0.98 }}
            transition={SPRING}
            onClick={e => e.stopPropagation()}
          >
            {/* Gradient top strip */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #0b1f3a, #1461a8, #0d8a7a)' }} />

            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            {isSuccess ? (
              /* ── Success ── */
              <div className="flex flex-col items-center gap-5 px-6 py-10">
                <div
                  className="flex size-16 items-center justify-center rounded-3xl"
                  style={{ background: 'var(--success-bg)' }}
                >
                  <CheckCircle2 className="size-8" style={{ color: 'var(--success)' }} />
                </div>
                <div className="text-center">
                  <div className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Payment Settled</div>
                  <div className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>
                    AWB {awbNumber} · {amount} USDC transferred instantly
                  </div>
                </div>
                <div
                  className="w-full rounded-2xl px-5 py-4 space-y-2"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                >
                  {[
                    { label: 'Amount', value: `${amount} USDC` },
                    { label: 'AWB', value: awbNumber },
                    { label: 'Network', value: 'Arc Testnet' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{r.label}</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{r.value}</span>
                    </div>
                  ))}
                </div>
                {explorerUrl && (
                  <a href={explorerUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: 'var(--accent-blue)' }}
                  >
                    View on ArcScan <ExternalLink className="size-3" />
                  </a>
                )}
                <button
                  onClick={handleReset}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: 'var(--accent)' }}
                >
                  New Payment
                </button>
              </div>
            ) : (
              /* ── Form ── */
              <div className="px-6 pb-7 pt-4">
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-10 items-center justify-center rounded-2xl"
                      style={{ background: 'rgba(11,31,58,0.06)' }}
                    >
                      <ArrowUpRight className="size-5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <div className="text-base font-bold" style={{ color: 'var(--ink)' }}>Send Payment</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        {profile ? `${profile.companyName}` : 'Air freight settlement'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                  >
                    <X className="size-4" style={{ color: 'var(--muted)' }} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Freight reference block */}
                  <div
                    className="rounded-2xl p-4 space-y-3"
                    style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <FileText className="size-3.5" style={{ color: 'var(--muted)' }} />
                      <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                        Freight Reference
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="AWB Number" value={awbNumber} onChange={setAwbNumber}
                        placeholder="020-12345678" icon={Hash} required
                        error={touched && !awbNumber.trim()}
                      />
                      <Field
                        label="Invoice No." value={invoiceNumber} onChange={setInvoiceNumber}
                        placeholder="INV-2026-001" icon={FileText}
                      />
                    </div>
                    <Field
                      label="Carrier / Airline" value={carrierLabel} onChange={setCarrierLabel}
                      placeholder="Swiss WorldCargo" icon={Truck}
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                      <DollarSign className="size-3" />
                      Amount (USDC)
                    </label>
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: 'var(--surface-inset)', border: '1px solid var(--border)' }}
                    >
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                        }}
                        placeholder="0.00"
                        className="display w-full bg-transparent text-5xl font-bold tabular-nums outline-none placeholder:text-slate-200"
                        style={{ color: 'var(--ink)' }}
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs" style={{ color: 'var(--subtle)' }}>USD-pegged · 6 decimals</span>
                        {formattedBalance && (
                          <button
                            onClick={() => setAmount(formattedBalance)}
                            className="text-xs font-semibold"
                            style={{ color: 'var(--accent-blue)' }}
                          >
                            Balance: {formattedBalance} · Max
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {QUICK.map(v => (
                        <button
                          key={v}
                          onClick={() => setAmount(v)}
                          className="rounded-xl py-2 text-xs font-semibold transition-all hover:scale-[1.02]"
                          style={{
                            background: amount === v ? 'var(--accent)' : 'var(--surface-inset)',
                            color: amount === v ? 'white' : 'var(--muted)',
                            border: `1px solid ${amount === v ? 'transparent' : 'var(--border)'}`,
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Recipient */}
                  <Field
                    label="Recipient Wallet" value={recipient}
                    onChange={v => setRecipient(v)}
                    placeholder="0x..." mono icon={ArrowUpRight} required
                    error={touched && !!recipient && !recipientValid}
                  />
                  {touched && recipient && !recipientValid && (
                    <p className="text-xs mt-[-8px]" style={{ color: 'var(--danger)' }}>Enter a valid wallet address</p>
                  )}

                  {/* Notes */}
                  <Field
                    label="Payment Notes" value={memo} onChange={setMemo}
                    placeholder="Freight charges ZRH-JFK Oct 2026" icon={FileText}
                  />

                  {/* Error */}
                  {errMsg && (
                    <div
                      className="flex items-center gap-2.5 rounded-xl p-3"
                      style={{ background: 'var(--danger-bg)', border: '1px solid rgba(220,38,38,0.2)' }}
                    >
                      <AlertCircle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
                      <span className="text-xs" style={{ color: 'var(--danger)' }}>{errMsg}</span>
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    onClick={handleSend}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: wrongChain ? 'var(--warning)' : 'var(--accent)' }}
                    disabled={!wrongChain && !ready && touched}
                  >
                    {wrongChain ? 'Switch to Arc Mainnet'
                      : isPending ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet...</>
                      : isConfirming ? <><Loader2 className="size-4 animate-spin" /> Settling on-chain...</>
                      : 'Send Payment'}
                  </button>
                </div>
              </div>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
