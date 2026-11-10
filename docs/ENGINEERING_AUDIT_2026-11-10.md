# IAC Engineering Audit — 2026-11-10

**Repository:** `Abhitvg/IAC`  
**Audit baseline:** `ab4dff7b27271c698e1d6a89054544ea9c0242a8`  
**Scope:** Electron main/preload/IPC, credential storage, renderer answer generation, application shell and keyboard interactions, package metadata, tests, CI workflows, and engineering documentation.

## Audit limitations

This is a source-and-CI audit, not a claim of complete runtime certification. The repository was inspected through GitHub source and Actions evidence. Packaged Electron applications were launched in hosted CI on Ubuntu, macOS, and Windows, but no interactive local-device session or visual screenshot review was performed. Findings below are limited to evidence confirmed in the inspected source and workflow runs.

## Executive summary

The repository has strong baseline Electron controls: context isolation, disabled Node integration, production sandboxing, strict sender/frame checks, path validation, OS-backed credential storage, SSRF protections, and packaged-app smoke tests on Ubuntu, macOS, and Windows. The provider credential boundary has also been migrated so raw saved keys remain in Electron main.

This is **not a production-readiness certification**. Remaining work includes deterministic dependency installation, verifying current CI results, assessing the dependency backlog, and completing hands-on visual, accessibility, and end-to-end product validation.

## Confirmed findings

| Priority | Area                                  | Evidence / impact                                                                                                                                                                                                  | Status                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Provider credential isolation         | Saved provider credentials were previously returned to renderer through `credentials:get`; LLM streaming and STT also issued provider requests from renderer.                                                      | **Fixed on main:** LLM streaming, model fallback, non-streaming recovery, Groq secondary-key failover, STT, and cloud preflight resolve credentials and perform cloud requests in Electron main. `credentials:get` and the preload `getApiKey` method are removed. Raw saved provider keys no longer cross IPC.           |
| **P1**   | Deterministic dependency installation | The committed npm lockfile now exists (lockfileVersion 3, 787 package entries) and its root direct dependency/devDependency declarations match `package.json`. | **Implemented on main in PR #134:** CI now caches using `package-lock.json` and runs `npm ci --no-audit --no-fund`; it no longer silently falls back to a non-deterministic `npm install`. CI execution evidence for this merge was not returned by the connector. |
| **P1**   | Groq credential parsing               | Credential input, stored values, environment variables, and startup migration must reject valid-looking substrings embedded in malformed text.                                                                     | **Fixed on main:** PRs #126 and #129 require complete Groq keys and anchor `.env.local` parsing; regression tests cover malformed values.                                                                                                                                                                                 |
| **P1**   | File-read race and resource bounds    | A separate path-validation/read sequence left a symlink-swap window, and renderer-triggered reads had no explicit byte limit.                                                                                      | **Fixed on main in PR #131:** descriptor-based reads, no-follow where supported, inode checks, approval revalidation, and a 25 MB streaming read cap.                                                                                                                                                                     |
| **P2**   | Empty successful AI streams           | A provider could return HTTP success with an empty response body and be reported as a successful completion.                                                                                                       | **Fixed on main in PR #125:** empty streams now surface as stream errors with regression coverage.                                                                                                                                                                                                                        |
| **P1**   | Vite environment secrets              | Renderer LLM and STT code previously read Vite-prefixed provider keys, which are bundled for client access.                                                                                                        | **Fixed on main:** PR #79 removed LLM fallbacks; PR #81 removed STT fallbacks; regression tests cover both.                                                                                                                                                                                                               |
| **P1**   | Global keyboard handler               | The document-level shortcut callback omitted actions from its dependency list and intercepted common modified shortcuts such as Cmd/Ctrl+C and Ctrl+R. It could also fire while select/textbox controls had focus. | **Fixed on main** in PRs #75, #77 and #78; PR #78 CI passed.                                                                                                                                                                                                                                                              |
| **P1**   | Cross-platform packaged validation    | CI now builds and launches the packaged Electron application on Ubuntu, macOS, and Windows, in addition to the shared unit, typecheck, lint, and build matrix.                                                     | **Fixed on main in PR #94.** The merge-commit CI run passed on all three hosted OS runners, including packaged-app launch smoke tests.                                                                                                                                                                                    |
| **P1**   | Dependency audit gate                 | CI previously printed npm audit results without failing on high/critical advisories. The inspected run reported zero vulnerabilities.                                                                              | **Remediation in PR #79**: CI now fails on high/critical advisories.                                                                                                                                                                                                                                                      |
| **P1**   | Ollama preflight false success        | Preflight reported success when `/api/tags` returned an empty model catalogue, even though no selected model could run.                                                                                            | **Fixed on main in PR #89** with empty-catalogue and missing-model regression tests.                                                                                                                                                                                                                                      |
| **P2**   | PDF layout test isolation             | A pure PDF-layout test imported an Electron-dependent parser and unnecessarily initialized the native Electron runtime on macOS.                                                                                   | **Fixed on main in PR #96:** pure layout extraction now lives in a dependency-free module, while the parser preserves its public export.                                                                                                                                                                                  |
| **P2**   | Main shell responsive overflow        | No page-level horizontal overflow was previously asserted for the main application shell at narrow and common desktop widths.                                                                                      | **Regression guard added in PR #103:** Playwright checks 375, 768, 1024, and 1440px viewport widths in CI. This is not a substitute for full visual review.                                                                                                                                                               |
| **P2**   | Engineering documentation accuracy    | October 31 baseline and modernization reports contain claims that no longer match the current renderer credential boundary and Electron version.                                                                   | **Mitigated:** both documents now carry prominent historical-snapshot notices and link to this current audit. They remain archival records, not release evidence.                                                                                                                                                         |
| **P2**   | Dependency upgrade backlog            | Open Dependabot PRs include major upgrades for TypeScript, Vite, Tailwind CSS and uuid. These require compatibility review and full CI rather than blind merging.                                                  | **Open — assess individually.**                                                                                                                                                                                                                                                                                           |

## P0 credential-boundary implementation — fixed on main

The credential migration is implemented across the Electron main process and renderer boundary:

1. Renderer submits validated generation/transcription requests through narrow preload APIs.
2. Electron main resolves credentials from `CredentialStore` and performs cloud provider requests.
3. Stream and transcription results return to the trusted renderer without returning provider credentials.
4. Cancellation uses per-request `AbortController` instances; request payloads are bounded and provider errors are sanitized.
5. The raw `credentials:get` IPC handler and preload `getApiKey` method are absent from main.
6. Settings exposes credential presence and replace/delete actions; it does not load saved keys into renderer state.
7. Regression tests cover credential isolation, provider routing, transcription, streaming, and malformed Groq credential inputs.

Keep these invariants covered. Future providers, custom endpoints, or new IPC methods must not reintroduce renderer access to decrypted credentials.

## CI and release-quality improvements

- `npm audit` fails on high/critical advisories while preserving the detailed advisory report (PR #79).
- Packaged-app smoke coverage runs on Ubuntu, macOS, and Windows (PR #94).
- PR #124 and #127 were temporary compatibility fixes while the lockfile was absent. After confirming the lockfile appeared on main and matched direct dependency declarations, PR #134 restored npm caching and deterministic `npm ci`.
- The recent merge commits queried during this audit did not return workflow-run or combined-status records. This report does not claim that the latest changes have passed CI.
- Regression coverage now includes credential isolation, provider routing, cloud transcription, streaming, cancellation, and IPC payload validation (including PR #132).
- Keep the secret-bundle scan and extend it with source-level checks against renderer-side provider-secret environment variables.
- Require all checks to complete before release; a green typecheck/build alone is not a release certification.

## Product and design audit boundary

The codebase contains an established design-system directory and a large application shell with dashboard, preparation, live workspace, practice, career operations, documents, evidence, history and analytics views. Source inspection alone cannot establish visual quality, keyboard usability, or end-to-end user-flow correctness. CI now includes a targeted main-shell horizontal-overflow guard at representative widths, but that does not establish full visual quality. Hands-on screenshot review and workflow exercise remain outstanding. No visual redesign is certified by this source audit.

## Next execution order

1. Obtain and review complete CI results for the latest main commit on Ubuntu, macOS, and Windows; do not infer green status from a successful merge.
2. Review the open dependency-update PRs individually; several propose major-version changes with compatibility risk.
3. Assess major dependency upgrades individually and keep the dependency audit gate enforced.
4. Complete a structured UX pass across onboarding, candidate setup, preparation, live interview, practice, history and analytics, including narrow-window and accessibility checks.
5. Validate the product visually on representative window sizes and real operating systems; hosted CI does not replace hands-on usability review.
6. Optimize performance and polish visual hierarchy only after correctness and security gates are green.

**Audit conclusion:** The previous raw-credential renderer exposure is fixed on main. The repository is still not certified release-ready: deterministic installation is now configured but its CI run has not been verified, dependency upgrades remain pending, and hands-on visual/accessibility validation remains outstanding.
