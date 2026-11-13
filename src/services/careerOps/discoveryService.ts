import {
  fetchJobPostingFromUrl,
  parseJobPageContent,
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
  limit = 10
): Array<{ url: string; titleHint: string }> {
  const links: Array<{ url: string; titleHint: string }> = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) && links.length < limit) {
    const href = decodeHtml(match[1].trim());
    const titleHint = decodeHtml(
      match[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
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
 * Extracts a Greenhouse board token if the URL points to a Greenhouse board
 * (e.g. boards.greenhouse.io/{token}, job-boards.greenhouse.io/{token}, or boards-api.greenhouse.io).
 */
export function extractGreenhouseBoardToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('greenhouse.io')) return null;

    const forParam = parsed.searchParams.get('for');
    if (forParam) return forParam.trim().toLowerCase();

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[0] === 'v1' && parts[1] === 'boards') {
      return parts[2].trim().toLowerCase();
    }
    if (parts.length >= 1 && parts[0] !== 'embed') {
      return parts[0].trim().toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Discovers jobs directly from the official Greenhouse public JSON API.
 * This avoids cross-origin redirects when Greenhouse boards redirect to external SPAs (e.g. Datadog),
 * while keeping all requests connection-pinned and SSRF-protected.
 */
export async function discoverJobsFromGreenhouseApi(
  boardToken: string,
  source: CareerPageSourceInput,
  safeFetcher: JobPageFetcher,
  limit = 10
): Promise<CareerPageDiscoveryResult> {
  const listUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
  const listResponse = await safeFetcher({
    url: listUrl,
    allowedOrigin: 'https://boards-api.greenhouse.io',
    timeoutMs: 12000,
    maxByteSize: 2 * 1024 * 1024,
    maxRedirects: 3,
  });

  if (listResponse.statusCode < 200 || listResponse.statusCode >= 300) {
    throw new Error(`Greenhouse API returned HTTP ${listResponse.statusCode}.`);
  }

  let data: { jobs?: Array<any> };
  try {
    data = JSON.parse(listResponse.body);
  } catch {
    throw new Error('Failed to parse Greenhouse API JSON response.');
  }

  const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs: DiscoveredJob[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const keywords = (source.keywords || [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  for (const rawJob of rawJobs) {
    if (jobs.length >= limit) break;

    const role = (rawJob.title || 'Unknown role').trim();
    const company = (rawJob.company_name || source.label.trim() || 'Unknown Company').trim();
    const location = rawJob.location?.name || 'Not specified';
    const jobUrl =
      rawJob.absolute_url ||
      `https://job-boards.greenhouse.io/${encodeURIComponent(boardToken)}/jobs/${rawJob.id}`;

    // Keyword filter on title / basic metadata first
    if (keywords.length) {
      const titleMatches = keywords.some((keyword) => role.toLowerCase().includes(keyword));
      if (!titleMatches) {
        skipped += 1;
        continue;
      }
    }

    try {
      const detailUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${rawJob.id}?content=true`;
      const detailResponse = await safeFetcher({
        url: detailUrl,
        allowedOrigin: 'https://boards-api.greenhouse.io',
        timeoutMs: 12000,
        maxByteSize: 1024 * 1024,
        maxRedirects: 3,
      });

      let cleanJd = '';
      if (detailResponse.statusCode >= 200 && detailResponse.statusCode < 300) {
        try {
          const detailData = JSON.parse(detailResponse.body);
          const rawContent = typeof detailData.content === 'string' ? detailData.content : '';
          cleanJd = decodeHtml(rawContent)
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        } catch {
          cleanJd = `${role} at ${company}. Location: ${location}`;
        }
      } else {
        cleanJd = `${role} at ${company}. Location: ${location}`;
      }

      const parsed = parseJobPageContent(cleanJd || role, jobUrl);

      jobs.push({
        details: {
          company,
          role,
          location: location !== 'Not specified' ? location : parsed.location,
          workType: parsed.workType,
          salaryRange: parsed.salaryRange,
          jdText: cleanJd.length > 5000 ? cleanJd.slice(0, 5000) + '...' : cleanJd || `${role} at ${company}`,
          url: jobUrl,
          detectedAts: 'greenhouse',
        },
        sourceLabel: source.label,
      });
    } catch (err) {
      errors.push(
        `${jobUrl}: ${err instanceof Error ? err.message : 'Could not fetch job detail'}`
      );
    }
  }

  return { jobs, skipped, errors };
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

  const ghToken = extractGreenhouseBoardToken(sourceUrl);

  let page: { statusCode: number; contentType: string; body: string };
  try {
    const origin = new URL(sourceUrl).origin;
    page = await safeFetcher({
      url: sourceUrl,
      allowedOrigin: origin,
      timeoutMs: 12000,
      maxByteSize: 2 * 1024 * 1024,
      maxRedirects: 3,
    });
  } catch (fetchErr) {
    if (ghToken) {
      return await discoverJobsFromGreenhouseApi(ghToken, source, safeFetcher);
    }
    throw fetchErr;
  }

  if (page.statusCode < 200 || page.statusCode >= 300) {
    if (ghToken) {
      return await discoverJobsFromGreenhouseApi(ghToken, source, safeFetcher);
    }
    throw new Error(`Career page returned HTTP ${page.statusCode}.`);
  }
  if (!/text\/html|application\/xhtml\+xml/i.test(page.contentType)) {
    if (ghToken) {
      return await discoverJobsFromGreenhouseApi(ghToken, source, safeFetcher);
    }
    throw new Error('Career page did not return HTML.');
  }

  const links = extractCareerPageJobLinks(page.body, sourceUrl, 10);
  if (links.length === 0 && ghToken) {
    return await discoverJobsFromGreenhouseApi(ghToken, source, safeFetcher);
  }

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
      const keywordText = `${details.role} ${details.jdText}`.toLowerCase();
      const keywords = (source.keywords || [])
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      if (keywords.length && !keywords.some((keyword) => keywordText.includes(keyword))) {
        skipped += 1;
        continue;
      }
      jobs.push({ details, sourceLabel: source.label });
    } catch (error) {
      errors.push(
        `${link.url}: ${error instanceof Error ? error.message : 'Could not import posting'}`
      );
    }
  }

  return { jobs, skipped, errors };
}
