import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../components/layout/Shell'
import { StatusBadge } from '../components/common/ui'
import { ApiError, api } from '../services/api'
import Simulations from '../pages/Simulations'

afterEach(() => vi.restoreAllMocks())

describe('PulseGrid UI', () => {
  it('sidebar links to all main pages', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    for (const [label, href] of [['Dashboard', '/dashboard'], ['Hospital Map', '/hospital-map'], ['Simulation Lab', '/simulation-lab'], ['Response Planner', '/response-planner'], ['History', '/history'], ['Settings', '/settings']])
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
  })
  it('status badge shows label', () => {
    render(<StatusBadge status="critical" />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })
  it('api reports a backend disconnection clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    await expect(api.dashboard()).rejects.toBeInstanceOf(ApiError)
    await expect(api.dashboard()).rejects.toThrow(/Cannot reach the PulseGrid backend/)
  })
  it('api surfaces validation details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: { message: 'Invalid configuration', details: [{ field: 'duration_minutes', message: 'bad' }] } }) }))
    await expect(api.runSimulation({})).rejects.toMatchObject({ status: 422, details: [{ field: 'duration_minutes' }] })
  })
  it('simulations page submits a run to the backend and shows errors', async () => {
    const scenario = { id: 'main_power_failure', name: 'Main Power Failure', short: 's', description: 'd', default_severity: 'high', severity_options: ['moderate', 'high', 'critical'],
      initial_failure_points: [{ id: 'main_power', name: 'Main Power Grid' }], potentially_affected: [], disruptions: [{ type: 'main_power_failure' }],
      default_config: { name: 'Main Power Failure', duration_minutes: 60, interventions: [], disruptions: [{ type: 'main_power_failure', severity: 'high', start_minute: 0 }] } }
    vi.spyOn(api, 'scenarios').mockResolvedValue([scenario] as any)
    vi.spyOn(api, 'incidentTypes').mockResolvedValue([{ type: 'main_power_failure', label: 'Main Power Failure', description: '', default_target: 'main_power', allowed_targets: ['main_power', 'power_dist'] }])
    vi.spyOn(api, 'getSettings').mockResolvedValue({ default_duration_minutes: 60 } as any)
    const run = vi.spyOn(api, 'runSimulation').mockRejectedValue(new ApiError('Invalid configuration', 422))
    render(<MemoryRouter initialEntries={['/simulations']}><Routes><Route path="/simulations" element={<Simulations />} /></Routes></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /run simulation/i }))
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid configuration')
  })
})
