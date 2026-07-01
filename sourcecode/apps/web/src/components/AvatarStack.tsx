import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface StackUser {
  name: string
  avatarUrl?: string | null
  initials?: string
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return (letters || '?').toUpperCase()
}

// Overlapping avatars with a +N overflow chip. Sized via `size` (Tailwind h/w).
export function AvatarStack({
  users,
  max = 4,
  size = 'h-6 w-6',
  className,
}: {
  users: StackUser[]
  max?: number
  size?: string
  className?: string
}) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length

  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((u, i) => (
        <Avatar key={i} className={cn(size, 'border-2 border-background', i > 0 && '-ml-2')} title={u.name}>
          {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
          <AvatarFallback className="text-[10px]">{u.initials ?? initialsFrom(u.name)}</AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <span
          className={cn(
            size,
            '-ml-2 flex items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground',
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
