import * as React from 'react'

// Inline field validation message — the red-text counterpart to the muted
// hint idiom (`text-xs text-muted-foreground`). Renders nothing when empty so
// callers can pass a conditional expression directly.
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {children}
    </p>
  )
}
