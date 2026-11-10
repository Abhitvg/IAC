import { describe, expect, it } from 'vitest';
import { verifyEvidenceAttestation } from '../electron/services/boundedEvidenceInspection';
import type { AuditorSignedAttestation } from '../electron/services/evidenceVerificationService';

function attestation(
  overrides: Partial<AuditorSignedAttestation> = {}
): AuditorSignedAttestation {
  return {
    schemaVersion: 'iac.audit.v1',
    auditorKeyId: 'test-auditor',
    payloadJson: '{}',
    signatureHex: 'a'.repeat(128),
    ...overrides,
  };
}

describe('Evidence signed-attestation input limits', () => {
  it('rejects oversized JSON payloads before signature verification', () => {
    expect(() =>
      verifyEvidenceAttestation(attestation({ payloadJson: 'x'.repeat(256 * 1024 + 1) }))
    ).toThrow('maximum supported size');
  });

  it('rejects payloads whose UTF-8 representation exceeds the byte limit', () => {
    expect(() =>
      verifyEvidenceAttestation(attestation({ payloadJson: '😀'.repeat(200_000) }))
    ).toThrow('maximum supported size');
  });

  it('requires an exact Ed25519 hexadecimal signature', () => {
    expect(() =>
      verifyEvidenceAttestation(attestation({ signatureHex: 'a'.repeat(130) }))
    ).toThrow('128 hexadecimal characters');

    expect(() =>
      verifyEvidenceAttestation(attestation({ signatureHex: 'g'.repeat(128) }))
    ).toThrow('128 hexadecimal characters');
  });

  it('bounds the auditor key identifier', () => {
    expect(() =>
      verifyEvidenceAttestation(attestation({ auditorKeyId: 'x'.repeat(129) }))
    ).toThrow('auditorKeyId');
  });

  it('passes bounded attestations to the verifier', async () => {
    await expect(verifyEvidenceAttestation(attestation())).resolves.toBeNull();
  });
});
