import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { keycloak } from './lib/auth'
import Landing from './pages/Landing'
import Layout from './pages/Layout'
import Dashboard from './pages/Dashboard'
import OrgProjects from './pages/OrgProjects'
import Board from './pages/Board'
import ProjectList from './pages/ProjectList'
import Sprints from './pages/Sprints'
import Members from './pages/Members'
import InviteAccept from './pages/InviteAccept'

// Public routes render regardless of auth; gated routes sit behind RequireAuth.
// keycloak is initialized in main.tsx before the app mounts.
function RequireAuth() {
  if (!keycloak.authenticated) return <Landing />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: an invitee may not have an account yet. */}
        <Route path="/invite/:token" element={<InviteAccept />} />

        {/* Gated app. */}
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orgs/:slug" element={<OrgProjects />} />
            <Route path="/orgs/:slug/members" element={<Members />} />
            <Route path="/orgs/:slug/projects/:projectSlug" element={<Board />} />
            <Route path="/orgs/:slug/projects/:projectSlug/ticket/:number" element={<Board />} />
            <Route path="/orgs/:slug/projects/:projectSlug/list" element={<ProjectList />} />
            <Route path="/orgs/:slug/projects/:projectSlug/list/ticket/:number" element={<ProjectList />} />
            <Route path="/orgs/:slug/projects/:projectSlug/sprints" element={<Sprints />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
