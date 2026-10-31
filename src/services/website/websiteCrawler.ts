/**
 * Asynchronous, Rate-Limited Same-Origin Website Crawler
 * Enforces SSRF constraints, manual redirect verification, streaming byte caps,
 * depth and page bounds, content-type allowlists, and reports fine-grained progress.
 */

import { CrawledPage, CrawlProgress } from './websiteIngestionTypes';
import { validateAndNormalizeUrlAsync } from './urlSafetyPolicy';
import { extractCleanHtmlContent } from './htmlContentExtractor';
import { classifyPage } from './pageClassifier';
import { computeSimpleHash } from './websiteChangeDetector';

export interface CrawlerOptions {
  seedUrl: string;
  sourceId: string;
  maxPages?: number;
  maxDepth?: number;
  requestTimeoutMs?: number;
  maxByteSize?: number;
  delayMs?: number;
  onProgress?: (progress: CrawlProgress) => void;
}

const MAX_REDIRECT_HOPS = 5;

/**
 * Streams response body chunk-by-chunk and aborts immediately if max bytes exceeded.
 */
async function readStreamWithByteLimit(
  response: Response,
  maxByteSize: number,
  signal: AbortSignal
): Promise<string> {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let totalBytes = 0;
  let result = '';

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error('Crawl request timed out or aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxByteSize) {
          await reader.cancel('Response exceeded maximum size limit');
          throw new Error(`Response payload exceeded maximum limit of ${maxByteSize} bytes`);
        }
        result += decoder.decode(value, { stream: true });
      }
    }
    result += decoder.decode();
    return result;
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

export class WebsiteCrawler {
  public static async crawl(options: CrawlerOptions): Promise<CrawledPage[]> {
    const {
      seedUrl,
      sourceId,
      maxPages = 10,
      maxDepth = 2,
      requestTimeoutMs = 8000,
      maxByteSize = 1024 * 1024, // 1MB
      delayMs = 150,
      onProgress,
    } = options;

    const validation = await validateAndNormalizeUrlAsync(seedUrl);
    if (!validation.safe || !validation.normalizedUrl) {
      throw new Error(`Invalid or unsafe seed URL: ${validation.reason}`);
    }

    const startUrl = validation.normalizedUrl;
    const allowedOrigin = new URL(startUrl).origin;
    const crawledPages: CrawledPage[] = [];
    const visitedUrls = new Set<string>();

    interface QueueItem {
      url: string;
      depth: number;
    }

    const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];
    visitedUrls.add(startUrl);

    let pagesCrawled = 0;
    let pagesSkipped = 0;
    let pagesFailed = 0;

    const report = (status: CrawlProgress['status'], currentUrl?: string, error?: string) => {
      onProgress?.({
        sourceId,
        targetDomain: new URL(startUrl).hostname,
        status,
        pagesDiscovered: queue.length + crawledPages.length + pagesFailed + pagesSkipped,
        pagesCrawled,
        pagesSkipped,
        pagesFailed,
        currentUrl,
        error,
      });
    };

    report('crawling', startUrl);

    while (queue.length > 0 && pagesCrawled < maxPages) {
      const item = queue.shift()!;
      if (item.depth > maxDepth) {
        pagesSkipped++;
        continue;
      }

      report('crawling', item.url);

      try {
        let currentUrl = item.url;
        let redirectHops = 0;
        const redirectHistory = new Set<string>([currentUrl]);
        let response: Response | null = null;
        let html = '';

        // Follow manual redirects with validation on every hop
        while (redirectHops <= MAX_REDIRECT_HOPS) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

          try {
            response = await fetch(currentUrl, {
              method: 'GET',
              redirect: 'manual',
              signal: controller.signal,
              headers: {
                'User-Agent':
                  'IAC-InterviewAssistant/1.0 (+https://github.com/Abhitvg/IAC; Candidate Research)',
                Accept: 'text/html,application/xhtml+xml',
              },
            });
          } finally {
            clearTimeout(timeoutId);
          }

          // Handle redirects manually to prevent SSRF bypass and redirect loops
          if (
            response.status === 301 ||
            response.status === 302 ||
            response.status === 303 ||
            response.status === 307 ||
            response.status === 308
          ) {
            redirectHops++;
            const location = response.headers.get('location');
            if (!location) {
              throw new Error(`Redirect response (${response.status}) missing Location header`);
            }

            const targetUrl = new URL(location, currentUrl).toString();
            const targetValidation = await validateAndNormalizeUrlAsync(targetUrl, allowedOrigin);

            if (!targetValidation.safe || !targetValidation.normalizedUrl) {
              throw new Error(`Unsafe redirect destination blocked: ${targetValidation.reason}`);
            }

            if (redirectHistory.has(targetValidation.normalizedUrl)) {
              throw new Error(`Redirect loop detected: ${targetValidation.normalizedUrl}`);
            }

            currentUrl = targetValidation.normalizedUrl;
            redirectHistory.add(currentUrl);
            continue;
          }

          break;
        }

        if (!response || !response.ok) {
          pagesFailed++;
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          pagesSkipped++;
          continue;
        }

        const streamController = new AbortController();
        const streamTimeout = setTimeout(() => streamController.abort(), requestTimeoutMs);
        try {
          html = await readStreamWithByteLimit(response, maxByteSize, streamController.signal);
        } finally {
          clearTimeout(streamTimeout);
        }

        if (!html || html.length === 0) {
          pagesSkipped++;
          continue;
        }

        const extracted = extractCleanHtmlContent(html, currentUrl, sourceId);
        const classification = classifyPage(currentUrl, extracted.title, extracted.cleanText);
        const hash = computeSimpleHash(extracted.cleanText);

        const pageRecord: CrawledPage = {
          url: currentUrl,
          canonicalUrl: currentUrl,
          title: extracted.title || currentUrl,
          classification,
          htmlContent: html.slice(0, 50000), // Bounded HTML storage
          cleanText: extracted.cleanText,
          contentHash: hash,
          statusCode: response.status,
          fetchedAt: Date.now(),
          byteSize: html.length,
          outboundLinks: extracted.outboundLinks,
          extractedClaims: extracted.claims,
        };

        crawledPages.push(pageRecord);
        pagesCrawled++;

        // Enqueue discovered same-origin links
        if (item.depth < maxDepth && pagesCrawled < maxPages) {
          for (const link of extracted.outboundLinks) {
            const check = await validateAndNormalizeUrlAsync(link, allowedOrigin);
            if (check.safe && check.normalizedUrl && !visitedUrls.has(check.normalizedUrl)) {
              visitedUrls.add(check.normalizedUrl);
              queue.push({ url: check.normalizedUrl, depth: item.depth + 1 });
            }
          }
        }

        // Bounded delay between requests
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err: any) {
        pagesFailed++;
        console.warn(`[WebsiteCrawler] Crawl failed for ${item.url}:`, err?.message || err);
      }
    }

    report('completed');
    return crawledPages;
  }
}
