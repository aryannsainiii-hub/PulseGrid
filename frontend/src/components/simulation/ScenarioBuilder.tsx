import { Plus, Trash2, Play } from 'lucide-react'
import type { IncidentType, ScenarioDef, Severity, Intervention, SimConfig } from '../../types'
import { ErrorBox } from '../common/ui'
import { RES_LABEL, SEV_LABEL } from '../../utils/format'

export interface DisruptionForm { type: string; severity: Severity; target: string; start_minute: number; resolution: string }
export interface BuilderCfg { name: string; duration_minutes: number; disruptions: DisruptionForm[]; resources: Record<string, string>; scenario_id?: string | null }
export const POOLS = ['portable_generator_units', 'oxygen_cylinder_sets', 'surge_staff', 'it_failover_links', 'alt_supply_requests', 'generator_fuel_hours']
export const defaultCfg = (): BuilderCfg => ({ name: 'Main Power Failure', duration_minutes: 60, scenario_id: 'main_power_failure', resources: {},
  disruptions: [{ type: 'main_power_failure', severity: 'high', target: '', start_minute: 0, resolution: '' }] })

export function cfgFromConfig(c: SimConfig): BuilderCfg {
  return { name: c.name, duration_minutes: c.duration_minutes, scenario_id: c.scenario_id, resources: {},
    disruptions: c.disruptions.map((d) => ({ type: d.type, severity: d.severity, target: d.target ?? '', start_minute: d.start_minute, resolution: d.resolution_minutes ? String(d.resolution_minutes) : '' })) }
}
export const cleanIvs = (ivs: Intervention[]) => ivs.map((i) => ({ type: i.type, at_minute: i.at_minute, params: i.params ?? {} }))
export function toBody(c: BuilderCfg, ivs: Intervention[] = []) {
  const resources: Record<string, number> = {}
  Object.entries(c.resources).forEach(([k, v]) => { if (v !== '') resources[k] = Number(v) })
  return { name: c.name || 'Custom scenario', scenario_id: c.scenario_id ?? undefined, duration_minutes: c.duration_minutes, resources, interventions: cleanIvs(ivs),
    disruptions: c.disruptions.map((d) => ({ type: d.type, severity: d.severity, target: d.target || undefined, start_minute: d.start_minute, resolution_minutes: d.resolution ? Number(d.resolution) : undefined })) }
}
export function bodyFromRun(config: SimConfig & { resources: Record<string, number> }, extra: Intervention[] = [], mutate?: (d: SimConfig['disruptions']) => SimConfig['disruptions']) {
  return { name: config.name, scenario_id: config.scenario_id ?? undefined, duration_minutes: config.duration_minutes, resources: config.resources,
    disruptions: (mutate ? mutate(config.disruptions) : config.disruptions).map((d) => ({ type: d.type, severity: d.severity, target: d.target, start_minute: d.start_minute, resolution_minutes: d.resolution_minutes ?? undefined })),
    interventions: cleanIvs([...config.interventions, ...extra]), recovery: config.recovery?.points_per_step ? { points_per_step: config.recovery.points_per_step } : undefined }
}

interface Props {
  cfg: BuilderCfg; setCfg: (c: BuilderCfg) => void; types: IncidentType[]; scenarios: ScenarioDef[]
  onRun: () => void; busy: boolean; error: Error | null; branchOf?: string | null; label: string; setLabel: (s: string) => void; onCancelBranch: () => void; keptInterventions: number
}

export default function ScenarioBuilder({ cfg, setCfg, types, scenarios, onRun, busy, error, branchOf, label, setLabel, onCancelBranch, keptInterventions }: Props) {
  const upd = (i: number, p: Partial<DisruptionForm>) => setCfg({ ...cfg, disruptions: cfg.disruptions.map((d, j) => (j === i ? { ...d, ...p } : d)) })
  const typeOf = (t: string) => types.find((x) => x.type === t)
  return (
    <div className="space-y-3 text-sm">
      {branchOf && <div className="rounded-xl bg-sky border border-mist p-2 text-xs">Branch mode: your changes run as a new branch. The original simulation is never modified.
        <input className="input mt-2" aria-label="Branch label" placeholder="Branch label, e.g. Generator unavailable" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="text-teal underline mt-1" onClick={onCancelBranch}>Cancel branch mode</button></div>}
      <div><label className="label" htmlFor="preset">Load scenario</label>
        <select id="preset" className="input" value="" onChange={(e) => { const s = scenarios.find((x) => x.id === e.target.value); if (s) setCfg({ ...cfgFromConfig(s.default_config), resources: cfg.resources }) }}>
          <option value="">Choose a predefined scenario…</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div><label className="label" htmlFor="nm">Scenario name</label><input id="nm" className="input" maxLength={80} value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></div>
      <div><label className="label" htmlFor="du">Simulation duration</label>
        <select id="du" className="input" value={cfg.duration_minutes} onChange={(e) => setCfg({ ...cfg, duration_minutes: Number(e.target.value) })}>{[30, 60, 90, 120, 180, 240].map((d) => <option key={d} value={d}>{d} minutes</option>)}</select></div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><span className="label !mb-0">Disruptions ({cfg.disruptions.length}/5)</span>
          <button className="btn-ghost !py-1 !px-2 text-xs" disabled={cfg.disruptions.length >= 5} onClick={() => setCfg({ ...cfg, disruptions: [...cfg.disruptions, { type: 'oxygen_supply_disruption', severity: 'high', target: '', start_minute: 10, resolution: '' }] })}><Plus size={12} />Add</button></div>
        {cfg.disruptions.map((d, i) => {
          const t = typeOf(d.type)
          return (
            <fieldset key={i} className="rounded-xl border border-[#E3E8E2] p-2 space-y-2"><legend className="px-1 text-xs text-navy/50">Disruption {i + 1}</legend>
              <select aria-label={`Incident type ${i + 1}`} className="input" value={d.type} onChange={(e) => upd(i, { type: e.target.value, target: '' })}>{types.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}</select>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label={`Severity ${i + 1}`} className="input" value={d.severity} onChange={(e) => upd(i, { severity: e.target.value as Severity })}>{(['moderate', 'high', 'critical'] as Severity[]).map((s) => <option key={s} value={s}>{SEV_LABEL[s]}</option>)}</select>
                <select aria-label={`Initial system ${i + 1}`} className="input" value={d.target} onChange={(e) => upd(i, { target: e.target.value })} disabled={(t?.allowed_targets.length ?? 0) < 2}>
                  <option value="">{t?.default_target ?? 'default'}</option>{t?.allowed_targets.filter((x) => x !== t.default_target).map((x) => <option key={x}>{x}</option>)}</select>
                <label className="text-xs">Starts at T+<input aria-label={`Start minute ${i + 1}`} type="number" min={0} step={5} className="input mt-1" value={d.start_minute} onChange={(e) => upd(i, { start_minute: Number(e.target.value) })} /></label>
                <label className="text-xs">Resolved after (min)<input aria-label={`Resolution ${i + 1}`} type="number" min={5} step={5} placeholder="never" className="input mt-1" value={d.resolution} onChange={(e) => upd(i, { resolution: e.target.value })} /></label>
              </div>
              {cfg.disruptions.length > 1 && <button className="text-xs text-crit flex items-center gap-1" onClick={() => setCfg({ ...cfg, disruptions: cfg.disruptions.filter((_, j) => j !== i) })}><Trash2 size={12} />Remove</button>}
            </fieldset>)
        })}
      </div>
      <details className="rounded-xl border border-[#E3E8E2] p-2"><summary className="cursor-pointer text-xs font-medium">Resource availability assumptions</summary>
        <div className="grid grid-cols-2 gap-2 mt-2">{POOLS.map((p) => (
          <label key={p} className="text-xs">{RES_LABEL(p)}<input type="number" min={0} className="input mt-1" placeholder="default" value={cfg.resources[p] ?? ''} onChange={(e) => setCfg({ ...cfg, resources: { ...cfg.resources, [p]: e.target.value } })} /></label>))}</div></details>
      {keptInterventions > 0 && <p className="text-xs text-navy/60">{keptInterventions} intervention(s) from the loaded run are kept.</p>}
      {error && <ErrorBox error={error} />}
      <button className="btn-primary w-full" disabled={busy} onClick={onRun}><Play size={14} />{busy ? 'Running simulation…' : branchOf ? 'Run as branch' : 'Run Simulation'}</button>
    </div>
  )
}
