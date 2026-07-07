# Phase 3.7.2 — UI/UX polish (from the 2026-07-06 UX audit)

> **Status: 📋 OPEN** (specced 2026-07-06 — P0 doc landing now; P1–P6 pending). Source: a full UX audit of the web app on 2026-07-06, right after Phase 3.7.1 closed. Verdict: **the frontend is genuinely user-friendly** — mature token-driven design system (shadcn-style + Tailwind HSL tokens, dark mode, per-org accents), a strong keyboard story (⌘K palette, shortcuts, keyboard board-drag), thoughtful interactions (quick-create tokens, undo toasts, optimistic updates, live presence), consistent skeletons, Radix a11y primitives. The steps below are the polish fine-print: inline validation, empty-state consistency, one tokenization defect, busy feedback, confirm hardening, focus rings. **No redesign** — the owner explicitly wants PMAgent to keep its own identity, not chase Jira/Monday patterns. Every step strengthens the existing inline/keyboard-first character.
>
> **This doc is written to be self-contained**: each step names the exact files, line-anchors, code shapes, i18n keys, tests, and done-criteria, so anyone (or any model) can pick up the next unticked step with no other context. When an instruction says "copy the idiom at X", open X first and mirror it — do not invent a new pattern.

## What the audit confirmed sound (do NOT re-fix)

Two suspected gaps turned out **already solved** — do not re-implement them:

- **Slash-command discoverability**: the drawer comment box placeholder already says "@ to mention, / for commands" (`drawer.commentPlaceholder`), and a filtering suggestion popover already renders while the comment matches `^\/(\w*)$` (`TicketDrawer.tsx:242–243`, rendered ~819–836 with command + args hint, click-to-insert). Shipped in 3.2 C3.
- **List column-width persistence**: `ProjectList.tsx:154` keeps widths in `useLocalStorageState('agentpm-list-colwidths', DEFAULT_WIDTHS)` and the resize mousemove writes through it — widths survive reload. (Visibility is `agentpm-list-columns`, line 153. Both are deliberately **global**, not per-project.)

Also sound: theme system + org accent injection (`lib/theme.ts`, `lib/accent.ts`) · loading skeletons everywhere · toast + undo patterns · aria labelling on icon buttons/checkboxes/toggles · the inline two-click confirm pattern (blessed in 3.7.1 F2).

## Gaps found → steps

| # | Gap | Why it matters | Step |
|---|---|---|---|
| 1 | **No inline field validation anywhere** — inputs never show error text or a red border; failures surface only as a toast (drawer date `DATE_RANGE` 400) or a silently disabled Save (Account name) | Users can't tell *what* is wrong or *where*; a disabled button with no explanation is a dead end | P1 |
| 2 | Empty states use four different idioms — Dashboard/OrgProjects/Gantt use a bordered card, List a table row, MyWork a bare `<li>`, Sprints a bare `<p>` | Empty states are the first thing every new user sees; inconsistency reads as unfinished | P2 |
| 3 | The blocked badge hardcodes `bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300` in **four** places + a fifth divergent red idiom in Overview, instead of the `--destructive` token; root cause: dark `--destructive` is too dark to use as text | Copy-pasted colors drift (already have — Overview differs) and ignore theming; the token itself needs the fix | P3 |
| 4 | **Zero busy feedback on async buttons** — `Loader2`/`animate-spin` appear nowhere in `src/`; DangerZone swaps to "Loading…" text; Account/Project/Org settings Save handlers have **no busy state at all** (double-click double-fires) | Slow networks make the app feel dead; double-submit is a real bug | P4 |
| 5 | Bulk archive's two-click confirm (the blessed pattern) is missing the details: no count in the label ("Confirm?" for 40 tickets), no timed reset, no busy state | Archiving is the riskiest bulk action; the confirm should say what it's about to do | P5 |
| 6 | No global `:focus-visible` rule — Button/Input/Textarea manage their own rings, but raw `<button>`s (card hover controls, reaction chips, slash/mention suggestion items, theme buttons) have **no keyboard focus indicator** | The app's keyboard story is its pride; invisible focus breaks it exactly for keyboard users | P6 |

---

## How to work this phase (conventions — read once)

- Repo layout: pnpm workspace root is `sourcecode/`; web = `sourcecode/apps/web` (React 18 + Vite + Tailwind + shadcn-style `components/ui/*` + @tanstack/react-query + react-router v6 + i18next; unit tests colocated under vitest+jsdom). **There is no `components/ui/dialog.tsx`** — the primitives are avatar/badge/button/card/command/dropdown-menu/input/label/sheet/skeleton/tabs/textarea. Use inline editing or a dropdown, never invent a modal.
- **This phase touches zero API code.** No schema, no routes, no `docker compose restart api`. If you think a step needs an API change, stop and re-read the step.
- **One step = one local commit** that also updates: this doc (tick the checkbox), `PROGRESS.md` (Now/Next + a log row), `FEATURES.md` (only P1/P2 — the rest are invisible-when-right polish), and `sourcecode/apps/web/src/locales/en.json` for any new UI string (never hardcode English in components — always `t('…')`).
- **Never `git push`** unless the owner asks.
- Test commands (baselines at phase open, all green): `pnpm --filter @agentpm/api test` (**77** — must stay 77, nothing here touches the API), `pnpm --filter @agentpm/web test` (**31**; becomes **32** after P2), `pnpm --filter @agentpm/web typecheck`, `pnpm --filter @agentpm/web exec vite build`.
- Web conventions: persistent UI prefs via `useLocalStorageState` (`src/lib/useLocalStorage.ts`); toasts via `sonner`; icons via lucide-react sized `h-3 w-3` / `h-4 w-4`.
- Browser verification: drive the running dev stack at `http://localhost:3000` (a Chrome session is usually already signed in as the owner). Test data lives in the owner's real org (`Oracle` → project `Relationship Manager`, key RELA) — restore anything you change; ask before deleting anything you didn't create. **P3 changes a global dark-mode token — its verify step includes re-checking every destructive surface in dark mode.**

---

## Steps (tick as they land)

### - [x] P0 — Phase doc (XS) *(done 2026-07-06)*
This file + `agentpm-plan/README.md` index row + `PROGRESS.md` Now/Next/log.

---

### - [x] P1 — Inline field validation pattern (M) *(done 2026-07-07)*

**Goal:** a reusable "red border + message under the field" idiom — `aria-invalid` on the input + a tiny `FieldError` component — applied to the two audited offenders: Account-settings name, drawer Start/Due range. No form library; the idiom **is** the ceiling (see out of scope).

**1. `sourcecode/apps/web/src/components/ui/input.tsx`** — line 9 is the single base class string. Append: `aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive`. Do the same in **`ui/textarea.tsx`** (line 9). Callers opt in with `aria-invalid={Boolean(error)}` — no API change, zero effect on existing call sites (nothing sets `aria-invalid` today). *(Note: `aria-invalid` is NOT one of Tailwind 3.4's default `aria-*` variants — only busy/checked/disabled/expanded/hidden/pressed/readonly/required/selected are — so the bare `aria-invalid:` variant compiles to nothing. Use the arbitrary-variant form `aria-[invalid=true]:`, which needs no config change and matches React's `aria-invalid="true"`. Verified present in the built CSS.)*

**2. New `sourcecode/apps/web/src/components/ui/field-error.tsx`** (~8 lines), mirroring the muted-hint idiom at `AccountSettings.tsx:90` (`<p className="mt-1 text-xs text-muted-foreground">`):
```tsx
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <p role="alert" className="mt-1 text-xs text-destructive">{children}</p>
}
```

**3. `sourcecode/apps/web/src/pages/AccountSettings.tsx`** — the name field (lines 78–81): add `aria-invalid={Boolean(user) && !name.trim()}` to the Input and `<FieldError>{user && !name.trim() ? t('account.nameRequired') : null}</FieldError>` under it. The Save button (line 97) keeps its existing disable — now the user can see *why*.

**4. `sourcecode/apps/web/src/components/TicketDrawer.tsx`** — the Start/Due blocks (lines 538–561, uncontrolled `Input type="date"` with `onBlur` → `patch(...)`). Add `const [dateError, setDateError] = useState<'start' | 'due' | null>(null)`. In each `onBlur`, **before** calling `patch`: compare the entered value against the ticket's other date (both ISO strings — compare `slice(0, 10)`); if start > due, `setDateError('start')` (or `'due'` for the Due field) and **do not patch** — the server's `DATE_RANGE` 400 (3.7 R1) stays as backstop only; otherwise clear the error and patch as today. Wire `aria-invalid={dateError === 'start'}` (resp. `'due'`) and a `<FieldError>` showing `t('drawer.dateRangeError')` under the offending field.

**i18n:** `account.nameRequired` = `"Name is required."` · `drawer.dateRangeError` = `"Start must be on or before the due date."` (mirrors the server's DATE_RANGE message).

**Verify (browser):** `/account` → clear the name → red border + message, Save disabled; retype → both clear. Drawer on a throwaway RELA ticket: set Start after Due → inline red + message, **no network call, no toast**; fix the date → saves normally. Restore the ticket's original dates.

**Done when:** verification passes; web typecheck + vite build green; api 77/77 · web 31/31 unchanged (pure UI); FEATURES.md gains one sentence (forms flag invalid input in place).

---

### - [x] P2 — Shared `EmptyState` component (S) *(done 2026-07-07)*

**Goal:** one empty-state idiom — muted lucide icon + message + optional CTA slot — replacing the four divergent renderings. lucide icons only, no illustrations (identity constraint).

**1. New `sourcecode/apps/web/src/components/EmptyState.tsx`**, mirroring the strongest existing idiom (Dashboard's bordered card, `Dashboard.tsx:83–87`: `rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground`):
```tsx
export function EmptyState({ icon: Icon, message, cta, className }: {
  icon: LucideIcon; message: string; cta?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-10 text-center', className)}>
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}
```
`className` exists so table/list contexts can pass `border-0 bg-transparent py-6` (bare variant).

**2. Migrate the six call sites** (all reuse their **existing** i18n keys — no new copy; no CTAs needed, each page's create form sits directly above and the existing copy already points at it):
- `Dashboard.tsx` ~83–87 — `dashboard.empty`, icon `Building2`
- `OrgProjects.tsx` ~243–246 — `projects.empty`, icon `FolderKanban`
- `Sprints.tsx:411` — replace the bare `<p>` — `sprints.empty`, icon `Rocket`
- `ProjectGantt.tsx:199` — `gantt.empty`, icon `CalendarRange`
- `ProjectList.tsx:397–403` — inside the existing `<td colSpan={shownCols.length}>`, bare variant — `list.empty` / `list.emptyFiltered`, icons `Inbox` / `Filter`
- `MyWork.tsx:71` — inside the `<li>`, bare variant — `mywork.emptyAssigned` / `mywork.emptyWatching`, icons `Inbox` / `Eye`

**3. Test — new `src/components/EmptyState.test.tsx`** (vitest + jsdom; mirror the setup of the existing colocated tests, e.g. `CsvTools.test.tsx`): renders icon + message; renders `cta` when given; applies `className`. → **web 31 → 32**.

**Verify (browser):** a throwaway empty project → Sprints, Timeline, List each show the icon card; List with an impossible filter shows the bare `emptyFiltered` row; `/my-work` sections; check light **and** dark.

**Done when:** all six call sites migrated (grep shows no leftover bare empty `<p>`); web 32/32; typecheck + build green; FEATURES.md "last updated" refreshed.

---

### - [x] P3 — Blocked badge → `--destructive` token + shared component (S) *(done 2026-07-07)*

**Goal:** kill the copy-pasted hardcoded-red badge; one `BlockedBadge` on the destructive token. Includes the root-cause token fix.

**1. `sourcecode/apps/web/src/index.css:45`** — dark `--destructive: 0 62.8% 30.6%` is too dark to read as *text* on a dark background (that's why every badge hand-rolls `dark:text-red-300`). Brighten to `--destructive: 0 72% 51%` (keep `--destructive-foreground` white). This also fixes the currently muddy dark-mode destructive buttons — **must browser-verify** those surfaces (step 4).

**2. New `sourcecode/apps/web/src/components/BlockedBadge.tsx`** (shape merges the five variants; `bg-destructive/10 text-destructive` matches the Overview idiom, tokenized):
```tsx
export function BlockedBadge({ count, showIcon = true, title }: { count?: number; showIcon?: boolean; title?: string }) {
  const { t } = useTranslation()
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
      {showIcon && <Ban className="h-3 w-3" />}
      {count !== undefined ? count : t('list.blocked')}
    </span>
  )
}
```

**3. Replace the five call sites** (keep each site's existing `title`/tooltip props; standardizing every shape on the pill is fine):
- `components/board/TicketCard.tsx:57–64` (keep `title={t('list.blockedHint', …)}`)
- `pages/ProjectList.tsx:201–206`
- `pages/MyWork.tsx:43–47`
- `components/TicketDrawer.tsx:734–738` (collapsed Relationships header — `showIcon={false}` to match current; passed `className="ml-auto"` since the shared component has no `ml-auto`). *(Note found during verify: this badge is **dormant** — its `(ticket.blockedBy ?? 0) > 0` guard never fires because `api.getTicket` doesn't return a blocker count, so the header badge doesn't render even for a genuinely-blocked ticket. Pre-existing, not introduced here; the swap preserves the guard verbatim. Tracked as a separate follow-up (needs an API-side count).)*
- `pages/ProjectOverview.tsx:258–263` (the divergent `bg-red-500/10 text-red-500` one — `count={b.openBlockerCount}`)

**4. Deliberately untouched:** the amber/orange priority classes (`lib/board.ts:39–43`), stale-border ambers (`lib/time.ts:35–37`), green success accents (ReadinessRing, checklists), sprint-capacity amber/emerald — semantic status colors with no token; see out of scope.

**i18n:** none new (reuses `list.blocked`, `list.blockedHint`).

**Verify (browser):** create a temporary blocks-relation on a throwaway ticket → badge renders on the Board card, List title cell, My Work row, drawer collapsed Relationships header, Overview blockers card — light **and** dark. Then the token check in dark mode: DangerZone card/button, drawer Delete, BulkBar armed confirm — readable, not muddy. Remove the relation afterwards.

**Done when:** `grep -rn "bg-red-100" sourcecode/apps/web/src/` returns nothing; verification passes; typecheck + build green.

---

### - [x] P4 — Spinner-in-button busy feedback (S) *(done 2026-07-07)*

**Goal:** the first `Loader2` in the codebase, applied to the four worst async buttons. Also kills the double-submit bug on the three Save handlers.

**Pattern** (Button base already has `gap-2`, `ui/button.tsx:7`): `{busy && <Loader2 className="h-4 w-4 animate-spin" />}` before the label, plus `disabled={busy}`.

1. **`components/DangerZone.tsx:41–55`** — a `busy` state already exists; replace `{busy ? t('common.loading') : actionLabel}` with spinner + `actionLabel`.
2. **`pages/AccountSettings.tsx`** — `save` (lines 42–54) has **no busy state**: add `const [busy, setBusy] = useState(false)` set in a try/finally around the await; spinner + `disabled={busy || …existing}` on the Save button (line 97).
3. **`pages/ProjectSettings.tsx`** — `save` (line 42), Save button (~102–105): same idiom.
4. **`pages/OrgSettings.tsx`** — `saveName` (line 33), Save button (~88–89): same idiom.

**i18n:** none (the spinner replaces "Loading…" visually; keep the `common.loading` key — other consumers exist).

**Verify (browser):** devtools → Network → Slow 3G: Account Save shows spinner + disabled until the success toast; ProjectSettings/OrgSettings same; DangerZone on a **throwaway project** spins until the redirect. Double-click a Save fast — exactly one request in the Network tab.

**Done when:** verification passes; typecheck + build green.

---

### - [ ] P5 — Bulk archive confirm hardening (XS)

**Goal:** the existing two-click confirm (already the F2-blessed pattern — keep it, no modal) gains a count, a timed reset, and busy feedback.

**`components/BulkBar.tsx:115–125`:**
1. Confirm label with count: `{confirmArchive ? t('bulk.confirmArchiveN', { count: selectedIds.length }) : t('bulk.archive')}` — new key `bulk.confirmArchiveN` = `"Archive {{count}}?"`; **retire** `bulk.confirmArchive` ("Confirm?") from en.json.
2. Timed auto-reset alongside the existing `onBlur` reset:
```ts
useEffect(() => {
  if (!confirmArchive) return
  const id = setTimeout(() => setConfirmArchive(false), 4000)
  return () => clearTimeout(id)
}, [confirmArchive])
```
3. While `busy && confirmArchive`, swap the `Archive` icon for `Loader2 … animate-spin` (P4 idiom).

**Verify (browser):** select 2–3 throwaway tickets → Archive → destructive "Archive 3?" → wait 4 s untouched → reverts to ghost "Archive"; re-arm → click elsewhere → reverts (blur path still works); re-arm → confirm → spinner → "{n} tickets archived" toast. Unarchive/delete the throwaways afterwards.

**Done when:** verification passes; `bulk.confirmArchive` removed from en.json and unreferenced; web typecheck green.

---

### - [ ] P6 — Global `:focus-visible` polish (XS)

**Goal:** every raw interactive element gets a visible keyboard ring; ring-managed components unaffected.

**`sourcecode/apps/web/src/index.css`** — inside the `@layer base` block, after the `body` rule (~line 57):
```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```
Safe because Button/Input/Textarea/TicketCard all set `focus-visible:outline-none` + their own ring (`button.tsx:7`, `input.tsx:9`, `textarea.tsx:9`, `TicketCard.tsx:183`) — the rule only reaches the currently-naked elements: card hover controls (`TicketCard.tsx:209–226`), reaction chips (`TicketDrawer.tsx:310`), slash/mention suggestion items (`TicketDrawer.tsx:825/840`), theme buttons (`AccountSettings.tsx:111`), the bulk checkbox, plain links.

**Verify (browser):** keyboard-tab across the Board (card → its hover controls), the drawer (reaction chips; suggestion items after typing "/"), Account theme buttons — visible 2 px ring in light + dark; confirm Buttons/Inputs did **not** double up (they keep their ring, no outline).

**Done when:** verification passes; vite build green.

---

## Sequencing & cut order

All six steps are **fully independent** (P5 borrows P4's `Loader2` idiom but shares no code). Land **P1 → P3 → P4 → P2 → P5 → P6** — validation and the token fix are the most user-visible, and P3's dark-token change lands early so it soaks under every later verify pass.

**Cut order if scope tightens:** P6 first (pure a11y, cheapest to defer) → P5 (current pattern already acceptable) → P2 (consistency, not a defect). **Never cut P1, P3, P4** — those are the audit's real defects.

## Explicitly out of scope (decided at audit)

- **Mobile/tablet Gantt interaction model** — drag was deliberately disabled below 640px (3.7 R8 guard; rail narrowing shipped as 3.7.1 F6). A touch scheduling model is a feature, not polish.
- **Tokenizing the amber/green semantic colors** (priority classes, stale borders, readiness/checklist greens, sprint-capacity bars) — no `--warning`/`--success` tokens exist; introducing them ripples through ~10 files for zero visible change. P3 covers the only *destructive-semantic* offender.
- **Slash-command popover keyboard navigation** (arrows/enter) — the suggestions are real `<button>`s (tab-reachable, and P6 gives them rings); full combobox semantics is a separate a11y task. Discoverability itself already exists.
- **Per-project List column prefs** — visibility/widths are intentionally global; making them per-project is a behavior change, not polish.
- **A form library / schema-driven validation** — the P1 `aria-invalid` + `FieldError` idiom is the ceiling by design.
- **Any modal/dialog primitive** — repo convention: inline or dropdown only.
- **Empty-state illustrations** — lucide icons only; keeps PMAgent's own identity (no Jira/Monday-style clip-art).
