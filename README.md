# 🎯 AI Interview Assistant

<div align="center">

![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=for-the-badge&logo=apple)
![Electron](https://img.shields.io/badge/Electron-33.2-47848F?style=for-the-badge&logo=electron)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript)
![Groq](https://img.shields.io/badge/Groq-Ultra--Low%20Latency-F55036?style=for-the-badge)
![Whisper](https://img.shields.io/badge/STT-Whisper%20Large%20v3-00A67E?style=for-the-badge&logo=openai)
![Status](https://img.shields.io/badge/Build-Passing-brightgreen?style=for-the-badge)

<p align="center">
  <strong>An ultra-low latency, stealth transparent teleprompter and real-time AI copilot designed for live coding assessments, system design interviews, technical MCQs, and behavioral rounds.</strong>
</p>

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [The 7-Layer Master Intelligence System](#-the-7-layer-master-intelligence-system)
- [Core Modes of Operation](#-core-modes-of-operation)
- [Stealth & Screen Share Shield Architecture](#-stealth--screen-share-shield-architecture)
- [Screen Solver & Multilingual OCR](#-screen-solver--multilingual-ocr)
- [Keyboard Shortcuts Reference](#-keyboard-shortcuts-reference)
- [Tech Stack](#-tech-stack)
- [Prerequisites & Setup](#-prerequisites--setup)
- [Development Workflow](#-development-workflow)
- [Building & Packaging](#-building--packaging)
  - [macOS (Apple Silicon & Intel)](#macos-packaging)
  - [Linux (Ubuntu 24.04+, Debian, AppImage)](#linux-packaging--execution)
  - [Windows](#windows-packaging)
- [Chrome Browser Extension](#-chrome-browser-extension)
- [Architecture & Directory Structure](#-architecture--directory-structure)
- [Candidate Personalization](#-candidate-personalization)
- [Privacy & Security](#-privacy--security)

---

## 🌟 Overview

**AI Interview Assistant** is an elite desktop application engineered for live technical interviews. It sits discreetly right below your webcam as a frameless, transparent, floating teleprompter. 

Using high-frequency voice activity detection (VAD), dynamic audio chunking, and Whisper Large v3 speech-to-text, it captures the interviewer's voice in real-time, recognizes questions instantly, and streams verified, optimal code solutions, architectural blueprints, or STAR behavioral narratives via Groq's sub-second inference engine.

### Key Capabilities:
- ⚡ **Sub-Second Latency**: Streaming responses token-by-token using Groq inference with first-sentence teleprompter arrival in ~350–700ms.
- 🛡️ **100% Screen Share Invisible**: Native OS-level content protection shields the overlay window from being captured by Zoom, Google Meet, Microsoft Teams, Slack, Discord, QuickTime, and OBS.
- 🧩 **Zero-Hallucination Code**: Frontier 120B model (`openai/gpt-oss-120b`) at temperature `0.1` ensures runnable, compilable code without placeholders or missing imports.
- 📸 **Screen Solver (OCR)**: Capture code challenges directly from the interviewer's screen share with 1 shortcut (`⌘ + ⇧ + S`) and receive immediate, optimal implementations.
- 🧠 **Contextual Memory**: Remembers prior turns in the conversation to thread context and avoid repetitive narratives.

---

## 🧠 The 7-Layer Master Intelligence System

The assistant incorporates a multi-layer reasoning engine tuned for 100% technical precision:

```
┌─────────────────────────────────────────────────────────────┐
│             7-LAYER MASTER INTELLIGENCE ENGINE              │
├─────────────────────────────────────────────────────────────┤
│ 1. Category Expert Prompts  │ System Design, Coding, HR, STAR│
│ 2. Rolling Context Memory   │ 5-turn history threading       │
│ 3. Smart Model Router       │ 120B for Hard/Code, 27B Fast  │
│ 4. Dynamic Whisper Priming  │ Resume & topic vocab injection │
│ 5. Confidence Badging       │ 🟢 High, 🟡 Verified, 🔴 Best │
│ 6. Follow-Up Prediction     │ 3 probable next questions      │
│ 7. Adaptive Calibration     │ 50–160 words, tone matching    │
└─────────────────────────────────────────────────────────────┘
```

1. **Category-Specific Expert Frameworks**:
   - **System Design (5-Phase Framework)**: Requirements & Scope &rarr; Capacity & Math &rarr; High-Level Architecture &rarr; Deep-Dive (Schema, Partitioning, Caching) &rarr; Production Trade-Offs & Single Points of Failure.
   - **Algorithmic Coding (Yangshun Tay 4-Phase)**: Clarification & Edge Cases &rarr; Optimal Big-O Contrast &rarr; Production-Grade Code Block &rarr; Step-by-Step Dry Run.
   - **Behavioral (MIT CAPD STAR)**: Strictly structured Situation (20%), Task (10%), Action (60% - primary focus), and Result (10% with quantified metrics).
   - **HR & Offer Negotiation**: Protects compensation confidentiality, balances notice periods, and anchors salary to market value.

2. **Rolling Conversation Memory**:
   - Retains a rolling 5-turn context window of recent questions, answers, and categories.
   - Injects history into prompts so answers build on previous explanations without contradictory statements.

3. **Smart Model Router & Temperature Optimization**:
   - Automatically routes complex queries (Coding, System Design, DSA, Quizzes, or prompts >100 characters) to **`openai/gpt-oss-120b`** at temperature `0.10`–`0.15` for absolute accuracy.
   - Routes general conversational dialogue to **`qwen/qwen3.8-27b`** for ultra-fast, snappy responses.

4. **Dynamic Whisper Priming**:
   - Dynamically injects technical terms, candidate resume technologies (e.g. Apache Kafka, Spring Boot, MongoDB, Solr), and topic keywords into the Whisper speech recognition prompt, eliminating phonetic misinterpretations.

5. **Real-Time Answer Confidence Badges**:
   - Displays real-time confidence for every answer:
     - 🟢 **High Confidence**: Direct match with candidate resume, core DSA pattern, or verified theoretical framework.
     - 🟡 **Verified**: Standard domain knowledge and architectural consensus.
     - 🔴 **Best Effort**: Niche, multi-interpretation, or ambiguous prompt.

6. **Predictive Follow-Up Engine**:
   - Concurrently predicts the **top 3 probable follow-up questions** the interviewer is likely to ask next.
   - Displayed as 1-click pill buttons directly on the teleprompter to pre-generate subsequent answers ahead of time.

7. **Adaptive Verbal Calibration & Tone Matching**:
   - Spoken length dynamically calibrated:
     - Definitions / concepts: **50–70 words** (concise & decisive).
     - Medium / behavioral: **80–120 words** (1 concrete STAR story).
     - System design / coding breakdown: **120–160 words** (structured phases).
   - Mirrors interviewer formality while eliminating robotic AI markers.

---

## 🎛️ Core Modes of Operation

Switch modes instantaneously using shortcuts `⌘ + 1`, `⌘ + 2`, or `⌘ + 3`:

| Mode | Shortcut | Best For | Output Format |
| :--- | :---: | :--- | :--- |
| **💻 Coding Challenge** | `⌘ + 1` | LeetCode, HackerRank, CoderPad, live algorithm tests | Single markdown block with 100% verified, runnable code (includes imports, class wrappers, edge guards) + 2-3 sentence verbal strategy. |
| **🎙️ Live Interview (STAR)** | `⌘ + 2` | Behavioral, System Design, Architecture, Experience | Spoken first-person conversational narrative ("In my recent project at ATMA Research...") without bullet points or headers. |
| **📝 Quiz / MCQ Assessment** | `⌘ + 3` | Multiple choice tests, certifications, timed quizzes | **Correct Option** highlighted in emerald green + 2-sentence theoretical/math proof + concise debunking of incorrect choices. |

---

## 🕵️ Stealth & Screen Share Shield Architecture

The app is built from the ground up for strict confidentiality and invisible operation:

```
┌─────────────────────────────────────────────────────────────┐
│            OS-LEVEL CONTENT PROTECTION (STEALTH)            │
├─────────────────────────────────────────────────────────────┤
│ • Window: Frameless, transparent, floating overlay          │
│ • Screen Capture Shield: setContentProtection(true)         │
│   ↳ Completely blacked out / hidden in:                     │
│     - Zoom Screen Sharing                                   │
│     - Google Meet / Microsoft Teams                         │
│     - Discord / Slack Huddles                               │
│     - QuickTime / OBS Screen Recording                      │
│ • macOS Mission Control: setHiddenInMissionControl(true)   │
│ • Window Switcher: excludedFromShownWindowsMenu = true      │
│ • Panic Key: 0ms instantaneous vanish/reveal               │
└─────────────────────────────────────────────────────────────┘
```

- **Screen Capture Shield**: Uses Electron's native `mainWindow.setContentProtection(true)`. When you share your entire desktop in Zoom or Meet, the interview assistant window is automatically filtered out by the OS compositor and never visible to the interviewer.
- **Instant Stealth Panic Toggle (`⌘ + ⇧ + H` or `⌘ + \`)**: Instantly hides or reveals the window with 0ms delay, zero fade animation, and zero trace.
- **Webcam Proximity Positioning**: Placed right below the laptop camera lens so your eye line naturally matches direct eye contact with the interviewer.
- **Hands-Free Smooth Auto-Scroll (`⌘ + J`)**: Smoothly scrolls the teleprompter text as you speak, with customizable speeds.

---

## 📸 Screen Solver & Multilingual OCR

When the interviewer shares their screen with a complex problem description, diagram, or test cases:

1. Press **`⌘ + ⇧ + S`** (or click **📸 Solve Screen** in the top bar).
2. Choose **Fullscreen** or **✂️ Snip Box** to crop the exact problem coordinates.
3. The built-in OCR and multilingual vision parser extracts:
   - Problem statement and title
   - Input/output schemas and constraints
   - Edge case examples
4. The system immediately routes the problem to the frontier 120B model and produces:
   - 1-click compilable code solution in your preferred language
   - Intuitive spoken walkthrough
   - Time & space complexity proofs

---

## ⌨️ Keyboard Shortcuts Reference

### Global Shortcuts (Active Everywhere on System)
| Shortcut (macOS) | Shortcut (Windows/Linux) | Action |
| :--- | :--- | :--- |
| `⌘ + ⇧ + H` | `Ctrl + Shift + H` | **Global Stealth Toggle**: Instantly vanish / restore overlay |
| `⌘ + \` | `Ctrl + \` | **One-Handed Quick Stealth**: Rapid hide / show |
| `⌘ + ⇧ + Space` | `Ctrl + Shift + Space` | **Panic Stealth Toggle**: Works anywhere across the OS |
| `Alt + H` | `Alt + H` | Alternate stealth toggle |
| `⌘ + ⇧ + S` | `Ctrl + Shift + S` | **Screen Solver**: Capture & solve interviewer's screen |

### In-App Shortcuts (When Overlay is Active)
| Key | Action |
| :--- | :--- |
| `⌘ + 1` | Switch to **💻 Coding Challenge Mode** |
| `⌘ + 2` | Switch to **🎙️ Interview / STAR Mode** |
| `⌘ + 3` | Switch to **📝 Quiz / MCQ Assessment Mode** |
| `⌘ + K` | **Quick Copy Code**: Copy 100% clean compilable code directly to clipboard |
| `⌘ + J` | **Auto-Scroll**: Toggle hands-free smooth teleprompter scrolling |
| `Space` | **Done Reciting**: Advance teleprompter and resume listening for the next question |
| `Escape` | **Dismiss Overlay**: Instantly minimize/hide window |

---

## 🛠️ Tech Stack

- **Runtime**: [Electron 33](https://www.electronjs.org/) (Multi-process, context-isolated, native menus, tray integration)
- **Frontend**: [React 18](https://react.dev/), [TypeScript 5.6](https://www.typescriptlang.org/), [Vite 6](https://vitejs.dev/)
- **Styling & Motion**: Vanilla CSS (CSS Variables, Glassmorphism design tokens), [Framer Motion](https://www.framer.com/motion/)
- **Icons & Syntax Highlighting**: [Lucide React](https://lucide.dev/), [React Syntax Highlighter](https://github.com/react-syntax-highlighter/react-syntax-highlighter) (Prism)
- **State Management**: [Zustand 5](https://zustand-demo.pmnd.rs/) with localStorage and Electron Store persistence
- **Speech-to-Text**: [Whisper Large v3](https://huggingface.co/openai/whisper-large-v3) via [Groq Audio API](https://groq.com/)
- **LLM Reasoning**: `openai/gpt-oss-120b` & `qwen/qwen3.8-27b` via Groq Cloud
- **Document Processing**: `pdf-parse` (PDF resumes), `mammoth` (DOCX resumes)

---

## 🚀 Prerequisites & Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm**: v9.0.0 or later
- **Groq API Key**: Obtain a free, fast API key from [Groq Console](https://console.groq.com/keys).

### 2. Clone and Install
```bash
git clone https://github.com/your-username/ai-interview-assistant.git
cd ai-interview-assistant
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory:
```bash
cp .env.example .env.local
```
Add your Groq API key:
```env
VITE_GROQ_API_KEY=gsk_your_groq_api_key_here
```

---

## 💻 Development Workflow

To launch both the Vite development server and the Electron overlay window with hot module replacement (HMR):

```bash
npm run electron:dev
```

This concurrently launches Vite on `http://localhost:5173` and boots Electron with `--no-sandbox`.

---

## 📦 Building & Packaging

### macOS Packaging
Builds a signed `.dmg` installer and `.zip` archive for Apple Silicon (arm64) and Intel:
```bash
npm run electron:build
```
The output artifacts will be saved in `release/`:
- `release/AI-Interview-Assistant-1.0.0-arm64.dmg`
- `release/AI-Interview-Assistant-1.0.0-arm64-mac.zip`

---

### Linux Packaging & Execution

To package for Linux (Ubuntu, Debian, Fedora, Arch):
```bash
npm run build && npx electron-builder --linux AppImage deb
```

#### Running the AppImage on Ubuntu 24.04+ (Noble Numbat)
Ubuntu 24.04 switched to `libfuse3` by default, whereas AppImages require `libfuse2`. 

**Option 1: Install libfuse2 (Recommended)**
```bash
# Ubuntu 24.04 LTS
sudo apt update
sudo apt install -y libfuse2t64 || sudo apt install -y libfuse2

# Make executable and run
chmod +x release/AI-Interview-Assistant-1.0.0.AppImage
./release/AI-Interview-Assistant-1.0.0.AppImage --no-sandbox
```

**Option 2: Extract & Run without FUSE**
```bash
chmod +x release/AI-Interview-Assistant-1.0.0.AppImage
./release/AI-Interview-Assistant-1.0.0.AppImage --appimage-extract
./squashfs-root/ai-interview-assistant --no-sandbox
```

**Option 3: Install via `.deb` package**
```bash
sudo dpkg -i release/AI-Interview-Assistant_1.0.0_amd64.deb
sudo apt install -f # Fix any missing dependencies
```

---

### Windows Packaging
To compile for Windows (creates an NSIS installer and portable `.exe`):
```bash
npm run build && npx electron-builder --win nsis portable
```

---

## 🌐 Chrome Browser Extension

A companion Chrome extension is included in `browser-extension/` for instantly sending text from LeetCode, HackerRank, Google Docs, or any webpage directly to the teleprompter.

### Installation:
1. Open Google Chrome and visit `chrome://extensions/`.
2. Toggle on **Developer mode** in the top right.
3. Click **Load unpacked** and select the `/browser-extension` folder.
4. Highlight any problem description on the web, right-click, and select **"Send to AI Interview Assistant"** (or press `Alt + A`).

---

## 📂 Architecture & Directory Structure

```
ai-interview-assistant/
├── browser-extension/           # Companion Chrome extension for 1-click web scraping
├── dist/                        # Compiled production frontend assets (Vite)
├── dist-electron/               # Compiled Electron main and preload scripts
├── electron/
│   ├── main.ts                  # Main process: stealth window, shortcuts, tray, screen protection
│   ├── preload.ts               # Context-isolated secure IPC bridge
│   └── ipc/
│       └── handlers.ts          # Native IPC handlers (screen capture, dialogs, clipboard)
├── release/                     # Packaged binaries (.dmg, .AppImage, .deb, .exe)
├── src/
│   ├── components/
│   │   ├── teleprompter/
│   │   │   └── TeleprompterView.tsx # Main teleprompter interface, confidence badges, follow-ups
│   │   ├── interview/           # Status bars, audio visualizer, follow-up controls
│   │   ├── ResumeAndJobModal.tsx# Candidate resume upload & JD management
│   │   ├── SettingsPanel.tsx    # Model settings, hotkeys, transparency slider
│   │   ├── SessionsPanel.tsx    # Past interview recordings & history playback
│   │   └── TitleBar.tsx         # Custom frameless glass title bar & drag region
│   ├── data/
│   │   └── gfgCurriculum.ts     # GeeksforGeeks / DSA algorithm topic injectables
│   ├── services/
│   │   ├── InterviewEngine.ts   # Core state machine: VAD -> Whisper -> Groq LLM streaming
│   │   ├── candidatePersona.ts  # 7-layer prompts: STAR, FreeCodeCamp coding, System Design, HR
│   │   ├── screenSolver.ts      # Screenshot capture, OCR preprocessing, and prompt builder
│   │   ├── whisper.ts           # Groq Whisper Large v3 client with dynamic vocabulary priming
│   │   ├── ai.ts                # Groq API streaming client and question classification
│   │   ├── VoiceActivityDetector.ts # Audio silence threshold and speech boundary detector
│   │   ├── interruptionDetector.ts  # Real-time candidate speech vs interviewer classifier
│   │   ├── LatencyTracker.ts    # Precision milestone latency instrumentation
│   │   ├── resume.ts            # PDF/DOCX resume text extraction and skill parsing
│   │   └── SentenceBuffer.ts    # Streaming token chunker into smooth teleprompter sentences
│   ├── store/
│   │   └── useAppStore.ts       # Unified Zustand store (conversation memory, confidence, settings)
│   ├── styles/
│   │   └── index.css            # Dark mode glassmorphism theme, fonts, custom scrollbars
│   ├── types/
│   │   └── index.ts             # Global TypeScript definitions
│   ├── App.tsx                  # Root React component
│   └── main.tsx                 # React entry point
├── package.json
├── tsconfig.json
├── tsconfig.electron.json
└── vite.config.ts
```

---

## 👤 Candidate Personalization

Tailor the assistant to answer with your exact background, career accomplishments, and projects:

1. Click **📄 Resume & JD** in the top bar.
2. Upload your **Resume** (PDF, Word DOCX, or plain text). The assistant extracts:
   - Past companies, titles, and project names.
   - Core technical stacks (e.g., Java, Spring Boot, Kafka, MongoDB, AWS, Kubernetes).
   - Measurable metrics & accomplishments for STAR behavioral stories.
3. Paste the **Target Job Description** and **Target Role** (e.g., *Senior Distributed Backend Engineer*).
4. Select your **Preferred Coding Language** (Java, Python, C++, Go, TypeScript, Rust, C#).
5. All generated answers will automatically speak in the first person ("In my work at...", "I chose Kafka because..."), perfectly matching your genuine background.

---

## 🔒 Privacy & Security

- **Zero Cloud Data Storage**: Your voice audio and transcripts are streamed ephemerally directly to Groq over HTTPS and are never stored on third-party servers.
- **Local Settings Storage**: Resumes, preferences, and session statistics are saved strictly on your local machine using encrypted system keychains (`keytar`) and local storage.
- **Zero In-App Tracking**: No telemetry, analytics trackers, or phone-home beacons are bundled into the codebase.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Engineered for ambitious software engineers. Master your technical interviews with confidence.</sub>
</div>
