# Security Policy

## Product Security Model: Practice Gym Only

**AI Interview Assistant (IAC)** is strictly an interview preparation, mock rehearsal, and delivery coaching environment. It is intentionally designed with the following non-negotiable security and architectural principles:

- **No Evasion or Deception:** The application does not attempt to conceal itself from operating system process monitors, proctoring systems, or screen sharing software.
- **No Live Copilot / Real-Time Proxying:** The application does not act as an automated answer generator or secret teleprompter during live assessments.
- **Local-First & Data Minimal:** Candidate resumes, transcripts, and evaluation data remain on the local machine within the operating system's designated application storage (`userData`), unless explicitly sent to candidate-configured LLM providers for scoring.

---

## Security Architecture & Controls

### 1. Electron Permission Model (Strict Allowlist)
Electron's blanket permission handlers (`setPermissionRequestHandler`, `setPermissionCheckHandler`) are replaced with an explicit allowlist:
- **Allowed:** `media` (microphone access) exclusively for the application's authenticated local origin (`file://` in production or `http://localhost:5173` in local development).
- **Denied by Default:** Geolocation, push notifications, video cameras, MIDI, clipboard reading, pointer locks, background sync, and all other browser permissions are unconditionally rejected.

### 2. File System Isolation & Sandbox
The renderer process is strictly isolated with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` in production.
- **`fs:read-file`:** Strictly limited to files inside the application's `userData` directory, OR files explicitly selected by the user via the native OS `dialog:open-file` dialog within the current session. Reading from arbitrary system paths (such as the user's home directory root or `/etc`) is blocked. Symlinks are resolved to canonical target paths on disk (`fs.realpathSync`) to prevent symlink traversal and `../` escape attacks.
- **`fs:write-file`:** Strictly restricted to files inside `userData`. Attempts to overwrite `userData` root or target symlinks pointing outside the directory are blocked. File payload sizes are capped at 25 MB to prevent disk exhaustion.
- **`fs:delete`:** Restricted to existing files or directories strictly within `userData`. Attempts to delete the `userData` root or outside paths are denied.

### 3. Content Security Policy (CSP)
Session web requests enforce a rigid Content-Security-Policy header:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https: wss: ws://127.0.0.1:* http://127.0.0.1:*; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```
In production builds, `'unsafe-eval'` is strictly omitted.

### 4. IPC Defense & Safe Markdown
- Every IPC invocation across preload boundaries validates input arguments against strict type and schema checks before performing operations.
- Candidate transcripts, model answers, and rubric descriptions rendered in the UI utilize `SafeMarkdown` with raw HTML parsing disabled (`skipHtml: true`), neutralizing script injection (XSS).

### 5. Secure Credential Management
- LLM Provider API keys (Groq, OpenAI, OpenRouter) are **never** stored in plain text and **never** exposed to renderer localStorage or client JavaScript bundles.
- Credentials are encrypted in the Electron main process using Electron's native `safeStorage` (backed by macOS Keychain, Windows Credential Manager, or Linux libsecret).
- When safeStorage is unavailable (such as in headless CI), an AES-256-GCM cipher with a machine-scoped random 256-bit key (file mode `0600`) provides persistent encryption.
- Continuous automated CI audits (`npm run security:check`) scan every production bundle (`dist/` and `dist-electron/`) to guarantee no API keys or credentials ever leak into build output.

### 6. Localhost Extension WebSocket Security
The companion browser extension communication channel implements four defense-in-depth layers:
1. **Loopback Binding Only:** The server binds exclusively to `127.0.0.1`, rejecting any network or LAN exposure.
2. **Origin Verification:** Any incoming connection without an origin matching `chrome-extension://` is terminated immediately.
3. **Session Authentication:** A cryptographically random per-session token (`crypto.randomUUID()`) is required during the handshake.
4. **Untrusted Data Isolation:** Received browser payloads are capped at 256 KB and wrapped in strict `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` delimiter blocks to prevent prompt injection attacks.

---

## Reporting a Vulnerability

If you discover a security vulnerability in this project:
1. **Do not** create a public GitHub issue.
2. Email security details and reproduction steps to the repository maintainer.
3. Include:
   - Description of the vulnerability and affected versions
   - Proof-of-concept steps or exploit code
   - Assessment of potential impact
4. We acknowledge receipt within 48 hours and work with you to patch and verify the issue before public disclosure.
