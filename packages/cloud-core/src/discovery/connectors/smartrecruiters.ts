import type { JobPosting, JobSource, JobSourceQuery } from '../../plugins';
import { sanitizeUntrustedText } from '../../sanitizer';
import { type AtsHttpFetcher, defaultAtsFetcher } from './ats-fetcher';

export class SmartRecruitersConnector implements JobSource {
  readonly id = 'smartrecruiters';
  readonly platform = 'smartrecruiters' as const;

  constructor(private readonly fetcher: AtsHttpFetcher = defaultAtsFetcher) {}

  async fetchPostings(query: JobSourceQuery): Promise<JobPosting[]> {
    const slugs =
      query.companySlugs && query.companySlugs.length > 0 ? query.companySlugs : ['sample'];
    const limit = query.limit ?? 50;
    const allPostings: JobPosting[] = [];

    for (const slug of slugs) {
      const cleanSlug = encodeURIComponent(slug.trim().toLowerCase());
      const apiUrl = `https://api.smartrecruiters.com/v1/companies/${cleanSlug}/postings`;

      try {
        const response = await this.fetcher(apiUrl);
        if (response.status !== 200 || !response.data?.content) continue;

        for (const job of response.data.content) {
          if (allPostings.length >= limit) break;

          const title = sanitizeUntrustedText(job.name || 'Engineer', 160);
          const location = sanitizeUntrustedText(
            [job.location?.city, job.location?.region, job.location?.country]
              .filter(Boolean)
              .join(', ') || 'Unspecified',
            120
          );
          const description = sanitizeUntrustedText(
            job.jobAd?.sections?.jobDescription?.text?.replace(/<[^>]+>/g, ' ') || title,
            10_000
          );
          const isRemote =
            job.location?.remote === true || /remote/i.test(location) || /remote/i.test(title);

          allPostings.push({
            sourceId: `smartrecruiters:${cleanSlug}`,
            platform: 'smartrecruiters',
            company: slug.charAt(0).toUpperCase() + slug.slice(1),
            title,
            location,
            remoteType: isRemote ? 'remote' : 'onsite',
            url: `https://jobs.smartrecruiters.com/${cleanSlug}/${job.id}`,
            externalId: String(job.id),
            descriptionText: description,
            postedAt: job.releasedDate ? new Date(job.releasedDate).toISOString() : undefined,
          });
        }
      } catch {
        // Silently skip failing external boards
      }
    }

    return allPostings;
  }
}
