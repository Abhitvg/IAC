import { createHmac } from 'node:crypto';
import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const SprintContractSchema = z.object({
  version: z.literal(1),
  roles: z.array(boundedText(120)).min(1).max(20),
  seniority: z.array(z.enum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'director', 'executive'])).min(1),
  locations: z.array(boundedText(120)).max(30),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']),
  salaryFloor: z.object({ amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }),
  workAuthorization: z.object({
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(30),
    requiresSponsorship: z.boolean(),
    confirmed: z.literal(true),
  }),
  blocklist: z.object({
    companies: z.array(boundedText(160)).max(200),
    industries: z.array(boundedText(120)).max(100),
  }),
  enabledChannels: z.array(z.enum(['ats', 'email', 'calendar', 'linkedin_assist'])).max(4),
  dailyCaps: z.object({
    applications: z.number().int().min(0).max(100),
    emails: z.number().int().min(0).max(100),
    assistQueueItems: z.number().int().min(0).max(100),
    calendarEvents: z.number().int().min(0).max(100),
  }),
  defaultAnswers: z.record(z.string().max(160), z.object({
    answer: boundedText(2000),
    confirmedFactIds: z.array(z.string().uuid()).min(1).max(30),
  })).default({}),
  allowedFactIds: z.array(z.string().uuid()).max(1000),
  tone: z.enum(['professional', 'direct', 'warm', 'concise']),
  senderIdentity: z.object({ name: boundedText(120), email: z.string().email().max(254) }),
  jurisdiction: z.array(z.enum(['US', 'EU', 'UK', 'IN', 'OTHER'])).min(1),
  outreachConsent: z.boolean(),
  consentTextVersion: boundedText(40),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).strict().superRefine((contract, ctx) => {
  if (Date.parse(contract.endsAt) <= Date.parse(contract.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Sprint end must be after its start' });
  }
  if (contract.enabledChannels.includes('email') && !contract.outreachConsent) {
    ctx.addIssue({ code: 'custom', path: ['outreachConsent'], message: 'Email requires explicit outreach consent' });
  }
});

export type SprintContract = z.infer<typeof SprintContractSchema>;

export interface ConsentRecord {
  tenantId: string;
  subject: string;
  contract: SprintContract;
  contractHash: string;
  acceptedAt: string;
  signature: string;
  revokedAt: string | null;
}

export function createConsentRecord(
  tenantId: string,
  subject: string,
  input: unknown,
  signingSecret: string,
  acceptedAt = new Date().toISOString()
): ConsentRecord {
  if (!signingSecret || signingSecret.length < 32) {
    throw new Error('Consent signing secret must contain at least 32 characters');
  }
  const contract = SprintContractSchema.parse(input);
  const contractHash = createHmac('sha256', signingSecret)
    .update(JSON.stringify(contract))
    .digest('hex');
  const payload = [tenantId, subject, contractHash, acceptedAt].join('|');
  const signature = createHmac('sha256', signingSecret).update(payload).digest('hex');
  return { tenantId, subject, contract, contractHash, acceptedAt, signature, revokedAt: null };
}
