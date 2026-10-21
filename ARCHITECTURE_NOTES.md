# Architecture Notes: AI Interview Assistant (IAC)

## 1. System Overview
IAC is an Electron 33 + React 18 + Vite desktop application transitioning into an evidence-based **AI Interview Practice Gym and Coaching** product.
- **Runtime Environment**: Electron 33 (main process), Node.js, Vite/React 18 (renderer process), Zustand (state stores).
- **Core Engine**: Dual operational modes (Teleprompter live copilot vs Practice Gym), moving strictly toward practice/coaching.
- **Persistence**: `localStorage` in renderer for practice state, `electron-store` and `safeStorage` in main process for credentials.

---

## 2. End-to-End Data Flow

```
[Microphone Audio] 
       │ (PCM stream)
       ▼
[VoiceActivityDetector (VAD)] ──(Utterance Blob)──► [Whisper STT (Groq/OpenAI/Local)]
                                                             │
                                                     (Clean Transcript)
                                                             ▼
                                                [InterviewEngine / Practice Store]
                                                             │
                    ┌────────────────────────────────────────┴────────────────────────────────────────┐
                    ▼                                                                                 ▼
     [DeliveryCoach (Deterministic)]                                                    [Scoring & Evaluation Pipeline]
     - WPM speech pacing                                                                - Phase 1: LLMScorer (Strict JSON)
     - Filler word density                                                              - EvidenceValidator (Verbatim quotes)
     - Hesitation latency                                                               - Rubric scoring (Coding, SD, Behavioral)
     - Rambling (>120s)                                                                 - Deterministic keyword signals
                    │                                                                                 │
                    └────────────────────────────────────────┬────────────────────────────────────────┘
                                                             │
                                                             ▼
                                                 [Scorecard & Postmortem]
                                                 - Verbatim quoted evidence
                                                 - Topic mastery delta (SM-2)
                                                 - Behavioral Story Bank gap audit
```

---

## 3. Inventory: Heuristic vs LLM-Driven Components

| Component | Location | Implementation Type | Current Behavior & Target Direction |
| :--- | :--- | :--- | :--- |
| **Rubric Scoring** | `src/services/practice/RubricScorer.ts` | **Heuristic (Regex)** | *Current*: Regex keyword matching ("o(", "qps", "we", "constraint"). Easily gamed.<br>*Target (Phase 1)*: `LLMScorer` with strict Zod schema + `EvidenceValidator` quote verification. Regex demoted to deterministic signals only. |
| **Speech Delivery** | `src/services/practice/DeliveryCoach.ts` | **Deterministic** | Pure math & regex word boundary analysis (WPM, filler frequencies, time-to-first-sentence, rambling detection). Accurate and fast; needs VAD timestamp precision (Phase 5). |
| **Follow-Up Probing** | `MockInterviewerEngine.generateWeaknessProbe` | **Heuristic (Rule-based)** | *Current*: Keyword triggers ("cache" -> invalidation probe).<br>*Target (Phase 3)*: Conversational LLM interviewer with strictly validated verbatim quote evidence. |
| **Coaching & Hints** | `src/services/practice/CoachingEngine.ts` | **Hybrid** | Tiered hint templates (Nudge, Hint, Approach). Model comparison diffs. Hint penalties calculated in code. |
| **Story Bank** | `src/services/practice/StoryBank.ts` | **Heuristic** | Regex parsing of resume action verbs to populate STAR stories and audit 5 core competencies. |
| **Spaced Repetition** | `src/services/practice/SpacedScheduler.ts` | **Mathematical** | SuperMemo 2 (SM-2) algorithm calculating ease factors, intervals, and daily drill queues from rubric scores. |
| **Company Prep** | `src/services/practice/CompanyPlanGenerator.ts` | **Heuristic** | Tech keyword mapping against JD text, seniority extraction, gap analysis, and 7/14-day roadmaps. |
| **Teleprompter / Copilot** | `src/components/teleprompter/`, `screenSolver.ts` | **LLM & OCR** | Live answer generator and screen OCR (marked for removal in Phase 7 to comply with non-negotiable practice product direction). |
| **LLM Inference** | `src/services/ai.ts` | **LLM-Driven** | Streaming client for Groq, OpenAI, OpenRouter, and Ollama. |
