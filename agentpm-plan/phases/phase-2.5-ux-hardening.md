# Phase 2.5 — UX Hardening (dark mode, i18n, mobile, Cmd-K, E2E)

> **Goal:** Polish the verified Phase-2 PM core into a production-grade UX — theme, internationalization scaffolding, mobile, a command palette, and end-to-end tests — **after** Phase 2 is shippable and verified. Split out so a green Phase 2 doesn't hinge on these cross-cutting concerns.

**Depends on:** Phase 2 (PM Core) complete & verified. Runs **before** Phase 3 (deploy), except Playwright's CI wiring which lands in Phase 3.

**References:**
- [phase-2-pm-core.md](phase-2-pm-core.md) — the surface this hardens
- [01-tech-stack.md](../references/01-tech-stack.md) — shadcn/ui foundation (adopted in Phase 2)
- [07-testing-strategy.md](../references/07-testing-strategy.md) — Playwright E2E

---

## Deliverables

- [ ] **Dark mode** — set Tailwind `darkMode: 'class'`; theme toggle persisted to `localStorage` with `prefers-color-scheme` fallback; **retrofit Phase-1 + Phase-2 components** that hard-code light colors (Landing, Layout, Dashboard, OrgProjects, board, drawer)
- [ ] **i18n** — `react-i18next` + `I18nextProvider` in `main.tsx`; `en` baseline; **externalize all UI strings** (Phase-1 pages included — they ship hard-coded English today); language detection/persistence even if only `en` ships
- [ ] **Mobile-responsive** — board scrolls horizontally with snap; ticket drawer becomes a full-screen sheet; touch-friendly drag (dnd-kit pointer/touch sensors); responsive header/nav
- [ ] **Cmd-K command palette** (`cmdk`) — quick-add a ticket, jump to a ticket by number/title, switch project/org
- [ ] **Playwright E2E** — `@playwright/test` + `playwright.config.ts` + `test:e2e`; a **globalSetup** that logs into Keycloak once (or mints a token via password grant against the test realm) and saves `storageState`, reused by specs; seeded test users (incl. a second user for the @mention/notification assertion); core flow: sign in → create ticket → drag status → comment with `@mention` → assert the other user's notification bell updates
- [ ] **Accessibility pass** — keyboard nav for board/drawer, focus management on the drawer, ARIA on interactive controls, axe spot-check

---

## Notes

- **shadcn/ui is already adopted in Phase 2** (Dialog/Popover/Command/Toast) — 2.5 builds on it (the Cmd-K palette uses shadcn's `Command`).
- **i18n is a retrofit, not just new surfaces:** every existing string (`Sign in`, `Create account`, `Sign out`, `New project name`, empty states, …) must move into resource files. Budget for touching all current pages.
- **Playwright + Keycloak** is the fiddly bit: drive the real hosted login once in `globalSetup` and reuse `storageState`; don't log in per-spec. The realm export (`realm-agentpm.json`) or a seed step must provide the test users.
- **Cross-user notification assertion:** rather than driving a second browser session, assert user B's bell via an API call (`GET /api/notifications` with B's token) — keeps the E2E single-context and stable.
- **CI** to run the E2E (Postgres + Redis + Keycloak + Playwright browsers) is wired in **Phase 3**; in 2.5 the E2E runs locally against `docker compose up`.

---

## Definition of Done

- A theme toggle flips the whole app (Phase-1 + Phase-2 surfaces) between light/dark and persists.
- No hard-coded UI copy remains; strings come from `en` resources via `react-i18next`.
- The board and drawer are usable on a phone-width viewport, including drag.
- Cmd-K opens a palette that can quick-add and jump to a ticket.
- `pnpm test:e2e` runs the core flow green locally against the docker stack.
