# Dependency security risk register

**Reviewed:** 18 November 2026  
**Scope:** CareerOps application and build-tool dependency graph

## CI policy

The CI pipeline runs two separate dependency checks:

- `npm audit --omit=dev --audit-level=high` is a blocking gate for production dependencies.
- The full `npm audit` report remains visible in CI, but development-tool findings are currently non-blocking while upstream fixes or compatible upgrades are evaluated.

This is a deliberate scope distinction, not a claim that the complete dependency graph is clean. A development dependency can still affect developer workstations and CI runners.

## Current findings

The full dependency audit on the current dependency set reports **25 high-severity findings and 0 critical findings**. The production-only audit passed on CI run [44155806865](https://github.com/Abhitvg/IAC/actions/runs/44155806865).

The affected development-tool families include `electron-builder` and its packaging dependencies, `tailwindcss` 3.x and its globbing dependencies, `vite`/its globbing dependencies, `vitest`, and `typescript-eslint`. Findings include the Picomatch ReDoS advisory. The current lockfile paths for these findings are in the development-tool dependency tree; the production-only audit is the enforcement boundary for shipped runtime dependencies.

## Remediation already applied

- Vite was updated from 6.4.5 to **6.4.6** in `package.json` and `package-lock.json`.
- Vite advisory GHSA-p4f5-76q4-ffq7 affects Vite through 6.4.5 and lists 6.4.6 as the patched 6.x release. The reported RCE requires the dev server to be explicitly exposed to the network (for example with `--host` or `server.host`). The repository's Vite configs do not set a public host; do not expose the local dev server to untrusted networks.

## Unresolved development-tool risk

GitHub advisory GHSA-fc5q-39xc-vjpf reports a ReDoS issue in Picomatch through 4.0.7. The advisory currently has no published patched version. The lockfile still contains Picomatch versions 4.0.7 and 2.3.2 through development tooling.

Do not substitute an unrelated fork or pre-release patch for this vulnerability. In particular, the open Picomatch change that addresses parsing of leading-question-mark extglobs explicitly says it does not fix the repeated-extglob ReDoS shape `+(*a)`. Revisit when the maintainer publishes a verified security fix.

Other suggested audit remediations include major-version changes (for example Tailwind CSS 3 to 4) or version changes that would alter the current test/build toolchain. Do not use `npm audit fix --force` as a blanket remediation. Upgrade those toolchains in isolated changes with migration work and full platform validation.

## Operating requirements

1. Keep production dependency audit blocking.
2. Keep the full development dependency report visible on every CI run.
3. Do not expose the Vite development server with `--host` on an untrusted network.
4. Do not accept glob patterns from untrusted users in build or tooling paths without a separate review and bounded-input strategy.
5. Re-run the full audit and update this register when upstream fixes or safe compatible upgrades become available.

## Application encryption key boundary

The CareerOps runtime was reviewed against the repository's no-direct-KMS application constraint. The API uses per-record AES-256-GCM data keys wrapped locally by a versioned 32-byte master-key ring injected by ECS from the Secrets Manager configuration secret. The application code does not call KMS or implement SigV4 KMS requests.

The existing customer-managed KMS key protects the Secrets Manager configuration secret at rest. Only the ECS execution role receives `kms:Decrypt`, constrained to Secrets Manager via `kms:ViaService` and the exact secret ARN through `kms:EncryptionContext:SecretARN`. The API task role receives no KMS permissions. Keep all master-key versions needed for existing envelopes in the Secrets Manager key ring until those envelopes have been re-encrypted or retired.
