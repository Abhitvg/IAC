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

  // Treat Markdown structure as meaningful boundaries. Never split a sentence
  // into arbitrary word-count fragments: the HUD must preserve complete ideas.
  const lines = prose
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .split('\n');

  const bullets: BionicGazeBullet[] = [];
  let bulletIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Keep each table row intact. The full Markdown table remains available in
    // the complete-answer disclosure below the glanceable summary.
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line)) continue;

    const isTableRow = line.includes('|') && /^\|?.+\|.+\|?$/.test(line);
    const isHeading = /^#{1,6}\s+/.test(line);
    const isListItem = /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
    const cleanLine = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '')
      .replace(/[*_`]/g, '')
      .trim();

    if (!cleanLine) continue;

    // A table row is one indivisible record; do not split its cells into
    // disconnected "glance" fragments.
    const logicalUnits =
      isTableRow || isHeading || isListItem
        ? [cleanLine]
        : cleanLine.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((part) => part.trim());

    for (const unit of logicalUnits) {
      if (!unit) continue;
      const words = unit.split(/\s+/).filter(Boolean);
      bullets.push({
        id: `gaze-${bulletIndex++}`,
        text: unit,
        metricChip: isTableRow ? undefined : findFirstMetric(unit),
        highlightWords: words.slice(0, 2),
      });
    }
  }

  return bullets;
}

export const BIONIC_PRIMARY_BULLET_LIMIT = 7;

const HIGH_SIGNAL_BULLET =
  /\b(trade[- ]?off|however|limitation|risk|edge case|failure|security|latency|cost|conclusion|therefore|finally|overall|in summary|complexity|fallback|recovery|scalab|availability|consistency|durability|monitoring|observability)\b/i;

export function selectPrimaryGlanceableBullets(bullets: BionicGazeBullet[]): {
  primary: BionicGazeBullet[];
  remaining: BionicGazeBullet[];
} {
  if (bullets.length <= BIONIC_PRIMARY_BULLET_LIMIT) {
    return { primary: bullets, remaining: [] };
  }

  const selectedIndexes = new Set<number>();
  const addIndex = (index: number) => {
    if (index >= 0 && index < bullets.length && selectedIndexes.size < BIONIC_PRIMARY_BULLET_LIMIT) {
      selectedIndexes.add(index);
    }
  };

  // Prioritise the opening answer, then reserve space for the ending and
  // high-signal engineering details without changing their original order.
  for (let index = 0; index < Math.min(3, bullets.length); index += 1) addIndex(index);

  for (let index = Math.max(4, bullets.length - 2); index < bullets.length; index += 1) {
    addIndex(index);
  }

  for (let index = 4; index < bullets.length - 2; index += 1) {
    if (bullets[index].metricChip || HIGH_SIGNAL_BULLET.test(bullets[index].text)) {
      addIndex(index);
    }
  }

  for (let index = 4; index < bullets.length && selectedIndexes.size < BIONIC_PRIMARY_BULLET_LIMIT; index += 1) {
    addIndex(index);
  }

  const primary = [...selectedIndexes].sort((a, b) => a - b).map((index) => bullets[index]);
  const remaining = bullets.filter((_, index) => !selectedIndexes.has(index));
  return { primary, remaining };
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
