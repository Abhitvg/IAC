# Closed Beta Protocol: Pilot Cohort & Gradual Send Ramp

## 1. Beta Cohort Overview
* **Cohort Size**: 10 to 20 vetted pilot candidates.
* **Target Roles**: Senior Backend Engineers, Distributed Systems Engineers, Cloud / DevOps Engineers.
* **Duration**: 4-week structured testing cycle.
* **Pre-requisite**: Each pilot candidate reviews and accepts the legally binding **Sprint Contract** establishing standing consent, verified career facts, and daily volume caps.

---

## 2. Phase 1: 7-Day Mandatory Shadow Mode
Before any live emails are sent or job applications submitted, every pilot tenant executes **strictly in Shadow Mode** for a full 7 days:

```json
POST /v1/tenant/controls/shadow-mode
{
  "shadowMode": true
}
```

### Shadow Mode Verification Checklist:
* [x] **Truthfulness Gate Evaluation**: Verify all generated application answers, CV bullets, and outreach messages pass the Hard Line H3 gate. Confirm zero ungrounded entity leaks (employer, title, dates, metrics).
* [x] **Ghost/Scam Job Filtering**: Validate that ingested job postings filter out ghost listings and prompt injection vectors (H5).
* [x] **Provenance & Verification Checks**: Ensure target contact emails pass Hard Line H4 provenance checks (URL, hash, provider ID).
* [x] **Simulated Cap Enforcement**: Verify that simulated daily volumes observe caps without exceeding limits.

---

## 3. Phase 2: Staged Send Ramp

Following successful completion of the 7-day shadow mode audit, pilot users transition to live sends through a 3-stage gradual ramp:

```
+--------------------------------------------------------------------------------+
| Stage 1: Wave 1 (Days 8-10)                                                    |
| Daily Caps: 5 ATS applications / 5 outreach emails per tenant                  |
| Gate: Zero spam complaints, bounce rate < 2%, zero H3 truthfulness blocks     |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
| Stage 2: Wave 2 (Days 11-14)                                                   |
| Daily Caps: 10 ATS applications / 10 outreach emails per tenant                |
| Gate: Cumulative bounce rate < 3%, negative reply rate < 10%                   |
+--------------------------------------------------------------------------------+
                                       |
                                       v
+--------------------------------------------------------------------------------+
| Stage 3: Wave 3 (Days 15+)                                                     |
| Daily Caps: Full contract caps (up to 25 ATS / 25 emails / 10 assist items)    |
| Gate: Continuous Auto-Pause Monitoring (5% bounce cutoff, 0 spam complaint)    |
+--------------------------------------------------------------------------------+
```

---

## 4. Automatic Rollback & Abort Thresholds
If any of the following health signals are triggered during the ramp, the system **automatically rolls the tenant back to Shadow Mode or halts the affected channel**:

1. **Email Bounce Spike**: Bounce rate exceeds 5% over a 24-hour window -> Email channel paused immediately.
2. **Spam Complaint**: Any spam complaint reported by mail provider webhook -> Channel paused instantly.
3. **Truthfulness Gate Block**: Block rate exceeds 10% over 5 consecutive evaluations -> Tenant reverted to shadow mode.
4. **ATS Submission Error**: Failure rate exceeds 15% -> ATS channel paused.
