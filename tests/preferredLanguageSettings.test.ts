import { describe, expect, it } from 'vitest';
import { normalizePreferredLanguage } from '../src/utils/settings';

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
