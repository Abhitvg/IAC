/**
 * Asynchronous, Rate-Limited Same-Origin Website Crawler
 * Enforces connection-level destination pinning (DNS rebinding protection),
 * strict SSRF constraints, single-lifecycle timeouts, and same-origin link discovery.
 */

import { CrawledPage, CrawlProgress } from './websiteIngestionTypes';
import { validateAndNormalizeUrlAsync } from './urlSafetyPolicy';
import { extractCleanHtmlContent } from './htmlContentExtractor';
import { classifyPage } from './pageClassifier';
import { computeSimpleHash } from './websiteChangeDetector';
import { SafeConnectionFetcher, PinnedFetchResponse } from './safeConnectionFetcher';

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
        let fetchResult: PinnedFetchResponse;

        // In Electron renderer, execute connection pinning via IPC; otherwise use SafeConnectionFetcher directly
        if (typeof window !== 'undefined' && window.electronAPI?.safeFetchPinned) {
          fetchResult = await window.electronAPI.safeFetchPinned({
            url: item.url,
            allowedOrigin,
            timeoutMs: requestTimeoutMs,
            maxByteSize,
          });
        } else {
          fetchResult = await SafeConnectionFetcher.fetch({
            url: item.url,
            allowedOrigin,
            timeoutMs: requestTimeoutMs,
            maxByteSize,
          });
        }

        if (fetchResult.statusCode < 200 || fetchResult.statusCode >= 300) {
          pagesFailed++;
          continue;
        }

        const html = fetchResult.body;
        if (!html || html.length === 0) {
          pagesSkipped++;
          continue;
        }

        const extracted = extractCleanHtmlContent(html, fetchResult.finalUrl, sourceId);
        const classification = classifyPage(fetchResult.finalUrl, extracted.title, extracted.cleanText);
        const hash = computeSimpleHash(extracted.cleanText);

        const pageRecord: CrawledPage = {
          url: fetchResult.finalUrl,
          canonicalUrl: fetchResult.finalUrl,
          title: extracted.title || fetchResult.finalUrl,
          classification,
          htmlContent: html.slice(0, 50000), // Bounded HTML storage
          cleanText: extracted.cleanText,
          contentHash: hash,
          statusCode: fetchResult.statusCode,
          fetchedAt: Date.now(),
          byteSize: fetchResult.byteSize,
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
