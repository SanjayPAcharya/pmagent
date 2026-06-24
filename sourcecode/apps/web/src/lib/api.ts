import { keycloak } from './auth'

const API_URL = import.meta.env.VITE_API_URL as string

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Keep the access token fresh (refresh if it expires within 30s).
  await keycloak.updateToken(30).catch(() => undefined)

  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  let res = await doFetch()
  if (res.status === 401) {
    const refreshed = await keycloak.updateToken(-1).then(() => true).catch(() => false)
    if (refreshed) res = await doFetch()
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    throw new ApiError(res.status, err.error ?? 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Types (subset of the API responses) ──
export interface User { id: string; email: string; name: string; avatarUrl: string | null }
export interface Organization { id: string; name: string; slug: string; role?: string }
export interface Project { id: string; orgId: string; name: string; slug: string; description: string | null }
export interface Member {
  userId: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  email: string
  name: string
  avatarUrl: string | null
  initials: string
  joinedAt: string
}
export type OrgRole = 'ADMIN' | 'MEMBER'
export interface Invite {
  id: string
  token: string
  role: OrgRole
  email: string | null
  expiresAt: string
  url: string
}

export const api = {
  me: () => request<{ user: User }>('GET', '/api/me'),
  listOrgs: () => request<{ organizations: Organization[] }>('GET', '/api/orgs'),
  getOrg: (slug: string) => request<{ org: Organization }>('GET', `/api/orgs/${slug}`),
  createOrg: (name: string) => request<{ org: Organization }>('POST', '/api/orgs', { name }),
  listProjects: (orgId: string) =>
    request<{ projects: Project[] }>('GET', `/api/projects?orgId=${encodeURIComponent(orgId)}`),
  createProject: (orgId: string, name: string) =>
    request<{ project: Project }>('POST', '/api/projects', { orgId, name }),

  // Members & invites (Phase 2D)
  listMembers: (slug: string) => request<{ members: Member[] }>('GET', `/api/orgs/${slug}/members`),
  createInvite: (slug: string, body: { email?: string; role?: OrgRole }) =>
    request<{ invite: Invite }>('POST', `/api/orgs/${slug}/invites`, body),
  acceptInvite: (token: string) =>
    request<{ org: { id: string; slug: string; name: string }; role: string }>(
      'POST',
      `/api/invites/${encodeURIComponent(token)}/accept`,
    ),
}
