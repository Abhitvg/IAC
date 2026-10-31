/**
 * Website Ingestion & Source Crawler Types
 */

import { ExtractedClaim } from '../ingestion/types';

export type PageClassificationType =
  | 'home'
  | 'about'
  | 'projects'
  | 'experience'
  | 'research'
  | 'publications'
  | 'contact'
  | 'resume'
  | 'unknown';

export interface CrawledPage {
  url: string;
  canonicalUrl: string;
  title: string;
  classification: PageClassificationType;
  htmlContent: string;
  cleanText: string;
  contentHash: string;
  statusCode: number;
  fetchedAt: number;
  byteSize: number;
  outboundLinks: string[];
  extractedClaims: ExtractedClaim[];
}

export interface CrawlProgress {
  sourceId: string;
  targetDomain: string;
  status: 'idle' | 'crawling' | 'completed' | 'failed' | 'cancelled';
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesSkipped: number;
  pagesFailed: number;
  currentUrl?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface WebsiteSourceRecord {
  id: string;
  rootUrl: string;
  label: string;
  seedUrl: string;
  allowedOrigin: string;
  autoCrawlSitemap: boolean;
  maxPages: number;
  maxDepth: number;
  lastCrawledAt?: number;
  pages: CrawledPage[];
  totalClaimsCount: number;
  pendingReviewCount: number;
  status: 'active' | 'crawling' | 'error' | 'paused';
  createdAt: number;
  updatedAt: number;
}

export interface ContentDifference {
  pageUrl: string;
  type: 'added' | 'removed' | 'modified';
  previousHash?: string;
  newHash?: string;
  addedText?: string;
  removedText?: string;
  newClaims: ExtractedClaim[];
}
