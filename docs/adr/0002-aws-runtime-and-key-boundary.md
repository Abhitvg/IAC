# ADR 0002: AWS runtime and application key management

- **Status:** Proposed — application key-management provider decision remains open
- **Date:** 2026-11-19

## Context

CareerOps needs a production hosting path for its cloud API, PostgreSQL repositories, OIDC verification, tenant isolation, audit records, and Electron client. Application-level encryption is required for sensitive tenant records. Direct AWS KMS integration from trusted CareerOps backend code is an allowed architecture option; it is not prohibited by a product constraint. KMS credentials and key operations must never be shipped to the Electron renderer or browser.

## AWS runtime baseline

Use AWS as the hosting and managed infrastructure platform:

- ECS Fargate runs the stateless CareerOps API in private application subnets.
- Application Load Balancer terminates HTTPS using a region-local ACM certificate whose SANs cover the API hostname.
- RDS for PostgreSQL is private, encrypted at rest, backed up, and protected from accidental deletion.
- ECR stores release images with image scanning.
- CloudWatch Logs stores bounded-retention application logs.
- Secrets Manager injects application configuration into the ECS task at startup.
- OIDC remains an explicit external identity-provider contract. Configure issuer, audience, and JWKS URL for the selected provider.
- ECS tasks use task-role credentials where backend AWS API access is selected; no long-lived AWS credentials are embedded in images or source.

## Application key-management decision

The current branch implementation uses `TenantEnvelopeCipher` with `MasterKeyTenantKeyProvider` for LinkedIn token envelopes. It creates per-record random AES-256 data keys and wraps them locally using a versioned 256-bit master-key ring injected through the Secrets Manager configuration secret. The master key ring is not a KMS GenerateDataKey implementation. Secrets Manager uses the configured KMS key to protect the configuration secret at rest; this does not make the application envelope provider KMS-backed.

Direct AWS KMS envelope encryption remains an allowed alternative and should be evaluated before declaring the application key architecture final:

- **KMS-backed provider:** call KMS GenerateDataKey and Decrypt from the trusted API backend using the ECS task role. Restrict permissions to the exact key and encryption context. Do not expose credentials or KMS calls to renderer/browser code.
- **Locally wrapped provider:** retain the current versioned master-key ring and local AES-256-GCM wrapping. Keep the key ring only in the secret manager, tightly control rotation and recovery, and document the additional operational responsibility of managing application master keys.

Before selecting or migrating providers, inventory existing envelopes and persisted data. Envelopes from one provider are not automatically decryptable by the other. Any migration must be explicit, resumable, tenant-scoped, verified, and reversible until completion.

## Security invariants

- No AWS credentials, KMS key material, or broad AWS permissions in Electron, renderer code, browser storage, or a shipped desktop binary.
- The ECS task role receives only the AWS permissions required by the selected backend integrations. If KMS-backed application encryption is selected, scope GenerateDataKey/Decrypt to the configured key and authenticated encryption context.
- The ECS execution role retrieves only the named application secret and receives only the KMS permissions required for Secrets Manager secret decryption.
- Never commit master keys, place plaintext key material in Terraform variables/state, expose it as Vite/browser variables, or log it.
- CI deployment uses GitHub OIDC and a narrowly scoped role rather than long-lived access keys.
- ECS tasks run as non-root and without public IPs.
- Database access is limited to the application security group and a non-owner runtime database role.
- PostgreSQL RLS remains the tenant-isolation boundary; infrastructure networking does not replace it.
- The ALB is the only public ingress. RDS and ECS tasks are private.
- Production Terraform state uses remote storage with encryption, locking, and tightly restricted access.
- Backups, restore drills, image rollback, key rotation, and data-key rewrapping are operational requirements.

## Explicit non-goals for this deployment slice

S3 document storage, SQS job dispatch, EventBridge scheduling, SES delivery, and full CareerOps product workflows are not wired merely by creating infrastructure. They require application ports, authorization rules, lifecycle behavior, and integration tests before being enabled. LinkedIn OAuth remains disabled until its HTTPS callback and OAuth credentials are configured.

## Rollout prerequisites

1. Verify the existing VPC, public/application/database subnets, route-table associations, and S3 endpoint. Supply two dedicated isolated database subnets; do not reuse NAT-routed application subnets.
2. Create and populate the Secrets Manager JSON configuration secret with database, OIDC, signing, rate-limit, and (when enabled) LinkedIn OAuth values. Keep any application master-key ring only in Secrets Manager if the local provider remains selected.
3. Verify the ACM certificate's SAN coverage for the chosen API hostname.
4. Configure separate encrypted/locked staging and production Terraform backends. Review plans and apply only after the relevant change is explicitly approved.
5. Build and push the API image to the expected ECR release tag.
6. Deploy the ECS service and verify ALB health checks.
7. Apply database migrations using a separate migration identity.
8. Run tenant-isolation, restore, key-rotation, and rollback checks before production traffic.

## Consequences

The AWS runtime baseline is defined, but the application key-management provider is not final. The current local master-key provider must not be described as KMS-backed. Career Graph API writes now accept bounded JSON fact values and encrypt them inside the trusted API before persistence. Reads and review responses decrypt only after tenant authorization, and public API responses omit envelope metadata. The runtime shares the versioned local master-key provider between LinkedIn token storage and Career Graph encryption, even when LinkedIn OAuth is disabled. Reads and writes fail closed when no key provider is configured. Typed client methods are available; application UI/store integration and provider rotation/recovery remain to be completed.
