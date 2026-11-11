# M2 Application Tracker, State Machine, Dashboard & Real-Time Feed — Demo and Validation

## Scope

Milestone 2 establishes the end-to-end application lifecycle tracking system for CareerOps autonomous job search:

- **Application State Machine**: Governs the 13-stage lifecycle:
  `scouted` → `evaluated` → `tailored` → `queued` → `submitting` → `applied` → `outreach_sent` → `replied` → `interviewing` → `offer` → `rejected` → `withdrawn` → `archived`.
- **Invariants & Transition Enforcement**:
  - `applied` transition requires verified submission proof (`submissionId`, `submittedAt`, optional `proofUrl`, `payloadSha256`).
  - `withdrawn` transition requires an explicit reason (undo/withdraw workflow).
  - Terminal state invariants (archived applications cannot be transitioned).
- **PostgreSQL Database Schema (`0006_application_tracker.sql`)**:
  - `applications`: Multi-tenant application storage with forced Row-Level Security (RLS).
  - **Duplicate-application guard**: Unique constraint on `(tenant_id, company, role, external_job_id)` preventing duplicate submissions.
  - `application_timeline_events`: Append-only audit history of every status change.
  - `activity_feed_events`: Real-time system activity log.
- **Dashboard & Metrics Aggregator**:
  - Aggregates status counts, daily submission counts against active sprint caps, interview conversion rates, and channel distribution.
- **Real-Time Activity Feed & SSE Hub**:
  - `GET /v1/activity-feed/stream`: Server-Sent Events (SSE) stream delivering live activity events strictly isolated by tenant.
  - `globalActivityHub`: In-memory dispatcher providing zero-leak cross-tenant isolation.
- **Authenticated Cloud API Routes**:
  - `GET /v1/applications`: Lists applications with optional status filter and pagination.
  - `POST /v1/applications`: Tracks a new scouted role (guarded against duplicates).
  - `GET /v1/applications/:id`: Retrieves application with full timeline history.
  - `POST /v1/applications/:id/transition`: Moves application to next stage with invariant enforcement.
  - `POST /v1/applications/:id/withdraw`: Withdraws/undoes application with reason.
  - `GET /v1/dashboard/stats`: Returns live dashboard metrics.
  - `GET /v1/activity-feed`: Returns recent activity events.
  - `GET /v1/activity-feed/stream`: Connects to real-time SSE stream.

---

## Run Locally

1. Verify TypeScript types:
   ```bash
   npm run typecheck:cloud
   ```
2. Run M2 test suites:
   ```bash
   npx vitest run tests/m2-tracker-state-machine.test.ts tests/m2-activity-feed-sse.test.ts tests/m2-api-applications.test.ts
   ```
3. Run complete cloud foundation, M1, and M2 test suite:
   ```bash
   npx vitest run tests/m2-*.test.ts tests/m1-*.test.ts tests/career-graph*.test.ts tests/cloud-*.test.ts
   ```
4. Verify source secret hygiene:
   ```bash
   npm run security:source
   ```

---

## Demo Script

### 1. Connect to Real-time Activity Stream

Open an SSE connection to `GET /v1/activity-feed/stream` with an authenticated bearer token:

```bash
curl -N -H "Authorization: Bearer <TOKEN>" http://localhost:8080/v1/activity-feed/stream
```

**Expected**: Stream starts immediately with initial ready event:

```
event: ready
data: {"tenantId":"...","requestId":"..."}
```

### 2. Create a Scouted Application

Call `POST /v1/applications`:

```json
{
  "company": "Stripe",
  "role": "Staff Software Engineer",
  "sourceUrl": "https://stripe.com/jobs/123",
  "channel": "ats",
  "score": 4.8
}
```

**Expected**:

- Returns `201 Created` with application ID and initial `scouted` status.
- SSE stream receives an `application.created` event in real time.

### 3. Verify Duplicate-Application Guard

Attempt to submit the identical company and role again:

```json
{
  "company": "Stripe",
  "role": "Staff Software Engineer",
  "channel": "ats"
}
```

**Expected**: Returns `409 Conflict` with `Duplicate application guard: already tracking Stripe - Staff Software Engineer`.

### 4. Transition Application with Proof

Call `POST /v1/applications/:id/transition` moving from `scouted` → `evaluated` → `tailored` → `queued` → `submitting` → `applied`:

```json
{
  "toStatus": "applied",
  "submissionProof": {
    "submissionId": "stripe-sub-9988",
    "submittedAt": "2026-11-12T04:40:00.000Z",
    "proofUrl": "https://proofs.example.test/stripe-confirmation.png"
  }
}
```

**Expected**:

- Transitions to `applied`.
- SSE stream receives `application.status_changed` event.
- If called without `submissionProof`, returns `400 Bad Request`.

### 5. Undo / Withdraw Application

Call `POST /v1/applications/:id/withdraw`:

```json
{
  "reason": "Accepted another offer"
}
```

**Expected**:

- Moves status to `withdrawn`.
- Records timeline event with withdrawal reason.

### 6. Inspect Dashboard Metrics

Call `GET /v1/dashboard/stats`:
**Expected**: Returns `200 OK` with counts by status, daily applications remaining, and interview conversion rate.

---

## Next Milestone

- **M3**: Job Discovery Connectors (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday), Ghost/Scam Filter, Deduplication Engine, and Discovery Scheduler.
