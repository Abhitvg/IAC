import { describe, expect, it } from 'vitest';
import { normalizePreferredLanguage, normalizeWindowOpacity } from '../src/utils/settings';

describe('normalizePreferredLanguage', () => {
  it.each([
    ['java', 'java'],
    ['Java', 'java'],
    [' PYTHON ', 'python'],
    ['C++', 'cpp'],
    ['C plus plus', 'cpp'],
    ['JavaScript', 'javascript'],
    ['JS', 'javascript'],
    ['TypeScript', 'typescript'],
    ['GoLang', 'go'],
    ['C#', 'csharp'],
    ['C-Sharp', 'csharp'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePreferredLanguage(input)).toBe(expected);
  });

  it('uses Java as a safe default for missing or unsupported legacy values', () => {
    expect(normalizePreferredLanguage(null)).toBe('java');
    expect(normalizePreferredLanguage(undefined)).toBe('java');
    expect(normalizePreferredLanguage('Ruby')).toBe('java');
    expect(normalizePreferredLanguage(42)).toBe('java');
  });
});

describe('window opacity settings', () => {
  it('clamps valid opacity values to the native window range', () => {
    expect(normalizeWindowOpacity(0.7)).toBe(0.7);
    expect(normalizeWindowOpacity(0)).toBe(0.12);
    expect(normalizeWindowOpacity(1.5)).toBe(1);
  });

  it('normalizes persisted strings and falls back for invalid values', () => {
    expect(normalizeWindowOpacity('0.55')).toBe(0.55);
    expect(normalizeWindowOpacity('not-a-number')).toBe(0.35);
    expect(normalizeWindowOpacity(Number.NaN, 0.5)).toBe(0.5);
  });
});
