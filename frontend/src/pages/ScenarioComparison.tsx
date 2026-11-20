import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GitCompare } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, Empty, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/common/ui'
import type { Comparison } from '../types'
import { SEV_LABEL, T, fmtDate, pct } from '../utils/format'

const COLORS = ['#087F83', '#D75E61', '#5D8FBD', '#D99A38', '#27966F', '#17324D']

export default function ScenarioComparison() {
  const [sp] = useSearchParams()
  const list = useAsync(() => api.listSimulations({ sort: 'created_at', order: 'desc' }))
  const [sel, setSel] = useState<string[]>(sp.get('ids')?.split(',').filter(Boolean) ?? [])
  const [cmp, setCmp] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 6 ? [...s, id] : s))
  async function run(ids = sel) {
    if (ids.length < 2 || busy) return
    setBusy(true); setErr(null)
    try { setCmp(await api.compare(ids)) } catch (e) { setErr(e as Error) } finally { setBusy(false) }
  }
  useEffect(() => { if (sel.length >= 2 && sp.get('ids')) run(sel) }, []) // eslint-disable-line
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />
  if (!list.data) return <Spinner />
  const name = (id: string) => { const r = list.data!.find((s) => s.id === id); return r ? (r.branch_label ?? r.name) : id }

  return (
    <>
      <PageHeader title="Scenario Comparison" subtitle="Compare two or more saved simulations side by side." />
      <Card title="Choose simulations (2–6)" right={<button className="btn-primary" onClick={() => run()} disabled={sel.length < 2 || busy}><GitCompare size={14} />{busy ? 'Comparing…' : `Compare (${sel.length})`}</button>}>
        {list.data.length < 2 ? <Empty title="Need at least two saved simulations" hint="Run a simulation, then create a branch in the Simulation Lab." action={<Link className="btn-primary" to="/simulation-lab">Open Simulation Lab</Link>} /> : (
          <div className="grid md:grid-cols-2 gap-1.5 max-h-56 overflow-auto">{list.data.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-mint/60"><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
              <span className="flex-1 truncate">{r.branch_label ? `${r.name} — ${r.branch_label}` : r.name}</span><span className="text-xs text-navy/50">{SEV_LABEL[r.severity]} · {fmtDate(r.created_at)}</span></label>))}</div>)}
      </Card>
      {err && <div className="mt-3"><ErrorBox error={err} /></div>}
      {cmp && (
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <Card title="Impact timeline comparison" className="lg:col-span-2"><ResponsiveContainer width="100%" height={260}><LineChart data={cmp.impact_series}><CartesianGrid stroke="#EEF1EC" /><XAxis dataKey="minute" tickFormatter={(m) => `T+${m}`} fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
            {cmp.runs.map((r, i) => <Line key={r.id} name={r.branch_label ?? r.name} dataKey={r.id} stroke={COLORS[i % 6]} strokeWidth={2} dot={false} connectNulls />)}</LineChart></ResponsiveContainer></Card>
          <Card title="Summary metrics" className="lg:col-span-2"><div className="overflow-x-auto"><table className="w-full min-w-[700px]"><thead><tr><th>Metric</th>{cmp.runs.map((r) => <th key={r.id}>{r.branch_label ?? r.name}</th>)}</tr></thead><tbody>
            {([['Peak impact', (r: any) => pct(r.overall_impact, 1)], ['End impact', (r: any) => pct(r.final_impact, 1)], ['Affected systems', (r: any) => r.affected_count], ['Affected departments', (r: any) => r.affected_departments],
              ['Cascade depth', (r: any) => r.cascade_depth], ['Resource units committed', (r: any) => r.resource_use_total], ['Generator fuel used (h)', (r: any) => r.generator_fuel_used_hours],
              ['Full recovery', (r: any) => (r.recovery_minute !== null ? T(r.recovery_minute) + ' min' : 'not reached'), ], ['Still affected at end', (r: any) => r.still_affected.length],
              ['Best strategy', (r: any) => (r.best_strategy ? `${r.best_strategy} (${r.best_score})` : '—')]] as [string, (r: any) => any][]).map(([label, f]) => (
              <tr key={label}><td>{label}</td>{cmp.runs.map((r) => <td key={r.id}>{f(r)}</td>)}</tr>))}</tbody></table></div></Card>
          <Card title="Resource consumption"><ResponsiveContainer width="100%" height={230}><BarChart data={cmp.runs.map((r) => ({ name: r.branch_label ?? r.name, Units: r.resource_use_total, 'Fuel (h)': r.generator_fuel_used_hours }))}><CartesianGrid stroke="#EEF1EC" /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} /><Tooltip /><Legend /><Bar dataKey="Units" fill="#087F83" /><Bar dataKey="Fuel (h)" fill="#D99A38" /></BarChart></ResponsiveContainer></Card>
          <Card title="Why the runs differ">
            <ul className="list-disc ml-5 text-sm space-y-2">{cmp.explanation.map((t, i) => <li key={i}>{t}</li>)}</ul></Card>
          <Card title="Affected-system comparison (end of simulation)" className="lg:col-span-2"><div className="overflow-x-auto"><table className="w-full min-w-[700px]"><thead><tr><th>System</th>{cmp.runs.map((r) => <th key={r.id}>{r.branch_label ?? r.name}</th>)}</tr></thead><tbody>
            {cmp.nodes.map((n) => (<tr key={n.node_id} className={n.differs ? 'bg-[#FBF1DD]/50' : ''}><td>{n.name}{n.differs && <span className="ml-2 text-[10px] text-[#B97A1C]">differs</span>}</td>
              {cmp.runs.map((r) => <td key={r.id}><StatusBadge status={n.values[r.id].final_status} /> <span className="text-xs text-navy/50">{pct(n.values[r.id].final_capacity)}</span></td>)}</tr>))}</tbody></table></div></Card>
          {cmp.runs.some((r) => r.strategy_scores) && <Card title="Strategy comparison" className="lg:col-span-2"><table className="w-full"><thead><tr><th>Run</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>
            {cmp.runs.map((r) => <tr key={r.id}><td>{r.branch_label ?? r.name}</td>{['A', 'B', 'C'].map((k) => <td key={k}>{r.strategy_scores?.[k] ?? 'infeasible'}</td>)}</tr>)}</tbody></table>
            <p className="text-xs text-navy/50 mt-2">Plans evaluate each run's incident without its own applied interventions. Scores are 0–100.</p></Card>}
        </div>)}
      {!cmp && sel.length > 0 && <p className="text-xs text-navy/50 mt-2">Selected: {sel.map(name).join(', ')}</p>}
    </>
  )
}
