import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GitBranch, GitCompare, Pause, Play, RotateCcw, SkipBack, SkipForward, Zap } from 'lucide-react'
import { api } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { Card, Disclaimer, ErrorBox, PageHeader, Spinner, StatusBadge } from '../components/common/ui'
import HospitalGraph, { Legend, type NodeView } from '../components/hospital-map/HospitalGraph'
import ScenarioBuilder, { bodyFromRun, cfgFromConfig, defaultCfg, toBody, type BuilderCfg } from '../components/simulation/ScenarioBuilder'
import type { Intervention, SimResult } from '../types'
import { RES_LABEL, STATUS, T, pct } from '../utils/format'

const KIND_COLOR: Record<string, string> = { incident: '#D75E61', degrade: '#D75E61', improve: '#27966F', recovery: '#27966F', intervention: '#087F83', buffer: '#D99A38', backup: '#5D8FBD', fuel: '#D75E61' }

export default function SimulationLab() {
  const [sp] = useSearchParams()
  const model = useAsync(() => api.model())
  const types = useAsync(() => api.incidentTypes())
  const scen = useAsync(() => api.scenarios())
  const catalog = useAsync(() => api.interventions())
  const [cfg, setCfg] = useState<BuilderCfg>(defaultCfg())
  const [keptIvs, setKeptIvs] = useState<Intervention[]>([])
  const [run, setRun] = useState<SimResult | null>(null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [sel, setSel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Error | null>(null)
  const [branchOf, setBranchOf] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [session, setSession] = useState<{ id: string; label: string }[]>([])
  const [ivType, setIvType] = useState('prioritise_critical_loads')
  const [ivParams, setIvParams] = useState<Record<string, any>>({})

  useEffect(() => {
    const id = sp.get('run')
    if (id) api.getSimulation(id).then((r) => { setRun(r); setCfg(cfgFromConfig(r.config)); setSession([{ id: r.id, label: r.branch_label ?? r.name }]) }).catch((e) => setErr(e))
  }, []) // eslint-disable-line

  const last = run ? run.timeline.length - 1 : 0
  useEffect(() => {
    if (!playing || !run) return
    const h = setInterval(() => setStep((s) => { if (s >= last) { setPlaying(false); return s } return s + 1 }), 1100 / speed)
    return () => clearInterval(h)
  }, [playing, run, speed, last])

  const snap = run?.timeline[step]
  const view = useMemo(() => {
    const v: Record<string, NodeView> = {}
    if (snap) Object.entries(snap.nodes).forEach(([id, n]) => { v[id] = { status: n.status, capacity: n.capacity, onBuffer: n.on_buffer } })
    return v
  }, [snap])
  const propagated = useMemo(() => new Set((run?.cascade_path ?? []).filter((p) => snap && p.minute <= snap.minute).map((p) => `${p.source}->${p.target}`)), [run, snap])
  const pulsing = useMemo(() => new Set((run?.cascade_path ?? []).filter((p) => snap && p.minute === snap.minute).map((p) => `${p.source}->${p.target}`)), [run, snap])
  const names = useMemo(() => Object.fromEntries((model.data?.nodes ?? []).map((n) => [n.id, n.name])), [model.data])

  if (model.error || types.error || scen.error) return <ErrorBox error={(model.error || types.error || scen.error)!} onRetry={() => { model.reload(); types.reload(); scen.reload() }} />
  if (!model.data || !types.data || !scen.data || !catalog.data) return <Spinner />

  async function execute(body: Record<string, any>, parent?: string, lbl?: string, keepStep = false) {
    if (busy) return
    setBusy(true); setErr(null); setPlaying(false)
    try {
      const r = await api.runSimulation({ ...body, parent_id: parent, branch_label: lbl || undefined } as any)
      setRun(r); setSession((s) => [...s, { id: r.id, label: r.branch_label ?? r.name }]); setSel(null)
      setStep(keepStep ? Math.min(step, r.timeline.length - 1) : 0)
      return r
    } catch (e) { setErr(e as Error) } finally { setBusy(false) }
  }
  const play = () => { if (!run) return; if (step >= last) setStep(0); setPlaying(true) }
  const ivDef = catalog.data.find((c) => c.type === ivType)
  const paramVal = (n: string, spec: any) => ivParams[n] ?? spec[2]
  const nodeImpact = run?.node_impacts.find((n) => n.node_id === sel)
  const nodeState = sel && snap ? snap.nodes[sel] : null
  const events = run ? run.timeline.slice(0, step + 1).flatMap((t) => t.events).reverse() : []
  const recoveryLists = snap ? (['recovering', 'recovered', 'degraded'] as const).map((k) => [k, Object.entries(snap.nodes).filter(([, n]) => n.recovery_state === k).map(([id]) => names[id])] as const) : []
  const compareIds = session.length >= 2 ? session.map((s) => s.id).filter((v, i, a) => a.indexOf(v) === i).slice(-6) : run?.parent_id ? [run.parent_id, run.id] : []

  async function applyIntervention() {
    if (!run || !snap) return
    const iv: Intervention = { type: ivType, at_minute: snap.minute, params: Object.fromEntries((Object.entries(ivDef?.params ?? {})).map(([n, s]) => [n, paramVal(n, s)])) }
    const r = await execute(bodyFromRun(run.config, [iv]), run.id, `${ivDef?.label ?? ivType} @T+${snap.minute}`, true)
    if (r) setPlaying(true)
  }
  const whatIf = (lbl: string, mutate: (d: any[]) => any[]) => run && execute(bodyFromRun(run.config, [], mutate), run.id, lbl)

  return (
    <>
      <PageHeader title="Simulation Lab" subtitle="Configure, run, play back and branch hospital emergencies. All states come from the backend simulation engine."
        actions={<>{compareIds.length >= 2 && <Link className="btn-ghost" to={`/scenario-comparison?ids=${compareIds.join(',')}`}><GitCompare size={14} />Compare runs</Link>}
          {run && <Link className="btn-ghost" to={`/response-planner?sim=${run.id}`}>Response planner</Link>}{run && <Link className="btn-ghost" to={`/simulations/${run.id}`}>Full results</Link>}</>} />
      <div className="grid xl:grid-cols-[320px_1fr_340px] gap-4">
        <Card title="Scenario builder">
          <ScenarioBuilder cfg={cfg} setCfg={setCfg} types={types.data} scenarios={scen.data} busy={busy} error={err} branchOf={branchOf} label={label} setLabel={setLabel} keptInterventions={keptIvs.length}
            onCancelBranch={() => { setBranchOf(null); setKeptIvs([]) }}
            onRun={() => execute(toBody(cfg, keptIvs), branchOf ?? undefined, branchOf ? label || 'Edited branch' : undefined)} />
        </Card>

        <div className="space-y-4 min-w-0">
          <Card title={run ? `${run.branch_label ?? run.name} — ${snap ? T(snap.minute) : ''} min` : 'Hospital dependency graph'}
            right={snap && <span className="text-xs text-navy/60">Impact {pct(snap.impact_score)} · {snap.counts.critical} critical · {snap.counts.at_risk} at risk</span>}>
            <HospitalGraph nodes={model.data.nodes} edges={model.data.edges} view={view} selectedId={sel} onSelect={setSel} propagated={propagated} pulsing={pulsing} height={430} />
            <div className="mt-2"><Legend /></div>
            {!run && <p className="text-sm text-navy/60 mt-3">Configure a scenario on the left and press <b>Run Simulation</b>. The graph then shows the backend-computed state at every time step.</p>}
            {run && snap && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn-ghost !p-2" aria-label="Restart" onClick={() => { setStep(0); setPlaying(false) }}><RotateCcw size={14} /></button>
                  <button className="btn-ghost !p-2" aria-label="Previous time step" disabled={step === 0} onClick={() => { setPlaying(false); setStep(step - 1) }}><SkipBack size={14} /></button>
                  {playing ? <button className="btn-primary" onClick={() => setPlaying(false)}><Pause size={14} />Pause</button>
                    : <button className="btn-primary" onClick={play}><Play size={14} />{step > 0 && step < last ? 'Resume' : 'Play'}</button>}
                  <button className="btn-ghost !p-2" aria-label="Next time step" disabled={step >= last} onClick={() => { setPlaying(false); setStep(step + 1) }}><SkipForward size={14} /></button>
                  <label className="text-xs flex items-center gap-1 ml-auto">Speed<select className="input !w-auto !py-1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
                </div>
                <input type="range" aria-label="Simulation time" className="w-full accent-teal" min={0} max={last} value={step} onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)) }} />
                <div className="flex gap-1 overflow-x-auto pb-1">{run.timeline.map((t, i) => (
                  <button key={t.minute} onClick={() => { setPlaying(false); setStep(i) }} className={`shrink-0 rounded-lg px-2 py-1 text-xs border ${i === step ? 'bg-teal text-white border-teal' : 'bg-white border-[#E3E8E2]'}`}>
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.counts.critical ? STATUS.critical.color : t.counts.at_risk ? STATUS.at_risk.color : STATUS.healthy.color }} />{T(t.minute)}</button>))}</div>
              </div>)}
          </Card>
          {run && (
            <Card title="Impact timeline (click to jump)">
              <ResponsiveContainer width="100%" height={170}><LineChart data={run.timeline.map((t) => ({ minute: t.minute, Impact: t.impact_score, Critical: t.counts.critical }))} onClick={(e: any) => { if (e?.activeLabel !== undefined) { const i = run.timeline.findIndex((t) => t.minute === e.activeLabel); if (i >= 0) { setPlaying(false); setStep(i) } } }}>
                <CartesianGrid stroke="#EEF1EC" /><XAxis dataKey="minute" tickFormatter={(m) => `T+${m}`} fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Line dataKey="Impact" stroke="#087F83" strokeWidth={2} dot={false} /><Line dataKey="Critical" stroke="#D75E61" dot={false} />{snap && <ReferenceLine x={snap.minute} stroke="#17324D" strokeDasharray="4 3" />}</LineChart></ResponsiveContainer>
            </Card>)}
          {run && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Live event feed"><ul className="space-y-1.5 max-h-56 overflow-auto text-xs">{events.length === 0 && <li className="text-navy/50">No events yet.</li>}
                {events.map((e, i) => <li key={i} className="flex gap-2"><span className="shrink-0 rounded px-1.5 py-0.5 text-white" style={{ background: KIND_COLOR[e.kind] ?? '#5D8FBD' }}>{T(e.minute)}</span><span>{e.text}</span></li>)}</ul></Card>
              <Card title="Recovery state (model output)">{recoveryLists.map(([k, v]) => <div key={k} className="text-xs mb-2"><b className="capitalize">{k === 'degraded' ? 'Still degraded' : k}:</b> {v.length ? v.join(', ') : 'none'}</div>)}
                <p className="text-xs text-navy/50">{run.recovery.note}</p></Card>
            </div>)}
        </div>

        <div className="space-y-4">
          <Card title="Node inspector">
            {!sel ? <p className="text-sm text-navy/60">Click any node to inspect its impact history.</p> : nodeState && nodeImpact && (
              <div className="text-sm space-y-2">
                <div className="font-semibold">{nodeImpact.name}</div>
                <div className="flex items-center gap-2"><StatusBadge status={nodeState.status} /><span>{pct(nodeState.capacity)} · served {nodeState.served_demand.toFixed(0)}/{nodeState.demand}</span></div>
                {nodeState.on_buffer && <p className="text-xs text-[#B97A1C]">Bridging a supply deficit on its local reserve.</p>}
                {nodeState.shed && <p className="text-xs text-[#B97A1C]">Curtailed by an intervention (trade-off).</p>}
                <p className="text-xs text-navy/70">{nodeImpact.reason}</p>
                <ul className="text-xs list-disc ml-4">{nodeState.causes.map((c, i) => <li key={i}>{names[c.source]} ({c.dependency_type}) supplies {c.supply.toFixed(0)}% → −{c.loss.toFixed(0)} pts</li>)}{nodeState.causes.length === 0 && <li>No dependency deficit at this step.</li>}</ul>
                <div className="text-xs text-navy/60">First impact {T(nodeImpact.first_impact_minute)} · critical for {nodeImpact.critical_minutes} min</div>
                <ResponsiveContainer width="100%" height={120}><LineChart data={nodeImpact.history}><XAxis dataKey="minute" fontSize={10} /><YAxis domain={[0, 100]} fontSize={10} width={28} /><Tooltip /><Line dataKey="capacity" stroke="#087F83" dot={false} strokeWidth={2} />{snap && <ReferenceLine x={snap.minute} stroke="#17324D" strokeDasharray="3 3" />}</LineChart></ResponsiveContainer>
              </div>)}
          </Card>
          <Card title="Intervention testing">
            {!run ? <p className="text-sm text-navy/60">Run a simulation, pause at a time step, then test a hypothetical intervention.</p> : (
              <div className="space-y-2 text-sm">
                <p className="text-xs text-navy/60">Applies at the current time (<b>{snap ? T(snap.minute) : ''}</b>) and re-runs the engine as a new branch. Hypothetical only.</p>
                <label className="label" htmlFor="ivt">Intervention</label>
                <select id="ivt" className="input" value={ivType} onChange={(e) => { setIvType(e.target.value); setIvParams({}) }}>{catalog.data.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}</select>
                {ivDef && <p className="text-xs text-navy/60">{ivDef.description} Delay {ivDef.delay_minutes} min. Cost: {Object.entries(ivDef.cost).map(([k, v]) => `${RES_LABEL(k)} ${v}`).join(', ')}.</p>}
                {ivDef && Object.entries(ivDef.params).map(([n, spec]: [string, any]) => spec[0] === 'choice'
                  ? <select key={n} aria-label={n} className="input" value={paramVal(n, spec)} onChange={(e) => setIvParams({ ...ivParams, [n]: e.target.value })}>{spec[1].map((o: string) => <option key={o}>{o}</option>)}</select>
                  : <label key={n} className="text-xs">{RES_LABEL(n)} ({spec[0]}–{spec[1]})<input type="number" className="input mt-1" min={spec[0]} max={spec[1]} value={paramVal(n, spec)} onChange={(e) => setIvParams({ ...ivParams, [n]: Number(e.target.value) })} /></label>)}
                <button className="btn-primary w-full" disabled={busy || !snap || snap.minute >= run.config.duration_minutes} onClick={applyIntervention}><Zap size={14} />Apply at {snap ? T(snap.minute) : ''} &amp; continue</button>
                {run.interventions.length > 0 && <div className="rounded-xl bg-mint p-2 text-xs space-y-1"><b>Applied in this run</b>{run.interventions.map((iv, i) => <div key={i}>{iv.label} at {T(iv.at_minute)}: impact {iv.before.impact_score.toFixed(0)}% → {iv.after.impact_score.toFixed(0)}%, {iv.changes.length} system(s) changed</div>)}
                  {run.counterfactual && <div>Without: end {pct(run.counterfactual.final_impact_without)} · with: {pct(run.counterfactual.final_impact_with)}. Improved: {run.counterfactual.improved.join(', ') || 'none'}.</div>}</div>}
              </div>)}
          </Card>
          <Card title="What-if branches">
            {!run ? <p className="text-sm text-navy/60">Branches appear after the first run.</p> : (
              <div className="space-y-2">
                <button className="btn-ghost w-full" disabled={busy || run.config.disruptions.some((d) => d.type === 'backup_generator_failure')} onClick={() => whatIf('Backup generator unavailable', (d) => [...d, { type: 'backup_generator_failure', severity: 'critical', start_minute: 0, target: 'backup_gen' }])}><GitBranch size={14} />Generator unavailable</button>
                <button className="btn-ghost w-full" disabled={busy || run.config.disruptions.every((d) => d.severity === 'critical')} onClick={() => whatIf('Escalated to critical', (d) => d.map((x) => ({ ...x, severity: 'critical' })))}><GitBranch size={14} />Escalate to critical severity</button>
                <button className="btn-ghost w-full" onClick={() => { setCfg(cfgFromConfig(run.config)); setKeptIvs(run.config.interventions); setBranchOf(run.id); setLabel('') }}><GitBranch size={14} />Edit as branch in builder</button>
                {session.length > 0 && <div className="text-xs text-navy/60"><b>Runs this session</b><ul className="mt-1 space-y-0.5">{session.map((s, i) => <li key={i}><button className={`underline ${s.id === run.id ? 'text-teal font-medium' : ''}`} onClick={async () => { const r = await api.getSimulation(s.id); setRun(r); setStep(0); setPlaying(false) }}>{s.label}</button></li>)}</ul></div>}
              </div>)}
          </Card>
          {run && snap && <Card title="Resources at this step"><ul className="text-xs space-y-1">{Object.entries(run.resources.pools).map(([k, p]) => <li key={k} className="flex justify-between"><span>{p.label}</span><span>{snap.resources_committed[k] ?? 0} committed / {p.available}</span></li>)}
            <li className="flex justify-between"><span>Generator fuel remaining</span><span>{pct(snap.backup.fuel_remaining_pct)}{snap.backup.active ? ' (running)' : ''}</span></li></ul></Card>}
        </div>
      </div>
      <div className="mt-4"><Disclaimer>Illustrative simulation intervals on synthetic data, not real-world clinical or operational predictions. Interventions are hypothetical and PulseGrid never controls equipment.</Disclaimer></div>
    </>
  )
}
