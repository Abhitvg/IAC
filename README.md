# AI Interview Assistant

A 100% local, cross-platform AI-powered technical interview practice assistant.

## Features

- **Real-Time Audio**: Captures microphone input and detects when you stop speaking.
- **Local & Cloud AI**: Supports OpenAI API, OpenRouter, and local models via Ollama.
- **Whisper Transcription**: Uses local Whisper servers or OpenAI Whisper API.
- **Intelligent Modes**: Get Quick Answers, standard Interview Answers, or Deep Dives.
- **Browser Context**: Receive text and URLs directly from Chrome via extension.
- **Resume Context**: Upload a PDF/DOCX/TXT resume for personalized questions.
- **Session History**: Track your performance across categories over time.
- **Coding Assistance**: Automatically detects DSA/System Design questions and structures responses (Brute force, Optimal, Big O, Code, Edge Cases).
- **Privacy-First**: No data sent to third parties unless you explicitly use a cloud API key.

## Development

```bash
# Install dependencies
npm install

# Start development server and Electron
npm run electron:dev
```

## Production Build

```bash
# Build for all platforms (requires correct OS dependencies)
npm run electron:build
```

## Browser Extension

The Chrome extension is located in the `browser-extension` folder.

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right.
3. Click "Load unpacked" and select the `browser-extension` directory.
4. Select text on any webpage and press `Alt + A` or right-click and select "Send to AI Interview Assistant".
