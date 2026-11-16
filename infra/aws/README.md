# CareerOps AWS deployment foundation

This Terraform stack deploys the existing CareerOps API to ECS Fargate behind an HTTPS Application Load Balancer and provisions a private RDS PostgreSQL database, ECR repository, CloudWatch log group, and scoped ECS execution role.

## AWS KMS envelope encryption

CareerOps calls AWS KMS directly from the API runtime using SigV4-signed KMS JSON requests. The provider uses the ECS task-role credential endpoint in production; no long-lived AWS access keys are stored in the image or application secret. Local development may use temporary AWS environment credentials.

Sensitive LinkedIn OAuth tokens are encrypted with AES-256-GCM using a fresh data key from KMS `GenerateDataKey`. Only the encrypted data key is stored with the envelope. Reads call KMS `Decrypt` with the exact same encryption context. The context binds `careerops:application=careerops`, the authenticated tenant ID, and the data purpose. The API task role receives only `kms:GenerateDataKey` and `kms:Decrypt` on the configured key ARN, conditioned on the application context. It does not receive `kms:*`, key administration, key deletion, or key-policy permissions.

The configured KMS key must have a key policy that permits IAM delegation for the account (the account-root statement in the policy you supplied does this) or explicitly grants the CareerOps task role the two crypto actions. Keep key administrators separate from the application role. Enable automatic key rotation and retain access to old KMS keys until envelopes encrypted under them have been migrated.

The API uses the existing key ARN supplied as `kms_key_arn`; Terraform does not replace or rewrite your existing key policy. Add a KMS interface VPC endpoint (`com.amazonaws.<region>.kms`) or NAT egress for private ECS tasks.

## Prerequisites

- An existing VPC with at least two public subnets and two private application subnets across availability zones.
- Private application subnets need outbound access through NAT or appropriate VPC endpoints for ECR (API and Docker), CloudWatch Logs, Secrets Manager, and the external OIDC/JWKS endpoint. Without this, Fargate tasks may fail to pull images, load secrets, publish logs, or validate tokens.
- Two isolated database subnets. The database subnets must not have a public route.
- An ACM certificate in the same region as the ALB.
- A Secrets Manager JSON secret containing:
  - `CAREEROPS_JWT_ISSUER`
  - `CAREEROPS_JWT_AUDIENCE`
  - `CAREEROPS_JWKS_URL`
  - `CAREEROPS_CONSENT_SIGNING_SECRET`
  - `CAREEROPS_RATE_LIMIT_HASH_SECRET`
  - `CAREEROPS_DATABASE_URL`
  - `LINKEDIN_CLIENT_ID` (empty string if LinkedIn OAuth is not enabled)
  - `LINKEDIN_CLIENT_SECRET` (empty string if LinkedIn OAuth is not enabled)
  - `LINKEDIN_REDIRECT_URI` (empty string if LinkedIn OAuth is not enabled; HTTPS when enabled)
- The database URL must use the non-owner `careerops_app` role. Provision that role and apply migrations using a separate privileged migration identity. Do not give the API the master database credentials.
- Terraform 1.8+ and AWS provider credentials for provisioning only.

The RDS master password and application secret values must never be committed. Use a remote Terraform backend with encryption, locking, and restricted access. Do not use local state for production.

## Deploy

1. Copy `terraform/terraform.tfvars.example` to a private local `terraform.tfvars`.
2. Set the VPC/subnet IDs, ACM certificate ARN, region, existing KMS key ARN, database credentials, and application secret ARN.
3. Bootstrap the ECR repository before creating the ECS service:

```bash
cd infra/aws/terraform
terraform init
terraform apply -target=aws_ecr_repository.api
```

4. Build and push an initial ARM64 image using a unique immutable tag, then set `container_image` to that exact image URI in your private tfvars file:

```bash
docker buildx build --platform linux/arm64 --push -f Dockerfile.api \\
  -t ACCOUNT.dkr.ecr.REGION.amazonaws.com/careerops-production:release-bootstrap .
```

5. Run the full plan and apply:

```bash
terraform validate
terraform plan
terraform apply
```

6. Verify the ALB `/health/ready` endpoint before routing production traffic.
7. Apply SQL migrations through a separate migration job/identity; the API task must not run migrations as a database owner.

## Container

Build from the repository root:

```bash
docker build -f Dockerfile.api -t careerops-api:local .
```

The image runs as the non-root Node user and starts `dist-api/apps/api/src/main.js`.

## GitHub Actions deployment

The manual deployment workflow uses GitHub OIDC. Configure repository variable `AWS_REGION`, secret `AWS_ROLE_TO_ASSUME`, and variables `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, and `ECS_TASK_FAMILY`. The assumed role must be restricted to this repository and branch/environment, and permit only ECR push plus updating the named ECS service/task family.

## OIDC deployment role

Create an IAM OIDC provider for `token.actions.githubusercontent.com` and a role whose trust policy restricts the subject to this repository and the protected deployment branch/environment. Do not use long-lived AWS access keys in GitHub.

The deployment role needs ECR push actions on this repository, `ecs:DescribeTaskDefinition`, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:DescribeServices`, and `iam:PassRole` for only the ECS execution and task roles created by this stack. Configure GitHub repository variables/secrets as described above.

The workflow builds a Linux ARM64 image, pushes an immutable `release-<commit-sha>` tag, registers a new task-definition revision with that exact image, updates the service, and waits for ECS stability. The ECS deployment circuit breaker is configured to roll back failed deployments.

## Not included yet

The existing API has no production adapters for S3 object storage, SQS job dispatch, EventBridge schedules, or SES delivery. Do not enable those resources until the corresponding ports, tenant-scoped authorization, idempotency, retry/dead-letter behavior, and integration tests are implemented. This stack is the AWS compute/database/deployment foundation, not a claim that every future AWS capability is already wired.
