import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { keycloak, login } from '../lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Public route. Accepting requires a signed-in Keycloak user, so an unauthenticated
// visitor is sent through login and returned to this same /invite/:token URL.
export default function InviteAccept() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const started = useRef(false)

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: ({ org }) => navigate(`/orgs/${org.slug}`, { replace: true }),
  })

  // Auto-accept once the user is authenticated (StrictMode-safe via the ref guard).
  useEffect(() => {
    if (keycloak.authenticated && !started.current) {
      started.current = true
      accept.mutate()
    }
  }, [accept])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You’ve been invited to AgentPM</CardTitle>
          <CardDescription>
            {keycloak.authenticated
              ? 'Joining the organization…'
              : 'Sign in or create an account to accept this invitation.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!keycloak.authenticated && (
            <Button className="w-full" onClick={() => login()}>
              Sign in to accept
            </Button>
          )}
          {accept.isPending && <p className="text-sm text-muted-foreground">Accepting invitation…</p>}
          {accept.isError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{(accept.error as Error).message}</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/', { replace: true })}>
                Go to dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
