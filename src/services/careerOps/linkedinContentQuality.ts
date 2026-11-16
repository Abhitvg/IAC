import lexicon from '../../../docs/linkedin-assist/humanizer/slop.json';

type LexiconEntry = { find: string; replace: string; family: string };
type Lexicon = {
  words: LexiconEntry[];
  phrases: LexiconEntry[];
  structures: { id: string; name: string; regex: string; fix: string }[];
};
const terms = lexicon as Lexicon;
const URL_RE = /(?:https?:\/\/|www\.)[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi;
const INVISIBLE =
  /[\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;
// ZWNJ and ZWJ are intentionally preserved because they are meaningful in Indic scripts and emoji.
const SPACES = /[\u00A0\u2002-\u2003\u2007\u2009\u202F]/gu;
const WORDS = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SENTENCE_RE = /[^.!?\n]+[.!?]*/g;
const CONTRACTIONS = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;
const PRONOUNS = /\b(i|me|my|mine|we|us|our|you|your)\b/gi;

export type ContentKind = 'post' | 'comment' | 'reply' | 'dm' | 'invite';
export type QualityVerdict = 'PASS' | 'REVIEW' | 'FLAGGED' | 'INSUFFICIENT_TEXT';
export interface QualityCheck {
  score: number | null;
  detail: string;
}
export interface LinkedInQualityReport {
  checks: {
    readability: QualityCheck;
    specificity: QualityCheck;
    stockLanguage: QualityCheck;
    typography: QualityCheck;
    voice: QualityCheck;
  };
  overall: number | null;
  verdict: QualityVerdict;
  weakestCheck: string | null;
  structuralFlags: string[];
  wordCount: number;
  contentKind: ContentKind;
}
export interface LexicalReplacement {
  find: string;
  replace: string;
  count: number;
}
export interface HumanizeResult {
  text: string;
  changes: string[];
  replacements: LexicalReplacement[];
  structuralFlags: string[];
}

export function getLinkedInCharacterLimit(kind: ContentKind): number | null {
  if (kind === 'invite') return 200;
  if (kind === 'dm') return 300;
  return null;
}

function mapOutsideUrls(input: string, transform: (part: string) => string): string {
  let cursor = 0;
  let output = '';
  for (const match of input.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    output += transform(input.slice(cursor, index)) + match[0];
    cursor = index + match[0].length;
  }
  return output + transform(input.slice(cursor));
}

function matchCase(source: string, replacement: string): string {
  if (!replacement) return '';
  if (source === source.toUpperCase() && /[A-Z]/.test(source)) return replacement.toUpperCase();
  if (/^\p{Lu}/u.test(source)) {
    return replacement[0].toLocaleUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function toJavaScriptRegex(source: string): string {
  // The upstream lexicon includes Python's inline case-insensitive flag and Unicode escapes.
  return source.replace(/\(\?i\)/g, '').replace(/\\U([0-9A-Fa-f]{8})/g, '\\u{$1}');
}

function sentenceLengths(text: string): number[] {
  return [...text.matchAll(SENTENCE_RE)]
    .map((match) => (match[0] ?? '').trim().split(/\s+/).filter(Boolean).length)
    .filter((length) => length > 2);
}

function structuralFlags(text: string): string[] {
  const flags: string[] = [];
  for (const item of terms.structures) {
    try {
      const pattern = new RegExp(toJavaScriptRegex(item.regex), 'gimu');
      if (pattern.test(text)) flags.push(item.name);
    } catch {
      // Ignore invalid third-party patterns instead of failing the editor.
    }
  }

  const bullets = text.match(/^\s*[-*•]\s+.+$/gm) ?? [];
  if (bullets.length >= 3) {
    const lengths = bullets.map((line) => line.trim().split(/\s+/).filter(Boolean).length);
    const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const variance = lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length;
    if (Math.sqrt(variance) < 1.6) {
      flags.push('Bullets have unusually uniform length; vary them only when it improves clarity.');
    }
  }

  const lengths = sentenceLengths(text);
  if (lengths.length >= 4) {
    const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const cv = mean
      ? Math.sqrt(lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length) /
        mean
      : 0;
    if (cv < 0.35) {
      flags.push('Sentence lengths are unusually uniform; vary the rhythm where natural.');
    }
  }
  return [...new Set(flags)];
}

export function humanizeLinkedInText(input: string): HumanizeResult {
  const changes: string[] = [];
  const replacementCounts = new Map<string, LexicalReplacement>();
  const entries = [...terms.phrases, ...terms.words].sort((a, b) => b.find.length - a.find.length);

  const text = mapOutsideUrls(input, (original) => {
    const before = original;
    let part = original.replace(INVISIBLE, '').replace(SPACES, ' ');
    part = part
      .replace(/\s*—\s*/g, ', ')
      .replace(/\s*–\s*(?=\d)/g, '-')
      .replace(/\s+–\s+/g, ', ')
      .replace(/–/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/·|•/g, '-')
      .replace(/→/g, '->');

    if (part !== before) changes.push('Normalized selected invisible characters and typography');

    for (const entry of entries) {
      if (!entry.find) continue;
      const pattern = new RegExp(
        '\\b' + entry.find.trim().split(/\s+/).map(escapeRegex).join('\\s+') + '\\b',
        'giu'
      );
      const found: string[] = [];
      part = part.replace(pattern, (match) => {
        found.push(match);
        return matchCase(match, entry.replace);
      });
      if (found.length) {
        const key = entry.find.toLowerCase();
        const current = replacementCounts.get(key);
        replacementCounts.set(key, {
          find: entry.find,
          replace: entry.replace,
          count: (current?.count ?? 0) + found.length,
        });
      }
    }

    return part
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^\s*([,.;:])\s*/gm, '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(
        /,\s*(also|so|still|basically|in the end),\s*/gi,
        (_match, connective: string) =>
          '. ' + connective[0].toUpperCase() + connective.slice(1) + ', '
      );
  });

  const replacements = [...replacementCounts.values()];
  if (replacements.length) {
    changes.push('Suggested plain-language replacements; review meaning and grammar');
  }
  const flags = structuralFlags(text);
  return {
    text: text.trim(),
    changes: [...new Set(changes)],
    replacements,
    structuralFlags: flags,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');');
}

function words(text: string): string[] {
  return text.match(WORDS) ?? [];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Maps a signal where a higher value is better onto a 0-100 scale. */
function scaleHigherIsBetter(value: number, human: number, machine: number): number {
  return human === machine ? 50 : clamp(((value - machine) / (human - machine)) * 100);
}

/** Maps a signal where a lower value is better onto a 0-100 scale. */
function scaleLowerIsBetter(value: number, human: number, machine: number): number {
  return machine === human ? 50 : clamp(((machine - value) / (machine - human)) * 100);
}

function properNameCount(text: string): number {
  const names = new Set<string>();
  for (const match of text.matchAll(/\b\p{Lu}[\p{Ll}]{2,}\b/gu)) {
    const index = match.index ?? 0;
    const before = text.slice(0, index);
    const lastBoundary = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      before.lastIndexOf('\n')
    );
    if (before.slice(lastBoundary + 1).trim()) names.add(match[0]);
  }
  return names.size;
}

export function scoreLinkedInText(
  text: string,
  contentKind: ContentKind = 'post'
): LinkedInQualityReport {
  const analysisText = text.replace(URL_RE, ' ');
  const tokens = words(analysisText);
  const sentenceList = sentenceLengths(analysisText);
  const enoughWords = tokens.length >= 25;
  const enoughSentences = sentenceList.length >= 4;
  const shortLimit = contentKind === 'post' ? 40 : contentKind === 'invite' ? 8 : 12;
  const wordCount = tokens.length;
  const mean = sentenceList.length
    ? sentenceList.reduce((sum, value) => sum + value, 0) / sentenceList.length
    : 0;
  const cv =
    mean && sentenceList.length >= 4
      ? Math.sqrt(
          sentenceList.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sentenceList.length
        ) / mean
      : null;

  const stockCount = [...terms.words, ...terms.phrases].reduce((sum, entry) => {
    const pattern = new RegExp(
      '\\b' + entry.find.trim().split(/\s+/).map(escapeRegex).join('\\s+') + '\\b',
      'giu'
    );
    return sum + [...analysisText.matchAll(pattern)].length;
  }, 0);
  const stockDensity = wordCount ? (stockCount * 100) / wordCount : 0;

  const formatCharacters = [...analysisText].filter(
    (character) => /\p{Cf}/u.test(character) && character !== '\u200C' && character !== '\u200D'
  ).length;
  const emDashes = (analysisText.match(/—/g) ?? []).length;
  const curlyQuotes = (analysisText.match(/[‘’“”]/g) ?? []).length;
  const ellipses = (analysisText.match(/…/g) ?? []).length;
  const hardSpaces = (analysisText.match(/[\u00A0\u202F\u2009]/g) ?? []).length;
  const fingerprintWeight =
    formatCharacters * 4 + emDashes * 2 + curlyQuotes + ellipses + hardSpaces;
  const fingerprintPerThousand = (fingerprintWeight * 1000) / Math.max(analysisText.length, 1);

  const contractionsPerHundred =
    ((analysisText.match(CONTRACTIONS) ?? []).length * 100) / Math.max(wordCount, 1);
  const pronounsPerHundred =
    ((analysisText.match(PRONOUNS) ?? []).length * 100) / Math.max(wordCount, 1);
  const flags = structuralFlags(analysisText);
  const uniformBulletFlag = flags.some((flag) => flag.startsWith('Bullets have unusually uniform'));

  const readabilityScore = cv === null ? null : Math.round(scaleHigherIsBetter(cv, 0.7, 0.22));
  const concreteMarkers =
    (analysisText.match(/\b\d[\d,.]*(?:%|\b)|\$\d/g) ?? []).length + properNameCount(analysisText);
  const specificityDensity = (concreteMarkers * 100) / Math.max(wordCount, 1);
  const specificityScore = enoughWords
    ? Math.round(scaleHigherIsBetter(specificityDensity, 6, 0.5))
    : null;
  const stockScore = wordCount ? Math.round(scaleLowerIsBetter(stockDensity, 0, 4)) : null;
  const typographyScore = analysisText.trim()
    ? Math.round(scaleLowerIsBetter(fingerprintPerThousand, 0, 12))
    : null;
  const voiceScore = enoughWords
    ? Math.round(
        clamp(
          scaleHigherIsBetter(contractionsPerHundred, 3, 0) * 0.35 +
            scaleHigherIsBetter(pronounsPerHundred, 8, 1) * 0.35 +
            clamp(100 - flags.length * 22) * 0.3 -
            (uniformBulletFlag ? 12 : 0)
        )
      )
    : null;

  const checks = {
    readability: {
      score: readabilityScore,
      detail:
        cv === null
          ? 'Need at least four complete sentences to assess sentence-length variation.'
          : 'Sentence-length variation: ' +
            cv.toFixed(2) +
            '. This is a rough rhythm signal, not a readability grade.',
    },
    specificity: {
      score: specificityScore,
      detail: enoughWords
        ? concreteMarkers +
          ' number/name markers, ' +
          specificityDensity.toFixed(1) +
          ' per 100 words. Verify that each marker is relevant and true.'
        : 'Need at least 25 words to assess numbers and proper-name signals.',
    },
    stockLanguage: {
      score: stockScore,
      detail: stockCount + ' lexicon matches, ' + stockDensity.toFixed(1) + ' per 100 words.',
    },
    typography: {
      score: typographyScore,
      detail:
        formatCharacters +
        ' format characters, ' +
        emDashes +
        ' em dashes, ' +
        curlyQuotes +
        ' curly quotes, ' +
        ellipses +
        ' ellipses, ' +
        hardSpaces +
        ' hard spaces.',
    },
    voice: {
      score: voiceScore,
      detail: enoughWords
        ? contractionsPerHundred.toFixed(1) +
          ' contractions and ' +
          pronounsPerHundred.toFixed(1) +
          ' personal pronouns per 100 words; ' +
          flags.length +
          ' structural flag(s).'
        : 'Need at least 25 words to assess voice signals.',
    },
  };

  const values = Object.values(checks)
    .map((check) => check.score)
    .filter((score): score is number => score !== null);
  const allSignalsAvailable = values.length === 5;
  const overall = allSignalsAvailable
    ? Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 0.6 +
          Math.min(...values) * 0.4
      )
    : null;
  const weakestCheck = allSignalsAvailable
    ? (Object.entries(checks).sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0))[0]?.[0] ?? null)
    : null;
  const enoughText = wordCount >= Math.max(shortLimit, 25) && enoughSentences;
  const verdict: QualityVerdict =
    !enoughText || overall === null
      ? 'INSUFFICIENT_TEXT'
      : overall >= 70 && Math.min(...values) >= 55
        ? 'PASS'
        : overall >= 50
          ? 'REVIEW'
          : 'FLAGGED';

  return {
    checks,
    overall,
    verdict,
    weakestCheck,
    structuralFlags: flags,
    wordCount,
    contentKind,
  };
}
