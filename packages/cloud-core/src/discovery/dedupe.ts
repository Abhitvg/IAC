import { createHash } from 'node:crypto';
import type { JobPosting } from '../plugins';

export function normalizeCompanyName(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(?:inc\.?|llc|corp\.?|corporation|ltd\.?|limited|technologies|group)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function normalizeJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((?:remote|hybrid|onsite|wfh|us|emea|apac)\)/gi, '')
    .replace(/\[(?:remote|hybrid|onsite|wfh|us|emea|apac)\]/gi, '')
    .replace(/-(?:\s*remote|\s*hybrid|\s*onsite)/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a deterministic canonical fingerprint for cross-board deduplication.
 */
export function computeJobFingerprint(
  job: Pick<JobPosting, 'company' | 'title' | 'externalId'>
): string {
  const comp = normalizeCompanyName(job.company);
  const title = normalizeJobTitle(job.title);
  const id = job.externalId.toLowerCase().trim();

  return createHash('sha256').update(`${comp}:${title}:${id}`, 'utf8').digest('hex');
}

/**
 * Deduplicates an array of job postings, keeping the earliest or highest information entry.
 */
export function deduplicatePostings(postings: JobPosting[]): JobPosting[] {
  const seen = new Set<string>();
  const unique: JobPosting[] = [];

  for (const job of postings) {
    const fingerprint = computeJobFingerprint(job);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(job);
    }
  }

  return unique;
}
