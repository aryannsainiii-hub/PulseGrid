import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Trash2, Search } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, ConfirmDialog, Empty, ErrorBox, PageHeader, Spinner } from '../components/common/ui'
import { SEV_LABEL, fmtDate, pct } from '../utils/format'

export default function History() {
  const [sp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [severity, setSeverity] = useState('')
  const [sort, setSort] = useState('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [confirm, setConfirm] = useState(false)
  const params: Record<string, string> = { sort, order }
  if (q) params.q = q
  if (severity) params.severity = severity
  const list = useAsync(() => api.listSimulations(params), [q, severity, sort, order])
  const th = (key: string, label: string) => (
    <th><button className="font-medium hover:text-teal" onClick={() => { if (sort === key) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(key); setOrder('desc') } }}>{label}{sort === key ? (order === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>)
  return (
    <>
      <PageHeader title="Simulation History" subtitle="Saved simulation runs, stored in the local database."
        actions={<>
          <Link to="/scenario-comparison" className="btn-ghost">Compare runs</Link>
          <button className="btn-danger" onClick={() => setConfirm(true)} disabled={!list.data?.length}><Trash2 size={14} />Clear History</button></>} />
      <Card>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-3 top-3 text-navy/40" />
            <input className="input !pl-9" placeholder="Search simulations…" aria-label="Search simulations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input !w-auto" aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option></select>
        </div>
        {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data ? <Spinner /> : list.data.length === 0 ? (
          <Empty title="No simulation runs" hint={q || severity ? 'Nothing matches your filters.' : 'Run a scenario and it will be saved here.'} action={<Link className="btn-primary" to="/simulations">Run a simulation</Link>} />
        ) : (   
          <div className="overflow-x-auto"><table className="w-full min-w-[720px]"><thead><tr>
            {th('name', 'Scenario')}{th('created_at', 'Date & time')}{th('severity', 'Severity')}{th('affected_count', 'Affected systems')}{th('overall_impact', 'Overall impact')}<th>Best-ranked strategy</th><th /></tr></thead><tbody>
            {list.data.map((r) => (
              <tr key={r.id}><td>{r.name}{r.branch_label && <span className="ml-2 text-xs rounded-full bg-sky px-2 py-0.5">branch: {r.branch_label}</span>}</td><td>{fmtDate(r.created_at)}</td>
                <td>{SEV_LABEL[r.severity]}</td><td>{r.affected_count}</td><td>{pct(r.overall_impact)}</td><td>{r.best_strategy ?? '—'}</td>
                <td><Link className="text-teal underline" to={`/simulations/${r.id}`}>Open</Link></td></tr>))}</tbody></table></div>)}
      </Card>
      <ConfirmDialog open={confirm} title="Clear simulation history?" body="This permanently deletes all saved simulations, snapshots and response plans." confirmLabel="Clear history"
        onCancel={() => setConfirm(false)} onConfirm={async () => { await api.clearHistory(); setConfirm(false); list.reload() }} />
    </>
  )
}
// m