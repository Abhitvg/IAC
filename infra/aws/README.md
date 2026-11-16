# CareerOps AWS deployment foundation

This Terraform stack deploys the existing CareerOps API to ECS Fargate behind an HTTPS Application Load Balancer and provisions a private RDS PostgreSQL database, ECR repository, CloudWatch log group, and scoped ECS execution role.

## Deliberate KMS boundary

CareerOps application code does not call AWS KMS. ECS receives configuration through task-definition secret injection. The ECS task role has no AWS permissions by default. RDS storage encryption is enabled using the AWS-managed default key; AWS may use KMS internally for managed encryption, outside the application process.

Do not attach customer-managed KMS permissions to the API task role. If the Secrets Manager secret uses a customer-managed key, the ECS execution role may need an additional decrypt permission; prefer the AWS-managed Secrets Manager key for this baseline.

## Prerequisites

- An existing VPC with at least two public subnets and two private application subnets across availability zones.
- Two isolated database subnets.
- An ACM certificate in the same region as the ALB.
- A Secrets Manager JSON secret containing:
  - `CAREEROPS_JWT_ISSUER`
  - `CAREEROPS_JWT_AUDIENCE`
  - `CAREEROPS_JWKS_URL`
  - `CAREEROPS_CONSENT_SIGNING_SECRET`
  - `CAREEROPS_RATE_LIMIT_HASH_SECRET`
  - `CAREEROPS_DATABASE_URL`
- The database URL must use the non-owner `careerops_app` role. Provision that role and apply migrations using a separate privileged migration identity. Do not give the API the master database credentials.
- Terraform 1.8+ and AWS provider credentials for provisioning only.

The RDS master password and application secret values must never be committed. Use a remote Terraform backend with encryption, locking, and restricted access. Do not use local state for production.

## Deploy

1. Copy `terraform/terraform.tfvars.example` to a private local `terraform.tfvars`.
2. Set the VPC/subnet IDs, ACM certificate ARN, region, database credentials, and application secret ARN.
3. Set `container_image` to a valid image in the ECR repository (first bootstrap the ECR repository, then push an image, then apply again).
4. Run:

```bash
cd infra/aws/terraform
terraform init
terraform validate
terraform plan
terraform apply
```

5. Verify the ALB `/health/ready` endpoint before routing production traffic.
6. Apply SQL migrations through a separate migration job/identity; the API task must not run migrations as a database owner.

## Container

Build from the repository root:

```bash
docker build -f Dockerfile.api -t careerops-api:local .
```

The image runs as the non-root Node user and starts `dist-api/apps/api/src/main.js`.

## GitHub Actions deployment

The manual deployment workflow uses GitHub OIDC. Configure repository variable `AWS_REGION`, secret `AWS_ROLE_TO_ASSUME`, and variables `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, and `ECS_TASK_FAMILY`. The assumed role must be restricted to this repository and branch/environment, and permit only ECR push plus updating the named ECS service/task family.

## Not included yet

The existing API has no production adapters for S3 object storage, SQS job dispatch, EventBridge schedules, or SES delivery. Do not enable those resources until the corresponding ports, tenant-scoped authorization, idempotency, retry/dead-letter behavior, and integration tests are implemented. This stack is the AWS compute/database/deployment foundation, not a claim that every future AWS capability is already wired.
