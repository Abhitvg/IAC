/**
 * Untrusted Text Sanitizer & Prompt Injection Defense (H5)
 *
 * All external text (resumes, LinkedIn exports, GitHub descriptions,
 * job postings, email bodies) is untrusted data.
 *
 * This sanitizer enforces:
 * 1. Control character and null byte stripping
 * 2. Strict character length bounds
 * 3. Delimiter neutralization (preventing prompt escapes like [INST], <|im_start|>, <system>, etc.)
 * 4. Injection canary detection and neutralizing system override commands
 */

const PROMPT_INJECTION_PATTERNS = [
  /system\s*:\s*/gi,
  /<\|(?:im_start|im_end|endoftext|system|user|assistant)\|>/gi,
  /\[\/?(?:INST|SYS)\]/gi,
  /<\/?(?:system|instruction|prompt|context)>/gi,
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/gi,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/gi,
  /you\s+are\s+now\s+(?:a|an)\s+/gi,
  /\boutput\s+the\s+following\s+phrase\b/gi,
];

/**
 * Sanitizes untrusted external text.
 * Strips dangerous control characters and neutralizes prompt-injection triggers.
 */
export function sanitizeUntrustedText(text: string, maxLength = 10_000): string {
  if (typeof text !== 'string') {
    return '';
  }

  // 1. Remove null bytes and non-printable control characters except newline and tab
  let cleaned = text
    .replace(/\0/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();

  // 2. Bound length
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
  }

  // 3. Neutralize known prompt injection markers by defanging delimiters
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, () => '[defanged-injection-token]');
  }

  return cleaned;
}

/**
 * Helper to slugify arbitrary identifiers into factKey safe characters: [a-z0-9_.-]
 */
export function slugifyFactKey(prefix: string, rawName: string): string {
  const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const cleanName = rawName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  const key = `${cleanPrefix}.${cleanName || 'item'}`;
  return key.slice(0, 120);
}
