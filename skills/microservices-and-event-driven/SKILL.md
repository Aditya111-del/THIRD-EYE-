---
name: microservices-and-event-driven
description: Design and build scalable event-driven microservices with Kafka, RabbitMQ, Redis Streams, CQRS, and distributed tracing
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Microservices & Event-Driven Architecture Mastery Skill

## Core Philosophy: Loose Coupling, High Availability, Eventual Consistency
When engineering microservices, the architecture must guarantee partition tolerance, prevent cascading failures, maintain data integrity across boundaries, and provide complete observability across distributed service graphs.

---

## 1. Zero-Stub & Architecture Mandate
- **NEVER create distributed services with hidden point-to-point hard dependencies.**
- **Full Architecture Requirements**:
  1. **Domain Event Modeling**: Events represent immutable domain facts in past tense (`UserRegistered`, `OrderPlaced`, `PaymentProcessed`) with unique `eventId`, `timestamp`, `aggregateId`, and `version`.
  2. **Transactional Outbox Pattern**: Store domain changes and outbox events in the same database transaction. Never publish to message brokers before the local DB commit succeeds.
  3. **Idempotent Consumers**: Every consumer must verify whether an `eventId` was already processed (using a deduplication table or Redis TTL key) to guarantee exactly-once processing semantics.
  4. **Dead Letter Queues (DLQ) & Exponential Retries**: Transient network failures retry with backoff and jitter. Unrecoverable schema/business errors route to a dedicated DLQ for inspection and alerting.
  5. **Circuit Breakers & Timeouts**: Wrap inter-service REST/gRPC calls in circuit breakers (e.g., Opossum or Cockatiel) to fail fast when downstream services degrade.
  6. **Observability & Distributed Tracing**: Propagate W3C Trace Context headers (`traceparent`, `tracestate`) across all HTTP calls and message envelopes using OpenTelemetry.

---

## 2. Event Envelope Standard
```typescript
export interface DomainEvent<T = unknown> {
  id: string;             // UUIDv4
  type: string;           // e.g. "order.created.v1"
  source: string;         // e.g. "order-service"
  specVersion: "1.0";
  time: string;           // ISO 8601 UTC
  correlationId: string;  // Trace ID
  data: T;
}
```

---

## 3. Implementation Patterns

### Message Brokers
- **Apache Kafka / Redpanda**: For high-throughput append-only event streams and event sourcing. Define topic partitions by entity ID to guarantee ordered delivery per entity.
- **RabbitMQ**: For complex routing, AMQP topic exchanges, direct worker task queues, and priority queues.
- **Redis Streams / BullMQ**: For lightweight, low-latency background jobs and stream consumer groups with sub-millisecond dispatch.

### Health Checks & Graceful Termination
- Expose `/health/live` and `/health/ready` endpoints.
- Intercept `SIGTERM` / `SIGINT`: Stop accepting new events, drain active processing buffers within a 15-second grace period, then close broker connections cleanly.

---

## 4. Production Verification Checklist
1. All message schemas are validated with Zod / Avro / Protobuf before consumption.
2. Simulated broker disconnections trigger automatic reconnect without process crash.
3. Consumers record completion ACKs only after downstream persistence succeeds.
