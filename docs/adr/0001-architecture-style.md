# ADR-0001: Architecture style

| Item | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-26 |
| Deciders | Shift Happens team |
| Related documents | [Architecture](../02-architecture.md), [SRS](../01-srs.md), [Concurrency patterns](../04-concurrency.md) |

## Context

Shift Happens is a multi-tenant SaaS for employee shift scheduling. Managers create and publish weekly schedules. Employees claim open slots, swap shifts and ask colleagues to cover shifts. The system checks conflicts and labor rules, sends notifications and shows coverage analytics.

The domain has these properties:

- **Hard invariants under concurrency.** The assigned count of a shift must never exceed its capacity. An employee must never have overlapping active assignments. Labor rules (`minRestHours` 11, `maxWeeklyHours` 40, `maxShiftHours` 12) must hold when two requests arrive at the same time ([REQ-REL-001](../01-srs.md)).
- **A long workflow.** A trade request lives up to 48 h. It has a peer step (accept) and a manager step (approve or reject), and it can expire. Its execution changes two assignments.
- **Fan-out bursts.** The publication of one schedule can notify 200 employees. 95 % of the in-app notifications must arrive within 60 s ([REQ-PERF-002](../01-srs.md)).
- **Read-heavy analytics.** Coverage reports read months of data. Data that is a few seconds old is acceptable when the response shows its age (`asOf`).
- **Targets.** p95 latency ≤ 300 ms for reads and ≤ 500 ms for writes at 200 requests/s ([REQ-PERF-001](../01-srs.md)). Availability 99.9 % per month ([REQ-AVAIL-001](../01-srs.md)).

The project has these constraints:

- It is a university project. Deliverables 3–6 are design documents without code.
- Deliverables 7–12 need real material: data model and consistency, resiliency, security and threat model, deployment, analytics with batch and stream processing, monitoring.
- The team is a small student team that knows TypeScript and Angular. The team selected AWS as the cloud.

## Decision drivers

| ID | Driver |
|---|---|
| DD-1 | Strong consistency for the capacity, overlap and labor rules |
| DD-2 | A clear place for the long trade workflow and its compensation |
| DD-3 | Independent scale of the notification fan-out and of the analytics reads |
| DD-4 | Availability 99.9 % and failure isolation |
| DD-5 | Explicit trust boundaries for tenant isolation and the threat model |
| DD-6 | Material for deliverables 7–12: sagas, outbox, consensus, batching and streaming, resiliency, deployment |
| DD-7 | Effort for a small team. Managed services where possible. |

## Considered options

### Option A: SPA and modular monolith

- One NestJS application with one module per bounded context: Organization, Scheduling, Trade, Notification, Analytics. A worker process from the same code base runs the jobs and sends the notifications.
- One Amazon RDS for PostgreSQL database with one schema per module. An outbox table feeds the worker.
- Redis for rate limits. Deployment on Amazon ECS or Amazon EKS.

Good:

- A swap is one local ACID transaction. No saga is necessary.
- The lowest effort to design, build, test and operate.
- At 200 requests/s, one application with one database meets the performance targets.

Bad:

- Sagas, consensus and stream processing do not occur naturally. The documents would have to invent them.
- The notification burst after a publication and the analytics queries share the process and the database with the claims.
- The application scales and fails as one unit.
- The deployment diagram and the threat model have little content.

### Option B: SPA and microservices with Kafka on Amazon EKS

- An Angular SPA on Amazon S3 and Amazon CloudFront. An Edge Gateway and five domain services (Organization, Scheduling, Trade, Notification, Analytics) as NestJS containers on Amazon EKS.
- One Amazon RDS for PostgreSQL database per service. Apache Kafka on Amazon MSK for events and saga commands, written through a transactional outbox.
- Amazon ElastiCache for Redis for rate limits, idempotency reservations and caches. Amazon Cognito for identity.

Good:

- Each service owns one bounded context and one database. The Scheduling service keeps all strong invariants in one database.
- The trade workflow crosses the Trade service and the Scheduling service. Thus the orchestrated saga, the semantic lock and the compensation are real, not invented.
- The Notification service and the Analytics service scale and fail independently of the write path.
- Rich material for every later deliverable.

Bad:

- More components: six deployments, five databases, Kafka and Redis.
- Eventual consistency between services. Distributed debugging needs tracing.
- The highest effort of the three options.

### Option C: Serverless on AWS

- An Angular SPA on Amazon S3 and Amazon CloudFront. Amazon API Gateway with a Cognito authorizer.
- One AWS Lambda function group per bounded context. Amazon DynamoDB tables with conditional writes and `TransactWriteItems`.
- Amazon EventBridge for events, Amazon SQS for queues and dead-letter queues, AWS Step Functions for the trade saga, Amazon EventBridge Scheduler for the jobs.

Good:

- Many patterns are managed features: retries, dead-letter queues, the saga state machine, scheduled jobs.
- Pay per use. No servers or nodes to operate.

Bad:

- DynamoDB has no range exclusion constraint and no row locks across items. The overlap and weekly-hours rules need extra items per employee and day, and conditional writes on all of them.
- Cold starts of Lambda functions put the p95 latency target at risk.
- The platform hides leader election and consensus, so deliverable 8 has less material.
- Per-user rate limit policies with `RateLimit` headers and RFC 9457 bodies need custom code. API Gateway throttles per stage, method or API key, not per user.
- Strong lock-in to AWS-specific services. Local tests are harder.

## Comparison matrix

Each option gets a score from 1 (poor) to 5 (good) for Shift Happens. For the effort criterion, 5 means the least effort. The weight shows the importance of the criterion for this project (1 to 3).

| Criterion | Driver | Weight | A: Modular monolith | B: Microservices + Kafka | C: Serverless |
|---|---|---|---|---|---|
| Strong consistency for overlap and hours rules | DD-1 | 3 | 5: one ACID database | 5: the Scheduling service owns all assignments, one local transaction | 2: no range constraint, conditional writes on helper items |
| Saga and outbox material | DD-2, DD-6 | 2 | 1: a swap is one transaction, a saga would be artificial | 5: Trade → Scheduling saga, an outbox in each service that produces events | 3: Step Functions hides the saga logic in a managed service |
| Consensus and leader election | DD-6 | 2 | 2: one lock for the worker | 5: Kubernetes Lease and fencing tokens, the Kafka controller quorum, RDS Multi-AZ failover | 1: hidden by the platform |
| Batching and streaming | DD-3, DD-6 | 2 | 2: batch rollups only | 5: stream projections from Kafka and nightly rollups | 4: EventBridge events to projections, scheduled batch jobs |
| Resiliency (retries, circuit breakers, bulkheads, dead-letter queues) | DD-4 | 2 | 2: one process fails as a unit | 4: isolation per service, circuit breakers, dead-letter topics | 4: managed retries and dead-letter queues, less to design |
| Threat surface: explicit trust boundaries that the team can model and control | DD-5 | 1 | 3: few boundaries, little to model | 4: gateway, signed internal header, network policies, broker access control | 4: one IAM policy per function |
| Deployment richness | DD-6 | 1 | 2: one service and one database | 5: EKS in 3 Availability Zones, RDS, MSK, ElastiCache | 4: many managed services |
| Effort to design and keep coherent | DD-7 | 3 | 5: lowest | 2: highest | 3: medium |
| **Weighted total (maximum 80)** | | **16** | **49** | **68** | **47** |

## Decision

The team selects **option B: SPA and microservices with Kafka on Amazon EKS**, with these scope limits:

1. Exactly five domain services and one Edge Gateway: Organization, Scheduling, Trade, Notification, Analytics. A new service in v1 needs a new ADR.
1. All strong invariants stay inside the Scheduling service: capacity, overlap, labor rules, trade locks and trade execution. No invariant depends on a distributed transaction. The trade saga only coordinates the steps, and the Scheduling service checks the invariants again in the pivot transaction.
1. The trade workflow is the only saga. The Trade service is its orchestrator. Other reactions across services (for example the cleanup after `MemberDeactivated`) are idempotent event handlers without compensation.
1. Synchronous calls between services occur only where a user waits for a check: Trade → Scheduling, and Edge Gateway → Organization on a cache miss. Each call has a timeout of 2 s, 1 retry and a circuit breaker.
1. The Notification service and the Analytics service are pure event consumers. No service calls them synchronously.
1. Managed AWS services hold all state: Amazon RDS, Amazon MSK, Amazon ElastiCache, Amazon Cognito.
1. One shared TypeScript library holds the event envelope, the outbox relay, the idempotent consumer, the problem details type and the `X-Principal` verification.

The team accepts that option A has the best effort score and meets the performance targets alone. The team selects option B because it supports DD-1 equally well with the scope limits, and it gives a real basis for DD-2 to DD-6. [Architecture](../02-architecture.md) describes the result.

## Consequences

### Positive

- One local transaction in the Scheduling service protects the capacity, overlap and labor rules (CS-1). No distributed lock is necessary.
- The notification fan-out scales to 12 consumers (one per partition). A burst after a publication does not slow down the claims.
- An outage of the Notification service or the Analytics service does not stop schedule changes, claims or trades. Kafka keeps the events until the consumers are back.
- Each service has one owner, one database and its own deployment.
- The design gives concrete material to the later deliverables:
  - 7, data model: database per service and the consistency model;
  - 8, resiliency: circuit breakers, retries and dead-letter topics;
  - 9, security: service-to-service trust and broker access control;
  - 10, deployment: EKS, RDS and MSK in 3 Availability Zones;
  - 11, analytics: stream projections and nightly batch rollups;
  - 12, monitoring: outbox lag and consumer lag.

### Negative

| Consequence | Mitigation |
|---|---|
| More components: six deployments, five databases, Kafka and Redis | Managed AWS services. One shared library. One deployment template for all services. |
| Eventual consistency between services | Writes return the changed object (read-your-writes in the SPA). API-12 returns `asOf`. The membership cache has a TTL of 60 s and event-based invalidation. |
| Distributed debugging | OpenTelemetry on every hop. `traceparent` in HTTP headers and in the event envelope. `traceId` in every error body. |
| The saga adds states (`EXECUTING`, `FAILED`) and compensation | One orchestrator. A trade lock expires with its trade request, so a lost release cannot block an assignment forever. |
| Higher cost: five RDS Multi-AZ instances and an MSK cluster | Small instance classes in v1. Deliverable 10 sizes the resources. |
| The highest effort | The service boundaries are the same as NestJS module boundaries. A prototype can run all modules in one process with the same contracts, as in option A. The design does not change. |

## Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| Option A: SPA and modular monolith | It meets the product targets, but it gives no real material for sagas, consensus, streaming and failure isolation (DD-2 to DD-6). It stays the fallback build path. |
| Option C: Serverless on AWS | DynamoDB cannot enforce the overlap and weekly-hours rules without helper items and conditional writes on each of them (DD-1). Cold starts put REQ-PERF-001 at risk. The platform hides consensus. |
| Event sourcing for assignments and trade requests | The invariants need constraints on the current state, for example the exclusion constraint on `(employee_id, period)`. An event store gives this only through extra projections. Event sourcing also needs schema versions for every old event, snapshots and replay tools. The team has no experience with it. The append-only `audit_log` tables and the outbox events satisfy the audit need (REQ-SEC-003). Kafka keeps events for 7 days only. It is a transport, not an event store. |
| One shared database for all services | It couples the schemas of all services and removes data ownership. A heavy analytics query could slow down a claim. |
| Distributed transaction (two-phase commit) for a trade | Kafka and the service databases do not take part in one distributed transaction. A trade waits up to 48 h for people, and no lock can stay open that long. The saga with a semantic lock fits a long workflow. |
| Choreography (no orchestrator) for the trade saga | The trade has two human steps, an expiry time and a compensation. One orchestrator keeps the state in one place and makes the flow easy to follow. |
| RabbitMQ or Amazon SNS with Amazon SQS instead of Kafka | No replay of retained events for the Analytics read models. Order per location needs FIFO topics and queues. Kafka gives both with partitions keyed by `locationId`. |

## Follow-up

- [Architecture](../02-architecture.md) describes the containers, services, communication, data ownership and the AWS mapping.
- [Concurrency patterns](../04-concurrency.md) describes the scenarios CS-1 to CS-6 that this decision makes possible.
- The team reviews this decision again if one of these events occurs:
  - the team starts to build the system;
  - the cost of the AWS resources exceeds the project budget;
  - a new requirement needs a strong invariant across two services.
