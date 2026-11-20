import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play, FlaskConical } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, ErrorBox, PageHeader, Spinner } from '../components/common/ui'
import type { Severity, ScenarioDef } from '../types'
import { SEV_LABEL } from '../utils/format'

export default function Simulations() {
  const nav = useNavigate()
  const scen = useAsync(() => api.scenarios())
  const types = useAsync(() => api.incidentTypes())
  const settings = useAsync(() => api.getSettings())
  const [id, setId] = useState('main_power_failure')
  const [sev, setSev] = useState<Severity>('high')
  const [dur, setDur] = useState<number>(60)
  const [target, setTarget] = useState('')
  const [res, setRes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)
  const sc: ScenarioDef | undefined = scen.data?.find((s) => s.id === id)
  useEffect(() => { if (settings.data) setDur(settings.data.default_duration_minutes) }, [settings.data])
  useEffect(() => { if (sc) { setSev(sc.default_severity); setTarget('') } }, [id, scen.data])
  if (scen.error) return <ErrorBox error={scen.error} onRetry={scen.reload} />
  if (!scen.data || !types.data) return <Spinner />
  const firstType = types.data.find((t) => t.type === sc?.default_config.disruptions[0].type)
  const single = sc?.default_config.disruptions.length === 1

  async function run() {
    if (!sc || busy) return
    setBusy(true); setErr(null)
    const cfg = { ...sc.default_config, duration_minutes: dur,
      disruptions: sc.default_config.disruptions.map((d, i) => ({ ...d, severity: i === 0 || sc.disruptions.length === 1 ? sev : d.severity,
        ...(i === 0 && target ? { target } : {}), ...(i === 0 && res ? { resolution_minutes: Number(res) } : {}) })) }
    try { const r = await api.runSimulation(cfg); nav(`/simulations/${r.id}`) } catch (e) { setErr(e as Error) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Emergency Simulations" subtitle="Choose a scenario, configure it and run the backend simulation."
        actions={<Link to="/simulation-lab" className="btn-ghost"><FlaskConical size={14} />Advanced Simulation Lab</Link>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3 content-start">
          {scen.data.map((s) => (
            <button key={s.id} onClick={() => setId(s.id)} aria-pressed={id === s.id}
              className={`card p-4 text-left ${id === s.id ? '!border-teal ring-2 ring-teal/20' : ''}`}>
              <div className="font-semibold">{s.name}</div><div className="text-xs text-teal mt-0.5">{s.short}</div>
              <p className="text-sm text-navy/70 mt-2">{s.description}</p>
              <div className="text-xs text-navy/50 mt-2">Initial failure: {s.initial_failure_points.map((p) => p.name).join(', ')}</div>
            </button>))}
        </div>
        <Card title="Configuration">
          <div className="space-y-3">
            <div><label className="label" htmlFor="sev">Severity</label>
              <div id="sev" className="flex gap-2" role="group" aria-label="Severity">{(sc?.severity_options ?? []).map((o) => (
                <button key={o} aria-pressed={sev === o} className={`flex-1 btn ${sev === o ? 'bg-teal text-white' : 'btn-ghost'}`} onClick={() => setSev(o)}>{SEV_LABEL[o]}</button>))}</div></div>
            {single && firstType && firstType.allowed_targets.length > 1 && (
              <div><label className="label" htmlFor="tgt">Initial affected system</label>
                <select id="tgt" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Default ({firstType.default_target})</option>{firstType.allowed_targets.map((t) => <option key={t}>{t}</option>)}</select></div>)}
            <div><label className="label" htmlFor="dur">Duration (minutes)</label>
              <select id="dur" className="input" value={dur} onChange={(e) => setDur(Number(e.target.value))}>{[30, 60, 90, 120, 180, 240].map((d) => <option key={d} value={d}>{d} min</option>)}</select></div>
            <div><label className="label" htmlFor="res">Root cause resolved after (min, optional)</label>
              <input id="res" className="input" type="number" min={5} step={5} placeholder="Unresolved" value={res} onChange={(e) => setRes(e.target.value)} /></div>
            {err && <ErrorBox error={err} />}
            <button className="btn-primary w-full" onClick={run} disabled={busy}><Play size={14} />{busy ? 'Running…' : 'Run Simulation'}</button>
          </div>
        </Card>
      </div>
    </>
  )
}
