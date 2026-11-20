import type { Status } from '../types'
export const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  healthy: { label: 'Healthy', color: '#27966F', bg: '#E3F3EC' },
  at_risk: { label: 'At risk', color: '#B97A1C', bg: '#FBF1DD' },
  critical: { label: 'Critical', color: '#D75E61', bg: '#FAE5E5' },
}
export const SEV_LABEL: Record<string, string> = { moderate: 'Moderate', high: 'High', critical: 'Critical' }
export const pct = (n: number, d = 0) => `${n.toFixed(d)}%`
export const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const T = (m: number | null | undefined) => (m === null || m === undefined ? '—' : `T+${m}`)
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
export const RES_LABEL = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
