# 🎯 AI Interview Assistant & Live Copilot

<div align="center">

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-33.2-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)
![Vitest](https://img.shields.io/badge/Tested%20With-Vitest-729B1B?style=flat-square&logo=vitest)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

<p align="center">
  <strong>An ultra-low latency, screen-share protected transparent teleprompter and real-time AI copilot designed for technical interviews, live coding assessments, system design, and MCQ rounds.</strong>
</p>

</div>

---

## ⚡ Core Features

- 🛡️ **Screen-Share Stealth Shield**: Built-in OS-level `setContentProtection` makes the transparent teleprompter 100% invisible to screen-sharing and recording software (Zoom, Google Meet, Microsoft Teams, OBS, QuickTime).
- 📸 **Neural Vision OCR & Screen Solver**: Instantly capture and solve coding challenges or MCQ quizzes from your screen (`Cmd+Shift+S` or `Cmd+Shift+C`) using Apple Vision Neural OCR with zero hallucinations.
- 🎙️ **Real-Time Voice & VAD Transcription**: Sub-second speech-to-text pipeline powered by Whisper Large v3 with voice activity detection and interruption detection.
- 📝 **Frontier Coding & STAR Frameworks**:
  - **Coding Mode**: Generates 100% verified, compilable solutions in Java, Python, C++, Go, TypeScript with Big-O analysis and dry-run walkthroughs.
  - **Behavioral Mode**: Structured MIT CAPD STAR method answers grounded in your real resume experience.
  - **MCQ / Quiz Mode**: High-contrast instant answer identification with concise proofs and distractor debunking.
- ⌨️ **Stealth Global Hotkeys**:
  - `Cmd+Shift+H` (or `Alt+H` / `Cmd+\`): 0ms instant vanish / reveal of the overlay window.
  - `Cmd+Shift+Space`: Toggle Always-On-Top floating state.
  - `Cmd+Shift+S` (or `Cmd+Shift+C`): Instant fullscreen or snipping screen solve.

---

## 🔒 Security & Credential Protection

- **Main Process SafeStorage**: Provider API keys (Groq, OpenAI, OpenRouter) are managed exclusively by the Electron main process via OS keychain encryption (Apple Keychain / DPAPI / Secret Service). Zero API keys are bundled into renderer distributions.
- **Localhost WebSocket Hardening**: Browser extension communication is restricted to `127.0.0.1`, secured with per-session UUID tokens, Origin validation, and 256KB payload guards.
- **Automated CI Scans**: Pre-commit and CI verification guarantees that zero secrets exist in built assets.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20 or later
- **npm**: v10 or later
- **Git**

### Installation

1. Clone and install:

   ```bash
   git clone https://github.com/Abhitvg/ai-interview-assistant.git
   cd ai-interview-assistant
   npm ci
   ```

2. Run in development:

   ```bash
   npm run electron:dev
   ```

3. Build production packages:
   ```bash
   npm run build
   ```

---

## 🧪 Testing & Verification

```bash
# Run unit & integration test suites
npm test

# Type check
npm run typecheck

# Code formatting & lint
npm run format:check
npm run lint

# Audit build bundle for leaked secrets
npm run security:check
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
