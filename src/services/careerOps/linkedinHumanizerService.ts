/**
 * LinkedIn Humanizer & Anti-AI Slop Service
 * Ported from avi691/linkedin-agent-skill (MIT License)
 *
 * Provides:
 * 1. passInvisible: Strips zero-width chars, BOM, format artifacts that betray machine generation.
 * 2. passTypographic: Normalizes em-dashes, en-dashes, curly quotes, ellipses.
 * 3. passLexical: Replaces 113 corporate AI buzzwords with natural, direct language.
 * 4. scoreHumanText: 5-check human score panel (Burstiness, Specificity, Slop Density, Fingerprint, Voice).
 */

import {
  INVISIBLE_CHAR_RULES,
  TYPOGRAPHIC_RULES,
  LEXICAL_RULES,
  STRUCTURAL_TELL_RULES,
  PROVEN_HOOK_FORMULAS,
  LINKEDIN_PROFILE_RUBRIC,
  HookFormula,
  ProfileRubricItem,
} from './linkedinHumanizerData';

export interface HumanizeHit {
  category: 'invisible' | 'typographic' | 'lexical';
  name: string;
  count: number;
  replacement?: string;
}

export interface StructuralTellHit {
  id: string;
  name: string;
  count: number;
  fix: string;
}

export interface HumanizeReport {
  originalLength: number;
  cleanedLength: number;
  invisibleHits: HumanizeHit[];
  typographicHits: HumanizeHit[];
  lexicalHits: HumanizeHit[];
  structuralTells: StructuralTellHit[];
  totalArtifactsRemoved: number;
}

export interface CheckScore {
  score: number; // 0 - 100
  metric: string;
}

export interface HumanScoreReport {
  overallScore: number; // 0 - 100
  verdict: 'PASS' | 'REVIEW' | 'FLAGGED';
  burstiness: CheckScore;
  specificity: CheckScore;
  slopDensity: CheckScore;
  fingerprint: CheckScore;
  voice: CheckScore;
  structuralTells: StructuralTellHit[];
}

const URL_REGEX = /https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g;
const SENTENCE_REGEX = /[^.!?\n]+[.!?]*/g;
const WORD_REGEX = /[A-Za-z']+/g;
const CONTRACTIONS_REGEX = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;
const PRONOUNS_REGEX = /\b(i|me|my|mine|we|us|our|you|your)\b/gi;
const NUMBERS_REGEX = /\b\d[\d,.]*%?\b|\$\d/g;
const PROPER_NOUN_REGEX = /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function scaleScore(value: number, humanTarget: number, machineBaseline: number): number {
  if (humanTarget === machineBaseline) return 50;
  return clamp(((value - machineBaseline) / (humanTarget - machineBaseline)) * 100);
}

function matchCase(source: string, replacement: string): string {
  if (!replacement) return replacement;
  if (source === source.toUpperCase() && source.length > 1) {
    return replacement.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export class LinkedInHumanizerService {
  private static instance: LinkedInHumanizerService;

  public static getInstance(): LinkedInHumanizerService {
    if (!LinkedInHumanizerService.instance) {
      LinkedInHumanizerService.instance = new LinkedInHumanizerService();
    }
    return LinkedInHumanizerService.instance;
  }

  /**
   * Passes text through the 3-step cleaning pipeline:
   * 1. Invisible characters -> deleted or single-spaced
   * 2. Typographic mechanical tells -> human keyboard characters
   * 3. Lexical slop -> direct plain English
   */
  public humanize(rawText: string): { cleanText: string; report: HumanizeReport } {
    if (!rawText || !rawText.trim()) {
      return {
        cleanText: '',
        report: {
          originalLength: 0,
          cleanedLength: 0,
          invisibleHits: [],
          typographicHits: [],
          lexicalHits: [],
          structuralTells: [],
          totalArtifactsRemoved: 0,
        },
      };
    }

    const originalLength = rawText.length;
    const urlPlaceholders: string[] = [];

    // 0. Protect URLs from being rewritten
    let text = rawText.replace(URL_REGEX, (match) => {
      urlPlaceholders.push(match);
      return `\u0000URL${urlPlaceholders.length - 1}\u0000`;
    });

    // 1. Invisible characters pass
    const invisibleHits: HumanizeHit[] = [];
    for (const rule of INVISIBLE_CHAR_RULES) {
      let regex: RegExp;
      if (rule.cp.includes('-')) {
        const [start, end] = rule.cp.split('-');
        const s = parseInt(start.slice(2), 16);
        const e = parseInt(end.slice(2), 16);
        regex = new RegExp(`[\\u{${s.toString(16)}}-\\u{${e.toString(16)}}]`, 'gu');
      } else {
        const code = parseInt(rule.cp.slice(2), 16);
        regex = new RegExp(String.fromCodePoint(code), 'gu');
      }

      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        invisibleHits.push({
          category: 'invisible',
          name: `${rule.cp} ${rule.name}`,
          count: matches.length,
          replacement: rule.action === 'delete' ? '' : ' ',
        });
        text = text.replace(regex, rule.action === 'delete' ? '' : ' ');
      }
    }

    // 2. Typographic pass
    const typographicHits: HumanizeHit[] = [];
    for (const rule of TYPOGRAPHIC_RULES) {
      const ch = rule.from;
      if (text.includes(ch)) {
        const count = text.split(ch).length - 1;
        typographicHits.push({
          category: 'typographic',
          name: `${ch} ${rule.name}`,
          count,
          replacement: rule.to,
        });

        if (ch === '—') {
          text = text.replace(/\s*—\s*/g, ', ');
        } else if (ch === '–') {
          text = text.replace(/\s*–\s*(?=\d)/g, '-');
          text = text.replace(/\s+–\s+/g, ', ');
          text = text.replace(/–/g, '-');
        } else {
          text = text.split(ch).join(rule.to);
        }
      }
    }

    // Punctuation cleanups after typographic replacements
    text = text.replace(/,\s*([,.;:!?])/g, '$1');
    text = text.replace(/,\s*\n/g, '\n');

    // 3. Lexical slop replacement
    const lexicalHits: HumanizeHit[] = [];
    // Sort longest find first so compound phrases match before individual words
    const sortedLex = [...LEXICAL_RULES].sort((a, b) => b.find.length - a.find.length);

    for (const rule of sortedLex) {
      const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        lexicalHits.push({
          category: 'lexical',
          name: rule.find,
          count: matches.length,
          replacement: rule.replace || '(deleted)',
        });

        text = text.replace(regex, (match) => matchCase(match, rule.replace));
      }
    }

    // Post-lexical cleaning
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text.replace(/^[ \t]*([,.;:])\s*/gm, '');
    text = text.replace(/\s+([,.;:!?])/g, '$1');
    text = text.replace(/^[ \t]+$/gm, '');
    text = text.replace(/\n{3,}/g, '\n\n');

    // Splice promotion
    text = text.replace(
      /,\s*(also|so|still|basically|in the end)\s*,\s*/gi,
      (_, word) => `. ${word.charAt(0).toUpperCase() + word.slice(1)}, `
    );

    // 4. Restore protected URLs
    urlPlaceholders.forEach((url, i) => {
      text = text.replace(`\u0000URL${i}\u0000`, url);
    });

    const cleanText = text.trim();
    const structuralTells = this.scanStructuralTells(cleanText);

    const totalArtifactsRemoved =
      invisibleHits.reduce((acc, h) => acc + h.count, 0) +
      typographicHits.reduce((acc, h) => acc + h.count, 0) +
      lexicalHits.reduce((acc, h) => acc + h.count, 0);

    return {
      cleanText,
      report: {
        originalLength,
        cleanedLength: cleanText.length,
        invisibleHits,
        typographicHits,
        lexicalHits,
        structuralTells,
        totalArtifactsRemoved,
      },
    };
  }

  /**
   * Scans text for telltale AI structural patterns
   */
  public scanStructuralTells(text: string): StructuralTellHit[] {
    const hits: StructuralTellHit[] = [];

    for (const rule of STRUCTURAL_TELL_RULES) {
      try {
        const hasCaseInsensitive = rule.regex.startsWith('(?i)');
        const cleanPattern = rule.regex.replace(/^\(\?i\)/, '');
        const flags = hasCaseInsensitive ? 'gim' : 'gm';
        const regex = new RegExp(cleanPattern, flags);
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
          hits.push({
            id: rule.id,
            name: rule.name,
            count: matches.length,
            fix: rule.fix,
          });
        }
      } catch {
        // Skip invalid regexes
      }
    }

    // Sentence length uniformity check
    const rawSentences = (text.match(SENTENCE_REGEX) || [])
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length > 2);

    if (rawSentences.length >= 4) {
      const lengths = rawSentences.map((s) => s.split(/\s+/).length);
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / lengths.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;

      if (cv < 0.35) {
        hits.push({
          id: 'uniform-sentences',
          name: `Uniform sentence length (variation ${cv.toFixed(2)})`,
          count: lengths.length,
          fix: 'Vary sentence lengths hard. Break one sentence into 3 words. Let the next run long.',
        });
      }
    }

    return hits;
  }

  /**
   * Computes the 5-check human score panel (0 - 100) exactly matching detect.py
   */
  public scoreHumanText(text: string): HumanScoreReport {
    const clean = text.trim();
    if (!clean) {
      return {
        overallScore: 100,
        verdict: 'PASS',
        burstiness: { score: 100, metric: 'Empty draft' },
        specificity: { score: 100, metric: 'Empty draft' },
        slopDensity: { score: 100, metric: '0 slop hits' },
        fingerprint: { score: 100, metric: '0 mechanical fingerprints' },
        voice: { score: 100, metric: 'Natural cadence' },
        structuralTells: [],
      };
    }

    const sentences = (clean.match(SENTENCE_REGEX) || [])
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length > 2);

    const words = clean.match(WORD_REGEX) || [];

    // 1. Burstiness (Sentence variation)
    let burstinessScore = 50.0;
    let burstinessMetric = 'too short to judge';
    if (sentences.length >= 4) {
      const lens = sentences.map((s) => s.split(/\s+/).length);
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const variance = lens.reduce((acc, l) => acc + Math.pow(l - mean, 2), 0) / lens.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      burstinessScore = scaleScore(cv, 0.70, 0.22);
      burstinessMetric = `variation ${cv.toFixed(2)} across ${lens.length} sentences (want 0.55+)`;
    }

    // 2. Specificity (Numbers, specific nouns, concrete hooks)
    let specificityScore = 50.0;
    let specificityMetric = 'too short to judge';
    if (words.length >= 25) {
      const per100 = 100 / words.length;
      const hits = (clean.match(NUMBERS_REGEX) || []).length + new Set(clean.match(PROPER_NOUN_REGEX) || []).size;
      const density = hits * per100;
      specificityScore = scaleScore(density, 6.0, 0.5);
      specificityMetric = `${hits} concrete markers, ${density.toFixed(1)} per 100 words (want 4+)`;
    }

    // 3. Slop Density
    let slopHits = 0;
    const foundTerms: string[] = [];
    for (const rule of LEXICAL_RULES) {
      const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const matches = clean.match(new RegExp(`\\b${escaped}\\b`, 'gi'));
      if (matches) {
        slopHits += matches.length;
        foundTerms.push(rule.find);
      }
    }
    const slopDensity = words.length > 0 ? (slopHits * 100) / words.length : 0;
    const slopScore = scaleScore(slopDensity, 0.0, 4.0);
    const slopMetric = `${slopHits} stock terms, ${slopDensity.toFixed(1)} per 100 words`;

    // 4. Fingerprint (Invisible chars, em-dashes, curly quotes)
    let invisible = 0;
    for (let i = 0; i < clean.length; i++) {
      const code = clean.charCodeAt(i);
      // Zero width chars, BOM, format chars
      if (
        code === 0x200b ||
        code === 0x200c ||
        code === 0x200d ||
        code === 0x2060 ||
        code === 0xfeff ||
        code === 0x00ad
      ) {
        invisible++;
      }
    }
    const em = (clean.match(/—/g) || []).length;
    const curly = (clean.match(/[‘’“”]/g) || []).length;
    const ellip = (clean.match(/…/g) || []).length;
    const nbsp = (clean.match(/[\u00A0\u202F\u2009]/g) || []).length;
    const totalFingerprint = invisible * 4 + em * 2 + curly + ellip + nbsp;
    const per1k = (totalFingerprint * 1000) / Math.max(clean.length, 1);
    const fingerprintScore = scaleScore(per1k, 0.0, 12.0);
    const fingerprintMetric = `${invisible} invisible, ${em} em dash, ${curly} curly quote, ${ellip} ellipsis, ${nbsp} hard space`;

    // 5. Voice (Contractions, person, structural tells)
    let voiceScore = 50.0;
    let voiceMetric = 'too short to judge';
    const structuralTells = this.scanStructuralTells(clean);
    if (words.length >= 25) {
      const per100 = 100 / words.length;
      const contractions = (clean.match(CONTRACTIONS_REGEX) || []).length * per100;
      const person = (clean.match(PRONOUNS_REGEX) || []).length * per100;
      const tells = structuralTells.length;
      voiceScore =
        scaleScore(contractions, 3.0, 0.0) * 0.35 +
        scaleScore(person, 8.0, 1.0) * 0.35 +
        clamp(100 - tells * 22) * 0.30;
      voiceMetric = `${contractions.toFixed(1)} contractions, ${person.toFixed(1)} pronouns per 100w, ${tells} tells`;
    }

    const checkScores = [burstinessScore, specificityScore, slopScore, fingerprintScore, voiceScore];
    const meanScore = checkScores.reduce((a, b) => a + b, 0) / checkScores.length;
    const minScore = Math.min(...checkScores);
    const overallScore = Math.round(meanScore * 0.6 + minScore * 0.4);

    const verdict =
      overallScore >= 70 && minScore >= 55 ? 'PASS' : overallScore >= 50 ? 'REVIEW' : 'FLAGGED';

    return {
      overallScore,
      verdict,
      burstiness: { score: Math.round(burstinessScore), metric: burstinessMetric },
      specificity: { score: Math.round(specificityScore), metric: specificityMetric },
      slopDensity: { score: Math.round(slopScore), metric: slopMetric },
      fingerprint: { score: Math.round(fingerprintScore), metric: fingerprintMetric },
      voice: { score: Math.round(voiceScore), metric: voiceMetric },
      structuralTells,
    };
  }

  public getHookFormulas(): HookFormula[] {
    return PROVEN_HOOK_FORMULAS;
  }

  public getProfileRubric(): ProfileRubricItem[] {
    return LINKEDIN_PROFILE_RUBRIC;
  }
}
