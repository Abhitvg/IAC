import { createHash } from 'node:crypto';
import { SubmissionProofSchema, type SubmissionProof } from '../tracker';

export interface ProofCaptureInput {
  submissionId: string;
  submittedAt?: string;
  proofUrl?: string;
  payload: Record<string, unknown>;
  confirmationNumber?: string;
}

export function canonicalJsonString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonString).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonString(item)}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 'null';
  return serialized;
}

export function computePayloadSha256(payload: Record<string, unknown>): string {
  const canonical = canonicalJsonString(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Builds a cryptographically verifiable SubmissionProof object.
 * Guaranteed to satisfy the SubmissionProofSchema for application state transitions.
 */
export function buildSubmissionProof(input: ProofCaptureInput): SubmissionProof {
  const submittedAt = input.submittedAt || new Date().toISOString();
  const payloadSha256 = computePayloadSha256(input.payload);

  const proof: SubmissionProof = {
    submissionId: input.submissionId,
    submittedAt,
    ...(input.proofUrl ? { proofUrl: input.proofUrl } : {}),
    payloadSha256,
    ...(input.confirmationNumber ? { confirmationNumber: input.confirmationNumber } : {}),
  };

  return SubmissionProofSchema.parse(proof);
}
