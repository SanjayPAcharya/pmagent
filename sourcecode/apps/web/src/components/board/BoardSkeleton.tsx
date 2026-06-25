import { BOARD_COLUMNS, STATUS_LABEL } from '@/lib/board'
import { Skeleton } from '@/components/ui/skeleton'

// G3 — column/card-shaped shimmer that mirrors the real board layout, instead of
// generic blocks, so the loading state doesn't jump on hydration.
export function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden pb-4" aria-hidden>
      {BOARD_COLUMNS.map((s, ci) => (
        <div key={s} className="flex w-[85vw] shrink-0 flex-col sm:w-72">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-sm font-semibold text-muted-foreground/60">{STATUS_LABEL[s]}</span>
            <Skeleton className="h-4 w-5 rounded-full" />
          </div>
          <div className="flex flex-1 flex-col gap-2 rounded-xl bg-muted/40 p-2">
            {/* a different number of cards per column reads as more natural */}
            {Array.from({ length: ((ci * 2) % 3) + 1 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 shadow-sm">
                <Skeleton className="h-4 w-3/4" />
                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-4 w-12 rounded" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
