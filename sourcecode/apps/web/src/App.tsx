import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { keycloak } from './lib/auth'
import Landing from './pages/Landing'
import Layout from './pages/Layout'
import Dashboard from './pages/Dashboard'
import OrgProjects from './pages/OrgProjects'

export default function App() {
  // Auth gate: unauthenticated users get the landing page (which redirects to
  // Keycloak's hosted login/registration). keycloak is initialized in main.tsx.
  if (!keycloak.authenticated) return <Landing />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orgs/:slug" element={<OrgProjects />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
