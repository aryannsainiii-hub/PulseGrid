import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, Disclaimer, ErrorBox, Kpi, PageHeader, Spinner, StatusBadge } from '../components/common/ui'
import { SEV_LABEL, STATUS, T, fmtDate, pct } from '../utils/format'

export default function SimulationResults() {
  const { id } = useParams()
  const sim = useAsync(() => api.getSimulation(id!), [id])
  if (sim.error) return <ErrorBox error={sim.error} onRetry={sim.reload} />
  if (!sim.data) return <Spinner />
  const r = sim.data, s = r.summary
  const impacted = r.node_impacts.filter((n) => n.peak_status !== 'healthy' || n.first_impact_minute !== null)
  const sevData = (['healthy', 'at_risk', 'critical'] as const).map((k) => ({ name: STATUS[k].label, value: s.severity_distribution[k], color: STATUS[k].color }))
  const pools = Object.values(r.resources.pools).map((p) => ({ name: p.label, Used: p.used, Remaining: p.remaining }))
  const series = r.timeline.map((t) => ({ minute: t.minute, Impact: t.impact_score, Critical: t.counts.critical, 'At risk': t.counts.at_risk }))
  const byName = Object.fromEntries(r.node_impacts.map((n) => [n.node_id, n.name]))

  return (
    <>
      <PageHeader title="Simulation Results" subtitle={`${r.name}${r.branch_label ? ` · branch: ${r.branch_label}` : ''} · ${fmtDate(r.created_at)}`}
        actions={<>
          <Link className="btn-ghost" to={`/simulation-lab?run=${r.id}`}><FlaskConical size={14} />Replay in Lab</Link>
          <Link className="btn-primary" to={`/response-planner?sim=${r.id}`}><ShieldCheck size={14} />Response planner</Link></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Kpi label="Incident" value={<span className="text-base">{s.initial_failure.type.replace(/_/g, ' ')}</span>} hint={`${SEV_LABEL[s.severity]} severity`} />
        <Kpi label="Initial failure point" value={<span className="text-base">{s.initial_failure.name}</span>} tone="info" />
        <Kpi label="Overall impact (peak)" value={pct(s.overall_impact)} hint={`at ${T(s.peak_minute)} min`} tone={s.overall_impact > 30 ? 'crit' : 'warn'} />
        <Kpi label="Affected systems" value={`${s.affected_count} / ${s.total_systems}`} tone="warn" />
        <Kpi label="Cascade depth" value={s.cascade_depth} hint={`${s.duration_minutes} min horizon`} tone="info" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Cascade propagation" className="lg:col-span-2">
          {r.cascade_path.length === 0 ? <p className="text-sm text-navy/60">No propagation beyond the initial failure.</p> : (
            <ol className="space-y-1.5 text-sm">{r.cascade_path.map((p, i) => (
              <li key={i} className="flex items-center gap-2 flex-wrap"><span className="text-xs rounded-full bg-sage px-2 py-0.5 w-14 text-center">{T(p.minute)}</span>
                <b>{byName[p.source]}</b><ArrowRight size={13} className="text-teal" /><b>{byName[p.target]}</b>
                <span className="text-xs text-navy/50">{p.dependency_type}, −{p.loss.toFixed(0)} pts, depth {p.depth}</span></li>))}</ol>)}
        </Card>
        <Card title="Severity distribution (peak)">
          <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={sevData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>{sevData.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
          <p className="text-xs text-navy/60 text-center">{s.affected_count} affected · {s.unaffected_count} unaffected</p>
        </Card>
        <Card title="Impact over time" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}><LineChart data={series}><CartesianGrid stroke="#EEF1EC" /><XAxis dataKey="minute" tickFormatter={(m) => `T+${m}`} fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
            <Line dataKey="Impact" stroke="#087F83" strokeWidth={2} dot={false} /><Line dataKey="Critical" stroke="#D75E61" dot={false} /><Line dataKey="At risk" stroke="#D99A38" dot={false} /></LineChart></ResponsiveContainer>
        </Card>
        <Card title="Resource availability">
          <ResponsiveContainer width="100%" height={220}><BarChart data={pools} layout="vertical"><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={90} fontSize={10} /><Tooltip /><Bar dataKey="Used" stackId="a" fill="#D99A38" /><Bar dataKey="Remaining" stackId="a" fill="#DCEDE5" /></BarChart></ResponsiveContainer>
          <p className="text-xs text-navy/60">Generator fuel remaining {pct(r.resources.generator.remaining_pct)}</p>
        </Card>
        <Card title="Impacted systems" className="lg:col-span-3">
          <div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead><tr><th>System</th><th>Previous</th><th>Simulated (worst → end)</th><th>Capacity (min → end)</th><th>First impact</th><th>Reason / responsible dependency</th></tr></thead><tbody>
            {impacted.map((n) => (<tr key={n.node_id}><td className="font-medium">{n.name}</td><td><StatusBadge status="healthy" /></td>
              <td><StatusBadge status={n.peak_status} /> → <StatusBadge status={n.final_status} /></td><td>{pct(n.min_capacity)} → {pct(n.final_capacity)}</td><td>{T(n.first_impact_minute)}</td><td className="text-navy/70">{n.reason}</td></tr>))}
            {impacted.length === 0 && <tr><td colSpan={6}>No systems were affected.</td></tr>}</tbody></table></div>
        </Card>
        <Card title="Explanation" className="lg:col-span-2">
          <div className="text-sm space-y-3">
            <p className="font-medium">{r.explanation.headline}</p>
            <div><b>What failed first:</b> {r.explanation.what_failed_first.join('; ')}</div>
            <div><b>Affected:</b> {r.explanation.affected_systems.join(', ') || 'none'}</div>
            <div><b>Why:</b><ul className="list-disc ml-5 mt-1 space-y-0.5 text-navy/80">{r.explanation.why.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
            <div><b>Remained operational throughout:</b> {r.explanation.remain_operational.join(', ') || 'none'}</div>
            <p className="text-xs text-navy/50">{r.explanation.note}</p>
          </div>
        </Card>
        <Card title="Recovery (model output)">
          <div className="text-sm space-y-2">
            <div><b>Still affected:</b> {r.recovery.systems_still_affected.join(', ') || 'none'}</div>
            <div><b>Recovering:</b> {r.recovery.systems_recovering.join(', ') || 'none'}</div>
            <div><b>Estimated full recovery:</b> {r.recovery.estimated_full_recovery_minute !== null ? T(r.recovery.estimated_full_recovery_minute) + ' min' : 'not determined'}</div>
            <p className="text-xs text-navy/50">{r.recovery.note}</p>
          </div>
        </Card>
        {r.interventions.length > 0 && (
          <Card title="Hypothetical interventions" className="lg:col-span-3">
            {r.interventions.map((iv, i) => (<div key={i} className="text-sm mb-2"><b>{iv.label}</b> at {T(iv.at_minute)} (effective {T(iv.effective_minute)}) — impact {iv.before.impact_score.toFixed(0)}% → {iv.after.impact_score.toFixed(0)}%</div>))}
            {r.counterfactual && <p className="text-sm text-navy/70">Without interventions: peak {pct(r.counterfactual.peak_impact_without)}, end {pct(r.counterfactual.final_impact_without)}. With: peak {pct(r.counterfactual.peak_impact_with)}, end {pct(r.counterfactual.final_impact_with)}. Improved: {r.counterfactual.improved.join(', ') || 'none'}.</p>}
          </Card>)}
      </div>
      <div className="mt-4"><Disclaimer>Results are produced by a deterministic model on synthetic data and are not clinical predictions. Limitations: {r.limitations.join(' ')}</Disclaimer></div>
    </>
  )
}
