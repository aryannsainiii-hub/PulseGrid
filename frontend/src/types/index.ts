export type Status = 'healthy' | 'at_risk' | 'critical'
export type Severity = 'moderate' | 'high' | 'critical'

export interface ModelNode {
  id: string; name: string; category: 'infrastructure' | 'department'; criticality: number
  minimum_operating_capacity: number; at_risk_threshold: number; buffer_minutes: number; demand: number
  description: string; layout: [number, number]
}
export interface ModelEdge { source: string; target: string; dependency_type: string; dependency_strength: number; description: string }
export interface HospitalModel { nodes: ModelNode[]; edges: ModelEdge[]; resources: Record<string, { label: string; available: number; unit: string }>; disclaimer: string }

export interface Cause { source: string; dependency_type: string; strength: number; supply: number; loss: number }
export interface NodeState {
  capacity: number; output: number; own_health: number; status: Status; on_buffer: boolean; shed: boolean
  demand: number; served_demand: number; causes: Cause[]; recovery_state: 'normal' | 'degraded' | 'recovering' | 'recovered'
}
export interface SimEvent { minute: number; node: string | null; kind: string; text: string }
export interface Snapshot {
  minute: number; impact_score: number; counts: Record<Status, number>; nodes: Record<string, NodeState>; events: SimEvent[]
  active_interventions: string[]; resources_committed: Record<string, number>
  backup: { active: boolean; fuel_used_hours: number; fuel_remaining_pct: number }
}
export interface Disruption { type: string; severity: Severity; target?: string; start_minute: number; resolution_minutes?: number | null }
export interface Intervention { type: string; label?: string; at_minute: number; params?: Record<string, any>; effective_minute?: number }
export interface SimConfig {
  name: string; scenario_id?: string | null; duration_minutes: number; disruptions: Disruption[]
  resources?: Record<string, number>; interventions: Intervention[]; recovery?: { points_per_step?: number | null }
}
export interface NodeImpact {
  node_id: string; name: string; category: string; criticality: number; peak_status: Status; final_status: Status
  min_capacity: number; final_capacity: number; first_impact_minute: number | null; critical_minutes: number
  direct_incident: boolean; reason: string; normal_from_minute: number | null
  history: { minute: number; capacity: number; status: Status; on_buffer: boolean; recovery_state: string }[]
}
export interface Strategy {
  key: string; name: string; title: string; summary: string; feasible: boolean; rank: number | null; score: number
  hard_violations: { resource: string; required: number; available: number }[]; estimated_recovery_minutes: number | null
  components: Record<string, number>
  metrics: { service_coverage: number; affected_systems: number; resource_use_pct: number; resources_used: Record<string, number>
    remaining_resources: Record<string, number>; generator_fuel_remaining_pct: number; stabilise_minute: number | null; service_violations: string[] }
  interventions: Intervention[]
}
export interface Plan {
  id: string; simulation_id: string; best_strategy: string | null; strategies: Strategy[]; explanation: string; tradeoffs: { key: string; text: string }[]
  limitations: string[]; disclaimer: string; formula: string; weights: Record<string, number>; horizon_minutes: number
  response_start_minute: number; reference: { label: string; metrics: Strategy['metrics'] }
}
export interface SimResult {
  id: string; name: string; created_at: string; parent_id: string | null; branch_label: string | null; best_strategy: string | null
  config: SimConfig & { resources: Record<string, number> }
  summary: { overall_impact: number; peak_minute: number; final_impact: number; affected_count: number; affected_departments: number
    total_systems: number; unaffected_count: number; cascade_depth: number; severity: Severity; duration_minutes: number
    initial_failure: { node_id: string; name: string; type: string }; severity_distribution: Record<Status, number>; final_counts: Record<Status, number> }
  timeline: Snapshot[]
  cascade_path: { source: string; target: string; minute: number; dependency_type: string; loss: number; depth: number; label: string }[]
  node_impacts: NodeImpact[]
  explanation: { headline: string; what_failed_first: string[]; affected_systems: string[]; why: string[]
    dependencies_responsible: { edge: string; dependency_type: string; minute: number; loss: number }[]; remain_operational: string[]; critical_systems: string[]; note: string }
  resources: { pools: Record<string, { label: string; unit: string; available: number; used: number; remaining: number }>; generator: { fuel_hours: number; used_hours: number; remaining_pct: number } }
  recovery: { enabled: boolean; systems_still_affected: string[]; systems_recovering: string[]; systems_returned_to_normal: string[]; estimated_full_recovery_minute: number | null; note: string }
  interventions: (Intervention & { cost: Record<string, number>; before: any; after: any; changes: { node: string; from_status: Status; to_status: Status; from_capacity: number; to_capacity: number }[] })[]
  counterfactual: { peak_impact_without: number; peak_impact_with: number; final_impact_without: number; final_impact_with: number; improved: string[]; worsened: string[] } | null
  assumptions: string[]; limitations: string[]; plan: Plan | null
}
export interface SimSummary { id: string; name: string; scenario_id: string | null; created_at: string; parent_id: string | null; branch_label: string | null
  severity: Severity; overall_impact: number; affected_count: number; best_strategy: string | null }
export interface ScenarioDef { id: string; name: string; short: string; description: string; default_severity: Severity; severity_options: Severity[]
  initial_failure_points: { id: string; name: string }[]; potentially_affected: { id: string; name: string }[]; default_config: SimConfig; disruptions: { type: string }[] }
export interface IncidentType { type: string; label: string; description: string; default_target: string; allowed_targets: string[] }
export interface InterventionDef { type: string; label: string; description: string; delay_minutes: number; cost: Record<string, number>; params: Record<string, any> }
export interface Dashboard { synthetic: boolean; active_simulation: { id: string; name: string } | null
  kpis: { total_systems: number; operational_systems: number; affected_departments: number; total_departments: number; active_incidents: number; backup_capacity_pct: number }
  systems: { id: string; name: string; category: string; status: Status; capacity: number }[]; recent_simulations: SimSummary[] }
export interface Settings { default_duration_minutes: number; max_recovery_minutes: number; response_start_minute: number
  weights: { coverage: number; resources: number; recovery: number; violations: number }; display: { theme: 'warm' | 'light'; compact_tables: boolean } }
export interface Comparison { runs: any[]; impact_series: Record<string, number | null>[]; nodes: { node_id: string; name: string; category: string; differs: boolean; values: Record<string, { final_status: Status; peak_status: Status; final_capacity: number; first_impact_minute: number | null }> }[]
  config_diffs: { id: string; vs: string; changes: { field: string; base: any; other: any }[] }[]; explanation: string[] }
