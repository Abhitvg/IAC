import type { JobPosting, JobSource, JobSourceQuery } from '../../plugins';
import { sanitizeUntrustedText } from '../../sanitizer';
import { type AtsHttpFetcher, defaultAtsFetcher } from './ats-fetcher';

export class WorkdayConnector implements JobSource {
  readonly id = 'workday';
  readonly platform = 'workday' as const;

  constructor(private readonly fetcher: AtsHttpFetcher = defaultAtsFetcher) {}

  async fetchPostings(query: JobSourceQuery): Promise<JobPosting[]> {
    const slugs =
      query.companySlugs && query.companySlugs.length > 0 ? query.companySlugs : ['sample'];
    const limit = query.limit ?? 50;
    const allPostings: JobPosting[] = [];

    for (const slug of slugs) {
      const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
      // Workday CXS public job search API endpoint
      const apiUrl = `https://${cleanSlug}.myworkdayjobs.com/wday/cxs/${cleanSlug}/External/jobs`;

      try {
        const response = await this.fetcher(apiUrl);
        if (response.status !== 200) continue;

        // Either JSON list in jobPostings or HTML/text
        const postings = response.data?.jobPostings || [];
        for (const job of postings) {
          if (allPostings.length >= limit) break;

          const title = sanitizeUntrustedText(job.title || 'Engineer', 160);
          const location = sanitizeUntrustedText(job.locationsText || 'Unspecified', 120);
          const externalId =
            job.bulletFields?.[0] || job.externalPath || Math.random().toString(36).slice(2);
          const jobUrl = `https://${cleanSlug}.myworkdayjobs.com/en-US/External${job.externalPath || ''}`;
          const isRemote = /remote/i.test(location) || /remote/i.test(title);

          allPostings.push({
            sourceId: `workday:${cleanSlug}`,
            platform: 'workday',
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            title,
            location,
            remoteType: isRemote ? 'remote' : 'onsite',
            url: jobUrl,
            externalId: String(externalId),
            descriptionText: title,
            postedAt: job.postedOn ? new Date().toISOString() : undefined,
          });
        }
      } catch {
        // Silently skip failing external boards
      }
    }

    return allPostings;
  }
}
