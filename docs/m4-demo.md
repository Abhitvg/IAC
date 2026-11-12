# M4 Job Evaluation, Resume/Cover Letter Tailoring, & Truthfulness Gate — Demo and Validation

## Scope

Milestone 4 establishes the evaluation and truthfulness pipeline for CareerOps autonomous applications:

- **A-H Multidimensional Scoring Engine** ([`ah-evaluation.ts`](file:///Users/abhisheksingh/Documents/ai-interview-assistant/packages/cloud-core/src/evaluation/ah-evaluation.ts)):
  - Evaluates roles across 8 weighted core dimensions:
    - `A_core_competency` (25%): Core technical domain and title alignment
    - `B_seniority_scope` (15%): Scope of leadership and track record
    - `C_scale_complexity` (15%): System scale, throughput, and complexity
    - `D_tech_stack` (15%): Direct programming language and tooling overlap
    - `E_domain_fit` (10%): Industry and problem space familiarity
    - `F_education_cert` (5%): Educational degrees and certifications
    - `G_location_auth` (10%): Remote preference and work authorization
    - `H_compensation` (5%): Target salary floor compatibility
  - Computes weighted overall fit score (1.00 to 5.00) and recommendation (`apply` vs `skip`).
- **ATS Tailoring Engine** ([`tailoring-engine.ts`](file:///Users/abhisheksingh/Documents/ai-interview-assistant/packages/cloud-core/src/evaluation/tailoring-engine.ts)):
  - Generates official Sourabh Bajaj (`sb2nov/resume`) standard LaTeX resumes.
  - Generates structured, high-impact cover letters adhering to the 5-part engineering blueprint (hook, technical impact, stack craft, culture alignment, CTA).
  - Enforces **Hard Line H4**: Senders are identified and messages include clear opt-out language.
  - Strictly derives all claims from the candidate's confirmed Career Graph facts (`usedFactKeys`).
- **Automated Truthfulness Gate (Hard Line H3)** ([`truthfulness-gate.ts`](file:///Users/abhisheksingh/Documents/ai-interview-assistant/packages/cloud-core/src/evaluation/truthfulness-gate.ts)):
  - Every generated artifact, cover letter, and screening answer must pass the gate before persistence or dispatch.
  - Compares every claimed employer, job title, degree, skill, and metric against confirmed Career Graph facts.
  - **Fails closed**: If ANY ungrounded claim is detected, delivery is blocked immediately.
  - Verified with **Golden Set Tests** containing planted false claims (employers, advanced degrees, exaggerated metrics).
- **Cloud API Endpoints** ([`server.ts`](file:///Users/abhisheksingh/Documents/ai-interview-assistant/apps/api/src/server.ts)):
  - `POST /v1/evaluation/evaluate`: Evaluates a job posting against confirmed facts.
  - `POST /v1/evaluation/tailor`: Generates tailored resume and cover letter, verifying truthfulness before returning.
  - `POST /v1/evaluation/verify-truthfulness`: Runs the automated truthfulness gate on arbitrary text.

---

## Run Locally

1. Verify TypeScript types:
   ```bash
   npm run typecheck:cloud
   ```
2. Run M4 test suites:
   ```bash
   npx vitest run tests/m4-ah-evaluation.test.ts tests/m4-tailoring-engine.test.ts tests/m4-truthfulness-gate.test.ts tests/m4-api-evaluation.test.ts
   ```
3. Run all test suites across M0, M1, M2, M3, and M4:
   ```bash
   npx vitest run tests/m4-*.test.ts tests/m3-*.test.ts tests/m2-*.test.ts tests/m1-*.test.ts tests/career-graph*.test.ts tests/cloud-*.test.ts
   ```
4. Verify source secret hygiene:
   ```bash
   npm run security:source
   ```

---

## Demo Script

### 1. Run A-H Multidimensional Job Evaluation

Call `POST /v1/evaluation/evaluate` with an authenticated bearer token:

```json
{
  "job": {
    "sourceId": "src-1",
    "platform": "greenhouse",
    "company": "Datadog",
    "title": "Staff Software Engineer - Distributed Systems",
    "location": "Remote - US",
    "remoteType": "remote",
    "url": "https://example.com/job/1",
    "externalId": "1",
    "descriptionText": "Build distributed storage systems with Go and TypeScript. Operate Kafka and PostgreSQL at scale."
  },
  "confirmedFacts": [
    {
      "factKey": "experience.stripe-staff-engineer",
      "category": "experience",
      "payload": {
        "company": "Stripe",
        "role": "Staff Software Engineer",
        "startDate": "2021",
        "endDate": null,
        "isCurrent": true,
        "achievements": ["Architected distributed ledger handling 100k writes/sec"],
        "technologies": ["TypeScript", "Go", "PostgreSQL", "Kafka"]
      },
      "source": { "kind": "document" },
      "suggestedConfidence": 1.0
    }
  ]
}
```

**Expected**: Returns `200 OK` with `report.score >= 4.0`, `recommendation: "apply"`, and breakdown across dimensions A through H.

### 2. Generate Tailored Resume & Cover Letter

Call `POST /v1/evaluation/tailor` with target job and confirmed facts:
**Expected**: Returns `200 OK` with:

- `artifacts.tailoredResumeLatex`: Compilable sb2nov LaTeX using only confirmed facts.
- `artifacts.tailoredCoverLetterText`: High-impact letter with sender identity and opt-out statement.
- `truthfulness.passed`: `true`.

### 3. Verify Automated Truthfulness Gate (H3) with Planted False Claims

Call `POST /v1/evaluation/verify-truthfulness` with planted unconfirmed claims:

```json
{
  "text": "During my time at Google, I completed my PhD from Stanford and scaled revenue by $500M.",
  "confirmedFacts": [
    {
      "factKey": "experience.stripe",
      "category": "experience",
      "payload": {
        "company": "Stripe",
        "role": "Engineer",
        "startDate": "2021",
        "endDate": null,
        "isCurrent": true
      },
      "source": { "kind": "document" },
      "suggestedConfidence": 1.0
    }
  ],
  "targetCompany": "Datadog"
}
```

**Expected**:

```json
{
  "result": {
    "passed": false,
    "violations": [
      {
        "category": "employer",
        "claim": "at Google",
        "reason": "Fabricated employer claim: 'google' is not in candidate's confirmed Career Graph (H3 violation)",
        "severity": "blocking"
      },
      {
        "category": "degree",
        "claim": "PhD",
        "reason": "Fabricated degree claim: Candidate claims 'PhD' but Career Graph has no confirmed PhD (H3 violation)",
        "severity": "blocking"
      },
      {
        "category": "metric",
        "claim": "$500M",
        "reason": "Unverified metric claim: '$500M' does not match any confirmed achievement figures in Career Graph (H3 violation)",
        "severity": "blocking"
      }
    ]
  }
}
```

---

## Next Milestone

- **M5**: ATS Apply Workers (Playwright in isolated containers), Answer Bank from Sprint Contract, Proof Capture (screenshot + payload), and Assist Queue handoff for CAPTCHA/login.
