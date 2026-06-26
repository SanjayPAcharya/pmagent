# Reference: Launch Checklist & Ongoing Operations

> Stable reference. Run the pre-launch list before the first real user (after Phase 5, when the MVP is feature-complete). Source: §18 of the original plan.

## Pre-launch (before first user)

- [ ] Domain registered; DNS (`agentpm.io` / `api.` / `auth.`) pointing at the VM/Caddy (Compose path) or the shared ALB (ECS path)
- [ ] SSL certificate issued via ACM
- [ ] SES domain verified, sending limits raised (request production access)
- [ ] GitHub App published (not just draft)
- [ ] All secrets loaded in AWS Secrets Manager (no empty secrets)
- [ ] Database migrations run on production RDS
- [ ] CloudWatch alarms configured + SNS topic for alerts → your email/phone
- [ ] Sentry project created, DSN configured
- [ ] Staging environment tested end-to-end with a real GitHub repo
- [ ] Keycloak realm deployed; Google/Microsoft/GitHub identity providers configured with production OAuth credentials + redirect URIs
- [ ] Auth flows tested (self-signup + login via email/password, Google, Microsoft, GitHub)
- [ ] Code agent tested on a real ticket with a real repo
- [ ] Approval gate flow tested end-to-end

## Ongoing operations

- [ ] Weekly: review CloudWatch dashboards for error spikes
- [ ] Weekly: review agent token costs vs plan revenue
- [ ] Monthly: rotate JWT secrets + refresh token secrets
- [ ] Monthly: review RDS slow query log, add indexes if needed
- [ ] On each deploy: run `prisma migrate deploy` before spinning up new containers
