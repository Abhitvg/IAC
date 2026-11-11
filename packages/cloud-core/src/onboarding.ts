import { createHash, randomUUID } from 'node:crypto';
import type { CandidateFact } from './career-graph-types';
import {
  createConsentRecord,
  type ConsentRecord,
  type SprintContract,
  SprintContractSchema,
} from './contract';
import type { TenantEnvelopeCipher } from './encryption';
import type { CareerGraphFactInput } from './career-graph';

export interface OnboardingImportBundle {
  resumeText?: string;
  resumeFilename?: string;
  linkedInArchive?: {
    positionsCsv?: string;
    educationCsv?: string;
    skillsCsv?: string;
    certificationsCsv?: string;
    profileCsv?: string;
  };
  gitHubPayload?: {
    user: { login: string; name?: string; bio?: string };
    repositories: Array<{
      name: string;
      description?: string | null;
      html_url: string;
      language?: string | null;
      stargazers_count?: number;
      forks_count?: number;
      topics?: string[];
      homepage?: string | null;
      fork?: boolean;
    }>;
  };
}

export interface ScreeningQuestionInput {
  questionKey: string;
  questionText: string;
  answerText: string;
  groundingFactIds: string[];
}

export interface SprintContractOnboardingDraft {
  roles: string[];
  seniority: Array<
    'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'director' | 'executive'
  >;
  locations: string[];
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryFloor: { amount: number; currency: string };
  workAuthorization: {
    countries: string[];
    requiresSponsorship: boolean;
    confirmed: true;
  };
  blocklist: {
    companies: string[];
    industries: string[];
  };
  enabledChannels: Array<'ats' | 'email' | 'calendar' | 'linkedin_assist'>;
  dailyCaps: {
    applications: number;
    emails: number;
    assistQueueItems: number;
    calendarEvents: number;
  };
  screeningAnswers?: ScreeningQuestionInput[];
  allowedFactIds: string[];
  tone: 'professional' | 'direct' | 'warm' | 'concise';
  senderIdentity: { name: string; email: string };
  jurisdiction: Array<'US' | 'EU' | 'UK' | 'IN' | 'OTHER'>;
  outreachConsent: boolean;
  startsAt: string;
  endsAt: string;
}

/**
 * Deduplicates and prioritizes candidate facts from multiple sources.
 */
export function deduplicateCandidateFacts(facts: CandidateFact[]): CandidateFact[] {
  const map = new Map<string, CandidateFact>();

  for (const fact of facts) {
    const existing = map.get(fact.factKey);
    if (!existing || fact.suggestedConfidence > existing.suggestedConfidence) {
      map.set(fact.factKey, fact);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.factKey.localeCompare(b.factKey));
}

/**
 * Encrypts a candidate fact into a valid CareerGraphFactInput envelope using TenantEnvelopeCipher.
 */
export async function prepareEncryptedFact(
  tenantId: string,
  cipher: TenantEnvelopeCipher,
  candidate: CandidateFact
): Promise<CareerGraphFactInput> {
  const context = `career-graph:${candidate.factKey}`;
  const serialized = Buffer.from(JSON.stringify(candidate.payload), 'utf8');
  const envelope = await cipher.encrypt(tenantId, context, serialized);

  return {
    factKey: candidate.factKey,
    valueEnvelope: envelope,
    source: {
      kind: candidate.source.kind,
      reference: candidate.source.reference,
      evidenceSha256: candidate.source.evidenceSha256,
    },
  };
}

/**
 * Validates that all candidate facts referenced in the onboarding draft
 * are verified against confirmed facts (Hard Line H3: Truthfulness Gate).
 */
export function validateOnboardingTruthfulness(
  draft: SprintContractOnboardingDraft,
  confirmedFactIds: Set<string>
): void {
  // 1. All allowedFactIds must exist in confirmedFactIds
  for (const factId of draft.allowedFactIds) {
    if (!confirmedFactIds.has(factId)) {
      throw new Error(
        `Truthfulness violation (H3): Allowed fact '${factId}' has not been confirmed in Career Graph`
      );
    }
  }

  // 2. All screening answers must be grounded in confirmed facts
  if (draft.screeningAnswers) {
    for (const screening of draft.screeningAnswers) {
      if (!screening.groundingFactIds || screening.groundingFactIds.length === 0) {
        throw new Error(
          `Truthfulness violation (H3): Screening answer for '${screening.questionKey}' lacks confirmed fact grounding`
        );
      }
      for (const factId of screening.groundingFactIds) {
        if (!confirmedFactIds.has(factId)) {
          throw new Error(
            `Truthfulness violation (H3): Screening answer for '${screening.questionKey}' references unconfirmed fact '${factId}'`
          );
        }
      }
    }
  }
}

/**
 * Assembles and validates a Sprint Contract ready for standing consent signing (target ≤10 minutes).
 */
export function buildSprintContractFromDraft(
  draft: SprintContractOnboardingDraft,
  confirmedFactIds: Set<string>
): SprintContract {
  // Validate H3 Truthfulness
  validateOnboardingTruthfulness(draft, confirmedFactIds);

  const defaultAnswers: SprintContract['defaultAnswers'] = {};
  if (draft.screeningAnswers) {
    for (const screening of draft.screeningAnswers) {
      defaultAnswers[screening.questionKey] = {
        answer: screening.answerText,
        confirmedFactIds: screening.groundingFactIds,
      };
    }
  }

  const rawContract = {
    version: 1 as const,
    roles: draft.roles,
    seniority: draft.seniority,
    locations: draft.locations,
    remotePreference: draft.remotePreference,
    salaryFloor: draft.salaryFloor,
    workAuthorization: draft.workAuthorization,
    blocklist: draft.blocklist,
    enabledChannels: draft.enabledChannels,
    dailyCaps: draft.dailyCaps,
    defaultAnswers,
    allowedFactIds: draft.allowedFactIds,
    tone: draft.tone,
    senderIdentity: draft.senderIdentity,
    jurisdiction: draft.jurisdiction,
    outreachConsent: draft.outreachConsent,
    consentTextVersion: 'v1.0-sprint-contract-standing-consent',
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
  };

  return SprintContractSchema.parse(rawContract);
}

/**
 * Executes Sprint Contract standing consent signing.
 * Produces an immutable, HMAC-signed ConsentRecord.
 */
export function signSprintContractConsent(
  tenantId: string,
  actorSubject: string,
  contract: SprintContract,
  signingSecret: string
): ConsentRecord {
  return createConsentRecord(tenantId, actorSubject, contract, signingSecret);
}
