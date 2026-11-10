import {
  EvidenceVerificationService,
  type AuditorSignedAttestation,
  type ImmutableIndependentAuditResult,
} from './evidenceVerificationService';

export const MAX_AUDIT_ATTESTATION_PAYLOAD_BYTES = 64 * 1024;
const MAX_AUDITOR_KEY_ID_LENGTH = 128;
const ED25519_SIGNATURE_HEX_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reject oversized or malformed renderer-originated attestations before crypto allocates buffers.
 */
export function verifyBoundedAuditAttestation(
  input: unknown
): Promise<ImmutableIndependentAuditResult | null> {
  if (!isRecord(input)) {
    return Promise.resolve(null);
  }

  const { schemaVersion, auditorKeyId, payloadJson, signatureHex } = input;

  if (
    schemaVersion !== 'iac.audit.v1' ||
    typeof auditorKeyId !== 'string' ||
    !auditorKeyId.trim() ||
    auditorKeyId.length > MAX_AUDITOR_KEY_ID_LENGTH ||
    typeof payloadJson !== 'string' ||
    !payloadJson ||
    payloadJson.length > MAX_AUDIT_ATTESTATION_PAYLOAD_BYTES ||
    typeof signatureHex !== 'string' ||
    signatureHex.length !== ED25519_SIGNATURE_HEX_LENGTH ||
    !/^[0-9a-f]{128}$/i.test(signatureHex)
  ) {
    return Promise.resolve(null);
  }

  if (Buffer.byteLength(payloadJson, 'utf8') > MAX_AUDIT_ATTESTATION_PAYLOAD_BYTES) {
    return Promise.resolve(null);
  }

  const attestation: AuditorSignedAttestation = {
    schemaVersion,
    auditorKeyId,
    payloadJson,
    signatureHex,
  };

  return EvidenceVerificationService.verifySignedAttestation(attestation);
}
