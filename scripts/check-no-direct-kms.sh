#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# This is a guardrail, not a proof of absence: review dynamically constructed
# calls and infrastructure-managed encryption separately.
if git grep -n -I -E \
  '(@aws-sdk/client-kms|aws-sdk/clients/kms|GenerateDataKeyCommand|DecryptCommand|kms:GenerateDataKey|kms:Decrypt|kms:Encrypt|KMSClient)' \
  -- 'apps/**' 'packages/**' 'electron/**' 'src/**'; then
  echo "Direct AWS KMS application dependency detected." >&2
  exit 1
fi

echo "No known direct AWS KMS SDK/API dependency found in application source."
