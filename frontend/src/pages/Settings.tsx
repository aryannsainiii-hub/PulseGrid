import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, ConfirmDialog, ErrorBox, PageHeader, Spinner, Logo } from '../components/common/ui'
import type { Settings } from '../types'

export default function SettingsPage() {
  const s = useAsync(() => api.getSettings())
  const [f, setF] = useState<Settings | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<Error | null>(null)
  const [confirm, setConfirm] = useState<null | 'history' | 'demo'>(null)
  useEffect(() => { if (s.data) setF(s.data) }, [s.data])
  if (s.error) return <ErrorBox error={s.error} onRetry={s.reload} />
  if (!f) return <Spinner />
  const apply = (v: Settings) => { document.body.classList.toggle('theme-light', v.display.theme === 'light'); document.body.classList.toggle('compact', v.display.compact_tables) }

  async function save() {
    setErr(null); setMsg(null)
    try { const r = await api.putSettings(f!); setF(r); apply(r); setMsg('Settings saved.') } catch (e) { setErr(e as Error) }
  }
  const W = (k: keyof Settings['weights'], label: string) => (
    <div key={k}><div className="flex justify-between text-sm"><label htmlFor={`w-${k}`}>{label}</label><span>{f.weights[k].toFixed(2)}</span></div>
      <input id={`w-${k}`} type="range" min={0} max={1} step={0.05} className="w-full accent-teal" value={f.weights[k]} onChange={(e) => setF({ ...f, weights: { ...f.weights, [k]: Number(e.target.value) } })} /></div>)

  return (
    <>
      <PageHeader title="Settings" subtitle="Configure your PulseGrid experience." actions={<button className="btn-primary" onClick={save}>Save Settings</button>} />
      {msg && <div role="status" className="mb-3 rounded-xl bg-mint px-3 py-2 text-sm text-teal">{msg}</div>}
      {err && <div className="mb-3"><ErrorBox error={err} /></div>}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Simulation configuration"><div className="space-y-3">
          <div><label className="label" htmlFor="dd">Default duration (min)</label><input id="dd" type="number" step={5} min={15} max={240} className="input" value={f.default_duration_minutes} onChange={(e) => setF({ ...f, default_duration_minutes: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="mr">Max recovery time for planning (min)</label><input id="mr" type="number" step={5} min={30} max={240} className="input" value={f.max_recovery_minutes} onChange={(e) => setF({ ...f, max_recovery_minutes: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="rs">Response start (T+ min)</label><input id="rs" type="number" step={5} min={0} max={120} className="input" value={f.response_start_minute} onChange={(e) => setF({ ...f, response_start_minute: Number(e.target.value) })} /></div>
        </div></Card>
        <Card title="Strategy scoring weights"><div className="space-y-3">
          {W('coverage', 'Service coverage')}{W('resources', 'Resource efficiency')}{W('recovery', 'Recovery time')}{W('violations', 'Constraint violations')}
          <p className="text-xs text-navy/60">Score = w·coverage − w·resource use − w·recovery delay − w·violations, normalised to 0–100. Applies to newly generated plans.</p>
        </div></Card>
        <Card title="Display preferences"><div className="space-y-3">
          <div><label className="label" htmlFor="th">Theme</label><select id="th" className="input" value={f.display.theme} onChange={(e) => setF({ ...f, display: { ...f.display, theme: e.target.value as 'warm' | 'light' } })}><option value="warm">Warm ivory</option><option value="light">Plain white</option></select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.display.compact_tables} onChange={(e) => setF({ ...f, display: { ...f.display, compact_tables: e.target.checked } })} />Compact tables</label>
        </div></Card>
        <Card title="About PulseGrid"><div className="flex items-center gap-3"><Logo size={44} /><div><div className="font-semibold">PulseGrid v1.0.0</div><div className="text-xs text-navy/60">AI-Powered Hospital Resilience &amp; Emergency Decision Support System</div></div></div>
          <p className="text-sm text-navy/70 mt-3">Demo environment with synthetic data. Deterministic graph simulation and transparent scoring; no trained ML model is used. Decision support only.</p></Card>
        <Card title="Demo data" className="lg:col-span-2"><div className="flex flex-wrap gap-2 items-center">
          <button className="btn-danger" onClick={() => setConfirm('history')}>Clear simulation history</button>
          <button className="btn-danger" onClick={() => setConfirm('demo')}>Reset demo state</button>
          <Link to="/hospital-map" className="text-sm text-teal underline">View the synthetic hospital model</Link>
          <p className="text-xs text-navy/60 w-full">The hospital model is fixed synthetic seed data; "Reset demo state" removes all runs and restores default settings.</p></div></Card>
      </div>
      <ConfirmDialog open={confirm !== null} title={confirm === 'demo' ? 'Reset demo state?' : 'Clear history?'} body={confirm === 'demo' ? 'Deletes all simulations and restores default settings.' : 'Deletes all saved simulations and plans.'} confirmLabel="Confirm"
        onCancel={() => setConfirm(null)} onConfirm={async () => { if (confirm === 'demo') { await api.resetDemo(); const r = await api.getSettings(); setF(r); apply(r) } else await api.clearHistory(); setConfirm(null); setMsg('Done.') }} />
    </>
  )
}
