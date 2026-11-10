import { describe, expect, it } from 'vitest';
import { getNextTeleprompterIndex } from '../src/utils/teleprompter';

describe('getNextTeleprompterIndex', () => {
  it('advances through remaining queue items', () => {
    expect(getNextTeleprompterIndex(0, 3)).toBe(1);
    expect(getNextTeleprompterIndex(1, 3)).toBe(2);
  });

  it('returns null at the final item or for an empty queue', () => {
    expect(getNextTeleprompterIndex(2, 3)).toBeNull();
    expect(getNextTeleprompterIndex(0, 0)).toBeNull();
  });

  it('rejects invalid indices and queue lengths', () => {
    expect(getNextTeleprompterIndex(-1, 3)).toBeNull();
    expect(getNextTeleprompterIndex(3, 3)).toBeNull();
    expect(getNextTeleprompterIndex(0.5, 3)).toBeNull();
  });
});
