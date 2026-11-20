import { ReactNode } from 'react'
import { AlertTriangle, Loader2, Inbox } from 'lucide-react'
import type { Status } from '../../types'
import { STATUS } from '../../utils/format'

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="PulseGrid logo">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#087F83" />
      <path d="M19 9h10v10h10v10H29v10H19V29H9V19h10z" fill="#fff" opacity="0.95" />
      <path d="M11 24h8l3-6 4 12 3-6h8" fill="none" stroke="#087F83" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-navy/60 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, children, className = '', right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const s = STATUS[status]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: s.bg, color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {label ?? s.label}
    </span>
  )
}

export function Kpi({ label, value, hint, tone = 'teal' }: { label: string; value: ReactNode; hint?: string; tone?: 'teal' | 'warn' | 'crit' | 'info' }) {
  const c = { teal: 'bg-mint text-teal', warn: 'bg-[#FBF1DD] text-[#B97A1C]', crit: 'bg-[#FAE5E5] text-crit', info: 'bg-sky text-info' }[tone]
  return (
    <div className="card p-4">
      <div className={`inline-block rounded-lg px-2 py-0.5 text-xs font-medium ${c}`}>{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {hint && <div className="text-xs text-navy/50 mt-0.5">{hint}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 text-sm text-navy/60 py-6 justify-center"><Loader2 className="animate-spin" size={16} />{label}</div>
}

export function ErrorBox({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const details = (error as any)?.details as { field: string; message: string }[] | undefined
  return (
    <div role="alert" className="rounded-xl border border-crit/30 bg-[#FCEEEE] p-3 text-sm text-[#9B3A3D]">
      <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div className="flex-1">
        <div>{typeof error === 'string' ? error : error.message}</div>
        {details && details.length > 0 && <ul className="list-disc ml-4 mt-1">{details.map((d, i) => <li key={i}><b>{d.field}</b>: {d.message}</li>)}</ul>}
      </div></div>
      {onRetry && <button className="btn-ghost mt-2" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-10 text-navy/60">
      <Inbox size={28} className="mb-2 text-teal/60" />
      <div className="font-medium text-navy">{title}</div>
      {hint && <div className="text-sm mt-1 max-w-sm">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Disclaimer({ children }: { children?: ReactNode }) {
  return <div className="rounded-xl bg-sky border border-mist px-3 py-2 text-xs text-navy/80">{children ?? 'Simulated decision-support suggestion on synthetic data. It requires human review and authorisation and never controls hospital systems.'}</div>
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-navy/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card p-5 max-w-sm w-full">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-navy/70 mt-2">{body}</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
