# 100% Offline Practice Mode: Setup & Verification Guide

This guide documents how to configure and verify **AI Interview Practice Gym** in **100% Offline Mode**, with zero network requests and zero cloud dependencies.

---

## 🏗️ Architecture Overview

In Offline Mode, all three core AI components run locally on your machine:

1. **LLM Engine (Interviewer & Scorer):** [Ollama](https://ollama.ai) daemon running `llama3.2:1b` (fast interviewer turns) or `llama3.1:8b` (deep scoring) bound to loopback `http://127.0.0.1:11434`.
2. **Speech-to-Text (Voice Ingress):** Local [whisper.cpp](https://github.com/ggerganov/whisper.cpp) server running `ggml-base.bin` (or `ggml-small.bin`) bound to `http://127.0.0.1:8080`.
3. **Text-to-Speech (Voice Output):** Browser Native Web Speech API (zero dependencies, completely offline) or local [Piper](https://github.com/rhasspy/piper) / [Kokoro](https://github.com/hexgrad/kokoro).

---

## 🚀 Step-by-Step Setup

### Step 1: Install & Launch Ollama

```bash
# 1. Install Ollama (macOS / Linux / Windows)
brew install ollama  # macOS (or download from ollama.ai)

# 2. Pull the recommended local models
ollama pull llama3.2:1b

# 3. Verify Ollama is running
curl http://127.0.0.1:11434/api/tags
```

### Step 2: Setup Local whisper.cpp Server

```bash
# 1. Clone and compile whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make -j

# 2. Download a base model
bash ./models/download-ggml-model.sh base.en

# 3. Run the HTTP server on port 8080
./server -m models/ggml-base.en.bin --port 8080 --host 127.0.0.1
```

### Step 3: Configure AI Interview Practice Gym

1. Open **Settings** (or complete the first-run Onboarding flow).
2. Select **Ollama (Local Offline)** as your AI Provider.
3. Ensure endpoint is set to `http://127.0.0.1:11434`.
4. Ensure Whisper provider is set to `local-whisper-cpp`.

---

## 🧪 15-Minute Mixed Mock Manual Verification Steps

Follow these steps to verify that a full 15-minute practice session completes completely offline:

1. **Disconnect Internet:** Turn off Wi-Fi or disconnect ethernet on your machine.
2. **Launch Application:** Run `npm run dev` or launch the packaged build.
3. **Verify Health:** Notice the green "Ready" indicator. No network calls to `api.openai.com` or `api.groq.com` are initiated.
4. **Start Dress Rehearsal:**
   - Click **Start Practice Session**.
   - Select **45-Minute Dress Rehearsal** or **Behavioral Deep Dive**.
5. **Question 1 (Behavioral / Icebreaker):**
   - Speak your answer out loud into your microphone (e.g., 60 seconds describing a challenging project).
   - Verify speech is transcribed via local whisper.cpp with zero network traffic.
   - Click **Submit Answer**.
   - Ollama evaluates the transcript locally and generates an evidence-based rubric scorecard citing verbatim transcript quotes.
6. **Question 2 (Technical Follow-Up / Probing):**
   - The AI interviewer poses a dynamic follow-up probing the weakest part of your previous answer.
   - Respond out loud and submit.
7. **Question 3 (System Design / Algorithmic Architecture):**
   - Respond with trade-offs and complexity analysis.
   - Verify that delivery metrics (WPM, filler percentage, hesitation) are calculated locally without errors.
8. **Summary Scorecard:**
   - Complete the round. The overall scorecard displays:
     - Total Latency: ~300ms - 800ms
     - Estimated Cost: **$0.0000**
     - Verifiable evidence quotes with zero hallucinations.

---

## 🛡️ Cost & Token Budgeting

Even in offline mode, `LLMManager` enforces session token budgeting:

- Default budget: **25,000 tokens** per practice session.
- Runaway loops or excessively long prompts trigger an explicit threshold warning before exhausting device RAM.
- Local inference costs **$0.00** per session.
