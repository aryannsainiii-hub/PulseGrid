import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Maximize, RotateCcw } from 'lucide-react'
import type { ReactFlowInstance } from '@xyflow/react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/common/ui'
import HospitalGraph, { Legend, type GraphFilter, type NodeView } from '../components/hospital-map/HospitalGraph'
import { pct } from '../utils/format'

export default function HospitalMap() {
  const model = useAsync(() => api.model())
  const dash = useAsync(() => api.dashboard())
  const [sel, setSel] = useState<string | null>(null)
  const [filter, setFilter] = useState<GraphFilter>('all')
  const [rf, setRf] = useState<ReactFlowInstance | null>(null)
  const view = useMemo(() => {
    const v: Record<string, NodeView> = {}
    dash.data?.systems.forEach((s) => { v[s.id] = { status: s.status, capacity: s.capacity } })
    return v
  }, [dash.data])
  if (model.error || dash.error) return <ErrorBox error={(model.error || dash.error)!} onRetry={() => { model.reload(); dash.reload() }} />
  if (!model.data || !dash.data) return <Spinner />
  const { nodes, edges } = model.data
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const node = sel ? byId[sel] : null
  const deps = edges.filter((e) => e.target === sel), dependents = edges.filter((e) => e.source === sel)
  const reset = () => { setSel(null); setFilter('all'); rf?.fitView({ padding: 0.15, duration: 300 }) }

  return (
    <>
      <PageHeader title="Hospital Dependency Map" subtitle="Explore how systems connect. Arrows point from a supplier to the system that depends on it."
        actions={<>
          <label className="sr-only" htmlFor="flt">Filter</label>
          <select id="flt" className="input !w-auto" value={filter} onChange={(e) => setFilter(e.target.value as GraphFilter)}>
            <option value="all">All systems</option><option value="infrastructure">Infrastructure</option><option value="department">Departments</option><option value="affected">Affected systems</option>
          </select>
          <button className="btn-ghost" onClick={() => rf?.fitView({ padding: 0.15, duration: 300 })}><Maximize size={14} />Fit to view</button>
          <button className="btn-ghost" onClick={reset}><RotateCcw size={14} />Reset View</button></>} />
      {dash.data.active_simulation && <div className="mb-3 text-sm rounded-xl bg-[#FBF1DD] px-3 py-2">Affected systems highlighted from simulation <Link className="underline text-teal" to={`/simulations/${dash.data.active_simulation.id}`}>{dash.data.active_simulation.name}</Link>.</div>}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div>
          <HospitalGraph nodes={nodes} edges={edges} view={view} selectedId={sel} onSelect={setSel} filter={filter} height={640} minimap onInit={setRf} />
          <div className="mt-2"><Legend /></div>
          {filter === 'affected' && !dash.data.active_simulation && <p className="text-sm text-navy/60 mt-2">No systems are affected right now. Run a simulation to see affected systems here.</p>}
        </div>
        <Card title="Node details">
          {!node ? <p className="text-sm text-navy/60">Select a node to see its dependencies and dependants.</p> : (
            <div className="text-sm space-y-3">
              <div><div className="font-semibold text-base">{node.name}</div><div className="text-xs text-navy/50 capitalize">{node.category} · criticality {node.criticality}/5</div></div>
              <div className="flex items-center gap-2"><StatusBadge status={view[node.id]?.status ?? 'healthy'} /><span>{pct(view[node.id]?.capacity ?? 100)} capacity</span></div>
              <p className="text-navy/70">{node.description}</p>
              <div className="text-xs text-navy/60">At risk below {node.at_risk_threshold}% · critical below {node.minimum_operating_capacity}% · local reserve {node.buffer_minutes} min</div>
              <div><div className="label">Depends on ({deps.length})</div>{deps.length ? <ul className="space-y-1">{deps.map((e) => <li key={e.source}><button className="text-teal underline" onClick={() => setSel(e.source)}>{byId[e.source].name}</button> <span className="text-xs text-navy/50">{e.dependency_type}, strength {e.dependency_strength}</span></li>)}</ul> : <p className="text-xs text-navy/50">No upstream dependencies.</p>}</div>
              <div><div className="label">Supports ({dependents.length})</div>{dependents.length ? <ul className="space-y-1">{dependents.map((e) => <li key={e.target}><button className="text-teal underline" onClick={() => setSel(e.target)}>{byId[e.target].name}</button> <span className="text-xs text-navy/50">{e.dependency_type}, strength {e.dependency_strength}</span></li>)}</ul> : <p className="text-xs text-navy/50">Nothing depends on this node.</p>}</div>
              <Link className="btn-primary w-full" to="/simulation-lab">Test a failure in the Lab</Link>
            </div>)}
        </Card>
      </div>
    </>
  )
}
