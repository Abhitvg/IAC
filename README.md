# 🏋️ AI Interview Practice Gym

<div align="center">

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-33.2-47848F?style=flat-square&logo=electron)
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
  - *Friendly*: Warm, encouraging, patient, ideal for initial warmups.
  - *Rigorous (Big Tech)*: Neutral, precise, comfortable with silence, demands justification and probes trade-offs.
  - *Startup*: Pragmatic, focused on shipping speed, ownership, and practical edge cases.
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

We believe in complete transparency regarding what data leaves your machine:

| Provider | Data Sent | Purpose | Network Endpoint |
| :--- | :--- | :--- | :--- |
| **OpenAI** (Optional) | Transcript text, question prompt, rubric definition | Scoring, interviewer probes, story extraction | `https://api.openai.com/v1/chat/completions` |
| **Groq** (Optional) | Transcript text, question prompt, rubric definition | Ultra-low-latency interviewer responses | `https://api.groq.com/openai/v1/chat/completions` |
| **OpenRouter** (Optional) | Transcript text, question prompt, rubric definition | Multi-model scoring | `https://openrouter.ai/api/v1/chat/completions` |
| **Ollama** (Local Option) | Transcript text, question prompt | 100% local inference (no internet required) | `http://127.0.0.1:11434` |
| **Local Whisper** | Audio samples | Local speech-to-text transcription | Stays on local machine |

- **API Key Security**: Provider API keys are stored in the Electron main process encrypted with OS keychain (`safeStorage`) or AES-256-GCM. Keys never touch renderer storage or client bundles.
- **Local Storage**: User session recordings and practice histories remain strictly inside your operating system's `userData` application directory.
- **Telemetry**: Zero third-party analytics, zero tracking pixels, zero telemetry.

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
