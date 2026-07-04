import type { AutomationSettings } from '@/lib/api'

// Resolved per-project automation toggles. Defaults mirror the server
// (tickets.service.ts automationSettings): unblockNudge on, the rest off.
export function resolveAutomation(raw?: AutomationSettings | null): Required<AutomationSettings> {
  const o = raw ?? {}
  return {
    unblockNudge: o.unblockNudge !== false,
    autoTodoOnAssign: o.autoTodoOnAssign === true,
    subtasksDoneNudge: o.subtasksDoneNudge === true,
  }
}
