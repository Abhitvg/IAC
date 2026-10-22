# Architecture Notes: AI Interview Assistant (IAC)

## 1. Practice Gym Architecture & Current Data Flow

IAC is an Electron 33 + React 18 + TypeScript application built strictly as an **interview practice gym and delivery coaching tool**. It never hides from proctors, captures external screens, or proxies answers live.

```
[Candidate Mic / Dictation]
          │
          ▼
 [VoiceActivityDetector] ── Utterance Audio ──► [Whisper STT (Groq / OpenAI / Local whisper.cpp)]
                                                         │
                                                Candidate Transcript
                                                         ▼
                                            [MockInterviewerEngine]
                                             (Timer, Persona & Turns)
                                                         │
                   ┌─────────────────────────────────────┴─────────────────────────────────────┐
                   ▼                                                                           ▼
   [DeliveryCoach (Deterministic)]                                                [Scoring Pipeline]
   - Word timestamps from Whisper segments                                        - LLMScorer (Strict Zod schema)
   - WPM, hesitation latency, pauses                                              - EvidenceValidator (≥90% fuzzy match)
   - Filler frequencies & rambling (>120s)                                        - Code hint penalties (-0.25/-0.5/-1.0)
                   │                                                                           │
                   └─────────────────────────────────────┬─────────────────────────────────────┘
                                                         │
                                                         ▼
                                          [Evaluation & Spaced Repetition]
                                          - Quoted verbatim evidence
                                          - SuperMemo 2 (SM-2) Topic Mastery
                                          - Saved in session history
```

---

## 2. Where Scoring & Storage Happen

- **LLM-Based Rubric Scoring (`src/services/practice/scoring/LLMScorer.ts`)**:
  - Sends transcript, question rubric hooks, expected points, and hint logs to the configured model (`LLMManager`).
  - Enforces strict JSON schema via Zod; retries once on parse error, then falls back to labeled heuristic estimator.
  - Verifies cited quotes in `EvidenceValidator.ts` (verbatim substring or $\ge 90\%$ fuzzy match). Caps unverified dimensions at 2.
- **Delivery Coaching (`src/services/practice/DeliveryCoach.ts`)**:
  - Deterministic evaluation of pacing (WPM), speech pauses, filler phrases, and rambling threshold (120s) using segment timestamps.
- **Session & State Persistence**:
  - **Renderer Storage**: Managed by `usePracticeStore.ts` and persisted to browser `localStorage`:
    - Sessions: `ai_practice_sessions_v1`
    - Story Bank: `ai_practice_stories_v1`
    - Topic Mastery: `ai_practice_topics_v1`
    - Company Prep Plans: `ai_practice_company_plans_v1`
  - **Credentials & API Keys**: Encrypted in OS keychain via Electron `safeStorage` in `electron/services/credentialStore.ts`.

---

## 3. Heuristic vs. LLM-Driven Division

| Component                        | Nature              | Primary Role                                                         |
| :------------------------------- | :------------------ | :------------------------------------------------------------------- |
| **LLMScorer**                    | **LLM-Driven**      | Strict rubric grade assignment (1–5) and verbatim quote extraction.  |
| **Interviewer Probes**           | **LLM-Driven**      | Generates targeted follow-up questions quoting candidate speech.     |
| **EvidenceValidator**            | **Deterministic**   | Substring and fuzzy matching against raw candidate transcripts.      |
| **DeliveryCoach**                | **Deterministic**   | Speech tempo, pause intervals, and word boundary regex analysis.     |
| **DeterministicSignals**         | **Deterministic**   | Informational non-scoring indicators (Big-O presence, I vs. We).     |
| **SpacedScheduler**              | **Mathematical**    | SM-2 mastery score, ease factors, intervals, and daily drill queues. |
| **CompanyPlanGenerator**         | **Heuristic**       | Keyword mapping against JD text, timeline scheduling (7 or 14 days). |
| **FeedbackImporter** _(Phase 1)_ | **LLM + Heuristic** | Local redaction + LLM weakness extraction with heuristic fallback.   |
