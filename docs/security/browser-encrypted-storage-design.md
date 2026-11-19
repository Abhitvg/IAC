# Browser encrypted-storage design

## Status

Design decision for the browser client. This document is not evidence that browser encryption or browser-store migration is implemented. Browser persistence must remain fail-closed for sensitive records until the unlock flow, storage adapter, migration UI, and tests ship together.

## Security boundary

Electron desktop records use a random data-encryption key wrapped by Electron `safeStorage`; the key remains in the main process.

A browser cannot use Electron's OS-backed key store. Browser records therefore require a separate user-unlocked vault:

- Derive a non-extractable AES-256-GCM key from a user passphrase with PBKDF2-HMAC-SHA-256, a random per-vault 16-byte salt, and at least 600,000 iterations.
- Use a fresh 12-byte IV for every record and bind application, schema version, tenant/account scope, namespace, and record ID as AES-GCM additional authenticated data.
- Store only ciphertext, IV, authentication tag (or combined WebCrypto ciphertext/tag), KDF parameters, and salt in IndexedDB. Do not store passphrases or derived keys in IndexedDB, localStorage, cookies, URL parameters, logs, analytics, or crash reports.
- Keep the non-extractable CryptoKey only in memory while the vault is unlocked. Clear the in-memory reference on lock, logout, account switch, and page lifecycle events where practical.
- Verify a passphrase by decrypting a dedicated encrypted verifier record. Wrong passphrases must fail closed; never create a replacement key over an existing vault.
- Require an explicit unlock/setup screen before sensitive browser records can be read or written. No plaintext localStorage fallback is permitted.

## Manual migration policy

- Do not automatically import, rewrite, or delete existing localStorage/session files.
- Before migration, require an explicit user-initiated export/backup and show the data categories and approximate record counts.
- Import into the encrypted store, read back and authenticate every imported record, show a reconciliation report, and retain the source until the user explicitly confirms deletion in a separate action.
- Interrupted imports must be resumable and idempotent. Corrupt or unrecognized source records must be retained and reported, never silently discarded.
- Provide a recovery/export path while the vault is unlocked. There is no server-side recovery of a lost passphrase; loss of the passphrase without a valid export means the encrypted browser data is unrecoverable.

## Threat model and limitations

This protects browser data against offline inspection of the IndexedDB database when the vault is locked. It does not protect data from same-origin XSS, malicious browser extensions, compromised browser profiles, keyloggers, screen capture, or malware running while the vault is unlocked. The application must still enforce a strict CSP, avoid unsafe HTML, sanitize untrusted content, minimize third-party scripts, and use short idle-lock periods.

Browser encryption is not equivalent to Electron OS-backed encryption. Cloud records remain a separate server-side boundary protected by tenant-scoped KMS envelope encryption and authorization.

## Release gates

1. Implement and test the browser vault adapter and unlock/lock lifecycle.
2. Integrate sensitive browser stores without any plaintext fallback.
3. Add manual export/backup, import verification, resumability, and explicit source-deletion confirmation.
4. Test wrong passphrases, tampering, concurrent writes, interrupted migration, account switching, lock behavior, and XSS-related assumptions.
5. Update the data-at-rest inventory and pass CI before enabling browser sensitive-data persistence.
