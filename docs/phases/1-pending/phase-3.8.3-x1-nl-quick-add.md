# Phase 3.8.3-x1 — Natural-language quick-add

> **Stage:** `pm-review` · **Next role:** Product Manager · **Branch:** — · **Size:** M
> Split out of the combined 3.8.3 spec on 2026-11-19. Comes after [3.8.3-t1](../3-building/phase-3.8.3-t1-ai-subtasks.md) (decision 1 on BOARD.md). The PM writes §3–§6 just before it's built, so the ground truth is fresh.

## 1. Why — *Product Planning*
- **Problem:**
  - The board's quick-add box understands shortcut tokens (`!high @name #sprint`), but only if you know and type them.
  - A plain sentence like "fix login on Safari, urgent, next sprint" becomes a ticket with that whole sentence as its title.
- **Goal:** type one natural sentence and click ✨. The composer fills in a clean title plus the matching priority, assignee, sprint and labels as the usual preview chips. You check them, then press Enter as today.
- **Success signal:** "fix login on Safari, urgent, next sprint" prefills the composer with `!urgent #<next sprint>` chips and a short title, and nothing is created until Enter.

*(Owner triage 3.8.1 ⛔C0, 2026-07-12: build T1 · S1 · X1. Same posture as 3.8 / 3.8.1: through the `AIProvider` seam, logged by `generateLogged`, a draft the user reviews, no auto-save, no tool use.)*

## 2. Scope — *Product Planning*
*Carried over unchanged from the combined spec (verified 2026-07-12). The PM re-checks every anchor.*
- **In:**
  - **API:** `POST /api/ai/quick-parse` with body `{ projectId, text }`.
    - It's MEMBER-gated.
    - Enrichment: the org's label names, the project members' display names, and the names of the active and upcoming sprints, so the model can only map to real values.
    - A new registry entry, `quickParse`:
      - system prompt: "turn one natural sentence into a ticket intent; pick title + optional priority/labels/assignee/sprint ONLY from the provided vocabularies; never invent";
      - schema / zod: `{ title: string, priority?: enum, labels?: string[], assignee?: string, sprint?: string }`.
    - A builder, `buildQuickParseUser({ text, labels, members, sprints })`.
    - It returns `{ parsed }`.
  - **Web:**
    - A small ✨ action in the board quick-add composer (`components/board/Column.tsx`) calls `quick-parse`.
    - The result is mapped back into an R9 token string (`title !PRIORITY @assignee #sprint` + labels) that prefills the composer, so the existing `lib/parseQuickCreate.ts` and its preview chips take over. There's no new create path.
    - The loader, error and cancel states reuse 3.8.1's.
    - The mapping logic lives in a pure `lib/aiQuickParse.ts`. It works from closed sets: an unknown assignee, label or sprint is dropped.
  - **Tests:**
    - a hermetic API test (the mock returns a parsed result, restricted to the vocabularies);
    - web unit tests for the result → token-string builder. Estimate: api +1–2, web +~3.
- **Out (non-goals):** creating the ticket directly from the AI result; any new create path; BYOK (backlog F4).
- **Open questions for the owner (⛔):** none yet. The PM may raise some while writing the ACs, for example when the ✨ action shows (always, or only when the text looks like a sentence).
- **Risks:**
  - `components/board/Column.tsx` has changed once since 2026-07-13, so re-check the composer, and the R9 tokens in `parseQuickCreate.ts`.
  - The model could invent names that aren't in the vocabulary. The closed-set mapping on the web side is the safety net.
  - `PROMPT_VERSION` will be 4 after T1. X1 bumps it to 5.

## 3. Ground truth — *Product Manager* (verified against the code on YYYY-MM-DD)
_Not started. Write it just before X1 is built, after T1 has merged._

## 4. Acceptance criteria — *Product Manager*
_Not started._

## 5. Build steps — *PM writes · Developer ticks* (one step = one commit)
_Not started._

DevOps impact: _PM to fill in._

## 6. Test plan — *PM writes · Tester runs*
_Not started._

## 7. Review — *Reviewer*
_Not started._

## 8. Test report — *Tester*
_Not started._

## 9. Release — *DevOps*
_Not started._

## Handoff log

### 2026-11-19 · Product Manager → Product Manager (later pass)
- **Did:** split X1 out of the combined 3.8.3 spec (that file is now [3.8.3-t1](../3-building/phase-3.8.3-t1-ai-subtasks.md)). Copied its scope here unchanged and put it in the template layout.
- **State:** `dev` @ 9bf26c2 plus this docs commit. X1 hasn't been started, and nothing has been verified for it this session.
- **Next role should:** once T1 is in `4-completed/`, write §3–§6 against the code as it is then. T1 changes `ai.prompts.ts`, `routes/ai.ts`, `lib/api.ts` and `en.json`.
- **Watch out for:** `PROMPT_VERSION` goes to 5 here. The A6 telemetry test asserts the version number.
