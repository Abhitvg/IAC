import { describe, expect, it } from 'vitest';
import {
  assertReviewAllowed,
  validateCareerGraphFact,
  validateCareerGraphFactCreateRequest,
  type CareerGraphFact,
} from '../packages/cloud-core/src/career-graph';
import { TenantEnvelopeCipher } from '../packages/cloud-core/src/encryption';
import { MasterKeyTenantKeyProvider } from '../packages/cloud-core/src/master-key-provider';

const tenantId = '40000000-0000-4000-8000-000000000004';
const envelope = {
  algorithm: 'A256GCM' as const,
  keyVersion: 'kms-key-v1',
  wrappedKey: 'wrapped-data-key',
  iv: 'AAAAAAAAAAAAAAAA',
  authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
  ciphertext: 'encrypted-payload',
  tenantId,
  context: 'career-graph:profile.current_role',
};

describe('Career Graph fact integrity', () => {
  it('accepts bounded encrypted facts with explicit provenance', () => {
    expect(
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        valueEnvelope: envelope,
        source: { kind: 'user_input' },
      })
    ).toMatchObject({ factKey: 'profile.current_role', valueEnvelope: envelope });
  });

  it('rejects plaintext values and cross-tenant or wrong-context envelopes', () => {
    expect(() =>
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        value: 'Software Engineer',
        source: { kind: 'user_input' },
      })
    ).toThrow();

    expect(() =>
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        valueEnvelope: { ...envelope, tenantId: '50000000-0000-4000-8000-000000000005' },
        source: { kind: 'user_input' },
      })
    ).toThrow(/tenant mismatch/);

    expect(() =>
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        valueEnvelope: { ...envelope, context: 'career-graph:profile.email' },
        source: { kind: 'user_input' },
      })
    ).toThrow(/context mismatch/);

    expect(() =>
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        valueEnvelope: { ...envelope, iv: 'AA==' },
        source: { kind: 'user_input' },
      })
    ).toThrow(/IV must be 12-byte base64/);
  });

  it('accepts bounded JSON fact values for trusted API encryption', () => {
    expect(
      validateCareerGraphFactCreateRequest(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        value: { title: 'Software Engineer', years: 4, currentlyEmployed: true },
        source: { kind: 'user_input' },
      })
    ).toMatchObject({
      factKey: 'profile.current_role',
      value: { title: 'Software Engineer', years: 4, currentlyEmployed: true },
    });

    expect(() =>
      validateCareerGraphFactCreateRequest(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        value: { nested: { unsupported: true } },
        source: { kind: 'user_input' },
      })
    ).toThrow();

    expect(() =>
      validateCareerGraphFactCreateRequest(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        value: 'x'.repeat(12_001),
        source: { kind: 'user_input' },
      })
    ).toThrow();
  });

  it('decrypts old envelopes during master-key rotation and encrypts new ones with the current version', async () => {
    const keyV1 = Buffer.alloc(32, 7).toString('base64');
    const keyV2 = Buffer.alloc(32, 8).toString('base64');
    const tenantId = '40000000-0000-4000-8000-000000000004';
    const context = 'career-graph:profile.current_role';
    const originalProvider = new MasterKeyTenantKeyProvider({
      masterKeys: { 'master-v1': keyV1 },
      currentKeyVersion: 'master-v1',
    });
    const originalCipher = new TenantEnvelopeCipher(originalProvider);
    const oldEnvelope = await originalCipher.encrypt(
      tenantId,
      context,
      Buffer.from(JSON.stringify('Software Engineer'))
    );

    const rotatedProvider = new MasterKeyTenantKeyProvider({
      masterKeys: { 'master-v1': keyV1, 'master-v2': keyV2 },
      currentKeyVersion: 'master-v2',
    });
    const rotatedCipher = new TenantEnvelopeCipher(rotatedProvider);
    const oldPlaintext = await rotatedCipher.decrypt(oldEnvelope, tenantId, context);
    expect(JSON.parse(oldPlaintext.toString('utf8'))).toBe('Software Engineer');
    oldPlaintext.fill(0);

    const reencryptedEnvelope = await rotatedCipher.reencrypt(oldEnvelope, tenantId, context);
    expect(reencryptedEnvelope.keyVersion).toBe('master-v2');
    const reencryptedPlaintext = await rotatedCipher.decrypt(
      reencryptedEnvelope,
      tenantId,
      context
    );
    expect(JSON.parse(reencryptedPlaintext.toString('utf8'))).toBe('Software Engineer');
    reencryptedPlaintext.fill(0);

    const newEnvelope = await rotatedCipher.encrypt(
      tenantId,
      context,
      Buffer.from(JSON.stringify('Staff Software Engineer'))
    );
    expect(newEnvelope.keyVersion).toBe('master-v2');
    const newPlaintext = await rotatedCipher.decrypt(newEnvelope, tenantId, context);
    expect(JSON.parse(newPlaintext.toString('utf8'))).toBe('Staff Software Engineer');
    newPlaintext.fill(0);

    originalProvider.destroy();
    rotatedProvider.destroy();
  });

  it('requires stable fact keys and bounded provenance', () => {
    expect(() =>
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'Profile.CurrentRole',
        valueEnvelope: envelope,
        source: { kind: 'user_input' },
      })
    ).toThrow();

    expect(() =>
      validateCareerGraphFact(tenantId, 'user-1', {
        factKey: 'profile.current_role',
        valueEnvelope: envelope,
        source: { kind: 'document', reference: 'x'.repeat(513) },
      })
    ).toThrow();
  });

  it('allows only the contributor to review a fact once', () => {
    const fact = {
      id: '60000000-0000-4000-8000-000000000006',
      tenantId,
      factKey: 'profile.current_role',
      version: 1,
      valueEnvelope: envelope,
      source: { kind: 'user_input' as const },
      createdBy: 'user-1',
      createdAt: '2026-11-11T00:00:00.000Z',
      review: null,
    } satisfies CareerGraphFact;

    expect(() => assertReviewAllowed(fact, 'user-1', 'confirmed')).not.toThrow();
    expect(() => assertReviewAllowed(fact, 'user-2', 'confirmed')).toThrow(/contributor/);
    expect(() =>
      assertReviewAllowed(
        {
          ...fact,
          review: {
            decision: 'confirmed',
            reviewedBy: 'user-1',
            reviewedAt: fact.createdAt,
          },
        },
        'user-1',
        'rejected'
      )
    ).toThrow(/immutable/);
  });
});
