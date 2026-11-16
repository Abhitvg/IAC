# CareerOps AWS deployment foundation

## Selected deployment profile

The current deployment profile is pinned to AWS account `165328640460` and region `ap-southeast-2` (Sydney). This supersedes the earlier `ap-south-1` draft. The account ARN `arn:aws:account::165328640460:account` identifies the account; it is **not** a KMS key ARN. Supply the existing customer-managed KMS key ARN separately in the form `arn:aws:kms:ap-southeast-2:165328640460:key/KEY-ID`. The example tfvars deliberately contains a placeholder rather than inventing a key ID.

Initial capacity profile: two API tasks across at least two AZs, 0.5 vCPU / 1 GiB per task, autoscaling capped at four tasks, RDS PostgreSQL `db.t4g.medium` Multi-AZ with 50 GiB gp3 storage, seven-day automated backups, and 30-day application log retention. Deletion protection stays enabled. This is a starting profile, not a price quote; validate actual regional pricing and expected request/job volume before applying.

Availability objective: 99.9% monthly service availability (about 43.8 minutes of error budget in a 30-day month). This is a design objective, not a guarantee or an established SLO. It requires two healthy API tasks across AZs, Multi-AZ RDS, ALB health checks, deployment rollback, monitoring/alert routing, tested restore procedures, and resilient outbound connectivity. A single NAT gateway is a cost-saving single-AZ dependency; use one NAT gateway per AZ or appropriate VPC endpoints plus redundant egress if the 99.9% target is contractual.

## Implementation plan (no resources provisioned by this change)

1. **Account and region guardrails:** use account `165328640460` and `ap-southeast-2`; obtain the actual KMS key ARN, ACM certificate ARN, Secrets Manager ARN, VPC ID, and subnet IDs. The tfvars sample is prefilled with account/region but retains explicit placeholders for unknown infrastructure.
2. **Network readiness:** verify public ALB subnets and private ECS/database subnets span at least two AZs. Confirm private task egress to ECR, S3, CloudWatch Logs, Secrets Manager, KMS, and the configured external OIDC/JWKS issuer. Prefer interface/gateway VPC endpoints for AWS services; choose redundant NAT egress where required.
3. **Identity and encryption:** verify the existing KMS key policy allows same-account IAM delegation or explicitly grants the ECS task role. Keep key administration separate. Create the application JSON secret outside Terraform state and use a non-owner PostgreSQL runtime role; never put secret values in tfvars or Git.
4. **Terraform review:** initialize with an encrypted remote backend and state locking, run `terraform fmt -check`, `terraform validate`, and a reviewed `terraform plan`. Confirm the plan targets only the intended account/region and contains no unexpected replacement or deletion. Do not use `-target` as the normal deployment workflow.
5. **First controlled deployment (future operator action):** create ECR, publish a uniquely tagged ARM64 image, then apply the reviewed full plan. Run migrations under a separate migration identity, verify tenant isolation, readiness, TLS, KMS encrypt/decrypt, and rollback.
6. **Reliability instrumentation:** subscribe the provisioned SNS operations-alert topic to an on-call email or incident platform and confirm the subscription. Terraform now defines ALB 5xx/unhealthy-target alarms, ECS running-task alarms, and RDS CPU/free-storage alarms; add RDS connection and synthetic endpoint checks as a follow-up. Test alarm delivery rather than treating log retention as monitoring.
7. **Durable background work (next application milestone):** implement tenant-scoped job/outbox ports, idempotency keys, retry policy, visibility-timeout handling and dead-letter replay in the API/worker first; then add SQS standard queues plus DLQ and least-privilege worker policies. Add EventBridge/Step Functions only for proven scheduled or long-running workflows.
8. **Recovery and cost review:** perform an RDS point-in-time restore drill, verify backup retention and key access, test ECS rollback, set AWS Budgets and Cost Anomaly Detection, and review spend after the first month. Scale beyond four tasks or add Redis only when metrics justify it.

The changes in this PR update configuration and Terraform source only. They do not run Terraform, create AWS resources, modify the existing KMS key policy, deploy an image, or change production traffic.

This Terraform stack deploys the existing CareerOps API to ECS Fargate behind an HTTPS Application Load Balancer and provisions a private RDS PostgreSQL database, ECR repository, CloudWatch log group, and scoped ECS execution role.

## AWS KMS envelope encryption

CareerOps calls AWS KMS directly from the API runtime using SigV4-signed KMS JSON requests. The provider uses the ECS task-role credential endpoint in production; no long-lived AWS access keys are stored in the image or application secret. Local development may use temporary AWS environment credentials.

Sensitive LinkedIn OAuth tokens are encrypted with AES-256-GCM using a fresh data key from KMS `GenerateDataKey`. Only the encrypted data key is stored with the envelope. Reads call KMS `Decrypt` with the exact same encryption context. The context binds `application=careerops`, the authenticated `tenant_id`, and the `data_context` purpose. The API task role receives only `kms:GenerateDataKey` and `kms:Decrypt` on the configured key ARN, conditioned on the application context. It does not receive `kms:*`, key administration, key deletion, or key-policy permissions.

The configured KMS key must be in the selected account and `ap-southeast-2`. The configured KMS key must have a key policy that permits IAM delegation for the account (the account-root statement in the policy you supplied does this) or explicitly grants the CareerOps task role the two crypto actions. Keep key administrators separate from the application role. Enable automatic key rotation and retain access to old KMS keys until envelopes encrypted under them have been migrated.

The API uses the existing key ARN supplied as `kms_key_arn`; Terraform does not create, replace, or rewrite your existing key policy. Add a KMS interface VPC endpoint (`com.amazonaws.<region>.kms`) or NAT egress for private ECS tasks.

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
