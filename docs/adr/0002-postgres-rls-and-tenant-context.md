# ADR 0002: PostgreSQL row-level security is the tenant isolation boundary

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

CareerOps stores personal and employment data and will run workflows for many users. Application-level tenant filters alone are too easy to omit.

## Decision

Use PostgreSQL with RLS on every tenant-owned table. Resolve tenant membership from verified server-side identity claims. Set tenant context transaction-locally and fail closed if context is missing. Include tenant-scoped foreign keys and contract tests that attempt cross-tenant reads/writes through API and worker paths.

## Consequences

- No client-supplied tenant ID grants access.
- Migrations must enable and force RLS where supported, and policies must cover SELECT/INSERT/UPDATE/DELETE.
- Privileged cross-tenant maintenance requires a separate service role, explicit purpose and audit.
- Connection pooling must not leak tenant context between transactions.
