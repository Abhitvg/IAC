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
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
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
  if (!input.tenantId || !input.actorSubject || !input.action || !input.entityType || !input.entityId) {
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
