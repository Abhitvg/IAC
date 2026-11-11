# ADR 0003: Temporal for durable Sprint and connector workflows

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

A Sprint lasts 72–96 hours and coordinates polling, retries, quiet hours, follow-ups, inbox checks, channel pauses and cancellation. A process-local timer or basic in-memory queue cannot provide durable execution semantics.

## Decision

Use Temporal for long-running workflows, timers, retries, cancellation, activity history and recovery. Activities perform external side effects and must use idempotency keys, bounded timeouts and explicit retry classifications.

## Consequences

- Temporal infrastructure and worker deployment become M0/M3 operational dependencies.
- Workflow code must be deterministic; I/O belongs in activities.
- Workflow payloads contain opaque references rather than raw resumes, email bodies or OAuth tokens.
- Queue retries never bypass consent, caps, suppression, kill switches or connector health checks.
- Operational overhead is higher than BullMQ, accepted for durable long-running orchestration.
