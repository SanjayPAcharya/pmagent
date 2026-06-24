import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type OrgRole } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

function inviteLink(token: string) {
  return `${window.location.origin}/invite/${token}`
}

export default function Members() {
  const { slug = '' } = useParams()
  const qc = useQueryClient()
  const members = useQuery({ queryKey: ['members', slug], queryFn: () => api.listMembers(slug) })
  const invites = useQuery({ queryKey: ['invites', slug], queryFn: () => api.listInvites(slug) })
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [email, setEmail] = useState('')
  const [addRole, setAddRole] = useState<OrgRole>('MEMBER')

  const refreshInvites = () => qc.invalidateQueries({ queryKey: ['invites', slug] })

  const create = async () => {
    try {
      const { invite } = await api.createInvite(slug, { role })
      await navigator.clipboard.writeText(invite.url ?? inviteLink(invite.token)).catch(() => undefined)
      toast.success('Invite link created and copied to clipboard')
      refreshInvites()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const revoke = async (id: string) => {
    try {
      await api.revokeInvite(slug, id)
      refreshInvites()
      toast.success('Invite revoked')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const copy = async (token: string) => {
    await navigator.clipboard.writeText(inviteLink(token)).catch(() => undefined)
    toast.success('Link copied')
  }
  const addByEmail = async () => {
    const e = email.trim()
    if (!e) return
    try {
      await api.addMember(slug, e, addRole)
      setEmail('')
      qc.invalidateQueries({ queryKey: ['members', slug] })
      toast.success('Member added')
    } catch (err) {
      toast.error((err as Error).message) // e.g. "No user with that email has signed up yet."
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={`/orgs/${slug}`} className="text-sm text-muted-foreground hover:underline">
          ← projects
        </Link>
        <h2 className="text-xl font-semibold text-foreground">Members &amp; invites</h2>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add an existing user by email</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addByEmail()}
            placeholder="teammate@company.com"
            className="max-w-xs"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as OrgRole)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button onClick={addByEmail} disabled={!email.trim()}>
            Add member
          </Button>
          <span className="text-xs text-muted-foreground">They must have signed up already.</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Invite a teammate (link)</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button onClick={create}>Create invite link</Button>
          <span className="text-xs text-muted-foreground">Link is copied to your clipboard — share it with anyone to join.</span>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Members</h3>
        <ul className="divide-y rounded-lg border">
          {members.data?.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                  <AvatarFallback>{m.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium text-foreground">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
              </div>
              <Badge variant="secondary">{m.role}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Pending invites</h3>
        <ul className="divide-y rounded-lg border">
          {invites.data?.invites.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between px-4 py-3">
              <div className="text-sm">
                <span className="font-medium text-foreground">{inv.email ?? 'Anyone with the link'}</span>{' '}
                <Badge variant="secondary" className="ml-1">{inv.role}</Badge>
                <div className="text-xs text-muted-foreground">expires {new Date(inv.expiresAt).toLocaleDateString()}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(inv.token)}>
                  Copy link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => revoke(inv.id)}>
                  Revoke
                </Button>
              </div>
            </li>
          ))}
          {invites.data?.invites.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No pending invites.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
