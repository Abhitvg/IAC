import { Buffer } from 'node:buffer';
import { z } from 'zod';

const FactKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_.-]*$/, 'Fact keys must be stable lowercase identifiers');

function base64BytesOfLength(value: string, expectedBytes: number): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === expectedBytes && decoded.toString('base64') === value;
}

// prettier-ignore
export const EncryptedFactEnvelopeSchema = z
  .object({
    algorithm: z.literal('A256GCM'),
    keyVersion: z.string().min(1).max(128),
    wrappedKey: z.string().min(1).max(4096),
    iv: z
      .string()
      .refine((value) => base64BytesOfLength(value, 12), 'IV must be 12-byte base64'),
    authTag: z
      .string()
      .refine((value) => base64BytesOfLength(value, 16), 'Auth tag must be 16-byte base64'),
    ciphertext: z.string().min(1).max(1_000_000),
    tenantId: z.string().uuid(),
    context: z.string().min(1).max(256),
  })
  .strict();

const CareerGraphFactSourceSchema = z
  .object({
    kind: z.enum(['user_input', 'document', 'integration', 'import']),
    reference: z.string().max(512).optional(),
    evidenceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

const CareerGraphFactValueSchema = z.union([
  z.string().max(12_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(2_000)).max(100),
  z
    .record(
      z.string().max(120),
      z.union([
        z.string().max(4_000),
        z.number().finite(),
        z.boolean(),
        z.null(),
      ])
    )
    .refine(
      (value) => Object.keys(value).length <= 50,
      'Fact objects may contain at most 50 fields'
    ),
]);

export const CareerGraphFactCreateRequestSchema = z
  .object({
    factKey: FactKeySchema,
    value: CareerGraphFactValueSchema,
    source: CareerGraphFactSourceSchema,
  })
  .strict();

export const CareerGraphFactInputSchema = z
  .object({
    factKey: FactKeySchema,
    valueEnvelope: EncryptedFactEnvelopeSchema,
    source: CareerGraphFactSourceSchema,
  })
  .strict();

export const CareerGraphFactReviewSchema = z
  .object({
    decision: z.enum(['confirmed', 'rejected']),
    reason: z.string().trim().max(512).optional(),
  })
  .strict();

export type EncryptedFactEnvelope = z.infer<typeof EncryptedFactEnvelopeSchema>;
export type CareerGraphFactInput = z.infer<typeof CareerGraphFactInputSchema>;
export type CareerGraphFactCreateRequest = z.infer<typeof CareerGraphFactCreateRequestSchema>;
export type CareerGraphFactValue = CareerGraphFactCreateRequest['value'];
export type CareerGraphFactReview = z.infer<typeof CareerGraphFactReviewSchema>;

export interface CareerGraphFact {
  id: string;
  tenantId: string;
  factKey: string;
  version: number;
  valueEnvelope: EncryptedFactEnvelope;
  source: CareerGraphFactInput['source'];
  createdBy: string;
  createdAt: string;
  review: (CareerGraphFactReview & { reviewedBy: string; reviewedAt: string }) | null;
}

/**
 * Validates a client fact submission. Plaintext is accepted only at the authenticated
 * API boundary and must be encrypted before it reaches the repository.
 */
export function validateCareerGraphFactCreateRequest(
  tenantId: string,
  actorSubject: string,
  input: unknown
): CareerGraphFactCreateRequest {
  if (!tenantId || !actorSubject || actorSubject.length > 255) {
    throw new Error('Authenticated tenant and actor are required');
  }
  return CareerGraphFactCreateRequestSchema.parse(input);
}

/**
 * Validates an encrypted fact before persistence. The envelope is bound to the
 * authenticated tenant and stable fact-key context.
 */
export function validateCareerGraphFact(
  tenantId: string,
  actorSubject: string,
  input: unknown
): CareerGraphFactInput {
  if (!tenantId || !actorSubject || actorSubject.length > 255) {
    throw new Error('Authenticated tenant and actor are required');
  }
  const parsed = CareerGraphFactInputSchema.parse(input);
  if (parsed.valueEnvelope.tenantId !== tenantId) {
    throw new Error('Career Graph envelope tenant mismatch');
  }
  if (parsed.valueEnvelope.context !== `career-graph:${parsed.factKey}`) {
    throw new Error('Career Graph envelope context mismatch');
  }
  return parsed;
}

export function assertReviewAllowed(
  fact: Pick<CareerGraphFact, 'createdBy' | 'review'>,
  actorSubject: string,
  decision: CareerGraphFactReview['decision']
): void {
  if (!actorSubject || actorSubject.length > 255) {
    throw new Error('Authenticated reviewer is required');
  }
  if (fact.createdBy !== actorSubject) {
    throw new Error('Only the fact contributor may confirm or reject this fact');
  }
  if (fact.review) {
    throw new Error('A reviewed fact is immutable; submit a new version to change it');
  }
  if (!['confirmed', 'rejected'].includes(decision)) {
    throw new Error('Unsupported Career Graph review decision');
  }
}
