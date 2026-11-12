# CareerOps Production UX Specification & Wireframes

**Status:** Approved Architecture Specification  
**Baseline:** Post-M11 Hardening, Cloud API (M0–M10), Multi-Tenant PostgreSQL RLS  
**Authors:** Principal Product Designer & Frontend Systems Architect  
**Governing Principles:** Job-Centric, Calm & Dense (<100ms), Explainable Automation, Keyboard-First, WCAG 2.1 AA, Hard Lines (H1–H6)

---

## 1. Principles & Architectural Guardrails

### 1.1 Job-Centric Domain Model
Every artifact, contact, email thread, evaluation report, tailored CV, submission proof, and scheduled interview strictly anchors to a parent **Job Object** (`job_id` / `application_id`). Independent contacts belong to the Network, but their outreach sequences and referral tracking always reference target jobs.

### 1.2 Explainable Automation with Evidence
Every automated action taken by the cloud agent or client runner carries:
1. **Plain-Language Reason:** (e.g., *"Queued cold email to Engineering Manager Sarah Chen because candidate matches 4/4 core systems requirements and profile shares prior employer tenure."*)
2. **Evidence References:** Exact anchors to the Candidate Career Graph and public Job Description facts.
3. **Undo / Withdraw Action:** 1-click withdrawal or queue cancellation where the channel supports it.

### 1.3 Performance & Ergonomics
- **Sub-100ms Response:** Optimistic UI state updates on all user interactions with automated rollback on server failure.
- **Calm & Dense:** Information density tailored for high-volume job search; zero layout shift (CLS < 0.05) via strict skeleton loaders.
- **Keyboard-First:**
  - Global `Cmd+K` / `Ctrl+K`: Universal Spotlight HUD.
  - Quick jumps (`g` then key): `g t` (Today), `g p` (Pipeline), `g n` (Network), `g i` (Inbox), `g m` (Interviews), `g s` (Insights), `g c` (Controls).
  - List navigation: `j` / `k` (move up/down), `Enter` (open drawer), `x` (select), `e` (archive), `Esc` (close drawer).
- **Accessibility & Themes:** WCAG 2.1 AA contrast standards; dark/light mode; honors `prefers-reduced-motion`.
- **Mobile Responsive:** Today and Inbox are fully functional and responsive on mobile devices (touch-friendly targets $\ge 44 \times 44$px).

### 1.4 Hard Lines Compliance (H1–H6)
- **H1 (No Headless LinkedIn Automation):** All LinkedIn actions run strictly through the browser **Assist Queue** with explicit user physical gestures. No server-side session cookies or credentials.
- **H2 (No CAPTCHA / Bot Circumvention):** Hand off blocked flows to the user.
- **H3 (Zero Fabricated Facts):** Every generated resume, cover letter, and message is validated against the verified Career Graph before dispatch.
- **H4 (Compliant Email Outreach):** Verified business emails only, CAN-SPAM/GDPR/DPDP footers, 1-click opt-out, auto-pause if bounce rate exceeds 5%.
- **H5 (Prompt-Injection Defense):** External JD and email content is treated as untrusted text.
- **H6 (No Outcome Guarantees):** Forecasts are displayed strictly as statistical ranges with explicit sample sizes ($N \ge 30$).

---

## 2. New Backend Pieces & API Contracts

### 2.1 Job Strategy: `referral_first` | `apply_now` | `both`
- **Default Strategy:** `referral_first` with a configurable hold duration (default: 4 days / 96 hours).
- **Workflow Invariant:** In `referral_first` mode, the outreach wave to company insiders/alumni runs first. The ATS auto-apply worker is placed on hold until:
  1. An employee provides a referral link or initiates an internal referral, OR
  2. The configured hold period expires without an active referral conversation, OR
  3. The user manually overrides with "Apply via ATS Now".
- **Active Thread Protection:** If any referral outreach message has received a positive or ambiguous reply (thread active), **never** auto-apply via ATS.
- **Mandatory UI Disclaimer:** *"Referral policies and submission requirements vary by employer. Some organizations disqualify candidates if an online ATS application precedes an internal referral."*

### 2.2 Endpoint: `GET /v1/today`
Returns the aggregated single-pane executive digest:
```typescript
interface TodayDigestResponse {
  lastVisitedAt: string;
  actionsTakenSinceLastVisit: Array<{
    id: string;
    jobId: string;
    company: string;
    role: string;
    actionType: 'evaluated' | 'tailored' | 'outreach_sent' | 'ats_applied' | 'reply_classified';
    title: string;
    reason: string;
    evidenceRefs: string[];
    timestamp: string;
    canUndo: boolean;
  }>;
  actionsNeedingUser: Array<{
    id: string;
    jobId: string;
    company: string;
    role: string;
    type: 'review_tailored_cv' | 'assist_queue_linkedin' | 'recruiter_reply_required' | 'schedule_slot';
    title: string;
    urgency: 'high' | 'medium' | 'low';
    reason: string;
    dueAt?: string;
  }>;
  health: {
    mailHealthStatus: 'healthy' | 'warning' | 'paused';
    mailBounceRate: number; // e.g. 0.012 (1.2%)
    dailyApplicationCap: number;
    applicationsUsedToday: number;
    activeAutoPauses: Array<{
      channel: 'email' | 'ats' | 'linkedin';
      reason: string;
      triggeredAt: string;
    }>;
  };
  forecast: {
    projectedInterviewsMin: number;
    projectedInterviewsMax: number;
    confidenceLevel: number; // 0.85 (85%)
    sampleSize: number; // N >= 30
    calibrationNotes: string;
  };
}
```

### 2.3 Action Explanations & Undo
Every action log entry provides an explicit `reason` string grounded in user preferences, scoring criteria, or message classifications, accompanied by an `undoEndpoint` (e.g., `POST /v1/applications/:id/withdraw` or `POST /v1/outreach/cancel-queued`).

---

## 3. Screen Wireframes & Detailed Behaviors

### Screen 1: Today Screen (Executive Mission Control)
```
+-----------------------------------------------------------------------------------------+
| [⚡ Sprint Mode: ACTIVE]   Daily Cap: 14/25 Used   Mail Health: 99.2%   [⌘K Spotlight]   |
+-----------------------------------------------------------------------------------------+
| 🎯 ACTIONS NEEDING YOU (2)                                                              |
| [!] Sarah Lin @ Datadog replied to your message  -> [Review Suggested Reply & Send]     |
| [!] Stripe Senior Backend CV tailored (Fit 4.8)   -> [Approve CV & Launch Referral Wave]|
+-----------------------------------------------------------------------------------------+
| 🤖 WHAT IAC DID WHILE YOU WERE AWAY (Last 18 Hours)                        [Filter: All] |
| • Tailored CV for Anthropic Systems Engineer (Reason: 4.8 fit score, Kafka match)       |
| • Sent Referral Query to Alex Vance @ Stripe (Reason: Alumni connection at CMU) [Undo]   |
| • Placed Ashby ATS application on Referral Hold (4 days remaining) [Apply via ATS Now]  |
+-----------------------------------------------------------------------------------------+
| 📊 HEALTH & CALIBRATED FORECAST                                                         |
| • Projected Interview Calls: 3 - 6 (85% confidence, based on N=42 tailored submissions)  |
| • Active Channels: Email (Active), ATS (Active), LinkedIn (Assist Queue Only)          |
+-----------------------------------------------------------------------------------------+
```

### Screen 2: Pipeline Screen (Dual-View Kanban + Table)
- **Shared Query Layer:** Filters (Role, Company, Min Fit Score, Status, Strategy, Ghost Risk), sorting, and search are synced across both Kanban and Table modes.
- **Stages:** `Scouted` → `Evaluated` → `Referral Wave` → `ATS Held / Queued` → `Applied` → `Replied` → `Interviewing` → `Offer`.
- **Bulk Operations:** Multi-select jobs (`x`), bulk approve CVs, bulk strategy switch, bulk pause/withdraw.
- **Referral-First Indicators:** Clear timer chips displaying hold duration countdowns (`⏳ Held 3d 14h`).

### Screen 3: Job Drawer (Deep Drilldown Modal)
- **A–H Report:** Detailed fit breakdown (A: Core Skills, B: Domain Experience, C: Architecture, D: Scale, E: Leadership, F: Education/Credentials, G: Seniority, H: Culture/Values) with specific quote evidence from the JD.
- **Ghost Job & Freshness Radar:** Risk score (0–100) with concrete reasons (Posting age > 90d, lack of compensation transparency, evergreen talent pool language).
- **Tailored CV Diff & Truthfulness Report:** Side-by-side diff comparing default CV against tailored CV, plus automated H3 verification checkmark.
- **Contact Plan:** Ranked recruiters and engineering leaders with explainability tags (`Alumni`, `Team Lead`, `Shared Technology`).
- **Strategy Switcher:** `Referral First (4d hold)` ⇋ `Apply Now` ⇋ `Both Simultaneously`.

### Screen 4: Network Screen (Relationship Graph & Assist Queue)
- **People Table:** Searchable list of recruiters, hiring managers, and alumni.
- **Relationship Stages:** `Discovered` → `Outreach Queued` → `Sent` → `Replied` → `Referral Offered`.
- **Do-Not-Contact Rules:** Domain suppression and individual opt-out toggles.
- **LinkedIn CSV Importer:** Drag-and-drop parser for `Connections.csv`.
- **Assist Queue:** 1-click launcher for prepared LinkedIn connection notes with user gestures.

### Screen 5: Inbox Screen (Communication & Scheduling Hub)
- **Classified Replies:** Automatically categorized into `Interview Invitation`, `Question from Recruiter`, `Referral Acknowledged`, `Rejection`, or `Out of Office`.
- **Suggested Replies:** Contextual, STAR-aligned response drafts with editable text fields.
- **Scheduling Slots Integration:** Extracts recruiter calendar links (Calendly, GoodTime, Chili Piper) or proposes candidate free/busy availability slots.

### Screen 6: Interviews Screen (Calendar & Mock Gym Bridge)
- **Interview Timeline:** Upcoming phone screens, technical loops, and system design panels.
- **Company Prep Brief:** Summarizes company architecture, recent engineering blog posts, and predicted interview questions.
- **1-Click Mock Gym Bridge:** Launches IAC Practice Studio in simulated pressure mode tailored to the company's specific question patterns.
- **Post-Interview Debrief:** Guided form to capture questions asked, self-assessed performance, and follow-up thank you notes.

### Screen 7: Insights Screen (Analytics & A/B Testing)
- **Funnel Conversion:** Tracking drop-offs by channel (Cold Email vs. ATS vs. Referral) and template version.
- **A/B Experimentation Engine:** Statistical hypothesis tests (two-proportion z-test) on CV headline variants and outreach hooks ($N \ge 30$).
- **Calibrated Prediction Curves:** Visualizing interview conversion velocity against historical cohort data.

### Screen 8: Controls Screen (Governance & Privacy)
- **Sprint Contract Editor:** Adjust velocity caps (daily application and email outreach limits).
- **Channel Toggles & Emergency Kill Switch:** Instant 1-click global kill switch that cancels all pending automated jobs and queues.
- **Connector Health & Permissions:** Transparent view of connected OAuth accounts (Gmail, Google Calendar) with human-readable scope explanations.
- **GDPR / CCPA DSAR:** 1-click machine-readable JSON data export and permanent account purge.

### Screen 9: 60-Second Onboarding Flow
1. **0–15s:** Sign in / Identity confirmation.
2. **15–35s:** Role preferences (Target roles, locations, minimum compensation, remote preference).
3. **35–50s:** Instant Profile Audit & Top 3 Ranked Jobs preview.
4. **50–60s:** Optional Gmail connection with plain-language explanation of required scopes (`Send application emails on your behalf`, `Read recruiter replies`).

---

## 4. Design Tokens & Accessibility System

### 4.1 Color System (WCAG 2.1 AA Compliant)
- **Backgrounds:** `bg-slate-950` (#020617) / Dark Surface `bg-slate-900` (#0f172a) / Light `bg-slate-50` (#f8fafc)
- **Borders & Dividers:** `border-slate-800` (rgba(255,255,255,0.08))
- **Primary Accent:** Indigo / Violet (`#6366f1` / `#818cf8`)
- **Success / Validated:** Emerald (`#10b981` / `#34d399`)
- **Warning / Hold:** Amber (`#f59e0b` / `#fbbf24`)
- **Destructive / Error:** Rose (`#f43f5e` / `#fb7185`)

### 4.2 Typography & Spacing
- **Font Stack:** Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif.
- **Scale:**
  - Micro: `10px` / `0.625rem` (Caps, chips)
  - Caption: `11px` / `0.6875rem` (Metadata, timestamps)
  - Small: `13px` / `0.8125rem` (Dense tables, inputs)
  - Body: `14px` / `0.875rem` (General descriptions, cards)
  - Subhead: `16px` / `1.0rem` (Section headers)
  - Title: `20px` / `1.25rem` (Page headers)
- **Density:** 4px grid system (`gap-1` = 4px, `gap-2` = 8px, `gap-3` = 12px, `gap-4` = 16px).

---

## 5. Implementation Roadmap & Working Agreement
1. **Step 1:** UX Spec & Wireframes (`docs/careerops-ux.md`) — **[COMPLETED]**
2. **Step 2:** Screen 1: **Today Screen** (Backend endpoints `GET /v1/today`, Job strategy hold logic, Frontend view with loading, error, empty, offline states, optimistic updates, and tests).
3. **Step 3:** Report changes, tests, and gaps, then wait for user "continue".
4. **Subsequent Steps:** Pipeline → Job Drawer → Network → Inbox → Interviews → Insights → Controls → Onboarding.
