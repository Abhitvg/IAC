# 🏋️ AI Interview Practice Gym

<div align="center">

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-45.2.3-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)
![Tested With Vitest](https://img.shields.io/badge/Tested%20With-Vitest-729B1B?style=flat-square&logo=vitest)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

<p align="center">
  <strong>An interactive desktop rehearsal gym and AI coaching environment for technical software engineering interviews, system design discussions, and behavioral rounds.</strong>
</p>

</div>

---

## 🎯 Product Overview

**AI Interview Practice Gym** is built to prepare software engineers for real technical interviews under pressure. Interviews are won or lost in how clearly candidates communicate, handle probing follow-ups, and articulate trade-offs.

The app simulates realistic interview sessions with an AI interviewer across multiple personas, verifies answers against strict rubrics citing verbatim transcript evidence, measures speech delivery dynamics (pace, fillers, hesitation, rambling), tracks topic mastery with spaced repetition, and crafts tailored 7-day study plans for target companies.

---

## ✨ Core Features

### 1. 🎙️ Realistic Mock Interview Sessions

- **Multiple Interviewer Personas**:
  - _Friendly_: Warm, encouraging, patient, ideal for initial warmups.
  - _Rigorous (Big Tech)_: Neutral, precise, comfortable with silence, demands justification and probes trade-offs.
  - _Startup_: Pragmatic, focused on shipping speed, ownership, and practical edge cases.
- **Dynamic Follow-Up Probes**: Probes candidate answers by directly quoting statements from the transcript (`"You mentioned caching; what is your invalidation strategy?"`) instead of generic scripted questions.
- **Opt-In Interruption Practice**: Realistic mid-answer interruptions (off by default) that trigger only after 30 seconds of speech if an answer lacks specifics.
- **Tiered Hint System**: Progressive help (Tier 1 Nudge, Tier 2 Approach, Tier 3 Near-Solution) with deterministic rubric penalties applied in code.

### 2. 📊 Evidence-Based Rubric Scoring

- **LLM Scorer with Verbatim Evidence Quotes**: Every rubric score (Coding, System Design, Behavioral) requires verbatim transcript quotes. Claims without verifiable evidence are rejected and capped at 2/5.
- **Deterministic Signal Separation**: WPM, filler word counts, Big-O mentions, and "I" vs. "we" pronoun usage are reported separately as deterministic speech signals, never conflated with rubric scores.
- **Offline Heuristic Fallback**: Clear "Estimated, low confidence" labeling when offline, never declaring an unverified "Hire" verdict.
- **Transparent Uncertainty Reporting**: Reports explicitly highlight topics where transcript evidence was too thin to evaluate reliably.

### 3. ⏱️ Speech & Delivery Coaching

- **Pacing & WPM Tracking**: Real-time pace calculations calculated from audio segment timestamps without hardcoded fallbacks.
- **Filler Word Detection**: Escaped word-boundary pattern matching for single-word (`um`, `uh`, `like`) and multi-word (`you know`, `i mean`) filler phrases.
- **Hesitation & Pause Tracking**: Computes time-to-first-word and longest pause intervals directly from VAD and Whisper segment timestamps.
- **Rambling Boundary Flag**: Flags answers exceeding 120 seconds with constructive guidance on structuring answers.
- **Three-Session Baseline Guard**: Delivery trend conclusions and aggregates require a minimum of three completed sessions before declaring trends.

### 4. 📚 Spaced Repetition & Weakness Scheduler

- **SuperMemo (SM-2) Spaced Drills**: Tracks topic mastery across coding, algorithms, system design, and behavioral competencies.
- **Weakest-Topic Prioritization**: Automatically schedules tomorrow's rehearsal queue targeting the user's lowest-scoring areas.
- **Curriculum Question Bank**: Curated, original question bank across 60 technical topics with customizable JSON pack imports.

### 5. 💼 Resume Story Bank & Company Prep

- **STAR Story Bank**: Extracts candidate experiences from resumes into structured Situation, Task, Action, and Result stories.
- **Coverage Gap Alerts**: Highlights underrepresented competencies (such as conflict resolution or failure analysis) before real interviews.
- **Company Plan Generator**: Analyzes job descriptions and generates targeted 7-day drill curricula tailored to company tech stacks.

---

## 🔒 Data and Privacy

We believe in complete transparency regarding what data leaves your machine, how your data is protected at rest, and how you maintain complete ownership of your interview prep history.

### 1. Exactly What is Stored Locally

All candidate data is stored strictly on your local machine inside your operating system's isolated `userData` application directory and persistent local browser storage:

- **Feedback Records (`ai_practice_feedback_v1`)**: Redacted raw text, company, role, round type, date, extracted strengths, extracted weaknesses (topic, skill, severity, verbatim evidence quote, requested fix), overall tone, and deduplication hash.
- **Mock Practice Sessions & Transcripts (`ai_practice_sessions_v1`)**: Candidate spoken transcripts, interviewer prompts, hint histories, audio timestamps, delivery signals, and rubric score evaluations.
- **Rubric Evaluations & Scores**: Verbatim-grounded dimension ratings across Coding, System Design, Behavioral, Structure, and Concreteness, accompanied by candidate-grounded rewrites.
- **Speech Delivery Metrics**: Pacing (words per minute), filler word counts, hesitation / latency to first word, and rambling flags.
- **Topic Mastery State (`ai_practice_topics_v1`)**: SuperMemo (SM-2) repetition intervals, ease factors, repetition counts, next review timestamps, and 90-second explainer attempt history.
- **Resume Story Bank (`ai_practice_stories_v1`)**: Extracted STAR stories (Situation, Task, Action, Result), competency tags, and identified coverage gaps.
- **Company Prep Plans (`ai_practice_company_plans_v1` & `ai_practice_weakness_plan_v1`)**: Target company 7-day and 14-day drill schedules, completed drill checkboxes, and candidate round notes.
- **Concept Cards (`ai_practice_concept_cards_v1`)**: Locally editable reference cards containing core ideas, worked examples, common pitfalls, and architectural trade-offs.

### 2. What is Sent to Which Provider and When

**Starting a live interview is the action that enables processing of microphone audio and interview context. There is no per-utterance cloud redaction-preview or “Send to analysis” confirmation in the live interview path.** Choose a local configuration before starting a session if you do not want audio or candidate context sent to a cloud provider.

| Provider / service                 | Data sent                                                                                                                                                                                                                                                                                                            | Trigger / condition                                                                                                                                                                                        | Destination                                                                                              |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **Groq Speech-to-Text**            | Raw microphone audio chunks as WAV files, plus a technical vocabulary prompt. That vocabulary can include terms derived from the locally stored resume and target role.                                                                                                                                              | Live interview transcription when Groq is selected for speech-to-text.                                                                                                                                     | `https://api.groq.com/openai/v1/audio/transcriptions`                                                    |
| **OpenAI Speech-to-Text**          | Raw microphone audio chunks as WAV files, plus a technical vocabulary prompt.                                                                                                                                                                                                                                        | Live interview transcription when OpenAI is selected for speech-to-text.                                                                                                                                   | `https://api.openai.com/v1/audio/transcriptions`                                                         |
| **Local Whisper**                  | WAV audio chunks.                                                                                                                                                                                                                                                                                                    | Live interview transcription when the application is configured for Ollama/local mode. The default Whisper endpoint is `http://localhost:8080/inference`; a custom endpoint can be configured by a caller. | Local endpoint by default; a non-local custom endpoint would receive the audio off-device.               |
| **Groq / OpenAI / OpenRouter LLM** | The recognized question, candidate resume context (up to 3,000 characters), target job description (up to 1,500 characters), target role, recent question/answer context, and system instructions. This live prompt path does not run the manual-feedback PII redaction routine over the complete candidate context. | Live answer generation when the selected LLM provider is a cloud provider.                                                                                                                                 | Provider chat-completion endpoint.                                                                       |
| **Ollama LLM**                     | The same prompt/context categories as above.                                                                                                                                                                                                                                                                         | Live answer generation when Ollama is selected.                                                                                                                                                            | Defaults to `http://127.0.0.1:11434`; a user-configured remote Ollama endpoint receives data off-device. |
| **Manual feedback analysis**       | Pasted feedback after local redaction of supported email, phone, URL, and user-entered name patterns.                                                                                                                                                                                                                | Only after the user reviews the redaction preview and selects “Send to analysis”. The heuristic-only mode does not make an LLM request.                                                                    | Selected LLM provider, unless heuristic-only mode is enabled.                                            |

**Important distinctions**

1. **Live audio is not redacted before cloud transcription.** If Groq or OpenAI is selected for speech-to-text, microphone audio is transmitted to that provider after you start a live interview. Names, employer details, or other information spoken aloud may be present in the audio.
2. **Live LLM prompts contain candidate context.** The prompt builder includes the current recognized question, a bounded section of resume text, job description, target role, and recent conversation history. This path does not currently apply a general-purpose PII scrub to all of those fields.
3. **Local means the configured endpoint is actually local.** Ollama defaults to loopback, and local Whisper defaults to `localhost:8080`. Changing either endpoint to a remote host sends the corresponding prompt or audio to that host. Network activity by other application features is separate.
4. **Manual feedback import has a separate consent/redaction flow.** Its redaction preview and explicit confirmation do not apply to the automatic live interview transcription and answer-generation pipeline.
5. **OpenRouter is supported for LLM requests, not speech transcription.** Configure Groq, OpenAI, or local Whisper as the speech provider; the application fails closed rather than silently sending OpenRouter speech requests to another cloud STT provider.

#### Privacy safeguards currently implemented

- Pasted feedback is treated as untrusted prompt content, has supported email/phone/URL/custom-name patterns redacted locally, and requires the manual “Send to analysis” action before cloud extraction.
- Transcript and browser-context prompt-injection delimiters are used in their respective prompt paths.
- Returned evidence quotes from manual feedback extraction are checked against the redacted source text.
- These safeguards do **not** mean that live microphone audio, resumes, job descriptions, or session records are universally redacted before cloud processing.

### 3. Encryption at Rest Architecture

- **Provider API Keys**: Stored by the Electron main process using Electron's asynchronous `safeStorage` API and an OS-backed provider (macOS Keychain, Windows DPAPI, or Linux Secret Service / KDE Wallet). On Linux, the app rejects the unprotected `basic_text` backend. New API keys are not written when an OS-backed credential provider is unavailable. Legacy local AES-GCM records are migrated into OS-backed storage only when a secure provider is available. The renderer still obtains configured keys through a preload IPC method for provider requests, so a compromised renderer could access them; moving provider calls fully into the main process remains an important security hardening task.
- **Candidate and Practice Data at Rest**: Candidate profiles, resumes, target job descriptions, workspaces, practice state, feedback, and session history are persisted through renderer `localStorage` and JSON files under Electron `userData`, depending on the feature. The standard persistence paths serialize these records as JSON and are **not uniformly encrypted at rest**. `FeedbackStorageEncryption` exists as an optional AES-GCM helper, but it is not applied across the normal store persistence paths. Its default key source is deterministic and must not be treated as a secret.
- **Architectural Trade-off**: Renderer-side stores provide synchronous hydration, but localStorage and user-data JSON remain readable to processes running as the same OS user. PII redaction and explicit confirmation protect selected outbound analysis flows; they do not encrypt local files or protect data from a compromised renderer. Do not treat candidate profiles, transcripts, resumes, or practice records as cryptographically protected at rest.
- **Zero Telemetry**: No third-party analytics, no error tracking pixels, and no telemetry data are collected.

### 4. One-Button Complete Data Wipe ("Delete all feedback and practice data")

You can delete every trace of stored feedback, mock sessions, audio transcripts, stories, and study plans at any time with a single click:

1. Click **⚙️ Settings** in the top navigation bar.
2. Scroll to the **Danger Zone** section at the bottom.
3. Click **"Delete all feedback and practice data"**.

This permanently removes all 9 practice local storage keys, wipes in-memory Zustand store states, and resets the practice gym to a fresh installation state.

---

## ⚖️ Responsible Use Policy

**AI Interview Practice Gym is strictly an educational practice, mock rehearsal, and personal coaching tool.**

- **Practice Only**: This application is built solely for individual preparation prior to interviews.
- **No Deception or Evasion**: The app does not evade proctors, hide from screen sharing, or circumvent assessment integrity controls.
- **No Real-Time Live Cheating**: It must never be used during actual live interviews, assessments, or tests to generate answers on a candidate's behalf without explicit disclosure.

---

## 🛠️ Development & Building

### Prerequisites

- Node.js v20+ and npm v10+

### Setup & Run

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Run all test suites
npm test

# Run linting and typecheck
npm run lint
npm run typecheck

# Production build & verification
npm run build
npm run security:check
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
