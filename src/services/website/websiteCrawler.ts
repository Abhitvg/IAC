/**
 * Asynchronous, Rate-Limited Same-Origin Website Crawler
 * Enforces SSRF constraints, depth and page bounds, content-type allowlists,
 * and reports fine-grained progress.
 */

import { CrawledPage, CrawlProgress } from './websiteIngestionTypes';
import { validateAndNormalizeUrl } from './urlSafetyPolicy';
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

    const validation = validateAndNormalizeUrl(seedUrl);
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

        const response = await fetch(item.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'IAC-InterviewAssistant/1.0 (+https://github.com/Abhitvg/IAC; Candidate Research)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          pagesFailed++;
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          pagesSkipped++;
          continue;
        }

        const html = await response.text();
        if (html.length > maxByteSize) {
          pagesSkipped++;
          continue;
        }

        const extracted = extractCleanHtmlContent(html, item.url, sourceId);
        const classification = classifyPage(item.url, extracted.title, extracted.cleanText);
        const hash = computeSimpleHash(extracted.cleanText);

        const pageRecord: CrawledPage = {
          url: item.url,
          canonicalUrl: item.url,
          title: extracted.title || item.url,
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
            const check = validateAndNormalizeUrl(link, allowedOrigin);
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
        console.warn(`[WebsiteCrawler] Fetch failed for ${item.url}:`, err?.message || err);
      }
    }

    report('completed');
    return crawledPages;
  }
}

