import type { ProgrammingLanguage } from '../types';

const LANGUAGE_ALIASES: Record<string, ProgrammingLanguage> = {
  java: 'java',
  python: 'python',
  cpp: 'cpp',
  'c++': 'cpp',
  'c plus plus': 'cpp',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  go: 'go',
  golang: 'go',
  csharp: 'csharp',
  'c#': 'csharp',
  'c sharp': 'csharp',
  'c-sharp': 'csharp',
};

/** Normalize legacy display labels and persisted values to the settings select's canonical IDs. */
export function normalizePreferredLanguage(value: unknown): ProgrammingLanguage {
  if (typeof value !== 'string') return 'java';
  return LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? 'java';
}
