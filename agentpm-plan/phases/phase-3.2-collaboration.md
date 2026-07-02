# Phase 3.2 — Collaboration: mentions UI, markdown, reactions, attachments

> **Status: ✅ C1–C3 COMPLETE** (2026-07-02, on `dev`) · C4 attachments **deferred** (only item with infra weight). Audit finding: C1 and C2 already existed from Phase 2.1 (composer @-picker with `@Name`→`@[uuid]` conversion; markdown via marked+DOMPurify on description/spec/comments, interactive AC checklists) — this phase added the mention **chip styling** in rendered comments and built **C3 reactions** end-to-end.

## Why 3.2 exists
Tickets are where the team talks. Today comments are plain text with an invisible mention syntax and descriptions render as flat strings. Small, contained work with daily payoff.

## Items
### C1. ✅ @mention autocomplete — pre-existed (2.1); chip styling added here
Type `@` in the comment composer → member picker (reuses the drawer's member list); inserts `@[uuid]`, renders as a highlighted `@Name` chip. Notification already fires server-side.

### C2. ✅ Markdown rendering — pre-existed (marked + rehype-free DOMPurify sanitize)
Render `description`, `acceptanceCriteria`, and comments as markdown (headings, lists, code blocks, links). Sanitize (no raw HTML). Dev-tool audience → code blocks matter. Suggested: `react-markdown` + `rehype-sanitize`.

### C3. ✅ Comment reactions — shipped (CommentReaction model + endpoints + chip UI)
`Reaction { commentId, userId, emoji }` (new table, tiny migration) + `POST/DELETE /comments/:id/reactions`. A small set (👍 🎉 👀 ❤️) — not a full emoji picker.

### C4. ⏸ Attachments — DEFERRED (revisit before/with Phase 3.5 H5 or Phase 5)
`Attachment { ticketId, uploaderId, filename, size, mime, key }` + presigned upload. Local volume in dev, S3 in prod. Images inline-preview in the drawer. **Defer if 3.3/3.4 are hungrier** — the only item here with infra weight.

## Out of scope
Threaded comments, live cursors, doc pages — post-Phase-5 territory.
