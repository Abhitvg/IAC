# ADR 0001: Introduce a cloud service boundary while preserving Electron as the interview client

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The current product is an Electron desktop app. CareerOps and candidate data live in renderer stores and localStorage; live audio, Whisper and interview assistance rely on Electron IPC. The new product requires multi-tenant web/API/worker execution.

## Decision

Create a cloud API and web/worker applications as separate trust domains. Electron remains a client for live-interview capture and assistance. Desktop clients authenticate to the cloud through a narrow HTTPS API. Local IPC remains local-only and is never exposed as a cloud service endpoint.

## Consequences

- Cloud CareerOps becomes the source of truth after explicit migration.
- Live audio/Whisper remains in Electron initially; transcript/session sync is opt-in.
- Local-first is no longer an architectural constraint, but local recovery/export remains supported.
- No direct access to renderer Zustand stores from cloud code.
- A staged data migration and compatibility window are required.
