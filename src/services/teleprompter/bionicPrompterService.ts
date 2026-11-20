import React from 'react';

/**
 * Bionic Prompter & Eye-Contact Gaze Service
 *
 * Formats spoken AI responses into glanceable, centered gaze triggers (<= 6 words)
 * and highlights key metrics, tech stacks, and Big-O complexities with bionic fixation.
 */

export interface BionicGazeBullet {
  id: string;
  phase?: 'Intuit' | 'Approach' | 'Complexity' | 'EdgeCase' | 'TradeOff' | 'Metric';
  text: string;
  metricChip?: string;
  highlightWords: string[];
}

/**
 * Metric & Technical Pattern Helper
 */
function findFirstMetric(text: string): string | undefined {
  const regex = /(?:\b\d+(?:\.\d+)?%|\b\d+[kKmMbB]?\s*(?:QPS|TPS|ms|seconds|min|hours|users|req\/s|rps|IOPS|GB|TB|MB|PB)\b|O\([1nNlogkK\s+*^]+\)|\bp99\b|\bp95\b|\bzero-downtime\b)/i;
  const match = text.match(regex);
  return match ? match[0] : undefined;
}

/**
 * Chunks continuous prose into centered glanceable gaze bullets (3-7 words each).
 */
export function extractGlanceableGazeBullets(prose: string): BionicGazeBullet[] {
  if (!prose || !prose.trim()) return [];

  // Split prose into meaningful sentences or clauses
  const rawSentences = prose
    .replace(/\r\n/g, '\n')
    .replace(/^#+\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('#') && !s.startsWith('```'));

  const bullets: BionicGazeBullet[] = [];
  let bulletIndex = 0;

  for (const sentence of rawSentences) {
    // Extract any metric chip if present in this sentence
    const sentenceMetric = findFirstMetric(sentence);

    // Clean sentence of markdown formatting for gaze display
    const cleanSentence = sentence.replace(/[*_`]/g, '').trim();

    // If the sentence is short (<= 7 words), it's already a perfect gaze trigger
    const words = cleanSentence.split(/\s+/).filter(Boolean);
    if (words.length <= 7) {
      bullets.push({
        id: `gaze-${bulletIndex++}`,
        text: cleanSentence,
        metricChip: sentenceMetric,
        highlightWords: words.slice(0, 2),
      });
      continue;
    }

    // Split longer sentences by commas, semicolons, or conjunctions
    const clauses = cleanSentence
      .split(/[,;]|\s+(?:and then|whereas|because|which allows|in order to|by utilizing)\s+/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    for (const clause of clauses) {
      const clauseWords = clause.split(/\s+/).filter(Boolean);
      const clauseMetric = findFirstMetric(clause) || sentenceMetric;
      if (clauseWords.length <= 7) {
        bullets.push({
          id: `gaze-${bulletIndex++}`,
          text: clause,
          metricChip: clauseMetric,
          highlightWords: clauseWords.slice(0, 2),
        });
      } else {
        // Chunk into 5-word micro-anchors
        for (let i = 0; i < clauseWords.length; i += 5) {
          const chunk = clauseWords.slice(i, i + 5).join(' ');
          if (chunk.trim()) {
            bullets.push({
              id: `gaze-${bulletIndex++}`,
              text: chunk,
              metricChip: findFirstMetric(chunk) || clauseMetric,
              highlightWords: clauseWords.slice(i, i + 2),
            });
          }
        }
      }
    }
  }

  return bullets.slice(0, 18); // Keep prompter glanceable and non-fatiguing
}

/**
 * Formats a word with bionic fixation: bolding the first 40-50% of characters.
 */
export function formatBionicWord(word: string): { bold: string; normal: string } {
  if (word.length <= 1) return { bold: word, normal: '' };
  if (word.length <= 3) return { bold: word.slice(0, 1), normal: word.slice(1) };
  const splitPoint = Math.ceil(word.length * 0.45);
  return {
    bold: word.slice(0, splitPoint),
    normal: word.slice(splitPoint),
  };
}

/**
 * Preserve the complete answer whenever the HUD cannot derive glanceable bullets.
 * This is especially important for code-only, heading-only, or otherwise sparse
 * historical answers.
 */
export interface BionicAnswerPresentation {
  bullets: BionicGazeBullet[];
  fallbackText: string | null;
}

export function getBionicAnswerPresentation(prose: string): BionicAnswerPresentation {
  const bullets = extractGlanceableGazeBullets(prose);
  return {
    bullets,
    fallbackText: bullets.length === 0 && prose.trim() ? prose : null,
  };
}
