# CareerOps AWS deployment foundation

## Selected deployment profile

The current deployment profile is pinned to AWS account `165328640460` and region `ap-southeast-2` (Sydney). This supersedes the earlier `ap-south-1` draft. The existing customer-managed KMS key is confirmed as `arn:aws:kms:ap-southeast-2:165328640460:key/9dffb4cb-6a4a-40e7-b49e-40415ddb9bf7`. The account ARN `arn:aws:account::165328640460:account` identifies the account; it is not a KMS key ARN.

Initial capacity profile: two API tasks across at least two AZs, 0.5 vCPU / 1 GiB per task, autoscaling capped at four tasks, RDS PostgreSQL 16 on `db.t4g.medium` Multi-AZ with 50 GiB gp3 storage, seven-day automated backups, and 30-day application log retention. The database major version is pinned to 16 to match the `postgres16` parameter-group family and the PostgreSQL 16 CI service; minor upgrades remain managed by RDS. Deletion protection stays enabled. This is a starting profile, not a price quote; validate actual regional pricing and expected request/job volume before applying.

Availability objective: 99.9% monthly service availability (about 43.8 minutes of error budget in a 30-day month). This is a design objective, not a guarantee or an established SLO. It requires two healthy API tasks across AZs, Multi-AZ RDS, ALB health checks, deployment rollback, monitoring/alert routing, tested restore procedures, and resilient outbound connectivity. A single NAT gateway is a cost-saving single-AZ dependency; use one NAT gateway per AZ or appropriate VPC endpoints plus redundant egress if the 99.9% target is contractual.

## Amplify frontend and API CORS

The browser frontend is a Vite/React static application; Electron is a separate desktop client. The repository root `amplify.yml` builds only the browser bundle with `vite.config.web.ts` and publishes `dist/`. It deliberately does not run the Electron or API TypeScript builds as part of the Amplify frontend deployment.

The staging Amplify origin is configured as `https://main.d37etc5h2drv5h.amplifyapp.com` in the example Terraform variables. Terraform passes `api_allowed_origins` to the ECS API as `CAREEROPS_CORS_ALLOWED_ORIGINS`. The API accepts only exact HTTPS origins and handles preflight requests for the supported bearer-token headers/methods; it does not enable cookie credentials or wildcard origins. For another Amplify branch or a production custom domain, set a separate exact origin in that environment's private tfvars.

The sample `allowed_ingress_cidrs` value is a single developer `/32` and is appropriate only for a restricted staging smoke test. For a public multi-tenant production API, the ALB security group must admit the intended user networks; browser requests to the API originate from each user's network, not from Amplify's hosting servers. A `/32` will block everyone outside that address. Choose production ingress deliberately and put an appropriate WAF/rate-limiting layer in front of public endpoints where needed.

Amplify must be configured with the API base URL as a non-secret `VITE_*` build variable only after the API has a reachable HTTPS endpoint. Do not put JWT signing secrets, database credentials, OAuth client secrets, or other credentials in Amplify build variables. Add the Amplify SPA fallback rewrite in the Amplify app's Rewrites and redirects settings: source `/<*>`, target `/index.html`, status `200`. The managed `amplifyapp.com` hostname uses Amplify-managed HTTPS; the ALB ACM certificate is a separate certificate boundary.

## HTTP-only staging when you do not own a domain

The checked-in staging example currently enables HTTPS and references the ACM certificate ARN supplied for this account and region. The certificate status was reported as Issued, but its SAN/domain coverage must still be verified against the intended hostname before applying. The ALB certificate is separate from Amplify-managed HTTPS.

When no domain-matched ACM certificate is available, staging may be switched to a **temporary HTTP-only smoke-test mode** by setting `enable_https = false`. A public ACM certificate cannot be issued for the AWS-generated ALB DNS hostname, so this mode uses the ALB-generated DNS name and must remain strictly non-sensitive. Do not use HTTP-only mode for production.

This mode is strictly for non-sensitive testing. Because the Amplify frontend is served over HTTPS, browsers will block direct calls from that page to an HTTP ALB API as mixed content; HTTP-only staging therefore supports direct smoke tests (for example, with curl), not full browser-to-API integration. Full web integration requires an HTTPS API hostname with a matching certificate or a separately designed HTTPS proxy/front door.

- Do not send production traffic, passwords, session cookies, OAuth authorization codes, access tokens, or other sensitive data over this endpoint.
- Keep LinkedIn OAuth disabled: leave `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_REDIRECT_URI` empty. OAuth redirect flows must wait until a real HTTPS hostname and certificate are configured.
- Set `allowed_ingress_cidrs` to your current public IP with `/32`. The example intentionally contains a placeholder and Terraform validation will reject it until you replace it. Use `0.0.0.0/0` only if you deliberately accept an internet-accessible HTTP test endpoint.
- The ECS-to-RDS connection remains private and TLS-enforced; locally wrapped envelope encryption remains enabled, with its master-key ring delivered through Secrets Manager. These controls do not make client-to-ALB HTTP traffic confidential.

Production is guarded in Terraform: `environment = "production"` cannot be planned with `enable_https = false`; HTTPS requires a valid ACM certificate ARN in this account and region. Do not work around this guardrail.

To switch staging to HTTPS later, set `enable_https = true` and supply an ACM certificate ARN for a domain you control. To deploy production, use a distinct production tfvars/state and a verified domain/certificate. Do not reuse the staging state or credentials.

## Implementation plan (no resources provisioned by this change)

1. **Account and region guardrails:** use account `165328640460` and `ap-southeast-2`; the existing customer-managed KMS key is used by Secrets Manager to encrypt the application config secret. Confirm the ACM certificate SAN covers the chosen ALB hostname before using the current HTTPS staging example. Obtain the Secrets Manager ARN, VPC ID, and subnet IDs. The tfvars sample is prefilled with account/region but retains explicit placeholders for unknown infrastructure.
2. **Network readiness:** verify public ALB subnets and private ECS/database subnets span at least two AZs. Confirm private task egress to ECR, S3, CloudWatch Logs, Secrets Manager, and the configured external OIDC/JWKS issuer. The ECS execution role retrieves the encrypted secret through Secrets Manager; the application process has no direct KMS network dependency. Prefer interface/gateway VPC endpoints for AWS services; choose redundant NAT egress where required.
3. **Identity and encryption:** verify the existing KMS key policy allows the ECS execution role to decrypt the application config secret through Secrets Manager only. The application task role must not receive KMS permissions. Keep key administration separate. Let RDS manage the master password in its AWS-managed Secrets Manager secret; use a separate non-owner PostgreSQL runtime role for the API. Never put database passwords or envelope master keys in tfvars or Git.
4. **Terraform review:** initialize with an encrypted remote backend and state locking, run `terraform fmt -check`, `terraform validate`, and a reviewed `terraform plan`. Confirm the plan targets only the intended account/region and contains no unexpected replacement or deletion. Do not use `-target` as the normal deployment workflow.
5. **First controlled deployment (future operator action):** create ECR, publish a uniquely tagged ARM64 image, then apply the reviewed full plan. Run migrations under a separate migration identity, verify tenant isolation, readiness, TLS, Secrets Manager secret retrieval, local envelope encrypt/decrypt, and rollback.
6. **Reliability instrumentation:** subscribe the provisioned SNS operations-alert topic to an on-call email or incident platform and confirm the subscription. Terraform now defines separate ALB-generated and API-target 5xx alarms, unhealthy-target alarms, ECS running-task alarms, and RDS CPU/free-storage alarms; add RDS connection and synthetic endpoint checks as a follow-up. Test alarm delivery rather than treating log retention as monitoring.
7. **Durable background work (next application milestone):** implement tenant-scoped job/outbox ports, idempotency keys, retry policy, visibility-timeout handling and dead-letter replay in the API/worker first; then add SQS standard queues plus DLQ and least-privilege worker policies. Add EventBridge/Step Functions only for proven scheduled or long-running workflows.
8. **Recovery and cost review:** perform an RDS point-in-time restore drill, verify backup retention and key access, test ECS rollback, set AWS Budgets and Cost Anomaly Detection, and review spend after the first month. Scale beyond four tasks or add Redis only when metrics justify it.

The changes in this PR update configuration and Terraform source only. They do not run Terraform, create AWS resources, modify the existing KMS key policy, deploy an image, or change production traffic.

This Terraform stack deploys the CareerOps API to ECS Fargate behind an Application Load Balancer (HTTPS by default; optional HTTP-only staging smoke tests) and provisions a private RDS PostgreSQL database, ECR repository, CloudWatch log group, and scoped ECS execution/task roles.

## Secrets Manager-protected envelope keys (no direct KMS API calls)

CareerOps application code does **not** call AWS KMS. The API generates a fresh random 256-bit data key for each encrypted token payload and wraps that data key locally with AES-256-GCM using a versioned 256-bit master-key ring injected through ECS from the existing Secrets Manager configuration secret. The wrapped data key, nonce, authentication tag, ciphertext, tenant ID, purpose context, and key version are stored in the envelope. The AAD binds the application, authenticated tenant, data purpose, and master-key version.

The Secrets Manager JSON secret must contain:

- `CAREEROPS_ENVELOPE_MASTER_KEYS`: a **string containing JSON**, with one to eight version-to-base64-key entries.
- `CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION`: the version used for new envelopes, for example `v1`.

For clarity, the Secrets Manager secret stores the key ring as an escaped JSON string (not as a nested object):

```json
{
  "CAREEROPS_ENVELOPE_MASTER_KEYS": "{\"v1\":\"<base64-encoded-32-byte-key>\"}",
  "CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION": "v1"
}
```

Generate each 32-byte master key outside the repository with `openssl rand -base64 32`. Store the value only in Secrets Manager. Never put it in Git, Terraform variables/state, Amplify build variables, logs, or client-side code. The API validates that every key decodes to exactly 32 bytes and that the configured current version exists.

Terraform reads the existing secret metadata with `secretsmanager:DescribeSecret` during planning and rejects a plan if its `kms_key_id` does not match `kms_key_arn`. This is a control-plane metadata check; it does not retrieve or expose the secret value. The existing customer-managed KMS key `arn:aws:kms:ap-southeast-2:165328640460:key/9dffb4cb-6a4a-40e7-b49e-40415ddb9bf7` is used by Secrets Manager to encrypt the configuration secret at rest. The ECS **execution role**, not the API task role, receives `kms:Decrypt` only for this secret, constrained by `kms:ViaService = secretsmanager.ap-southeast-2.amazonaws.com` and `kms:EncryptionContext:SecretARN = <app_secrets_arn>`. The task role receives no KMS permissions. The application process receives the decrypted key ring from ECS secret injection and performs only local cryptographic operations.

For rotation, add a new versioned 32-byte key to the secret, set it as the current version, and retain all old versions until every envelope that references them has been re-encrypted or retired. Removing an old key too early makes its existing envelopes unreadable. Maintain backups of the secret and verify restore/decrypt procedures before rotation. This design deliberately avoids direct KMS SDK or SigV4 calls from CareerOps code.

**Envelope format compatibility:** this local key-ring provider writes version labels such as `v1` and cannot decrypt envelopes written by the earlier direct-KMS provider, whose key version is a KMS key ARN and whose wrapped key is a KMS ciphertext blob. Before deploying this provider to any environment, confirm that no persisted records use the earlier format. If such records exist, stop and plan a separate, controlled migration before switching providers; do not delete the old wrapping keys or assume the new provider can read those envelopes. This PR has not deployed the earlier direct-KMS implementation or run any data migration.

## Prerequisites

- An existing VPC with exactly two public ALB subnets and exactly two private application subnets across two Availability Zones. The module validates the subnet VPC IDs and AZ spread at plan time.
- Private application subnets need outbound access through NAT or appropriate VPC endpoints for ECR (API and Docker), CloudWatch Logs, Secrets Manager, and the external OIDC/JWKS endpoint. The application process does not need a KMS VPC endpoint. Without required egress/endpoints, Fargate tasks may fail to pull images, load secrets, publish logs, or validate tokens.
- Two isolated database subnets. The database subnets must not have a public route.
- An ACM certificate in the same region as the ALB when `enable_https = true`. It is mandatory for production. The current staging example also enables HTTPS and references the supplied certificate; verify its SAN/domain coverage before applying. Only temporary non-sensitive HTTP staging smoke tests may omit it.
- A Secrets Manager JSON secret containing:
  - `CAREEROPS_JWT_ISSUER`
  - `CAREEROPS_JWT_AUDIENCE`
  - `CAREEROPS_JWKS_URL`
  - `CAREEROPS_CONSENT_SIGNING_SECRET`
  - `CAREEROPS_RATE_LIMIT_HASH_SECRET`
  - `CAREEROPS_ENVELOPE_MASTER_KEYS` (JSON key ring of 32-byte base64 keys; required by the ECS task definition)
  - `CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION` (must match a key-ring entry; required by the ECS task definition)
  - `CAREEROPS_DATABASE_URL`
  - `LINKEDIN_CLIENT_ID` (empty string if LinkedIn OAuth is not enabled)
  - `LINKEDIN_CLIENT_SECRET` (empty string if LinkedIn OAuth is not enabled)
  - `LINKEDIN_REDIRECT_URI` (empty string if LinkedIn OAuth is not enabled; HTTPS when enabled)
- The `careerops_app` and `careerops_provisioner` roles created by the migrations are non-login permission bundles. The API database URL must use a separate `careerops_runtime` login that inherits `careerops_app`; tenant bootstrap uses a separate `careerops_tenant_provisioner` login granted membership in `careerops_provisioner`. The API must never use the RDS master or migration credentials.
- Terraform 1.9+ and AWS provider credentials for provisioning only. The planning identity also needs `secretsmanager:DescribeSecret` on the application config secret so Terraform can verify that its KMS key matches `kms_key_arn`, plus `ec2:DescribeSubnets` and `ec2:DescribeRouteTables` for read-only VPC/AZ checks, public-subnet Internet Gateway route checks, private-subnet route-table association checks, and database-route isolation checks. The ECS execution role separately receives only the runtime secret-read/decrypt permissions.

The RDS master password and application secret values must never be committed. Use a remote Terraform backend with encryption, locking, and restricted access. Do not use local state for production.

## PostgreSQL role setup and migration sequence

The migrations create `careerops_app` and `careerops_provisioner` as **NOLOGIN** permission-bundle roles. They are not connection usernames. After the RDS instance exists:

1. Run `npm run migrate:cloud` once using a securely handled, privileged migration connection derived from the RDS-managed master secret. Set `NODE_ENV=production` and `CAREEROPS_MIGRATION_DATABASE_URL` only in the one-off migration process. Do not put the master/migration URL in the API's application config secret or ECS task definition.
2. Connect to PostgreSQL as the RDS master/admin user and create separate login roles:

```sql
CREATE ROLE careerops_runtime LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT careerops_app TO careerops_runtime;

CREATE ROLE careerops_tenant_provisioner LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT careerops_provisioner TO careerops_tenant_provisioner;
```

3. In interactive `psql`, set each login password with `\password careerops_runtime` and `\password careerops_tenant_provisioner`. This avoids placing plaintext passwords in SQL files, shell history, or command-line arguments. Store only the runtime connection URL in the Secrets Manager field `CAREEROPS_DATABASE_URL`; keep the tenant-provisioner credential separate and use it only for explicit tenant-bootstrap operations.
4. Provision the first tenant and owner membership with `scripts/provision-careerops-tenant.sh`, using `careerops_tenant_provisioner` as its `DATABASE_URL` and the owner's exact Cognito `sub` as `OWNER_SUBJECT`. The script sets the non-login `careerops_provisioner` role for the transaction and leaves the global kill switch enabled.
5. Start the API with the `careerops_runtime` connection. It inherits only the table privileges granted to `careerops_app`, remains subject to forced tenant RLS, and does not own the schema or bypass RLS.

The LinkedIn migrations `0006_linkedin_oauth.sql`, `0007_linkedin_runtime_grants.sql`, and `0008_linkedin_subject_isolation.sql` create the RLS-protected token/state tables, grant the minimum SELECT/INSERT/UPDATE/DELETE privileges used by the LinkedIn store, and bind row visibility to both the tenant ID and authenticated subject. Keep LinkedIn OAuth disabled until its HTTPS callback and credentials are separately configured.


## Remote Terraform state (required)

The Terraform root declares an S3 backend with partial configuration, so it will not silently initialize a local state file. Before running `terraform init`, identify an existing state bucket with versioning enabled, server-side encryption, public access blocked, and tightly scoped IAM access. Also identify an existing DynamoDB lock table with a string partition key named `LockID`. This PR does not create either backend resource.

Copy the appropriate example file and replace the placeholders with the real bucket and lock-table names:

```bash
cd infra/aws/terraform
cp backend-staging.hcl.example backend-staging.hcl
# Edit backend-staging.hcl with the existing bucket and lock-table names.
terraform init -backend-config=backend-staging.hcl
```

For production, use the separate state key:

```bash
cp backend-production.hcl.example backend-production.hcl
# Edit backend-production.hcl with the same secured bucket/lock table or the
# separately governed production backend that your operations policy requires.
terraform init -backend-config=backend-production.hcl
```

The examples use distinct keys: `careerops/staging/terraform.tfstate` and `careerops/production/terraform.tfstate`. Keep the filled `backend-*.hcl` files and `terraform.tfvars` private; they are git-ignored. The Terraform runner needs scoped S3 list/get/put permissions for the selected state object and DynamoDB describe/get/put/delete permissions for the lock table. Do not run `terraform init` without the selected backend config, and do not copy state between environments.

## Deploy

1. Copy `terraform/terraform.tfvars.example` to a private local `terraform.tfvars`. It is a staging configuration with HTTPS enabled and a supplied ACM certificate ARN; verify certificate domain coverage before use. Do not reuse the staging state or credentials for production.
2. Set the VPC/subnet IDs, region, existing Secrets Manager KMS key ARN, and application secret ARN. Confirm the secret contains the required envelope master-key ring when LinkedIn OAuth is enabled. RDS generates and manages its master password in Secrets Manager; do not add a database password to tfvars. Replace the `allowed_ingress_cidrs` placeholder with your public IP `/32`; the example will not validate until you do.
3. **One-time bootstrap exception:** the ECS service needs an image to start, so create only the ECR repository before the first image push. This is the sole documented use of `-target`; do not use targeted applies for routine infrastructure changes. First configure the S3 backend described above, then run:

```bash
cd infra/aws/terraform
terraform init -backend-config=backend-staging.hcl
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

6. For staging HTTP, verify the ALB-generated DNS name and `/health/ready` endpoint using non-sensitive test data only. Production traffic must wait for HTTPS and a valid certificate.
7. Apply SQL migrations through a separate migration job/identity; the API task must not run migrations as a database owner.

## Container

Build from the repository root:

```bash
docker build -f Dockerfile.api -t careerops-api:local .
```

The image runs as the non-root Node user and starts `dist-api/apps/api/src/main.js`.

## GitHub Actions deployment

The manual deployment workflow uses GitHub OIDC and refuses to run unless it was dispatched from `main`. Before requesting AWS credentials, it requires a successful CI workflow run for the exact commit being deployed. It then checks that the assumed identity belongs to account `165328640460`, that the region is `ap-southeast-2`, and that the ECR repository belongs to that same account/region. Configure repository variable `AWS_REGION`, secret `AWS_ROLE_TO_ASSUME`, and variables `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, and `ECS_TASK_FAMILY`. The assumed role must be restricted to this repository and the protected production environment, and permit only ECR push plus updating the named ECS service/task family.

## OIDC deployment role

Create an IAM OIDC provider for `token.actions.githubusercontent.com` and a role whose trust policy restricts the subject to this repository and the protected deployment branch/environment. Do not use long-lived AWS access keys in GitHub.

The deployment role needs ECR push actions on this repository, `ecs:DescribeTaskDefinition`, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:DescribeServices`, and `iam:PassRole` for only the ECS execution and task roles created by this stack. Configure GitHub repository variables/secrets as described above.

The workflow builds a Linux ARM64 image, pushes an immutable `release-<commit-sha>-<run-id>-<run-attempt>` tag (so re-running a workflow cannot collide with an already-pushed immutable tag), registers a new task-definition revision with that exact image, updates the service, and waits for ECS stability. It then verifies that the service is actually running the requested task-definition revision with all desired tasks healthy; a stable rollback to the old revision is treated as a failed deployment. The ECS deployment circuit breaker is configured to roll back failed deployments. Configure the GitHub `production` environment to allow only the `main` branch and require an explicit reviewer before the deployment role's secret is released.

## Not included yet

The existing API has no production adapters for S3 object storage, SQS job dispatch, EventBridge schedules, or SES delivery. Do not enable those resources until the corresponding ports, tenant-scoped authorization, idempotency, retry/dead-letter behavior, and integration tests are implemented. This stack is the AWS compute/database/deployment foundation, not a claim that every future AWS capability is already wired.
