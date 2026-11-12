# Milestone M8 Demo: LinkedIn Compliant Layer & Assist Queue Extension

This document demonstrates the completion and verification of **Milestone M8** for CareerOps.

---

## 1. Overview of Capabilities

Milestone M8 implements the LinkedIn compliant integration layer adhering strictly to **Hard Line H1**:
> **H1**: No unattended automation of LinkedIn actions (connection requests, messages, profile visits, scraping, auto-likes). Never store or use users' LinkedIn passwords or session cookies server-side. LinkedIn integration = official OAuth sign-in/basic profile, user-uploaded data export, and the Assist Queue (prepared actions the user executes with one click each in their own browser; the extension acts only on a user gesture).

### Core Components:

1. **OAuth Sign-In & Basic Profile Verification (`packages/cloud-core/src/linkedin/oauth.ts`)**:
   - Official OpenID Connect / OAuth flow (`openid profile email`).
   - **Hard Line H1 Guardrail**: Specifically detects and permanently rejects raw passwords, session cookies (`li_at`, `JSESSIONID`), or scraping access tokens. Storing user credentials server-side throws an immediate security error.

2. **User-Uploaded Data Export Parser (`packages/cloud-core/src/linkedin/export-importer.ts`)**:
   - Parses official user data exports (`Connections.csv`).
   - Ingests 1st-degree connections directly into the candidate's **Person Graph** with `verificationSource: 'user_imported_connection'`.
   - Normalizes roles, companies, and connection dates while preserving data integrity.

3. **Profile Optimization Audit & Recruiter-Visible Guidance (`packages/cloud-core/src/linkedin/profile-audit.ts`)**:
   - Scores candidate profiles across Headline, About/Summary, and Skills.
   - Generates actionable, ATS/recruiter search-optimized rewrite recommendations.
   - Provides strategic "Open to Work" guidance targeting `recruiters_only` to maximize discovery by hiring teams without exposing a public green banner to current employers.

4. **Assist Queue Protocol (`packages/cloud-core/src/linkedin/assist-protocol.ts`)**:
   - Renders ranked prefilled connection notes and messages directly to the candidate.
   - Enforces LinkedIn's 300-character connection note limit.
   - **Hard Line H1 Enforcement**: Strictly marks every queue item with `userGestureRequired: true` and `requiresUserAction: true`. Unattended execution is blocked by design.

5. **Restriction Report & Standing Consent Auto-Pause (`packages/cloud-core/src/linkedin/restrictions.ts`)**:
   - Immediately auto-pauses all LinkedIn assist queue activities across the tenant when any LinkedIn warning or restriction notice is reported.
   - Alerts the user and provides actionable guidance on cooldown duration.

6. **Database & API Endpoints**:
   - Migration `0010_linkedin_audit.sql` with forced tenant RLS for `linkedin_profile_audits`.
   - `POST /v1/linkedin/oauth/token`: Secure OAuth profile verification.
   - `POST /v1/linkedin/import-export`: Process user-provided `Connections.csv`.
   - `POST /v1/linkedin/profile-audit`: Profile audit and Open to Work recommendations.
   - `GET /v1/assist-queue/linkedin`: Retrieve ranked Assist Queue actions for user-gesture browser execution.
   - `POST /v1/linkedin/report-restriction`: Report platform restriction and auto-pause.

---

## 2. Verification & Test Suite

Run the M8 test suite:
```bash
npx vitest run tests/m8-*.test.ts
```

Output:
```text
 ✓ tests/m8-linkedin-export-importer.test.ts (3 tests)
 ✓ tests/m8-linkedin-profile-audit.test.ts (2 tests)
 ✓ tests/m8-linkedin-assist-queue.test.ts (3 tests)
 ✓ tests/m8-linkedin-oauth-security.test.ts (2 tests)
 ✓ tests/m8-api-linkedin.test.ts (6 tests)

 Test Files  5 passed (5)
      Tests  16 passed (16)
```

Run all project milestone suites:
```bash
npx vitest run tests/m*.test.ts
# 169 passed across 35 files
```

Check static types, security, and build:
```bash
npm run typecheck:cloud
npm run security:source
npm run build:api
```

---

## 3. End-to-End Walkthrough

### Scenario A: Rejection of Session Cookies or Passwords (Hard Line H1)
```bash
curl -X POST http://localhost:3000/v1/linkedin/oauth/token \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "auth-code",
    "redirectUri": "https://app.careerops.io/auth/linkedin/callback",
    "cookie": "li_at=AQEDA..."
  }'
```
Response:
```json
{
  "error": "Hard Line H1 Violation: LinkedIn session cookies and passwords cannot be stored or used server-side."
}
```

### Scenario B: Import Official Connections Export into Person Graph
```bash
curl -X POST http://localhost:3000/v1/linkedin/import-export \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "csvContent": "First Name,Last Name,URL,Email Address,Company,Position,Connected On\nAda,Lovelace,https://linkedin.com/in/ada,ada@example.com,Analytical Engine,Chief Architect,10 Oct 2023"
  }'
```
Response:
```json
{
  "totalImported": 1,
  "skipped": 0,
  "contacts": [
    {
      "name": "Ada Lovelace",
      "company": "Analytical Engine",
      "title": "Chief Architect",
      "relationship": "first_degree",
      "verificationSource": "user_imported_connection"
    }
  ]
}
```

### Scenario C: Assist Queue Fetch (User-Gesture Only)
```bash
curl -X GET http://localhost:3000/v1/assist-queue/linkedin \
  -H "Authorization: Bearer <TOKEN>" \
  -H "x-tenant-id: <TENANT_ID>"
```
Response:
```json
{
  "items": [
    {
      "type": "linkedin_connection_request",
      "profileUrl": "https://linkedin.com/in/ada",
      "prefilledNote": "Hi Ada, noticing your work in distributed systems at Analytical Engine...",
      "userGestureRequired": true,
      "requiresUserAction": true
    }
  ]
}
```
Each action in the queue requires explicit user interaction in their personal browser. The browser extension acts only when the user clicks the corresponding action button.

