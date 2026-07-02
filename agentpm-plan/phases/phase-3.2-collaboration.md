# Phase 3.2 — Collaboration: mentions UI, markdown, reactions, attachments

> **Status: 📋 PLANNED** — next after 3.1. The backend half of mentions already exists (`parseMentions` + org-bounded notifications, `@[uuid]` format); this phase gives it a face and makes ticket bodies pleasant to read.

## Why 3.2 exists
Tickets are where the team talks. Today comments are plain text with an invisible mention syntax and descriptions render as flat strings. Small, contained work with daily payoff.

## Items
### C1. @mention autocomplete — **M**, no new backend
Type `@` in the comment composer → member picker (reuses the drawer's member list); inserts `@[uuid]`, renders as a highlighted `@Name` chip. Notification already fires server-side.

### C2. Markdown rendering — **M**, no backend
Render `description`, `acceptanceCriteria`, and comments as markdown (headings, lists, code blocks, links). Sanitize (no raw HTML). Dev-tool audience → code blocks matter. Suggested: `react-markdown` + `rehype-sanitize`.

### C3. Comment reactions — **M**, small backend
`Reaction { commentId, userId, emoji }` (new table, tiny migration) + `POST/DELETE /comments/:id/reactions`. A small set (👍 🎉 👀 ❤️) — not a full emoji picker.

### C4. Attachments — **L**, backend + storage
`Attachment { ticketId, uploaderId, filename, size, mime, key }` + presigned upload. Local volume in dev, S3 in prod. Images inline-preview in the drawer. **Defer if 3.3/3.4 are hungrier** — the only item here with infra weight.

## Out of scope
Threaded comments, live cursors, doc pages — post-Phase-5 territory.
