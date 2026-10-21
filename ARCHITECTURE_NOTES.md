# Architecture Notes — AI Interview Assistant (IAC)

_Verified as of repository audit on October 22, 2026._

---

## 1. Executive Summary

The repository `ai-interview-assistant` (repo `IAC`) is currently structured as an Electron-based real-time assistant application combining:

- **Desktop Runtime**: Electron 33.2.0, Vite 6.0.3, React 18.3.1, TypeScript 5.6.3.
- **State Layer**: Zustand 5.0.1 (`src/store/useAppStore.ts`).
- **Core Pipeline**: Web Audio API / VAD → Whisper Large v3 (Groq REST API) → LLM Streaming (Groq / OpenAI / OpenRouter REST APIs) → `SentenceBuffer` / `AIStreamParser` → Teleprompter UI.
- **Companion Chrome Extension**: Manifest V3 extension in `browser-extension/` designed to send web text via WebSocket to the desktop app.

---

## 2. Verified Architectural Inventory

### 2.1 Electron Main Process (`electron/`)

- `electron/main.ts`:
  - Window creation: Frameless, transparent floating overlay (`frame: false`, `transparent: true`, `titleBarStyle: 'hidden'`, `alwaysOnTop: true`).
  - Screen share invisibility: `mainWindow.setContentProtection(true)` enabled by default, hiding the window from Zoom, Teams, Meet, OBS.
  - OS-level camouflage: `setHiddenInMissionControl(true)` and `excludedFromShownWindowsMenu = true` on macOS.
  - Global hotkeys: Global panic/stealth toggle (`Cmd+Shift+H`, `Cmd+\`, `Cmd+Shift+Space`, `Alt+H`).
  - Screen capture & OCR: Handles `screen:capture-and-ocr` using macOS `screencapture` and binary `bin/mac-ocr` (or `maim`/`scrot`/`tesseract` on Linux) to solve questions visible on screen.
  - File system IPC: Read/write files (`fs:read-file`, `fs:write-file`, `fs:delete`, `fs:list-dir`).
  - Native document parsing: `fs:parse-pdf` (`pdf-parse`) and `fs:parse-docx` (`mammoth`).
- `electron/ipc/handlers.ts`:
  - `electron-store` for settings storage (`settings:get`, `settings:set`).
  - `keytar` credential management with unencrypted store fallback (`credentials:get`, `credentials:set`, `credentials:delete`).
  - Unauthenticated WebSocket server (`ws:start`) on random port for browser extension communication.
- `electron/preload.ts`:
  - Context bridge exposing `window.electronAPI` to the renderer.

### 2.2 Frontend & UI (`src/`)

- `src/App.tsx`:
  - Mounts `TeleprompterView`, `ResumeAndJobModal`, `SettingsPanel`, `SessionsPanel`, and `Toast`.
- `src/components/teleprompter/TeleprompterView.tsx`:
  - Monolithic view (~2,100 lines) combining teleprompter, audio visualizer, detected question display, steering buttons, code block cards with LeetCode copy action, confidence badges, follow-up prediction buttons, and screen solver triggers.
- `src/components/SettingsPanel.tsx`:
  - AI provider selection (OpenAI, OpenRouter, Groq, Ollama), model names, audio preferences, shortcut keys.
- `src/components/ResumeAndJobModal.tsx`:
  - File upload for candidate resume (PDF, DOCX, TXT) and job description.
- `src/components/SessionsPanel.tsx`:
  - History of past interview sessions and performance stats.
- Legacy/Orphaned Components:
  - `src/components/Teleprompter.tsx` (unused).
  - `src/components/interview/*` (`InterviewWorkspace.tsx`, `DetectedQuestion.tsx`, `FollowUpPanel.tsx`, `LiveStatusBar.tsx`, `LiveTranscript.tsx`, `SessionControls.tsx` — all unreferenced).

### 2.3 Services & Pipeline (`src/services/`)

- `InterviewEngine.ts`:
  - Central orchestrator coordinating microphone capture, VAD silence transitions, STT transcription, LLM response streaming, and question history.
- `candidatePersona.ts`:
  - Prompt construction tailored to candidate background ("Abhishek Singh") using STAR methodology, 4-phase LeetCode framework, 5-phase system design framework, and HR salary negotiation strategy.
- `whisper.ts`:
  - Direct HTTP `fetch` to `https://api.groq.com/openai/v1/audio/transcriptions` using `VITE_GROQ_API_KEY` bundled into the frontend.
- `ai.ts`:
  - Direct HTTP `fetch` to Groq/OpenAI/OpenRouter streaming completion endpoints with fallback model chains.
- `screenSolver.ts`:
  - Prepares prompts from OCR text to auto-solve questions from the interviewer's screen share.
- `SentenceBuffer.ts` & `AIStreamParser.ts`:
  - Incrementally aggregates streaming tokens into clean sentences for teleprompter recital.
- `VoiceActivityDetector.ts`:
  - AudioWorklet/ScriptProcessor-based silence detection.
  - ScriptProcessorNode used for audio levels.
- `interruptionDetector.ts`:
  - Audio classification detecting candidate speech vs interviewer speech.
- `resume.ts`:
  - Extracts text, technical skills, and experience from resume files.

---

## 3. Discrepancies Against Target Product Direction

| Current Implementation                                         | Target Product Direction (Practice Gym)                                 | Required Action                                                  |
| :------------------------------------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------------------------- |
| Frameless, transparent floating overlay with webcam proximity  | Standard visible, titled window with standard window controls           | Remove frameless/transparent flags; restore normal window chrome |
| `mainWindow.setContentProtection(true)`                        | Never evade or hide from screen shares                                  | Remove content protection entirely                               |
| `setHiddenInMissionControl(true)`, excluded from window menus  | Normal application visible in OS window lists                           | Remove OS camouflage flags                                       |
| Global stealth panic keys (`Cmd+Shift+H`, `Cmd+\`)             | Practice app with standard keyboard navigation                          | Remove panic hotkeys                                             |
| Live screen solver (`⌘+⇧+S`, `bin/mac-ocr`, `screenSolver.ts`) | Practice gym where user solves problems, AI acts as interviewer         | Remove live screen solver flow & binaries                        |
| MCQ / Certification auto-answering                             | Comprehensive mock interview practice and coaching                      | Remove MCQ auto-answering                                        |
| `VITE_GROQ_API_KEY` bundled into client bundle                 | Secure credential management in Electron main process via `safeStorage` | Move all provider keys to main process; add BYOK settings        |
| Unauthenticated WebSocket server                               | Secure authenticated local communication                                | Require per-install token, origin check, input delimitation      |
| Permissive CSP with `unsafe-eval`                              | Strict Content Security Policy                                          | Enforce strict CSP; disallow unsafe-eval                         |
| Direct client-side `fetch` for AI/STT with raw API keys        | Main-process provider abstraction                                       | Route API calls through main process                             |

---

## 4. Current Tooling & Infrastructure Deficits

- **Testing**: No test runner exists (`vitest` not installed; 0 unit/integration tests).
- **Linting**: `"eslint . --ext ts,tsx"` is defined in `package.json`, but `eslint` is not in `devDependencies`.
- **Formatting**: No Prettier configuration.
- **CI/CD**: No `.github/workflows` directory exists.
- **Tracked Artifacts**: `dist-electron/` and `fix.js` are currently tracked in git.
- **Dependencies**: `keytar` native dependency used instead of Electron's built-in `safeStorage`. `pdf-parse` lacks robust fallback.

---

## 5. Migration Roadmap to Practice Gym

1. **Phase 0**: Security hygiene, safeStorage, IPC hardening, strict CSP, removal of stealth/evasion mechanisms, repo cleanup, Vitest + ESLint + GitHub Actions.
2. **Phase 1**: Provider abstraction (LLMProvider, STTProvider, TTSProvider) and offline local mode (Ollama + local Whisper + local TTS).
3. **Phase 2**: AI Interviewer Engine (AI plays the interviewer, asks questions, listens, probes vague answers, evaluates).
4. **Phase 3**: Rubric scoring, post-session reports, delivery metrics.
5. **Phase 4**: Spaced repetition learning loop, mastery tracking, practice dashboard.
6. **Phase 5**: Embedded Monaco coding environment with sandboxed runner & whiteboard canvas.
7. **Phase 6**: JD-driven interview prep, company campaigns, behavioral story bank.
8. **Phase 7**: Polish, accessibility, packaging, auto-update, documentation.
