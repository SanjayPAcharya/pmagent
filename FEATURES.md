# PMAgent — Product Guide

> A plain-language guide to PMAgent. **Part 1** walks you through the app in the order you'll actually use it — each step tells you what to do next. **Part 2** is the full feature reference.
> (Kept up to date as features ship — last updated **2026-07-06**.)

PMAgent is a project-management tool built for teams — and designed from day one so that AI agents can eventually pick up tickets and work alongside you. You organize work into **Organizations → Projects → Tickets**, move tickets across a board, and collaborate with comments, mentions, and notifications in real time.

---

# Part 1 — Getting started, step by step

> 💡 The app tracks these same steps for you: a **Getting started checklist** appears on your home screen with a progress bar, and each unfinished step is a link that takes you to the right place. Dismiss it anytime with the ✕.

## Step 1 · Create your account

On the welcome screen, either:
- click **Continue with Google / Microsoft / GitHub** (one tap), or
- click **Sign in with email** → **Register** to create an email + password account.

You'll land on your home screen — empty for now.

**Next → create the home for your team.**

## Step 2 · Create your organization

Type a name in the box at the top of the home screen (your company or team name) and press **Create**. You're now its **Owner**. PMAgent starts you off with two ticket templates (*Bug report* and *Feature*) you'll meet in Step 5.

**Next → set up a project to hold your work.**

## Step 3 · Create your first project

Click your organization, type a project name (e.g. "Website"), press **Create**. The project gets a short **key** like `WEB` — every ticket in it will be numbered `WEB-1`, `WEB-2`, …

Notice the **workspace sidebar** on the left now shows Organization → Project → Overview / Board / List / Sprints / Reports / Settings. That tree is your fastest way around the app from here on.

**Next → put some work on the board.**

## Step 4 · Create your first tickets

Open the project (you'll land on the **Overview**) and click **Board** in the sidebar. Three ways to add tickets:

1. **Quick add** — the **+** on any column (or the input on the empty board). Type a title and press Enter. You can set fields inline with tokens as you type: `!high` (priority), `@name` (assignee), `#sprint` — a live preview shows what will be set.
2. **New from template** — the 📄 button in the board header (or beside a column's quick-add). Pick *Bug report* or *Feature* and the ticket arrives pre-filled with a proper structure.
3. **Import CSV** — already tracking work in a spreadsheet or Jira? Switch to the **List** view (toggle at the top) and click **Import CSV**.

Click any card to open the **ticket panel**: set an assignee, a start date and a due date, priority, labels — and write a description with acceptance criteria (type `- [ ]` lines to get tick-able checkboxes).

**Next → make the board reflect reality.**

## Step 5 · Work the board

- **Drag cards** between columns as work progresses: Backlog → To Do → In Progress → In Review → Done.
- Finish something? Drag it to **Done** — enjoy the confetti 🎉 and watch the completion bar climb.
- If a ticket can't proceed until another is finished, open it → **Relationships** → **Blocked by**. It gets a red **Blocked** badge that clears automatically when the blocker is done (and you get notified).

**Next → you shouldn't be doing this alone.**

## Step 6 · Invite your team

Sidebar → your organization → **Members**. Click **Create invite link** — the link is copied to your clipboard; send it to anyone (chat, email). Whoever opens it joins your organization. You can also add existing users by email, and promote people to **Admin**.

Now the board is live for everyone: you'll see teammates' avatars on tickets they're viewing and even their card drags in real time. Mention them in comments with `@name` — they get notified.

**Next → plan work in time boxes.**

## Step 7 · Plan a sprint

Board header → **Sprints** → create one (give it a goal), add tickets to it, then press **Start**. The board can filter to the active sprint, and a **burndown chart** tracks remaining work day by day. When you **Complete** the sprint, PMAgent records your velocity.

**Next → let the app keep you oriented every day.**

## Step 8 · Your daily loop

- **My work** (top of the sidebar) — everything assigned to you or watched by you, across all organizations.
- **The bell** 🔔 — assignments, comments, mentions, "your ticket is unblocked".
- **⌘K / Ctrl-K** — the fastest way to do anything: search every project, jump to recent tickets, or create a ticket by just typing `Fix login bug !high @maya`.
- **⚡ Automation** (board header) — flip on "Assigning moves Backlog → To Do" and friends, and stop doing housekeeping by hand.

That's the core loop. Everything else below is detail you'll discover as you go.

---

# Part 2 — Feature reference

## Organizations & members
- Roles: **Owner** (full control), **Admin** (manage members, projects, templates), **Member** (day-to-day work). The last Owner can never be accidentally removed.
- Invite links expire after 7 days and can be revoked; email-adds work for existing accounts.
- Overview page shows projects/members/open-ticket counts and a **recent activity feed**.

## Settings
- **Organization settings** (gear in the sidebar, or the "Settings" link on an org's page): rename the org, pick its **workspace accent color** (the whole app follows it), **manage labels** (rename, recolor, delete — each shows how many tickets use it, and renames update everywhere instantly), see your plan, and — for Owners — a danger zone to delete the org (type its name to confirm).
- **Project settings** (gear in the sidebar, or the project's ⋯ menu): rename, edit the description and default branch (the project key is fixed), plus an admin danger zone to delete the project (type-to-confirm). Everything is role-gated — members see it read-only.
- **Your account** (click your email/avatar in the header): set your display name and a profile picture (paste an image link — leave it empty to use your initials), and pick your theme. Your sign-in email is shown read-only; it's managed where you log in.

## Navigation
- **Workspace sidebar** — collapsible org → project tree; star ⭐ projects to pin them on top; collapses to a slide-out menu on mobile.
- **Breadcrumbs** always show Home › Org › Project.
- **⌘K palette** — global search that looks in ticket titles **and descriptions** and finds **projects by name** across all your organizations; recent items (smart-ranked), quick-create with `!priority @assignee #sprint`, actions on the open ticket, theme toggle.

## Overview (project landing page)
- Opening a project now lands on its **Overview** — a manager's-eye dashboard. The sidebar's **Board** and **List** leaves are one click away.
- **Status** — open vs. done counts, a to-do/in-progress/done bar, and a sprint-vs-ad-hoc split.
- **Active sprint** — progress bar, days left, and the burndown chart; a prompt to start one if none is active.
- **Blockers** — the top blocked tickets (either marked Blocked or waiting on unfinished dependencies); click one to open it.
- **Milestones** — your next target dates with a readiness ring (how many of the tickets due before each are done). Add one inline (name + date) and tick it off when reached.
- **Capacity** — open tickets per teammate plus a recent-velocity estimate.
- **Recent activity** across the project, and a **Project summary** card (Beta — the AI-written digest arrives with the agent release).
- Every card updates live as teammates make changes — no refresh needed.

## Board
- Columns: Backlog · To Do · In Progress · In Review · Blocked · Done, with drag & drop and within-column reordering.
- **WIP limits** — In Progress and In Review pulse when overloaded.
- Filters (search / priority / type / assignee / sprint) — each is **multi-select** (tick several priorities, people, or sprints at once) — plus sort options and the **"My tickets"** focus dim (`f`).
- On phones: columns snap-scroll, **swipe** a card to advance/retreat its status.
- **Live presence** — viewer avatars on cards, ghost outlines of teammates' in-flight drags.

## Sprint vs ad-hoc work
- Every ticket is either **Sprint work** (planned into sprints) or **Ad-hoc** (operational work that lives outside sprints). Set it in the ticket drawer's **Workstream** field.
- The board and list have an **All / Sprint work / Ad-hoc** tab so you can focus on one lane; creating a ticket while on the Ad-hoc tab makes it ad-hoc automatically.
- Switching a ticket to **Ad-hoc** removes it from its sprint (a hint warns you first); the **bulk** menu can change the workstream of several tickets at once.
- CSV export/import carry a **Workstream** column (values like "Sprint", "Ad-hoc", "Ops"). Velocity stays sprint-based by design, and workload now shows a small **sprint vs ad-hoc** split per person.

## List view
- **Board ⇄ List** toggle (remembered per browser).
- Filterable (every filter is **multi-select** — status, priority, type, assignee, sprint, label, workstream), sortable table; row click opens the ticket panel.
- **Choose your columns** — a *Columns* button toggles Status, Priority, Assignee, Sprint, Workstream, Start, Points, and Updated on/off (Key + Title always show). **Drag a column's edge to resize it.** Both your column choices and widths are remembered. (CSV export always includes every column, regardless of what's shown.)
- **Export CSV** of exactly what your filters show; **Import CSV** with a preview and Jira-compatible headers (Summary, Issue Type, Story Points…). Imports now bring **labels and the assignee** along too — labels match by name (separate several with `;`), the assignee by their email or exact display name; anything that doesn't match is simply skipped, never an error. Not sure of the format? Click **Sample CSV** to download a ready-made example you can open, edit, and re-import.

## Tickets
- Slide-in panel with a **pinned header** (number, title, status, priority, type) and an **expand-width** ⤢ button (two-column layout on big screens).
- Grouped sections: **Details** (assignee/points/due/sprint) · **People & labels** (watchers, colored labels) · **Relationships**.
- **Relationships:** parent/subtasks (with done-counter), blocked-by/blocks with automatic red **Blocked** badges. **Add subtasks inline** — type a title and press Enter, repeat for fast batch entry (each new subtask inherits the parent's sprint/ad-hoc workstream). A **+ subtask** button on any board card jumps straight here.
- **Spec** with Markdown + a **readiness ring** showing how complete the spec is (a ready ticket is one an AI agent could pick up); `- [ ]` acceptance-criteria checklists with progress.
- **Templates:** org-wide presets; *Bug report* and *Feature* included, Admins manage them on the Members page ("Add starter templates" backfills older orgs).

## Comments & notifications
- Markdown comments, **@mentions** with autocomplete (mentioned people are notified), **reactions** (👍 🎉 👀 ❤️).
- **Slash commands** in the comment box: `/status done`, `/assign maya`, `/due tomorrow`, `/sprint none`, `/label bug`.
- **Activity** log per ticket and a combined **Story** timeline.
- Bell notifications: assigned, status changed, commented, mentioned, **unblocked**, **all subtasks done**.

## Bulk actions
- Multi-select via hover checkboxes (board) or the checkbox column (list) → floating bar: change status/assignee/sprint, add label, archive (with confirm).

## Reports
- Every project has a **Reports** tab (in the sidebar, or the link next to Sprints on the board) with read-only views:
  - **Velocity** — story points completed per finished sprint, as a bar chart. Complete sprints and the trend builds itself. (Velocity stays sprint-based; ad-hoc work isn't counted here.)
  - **Cycle & lead time** — how long tickets take: *cycle* is start-of-work to done, *lead* is created to done. Shown as typical (median) and slow-end (p85) numbers over the last 90 days, plus a weekly trend line.
  - **Workload** — open tickets per person (including unassigned), with a small **sprint vs ad-hoc** split, so you can spot overload at a glance.
  - **Release readiness** — a completion donut for the whole project plus, for each upcoming milestone, how many of the tickets due before it are done (and how many are still open). Add milestones on the Overview page to populate it.

## Sprints
- Goal + dates, start/complete lifecycle, capacity view, **burndown chart**, recorded velocity.
- **Editable goal** inline (click the pencil), and an **expandable ticket list** you can manage without opening each ticket: change **status** and **assignee**, see priority and points at a glance, jump to a ticket, or move it to another sprint/backlog. A small **assignee/status filter** narrows a big sprint. Everything updates live for the whole team.

## Timeline (Gantt)
- A horizontal **timeline** of every scheduled ticket: each shows as a bar from its start to its due date (a single date shows as a one-day marker), colored by status.
- **Milestones** appear as diamonds with a dashed line across the chart; a **today** line marks the current date; **dependency arrows** connect a ticket to the ones it's waiting on.
- Switch the zoom between **Day / Week / Month**, jump to **Today**, and filter by assignee, sprint, label, status, or workstream — the filters narrow both the chart and the tray.
- Tickets without any dates sit in a collapsible **Unscheduled** tray at the bottom. Click any bar, row, or chip to open the ticket.
- **Drag to schedule** (on desktop): drag a bar to move it, drag its ends to resize, drag an **Unscheduled** chip onto the timeline to give it a 3-day slot, and drag a milestone diamond to a new date. Every change shows an **Undo** toast. Updates live as the team schedules work.

## Automation (per project, ⚡ menu)
| Switch | What it does | Default |
|---|---|---|
| Notify when unblocked | Tells a ticket's people when its last blocker is finished | **On** |
| Assigning moves Backlog → To Do | Assigning someone pulls the ticket out of Backlog | Off |
| Notify when all subtasks are done | Tells the parent ticket's people when the last subtask closes | Off |

## Personalization
- **Profile:** display name + avatar on the Account page; your avatar shows in the header and sidebar.
- **Theme:** light / dark / follow system — switch from the header toggle or the Account page; sign-in pages match.
- **Shortcuts:** `⌘K` palette · `?` help · `t` theme · `f` focus mine · `Esc` close panel.
- Fully usable on mobile.

---

## Coming next (planned)
- Project insights: velocity trends, cycle time, workload charts.
- Error monitoring, plan limits, and API access.
- Email/Slack notifications and digests.
- **The headline act:** assign a ticket to an AI agent that writes the code and opens a pull request — the reason it's called PMAgent.
