import { describe, expect, it } from 'vitest';
import { resolveInterviewResponseMode } from '../src/utils/responseMode';

describe('interview response mode defaults', () => {
  it('defaults fresh installs to Interview mode', () => {
    expect(resolveInterviewResponseMode(null)).toBe('interview');
    expect(resolveInterviewResponseMode(undefined)).toBe('interview');
    expect(resolveInterviewResponseMode('')).toBe('interview');
  });

  it('preserves an explicitly saved supported mode', () => {
    expect(resolveInterviewResponseMode('interview')).toBe('interview');
    expect(resolveInterviewResponseMode('coding')).toBe('coding');
    expect(resolveInterviewResponseMode('quiz')).toBe('quiz');
    expect(resolveInterviewResponseMode('application')).toBe('application');
  });

  it('migrates stale or unsupported saved modes to Interview', () => {
    expect(resolveInterviewResponseMode('unknown')).toBe('interview');
  });
});
