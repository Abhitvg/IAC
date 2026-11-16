#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if git grep -n -I -E '"kms:\*"' -- 'infra/aws/terraform/**'; then
  echo "Broad kms:* permissions are forbidden for application roles." >&2
  exit 1
fi
git grep -q -I 'kms:GenerateDataKey' -- 'infra/aws/terraform/**'
git grep -q -I 'kms:Decrypt' -- 'infra/aws/terraform/**'
git grep -q -I 'kms:EncryptionContext:application' -- 'infra/aws/terraform/**'
echo "KMS application permissions are scoped to envelope crypto and CareerOps context."
