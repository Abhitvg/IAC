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

export const EncryptedFactEnvelopeSchema = z
  .object({
    algorithm: z.literal('A256GCM'),
    keyVersion: z.string().min(1).max(128),
    wrappedKey: z.string().min(1).max(4096),
    iv: z.string().refine((value) => base64BytesOfLength(value, 12), 'IV must be 12-byte base64'),
    authTag: z
      .string()
      .refine((value) => base64BytesOfLength(value, 16), 'Auth tag must be 16-byte base64'),
    ciphertext: z.string().min(1).max(1_000_000),
    tenantId: z.string().uuid(),
    context: z.string().min(1).max(256),
  })
  .strict();

export const CareerGraphFactInputSchema = z
  .object({
    factKey: FactKeySchema,
    valueEnvelope: EncryptedFactEnvelopeSchema,
    source: z
      .object({
        kind: z.enum(['user_input', 'document', 'integration', 'import']),
        reference: z.string().max(512).optional(),
        evidenceSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict(),
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
 * Validates a fact before persistence. It deliberately accepts only an authenticated
 * tenant-scoped encrypted envelope; plaintext fact values are not part of this API.
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
