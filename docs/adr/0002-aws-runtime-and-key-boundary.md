# ADR 0002: AWS production runtime with direct AWS KMS envelope encryption

- **Status:** Proposed
- **Date:** 2026-11-16

## Context

CareerOps has a cloud API, PostgreSQL repositories, OIDC verification, tenant isolation, audit records, and an Electron client. It needs a production hosting path. The product requires application-level encryption for sensitive tenant data using AWS KMS.

## Decision

Use AWS as the hosting and managed infrastructure platform:

- ECS Fargate runs the stateless CareerOps API in private subnets.
- Application Load Balancer terminates HTTPS using an ACM certificate.
- RDS for PostgreSQL is private, encrypted at rest, backed up, and protected from accidental deletion.
- ECR stores immutable-by-release container images with image scanning.
- CloudWatch Logs stores bounded-retention application logs.
- Secrets Manager injects application configuration into the ECS task at startup. The application receives values, not permission to retrieve secrets itself.
- OIDC remains an explicit external identity-provider contract. Configure issuer, audience, and JWKS URL for the selected provider.
- The task role receives only KMS GenerateDataKey and Decrypt on the configured key ARN, conditioned on the CareerOps application encryption context. The task execution role can pull its image, publish logs, and retrieve only the named application secret.
- The cloud-core package provides a SigV4-signed AWS KMS provider. It calls GenerateDataKey for fresh AES-256 data keys and Decrypt to unwrap them. AES-256-GCM encrypts the actual field values. Encryption context binds application, tenant ID, and data purpose. ECS task-role credentials are used; no static production credentials are embedded.

AWS-managed storage services may also use AWS-managed encryption internally. This is separate from application-level KMS envelope encryption.

## Explicit non-goals for this deployment slice

S3 document storage, SQS job dispatch, EventBridge scheduling, SES delivery, and Cognito authentication are not wired merely by creating resources. They require application ports, authorization rules, lifecycle behavior, and integration tests before being enabled.

## Security invariants

- No broad kms:* permission for the application. The task role may call only GenerateDataKey and Decrypt on the configured key, conditioned on application encryption context.
- No AWS credentials baked into images or GitHub secrets as long-lived access keys; CI uses GitHub OIDC to assume a narrowly scoped deployment role.
- ECS tasks run as non-root, without public IPs, with read-only access to infrastructure secrets.
- Database access is limited to the application security group and a non-owner runtime database role.
- PostgreSQL RLS remains the tenant isolation boundary; infrastructure networking does not replace it.
- The ALB is the only public ingress. RDS and ECS tasks are private.
- Production Terraform state must be stored remotely with encryption, locking, and tightly restricted access.
- Backups, restore drills, image rollback, and keyring rotation are operational requirements.

## Rollout

1. Provision the network prerequisites and secret payload.
2. Apply the Terraform foundation and create the ECR repository.
3. Build and push the API image.
4. Apply the ECS service and verify ALB health checks.
5. Apply database migrations using a separate migration identity.
6. Run tenant-isolation tests against the provisioned PostgreSQL instance.
7. Test backup restoration and deployment rollback before production traffic.

## Consequences

This gives CareerOps a repeatable AWS deployment baseline with narrowly scoped direct AWS KMS access from the API runtime. It does not claim that every AWS product feature is integrated; new services must be connected through tested application adapters and least-privilege task policies.
