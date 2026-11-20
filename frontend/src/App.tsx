import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/layout/Shell'
import Dashboard from './pages/Dashboard'
import HospitalMap from './pages/HospitalMap'
import Simulations from './pages/Simulations'
import SimulationLab from './pages/SimulationLab'
import SimulationResults from './pages/SimulationResults'
import ResponsePlanner from './pages/ResponsePlanner'
import Scenarios from './pages/Scenarios'
import ScenarioComparison from './pages/ScenarioComparison'
import History from './pages/History'
import SettingsPage from './pages/Settings'
import { api } from './services/api'

export default function App() {
  useEffect(() => {
    api.getSettings().then((s) => {
      document.body.classList.toggle('theme-light', s.display.theme === 'light')
      document.body.classList.toggle('compact', s.display.compact_tables)
    }).catch(() => {})
  }, [])
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/hospital-map" element={<HospitalMap />} />
        <Route path="/simulation-lab" element={<SimulationLab />} />
        <Route path="/simulations" element={<Simulations />} />
        <Route path="/simulations/:id" element={<SimulationResults />} />
        <Route path="/response-planner" element={<ResponsePlanner />} />
        <Route path="/scenarios" element={<Scenarios />} />
        <Route path="/scenario-comparison" element={<ScenarioComparison />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
