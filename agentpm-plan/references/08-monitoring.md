# Reference: Monitoring & Observability

> Stable reference. Wired up during Phase 3 (infra) and refined per phase. Source: §15 of the original plan.

## CloudWatch alarms

```typescript
// In monitoring-stack.ts — create alarms for:

// API error rate > 1% over 5 minutes
new cloudwatch.Alarm(this, 'ApiErrorRate', {
  metric: apiService.loadBalancer.metricHttpCodeTarget(
    elbv2.HttpCodeTarget.TARGET_5XX_COUNT
  ),
  threshold: 10,
  evaluationPeriods: 1,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
})

// Agent job queue depth > 50 (agents falling behind)
new cloudwatch.Alarm(this, 'AgentQueueDepth', {
  metric: new cloudwatch.Metric({
    namespace: 'AgentPM',
    metricName: 'agent_queue_depth',
    statistic: 'Maximum'
  }),
  threshold: 50,
  evaluationPeriods: 2
})

// DB CPU > 80%
new cloudwatch.Alarm(this, 'DbCpuHigh', {
  metric: dbInstance.metricCPUUtilization(),
  threshold: 80,
  evaluationPeriods: 3
})
```

## Custom metrics (publish to CloudWatch)

```typescript
// In agent logger — publish after each agent run
const cw = new CloudWatchClient({ region: 'ap-south-1' })

await cw.send(new PutMetricDataCommand({
  Namespace: 'AgentPM',
  MetricData: [
    { MetricName: 'agent_duration_ms', Value: durationMs, Unit: 'Milliseconds',
      Dimensions: [{ Name: 'AgentType', Value: agentType }] },
    { MetricName: 'agent_token_cost', Value: tokenCost, Unit: 'Count' },
    { MetricName: 'agent_success', Value: success ? 1 : 0, Unit: 'Count' }
  ]
}))
```

## Structured logging

All logs must be JSON with these fields:

```typescript
interface LogEntry {
  timestamp: string    // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error'
  service: string      // 'api' | 'code-agent' | 'web' | 'notification-worker'
  requestId?: string   // trace through request lifecycle
  userId?: string
  ticketId?: string
  agentType?: string
  message: string
  data?: unknown
  error?: { message: string; stack: string; code?: string }
}
```

## Sentry integration

```typescript
// In apps/api/src/index.ts
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [ new Sentry.Integrations.Prisma({ client: prisma }) ]
})

// Capture agent failures (Phase 4+)
try {
  await runCodeAgent(payload)
} catch (error) {
  Sentry.captureException(error, {
    extra: { ticketId: payload.ticketId, agentType: 'CODE' }
  })
  throw error
}
```
