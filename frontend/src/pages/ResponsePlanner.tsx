import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RefreshCw, Trophy } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, Disclaimer, Empty, ErrorBox, PageHeader, Spinner } from '../components/common/ui'
import { RES_LABEL, T, errText, pct } from '../utils/format'

export default function ResponsePlanner() {
  const [sp, setSp] = useSearchParams()
  const list = useAsync(() => api.listSimulations({ sort: 'created_at', order: 'desc' }))
  const simId = sp.get('sim') ?? list.data?.[0]?.id ?? null
  const sim = useAsync(() => (simId ? api.getSimulation(simId) : Promise.resolve(null)), [simId])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />
  if (!list.data) return <Spinner />
  if (list.data.length === 0) return (<><PageHeader title="Response Planner" subtitle="Evaluate and choose the best response strategy." />
    <Card><Empty title="No simulation to plan for" hint="Run a simulation first; PulseGrid evaluates strategies against it." action={<Link className="btn-primary" to="/simulations">Run a simulation</Link>} /></Card></>)

  const plan = sim.data?.plan
  async function recompute() {
    if (!simId || busy) return
    setBusy(true); setErr(null)
    try { await api.createPlan(simId); sim.reload() } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const chart = plan?.strategies.map((s) => ({ name: s.name.replace('Strategy ', ''), Score: s.score, Coverage: s.metrics.service_coverage, 'Resource use': s.metrics.resource_use_pct })) ?? []
  const best = plan?.strategies.find((s) => s.key === plan.best_strategy)

  return (
    <>
      <PageHeader title="Response Planner" subtitle="Compare response strategies under resource constraints. Every number comes from re-running the simulation."
        actions={<>
          <select className="input !w-auto max-w-[260px]" aria-label="Simulation" value={simId ?? ''} onChange={(e) => setSp({ sim: e.target.value })}>
            {list.data.map((s) => <option key={s.id} value={s.id}>{s.branch_label ?? s.name} · {s.severity}</option>)}</select>
          <button className="btn-ghost" onClick={recompute} disabled={busy}><RefreshCw size={14} />{busy ? 'Computing…' : 'Recompute with current settings'}</button></>} />
      {err && <div className="mb-3"><ErrorBox error={err} /></div>}
      {sim.error ? <ErrorBox error={sim.error} onRetry={sim.reload} /> : !sim.data || !plan ? <Spinner /> : (<>
        <Disclaimer>{plan.disclaimer}</Disclaimer>
        <div className="grid lg:grid-cols-3 gap-4 mt-4">
          {plan.strategies.map((s) => (
            <Card key={s.key} className={s.rank === 1 ? '!border-teal ring-2 ring-teal/20' : ''}>
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{s.name}</div><div className="text-sm text-teal">{s.title}</div></div>
                {s.rank === 1 ? <span className="flex items-center gap-1 rounded-full bg-teal text-white text-xs px-2.5 py-1"><Trophy size={12} />Best option</span>
                  : !s.feasible ? <span className="rounded-full bg-[#FAE5E5] text-crit text-xs px-2.5 py-1">Infeasible</span> : <span className="rounded-full bg-sky text-xs px-2.5 py-1">Rank {s.rank}</span>}</div>
              <p className="text-xs text-navy/60 mt-2">{s.summary}</p>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm mt-3">
                <dt className="text-navy/60">Service coverage</dt><dd className="text-right font-medium">{pct(s.metrics.service_coverage, 1)}</dd>
                <dt className="text-navy/60">Resource use</dt><dd className="text-right">{pct(s.metrics.resource_use_pct, 0)}</dd>
                <dt className="text-navy/60">Affected systems (end)</dt><dd className="text-right">{s.metrics.affected_systems}</dd>
                <dt className="text-navy/60">Stabilises</dt><dd className="text-right">{s.metrics.stabilise_minute !== null ? T(s.metrics.stabilise_minute) + ' min' : 'not within horizon'}</dd>
                <dt className="text-navy/60">Score</dt><dd className="text-right font-semibold">{s.score}</dd>
              </dl>
              {!s.feasible && <div className="mt-2 text-xs text-crit">{s.hard_violations.map((v) => `${RES_LABEL(v.resource)}: needs ${v.required}, has ${v.available}`).join('; ')}</div>}
            </Card>))}
        </div>
        <div className="grid lg:grid-cols-3 gap-4 mt-4">
          <Card title="Strategy comparison" className="lg:col-span-2"><div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr><th>Metric</th>{plan.strategies.map((s) => <th key={s.key}>{s.name}</th>)}<th>No response</th></tr></thead><tbody>
            <tr><td>Feasible</td>{plan.strategies.map((s) => <td key={s.key}>{s.feasible ? 'Yes' : 'No'}</td>)}<td>—</td></tr>
            <tr><td>Service coverage</td>{plan.strategies.map((s) => <td key={s.key}>{pct(s.metrics.service_coverage, 1)}</td>)}<td>{pct(plan.reference.metrics.service_coverage, 1)}</td></tr>
            <tr><td>Affected systems (end)</td>{plan.strategies.map((s) => <td key={s.key}>{s.metrics.affected_systems}</td>)}<td>{plan.reference.metrics.affected_systems}</td></tr>
            <tr><td>Resources used</td>{plan.strategies.map((s) => <td key={s.key} className="text-xs">{Object.entries(s.metrics.resources_used).map(([k, v]) => `${RES_LABEL(k)} ${v}`).join(', ') || 'none'}</td>)}<td>none</td></tr>
            <tr><td>Remaining (pools)</td>{plan.strategies.map((s) => <td key={s.key} className="text-xs">{Object.entries(s.metrics.remaining_resources).map(([k, v]) => `${v} ${RES_LABEL(k).split(' ')[0]}`).join(' · ')}</td>)}<td /></tr>
            <tr><td>Generator fuel left</td>{plan.strategies.map((s) => <td key={s.key}>{pct(s.metrics.generator_fuel_remaining_pct)}</td>)}<td>{pct(plan.reference.metrics.generator_fuel_remaining_pct)}</td></tr>
            <tr><td>Critical depts still below minimum</td>{plan.strategies.map((s) => <td key={s.key} className="text-xs">{s.metrics.service_violations.join(', ') || 'none'}</td>)}<td className="text-xs">{plan.reference.metrics.service_violations.join(', ') || 'none'}</td></tr>
            <tr><td>Score (0–100)</td>{plan.strategies.map((s) => <td key={s.key} className="font-semibold">{s.score}</td>)}<td>—</td></tr>
            <tr><td>Rank</td>{plan.strategies.map((s) => <td key={s.key}>{s.rank ?? '—'}</td>)}<td>—</td></tr></tbody></table></div></Card>
          <Card title="Scores and trade-offs"><ResponsiveContainer width="100%" height={230}><BarChart data={chart}><CartesianGrid stroke="#EEF1EC" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
            <Bar dataKey="Score" fill="#087F83" /><Bar dataKey="Coverage" fill="#5D8FBD" /><Bar dataKey="Resource use" fill="#D99A38" /></BarChart></ResponsiveContainer></Card>
          <Card title="Why this ranking" className="lg:col-span-2"><p className="text-sm">{plan.explanation}</p>
            <ul className="list-disc ml-5 mt-3 text-sm text-navy/80 space-y-1">{plan.tradeoffs.map((t) => <li key={t.key}>{t.text}</li>)}</ul>
            {best && <div className="mt-3 text-sm"><b>Resource requirements ({best.name}):</b> {best.interventions.map((i) => i.label ?? i.type).join(', ')} starting {T(plan.response_start_minute)} min.</div>}</Card>
          <Card title="Scoring model"><p className="text-xs font-mono bg-cream rounded-lg p-2">{plan.formula}</p>
            <div className="text-xs text-navy/70 mt-2">Weights: coverage {plan.weights.coverage}, resources {plan.weights.resources}, recovery {plan.weights.recovery}, violations {plan.weights.violations}. Horizon {plan.horizon_minutes} min. Hard limit: a strategy exceeding any resource pool is infeasible and never ranked.</div>
            <ul className="list-disc ml-5 mt-2 text-xs text-navy/60">{plan.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></Card>
        </div></>)}
    </>
  )
}
