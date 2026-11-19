#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# KMS is permitted for trusted backend envelope encryption. Broad permissions
# and accidental use of the application data key by the ECS execution role remain forbidden.
if git grep -n -I -E '"kms:\*"' -- 'infra/aws/terraform/**'; then
  echo "Broad kms:* permissions are forbidden." >&2
  exit 1
fi

if git grep -n -I 'kms:CreateKey\|kms:PutKeyPolicy\|kms:ScheduleKeyDeletion' -- 'infra/aws/terraform/**'; then
  echo "Runtime roles must not administer or delete KMS keys." >&2
  exit 1
fi

git grep -q -I 'kms:Decrypt' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:ViaService' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:EncryptionContext:SecretARN' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'role   = aws_iam_role.execution.id' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:GenerateDataKey' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:EncryptionContext:application' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'kms:EncryptionContextKeys' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'role   = aws_iam_role.task.id' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'prevent_destroy = true' -- 'infra/aws/terraform/main.tf'
git grep -q -I 'aws_iam_role_policy.application_envelope_kms' -- 'infra/aws/terraform/main.tf'

echo "KMS calls are permitted for trusted backend code; IAM must remain key-scoped and separate runtime use from key administration."
