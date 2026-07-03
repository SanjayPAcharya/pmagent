# AgentPM — repo conventions

## Layout
- **`agentpm-plan/`** — the spec (what to build, per phase). Source of truth for design.
- **`PROGRESS.md`** — live build status. **Update it after every implemented step, in the same commit** (tick the checkbox, refresh Now/Next/Blocked, add a Log row). One step = one checkbox.
- **`FEATURES.md`** — plain-language product guide for end users. **Update it whenever a user-facing feature ships** (same commit); keep it jargon-free and refresh its "last updated" date.
- **`sourcecode/`** — the pnpm **workspace root**. All `pnpm` / `docker compose` commands run from here. Code lives in `sourcecode/apps/*` and `sourcecode/packages/*`.

## Working rules
- Match the plan; when in doubt read the relevant `agentpm-plan/phases/*` and `references/*` file.
- Everything runs in Docker; dev = `docker compose up` (Postgres/Redis/Keycloak as containers). Prod state is managed (RDS/ElastiCache) — toggled by the `selfhost-data` Compose profile.
- Auth is Keycloak (OIDC); the API only verifies tokens (JWKS) — it never stores credentials.
- Secrets never in code or images. Commit `.env.example`, never `.env`.

## Build sequence (Phase 1)
Stage A skeleton (boots) → B auth → C platform CRUD → D frontend → E tests. See `PROGRESS.md` for live status.
