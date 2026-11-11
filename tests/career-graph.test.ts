import { describe, expect, it } from 'vitest';
import {
  assertReviewAllowed,
  validateCareerGraphFact,
  type CareerGraphFact,
} from '../packages/cloud-core/src/career-graph';

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
