// Types shared across api + web. Filled out as Phase 1+ progresses.

export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface ApiError {
  error: string
  code?: string
}
