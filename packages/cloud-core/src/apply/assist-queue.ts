import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JobPlatformEnum, type JobPlatform } from '../plugins';

export const HandOffReasonEnum = z.enum([
  'captcha_detected',
  'login_required',
  'mfa_required',
  'unsupported_form_flow',
  'missing_default_answer',
  'linkedin_assist',
]);

export type HandOffReason = z.infer<typeof HandOffReasonEnum>;

export const AssistQueueStatusEnum = z.enum(['pending', 'opened', 'completed', 'dismissed']);
export type AssistQueueStatus = z.infer<typeof AssistQueueStatusEnum>;

export const AssistQueueItemSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    applicationId: z.string().uuid().nullable().optional(),
    company: z.string().trim().min(1).max(160),
    role: z.string().trim().min(1).max(160),
    platform: JobPlatformEnum.or(z.literal('linkedin_assist')),
    targetUrl: z.string().url().max(1024),
    handOffReason: HandOffReasonEnum,
    status: AssistQueueStatusEnum.default('pending'),
    prefilledPayload: z.record(z.string(), z.unknown()).default({}),
    assistNotes: z.string().max(2000).optional(),
    userGestureRequired: z.boolean().default(true),
    openedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type AssistQueueItem = z.infer<typeof AssistQueueItemSchema>;

export interface CreateAssistQueueItemInput {
  tenantId: string;
  applicationId?: string | null;
  company: string;
  role: string;
  platform: JobPlatform | 'linkedin_assist';
  targetUrl: string;
  handOffReason: HandOffReason;
  prefilledPayload?: Record<string, unknown>;
  assistNotes?: string;
  userGestureRequired?: boolean;
}

export class HardLineH1ViolationError extends Error {
  constructor(message = 'Hard Line H1: Automated actions on LinkedIn are strictly forbidden. Must be dispatched via Assist Queue with user gesture.') {
    super(message);
    this.name = 'HardLineH1ViolationError';
  }
}

export class HardLineH2ViolationError extends Error {
  constructor(message = 'Hard Line H2: CAPTCHA and bot circumvention is prohibited. Action must be handed off to Assist Queue.') {
    super(message);
    this.name = 'HardLineH2ViolationError';
  }
}

/**
 * Creates and validates a new AssistQueueItem.
 */
export function createAssistQueueItem(input: CreateAssistQueueItemInput): AssistQueueItem {
  const now = new Date().toISOString();

  // Code-level enforcement of H1:
  // If targetUrl points to LinkedIn, platform must be linkedin_assist and userGestureRequired must be true.
  const isLinkedIn = input.targetUrl.toLowerCase().includes('linkedin.com');
  const userGestureRequired = isLinkedIn ? true : (input.userGestureRequired ?? true);
  const platform = isLinkedIn ? 'linkedin_assist' : input.platform;

  const item: AssistQueueItem = {
    id: randomUUID(),
    tenantId: input.tenantId,
    applicationId: input.applicationId ?? null,
    company: input.company.trim(),
    role: input.role.trim(),
    platform,
    targetUrl: input.targetUrl,
    handOffReason: input.handOffReason,
    status: 'pending',
    prefilledPayload: input.prefilledPayload ?? {},
    ...(input.assistNotes ? { assistNotes: input.assistNotes } : {}),
    userGestureRequired,
    createdAt: now,
    updatedAt: now,
  };

  return AssistQueueItemSchema.parse(item);
}
