import {
  fetchJobPostingFromUrl,
  type JobPageFetcher,
  type ScrapedJobDetails,
} from './jobScraperService';

export interface CareerPageSourceInput {
  label: string;
  url: string;
  keywords?: string[];
}

export interface DiscoveredJob {
  details: ScrapedJobDetails;
  sourceLabel: string;
}

export interface CareerPageDiscoveryResult {
  jobs: DiscoveredJob[];
  skipped: number;
  errors: string[];
}

function normalizeJobUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

/**
 * Extracts likely job-detail links from a public career page.
 * Link text is treated as an untrusted title hint, never as verified JD content.
 */
export function extractCareerPageJobLinks(
  html: string,
  sourceUrl: string,
  limit = 20
): Array<{ url: string; titleHint: string }> {
  const links: Array<{ url: string; titleHint: string }> = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) && links.length < limit) {
    const href = decodeHtml(match[1].trim());
    const titleHint = decodeHtml(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const url = normalizeJobUrl(href, sourceUrl);
    if (!url || seen.has(url)) continue;

    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const hostname = parsed.hostname.toLowerCase();
    const hasJobPath = /\/(jobs?|positions?|requisitions?)\//i.test(parsed.pathname);
    const isGreenhousePosting =
      hostname.includes('greenhouse.io') && /\/jobs?\/\d+/i.test(parsed.pathname);
    const isLeverPosting = hostname === 'jobs.lever.co' && pathParts.length >= 2;
    const isAshbyPosting = hostname === 'jobs.ashbyhq.com' && pathParts.length >= 2;
    const isWorkdayPosting =
      hostname.includes('myworkdayjobs.com') && /\/job\//i.test(parsed.pathname);
    if (
      !hasJobPath &&
      !isGreenhousePosting &&
      !isLeverPosting &&
      !isAshbyPosting &&
      !isWorkdayPosting
    ) {
      continue;
    }
    if (/^(apply|view job|learn more|read more)$/i.test(titleHint)) continue;

    seen.add(url);
    links.push({ url, titleHint: titleHint.slice(0, 120) });
  }

  return links;
}

function resolveSafeFetcher(fetcher?: JobPageFetcher): JobPageFetcher {
  if (fetcher) return fetcher;
  const safeFetcher =
    typeof window !== 'undefined'
      ? (window as unknown as { electronAPI?: { safeFetchPinned?: JobPageFetcher } }).electronAPI
          ?.safeFetchPinned
      : undefined;
  if (typeof safeFetcher !== 'function') {
    throw new Error('Secure page fetching is unavailable in this runtime.');
  }
  return safeFetcher;
}

/**
 * Scans one explicitly configured public careers page, then imports a bounded
 * number of job-detail pages. It never submits applications or bypasses login.
 */
export async function discoverJobsFromCareerPage(
  source: CareerPageSourceInput,
  fetcher?: JobPageFetcher
): Promise<CareerPageDiscoveryResult> {
  const safeFetcher = resolveSafeFetcher(fetcher);
  const sourceUrl = normalizeJobUrl(source.url, source.url);
  if (!sourceUrl) throw new Error('Career page source must be a valid public HTTPS URL.');

  const origin = new URL(sourceUrl).origin;
  const page = await safeFetcher({
    url: sourceUrl,
    allowedOrigin: origin,
    timeoutMs: 12000,
    maxByteSize: 2 * 1024 * 1024,
    maxRedirects: 3,
  });

  if (page.statusCode < 200 || page.statusCode >= 300) {
    throw new Error(\`Career page returned HTTP \${page.statusCode}.\`);
  }
  if (!/text\/html|application\/xhtml\+xml/i.test(page.contentType)) {
    throw new Error('Career page did not return HTML.');
  }

  const links = extractCareerPageJobLinks(page.body, sourceUrl, 20);
  const jobs: DiscoveredJob[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Sequential bounded fetching keeps the desktop app and target sites under load.
  for (const link of links) {
    try {
      const details = await fetchJobPostingFromUrl(link.url, safeFetcher);
      if (details.role === 'Unknown role' && link.titleHint) details.role = link.titleHint;
      if (!details.company || details.company === 'Unknown Company') {
        details.company = source.label.trim() || 'Unknown Company';
      }
      const keywordText = \`\${details.role} \${details.jdText}\`.toLowerCase();
      const keywords = (source.keywords || []).map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (keywords.length && !keywords.some((keyword) => keywordText.includes(keyword))) {
        skipped += 1;
        continue;
      }
      jobs.push({ details, sourceLabel: source.label });
    } catch (error) {
      errors.push(
        \`\${link.url}: \${error instanceof Error ? error.message : 'Could not import posting'}\`
      );
    }
  }

  return { jobs, skipped, errors };
}
