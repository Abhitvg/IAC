# Milestone M7 Demo: Person Graph, Ranking, Email Outreach Engine & Adaptive Caps

This document demonstrates the completion and verification of **Milestone M7** for CareerOps.

---

## 1. Overview of Capabilities

Milestone M7 implements the high-yield, compliant cold outreach engine designed for high-conversion networking:

1. **Person Graph & Explainable Ranking (`packages/cloud-core/src/person-graph/`)**:
   - Scores contacts along 5 explainable dimensions:
     - `warmth` (1st degree, alumni, ex-colleagues, open source collaborators, cold verified)
     - `relevance` (hiring managers, recruiters, peer engineers in target domain)
     - `reachability` (verified deliverability score)
     - `recencyActivity` (contact frequency, active cooldowns)
     - `reciprocityPotential` (shared mutual aid or collaboration)
   - Outputs ranked lists with clear natural-language rationale for every recommendation.

2. **Hard Line H4 Contact Verification & Compliance (`packages/cloud-core/src/outreach/compliance.ts`)**:
   - **Hard Line H4**: Outreach permitted only to verified business channels from licensed providers, public company pages, or confirmed connections. Guessed or SMTP-probed addresses are rejected at the schema level.
   - **Global Suppression List**: Immediate blocking by email address or root company domain upon opt-out, bounce, or complaint.
   - **Recipient Quiet Hours**: Strictly enforces quiet hours (no emails between 8:00 PM and 8:00 AM recipient local time), calculated accurately using the recipient's IANA time zone.
   - **Region-Aware Compliance Footers**:
     - **US**: CAN-SPAM Act compliant with physical address and clear opt-out.
     - **EU / UK**: GDPR / PECR B2B legitimate interest disclosure and one-click unsubscribe.
     - **IN**: India DPDP purpose and sender identification notice.

3. **Adaptive Daily Caps & Mailbox Health Engine (`packages/cloud-core/src/outreach/adaptive-caps.ts`)**:
   - **Standing-Consent Auto-Pause Triggers**:
     - If bounce rate exceeds **5%**: AUTO-PAUSES `email` channel immediately and alerts candidate.
     - If any **spam complaint** is detected: AUTO-PAUSES `email` channel immediately.
   - **Dynamic Throttling**: Reduces daily cap by 50% if bounce warnings (2%-5%) emerge; safely scales up when reply rates and deliverability are strong.

4. **Outreach Engine Guardrails (`packages/cloud-core/src/outreach/outreach-engine.ts`)**:
   - **Max 3 contacts per company per role**: Prevents company-wide spamming.
   - **30-day cooldown per person**: Prohibits re-contacting the same person within a month.
   - **Concise 60-100 word plain text**: Single clear ask, verified hook from confirmed Career Graph facts (H3 truthfulness), sender identity + opt-out line.
   - **Sprint Mode Cadence**: Step 1 (Initial), Step 2 (Day 2 follow-up), Step 3 (Day 4 final follow-up), then permanently stop.

5. **Database & API Endpoints**:
   - Migration `0009_person_graph_and_outreach.sql` with forced tenant RLS for `people`, `suppression_list`, and `outreach_messages`.
   - `POST /v1/people`: Contact ingestion with strict verification source validation.
   - `GET /v1/people`: List contacts, optionally sorted by explainable ranking score.
   - `POST /v1/outreach/send`: Execute single outreach message within compliance rules.
   - `POST /v1/outreach/opt-out`: Suppress recipient and update CRM stage.
   - `GET /v1/outreach/health`: Returns current mailbox metrics and adaptive cap.

---

## 2. Verification & Test Suite

Run the M7 test suite:
```bash
npx vitest run tests/m7-*.test.ts
```

Output:
```text
 ✓ tests/m7-person-graph-ranking.test.ts (4 tests)
 ✓ tests/m7-adaptive-caps-health.test.ts (4 tests)
 ✓ tests/m7-outreach-engine.test.ts (5 tests)
 ✓ tests/m7-compliance-suppression.test.ts (4 tests)
 ✓ tests/m7-api-outreach.test.ts (5 tests)

 Test Files  5 passed (5)
      Tests  22 passed (22)
```

Run all project milestone suites:
```bash
npx vitest run tests/m*.test.ts
# 153 passed across 30 files
```

Check static types, security, and build:
```bash
npm run typecheck:cloud
npm run security:source
npm run build:api
```

---

## 3. End-to-End Walkthrough

### Scenario A: Contact Ingestion & Rejection of Guessed Emails (H4)
```bash
# Attempt to ingest an unverified guessed address (Rejected by Hard Line H4)
curl -X POST http://localhost:3000/v1/people \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "guessed@startup.io",
    "name": "Target Recruiter",
    "company": "Startup",
    "title": "Recruiter",
    "roleDomain": "recruiter",
    "relationship": "cold",
    "verificationSource": "smtp_probe_guessed"
  }'
```
**Response:** `422 Unprocessable Entity`
```json
{
  "error": "Hard Line H4: Contact guessed@startup.io has unauthorized verification source \"smtp_probe_guessed\"."
}
```

### Scenario B: Sending Personalized Outreach with Truthful Hook & Caps
```bash
curl -X POST http://localhost:3000/v1/outreach/send \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "personId": "<PERSON_ID>",
    "targetRoleTitle": "Staff Backend Engineer",
    "hook": "scaling distributed payment ledgers processing 50k tps",
    "sequenceStep": 1
  }'
```
**Response:**
```json
{
  "execution": {
    "status": "sent",
    "personId": "<PERSON_ID>",
    "email": "alex@stripe.com",
    "subject": "Staff Backend Engineer inquiry - Alice Turing",
    "wordCount": 68,
    "sendResult": {
      "success": true,
      "messageId": "msg_out_stripe_1"
    }
  }
}
```

### Scenario C: Global Suppression (Opt-Out)
```bash
curl -X POST http://localhost:3000/v1/outreach/opt-out \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex@stripe.com",
    "reason": "opt_out"
  }'
```
**Response:**
```json
{
  "success": true,
  "email": "alex@stripe.com",
  "reason": "opt_out"
}
```
Any subsequent attempt to email `alex@stripe.com` will immediately return `skipped_suppressed`.

