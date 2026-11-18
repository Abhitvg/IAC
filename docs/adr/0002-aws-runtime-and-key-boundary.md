# ADR 0002: AWS runtime and application key boundary

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

CareerOps needs a production hosting path for its cloud API, PostgreSQL repositories, OIDC verification, tenant isolation, audit records, and Electron client. The application security boundary explicitly excludes direct AWS KMS API calls and SigV4 KMS request implementations from CareerOps application code.

## Decision

Use AWS as the hosting and managed infrastructure platform:

- ECS Fargate runs the stateless CareerOps API in private application subnets.
- Application Load Balancer terminates HTTPS using a region-local ACM certificate whose SANs must cover the API hostname.
- RDS for PostgreSQL is private, encrypted at rest, backed up, and protected from accidental deletion.
- ECR stores immutable release images with image scanning.
- CloudWatch Logs stores bounded-retention application logs.
- Secrets Manager injects application configuration into the ECS task at startup. The application receives secret values; it does not retrieve secrets through an AWS SDK.
- OIDC remains an explicit external identity-provider contract. Configure issuer, audience, and JWKS URL for the selected provider.
- Sensitive LinkedIn token envelopes use per-record random AES-256 data keys. A versioned 256-bit master-key ring, encoded as canonical base64 values in the Secrets Manager JSON secret, wraps those data keys locally using AES-256-GCM. Tenant ID, data context, and key version are authenticated as associated data.
- The ECS task execution role may read only the named application secret. It receives `kms:Decrypt` only as required for Secrets Manager to decrypt that secret, constrained by `kms:ViaService` and the exact `SecretARN` encryption context. The API task role receives no KMS permissions.
- CareerOps application code must not call KMS APIs, construct SigV4 KMS requests, or receive AWS credentials for KMS. The existing customer-managed KMS key protects the Secrets Manager configuration secret at rest; this is distinct from application-level envelope encryption.
- Retain every master-key version needed to decrypt existing envelopes. New envelopes use the configured current version. Rotation requires keeping old versions until all dependent envelopes have been rewrapped or retired.

## Explicit non-goals for this deployment slice

S3 document storage, SQS job dispatch, EventBridge scheduling, SES delivery, and full CareerOps product workflows are not wired merely by creating infrastructure. They require application ports, authorization rules, lifecycle behavior, and integration tests before being enabled. LinkedIn OAuth remains disabled until its HTTPS callback, OAuth credentials, and master-key secret are configured.

## Security invariants

- No direct AWS KMS API calls or SigV4 KMS implementation in CareerOps application code.
- No KMS permissions on the ECS API task role. The execution role's decrypt permission is limited to Secrets Manager and the exact configuration secret.
- Never commit master keys, place them in Terraform variables/state, expose them as Vite/browser variables, or log them.
- No AWS credentials baked into images or GitHub secrets as long-lived access keys; CI deployment uses GitHub OIDC and a narrowly scoped role.
- ECS tasks run as non-root, without public IPs, and retrieve only the named application secret.
- Database access is limited to the application security group and a non-owner runtime database role.
- PostgreSQL RLS remains the tenant isolation boundary; infrastructure networking does not replace it.
- The ALB is the only public ingress. RDS and ECS tasks are private.
- Production Terraform state must be stored remotely with encryption, locking, and tightly restricted access.
- Before deployment, confirm that no persisted records require the earlier direct-KMS envelope provider. If such records exist, a separate controlled migration is required; do not assume the local master-key provider can decrypt them.
- Backups, restore drills, image rollback, master-key rotation, and data-key rewrapping are operational requirements.

## Rollout prerequisites

1. Verify the existing VPC, public/application/database subnets, route-table associations, and S3 endpoint. Supply two dedicated isolated database subnets; do not reuse the NAT-routed application subnets.
2. Create and populate the Secrets Manager JSON configuration secret with database, OIDC, signing, rate-limit, and (when enabled) LinkedIn OAuth values. Generate the master-key ring outside Terraform and keep it only in Secrets Manager.
3. Verify the existing ACM certificate's SAN coverage for the chosen API hostname. A certificate ARN alone does not prove hostname coverage or successful DNS validation.
4. Configure separate encrypted/locked staging and production Terraform backends. Review a plan; do not apply without explicit infrastructure-change approval.
5. Build and push the API image to the expected immutable ECR tag.
6. Apply the ECS service and verify ALB health checks only after the infrastructure change is approved.
7. Apply database migrations using a separate migration identity.
8. Run tenant-isolation tests, restore tests, key-rotation tests, and deployment rollback checks before production traffic.

## Consequences

This provides a repeatable AWS deployment baseline while keeping direct KMS access out of CareerOps application code. It does not claim that every AWS product feature or every local persistence path is encrypted or integrated. Each new data store and product adapter requires its own tenant authorization, encryption, migration, and recovery review.
