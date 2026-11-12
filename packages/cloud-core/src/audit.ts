import { createHash } from 'node:crypto';

export interface AuditEventInput {
  tenantId: string;
  actorSubject: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditRecord extends AuditEventInput {
  previousHash: string | null;
  eventHash: string;
}

export interface AuditRepository {
  append(record: AuditRecord): Promise<void>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

export function hashAuditEvent(input: AuditEventInput, previousHash: string | null): string {
  return createHash('sha256')
    .update(stableJson({ ...input, previousHash }))
    .digest('hex');
}

export async function appendAuditEvent(
  repository: AuditRepository,
  input: AuditEventInput,
  previousHash: string | null
): Promise<AuditRecord> {
  if (
    !input.tenantId ||
    !input.actorSubject ||
    !input.action ||
    !input.entityType ||
    !input.entityId
  ) {
    throw new Error('Audit event identity fields are required');
  }
  if (input.action.length > 100 || input.entityType.length > 80 || input.entityId.length > 200) {
    throw new Error('Audit event field exceeds its maximum length');
  }
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (key.length > 64 || (typeof value === 'string' && value.length > 256)) {
      throw new Error('Audit metadata exceeds safe bounds');
    }
  }
  const record: AuditRecord = {
    ...input,
    previousHash,
    eventHash: hashAuditEvent(input, previousHash),
  };
  await repository.append(record);
  return record;
}

/**
 * Pseudonymizes an actor subject (e.g. candidate email or user id)
 * using a keyed SHA-256 hash with salt (M11 Item 6).
 */
export function pseudonymizeActor(actorSubject: string, salt = 'careerops_audit_salt'): string {
  if (actorSubject.startsWith('pseudo_')) return actorSubject;
  const hash = createHash('sha256')
    .update(`${salt}:${actorSubject}`)
    .digest('hex')
    .slice(0, 24);
  return `pseudo_${hash}`;
}

/**
 * Strips or hashes personal identifiers (emails, names) from audit metadata.
 */
export function pseudonymizeAuditMetadata(
  metadata?: Record<string, string | number | boolean | null>,
  salt = 'careerops_audit_salt'
): Record<string, string | number | boolean | null> {
  if (!metadata) return {};
  const cleaned: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      // Email pseudonymization
      const emailHash = createHash('sha256')
        .update(`${salt}:${value.toLowerCase()}`)
        .digest('hex')
        .slice(0, 20);
      cleaned[key] = `pseudo_eml_${emailHash}`;
    } else if (typeof value === 'string' && /(?:candidate|user|person)_[a-zA-Z0-9-]+/.test(value)) {
      const idHash = createHash('sha256')
        .update(`${salt}:${value}`)
        .digest('hex')
        .slice(0, 20);
      cleaned[key] = `pseudo_id_${idHash}`;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Creates a pseudonymized audit event input, masking personal identifiers before appending.
 */
export function createPseudonymizedAuditEvent(
  input: AuditEventInput,
  salt = 'careerops_audit_salt'
): AuditEventInput {
  return {
    ...input,
    actorSubject: pseudonymizeActor(input.actorSubject, salt),
    metadata: pseudonymizeAuditMetadata(input.metadata, salt),
  };
}
