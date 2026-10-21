# 🔒 Security Policy & Architectural Hardening

This document outlines the security architecture, threat model, data privacy guarantees, and vulnerability reporting procedures for the **AI Interview Practice Gym**.

---

## 1. Threat Model & Design Principles

The AI Interview Practice Gym is designed strictly as a personal desktop practice environment for technical interview preparation. We treat security as a first-class architectural requirement:

1. **Zero Secret Leakage in Renderer**: The web renderer operates completely untrusted. No API keys, credentials, or secrets are ever exposed to the DOM, local storage, or bundled into production distribution assets.
2. **Process & Context Isolation**: Electron processes are strictly separated using OS-level sandboxing, context isolation, and IPC boundaries.
3. **Local Loopback Security**: The companion browser extension communicates exclusively over local loopback (`127.0.0.1`) with per-installation cryptographic token authentication and Origin verification.
4. **Untrusted Input Containment**: Any content captured from external websites is treated as untrusted and encapsulated to defend against prompt injection attacks.

---

## 2. Electron Hardening Checklist

| Layer                       | Implementation                                                 | Purpose                                                                                                      |
| :-------------------------- | :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| **Context Isolation**       | `contextIsolation: true`                                       | Prevents renderer scripts from accessing Electron or Node.js internal APIs.                                  |
| **Node Integration**        | `nodeIntegration: false`                                       | Disallows `require()`, `process`, or Node primitives in the renderer window.                                 |
| **Sandboxing**              | Enabled for production builds                                  | OS-level sandbox restricts renderer process capabilities.                                                    |
| **Content Security Policy** | Strict `script-src 'self'; connect-src 'self' 127.0.0.1:* ...` | Blocks inline evaluation (`unsafe-eval`), unauthorized scripts, and unexpected outbound network connections. |
| **IPC Input Validation**    | Strict whitelist schema                                        | Every IPC handler validates channel names, payload types, numeric bounds, and character lengths.             |
| **Markdown Sanitization**   | `react-markdown` with default safe renderers                   | Disallows raw HTML rendering (`rehype-raw` is not used), preventing XSS attacks via generated answers.       |

---

## 3. Credential Storage & SafeStorage Architecture

API keys (Groq, OpenAI, OpenRouter) are managed exclusively by the Electron main process via `electron/services/credentialStore.ts`:

- **Primary Storage**: Electron `safeStorage` API encrypts keys using OS-level keyrings:
  - **macOS**: Apple Keychain
  - **Windows**: Data Protection API (DPAPI)
  - **Linux**: Secret Service API / libsecret (GNOME Keyring, KWallet)
- **Headless / Container Fallback**: For headless environments or Linux desktop sessions without an active keyring, credentials are encrypted at rest with **AES-256-GCM** using a machine-scoped random 256-bit key stored with restrictive `0600` permissions.
- **Renderer IPC**: The renderer queries credentials on-demand through an IPC bridge with validated service identifiers (`groq`, `openai`, `openrouter`, `ollama`).

---

## 4. Localhost WebSocket & Extension Hardening

When browser integration is enabled:

- **Loopback Binding**: The WebSocket HTTP server strictly binds to `127.0.0.1` (never `0.0.0.0`), preventing connections from other devices on the local network.
- **Origin Header Check**: Incoming WebSocket handshakes verify the `Origin` header. Requests from web browsers (`http://`, `https://`) are rejected; only `chrome-extension://` origins are permitted.
- **Cryptographic Token Authentication**: Every installation generates a cryptographically secure UUID token (`crypto.randomUUID()`). The extension must provide this token via handshake or query parameter. Unauthenticated connections are dropped after 5 seconds.
- **Payload Limits**: Messages exceeding 256KB are discarded immediately to protect against memory exhaustion or buffer overflow.
- **Untrusted Input Delimiters**: Problem text captured from pages is wrapped in:
  ```
  <<<EXTERNAL_UNTRUSTED_CONTENT>>>
  [untrusted page text, truncated to 10,000 characters]
  <<<END_EXTERNAL_UNTRUSTED_CONTENT>>>
  ```
  System prompts explicitly instruct models to never execute instructions, role overrides, or leak prompts contained inside these tags.

---

## 5. Automated CI Secret Scanning

Continuous integration enforces that no API keys or credential patterns (`gsk_*`, `sk-*`) are ever committed or bundled into the production `dist/` or `dist-electron/` output:

```bash
npm run security:check
```

Builds will fail in GitHub Actions if any secret pattern is detected.

---

## 6. Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

- **Contact**: security@ai-interview-practice.org (or open a private security advisory on GitHub).
- Do not open a public issue for active vulnerabilities.
- We will acknowledge receipt within 48 hours and coordinate a patch release.
