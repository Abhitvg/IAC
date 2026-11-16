import { describe, expect, it } from 'vitest';
import {
  createReliabilitySnapshot,
  normalizeReliabilitySnapshots,
  validateReliabilitySnapshotSummary,
} from '../electron/services/reliabilitySnapshotStore';

const summary = {
  eventCount: 8,
  requestCount: 2,
  terminalRequestCount: 2,
  unresolvedRequestCount: 0,
  succeeded: 1,
  failed: 1,
  blocked: 0,
  aborted: 0,
  rateLimited: 0,
  timeoutCount: 1,
  partialOutputRecoveryCount: 1,
  successRate: 0.5,
  transcription: { success: 2, empty: 0, failed: 0, aborted: 0 },
  audioCapture: { started: 1, stopped: 1, failed: 0, aborted: 0 },
  sessionSave: { success: 1, failed: 0 },
  byProviderModel: [
    {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      requests: 2,
      succeeded: 1,
      failed: 1,
      blocked: 0,
      aborted: 0,
      rateLimited: 0,
      unresolved: 0,
      successRate: 0.5,
    },
  ],
};

describe('persisted reliability snapshot validation', () => {
  it('accepts aggregate-only reliability data', () => {
    expect(validateReliabilitySnapshotSummary(summary)).toBe(true);
    expect(createReliabilitySnapshot(summary, 'snapshot_123', 1_800_000_000_000)).toEqual({
      id: 'snapshot_123',
      createdAt: 1_800_000_000_000,
      summary,
    });
  });

  it('rejects raw interview content and unexpected payload fields', () => {
    expect(
      validateReliabilitySnapshotSummary({
        ...summary,
        transcript: 'candidate speech must never be persisted here',
      })
    ).toBe(false);
    expect(
      validateReliabilitySnapshotSummary({
        ...summary,
        byProviderModel: [
          {
            ...summary.byProviderModel[0],
            question: 'raw interview question',
          },
        ],
      })
    ).toBe(false);
  });

  it('rejects invalid counts, rates, model identifiers, and excessive provider groups', () => {
    expect(validateReliabilitySnapshotSummary({ ...summary, failed: -1 })).toBe(false);
    expect(validateReliabilitySnapshotSummary({ ...summary, successRate: 1.2 })).toBe(false);
    expect(
      validateReliabilitySnapshotSummary({
        ...summary,
        byProviderModel: [{ ...summary.byProviderModel[0], model: '../secrets' }],
      })
    ).toBe(false);
    expect(
      validateReliabilitySnapshotSummary({
        ...summary,
        byProviderModel: Array.from({ length: 21 }, () => summary.byProviderModel[0]),
      })
    ).toBe(false);
  });

  it('retains only valid snapshots from the last 90 days, newest first, capped at 30', () => {
    const now = 1_800_000_000_000;
    const recent = Array.from({ length: 35 }, (_, index) => ({
      id: `snapshot_${index}`,
      createdAt: now - index * 1000,
      summary,
    }));
    const normalized = normalizeReliabilitySnapshots(
      [...recent, { id: 'old', createdAt: now - 91 * 24 * 60 * 60 * 1000, summary }, null],
      now
    );

    expect(normalized).toHaveLength(30);
    expect(normalized[0].id).toBe('snapshot_0');
    expect(normalized[29].id).toBe('snapshot_29');
  });
});
