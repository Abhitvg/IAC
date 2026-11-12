# Milestone M9 Demo: Sprint Mode Orchestration, Contextual Bandit Allocator, Auto-Pause Triggers & Outcome Forecaster

This document demonstrates the completion and verification of **Milestone M9** for CareerOps.

---

## 1. Overview of Capabilities

Milestone M9 delivers the complete **Sprint Mode (72-96 Hours)** autonomous job-search lifecycle engine, enforcing strict zero-guarantee statutory disclaimers (**Hard Line H6**) and standing-consent auto-pause safety triggers:

### Core Components:

1. **Sprint Mode Orchestrator (`packages/cloud-core/src/sprint/sprint-orchestrator.ts`)**:
   - Manages the complete autonomous lifecycle:
     - **T+0**: Sprint initialization, Sprint Contract validation, Career Graph truthfulness baseline check.
     - **T+0 to T+6h**: Discovery sweep across ATS job boards, job evaluation against candidate facts, tailoring top roles, first warm referral / outreach wave.
     - **T+6h onward**: Wave cadence (ATS apply waves every 3-4 hours, outreach waves within daily caps, inbox watch every 5 minutes).
     - **Compressed Follow-ups**: Day 2 (48h) and Day 4 (96h) automatic touchpoints, then permanent cessation.
     - **Sprint Report**: Complete funnel metrics (discovered, evaluated, submitted, outreach, replies, interviews), conversion rates, learnings, and next-step actions.

2. **Adaptive Allocator / Contextual Multi-Armed Bandit (`packages/cloud-core/src/sprint/allocator.ts`)**:
   - Treats combinations of `(channel, targetRole, templateId)` as arms in a contextual multi-armed bandit.
   - Balances exploration (trying different roles/templates) and exploitation (weighting arms that produce replies and interview invitations).
   - **Low-Yield Stopping Rule**: Automatically halts arms that fail to produce results after minimum sample size ($N \ge 8$ attempts with 0 successes), reallocating daily quotas to top-performing combinations.

3. **Standing-Consent Auto-Pause Triggers Coordinator (`packages/cloud-core/src/sprint/auto-pause.ts`)**:
   - Replaces human approvals with continuous automated quality and safety gates:
     - **Email Bounce Rate > 5%**: Auto-pauses `email` channel immediately to preserve domain reputation.
     - **Any Spam Complaint (> 0)**: Auto-pauses `email` channel immediately.
     - **ATS Submission Failure Rate > 15%** (on $\ge 5$ attempts): Auto-pauses `ats` channel to prevent layout mismatch loops.
     - **Truthfulness Gate Failure Rate > 10%** (on $\ge 5$ attempts): Auto-pauses both `ats` and `email` generation (enforcing Hard Line H3).
     - **Negative Reply Rate > 40%** (on $\ge 5$ replies): Auto-pauses `email` outreach for template tone review.
     - **External Alerts**: Mailbox delivery warnings pause `email`; candidate-reported LinkedIn restriction notices pause `linkedin_assist`.

4. **Calibrated Outcome Forecaster (`packages/cloud-core/src/sprint/forecaster.ts`)**:
   - **Hard Line H6 Enforcement**: Absolute code-level rejection of outcome guarantees anywhere in UI, API, or marketing copy. Prohibits terms like "guaranteed interview", "100% chance", "ensures you get a job".
   - Generates Bayesian probabilistic ranges (e.g. 80% credible interval) based on historical population priors (ATS ~3%, Outreach ~4%, Referrals ~20%) and incorporates observed tenant evidence.
   - Outputs statutory calibration notes and explicit H6 disclaimers on every forecast response.

5. **Database & API Endpoints**:
   - Migration `0011_sprint_orchestration.sql` with forced tenant RLS for `sprint_runs`, `sprint_allocations`, and `sprint_auto_pause_events`.
   - `POST /v1/sprint/start`: Starts sprint, returns forecast and phase, validates H6 compliance.
   - `GET /v1/sprint/current`: Retrieves active sprint, phase, bandit arms, and auto-pause status.
   - `POST /v1/sprint/pause`: Pauses active sprint.
   - `POST /v1/sprint/resume`: Resumes active sprint.
   - `GET /v1/sprint/forecast`: Generates calibrated Bayesian outcome forecast.
   - `POST /v1/sprint/rebalance`: Dynamically updates bandit arm allocation weights.
   - `POST /v1/sprint/trigger-event`: Ingests metrics or external alerts, auto-pausing channels when thresholds breach.
   - `GET /v1/sprint/report`: End-of-sprint funnel and conversion report.

---

## 2. Verification & Test Suite

Run the M9 test suite:
```bash
npx vitest run tests/m9-*.test.ts
```

Output:
```text
 ✓ tests/m9-adaptive-allocator.test.ts (3 tests)
 ✓ tests/m9-forecaster-h6.test.ts (3 tests)
 ✓ tests/m9-auto-pause-triggers.test.ts (6 tests)
 ✓ tests/m9-sprint-orchestrator.test.ts (4 tests)
 ✓ tests/m9-api-sprint.test.ts (5 tests)

 Test Files  5 passed (5)
      Tests  21 passed (21)
```

Run all project milestone suites:
```bash
npx vitest run tests/m*.test.ts
# 190 passed across 40 files
```

Check static types, security, and build:
```bash
npm run typecheck:cloud
npm run security:source
npm run build:api
```

---

## 3. End-to-End Walkthrough

### Scenario A: Enforcing Hard Line H6 (Rejection of Prohibited Guarantees)
```bash
curl -X POST http://localhost:3000/v1/sprint/start \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetDurationHours": 72,
    "marketingNote": "We guarantee you will get 5 job offers in 72 hours."
  }'
```
Response:
```json
{
  "error": "Hard Line H6 Violation: Prohibited outcome guarantee phrase detected matching pattern \"guarantee(d|s)?\"."
}
```

### Scenario B: Start a Compliant 72-Hour Sprint Mode Run
```bash
curl -X POST http://localhost:3000/v1/sprint/start \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetRoles": ["Staff Backend Engineer"],
    "targetDurationHours": 72
  }'
```
Response:
```json
{
  "sprint": {
    "id": "sprint_1700000000",
    "status": "active",
    "targetDurationHours": 72,
    "startedAt": "2026-11-12T10:00:00.000Z"
  },
  "phase": "T0_INITIALIZING",
  "forecast": {
    "expectedInterviewsMin": 1,
    "expectedInterviewsMax": 4,
    "confidenceInterval": "80% Bayesian credible interval",
    "calibrationNotes": [
      "Bayesian prior initialized from population baseline: ATS ~3.0%, Email ~4.0%, Referrals ~20.0%.",
      "Posterior currently operating on historical population priors prior to wave execution.",
      "Target Sprint duration: 72 hours (3.0 days active).",
      "Range spans an 80% credible interval based on binomial variance across enabled channels."
    ],
    "hardLineH6Notice": "HARD LINE H6 COMPLIANCE: CareerOps does not guarantee or promise any specific number of job offers, interviews, or employment outcomes..."
  }
}
```

### Scenario C: Standing-Consent Auto-Pause on Bounce Spike
```bash
curl -X POST http://localhost:3000/v1/sprint/trigger-event \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": {
      "emailOutreachSent": 20,
      "emailBounces": 2
    }
  }'
```
Response:
```json
{
  "result": {
    "shouldPause": true,
    "affectedChannels": ["email"],
    "event": {
      "channel": "email",
      "triggerType": "bounce_rate_spike",
      "metricValue": 0.1,
      "threshold": 0.05,
      "details": "Email bounce rate (10.0%) exceeded critical safety threshold of 5%. Channel auto-paused."
    }
  }
}
```
The email channel is paused immediately in tenant control state without requiring manual human intervention.

