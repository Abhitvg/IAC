import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyBoundedAuditAttestation } from '../electron/services/boundedAuditAttestation';
import { EvidenceVerificationService } from '../electron/services/evidenceVerificationService';

afterEach(() => {
  vi.restoreAllMocks();
});

function validAttestation(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'iac.audit.v1',
    auditorKeyId: 'test-auditor',
    payloadJson: '{"auditId":"test-audit"}',
    signatureHex: 'a'.repeat(128),
    ...overrides,
  };
}

describe('bounded audit attestation IPC validation', () => {
  it('rejects oversized payload strings before invoking cryptographic verification', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyBoundedAuditAttestation(validAttestation({ payloadJson: 'x'.repeat(64 * 1024 + 1) }))
    ).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('enforces the UTF-8 byte limit for multibyte payload strings', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyBoundedAuditAttestation(validAttestation({ payloadJson: '€'.repeat(22_000) }))
    ).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects malformed Ed25519 signature encodings', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyBoundedAuditAttestation(validAttestation({ signatureHex: 'z'.repeat(128) }))
    ).resolves.toBeNull();
    await expect(
      verifyBoundedAuditAttestation(validAttestation({ signatureHex: 'a'.repeat(126) }))
    ).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects oversized auditor identifiers and non-object payloads', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);

    await expect(
      verifyBoundedAuditAttestation(validAttestation({ auditorKeyId: 'x'.repeat(129) }))
    ).resolves.toBeNull();
    await expect(verifyBoundedAuditAttestation(null)).resolves.toBeNull();
    await expect(verifyBoundedAuditAttestation([])).resolves.toBeNull();

    expect(verify).not.toHaveBeenCalled();
  });

  it('delegates bounded, correctly shaped attestations to the verifier', async () => {
    const verify = vi
      .spyOn(EvidenceVerificationService, 'verifySignedAttestation')
      .mockResolvedValue(null);
    const attestation = validAttestation();

    await expect(verifyBoundedAuditAttestation(attestation)).resolves.toBeNull();

    expect(verify).toHaveBeenCalledWith(attestation);
  });
});
