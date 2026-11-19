#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if git grep -n -I -E '"kms:\*"' -- 'infra/aws/terraform/**'; then
  echo "Broad kms:* permissions are forbidden." >&2
  exit 1
fi

if git grep -n -I -E 'AwsKmsTenantKeyProvider|TrentService\.(GenerateDataKey|Decrypt)|kms:GenerateDataKey|@aws-sdk/client-kms|KMSClient|GenerateDataKeyCommand|DecryptCommand|GenerateDataKey|kms\.decrypt\(' -- 'apps/**' 'packages/**' 'scripts/**'; then
  echo "Direct KMS API calls from application code are forbidden." >&2
  exit 1
fi

if git grep -n -I 'kms_data_key' -- 'infra/aws/terraform/**'; then
  echo "Application task-role KMS policies are forbidden." >&2
  exit 1
fi

git grep -q -I 'kms:Decrypt' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:ViaService' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:EncryptionContext:SecretARN' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'CAREEROPS_ENVELOPE_MASTER_KEYS' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'MasterKeyTenantKeyProvider' -- 'apps/api/src/main.ts'
git grep -q -I 'data.aws_secretsmanager_secret.app_config.kms_key_id == var.kms_key_arn' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'role   = aws_iam_role.execution.id' -- 'infra/aws/terraform/main.tf'

kms_decrypt_matches="$(git grep -n -I 'kms:Decrypt' -- 'infra/aws/terraform/**' || true)"
kms_decrypt_count="$(printf '%s\n' "$kms_decrypt_matches" | grep -c . || true)"
if [[ "$kms_decrypt_count" -ne 1 ]]; then
  echo "Exactly one KMS decrypt permission is expected, only for Secrets Manager execution-role access." >&2
  exit 1
fi

echo "Application code uses locally wrapped envelope keys; KMS decrypt is limited to Secrets Manager secret retrieval by the ECS execution role."
