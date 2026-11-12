# Google Cloud OAuth Verification Package & Assessment

## 1. App Information
* **Application Name**: CareerOps Autonomous Job Search Assistant
* **Developer Organization**: CareerOps / IAC Systems
* **Application Home Page**: `https://careerops.internal`
* **Privacy Policy URL**: `https://careerops.internal/privacy`
* **Terms of Service URL**: `https://careerops.internal/terms`
* **Target Users**: Multi-tenant candidates delegating autonomous job search, outreach, and interview coordination under a standing consent Sprint Contract.

---

## 2. Scopes Requested & Minimization Justification

CareerOps strictly adheres to the **Principle of Least Privilege**. Full mailbox access (`https://mail.google.com/`) is **strictly forbidden in code and blocked by our architecture**.

| Scope | Type | Purpose & Standing Consent Justification |
| :--- | :--- | :--- |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | Allows CareerOps to autonomously dispatch professional outreach messages and follow-ups on the candidate's behalf during an active Sprint. Messages are strictly sent from the candidate's authentic address. |
| `https://www.googleapis.com/auth/gmail.readonly` | Sensitive | Allows CareerOps to detect recruiter replies, interview scheduling invitations, and status updates regarding active job applications. Used exclusively to classify incoming recruiter threads and feed the candidate's application tracker. |

### Forbidden Scopes Enforced by Architecture
* `https://mail.google.com/` (Forbidden): CareerOps never deletes emails, modifies mailbox labels, or accesses personal non-job-search emails.
* `https://www.googleapis.com/auth/gmail.modify` (Forbidden): Not required for read/send workflows.

---

## 3. CASA Tier 2 Security Assessment Checklist
CareerOps undergoes Cloud Application Security Assessment (CASA) Tier 2 compliance checks based on OWASP ASVS:

* [x] **Data in Transit**: TLS 1.3 enforced on all API endpoints and Google OAuth token exchange paths.
* [x] **Data at Rest**: OAuth refresh tokens and candidate records encrypted with AES-256-GCM envelope encryption.
* [x] **Crypto-Shredding**: DEKs can be purged instantly on-demand, rendering encrypted tokens permanently unrecoverable.
* [x] **Tenant Isolation**: Non-owner database roles running with PostgreSQL `FORCE RLS` on every table. Tokens strictly bound to single tenant memberships.
* [x] **Audit Trail**: Every OAuth authorization, token refresh, and email dispatch event logged to tamper-evident SHA-256 hash-chained audit log.

---

## 4. Consent Screen Walkthrough & Video Script
1. **Candidate Onboarding**: User navigates to Settings -> Email Integrations.
2. **Explicit Consent Display**: UI presents Sprint Contract standing consent disclosure:
   > *"By connecting your Gmail account, you authorize CareerOps to send approved outreach messages (up to your daily cap of 20 emails) and monitor for recruiter replies regarding your active job applications. CareerOps will never read unrelated emails or modify your account."*
3. **Google Sign-In Trigger**: User clicks "Connect Google Account". Redirects to Google OAuth consent screen displaying app name and requested scopes (`gmail.send`, `gmail.readonly`).
4. **Token Storage**: OAuth access and refresh tokens returned over HTTPS, encrypted via envelope DEK, and stored in PostgreSQL.
5. **Revocation**: Candidate can revoke Gmail access at any time with one click or by terminating their Sprint Contract.

