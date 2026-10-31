/**
 * Website Change Detector
 * Computes deterministic content hashes and pinpoints additions, removals, and new claims
 * across crawl iterations without silently overwriting reviewed claims.
 */

import { CrawledPage, ContentDifference } from './websiteIngestionTypes';

export function computeSimpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function detectPageChanges(
  previousPages: CrawledPage[],
  newPages: CrawledPage[]
): ContentDifference[] {
  const diffs: ContentDifference[] = [];
  const prevMap = new Map<string, CrawledPage>(previousPages.map((p) => [p.canonicalUrl, p]));

  for (const newPage of newPages) {
    const prev = prevMap.get(newPage.canonicalUrl);
    if (!prev) {
      diffs.push({
        pageUrl: newPage.canonicalUrl,
        type: 'added',
        newHash: newPage.contentHash,
        addedText: newPage.cleanText.slice(0, 300),
        newClaims: newPage.extractedClaims,
      });
    } else if (prev.contentHash !== newPage.contentHash) {
      diffs.push({
        pageUrl: newPage.canonicalUrl,
        type: 'modified',
        previousHash: prev.contentHash,
        newHash: newPage.contentHash,
        addedText: `Content updated on ${newPage.canonicalUrl}`,
        newClaims: newPage.extractedClaims,
      });
    }
  }

  // Detect removed pages
  const newUrls = new Set(newPages.map((p) => p.canonicalUrl));
  for (const prev of previousPages) {
    if (!newUrls.has(prev.canonicalUrl)) {
      diffs.push({
        pageUrl: prev.canonicalUrl,
        type: 'removed',
        previousHash: prev.contentHash,
        removedText: prev.title,
        newClaims: [],
      });
    }
  }

  return diffs;
}

