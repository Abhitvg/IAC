/**
 * Website Source Management & Orchestration Service
 * Manages candidate personal websites, portfolio links, re-crawls, and extracted claims.
 * Seeds with candidate website: https://abhishek-jade.vercel.app/
 */

import { WebsiteSourceRecord, CrawlProgress, CrawledPage } from './websiteIngestionTypes';
import { WebsiteCrawler } from './websiteCrawler';
import { ExtractedClaim } from '../ingestion/types';

const STORAGE_KEY = 'candidate_website_sources_v1';
export const SEED_WEBSITE_URL = 'https://abhishek-jade.vercel.app/';

function loadStoredSources(): WebsiteSourceRecord[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[WebsiteSourceService] Failed to load stored sources:', e);
    }
  }

  // Initial source seeded with candidate's personal portfolio URL
  const defaultSource: WebsiteSourceRecord = {
    id: 'src-seed-portfolio',
    rootUrl: SEED_WEBSITE_URL,
    label: 'Personal Portfolio & Project Showcase',
    seedUrl: SEED_WEBSITE_URL,
    allowedOrigin: 'https://abhishek-jade.vercel.app',
    autoCrawlSitemap: true,
    maxPages: 10,
    maxDepth: 2,
    pages: [],
    totalClaimsCount: 0,
    pendingReviewCount: 0,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return [defaultSource];
}

export class WebsiteSourceService {
  private static sources: WebsiteSourceRecord[] = loadStoredSources();

  private static persist() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sources));
      } catch (e) {
        console.warn('[WebsiteSourceService] Failed to persist sources:', e);
      }
    }
  }

  public static getSources(): WebsiteSourceRecord[] {
    return [...this.sources];
  }

  public static addSource(seedUrl: string, label?: string): WebsiteSourceRecord {
    let allowedOrigin = '';
    try {
      allowedOrigin = new URL(seedUrl).origin;
    } catch {}

    const newSource: WebsiteSourceRecord = {
      id: `src-web-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rootUrl: seedUrl,
      label: label || `Website (${new URL(seedUrl).hostname})`,
      seedUrl,
      allowedOrigin,
      autoCrawlSitemap: true,
      maxPages: 10,
      maxDepth: 2,
      pages: [],
      totalClaimsCount: 0,
      pendingReviewCount: 0,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sources.push(newSource);
    this.persist();
    return newSource;
  }

  public static updateSource(id: string, updates: Partial<WebsiteSourceRecord>) {
    this.sources = this.sources.map((s) =>
      s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
    );
    this.persist();
  }

  public static removeSource(id: string) {
    this.sources = this.sources.filter((s) => s.id !== id);
    this.persist();
  }

  public static async crawlSource(
    id: string,
    onProgress?: (progress: CrawlProgress) => void
  ): Promise<CrawledPage[]> {
    const source = this.sources.find((s) => s.id === id);
    if (!source) throw new Error(`Source with ID ${id} not found.`);

    this.updateSource(id, { status: 'crawling' });

    try {
      const crawled = await WebsiteCrawler.crawl({
        seedUrl: source.seedUrl,
        sourceId: source.id,
        maxPages: source.maxPages,
        maxDepth: source.maxDepth,
        onProgress,
      });

      const totalClaims = crawled.reduce((acc, p) => acc + p.extractedClaims.length, 0);

      this.updateSource(id, {
        pages: crawled,
        totalClaimsCount: totalClaims,
        pendingReviewCount: totalClaims,
        status: 'active',
        lastCrawledAt: Date.now(),
      });

      return crawled;
    } catch (err) {
      this.updateSource(id, { status: 'error' });
      throw err;
    }
  }

  public static getAllExtractedClaims(): ExtractedClaim[] {
    const claims: ExtractedClaim[] = [];
    for (const source of this.sources) {
      for (const page of source.pages) {
        claims.push(...page.extractedClaims);
      }
    }
    return claims;
  }
}

