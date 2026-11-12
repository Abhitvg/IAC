# Milestone M10 Demo: Analytics, A/B Testing Experiments, Privacy (DSAR), Localization, Accessibility & Billing Quotas

This document demonstrates the completion and verification of **Milestone M10** for CareerOps.

---

## 1. Overview of Capabilities

Milestone M10 finishes the autonomous CareerOps system with conversion analytics, scientific experimentation with statistical guardrails, GDPR/CCPA/DPDP privacy workflows, multi-locale internationalization, WCAG 2.1 AA accessibility auditing, and tiered billing enforcement:

### Core Components:

1. **A/B Experimentation Engine with Minimum-Sample Guardrails (`packages/cloud-core/src/experiments/`)**:
   - Supports optimization experiments on **CV Headlines** (`cv_headline`) and **Outreach Hooks** (`outreach_hook`).
   - **Deterministic Variant Assignment**: Assigns variants using SHA-256 modulus over applicant / job / recipient keys with balanced allocation weights.
   - **Minimum-Sample Guardrails**: Strictly prohibits declaring winners or concluding experiments before each variant reaches $N \ge 30$ impressions, preventing false-positive premature optimizations.
   - **Two-Proportion Z-Test Significance**: Calculates pooled standard error, Z-scores, and two-tailed $p$-values ($\alpha = 0.05$). Automatically detects true conversion lift and updates experiment status to `concluded`.
   - **Hard Line H6 Compliance**: Rejects any variant content containing prohibited outcome guarantee claims.

2. **Funnel Analytics & Conversion Engine (`packages/cloud-core/src/analytics/funnel.ts`)**:
   - Tracks candidates through all six stages: Discovered $\rightarrow$ Evaluated $\rightarrow$ Applied/Contacted $\rightarrow$ Replied $\rightarrow$ Interviewed $\rightarrow$ Offered.
   - Computes stage-by-stage conversion rates and overall interview yield.
   - Calculates funnel velocity metrics: `timeToFirstApplicationHours`, `timeToFirstReplyHours`, and `timeToFirstInterviewHours`.
   - Breaks down attribution by channel (`ats`, `email`, `referral`, `linkedin_assist`).

3. **Data Subject Access Requests (DSAR) & GDPR Erasure (`packages/cloud-core/src/privacy/dsar.ts`)**:
   - **Full DSAR Export (GDPR Art. 15 / CCPA / DPDP)**: Gathers confirmed Career Graph facts, signed contracts, applications, outreach history, and audit summaries into a cryptographically sealed package with SHA-256 manifest.
   - **Right to Erasure (GDPR Art. 17 / DPDP Sec. 12)**: Purges tenant candidate records across database tables and generates an immutable, tamper-evident deletion receipt with SHA-256 audit digest.

4. **Multi-Locale Internationalization (`packages/cloud-core/src/i18n/locale.ts`)**:
   - Out-of-the-box support for 5 global locales: `en-US`, `en-GB`, `fr-FR`, `de-DE`, `hi-IN`.
   - Localized translations for core system terms, currency formatting, and date formatting.

5. **Accessibility (a11y) WCAG 2.1 AA Auditing (`packages/cloud-core/src/a11y/standards.ts`)**:
   - Static component markup auditor checking WCAG 1.1.1 (non-text content alt text), WCAG 1.3.1 (form labels/aria-label), WCAG 4.1.2 (name/role/value), and WCAG 4.1.3 (aria-live on feed).
   - Generates accessible button props for Assist Queue items requiring one-click user interaction.

6. **Billing Tier Quotas & Usage Guardrails (`packages/cloud-core/src/billing/tier-enforcer.ts`)**:
   - Enforces limits across `starter`, `sprint_pro`, and `enterprise` tiers for concurrent sprints, monthly applications, and monthly outreach volume.

7. **Database & API Endpoints**:
   - Migration `0012_experiments_and_analytics.sql`: Tables `experiments`, `experiment_variants`, `experiment_events`, `dsar_requests` with tenant RLS.
   - `POST /v1/experiments`: Register A/B experiment.
   - `GET /v1/experiments`: List experiments and calculate statistical significance.
   - `POST /v1/experiments/event`: Record impression or conversion event.
   - `GET /v1/analytics/funnel`: Compute funnel metrics and velocity.
   - `POST /v1/privacy/dsar/export`: Generate sealed candidate DSAR export.
   - `POST /v1/privacy/dsar/delete`: Cryptographically purge tenant candidate data.
   - `GET /v1/billing/usage`: Report usage vs tier quotas.

---

## 2. Verification & Test Suite

Run the M10 test suite:
```bash
npx vitest run tests/m10-*.test.ts
```

Output:
```text
 ✓ tests/m10-privacy-dsar.test.ts (2 tests)
 ✓ tests/m10-analytics-funnel.test.ts (1 test)
 ✓ tests/m10-ab-experiments.test.ts (4 tests)
 ✓ tests/m10-i18n-a11y-billing.test.ts (3 tests)
 ✓ tests/m10-api-m10.test.ts (5 tests)

 Test Files  5 passed (5)
      Tests  15 passed (15)
```

Run all project milestone suites:
```bash
npx vitest run tests/m*.test.ts
# 205 passed across 45 files
```

Check static types, security, and build:
```bash
npm run typecheck:cloud
npm run security:source
npm run build:api
```

---

## 3. End-to-End Walkthrough

### Scenario A: A/B Testing with Minimum Sample Guardrails
```bash
# Register experiment
curl -X POST http://localhost:3000/v1/experiments \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Outreach Hook Optimization",
    "targetDimension": "outreach_hook",
    "minSampleSize": 30,
    "variants": [
      { "id": "hook_a", "name": "Direct Ask", "content": "I noticed your team scaling backend infrastructure..." },
      { "id": "hook_b", "name": "Technical Depth", "content": "I reviewed your tech blog post on distributed consensus..." }
    ]
  }'
```
Response:
```json
{
  "experiment": {
    "name": "Outreach Hook Optimization",
    "targetDimension": "outreach_hook",
    "status": "running",
    "minSampleSize": 30
  }
}
```

### Scenario B: Funnel Analytics Reporting
```bash
curl -X GET http://localhost:3000/v1/analytics/funnel \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>"
```
Response:
```json
{
  "funnelReport": {
    "counts": {
      "discovered": 120,
      "evaluated": 80,
      "appliedOrContacted": 65,
      "repliesReceived": 12,
      "interviewsScheduled": 3,
      "offersReceived": 0
    },
    "conversionRates": {
      "evaluationRate": 0.6667,
      "applicationRate": 0.8125,
      "replyRate": 0.1846,
      "interviewConversionRate": 0.25,
      "overallYield": 0.0462
    },
    "velocity": {
      "timeToFirstApplicationHours": 2.5,
      "timeToFirstReplyHours": 18.0,
      "timeToFirstInterviewHours": 36.0
    }
  }
}
```

### Scenario C: Candidate DSAR Data Erasure
```bash
curl -X POST http://localhost:3000/v1/privacy/dsar/delete \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>"
```
Response:
```json
{
  "receipt": {
    "tenantId": "10000000-0000-4000-8000-000000000001",
    "deletedAt": "2026-11-12T10:35:00.000Z",
    "recordsPurged": {
      "careerGraphFacts": 12,
      "contracts": 1,
      "applications": 24,
      "people": 30,
      "outreachMessages": 15,
      "sprintRuns": 2
    },
    "deletionAuditSha256": "4a7c...",
    "complianceNotice": "All candidate personal identifiable information (PII) and activity records have been cryptographically purged in compliance with GDPR Article 17, CCPA, and India DPDP Section 12."
  }
}
```

