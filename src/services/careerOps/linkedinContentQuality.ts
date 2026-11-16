import lexicon from '../../../docs/linkedin-assist/humanizer/slop.json';

type LexiconEntry = { find: string; replace: string; family: string };
type Lexicon = { words: LexiconEntry[]; phrases: LexiconEntry[]; structures: { id: string; name: string; regex: string; fix: string }[] };
const terms = lexicon as Lexicon;
const URL_RE = /(?:https?:\/\/|www\.)[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi;
const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u{E0000}-\u{E007F}]/gu;
const SPACES = /[\u00A0\u2002-\u2003\u2007\u2009\u202F]/gu;
const WORDS = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export type ContentKind = 'post' | 'comment' | 'reply' | 'dm';
export interface QualityCheck { score: number | null; detail: string; }
export interface LinkedInQualityReport {
  checks: { readability: QualityCheck; specificity: QualityCheck; stockLanguage: QualityCheck; typography: QualityCheck; voice: QualityCheck };
  overall: number | null;
  verdict: 'REVIEW' | 'INSUFFICIENT_TEXT';
  structuralFlags: string[];
  wordCount: number;
  contentKind: ContentKind;
}
export interface HumanizeResult { text: string; changes: string[]; structuralFlags: string[]; }

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
  if (/^\p{Lu}/u.test(source)) return replacement[0].toLocaleUpperCase() + replacement.slice(1);
  return replacement;
}
function toJavaScriptRegex(source: string): string {
  // The vendored lexicon uses Python's (?i) and \\UXXXXXXXX syntax.
  return source.replace(/\\(\?i\)/g, '').replace(/\\\\U([0-9A-Fa-f]{8})/g, '\\\\u{$1}');
}
function structuralFlags(text: string): string[] {
  const flags: string[] = [];
  for (const item of terms.structures) {
    try { if (new RegExp(toJavaScriptRegex(item.regex), 'gimu').test(text)) flags.push(item.name); } catch { /* ignore invalid lexicon pattern */ }
  }
  const bullets = text.match(/^\s*[-*•]\s+.+$/gm) ?? [];
  if (bullets.length >= 3) {
    const lengths = bullets.map((line) => line.trim().split(/\s+/).length);
    const mean = lengths.reduce((a,b)=>a+b,0) / lengths.length;
    const variance = lengths.reduce((a,b)=>a+(b-mean)**2,0) / lengths.length;
    if (Math.sqrt(variance) < 1.6) flags.push('Bullets have unusually uniform length; vary only if it improves clarity.');
  }
  return flags;
}
export function humanizeLinkedInText(input: string): HumanizeResult {
  const changes: string[] = [];
  let text = mapOutsideUrls(input, (part) => {
    const before = part;
    part = part.replace(INVISIBLE, '');
    part = part.replace(SPACES, ' ');
    part = part.replace(/—/g, ', ').replace(/–/g, '-')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
      .replace(/·|•/g, '-').replace(/→/g, '->');
    if (part !== before) changes.push('Normalized invisible characters and typography');
    const entries = [...terms.phrases, ...terms.words].sort((a,b)=>b.find.length-a.find.length);
    for (const entry of entries) {
      if (!entry.find) continue;
      const pattern = new RegExp('\\b' + entry.find.trim().split(/\s+/).map(escapeRegex).join('\\s+') + '\\b', 'giu');
      part = part.replace(pattern, (match) => { lexicalChanged = true; return matchCase(match, entry.replace); });
    }
    return part.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/\n{3,}/g, '\n\n');
  });
  const flags = structuralFlags(text);
  if (lexicalChanged) changes.push('Replaced stock phrases with plainer wording');
  return { text: text.trim(), changes: [...new Set(changes)], structuralFlags: flags };
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function words(text: string): string[] { return text.match(WORDS) ?? []; }
function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(s=>s.split(/\s+/).length>2); }
function scaled(value: number, good: number, bad: number): number { return Math.max(0, Math.min(100, (value-bad)/(good-bad)*100)); }
export function scoreLinkedInText(text: string, contentKind: ContentKind = 'post'): LinkedInQualityReport {
  const tokens = words(text);
  const sentenceList = sentences(text);
  const shortLimit = contentKind === 'post' ? 40 : 12;
  const enough = tokens.length >= shortLimit;
  const lens = sentenceList.map(s=>s.split(/\s+/).length);
  const mean = lens.length ? lens.reduce((a,b)=>a+b,0)/lens.length : 0;
  const cv = mean && lens.length > 1 ? Math.sqrt(lens.reduce((a,b)=>a+(b-mean)**2,0)/lens.length)/mean : null;
  const stockCount = [...terms.words, ...terms.phrases].reduce((sum,e)=>{
    const re = new RegExp('\\b'+e.find.trim().split(/\s+/).map(escapeRegex).join('\\s+')+'\\b','giu');
    return sum + [...text.matchAll(re)].length;
  },0);
  const invisible = (text.match(INVISIBLE) ?? []).length;
  const hardSpaces = (text.match(SPACES) ?? []).length;
  const typography = (text.match(/—/g)?.length ?? 0)*2 + (text.match(/[‘’“”…]/g)?.length ?? 0) + invisible*4 + hardSpaces;
  const contractions = (text.match(/\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi) ?? []).length;
  const pronouns = (text.match(/\b(i|me|my|mine|we|us|our|you|your)\b/gi) ?? []).length;
  const flags = structuralFlags(text);
  const checks = {
    readability: { score: cv === null || sentenceList.length < 2 ? null : Math.round(scaled(cv,0.55,0.12)), detail: cv === null ? 'Need at least two complete sentences.' : `Sentence-length variation: ${cv.toFixed(2)}.` },
    specificity: { score: enough ? Math.round(Math.min(100, (text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).length * 12)) : null, detail: enough ? 'Counts numeric references only; verify names, examples and claims manually. This is not a measure of truth or writing quality.' : `Need at least ${shortLimit} words for this content type.` },
    stockLanguage: { score: tokens.length ? Math.round(scaled(stockCount*100/tokens.length,0,4)) : null, detail: `${stockCount} stock-lexicon matches.` },
    typography: { score: Math.round(scaled(typography*1000/Math.max(text.length,1),0,12)), detail: `${invisible} invisible characters, ${hardSpaces} nonstandard spaces, ${typography} weighted typography markers.` },
    voice: { score: enough ? Math.round(Math.max(0,Math.min(100,50 + contractions*8 + pronouns*2 - flags.length*8))) : null, detail: enough ? `${contractions} contractions and ${pronouns} personal pronouns; review flags rather than adding them artificially.` : `Need at least ${shortLimit} words for this content type.` },
  };
  const values = Object.values(checks).map(c=>c.score).filter((v):v is number=>v!==null);
  return { checks, overall: values.length === 5 ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : null, verdict: enough ? 'REVIEW' : 'INSUFFICIENT_TEXT', structuralFlags: flags, wordCount: tokens.length, contentKind };
}
