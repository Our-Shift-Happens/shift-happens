# Shift Happens monitoring and alerting model

| Item | Value |
|---|---|
| Deliverable | 12. Monitoring and alerting model |
| Version | 1.0 |
| Date | 2026-11-14 |
| Authors | Shift Happens team, Faculty of Applied Mathematics and Informatics, Ivan Franko National University of Lviv |
| Related documents | [Architecture](02-architecture.md), section 9.4 · [Deployment model](08-deployment-model.md) · [Resiliency model](06-resiliency-model.md) |

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-14 | Shift Happens team | First release for deliverable 12. |

## Contents

1. [Summary](#1-summary)
1. [Monitoring: operational metrics](#2-monitoring-operational-metrics)
1. [How the metrics are collected](#3-how-the-metrics-are-collected)
1. [Dashboards](#4-dashboards)
1. [Alerting: thresholds](#5-alerting-thresholds)
1. [Alert routing and severity](#6-alert-routing-and-severity)
1. [Mitigation plan for the most critical alerts](#7-mitigation-plan-for-the-most-critical-alerts)
1. [Related documents](#8-related-documents)

## 1. Summary

The monitoring model tells the team if the system is healthy. It has two parts. Monitoring is the list of 18 operational metrics with their dimensions, the infrastructure resource that each metric describes, and the way the system collects it. Alerting is the list of 15 alert rules with minimum and maximum values, the alert type and severity, and a mitigation plan for the most critical ones.

The model measures the infrastructure and the technical behavior of the services. The business metrics (coverage, fill rate, trade rate) are in the [analytics model](09-analytics-model.md).

The model supports these targets of the [SRS](01-srs.md):

| Requirement | Target | Where the model covers it |
|---|---|---|
| REQ-PERF-001 | p95 latency 300 ms for reads and 500 ms for writes at 200 requests/s | O-01, A-03 |
| REQ-PERF-002 | 95 % of in-app notifications within 60 s | O-12, A-05 |
| REQ-AVAIL-001 | 99.9 % monthly availability | O-02, O-16, A-01, A-02, A-14 |
| REQ-REL-001 | No double booking | O-03 |
| REQ-OBS-001 | Every error has a `traceId` | Section 3 |

## 2. Monitoring: operational metrics

### 2.1 Table

| ID | Metric | Dimensions | Infrastructure resource | Source and collection | Interval |
|---|---|---|---|---|---|
| O-01 | Request latency (p50, p95, p99) | service, route (`operationId`), HTTP method | Edge Gateway pods, ALB | OpenTelemetry histogram `http.server.request.duration`, then CloudWatch. ALB `TargetResponseTime` as a cross-check. | 1 min |
| O-02 | Request rate and error ratio (4xx and 5xx) | service, route, status, problem `code` | Edge Gateway pods, ALB | OpenTelemetry counter `http.server.request.count`. ALB `HTTPCode_Target_5XX_Count`. | 1 min |
| O-03 | Claim conflict and lock-timeout count | service, outcome (`SLOT_FILLED`, `ASSIGNMENT_OVERLAP`, `LOCK_TIMEOUT`) | Scheduling pods, `scheduling_db` | OpenTelemetry counter `claim_attempts_total{outcome}`. PostgreSQL log `lock_timeout` events. | 1 min |
| O-04 | Rate limit rejections (429) | policy (`claims`, `trades`, `default`), user class | Edge Gateway, ElastiCache | OpenTelemetry counter `rate_limit_rejections_total{policy}`. WAF `BlockedRequests` for the IP rate rule. | 1 min |
| O-05 | Pod CPU and memory use | service, pod, node, zone | EKS nodes and pods | Container Insights for EKS (kubelet metrics) | 1 min |
| O-06 | Pod restarts and available replicas | service, reason (`OOMKilled`, `Error`) | EKS | Container Insights, `kube_deployment_status_replicas_available` | 1 min |
| O-07 | Database CPU, connections, free storage and latency | database, instance, zone | Amazon RDS (5 instances) | CloudWatch `CPUUtilization`, `DatabaseConnections`, `FreeStorageSpace`, `ReadLatency`, `WriteLatency`. Enhanced Monitoring and Performance Insights. | 1 min |
| O-08 | Database lock waits and deadlocks | database, table | `scheduling_db`, `trade_db` | Performance Insights wait events. PostgreSQL `deadlocks` counter in `pg_stat_database`, read by each service every 30 s. | 30 s |
| O-09 | Outbox lag (age of the oldest unpublished row) | service | Service databases, outbox relay | Custom gauge `outbox_lag_seconds`. The relay runs `SELECT now() - min(created_at) FROM outbox WHERE published_at IS NULL` every 15 s. | 15 s |
| O-10 | Kafka consumer lag | consumer group, topic, partition | Amazon MSK | CloudWatch MSK metrics `MaxOffsetLag` and `SumOffsetLag` per consumer group and topic | 1 min |
| O-11 | Dead-letter topic depth | topic (`<topic>.dlq`) | Amazon MSK | CloudWatch `MessagesInPerSec` on the DLQ topics, and a custom gauge from a small consumer that counts the messages | 1 min |
| O-12 | Notification delivery time (p95) and failure rate | channel (`IN_APP`, `WEB_PUSH`, `EMAIL`), notification type | Notification pods, SES, Web Push services | OpenTelemetry histogram `notification_delivery_seconds` (from `occurredAt`) and counter `notification_failures_total`. SES `Bounce` and `Complaint` metrics. | 1 min |
| O-13 | MSK broker health | broker, zone | Amazon MSK | CloudWatch `UnderReplicatedPartitions`, `ActiveControllerCount`, `CpuUser`, `KafkaDataLogsDiskUsed` | 1 min |
| O-14 | Redis health | shard, node | Amazon ElastiCache | CloudWatch `EngineCPUUtilization`, `DatabaseMemoryUsagePercentage`, `Evictions`, `CurrConnections`, `ReplicationLag` | 1 min |
| O-15 | Circuit breaker state | breaker (`gateway-sch`, `trade-sch`, `ntf-ses`, …), state | Edge Gateway, Trade and Notification pods | OpenTelemetry gauge `circuit_breaker_state` (0 closed, 1 half-open, 2 open) | 15 s |
| O-16 | Synthetic availability | probe (`GET /api/v1/health`, claim flow with a test account) | Public API through CloudFront and ALB | Amazon CloudWatch Synthetics canary every 60 s from 2 regions | 1 min |
| O-17 | Trade requests stuck in `EXECUTING` and job freshness | job (`trade-expiry`, `shift-reminders`, `nightly-rollup`) | `trade_db`, job pods | Custom gauges `trade_executing_older_than_5m` and `job_last_success_age_seconds` | 1 min |
| O-18 | Security signals | event type (failed sign-in, `MFA_REQUIRED`, WAF block, `401` rate) | Cognito, WAF, Edge Gateway | Cognito CloudWatch metrics and log events, WAF `BlockedRequests`, gateway `401` and `403` counters | 1 min |

### 2.2 Metrics by infrastructure layer

| Layer | Metrics | Resources |
|---|---|---|
| Edge | O-01, O-02, O-04, O-16, O-18 | CloudFront, WAF, ALB |
| Compute | O-05, O-06 | Amazon EKS |
| Application | O-03, O-12, O-15, O-17 | Services |
| Data | O-07, O-08, O-09, O-14 | RDS, ElastiCache |
| Messaging | O-10, O-11, O-13 | Amazon MSK |

## 3. How the metrics are collected

| Signal | Path | Details |
|---|---|---|
| Application metrics | OpenTelemetry SDK in each NestJS service, then the AWS Distro for OpenTelemetry (ADOT) collector (DaemonSet), then CloudWatch | The SDK exports in the CloudWatch Embedded Metric Format. Labels have a fixed list of values, so the cost and the cardinality stay low. An `orgId` is not a metric label. It stays in the logs and traces. |
| AWS service metrics | Amazon CloudWatch (automatic) | RDS, MSK, ElastiCache, ALB, CloudFront, WAF, Cognito and SES publish their metrics without an agent. Enhanced Monitoring is on for RDS and for MSK (per broker). |
| Cluster metrics | Container Insights for EKS | CPU, memory, restarts and replica counts per pod, node and Deployment |
| Custom gauges from the database | A scheduled query in the service (every 15 to 60 s) | Outbox lag, stuck trade requests and job freshness. The service writes the gauge through OpenTelemetry. |
| Logs | Structured JSON on `stdout`, then Fluent Bit, then CloudWatch Logs | Each line has `traceId`, `spanId`, `service` and `orgId`. No emails or tokens. CloudWatch metric filters count `level=error`. |
| Traces | OpenTelemetry, then ADOT, then AWS X-Ray | Sampling 5 %, plus all traces with an error. The `traceId` in a problem details body finds the trace (REQ-OBS-001). |
| Synthetic checks | CloudWatch Synthetics canary | Calls the public API every 60 s and runs the claim flow with a test organization |
| Alarms | CloudWatch alarms and composite alarms, then Amazon SNS | See [section 6](#6-alert-routing-and-severity) |

All metrics use the namespace `ShiftHappens/<service>` for application metrics. The monitoring stack is part of the Terraform code ([deployment model](08-deployment-model.md)). Thus an environment gets the same alarms as production.

## 4. Dashboards

| Dashboard | Audience | Content |
|---|---|---|
| Service health (golden signals) | On-call engineer | Rate, errors, latency and saturation for each service (O-01, O-02, O-05, O-06) |
| Data and messaging | On-call engineer | O-07 to O-11, O-13, O-14 |
| Edge and security | On-call engineer and security owner | O-04, O-16, O-18, WAF and Cognito charts |
| SLO | Team | Availability, latency and notification time against the targets, and the remaining error budget (43 min per 30 days) |
| Release | Team | The metrics of one deployment: error ratio, latency and restarts before and after the rollout |

## 5. Alerting: thresholds

### 5.1 How to read the table

| Column | Meaning |
|---|---|
| Condition | The limit and the time window. A maximum limit raises the alert when the value is above it. A minimum limit raises the alert when the value is below it. |
| Type | `Threshold` (fixed limit), `Burn rate` (error budget use), `Absence` (no data or no run), `Anomaly` (change against a baseline) |
| Severity | `P1` critical (page now), `P2` high (page in working hours or notify the channel at once), `P3` warning (ticket) |

### 5.2 Alert rules

| ID | Metric | Condition (min or max) | Window | Type | Severity | Notification | First action |
|---|---|---|---|---|---|---|---|
| A-01 | O-16 Synthetic availability | Minimum: success of at least 2 of the last 3 probes | 3 min | Threshold | P1 | Page | [Runbook R-1](#71-r-1-api-is-down-or-returns-errors) |
| A-02 | O-02 Error ratio (5xx) | Maximum 1 % (P1). Maximum 0.1 % for 15 min (P3). | 5 min and 15 min | Threshold | P1 and P3 | Page for P1. Ticket for P3. | [Runbook R-1](#71-r-1-api-is-down-or-returns-errors) |
| A-03 | O-01 Latency p95 | Maximum 300 ms for reads and 500 ms for writes (REQ-PERF-001) | 10 min | Threshold | P2 | Channel and page | Check O-05, O-07 and O-08. See [R-3](#73-r-3-database-problem). |
| A-04 | O-09 Outbox lag | Maximum 60 s (P2). Maximum 300 s (P1). | 5 min | Threshold | P2 and P1 | Channel (P2), page (P1) | [Runbook R-2](#72-r-2-events-do-not-flow-outbox-kafka-and-dead-letter-topics) |
| A-05 | O-10 Consumer lag and O-12 Delivery time | Maximum 5 000 messages of lag for 5 min, or p95 delivery time above 60 s (REQ-PERF-002) | 5 min | Threshold | P2 | Channel | Check the HPA. See [R-2](#72-r-2-events-do-not-flow-outbox-kafka-and-dead-letter-topics). |
| A-06 | O-11 Dead-letter depth | Maximum 0 (P2 for 1 or more messages). Maximum 50 (P1). | 1 min | Threshold | P2 and P1 | Channel (P2), page (P1) | [Runbook R-2](#72-r-2-events-do-not-flow-outbox-kafka-and-dead-letter-topics) |
| A-07 | O-07 RDS CPU, storage, connections | Maximum 80 % CPU for 10 min. Minimum 20 % free storage (P2), 10 % (P1). Maximum 80 % of the connection limit. | 10 min | Threshold | P2 and P1 | Channel and page | [Runbook R-3](#73-r-3-database-problem) |
| A-08 | O-14 Redis memory and evictions | Maximum 80 % memory. Maximum 0 evictions of `idem:` and `rl:` keys. Minimum cache hit ratio 70 %. | 10 min | Threshold | P2 | Channel | Scale the node type. Check key TTLs. |
| A-09 | O-17 Stuck trade requests | Maximum 0 requests in `EXECUTING` for more than 5 min | 5 min | Threshold | P2 | Channel | [Runbook R-4](#74-r-4-trade-requests-stuck-in-executing) |
| A-10 | O-13 MSK broker health | Minimum 1 active controller. Maximum 0 under-replicated partitions for 5 min. Maximum 85 % disk use. | 5 min | Threshold | P1 | Page | [Runbook R-2](#72-r-2-events-do-not-flow-outbox-kafka-and-dead-letter-topics) |
| A-11 | O-06 Pod health | Minimum 2 available replicas per service (P1 when below 1 replica). Maximum 3 restarts in 10 min (P2). | 5 min | Threshold | P1 and P2 | Page (P1), channel (P2) | `kubectl describe pod`, check `OOMKilled`, roll back the last release |
| A-12 | O-18 Security signals | Maximum 10 times the 7-day baseline of failed sign-ins, `401` or WAF blocks | 10 min | Anomaly | P2 | Channel and security owner | Check the source IP addresses in the WAF logs. Tighten the WAF rule. |
| A-13 | O-12 SES bounces and complaints | Maximum 5 % bounce rate, maximum 0.1 % complaint rate | 1 h | Threshold | P2 | Channel | Pause bulk invitations. Check the sending domain. |
| A-14 | Availability SLO burn rate | Burn rate above 14.4 over 1 h and over 5 min (P1). Burn rate above 6 over 6 h and over 30 min (P2). | 1 h and 6 h | Burn rate | P1 and P2 | Page (P1), channel (P2) | [Runbook R-1](#71-r-1-api-is-down-or-returns-errors) |
| A-15 | O-17 Job freshness | Maximum 3 intervals since the last success of a job (for example 3 min for the trade expiry job) | 3 intervals | Absence | P2 | Channel | Check the Lease holder and the fencing token in `job_runs` |

The burn rate in A-14 is the speed of the error budget use. A burn rate of 14.4 uses 2 % of the 30-day budget (43 min) in 1 h. Two windows (a long and a short one) reduce false alarms.

## 6. Alert routing and severity

| Severity | Meaning | Response time | Channel | Example |
|---|---|---|---|---|
| P1 critical | Users cannot use a core flow, or data is at risk | Acknowledge in 5 min, work starts at once, 24 hours a day | Page to the on-call engineer through Amazon SNS and AWS Chatbot. Escalate to the second engineer after 15 min. | A-01, A-02, A-10 |
| P2 high | Quality is lower, or a failure can become P1 soon | Acknowledge in 30 min during working hours | Team channel with a mention of the on-call engineer | A-03, A-04, A-06 |
| P3 warning | A trend or a small deviation | Next working day | Ticket and a weekly review | A-02 (0.1 %) |

Rules:

1. Each alert has a runbook link, a dashboard link and the `traceId` of an example failure, when one exists.
1. A composite alarm groups related alarms, so one cause gives one page (for example "Kafka down" groups A-04, A-05 and A-10).
1. Each P1 incident has a short post-incident review. The review lists the cause, the time to detect, the time to recover and the action items.
1. The team reviews all alert thresholds every 3 months and after each incident. An alert that nobody acts on is removed or changed.
1. A deployment to `staging` and `prod` shows a marker on the dashboards, so the team can link a change in the metrics to a release.

## 7. Mitigation plan for the most critical alerts

The plan covers the 4 alert groups that stop a core flow or put data at risk: the API outage (A-01, A-02, A-14), the event pipeline (A-04, A-06, A-10), the database (A-07), and stuck trades (A-09). Each runbook has the same structure: impact, first checks, actions, and exit criteria. The related design measures are in the [resiliency model](06-resiliency-model.md).

### 7.1 R-1: API is down or returns errors

| Item | Description |
|---|---|
| Alerts | A-01, A-02 (P1), A-14 |
| Impact | Employees cannot see or claim shifts. Managers cannot publish. The 99.9 % target (43 min per month) is at risk. |
| First checks (5 min) | 1. Open the "Service health" dashboard: which service and which route fail? 2. Is the failure only on one route or on all? 3. Was there a deployment in the last hour (the release marker)? 4. Check the ALB healthy host count, the WAF blocked requests, and the status of AWS services. |
| Actions | 1. **A bad release:** run `helm rollback` for the service. 2. **One pod or node:** delete the pod, cordon the node. 3. **A dependency fails:** check the circuit breaker state (O-15), the database (R-3) and Kafka (R-2). The API answers 503 with `Retry-After`, which is the designed behavior. 4. **A traffic flood:** check O-04 and O-18. Tighten the WAF rate rule or enable the stricter rule group. 5. **Overload:** scale the Deployment manually (`kubectl scale`) and raise the HPA maximum. |
| Exit criteria | The error ratio is below 0.1 % for 15 min. The synthetic probe passes. The burn rate is below 1. |
| After | Post-incident review. Report the minutes of downtime against the error budget. |

### 7.2 R-2: events do not flow (outbox, Kafka and dead-letter topics)

| Item | Description |
|---|---|
| Alerts | A-04, A-05, A-06, A-10 |
| Impact | Notifications, replicas and analytics are late or stale. API writes still succeed, because the outbox keeps the events. A long delay lowers the quality of the product (REQ-PERF-002) and the freshness of the membership cache. |
| First checks | 1. Is the outbox lag growing (O-09)? If yes, the relay or Kafka is the cause. 2. MSK: under-replicated partitions, active controller, disk (O-13). 3. Consumer lag per group (O-10): one group or all? 4. DLQ depth (O-11) and the error of the first message. |
| Actions | 1. **Relay stopped:** check the Lease holder and the logs of the service. Restart the pod. 2. **Broker problem:** let MSK recover. Check the broker disk. Increase the storage when above 85 %. 3. **Consumer lag:** check the HPA of the consumer. Scale up to the number of partitions (12). 4. **DLQ messages:** follow the replay procedure ([resiliency model](06-resiliency-model.md), section 7.1). Fix the cause first. 5. **Urgent case, stale membership:** delete the `principal:{sub}` key in Redis for the affected member. |
| Exit criteria | Outbox lag below 5 s. Consumer lag at the normal level. DLQ empty. |
| Data safety | No event is lost. The outbox holds the events up to the storage limit, and Kafka keeps 7 days. Consumers are idempotent, so a replay is safe. |

### 7.3 R-3: database problem

| Item | Description |
|---|---|
| Alerts | A-07, A-03 |
| Impact | One service has slow or failed writes. A failure of `scheduling_db` stops claims, assignments and publications. |
| First checks | 1. Which instance? 2. RDS events (a failover?). 3. CPU, connections and free storage (O-07). 4. Lock waits and deadlocks (O-08), and the top SQL in Performance Insights. |
| Actions | 1. **A Multi-AZ failover is in progress:** wait 60 to 120 s. The pool reconnects. The clients retry with the same key. 2. **Storage below 20 %:** raise the storage (gp3 autoscaling) and find the table that grows (the outbox or `notifications`). Run the cleanup job. 3. **High CPU or slow query:** find the query, add an index or stop the cause. Raise the instance class (a failover of about 60 s) if the load is real. 4. **Connection limit:** check the pool size and the number of pods. Stop the leak. 5. **Corruption or an operator error:** point-in-time restore ([resiliency model](06-resiliency-model.md), section 7.2). |
| Exit criteria | Latency back to the targets. No lock timeouts. The invariant queries of REQ-REL-001 return 0 rows. |

### 7.4 R-4: trade requests stuck in `EXECUTING`

| Item | Description |
|---|---|
| Alerts | A-09, A-06 |
| Impact | Two employees wait for a trade, and their assignments are locked. A lock ends at the expiry of the request, so the lock cannot block longer than the trade TTL. |
| First checks | 1. Is `ExecuteTrade` in `trade.commands.v1` or in the DLQ? 2. Does the Scheduling consumer lag (O-10)? 3. Is there a `TradeExecutionFailed` event? |
| Actions | 1. Replay the command from the DLQ (it is idempotent). 2. If the Scheduling service is down, follow R-1. 3. If the request cannot be repaired, let the expiry job move it to `EXPIRED` and release the locks, or run `ReleaseTradeLocks`. 4. Inform both employees (the notification is sent on `TradeExpired`). |
| Exit criteria | No request in `EXECUTING` for more than 5 min. Both assignments have no trade lock. |

## 8. Related documents

| Document | Content |
|---|---|
| [SRS](01-srs.md) | REQ-PERF-001, REQ-PERF-002, REQ-AVAIL-001, REQ-OBS-001 |
| [Architecture](02-architecture.md) | Observability design, jobs, outbox |
| [Resiliency model](06-resiliency-model.md) | Failure modes that these alerts detect, recovery procedures |
| [Deployment model](08-deployment-model.md) | Resources that the metrics describe, SNS and CloudWatch |
| [Analytics model](09-analytics-model.md) | Functional (business) metrics |
