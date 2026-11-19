# ADR 0002: AWS runtime and application key management

- **Status:** Accepted target architecture — AWS KMS envelope encryption; implementation and migration pending
- **Date:** 2026-11-19

## Context

CareerOps needs production-grade encryption for sensitive tenant records, including Career Graph facts and LinkedIn OAuth tokens. The project permits direct AWS KMS calls from trusted backend services and maintenance workers. KMS credentials and plaintext data keys must never be exposed to Electron, renderer, browser, or client storage.

## AWS runtime baseline

- ECS Fargate runs the stateless API in private application subnets.
- The ALB is the only public ingress and terminates HTTPS with a matching ACM certificate.
- RDS PostgreSQL is private, encrypted at rest, backed up, and protected from accidental deletion.
- Secrets Manager injects application configuration through the ECS execution role.
- The ECS task role uses short-lived task credentials through the AWS SDK default credential provider chain. No long-lived AWS credentials are embedded in images, source, or task environment variables.
- PostgreSQL forced RLS remains the tenant-isolation boundary.

## Application envelope-encryption decision

**Target:** use AWS KMS `GenerateDataKey` and `Decrypt` from trusted CareerOps backend processes, with a dedicated symmetric customer-managed KMS key for application data encryption. Do not reuse the Secrets Manager configuration-secret key for application payload encryption; separate keys provide independent policy, rotation, audit, and blast-radius boundaries.

For every encrypted record:

1. The API calls KMS `GenerateDataKey` with `KeySpec=AES_256` and a canonical encryption context containing `application=careerops`, the authenticated `tenant_id`, a stable `data_context` (for example `career-graph:profile.current_role` or `linkedin-token:<subject>`), and an envelope schema version.
2. The API encrypts the payload locally with AES-256-GCM using the returned 32-byte plaintext data key. The plaintext key is zeroized in a `finally` block immediately after use.
3. PostgreSQL stores only the KMS-encrypted data key (ciphertext blob), AES-GCM IV/tag/ciphertext, algorithm, key-version label, tenant ID, and data context.
4. Reads verify tenant/context binding before KMS access, call KMS `Decrypt` with the exact same encryption context and an explicit configured key ARN, then decrypt locally. The plaintext data key is zeroized regardless of success or failure.

Use a stable, bounded key-version label mapped to a configured KMS key ARN; do not put a full ARN in the current 64-character `keyVersion` field. Retain mappings for old key versions until all envelopes have been migrated and independently verified. KMS automatic key-material rotation on the same KMS key does not require rewriting every envelope; KMS retains historical key material for decryption. Moving to a different KMS key is an explicit envelope rewrap migration.

## IAM and key policy

- The ECS **task role** receives only `kms:GenerateDataKey` and `kms:Decrypt` on the dedicated application data key(s).
- Restrict calls with encryption-context conditions: require `application=careerops`, require the expected context keys, and reject missing required context fields. Tenant IDs and data contexts are validated by the application and included in every KMS request.
- Do not grant `kms:*`, `kms:CreateKey`, `kms:PutKeyPolicy`, `kms:ScheduleKeyDeletion`, or key-administration rights to the task role.
- Key administration and deletion are separate operator roles with MFA/change control. Enable automatic rotation, a 30-day deletion window, CloudTrail management/data-event visibility where supported, and alerts for policy changes, disablement, deletion scheduling, and unusual decrypt volume.
- The ECS **execution role** retains its separate, narrowly scoped `kms:Decrypt` permission through Secrets Manager for the application configuration secret only. It does not receive application data-key permissions.
- The API uses the ECS task role via the AWS SDK credential provider chain. Never inject static AWS access keys.

## Compatibility and migration

The current branch contains both `MasterKeyTenantKeyProvider` and a new SDK-independent `KmsTenantKeyProvider`/`DualReadTenantKeyProvider` core. The KMS provider accepts a narrow adapter interface, and `AwsSdkKmsDataKeyOperations` now translates the provider contract into AWS SDK v3 `GenerateDataKeyCommand` and `DecryptCommand` calls through an injected `KMSClient`-compatible client. The package dependency/lockfile, concrete client construction, runtime wiring, and migration worker are not yet implemented. The API still instantiates the legacy provider and now fails startup if KMS environment variables are supplied, rather than silently falling back to local encryption. Terraform stages the dedicated KMS key and task-role policy but intentionally does not inject KMS settings into the task until runtime wiring is complete. Do not remove it or its key material until a dual-read migration is implemented and completed.

Required migration sequence:

1. Add `@aws-sdk/client-kms` and regenerate the lockfile using a working npm registry; construct `KMSClient` with the ECS task-role credential chain, bounded connection/request timeouts, and standard retry mode. Inject its command constructors and client into `AwsSdkKmsDataKeyOperations`, then wire `DualReadTenantKeyProvider` into trusted API startup only after tests pass. The SDK command adapter and provider core exist; dependency installation, concrete client construction, and runtime wiring remain pending.
2. Preserve all current envelope fields and existing local key-version labels. Add explicit provider/key-version metadata only through a backward-compatible schema evolution.
3. Migrate **all encrypted stores**, not just Career Graph facts: Career Graph fact revisions, LinkedIn token envelopes, and any future encrypted payload tables. Add append-only revisions and resumable tenant-scoped jobs where mutable records currently exist.
4. Verify each migrated envelope by decrypting it through the production read path, checking tenant/context binding, and recording counts and audit evidence. Test interruption, retry, old-key unavailability, KMS throttling, and rollback.
5. Keep legacy keys and KMS old-key mappings until a complete inventory, zero remaining legacy-envelope count, independent decrypt sampling/full verification, and backup-restore drill are all satisfied.
6. Remove legacy key material only in a separately reviewed change after the above gates pass.

## Reliability and performance

Use the AWS SDK v3 KMS client with bounded timeouts, standard retry mode with jitter, and explicit handling for throttling, access denied, disabled/pending-deletion keys, and regional service failures. Do not cache plaintext data keys by default. Monitor KMS request count, throttles, latency, errors, and per-tenant rotation progress. Confirm account/region KMS quotas and expected request volume before production rollout. A KMS outage must fail closed for new writes and reads; never silently fall back to local encryption for a KMS-version envelope.

## Security invariants

- No plaintext data key, KMS credentials, or decrypted payload in logs, traces, metrics, browser storage, or client responses.
- All AES-GCM envelopes authenticate tenant, data context, and key-version metadata.
- KMS encryption context is deterministic and validated before both GenerateDataKey and Decrypt.
- Database RLS and authenticated tenant membership are enforced before encrypted records are accessed.
- KMS IAM is least-privilege and separated from key administration.
- Backups, restore drills, key disablement recovery, rotation, and migration rollback are operational requirements.

## Consequences

The local master-key implementation remains the current API code path until the AWS SDK v3 dependency/lockfile, concrete client construction, dual-read startup wiring, tests, and encrypted-store migration are complete. Supplying KMS settings before that point is a hard startup error. The SDK-independent KMS provider core and focused unit tests have been added, but they have not yet been executed in CI. This ADR defines the target, not a claim that KMS encryption is already wired or deployed. No AWS resources are provisioned and no Terraform apply or deployment is performed by this decision.
