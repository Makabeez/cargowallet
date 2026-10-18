import { useState } from 'react'
import { Building2, CheckCircle2, User, MapPin, Mail, Hash } from 'lucide-react'
import type { ForwarderProfile } from './types'

interface ProfileSetupProps {
  walletAddress: string
  onSave: (profile: ForwarderProfile) => void
  existingProfile: ForwarderProfile | null
}

const COUNTRIES = [
  'Switzerland', 'Germany', 'France', 'Austria', 'Italy',
  'Netherlands', 'Belgium', 'Luxembourg', 'United Kingdom', 'United States',
]

export function ProfileSetup({ walletAddress, onSave, existingProfile }: ProfileSetupProps) {
  const [form, setForm] = useState({
    companyName: existingProfile?.companyName ?? '',
    iataCode: existingProfile?.iataCode ?? '',
    address: existingProfile?.address ?? '',
    country: existingProfile?.country ?? 'Switzerland',
    contact: existingProfile?.contact ?? '',
  })
  const [saved, setSaved] = useState(false)

  const valid = form.companyName.trim().length > 0 && form.iataCode.trim().length > 0

  const handleSave = () => {
    if (!valid) return
    const profile: ForwarderProfile = { ...form, walletAddress }
    localStorage.setItem(`cargowallet_profile_${walletAddress}`, JSON.stringify(profile))
    setSaved(true)
    onSave(profile)
    setTimeout(() => setSaved(false), 3000)
  }

  const fields: {
    key: keyof typeof form
    label: string
    placeholder: string
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
    span?: boolean
    type?: string
  }[] = [
    { key: 'companyName', label: 'Company Name', placeholder: 'Swiss Air Cargo GmbH', icon: Building2 },
    { key: 'iataCode', label: 'IATA Code', placeholder: '12-3456-7', icon: Hash },
    { key: 'address', label: 'Street Address', placeholder: 'Flughafenstrasse 1, 8302 Kloten', icon: MapPin, span: true },
    { key: 'contact', label: 'Contact Email', placeholder: 'finance@company.ch', icon: Mail, type: 'email', span: true },
  ]

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header card */}
      <div
        className="flex items-center gap-4 rounded-2xl px-5 py-4"
        style={{
          background: 'var(--glass-card)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        <div
          className="flex size-12 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(11,31,58,0.06)' }}
        >
          <User className="size-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Forwarder Identity</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            This information appears on every wire document you generate
          </div>
        </div>
      </div>

      {/* Form card */}
      <div
        className="rounded-2xl p-6"
        style={{
          background: 'var(--glass-card)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(f => {
            const Icon = f.icon
            return (
              <div key={f.key} className={f.span ? 'sm:col-span-2' : ''}>
                <label
                  className="block text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--muted)' }}
                >
                  {f.label}
                </label>
                <div className="relative">
                  <Icon
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5"
                    style={{ color: 'var(--subtle)' }}
                  />
                  <input
                    type={f.type ?? 'text'}
                    value={form[f.key]}
                    onChange={e => { setSaved(false); setForm(prev => ({ ...prev, [f.key]: e.target.value })) }}
                    placeholder={f.placeholder}
                    className="w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-200"
                    style={{
                      background: 'var(--surface-inset)',
                      border: '1px solid var(--border)',
                      color: 'var(--ink)',
                    }}
                  />
                </div>
              </div>
            )
          })}

          {/* Country */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
              Country
            </label>
            <div className="relative">
              <MapPin
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5"
                style={{ color: 'var(--subtle)' }}
              />
              <select
                value={form.country}
                onChange={e => { setSaved(false); setForm(prev => ({ ...prev, country: e.target.value })) }}
                className="w-full appearance-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                style={{
                  background: 'var(--surface-inset)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              >
                {COUNTRIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          disabled={!valid}
          onClick={handleSave}
          className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: saved ? 'var(--success)' : 'var(--accent)' }}
        >
          {saved ? (
            <>
              <CheckCircle2 className="size-4" />
              Profile saved
            </>
          ) : 'Save Profile'}
        </button>
      </div>

      {/* Wallet address display */}
      <div
        className="rounded-2xl px-5 py-3 flex items-center justify-between"
        style={{ background: 'rgba(11,31,58,0.04)', border: '1px solid var(--border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Linked wallet</span>
        <span className="mono text-xs" style={{ color: 'var(--ink)' }}>
          {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
        </span>
      </div>
    </div>
  )
}
