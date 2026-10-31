/**
 * Safe HTML Content Extractor
 * Extracts readable plain text, titles, outbound links, and candidate claims from HTML
 * without executing client scripts or rendering untrusted markup.
 */

import { ExtractedClaim } from '../ingestion/types';
import { extractExplicitMetrics } from '../ingestion/claimNormalizer';

export interface ExtractedHtmlContent {
  title: string;
  cleanText: string;
  outboundLinks: string[];
  claims: ExtractedClaim[];
}

export function extractCleanHtmlContent(
  html: string,
  pageUrl: string,
  sourceId: string
): ExtractedHtmlContent {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Extract all outbound anchor hrefs before stripping tags
  const outboundLinks: string[] = [];
  const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi;
  let linkMatch;
  while ((linkMatch = anchorRegex.exec(html)) !== null) {
    const rawHref = linkMatch[2].trim();
    if (rawHref && !rawHref.startsWith('#') && !rawHref.startsWith('javascript:') && !rawHref.startsWith('mailto:')) {
      try {
        const resolved = new URL(rawHref, pageUrl).toString();
        if (!outboundLinks.includes(resolved)) {
          outboundLinks.push(resolved);
        }
      } catch {}
    }
  }

  // Strip non-content blocks: script, style, noscript, svg, nav, footer
  let sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');

  // Replace block elements with newlines
  sanitized = sanitized
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  sanitized = sanitized.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  sanitized = sanitized
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Normalize whitespace
  const cleanLines = sanitized
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2);

  const cleanText = cleanLines.join('\n');

  // Extract candidate claims tagged as WEBSITE_REPORTED
  const claims: ExtractedClaim[] = [];
  let claimSeq = 1;

  for (const line of cleanLines) {
    // Look for personal statements or project achievements
    const isPersonalClaim = /\b(I built|I designed|I created|I developed|My role|I led|Created|Architected|Engineered)\b/i.test(line);
    const metrics = extractExplicitMetrics(line);

    if (isPersonalClaim || metrics.length > 0) {
      claims.push({
        claimId: `claim-web-${sourceId}-${claimSeq++}`,
        candidateId: 'active-candidate',
        sourceId,
        sourceType: 'website_page',
        fieldName: metrics.length > 0 ? 'website.project_metric' : 'website.experience_claim',
        rawText: line,
        normalizedValue: metrics.length > 0 ? metrics : line,
        sourceLocation: { url: pageUrl },
        extractionMethod: 'heuristic_nlp',
        extractionConfidence: 0.75, // Website claim parsed with high fidelity
        evidenceStatus: 'WEBSITE_REPORTED', // Explicitly website reported, NOT independently verified
        reviewStatus: 'pending_review',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parserVersion: '2.0.0',
      });
    }
  }

  return {
    title,
    cleanText,
    outboundLinks,
    claims,
  };
}

