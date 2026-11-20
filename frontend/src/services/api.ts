import type { Comparison, Dashboard, HospitalModel, IncidentType, InterventionDef, Plan, ScenarioDef, Settings, SimConfig, SimResult, SimSummary } from '../types'

const BASE: string = (import.meta as any).env?.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  status: number
  details: { field: string; message: string }[]
  constructor(message: string, status = 0, details: { field: string; message: string }[] = []) {
    super(message); this.status = status; this.details = details
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  } catch {
    throw new ApiError('Cannot reach the PulseGrid backend. Make sure it is running on port 8000.')
  }
  if (res.status === 204) return undefined as T
  let body: any = null
  try { body = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body?.error?.details ?? [])
  return body as T
}
const post = <T,>(p: string, b: unknown) => req<T>(p, { method: 'POST', body: JSON.stringify(b) })

export const api = {
  model: () => req<HospitalModel>('/hospital/model'),
  dashboard: () => req<Dashboard>('/dashboard/summary'),
  scenarios: () => req<ScenarioDef[]>('/scenarios'),
  incidentTypes: () => req<IncidentType[]>('/incident-types'),
  interventions: () => req<InterventionDef[]>('/interventions'),
  runSimulation: (cfg: Partial<SimConfig> & { parent_id?: string; branch_label?: string }) => post<SimResult>('/simulations', cfg),
  listSimulations: (p: Record<string, string> = {}) => req<SimSummary[]>('/simulations?' + new URLSearchParams(p).toString()),
  getSimulation: (id: string) => req<SimResult>(`/simulations/${id}`),
  clearHistory: () => req<void>('/simulations?confirm=true', { method: 'DELETE' }),
  createPlan: (simulation_id: string) => post<Plan>('/response-plans', { simulation_id }),
  compare: (simulation_ids: string[]) => post<Comparison>('/comparisons', { simulation_ids }),
  getSettings: () => req<Settings>('/settings'),
  putSettings: (s: Partial<Settings>) => req<Settings>('/settings', { method: 'PUT', body: JSON.stringify(s) }),
  resetDemo: () => post<{ status: string }>('/demo/reset', {}),
  clearIncident: () => post<{ status: string }>('/demo/clear-incident', {}),
}
