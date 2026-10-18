import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress, keccak256, toBytes } from 'viem'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Package, AlertTriangle, CheckCircle2, Clock,
  ExternalLink, Loader2, X, ChevronDown, ChevronUp,
  Plane, User, Percent, DollarSign, Calendar, RefreshCw
} from 'lucide-react'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money'
import type { ForwarderProfile } from './types'

// Contract address placeholder — replaced after deploy
const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS ?? '') as `0x${string}`
const TARGET_CHAIN_ID = 5042 // Arc Mainnet

const ESCROW_ABI = [
  {
    name: 'createShipment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'awbRef', type: 'bytes32' },
      { name: 'carrier', type: 'address' },
      { name: 'handler', type: 'address' },
      { name: 'carrierBps', type: 'uint16' },
      { name: 'handlerBps', type: 'uint16' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
    outputs: [{ name: 'shipmentId', type: 'uint256' }],
  },
  {
    name: 'fund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'confirmDelivery',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'refund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancel',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shipmentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'shipments',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'awbRef', type: 'bytes32' },
      { name: 'forwarder', type: 'address' },
      { name: 'carrier', type: 'address' },
      { name: 'handler', type: 'address' },
      { name: 'carrierBps', type: 'uint16' },
      { name: 'handlerBps', type: 'uint16' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'status', type: 'uint8' },
    ],
  },
  {
    name: 'shipmentCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'claimable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'maxAmount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const STATUS_LABELS = ['Created', 'Funded', 'Released', 'Refunded', 'Cancelled']
const STATUS_COLORS = [
  'rgba(14,42,69,0.1)',   // Created - navy tint
  'rgba(30,111,181,0.12)', // Funded - blue tint
  'rgba(26,128,71,0.12)',  // Released - green tint
  'rgba(100,120,140,0.12)', // Refunded - grey tint
  'rgba(186,43,76,0.10)',  // Cancelled - red tint
]
const STATUS_TEXT = [
  'var(--ink)',
  'var(--accent-mid)',
  'var(--success)',
  'var(--muted)',
  'var(--danger)',
]

const glass = {
  card: {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    border: '1px solid rgba(14,42,69,0.08)',
    boxShadow: '0 4px 24px rgba(14,42,69,0.06)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(14,42,69,0.08)',
  } as React.CSSProperties,
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatDeadline(deadline: bigint) {
  return new Date(Number(deadline) * 1000).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

interface CreateShipmentFormProps {
  onClose: () => void
  onSuccess: () => void
  chainId: number | undefined
}

function CreateShipmentForm({ onClose, onSuccess, chainId }: CreateShipmentFormProps) {
  const { address } = useAccount()
  const { switchChain } = useSwitchChain()
  const [awb, setAwb] = useState('176-12345675')
  const [carrierAddr, setCarrierAddr] = useState('')
  const [handlerAddr, setHandlerAddr] = useState('')
  const [carrierPct, setCarrierPct] = useState('70')
  const [amountStr, setAmountStr] = useState('1.00')
  const [deadlineDays, setDeadlineDays] = useState('7')
  const [step, setStep] = useState<'form' | 'approve' | 'create'>('form')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const wrongChain = chainId !== TARGET_CHAIN_ID
  const usdcFact = getUsdc(TARGET_CHAIN_ID)
  const USDC_ADDRESS = usdcFact?.address as `0x${string}`

  const parsedAmount = (() => {
    try { return parseAmount(TARGET_CHAIN_ID, amountStr) } catch { return null }
  })()

  const carrierBps = Math.round(parseFloat(carrierPct || '0') * 100)
  const handlerBps = 10000 - carrierBps

  // Step 1: Approve USDC
  const {
    writeContract: approve,
    data: approveHash,
    isPending: approvePending,
    isError: approveError,
  } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash })

  // Step 2: createShipment
  const {
    writeContract: createShipment,
    data: createHash,
    isPending: createPending,
    isError: createError,
  } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess } =
    useWaitForTransactionReceipt({ hash: createHash })

  const validate = () => {
    const e: Record<string, string> = {}
    if (!awb.trim()) e.awb = 'Required'
    if (!isAddress(carrierAddr)) e.carrier = 'Invalid address'
    if (!isAddress(handlerAddr)) e.handler = 'Invalid address'
    if (!parsedAmount || parsedAmount.raw === 0n) e.amount = 'Invalid amount'
    if (carrierBps < 0 || carrierBps > 10000) e.split = '0–100%'
    if (parseInt(deadlineDays) < 1) e.deadline = 'Min 1 day'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleApprove = () => {
    if (!validate() || !parsedAmount) return
    if (wrongChain) { switchChain({ chainId: TARGET_CHAIN_ID }); return }
    setStep('approve')
    approve({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [ESCROW_ADDRESS, parsedAmount.raw],
      chainId: TARGET_CHAIN_ID,
    })
  }

  const handleCreate = () => {
    if (!parsedAmount) return
    setStep('create')
    const awbRef = keccak256(toBytes(awb.trim()))
    const deadline = BigInt(Math.floor(Date.now() / 1000) + parseInt(deadlineDays) * 86400)
    createShipment({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'createShipment',
      args: [awbRef, carrierAddr as `0x${string}`, handlerAddr as `0x${string}`,
             carrierBps, handlerBps, parsedAmount.raw, deadline],
      chainId: TARGET_CHAIN_ID,
    })
  }

  if (createSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="size-8" style={{ color: 'var(--success)' }} />
        </div>
        <div className="text-center">
          <div className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Shipment Created</div>
          <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>AWB {awb} locked in escrow</div>
        </div>
        {createHash && (
          <a href={buildTxExplorerUrl(TARGET_CHAIN_ID, createHash)} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent-hover)' }}>
            View on ArcScan <ExternalLink className="size-3" />
          </a>
        )}
        <button onClick={() => { onSuccess(); onClose() }}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}>Done</button>
      </div>
    )
  }

  const inputCls = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-100"
  const inputStyle = { background: 'var(--surface-inset)', border: '1px solid var(--border)', color: 'var(--ink)' }
  const labelCls = "block text-xs font-semibold uppercase tracking-widest mb-1.5"
  const labelStyle = { color: 'var(--muted)' }

  return (
    <div className="space-y-4">
      {/* Freight Reference */}
      <div className="rounded-2xl p-4 space-y-3" style={glass.inner}>
        <div className="flex items-center gap-2 mb-1">
          <Package className="size-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Freight Reference
          </span>
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>AWB Number *</label>
          <input value={awb} onChange={e => setAwb(e.target.value)} placeholder="176-12345675"
            className={inputCls} style={{ ...inputStyle, borderColor: errors.awb ? 'var(--danger)' : undefined }} />
          {errors.awb && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{errors.awb}</p>}
        </div>
      </div>

      {/* Parties */}
      <div className="rounded-2xl p-4 space-y-3" style={glass.inner}>
        <div className="flex items-center gap-2 mb-1">
          <User className="size-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Parties</span>
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Carrier Wallet *</label>
          <input value={carrierAddr} onChange={e => setCarrierAddr(e.target.value)} placeholder="0x…"
            className={`${inputCls} mono`} style={{ ...inputStyle, borderColor: errors.carrier ? 'var(--danger)' : undefined }} />
          {errors.carrier && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{errors.carrier}</p>}
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Handler Wallet *</label>
          <input value={handlerAddr} onChange={e => setHandlerAddr(e.target.value)} placeholder="0x…"
            className={`${inputCls} mono`} style={{ ...inputStyle, borderColor: errors.handler ? 'var(--danger)' : undefined }} />
          {errors.handler && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{errors.handler}</p>}
        </div>
      </div>

      {/* Amount & Split */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={glass.inner}>
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="size-3.5" style={{ color: 'var(--accent)' }} />
            <label className={labelCls} style={labelStyle}>Amount (USDC)</label>
          </div>
          <input inputMode="decimal" value={amountStr}
            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g,''); setAmountStr(v) }}
            placeholder="1.00" className={`${inputCls} display text-2xl font-bold tabular-nums`}
            style={{ ...inputStyle, borderColor: errors.amount ? 'var(--danger)' : undefined }} />
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Max 10 USDC</p>
        </div>
        <div className="rounded-2xl p-4" style={glass.inner}>
          <div className="flex items-center gap-1.5 mb-2">
            <Percent className="size-3.5" style={{ color: 'var(--accent)' }} />
            <label className={labelCls} style={labelStyle}>Carrier %</label>
          </div>
          <input type="number" min="0" max="100" value={carrierPct}
            onChange={e => setCarrierPct(e.target.value)}
            className={`${inputCls} display text-2xl font-bold tabular-nums`} style={inputStyle} />
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Handler: {100 - (parseInt(carrierPct)||0)}%</p>
        </div>
      </div>

      {/* Deadline */}
      <div className="rounded-2xl p-4" style={glass.inner}>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="size-3.5" style={{ color: 'var(--accent)' }} />
          <label className={labelCls} style={labelStyle}>Deadline (days from now)</label>
        </div>
        <input type="number" min="1" value={deadlineDays} onChange={e => setDeadlineDays(e.target.value)}
          className={inputCls} style={inputStyle} />
      </div>

      {/* CTA */}
      {wrongChain ? (
        <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
          style={{ background: 'var(--danger)' }}>
          Switch to Arc Mainnet
        </button>
      ) : step === 'form' || approveError ? (
        <button onClick={handleApprove} disabled={!address}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}>
          {approvePending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm approval in wallet…</span>
           : approveConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Approving USDC…</span>
           : 'Approve USDC & Create Shipment'}
        </button>
      ) : approveSuccess && step === 'approve' ? (
        <button onClick={handleCreate}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
          style={{ background: 'var(--success)' }}>
          {createPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm in wallet…</span>
           : createConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Creating shipment…</span>
           : 'Create Shipment'}
        </button>
      ) : null}

      {(approveError || createError) && (
        <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>Transaction failed or was cancelled.</p>
      )}
    </div>
  )
}

interface ShipmentCardProps {
  id: bigint
  chainId: number | undefined
  onRefresh: () => void
}

function ShipmentCard({ id, chainId: _chainId, onRefresh }: ShipmentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { address } = useAccount()

  const { data: shipment, refetch } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'shipments',
    args: [id],
    chainId: TARGET_CHAIN_ID,
  })

  const { writeContract: doAction, data: actionHash, isPending, isError } = useWriteContract()
  const { isLoading: confirming, isSuccess: actionSuccess } = useWaitForTransactionReceipt({ hash: actionHash })

  // Capture "now" once at mount so the purity linter doesn't flag Date.now() in render
  const [nowSec] = useState<number>(() => Math.floor(Date.now() / 1000))
  const deadlinePassed = shipment ? BigInt(nowSec) > shipment[7] : false

  if (actionSuccess) { void refetch(); onRefresh() }

  if (!shipment) return null

  const [awbRef, forwarder, carrier, handler, carrierBps, , amount, deadline, status] = shipment
  const statusLabel = STATUS_LABELS[status] ?? 'Unknown'
  const isForwarder = address?.toLowerCase() === forwarder.toLowerCase()
  const formattedAmount = Amount.fromRaw(amount, usdcDecimalsFor(TARGET_CHAIN_ID)).toFixed(2)
  const carrierPct = ((carrierBps / 10000) * 100).toFixed(0)
  const handlerPct = (100 - parseInt(carrierPct)).toFixed(0)

  const explorerBase = 'https://explorer.arc.io'

  const actionButton = () => {
    if (!isForwarder) return null
    if (status === 1) { // Funded
      return (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => doAction({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'confirmDelivery', args: [id], chainId: TARGET_CHAIN_ID })}
            disabled={isPending || confirming}
            className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-40 transition-all"
            style={{ background: 'var(--success)' }}>
            {isPending || confirming ? <span className="flex items-center justify-center gap-1"><Loader2 className="size-3 animate-spin" />...</span> : 'Confirm Delivery'}
          </button>
          {deadlinePassed && (
            <button
              onClick={() => doAction({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'refund', args: [id], chainId: TARGET_CHAIN_ID })}
              disabled={isPending || confirming}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--danger)' }}>
              Refund
            </button>
          )}
        </div>
      )
    }
    if (status === 0) { // Created
      return (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => doAction({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'fund', args: [id], chainId: TARGET_CHAIN_ID })}
            disabled={isPending || confirming}
            className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}>
            {isPending || confirming ? <span className="flex items-center justify-center gap-1"><Loader2 className="size-3 animate-spin" />...</span> : 'Fund Escrow'}
          </button>
          <button
            onClick={() => doAction({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'cancel', args: [id], chainId: TARGET_CHAIN_ID })}
            disabled={isPending || confirming}
            className="flex-1 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-40"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
        </div>
      )
    }
    return null
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={glass.card}>
      <button className="w-full px-5 py-4 flex items-center justify-between" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: STATUS_COLORS[status] ?? 'var(--surface-muted)' }}>
            <Package className="size-4" style={{ color: STATUS_TEXT[status] }} />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Shipment #{id.toString()}
            </div>
            <div className="text-xs mono" style={{ color: 'var(--subtle)' }}>
              {awbRef.slice(0, 14)}…
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <div className="display text-sm font-bold tabular-nums text-right" style={{ color: 'var(--ink)' }}>
              {formattedAmount} USDC
            </div>
            <div className="text-xs font-semibold text-right" style={{ color: STATUS_TEXT[status] }}>
              {statusLabel}
            </div>
          </div>
          {expanded ? <ChevronUp className="size-4" style={{ color: 'var(--subtle)' }} /> : <ChevronDown className="size-4" style={{ color: 'var(--subtle)' }} />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: 'Forwarder', value: formatAddress(forwarder), link: `${explorerBase}/address/${forwarder}` },
                { label: 'Carrier', value: formatAddress(carrier), link: `${explorerBase}/address/${carrier}` },
                { label: 'Handler', value: formatAddress(handler), link: `${explorerBase}/address/${handler}` },
                { label: 'Split', value: `${carrierPct}% carrier / ${handlerPct}% handler`, link: undefined },
                { label: 'Deadline', value: formatDeadline(deadline) + (deadlinePassed ? ' (passed)' : ''), link: undefined },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{row.label}</span>
                  {row.link ? (
                    <a href={row.link} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs mono font-medium" style={{ color: 'var(--accent-hover)' }}>
                      {row.value} <ExternalLink className="size-2.5" />
                    </a>
                  ) : (
                    <span className="text-xs font-medium mono" style={{ color: 'var(--ink)' }}>{row.value}</span>
                  )}
                </div>
              ))}
              {isError && <p className="text-xs" style={{ color: 'var(--danger)' }}>Transaction failed or was cancelled.</p>}
              {actionButton()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface EscrowPanelProps {
  profile: ForwarderProfile | null
}

export function EscrowPanel({ profile: _profile }: EscrowPanelProps) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [createOpen, setCreateOpen] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID
  const contractDeployed = ESCROW_ADDRESS.length > 2

  const { data: shipmentCount, refetch: refetchCount } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'shipmentCount',
    chainId: TARGET_CHAIN_ID,
    query: { enabled: contractDeployed && isConnected },
  })

  const { data: claimableBalance, refetch: refetchClaimable } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'claimable',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: TARGET_CHAIN_ID,
    query: { enabled: contractDeployed && isConnected && !!address },
  })

  const { writeContract: doClaim, data: claimHash, isPending: claimPending } = useWriteContract()
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimHash })
  if (claimSuccess) { void refetchClaimable() }

  const onRefresh = () => {
    setRefreshTick(t => t + 1)
    void refetchCount()
    void refetchClaimable()
  }

  const shipmentIds = shipmentCount !== undefined
    ? Array.from({ length: Number(shipmentCount) }, (_, i) => BigInt(i)).reverse()
    : []

  const claimableFormatted = claimableBalance && claimableBalance > 0n
    ? Amount.fromRaw(claimableBalance, usdcDecimalsFor(TARGET_CHAIN_ID)).toFixed(2)
    : null

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <Package className="size-7" style={{ color: 'var(--muted)' }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to manage shipment escrows</p>
      </div>
    )
  }

  if (!contractDeployed) {
    return (
      <div className="rounded-2xl p-6 text-center space-y-3" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
        <AlertTriangle className="size-8 mx-auto" style={{ color: 'var(--danger)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Contract not yet deployed</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Set <span className="mono">VITE_ESCROW_ADDRESS</span> in .env after deploying AirCargoEscrow to Arc Mainnet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Shipment Escrows</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Arc Mainnet · AirCargoEscrow</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 transition-colors">
            <RefreshCw className="size-3.5" style={{ color: 'var(--muted)' }} />
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Plane className="size-3.5" /> New Shipment
          </button>
        </div>
      </div>

      {/* Wrong chain */}
      {wrongChain && (
        <div className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4" style={{ color: 'var(--danger)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Switch to Arc Mainnet</span>
          </div>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--danger)' }}>
            Switch
          </button>
        </div>
      )}

      {/* Claimable banner */}
      {claimableFormatted && (
        <div className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: 'rgba(26,128,71,0.08)', border: '1px solid rgba(26,128,71,0.2)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
              {claimableFormatted} USDC available to claim
            </span>
          </div>
          <button
            onClick={() => doClaim({ address: ESCROW_ADDRESS, abi: ESCROW_ABI, functionName: 'claim', chainId: TARGET_CHAIN_ID })}
            disabled={claimPending || claimConfirming}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--success)' }}>
            {claimPending || claimConfirming ? <Loader2 className="size-3.5 animate-spin" /> : 'Claim'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Shipments', value: shipmentCount?.toString() ?? '—', icon: Package },
          { label: 'Your Claimable', value: claimableFormatted ? `${claimableFormatted} USDC` : '—', icon: CheckCircle2 },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-2xl p-4" style={glass.card}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="size-3.5" style={{ color: 'var(--muted)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</span>
              </div>
              <div className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{s.value}</div>
            </div>
          )
        })}
      </div>

      {/* Shipment list */}
      <div className="space-y-3">
        {shipmentIds.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={glass.card}>
            <Clock className="size-8 mx-auto mb-3" style={{ color: 'var(--subtle)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No shipments yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Create your first escrow above</p>
          </div>
        )}
        {shipmentIds.map(id => (
          <ShipmentCard key={`${id}-${refreshTick}`} id={id} chainId={chainId} onRefresh={onRefresh} />
        ))}
      </div>

      {/* Footer: contract address */}
      <div className="text-center pt-2">
        <a href={`https://explorer.arc.io/address/${ESCROW_ADDRESS}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs mono" style={{ color: 'var(--subtle)' }}>
          AirCargoEscrow: {formatAddress(ESCROW_ADDRESS)} <ExternalLink className="size-3" />
        </a>
      </div>

      {/* Create shipment modal */}
      <AnimatePresence>
        {createOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCreateOpen(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <motion.section
              className="relative w-full max-w-lg overflow-hidden rounded-t-3xl"
              style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(40px)', maxHeight: '94dvh', overflowY: 'auto' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
              onClick={e => e.stopPropagation()}>
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, var(--cargo-blue), var(--accent-mid), var(--cargo-teal))' }} />
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-black/10" />
              </div>
              <div className="px-5 pb-8 pt-2">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: 'rgba(14,42,69,0.08)' }}>
                      <Package className="size-3.5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>New Shipment Escrow</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>Arc Mainnet · USDC</div>
                    </div>
                  </div>
                  <button onClick={() => setCreateOpen(false)} className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 transition-colors">
                    <X className="size-4" style={{ color: 'var(--muted)' }} />
                  </button>
                </div>
                <CreateShipmentForm onClose={() => setCreateOpen(false)} onSuccess={onRefresh} chainId={chainId} />
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
