# Phase 5 — Notifications & Communication Channels

> **Goal:** Close the loop with humans. Start with email (AWS SES) driven by the event bus, then add two-way WhatsApp and Slack. Notification workers subscribe to events and fan out to channels — no coupling to board logic.

**Depends on:** Phase 3 (event bus), Phase 4 (agent events to notify about).

**References:**
- [03-data-models.md](../references/03-data-models.md) — adds `Notification`; uses `Integration`
- [01-tech-stack.md](../references/01-tech-stack.md) — Principle 3 (events drive notifications)
- [05-environment-secrets.md](../references/05-environment-secrets.md) — `SES_FROM_ADDRESS`, channel secrets

---

## Deliverables

### Email (MVP — ships with Phase 4's first agent runs)
- [ ] Email notifications via AWS SES
- [ ] Notification queue worker (subscribes to event bus, reads user prefs + channel config, sends, logs `Notification`)
- [ ] Sprint digest scheduling (daily cron via BullMQ)

### WhatsApp + Slack (post-MVP)
- [ ] WhatsApp Business Cloud API integration
- [ ] Slack incoming webhooks + slash commands + interactive buttons
- [ ] Channel preference settings per project/user (`Integration` records)
- [ ] Two-way reply → board action for all channels

---

## Email via AWS SES

File: `packages/notification-workers/email.worker.ts`

```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const ses = new SESClient({ region: 'ap-south-1' })
const FROM_ADDRESS = 'notifications@agentpm.io'

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }) {
  const command = new SendEmailCommand({
    Source: FROM_ADDRESS,
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: params.subject },
      Body: { Html: { Data: params.html }, Text: { Data: params.text } }
    }
  })
  return ses.send(command)
}

// Email templates (HTML)
export const emailTemplates = {
  approvalRequired: (data: ApprovalEmailData) => ({
    subject: `[${data.projectName}] Approval needed: ${data.ticketTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Approval needed</h2>
        <p><strong>${data.ticketTitle}</strong> (${data.ticketNumber})</p>
        <p>The ${data.agentType} agent has completed its work and is waiting for your approval to proceed to <strong>${data.nextPhase}</strong>.</p>
        <div style="margin:24px 0">
          <a href="${data.approveUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-right:12px">Approve</a>
          <a href="${data.reviewUrl}" style="background:#f3f4f6;color:#374151;padding:12px 24px;border-radius:6px;text-decoration:none">Review</a>
        </div>
      </div>
    `
  })
}
```

### Notification worker flow

The notification worker subscribes to the Redis event bus (`subscribeToEvents`, see [phase-3](phase-3-pm-core.md)). For each relevant event (e.g. `agent.completed`, `agent.needs_approval`, `agent.failed`), it:
1. Resolves which users to notify (assignee, project members, etc.).
2. Reads each user's channel preferences + the project's active `Integration` records.
3. Renders the matching template and sends via the channel (email now; WhatsApp/Slack later).
4. Writes a `Notification` record with `sentAt`.

> The `NotificationType` and `NotificationChannel` enums in [03-data-models.md](../references/03-data-models.md) enumerate every notification reason and destination.

---

## WhatsApp + Slack (post-MVP)

- **WhatsApp:** WhatsApp Business Cloud API. Store credentials in an `Integration` record (config encrypted at rest). Outbound = templated messages; inbound replies map to board actions.
- **Slack:** incoming webhooks for outbound, slash commands + interactive buttons for inbound. Approve/reject a gate directly from a Slack message.
- **Two-way mapping:** a reply on any channel (Slack button, WhatsApp message) resolves to the same service action the API exposes (e.g. approve gate), so all channels share one code path.
- **Channel preferences:** per project and per user, stored as `Integration` config + user notification settings.

---

## Definition of Done

- When an agent completes or needs approval, the right users get an email with working Approve / Review links, and a `Notification` row is recorded.
- A daily sprint digest is scheduled via BullMQ cron.
- (Post-MVP) A user can approve a gate from Slack/WhatsApp and the board reflects it.
- SES domain verified and out of sandbox before production (see launch checklist below).
