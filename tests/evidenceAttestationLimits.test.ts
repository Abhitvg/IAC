import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyEvidenceAttestation } from '../electron/services/boundedEvidenceInspection';
import { EvidenceVerificationService } from '../electron/services/evidenceVerificationService';
import type { AuditorSignedAttestation } from '../electron/services/evidenceVerificationService';

afterEach(() => {
  vi.restoreAllMocks();
});

function attestation(overrides: Partial<AuditorSignedAttestation> = {}): AuditorSignedAttestation {
  return {
    schemaVersion: 'iac.audit.v1',
    auditorKeyId: 'test-auditor',
    payloadJson: '{}',
    signatureHex: 'a'.repeat(128),
    ...overrides,
  };
}

describe('Evidence signed-attestation input limits', () => {
  it('rejects oversized JSON payloads before signature verification', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyEvidenceAttestation(attestation({ payloadJson: 'x'.repeat(64 * 1024 + 1) }))
    ).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('enforces the UTF-8 byte limit for multibyte payload strings', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyEvidenceAttestation(attestation({ payloadJson: '€'.repeat(22_000) }))
    ).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects malformed Ed25519 signature encodings', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyEvidenceAttestation(attestation({ signatureHex: 'z'.repeat(128) }))
    ).resolves.toBeNull();
    await expect(
      verifyEvidenceAttestation(attestation({ signatureHex: 'a'.repeat(126) }))
    ).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects oversized auditor identifiers and non-object payloads', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyEvidenceAttestation(attestation({ auditorKeyId: 'x'.repeat(129) }))
    ).resolves.toBeNull();
    await expect(verifyEvidenceAttestation(null)).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('passes bounded attestations to the verifier', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(verifyEvidenceAttestation(attestation())).resolves.toBeNull();
    expect(verify).toHaveBeenCalledOnce();
  });
});
