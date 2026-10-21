# 🏋️ AI Interview Practice Gym

<div align="center">

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-33.2-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)
![Vitest](https://img.shields.io/badge/Tested%20With-Vitest-729B1B?style=flat-square&logo=vitest)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

<p align="center">
  <strong>A deliberate, state-of-the-art desktop technical-interview practice and coaching gym for software engineers.</strong>
</p>

</div>

---

## 🎯 Product Direction & Ethics

**The AI Interview Practice Gym is a training environment.**

- **The AI plays the interviewer**: It asks challenging questions, listens to your answers in real time, evaluates your spoken and written reasoning, and probes your assumptions with tough follow-ups.
- **You practice out loud or in code**: Practice under realistic timing and pressure.
- **The app scores, coaches, and tracks progress**: Get structured rubric-based feedback, identify gaps against model answers, and track your improvement across rounds.

> **Integrity Notice:** This software is built for honest interview practice and deliberate skill improvement. It is **not** designed to hide from, evade, or deceive interviewers, proctors, or screen-recording software. The application runs in a normal, visible, titled desktop window with standard window management. All stealth, capture-evasion, and automatic MCQ cheating mechanisms have been permanently removed.

---

## 🔒 Data Privacy & Provider Transparency

We believe in complete transparency regarding your data. Below is the exact data disclosure for each supported AI provider:

| Provider                    | Data That Leaves Your Machine                                                                  | Destination                        | Network Required? |
| :-------------------------- | :--------------------------------------------------------------------------------------------- | :--------------------------------- | :---------------- |
| **Ollama (Local)**          | **None (0 bytes).** All prompts and inference execute on your local machine.                   | Localhost only (`127.0.0.1:11434`) | ❌ Fully Offline  |
| **Local Whisper.cpp / TTS** | **None (0 bytes).** Audio transcription and synthesis run on-device.                           | Local memory                       | ❌ Fully Offline  |
| **Groq Cloud**              | Audio chunks (Whisper STT) and interview question/answer context sent via TLS encrypted HTTPS. | `api.groq.com`                     | ✅ Yes            |
| **OpenAI**                  | Audio recordings (Whisper) and conversation prompt text sent via TLS encrypted HTTPS.          | `api.openai.com`                   | ✅ Yes            |
| **OpenRouter**              | Interview question/answer context sent via TLS encrypted HTTPS to the selected model provider. | `openrouter.ai`                    | ✅ Yes            |

### Credential Protection

- API keys are **never** bundled into the client-side JavaScript or renderer DOM.
- Keys are encrypted at rest using **Electron `safeStorage`** (Apple Keychain on macOS, DPAPI on Windows, Secret Service / AES-256-GCM on Linux).
- Automated CI scans verify that zero keys or secret patterns exist in distribution builds (`npm run security:check`).

---

## 🛠️ Architecture & Tech Stack

```
ai-interview-assistant/
├── electron/
│   ├── main.ts              # Main process, window creation & lifecycle
│   ├── preload.ts           # Context-isolated IPC bridge
│   ├── ipc/handlers.ts      # Validated IPC channels & secure WebSocket server
│   └── services/
│       ├── credentialStore.ts # Electron safeStorage + AES-256-GCM fallback
│       └── pdfParser.ts       # Robust resume text extraction via pdfjs-dist
├── src/
│   ├── components/          # React UI components (Onboarding, Settings, Teleprompter)
│   ├── services/
│   │   ├── InterviewEngine.ts # Core VAD -> Whisper -> LLM streaming state machine
│   │   ├── candidatePersona.ts# STAR method & interview framework prompts
│   │   └── whisper.ts         # Audio recording and STT coordination
│   └── store/               # Zustand state management
├── tests/                   # Vitest unit and integration test suites
└── e2e/                     # Playwright Electron end-to-end tests
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20 or later
- **npm**: v10 or later
- **Git**

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Abhitvg/ai-interview-assistant.git
   cd ai-interview-assistant
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Launch in development mode:
   ```bash
   npm run electron:dev
   ```

On first launch, the Onboarding Modal will prompt you to select your preferred AI provider (Groq, OpenAI, OpenRouter, or local Ollama) and securely store your API key.

---

## 🧪 Development & Quality Assurance

```bash
# Run unit & integration tests
npm test

# Run TypeScript type check
npm run typecheck

# Run ESLint
npm run lint

# Check code formatting with Prettier
npm run format:check

# Verify zero secrets in build output
npm run security:check

# Build production bundle
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
