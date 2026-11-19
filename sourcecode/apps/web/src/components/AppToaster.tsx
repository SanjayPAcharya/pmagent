import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { onSessionExpired } from '@/lib/auth'

// The app's toast area. 3.8.8: once the session has ended, the session-expired
// prompt is the one message that matters. A failed save's raw "Unauthorized"
// toast would only add noise behind it, so toasts switch off for the rest of the
// page's life ("Log in again" reloads the page).
export function AppToaster() {
  const [expired, setExpired] = useState(false)
  useEffect(() => onSessionExpired(() => setExpired(true)), [])
  return expired ? null : <Toaster richColors position="bottom-right" theme="system" />
}
