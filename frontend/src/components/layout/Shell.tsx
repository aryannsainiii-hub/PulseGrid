import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Activity, Bell, FlaskConical, GitCompare, History, LayoutDashboard, Map, Menu, Settings, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { Logo } from '../common/ui'
import { useAsync } from '../../hooks/useAsync'
import { api } from '../../services/api'

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/hospital-map', label: 'Hospital Map', icon: Map },
  { to: '/simulation-lab', label: 'Simulation Lab', icon: FlaskConical },
  { to: '/simulations', label: 'Simulations', icon: Zap },
  { to: '/response-planner', label: 'Response Planner', icon: ShieldCheck },
  { to: '/scenarios', label: 'Scenario Library', icon: Sparkles },
  { to: '/scenario-comparison', label: 'Comparison', icon: GitCompare },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col bg-white border-r border-[#E3E8E2] p-4 w-60">
      <Link to="/dashboard" className="flex items-center gap-2 mb-6" onClick={onNavigate}>
        <Logo />
        <div><div className="font-semibold leading-tight">PulseGrid</div><div className="text-[10px] text-navy/50 leading-tight">Keeping Critical Care Connected</div></div>
      </Link>
      <ul className="space-y-1 flex-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} onClick={onNavigate}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive ? 'bg-teal text-white' : 'text-navy/80 hover:bg-mint'}`}>
              <Icon size={16} />{label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-mint p-3 text-xs text-navy/70"><b className="text-teal">Demo Environment</b><br />Synthetic data only. Not a real hospital.</div>
    </nav>
  )
}

function Bell_() {
  const [open, setOpen] = useState(false)
  const { data } = useAsync(() => api.dashboard(), [open])
  const active = data?.active_simulation
  return (
    <div className="relative">
      <button className="btn-ghost !p-2" aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell size={16} />{active && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-crit" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 card p-3 z-40 text-sm">
          <div className="font-semibold mb-1">Notifications</div>
          {active ? (<>
            <p className="text-navy/70">Simulated incident shown on the dashboard: <b>{active.name}</b> ({data!.kpis.active_incidents} active).</p>
            <Link className="text-teal text-xs underline" to={`/simulations/${active.id}`} onClick={() => setOpen(false)}>Open results</Link>
          </>) : <p className="text-navy/60">No active simulated incidents.</p>}
        </div>
      )}
    </div>
  )
}

export default function Shell() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:block sticky top-0 h-screen"><Sidebar /></aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden flex"><div className="h-full"><Sidebar onNavigate={() => setOpen(false)} /></div><button aria-label="Close menu" className="flex-1 bg-navy/30" onClick={() => setOpen(false)} /></div>}
      <div className="flex-1 min-w-0">
        <header className="flex items-center justify-between gap-3 px-4 lg:px-8 py-3 border-b border-[#E3E8E2] bg-ivory/80 backdrop-blur sticky top-0 z-30">
          <button className="btn-ghost !p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={16} /></button>
          <div className="hidden lg:flex items-center gap-2 text-xs text-navy/60"><Activity size={14} className="text-teal" />AI-Powered Hospital Resilience &amp; Emergency Decision Support</div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="rounded-full bg-sage text-teal px-3 py-1 text-xs font-medium">Demo Environment</span>
            <Bell_ />
            <Link to="/settings" className="btn-ghost !p-2" aria-label="Settings"><Settings size={16} /></Link>
          </div>
        </header>
        <main className="p-4 lg:p-8 max-w-[1500px]"><Outlet /></main>
      </div>
    </div>
  )
}
