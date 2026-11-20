import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Boxes, CheckCircle2, AlertTriangle, Siren, BatteryCharging, Play, RotateCcw } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, Disclaimer, Empty, ErrorBox, Kpi, PageHeader, Spinner, StatusBadge } from '../components/common/ui'
import HospitalGraph, { Legend, type NodeView } from '../components/hospital-map/HospitalGraph'
import { SEV_LABEL, fmtDate, pct } from '../utils/format'

export default function Dashboard() {
  const nav = useNavigate()
  const model = useAsync(() => api.model())
  const dash = useAsync(() => api.dashboard())
  const scen = useAsync(() => api.scenarios())
  const [sel, setSel] = useState<string | null>(null)
  const [pick, setPick] = useState('main_power_failure')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)

  const view = useMemo(() => {
    const v: Record<string, NodeView> = {}
    dash.data?.systems.forEach((s) => { v[s.id] = { status: s.status, capacity: s.capacity } })
    return v
  }, [dash.data])

  if (model.error || dash.error) return <ErrorBox error={(model.error || dash.error)!} onRetry={() => { model.reload(); dash.reload() }} />
  if (!model.data || !dash.data) return <Spinner />
  const k = dash.data.kpis
  const four = (scen.data ?? []).slice(0, 4)
  const selNode = dash.data.systems.find((s) => s.id === sel)
  const selModel = model.data.nodes.find((n) => n.id === sel)

  async function run() {
    const sc = scen.data?.find((s) => s.id === pick)
    if (!sc || busy) return
    setBusy(true); setErr(null)
    try { const r = await api.runSimulation(sc.default_config); nav(`/simulations/${r.id}`) }
    catch (e) { setErr(e as Error) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Hospital Operations Overview" subtitle="Monitor. Simulate. Plan. Status of the synthetic hospital infrastructure model."
        actions={dash.data.active_simulation && <button className="btn-ghost" onClick={async () => { await api.clearIncident(); dash.reload() }}><RotateCcw size={14} />Clear simulated incident</button>} />
      {dash.data.active_simulation && (
        <div className="mb-4 rounded-xl bg-[#FBF1DD] border border-warn/30 px-3 py-2 text-sm">
          Showing end state of simulated incident <b>{dash.data.active_simulation.name}</b>. <Link to={`/simulations/${dash.data.active_simulation.id}`} className="underline text-teal">View results</Link>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Kpi label="Total systems" value={<span className="flex items-center gap-2"><Boxes size={18} />{k.total_systems}</span>} />
        <Kpi label="Operational systems" value={<span className="flex items-center gap-2"><CheckCircle2 size={18} />{k.operational_systems} / {k.total_systems}</span>} />
        <Kpi label="Affected departments" value={<span className="flex items-center gap-2"><AlertTriangle size={18} />{k.affected_departments} / {k.total_departments}</span>} tone={k.affected_departments ? 'warn' : 'teal'} />
        <Kpi label="Active incidents" value={<span className="flex items-center gap-2"><Siren size={18} />{k.active_incidents}</span>} tone={k.active_incidents ? 'crit' : 'teal'} />
        <Kpi label="Backup capacity" value={<span className="flex items-center gap-2"><BatteryCharging size={18} />{pct(k.backup_capacity_pct)}</span>} tone="info" hint="Generator availability × fuel" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Hospital simulation map" className="lg:col-span-2" right={<Link to="/hospital-map" className="text-xs text-teal underline">Open full map</Link>}>
          <HospitalGraph nodes={model.data.nodes} edges={model.data.edges} view={view} selectedId={sel} onSelect={setSel} height={380} />
          <div className="mt-2 flex justify-between items-center flex-wrap gap-2"><Legend />
            {selNode && selModel && <div className="text-xs bg-mint rounded-lg px-3 py-1.5"><b>{selNode.name}</b> · {pct(selNode.capacity)} · {selModel.description}</div>}
          </div>
        </Card>
        <Card title="System status">
          <div className="max-h-[420px] overflow-auto -mx-3"><table className="w-full"><thead><tr><th>System</th><th>Status</th><th>Capacity</th></tr></thead><tbody>
            {dash.data.systems.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-mint/50" onClick={() => setSel(s.id)}><td>{s.name}</td><td><StatusBadge status={s.status} /></td><td>{pct(s.capacity)}</td></tr>
            ))}</tbody></table></div>
        </Card>
        <Card title="Emergency simulation">
          <div role="radiogroup" aria-label="Scenario" className="grid grid-cols-2 gap-2">
            {four.map((s) => (
              <button key={s.id} role="radio" aria-checked={pick === s.id} onClick={() => setPick(s.id)}
                className={`rounded-xl border p-3 text-left text-sm ${pick === s.id ? 'border-teal bg-mint' : 'border-[#E3E8E2] bg-white'}`}>
                <div className="font-medium leading-tight">{s.name}</div><div className="text-xs text-navy/50 mt-1">{SEV_LABEL[s.default_severity]} severity</div>
              </button>
            ))}
          </div>
          {err && <div className="mt-3"><ErrorBox error={err} /></div>}
          <button className="btn-primary w-full mt-3" onClick={run} disabled={busy || !four.length}><Play size={14} />{busy ? 'Running simulation…' : 'Run Simulation'}</button>
          <div className="mt-2 text-xs text-navy/60">Need combined incidents, playback or interventions? <Link to="/simulation-lab" className="text-teal underline">Open Simulation Lab</Link></div>
        </Card>
        <Card title="Recent simulation results" className="lg:col-span-2">
          {dash.data.recent_simulations.length === 0 ? <Empty title="No simulations yet" hint="Run a scenario to see its results here." /> : (
            <table className="w-full"><thead><tr><th>Scenario</th><th>Time</th><th>Affected</th><th>Severity</th><th /></tr></thead><tbody>
              {dash.data.recent_simulations.map((r) => (
                <tr key={r.id}><td>{r.branch_label ?? r.name}</td><td>{fmtDate(r.created_at)}</td><td>{r.affected_count}</td><td>{SEV_LABEL[r.severity]}</td><td><Link className="text-teal underline" to={`/simulations/${r.id}`}>Results</Link></td></tr>
              ))}</tbody></table>)}
        </Card>
      </div>
      <div className="mt-4"><Disclaimer>Synthetic demo environment. PulseGrid is a decision-support prototype and does not control hospital systems or make clinical decisions.</Disclaimer></div>
    </>
  )
}
