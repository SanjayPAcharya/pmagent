import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Shared destructive-action card: type the exact name to confirm, then delete.
// Used by org + project settings. The caller supplies the delete action.
interface Props {
  title: string
  description: string
  confirmLabel: string // the exact string the user must type (the name)
  confirmHint: string
  actionLabel: string
  onDelete: () => Promise<void>
}

export function DangerZone({ title, description, confirmLabel, confirmHint, actionLabel, onDelete }: Props) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const armed = typed.trim() === confirmLabel

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-destructive">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <div>
          <label className="text-xs text-muted-foreground">{confirmHint}</label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmLabel}
            className="mt-1"
            aria-label={confirmHint}
          />
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={!armed || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onDelete()
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
