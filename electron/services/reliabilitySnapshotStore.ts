export interface ReliabilitySnapshotSummary {
  eventCount: number;
  requestCount: number;
  terminalRequestCount: number;
  unresolvedRequestCount: number;
  succeeded: number;
  failed: number;
  blocked: number;
  aborted: number;
  rateLimited: number;
  timeoutCount: number;
  partialOutputRecoveryCount: number;
  successRate: number | null;
  transcription: { success: number; empty: number; failed: number; aborted: number };
  audioCapture: { started: number; stopped: number; failed: number; aborted: number };
  sessionSave: { success: number; failed: number };
  byProviderModel: Array<{
    provider: string;
    model: string;
    requests: number;
    succeeded: number;
    failed: number;
    blocked: number;
    aborted: number;
    rateLimited: number;
    unresolved: number;
    successRate: number | null;
  }>;
}

export interface PersistedReliabilitySnapshot {
  id: string;
  createdAt: number;
  summary: ReliabilitySnapshotSummary;
}

const MAX_COUNT = 1_000_000;
const MAX_GROUPS = 20;
const MAX_SNAPSHOTS = 30;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MODEL_IDENTIFIER = /^[A-Za-z0-9._:/-]{1,160}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_COUNT;
}

function isRate(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
}

function validateCounterRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, number> {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key) && isCount(value[key]))
  );
}

export function validateReliabilitySnapshotSummary(
  value: unknown
): value is ReliabilitySnapshotSummary {
  if (!isRecord(value)) return false;
  const countKeys = [
    'eventCount',
    'requestCount',
    'terminalRequestCount',
    'unresolvedRequestCount',
    'succeeded',
    'failed',
    'blocked',
    'aborted',
    'rateLimited',
    'timeoutCount',
    'partialOutputRecoveryCount',
  ] as const;
  if (!countKeys.every((key) => isCount(value[key]))) return false;
  if (!isRate(value.successRate)) return false;
  if (!validateCounterRecord(value.transcription, ['success', 'empty', 'failed', 'aborted'])) {
    return false;
  }
  if (!validateCounterRecord(value.audioCapture, ['started', 'stopped', 'failed', 'aborted'])) {
    return false;
  }
  if (!validateCounterRecord(value.sessionSave, ['success', 'failed'])) return false;
  if (!Array.isArray(value.byProviderModel) || value.byProviderModel.length > MAX_GROUPS) {
    return false;
  }
  return value.byProviderModel.every((group) => {
    if (!isRecord(group)) return false;
    return (
      typeof group.provider === 'string' &&
      MODEL_IDENTIFIER.test(group.provider) &&
      typeof group.model === 'string' &&
      MODEL_IDENTIFIER.test(group.model) &&
      isCount(group.requests) &&
      isCount(group.succeeded) &&
      isCount(group.failed) &&
      isCount(group.blocked) &&
      isCount(group.aborted) &&
      isCount(group.rateLimited) &&
      isCount(group.unresolved) &&
      isRate(group.successRate) &&
      Object.keys(group).length === 10
    );
  });
}

export function createReliabilitySnapshot(
  summary: unknown,
  id: string,
  createdAt: number
): PersistedReliabilitySnapshot {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    throw new Error('Invalid reliability snapshot identifier.');
  }
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
    throw new Error('Invalid reliability snapshot timestamp.');
  }
  if (!validateReliabilitySnapshotSummary(summary)) {
    throw new Error('Invalid or unsafe reliability snapshot payload.');
  }
  return { id, createdAt, summary };
}

export function normalizeReliabilitySnapshots(
  value: unknown,
  now: number = Date.now()
): PersistedReliabilitySnapshot[] {
  if (!Array.isArray(value)) return [];
  const cutoff = now - MAX_AGE_MS;
  const valid = value.filter((item): item is PersistedReliabilitySnapshot => {
    if (!isRecord(item) || typeof item.id !== 'string' || !Number.isSafeInteger(item.createdAt)) {
      return false;
    }
    if (Number(item.createdAt) < cutoff || Number(item.createdAt) > now + 60_000) return false;
    return validateReliabilitySnapshotSummary(item.summary);
  });
  return valid
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SNAPSHOTS);
}

export const RELIABILITY_SNAPSHOT_LIMIT = MAX_SNAPSHOTS;
