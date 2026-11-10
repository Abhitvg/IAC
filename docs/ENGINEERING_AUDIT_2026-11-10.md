# IAC Engineering Audit — 2026-11-10

**Repository:** `Abhitvg/IAC`  
**Audit baseline:** `3d342e46cd70eceefd76fb4e26f42ff05b35b461`  
**Scope:** Electron main/preload/IPC, credential storage, renderer answer generation, application shell and keyboard interactions, package metadata, tests, CI workflows, and engineering documentation.

## Audit limitations

This is a source-and-CI audit, not a claim of complete runtime certification. The repository was inspected through GitHub source and Actions evidence. No local Electron app was launched and no macOS/Windows physical-device interaction or visual screenshot review was performed. Findings below are limited to evidence confirmed in the inspected source and workflow runs.

## Executive summary

The repository has a substantial automated test suite and strong baseline Electron controls: context isolation, disabled Node integration, production sandboxing, strict sender/frame checks, path validation, OS-backed credential storage, SSRF protections, and Linux packaged-app smoke tests.

However, the application is **not yet security-cleared for production**. The most important remaining issue is that decrypted provider credentials cross the Electron IPC boundary into the renderer. Encryption at rest does not protect a secret after it has been returned to Chromium.

## Confirmed findings

| Priority | Area                               | Evidence / impact                                                                                                                                                                                                                                                                                                | Status                                                                                                                                              |
| -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Provider credential isolation      | `electron/preload.ts` exposes `getApiKey()`; `electron/ipc/handlers.ts` returns decrypted values from `credentials:get`; `AnswerGenerationService` reads them in renderer; `SettingsPanel` loads stored keys into React state. A renderer compromise can recover provider secrets.                               | **Open — architectural remediation required**                                                                                                       |
| **P1** | Vite environment secrets | Renderer LLM and STT code previously read `VITE_GROQ_API_KEY`, `VITE_OPENAI_API_KEY`, and `VITE_OPENROUTER_API_KEY`. Vite-prefixed variables are bundled for client access. | **Remediation:** PR #79 removes LLM fallbacks; PR #81 removes STT fallbacks; tests cover both. |
| **P1**   | Global keyboard handler            | The document-level shortcut callback omitted actions from its dependency list and intercepted common modified shortcuts such as Cmd/Ctrl+C and Ctrl+R. It could also fire while select/textbox controls had focus.                                                                                               | **Fixed on main** in PRs #75, #77 and #78; PR #78 CI passed.                                                                                        |
| **P1**   | Cross-platform packaged validation | CI typechecks, tests and builds on Ubuntu, macOS and Windows. Packaged Electron launch and wizard accessibility smoke tests run only on Ubuntu. Platform-specific packaging/runtime regressions can escape macOS/Windows CI.                                                                                     | **Open — CI expansion required**                                                                                                                    |
| **P1**   | Dependency audit gate              | CI previously printed npm audit results without failing on high/critical advisories. The inspected run reported zero vulnerabilities.                                                                                                                                                                            | **Remediation in PR #79**: CI now fails on high/critical advisories.                                                                                |
| **P2**   | Engineering documentation accuracy | The October 31 baseline document says credentials are never exposed to renderer memory. That is contradicted by the current `getApiKey` preload/API path. The modernization report claims “RELEASE-READY / PRODUCTION CERTIFIED” and lists Electron 33, while `package.json` currently declares Electron 45.2.3. | **Correction required; historical docs must not be treated as current certification**                                                               |
| **P2**   | Dependency upgrade backlog         | Open Dependabot PRs include major upgrades for TypeScript, Vite, Tailwind CSS and uuid. These require compatibility review and full CI rather than blind merging.                                                                                                                                                | **Open — assess individually**                                                                                                                      |

## P0 remediation design: keep provider secrets in Electron main

The correct fix is not to delete `getApiKey` while leaving renderer fetches in place; that would break the product. The provider boundary needs to move:

1. Renderer submits a validated generation request (provider, model, prompt/messages, generation limits and request ID) to a narrow main-process API.
2. Electron main resolves the credential from `CredentialStore`, validates provider/model/endpoint allowlists and performs the network request.
3. Stream token/sentence events to the originating trusted renderer frame without returning the credential.
4. Support cancellation with per-request `AbortController`, bounded payloads, timeouts, retry policy, Groq secondary-key failover and sanitized errors.
5. Remove `credentials:get` and `getApiKey` from IPC/preload once all consumers are migrated.
6. Settings must display only credential presence/status. Never read an existing secret back into an input field; allow replace/delete actions without revealing it.
7. Add tests proving renderer APIs cannot retrieve raw credentials, secrets never appear in IPC payloads/logs/build artifacts, and streaming/cancellation/failover behavior is preserved.

This is a cross-cutting change spanning preload contracts, IPC handlers, provider transport, answer generation, settings/preflight, and integration tests. It should be delivered as its own migration with staged rollout, not as an unsafe one-line removal.

## CI and release-quality improvements

- Make `npm audit` fail on high/critical advisories while preserving the detailed advisory report.
- Add packaged-app smoke coverage for Windows and macOS, or explicitly document why a platform cannot be exercised in hosted CI.
- Add tests for credential isolation, provider gateway cancellation, retry/failover, and IPC payload validation.
- Keep the secret-bundle scan and extend it with source-level checks against renderer-side provider-secret environment variables.
- Require all checks to complete before release; a green typecheck/build alone is not a release certification.

## Product and design audit boundary

The codebase contains an established design-system directory and a large application shell with dashboard, preparation, live workspace, practice, career operations, documents, evidence, history and analytics views. Source inspection alone cannot establish visual quality, responsive behavior, keyboard usability, or end-to-end user-flow correctness. Those require launching the app at representative window sizes and exercising the actual workflows. No visual redesign is certified by this source audit.

## Next execution order

1. Complete P0 main-process provider gateway and remove raw-key renderer access.
2. Close any security/test failures surfaced by that migration.
3. Enforce dependency audit and cross-platform packaged validation.
4. Correct stale engineering documentation and dependency backlog.
5. Run a structured UX pass across onboarding, candidate setup, preparation, live interview, practice, history and analytics, including narrow-window and accessibility checks.
6. Optimize performance and polish visual hierarchy only after correctness and security gates are green.

**Audit conclusion:** The codebase has useful engineering foundations, but the confirmed renderer credential exposure means it must not be described as fully production-certified yet.
