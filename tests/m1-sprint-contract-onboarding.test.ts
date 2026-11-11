import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildSprintContractFromDraft,
  deduplicateCandidateFacts,
  prepareEncryptedFact,
  signSprintContractConsent,
  validateOnboardingTruthfulness,
  type SprintContractOnboardingDraft,
} from '../packages/cloud-core/src/onboarding';
import {
  TenantEnvelopeCipher,
  type TenantKeyManagementService,
} from '../packages/cloud-core/src/encryption';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';

class FakeKms implements TenantKeyManagementService {
  async generateDataKey(_tenantId: string, _context: string) {
    return {
      plaintextKey: Buffer.alloc(32, 7),
      wrappedKey: 'wrapped-fake-key-m1',
      keyVersion: 'kms-v1',
    };
  }

  async unwrapDataKey(
    _tenantId: string,
    wrappedKey: string,
    _keyVersion: string,
    _context: string
  ) {
    if (wrappedKey !== 'wrapped-fake-key-m1') throw new Error('Unwrap failed');
    return Buffer.alloc(32, 7);
  }
}

describe('M1: Sprint Contract Onboarding & Standing Consent (≤10 min flow)', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const subject = 'candidate:alice';
  const signingSecret = 'high-entropy-consent-secret-at-least-32-chars-long';

  const confirmedFactId1 = '20000000-0000-4000-8000-000000000001';
  const confirmedFactId2 = '20000000-0000-4000-8000-000000000002';
  const confirmedFactId3 = '20000000-0000-4000-8000-000000000003';
  const confirmedFactIds = new Set([confirmedFactId1, confirmedFactId2, confirmedFactId3]);

  const validDraft: SprintContractOnboardingDraft = {
    roles: ['Staff Software Engineer', 'Engineering Manager'],
    seniority: ['staff', 'principal'],
    locations: ['San Francisco, CA', 'New York, NY'],
    remotePreference: 'remote',
    salaryFloor: { amount: 220000, currency: 'USD' },
    workAuthorization: {
      countries: ['US'],
      requiresSponsorship: false,
      confirmed: true,
    },
    blocklist: {
      companies: ['Competitor Corp'],
      industries: ['Gambling'],
    },
    enabledChannels: ['ats', 'email'],
    dailyCaps: {
      applications: 15,
      emails: 10,
      assistQueueItems: 5,
      calendarEvents: 2,
    },
    allowedFactIds: [confirmedFactId1, confirmedFactId2, confirmedFactId3],
    screeningAnswers: [
      {
        questionKey: 'work_authorization',
        questionText: 'Are you legally authorized to work in the United States?',
        answerText: 'Yes, I am a US citizen and do not require sponsorship.',
        groundingFactIds: [confirmedFactId1],
      },
      {
        questionKey: 'years_experience_systems',
        questionText: 'How many years of distributed systems experience do you have?',
        answerText:
          'Over 8 years building high-throughput distributed systems in Go and TypeScript.',
        groundingFactIds: [confirmedFactId2, confirmedFactId3],
      },
    ],
    tone: 'professional',
    senderIdentity: {
      name: 'Alice Smith',
      email: 'alice@example.com',
    },
    jurisdiction: ['US'],
    outreachConsent: true,
    startsAt: '2026-11-12T00:00:00.000Z',
    endsAt: '2026-11-16T00:00:00.000Z', // 96-hour sprint
  };

  it('deduplicates candidate facts across multiple sources by factKey', () => {
    const rawFacts: CandidateFact[] = [
      {
        factKey: 'skill.typescript',
        category: 'skill',
        payload: { name: 'TypeScript', category: 'language' },
        source: { kind: 'document', reference: 'resume.txt' },
        suggestedConfidence: 0.85,
      },
      {
        factKey: 'skill.typescript',
        category: 'skill',
        payload: { name: 'TypeScript', category: 'language' },
        source: { kind: 'import', reference: 'linkedin:Skills.csv' },
        suggestedConfidence: 0.95,
      },
      {
        factKey: 'experience.acme-engineer',
        category: 'experience',
        payload: {
          company: 'Acme',
          role: 'SWE',
          startDate: '2021',
          endDate: null,
          isCurrent: true,
          achievements: [],
          technologies: [],
        },
        source: { kind: 'document', reference: 'resume.txt' },
        suggestedConfidence: 0.9,
      },
    ];

    const deduplicated = deduplicateCandidateFacts(rawFacts);
    expect(deduplicated).toHaveLength(2);
    const ts = deduplicated.find((f) => f.factKey === 'skill.typescript');
    expect(ts?.suggestedConfidence).toBe(0.95);
    expect(ts?.source.reference).toBe('linkedin:Skills.csv');
  });

  it('encrypts candidate facts into KMS-backed tenant envelopes', async () => {
    const cipher = new TenantEnvelopeCipher(new FakeKms());
    const candidate: CandidateFact = {
      factKey: 'skill.postgresql',
      category: 'skill',
      payload: { name: 'PostgreSQL', category: 'database', proficiency: 'expert' },
      source: { kind: 'import', reference: 'linkedin:Skills.csv' },
      suggestedConfidence: 0.9,
    };

    const factInput = await prepareEncryptedFact(tenantId, cipher, candidate);
    expect(factInput.factKey).toBe('skill.postgresql');
    expect(factInput.valueEnvelope.algorithm).toBe('A256GCM');
    expect(factInput.valueEnvelope.tenantId).toBe(tenantId);
    expect(factInput.valueEnvelope.context).toBe('career-graph:skill.postgresql');
    expect(factInput.valueEnvelope.ciphertext).toBeDefined();

    // Verify it decrypts back
    const decryptedBytes = await cipher.decrypt(
      factInput.valueEnvelope,
      tenantId,
      'career-graph:skill.postgresql'
    );
    const decryptedPayload = JSON.parse(decryptedBytes.toString('utf8'));
    expect(decryptedPayload.name).toBe('PostgreSQL');
    expect(decryptedPayload.proficiency).toBe('expert');
  });

  it('blocks onboarding when an unconfirmed fact is included in allowedFactIds (Hard Line H3)', () => {
    const unconfirmedFactId = '30000000-0000-4000-8000-000000000999';
    const invalidDraft = {
      ...validDraft,
      allowedFactIds: [confirmedFactId1, unconfirmedFactId],
    };

    expect(() => validateOnboardingTruthfulness(invalidDraft, confirmedFactIds)).toThrowError(
      /Truthfulness violation \(H3\)/
    );
  });

  it('blocks onboarding when a screening answer references an unconfirmed fact (Hard Line H3)', () => {
    const unconfirmedFactId = '30000000-0000-4000-8000-000000000999';
    const invalidDraft: SprintContractOnboardingDraft = {
      ...validDraft,
      allowedFactIds: [confirmedFactId1],
      screeningAnswers: [
        {
          questionKey: 'secret_clearance',
          questionText: 'Do you hold an active Top Secret clearance?',
          answerText: 'Yes, Top Secret with Polygraph.',
          groundingFactIds: [unconfirmedFactId], // Unconfirmed!
        },
      ],
    };

    expect(() => validateOnboardingTruthfulness(invalidDraft, confirmedFactIds)).toThrowError(
      /references unconfirmed fact/
    );
  });

  it('enforces email outreach requires explicit outreach consent (Hard Line H4)', () => {
    const draftWithoutConsent: SprintContractOnboardingDraft = {
      ...validDraft,
      enabledChannels: ['ats', 'email'],
      outreachConsent: false, // Violation when email channel is enabled!
    };

    expect(() => buildSprintContractFromDraft(draftWithoutConsent, confirmedFactIds)).toThrowError(
      /Email requires explicit outreach consent/
    );
  });

  it('builds and signs an immutable Sprint Contract with HMAC consent record', () => {
    const contract = buildSprintContractFromDraft(validDraft, confirmedFactIds);
    expect(contract.version).toBe(1);
    expect(contract.roles).toEqual(['Staff Software Engineer', 'Engineering Manager']);
    expect(contract.defaultAnswers.work_authorization.answer).toContain('US citizen');

    const consentRecord = signSprintContractConsent(tenantId, subject, contract, signingSecret);

    expect(consentRecord.tenantId).toBe(tenantId);
    expect(consentRecord.subject).toBe(subject);
    expect(consentRecord.contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(consentRecord.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(consentRecord.revokedAt).toBeNull();

    // Verify HMAC signature
    const expectedPayload = JSON.stringify([
      tenantId,
      subject,
      consentRecord.contractHash,
      consentRecord.acceptedAt,
    ]);
    const expectedSignature = createHmac('sha256', signingSecret)
      .update(expectedPayload)
      .digest('hex');
    expect(consentRecord.signature).toBe(expectedSignature);
  });
});
