import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, ErrorBox, PageHeader, Spinner } from '../components/common/ui'
import type { ScenarioDef, Severity } from '../types'
import { SEV_LABEL } from '../utils/format'

export default function Scenarios() {
  const nav = useNavigate()
  const scen = useAsync(() => api.scenarios())
  const [sev, setSev] = useState<Record<string, Severity>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<Error | null>(null)
  if (scen.error) return <ErrorBox error={scen.error} onRetry={scen.reload} />
  if (!scen.data) return <Spinner />

  async function run(s: ScenarioDef) {
    if (busy) return
    const chosen = sev[s.id] ?? s.default_severity
    setBusy(s.id); setErr(null)
    const cfg = { ...s.default_config, disruptions: s.default_config.disruptions.map((d, i) => ({ ...d, severity: s.disruptions.length === 1 || i === 0 ? chosen : d.severity })) }
    try { const r = await api.runSimulation(cfg); nav(`/simulations/${r.id}`) } catch (e) { setErr(e as Error) } finally { setBusy(null) }
  }
  return (
    <>
      <PageHeader title="Scenario Library" subtitle="Predefined, data-driven emergency scenarios. Pick a severity and run." />
      {err && <div className="mb-3"><ErrorBox error={err} /></div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {scen.data.map((s) => {
          const cur = sev[s.id] ?? s.default_severity
          return (
            <Card key={s.id}>
              <div className="font-semibold">{s.name}</div>
              <p className="text-sm text-navy/70 mt-1">{s.description}</p>
              <div className="text-xs mt-3"><b>Initial failure point:</b> {s.initial_failure_points.map((p) => p.name).join(', ')}</div>
              <div className="text-xs mt-1 text-navy/60"><b>Potentially affected:</b> {s.potentially_affected.length} systems{open === s.id && <> — {s.potentially_affected.map((p) => p.name).join(', ')}</>}</div>
              <div className="flex gap-1.5 mt-3" role="group" aria-label={`Severity for ${s.name}`}>
                {s.severity_options.map((o) => <button key={o} aria-pressed={cur === o} onClick={() => setSev({ ...sev, [s.id]: o })} className={`btn !py-1 !px-3 text-xs ${cur === o ? 'bg-teal text-white' : 'btn-ghost'}`}>{SEV_LABEL[o]}</button>)}
              </div>
              <div className="flex gap-2 mt-4">
                <button className="btn-primary flex-1" onClick={() => run(s)} disabled={!!busy}><Play size={14} />{busy === s.id ? 'Running…' : 'Run Scenario'}</button>
                <button className="btn-ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide details' : 'View details'}</button>
              </div>
              <Link className="text-xs text-teal underline mt-2 inline-block" to={`/history?q=${encodeURIComponent(s.name)}`}>View previous results</Link>
            </Card>)
        })}
      </div>
    </>
  )
}
