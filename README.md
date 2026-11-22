# Shift Happens

Employee shift scheduling platform: managers publish shifts, employees pick them up, swap them and cover for each other, and everything stays conflict-free.

> University team project (Faculty of Applied Mathematics and Informatics, Ivan Franko National University of Lviv), 2026.

## Idea

Shifts change all the time: someone gets sick, someone needs a day off, two people want the same slot. Shift Happens handles this in one place: no more chaos in group chats.

## Actors

- **Employee**: views own schedule, requests a shift, offers or swaps a shift with a colleague
- **Manager**: creates the schedule, approves or rejects swaps, sees coverage gaps
- **Admin**: manages users, roles and locations

## Key features (planned)

- Weekly schedule with shifts per location and role
- Shift swap and shift cover requests with manager approval
- Conflict detection (overlapping shifts, rest time, max hours)
- Notifications about schedule changes
- Basic analytics: coverage, swap rate, unfilled shifts

## Documentation

The [documentation index](docs/README.md) shows where each course requirement is.

| Deliverable | Document | Status |
|---|---|---|
| Product description (SRS, UML, identity management) | [docs/01-srs.md](docs/01-srs.md) | Done |
| Architecture | [docs/02-architecture.md](docs/02-architecture.md) | Done |
| Error handling design | [docs/03-error-handling.md](docs/03-error-handling.md), [docs/api/openapi.yaml](docs/api/openapi.yaml) | Done |
| Concurrency flows | [docs/04-concurrency.md](docs/04-concurrency.md) | Done |
| Data model | [docs/05-data-model.md](docs/05-data-model.md) | Done |
| Resiliency model | [docs/06-resiliency-model.md](docs/06-resiliency-model.md) | Done |
| Security model | [docs/07-security-model.md](docs/07-security-model.md) | Done |
| Deployment model | [docs/08-deployment-model.md](docs/08-deployment-model.md) | Done |
| Analytics model | [docs/09-analytics-model.md](docs/09-analytics-model.md) | Done |
| Monitoring and alerting model | [docs/10-monitoring-alerting-model.md](docs/10-monitoring-alerting-model.md) | Done |
| Demo and report | — | Planned |

To check the documentation, run `npm ci` and then `npm run docs:check` (Node.js 22.13 or later).

## Tech stack

| Layer | Technology |
|---|---|
| Client | Angular single-page application (PWA for Web Push) |
| Services | NestJS (TypeScript) microservices on Amazon EKS |
| Data | PostgreSQL (Amazon RDS), one database per service |
| Messaging | Apache Kafka (Amazon MSK) |
| Cache, rate limits, idempotency | Redis (Amazon ElastiCache) |
| Identity | Amazon Cognito (OIDC, MFA) |
| Notifications | WebSocket, Web Push, email (Amazon SES) |
| Documentation | Markdown, Mermaid, OpenAPI 3.1 |
