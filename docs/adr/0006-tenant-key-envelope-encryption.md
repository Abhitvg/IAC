# ADR 0006: Tenant-scoped envelope encryption and managed OAuth secrets

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The service will hold resumes, contacts, interview data, mailbox/calendar grants and application proof. Database disk encryption alone does not provide tenant-specific cryptographic separation.

## Decision

Use KMS-backed envelope encryption with tenant-scoped DEKs and authenticated encryption context. Store wrapped keys and key versions, never plaintext DEKs. Store OAuth tokens in a secrets manager and only opaque references/metadata in PostgreSQL. Object storage access uses short-lived authorized URLs.

## Consequences

- Key rotation, recovery, revocation and destruction are part of the data lifecycle.
- Tenant deletion must revoke connector tokens and delete or schedule deletion of encrypted objects and wrapped keys.
- Logs and traces never contain secrets or raw PII by default.
- Cloud encryption does not remediate legacy plaintext local records; issue #72 remains open until its separate acceptance criteria pass.
