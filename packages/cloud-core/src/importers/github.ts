import { createHash } from 'node:crypto';
import type { CandidateFact } from '../career-graph-types';
import { sanitizeUntrustedText, slugifyFactKey } from '../sanitizer';

export interface GitHubUserProfile {
  login: string;
  name?: string;
  bio?: string;
  public_repos?: number;
  followers?: number;
  html_url?: string;
}

export interface GitHubRepository {
  name: string;
  full_name?: string;
  description?: string | null;
  html_url: string;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  topics?: string[];
  homepage?: string | null;
  created_at?: string;
  updated_at?: string;
  fork?: boolean;
}

export interface GitHubImportPayload {
  user: GitHubUserProfile;
  repositories: GitHubRepository[];
}

/**
 * Extracts candidate Career Graph facts from GitHub profile & repositories.
 * Strictly enforces H5 by sanitizing all incoming external text.
 */
export function extractCandidateFactsFromGitHub(payload: GitHubImportPayload): CandidateFact[] {
  const candidateFacts: CandidateFact[] = [];
  const rawPayloadStr = JSON.stringify(payload);
  const evidenceSha256 = createHash('sha256').update(rawPayloadStr, 'utf8').digest('hex');

  const username = sanitizeUntrustedText(payload.user.login, 60);
  if (!username) return [];

  // 1. Language frequency map for Skill facts
  const languageStats: Record<string, { count: number; stars: number }> = {};

  // 2. Extract Project facts from repositories (prioritizing non-forks and top starred repos)
  const sortedRepos = [...(payload.repositories || [])].sort(
    (a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)
  );

  for (const repo of sortedRepos) {
    const repoName = sanitizeUntrustedText(repo.name, 100);
    if (!repoName) continue;

    const rawDescription = repo.description || 'Open source project';
    const description = sanitizeUntrustedText(rawDescription, 2000);
    const language = repo.language ? sanitizeUntrustedText(repo.language, 60) : null;
    const stars = repo.stargazers_count ?? 0;
    const forks = repo.forks_count ?? 0;
    const topics = (repo.topics || [])
      .map((t) => sanitizeUntrustedText(t, 40))
      .filter((t) => t.length > 0);

    const technologies = language ? [language, ...topics.slice(0, 10)] : topics.slice(0, 10);
    const metrics = `${stars} stars, ${forks} forks`;
    const factKey = slugifyFactKey('project', `${username}-${repoName}`);

    candidateFacts.push({
      factKey,
      category: 'project',
      payload: {
        name: repoName,
        description,
        role: repo.fork ? 'Contributor' : 'Creator / Maintainer',
        technologies,
        url: repo.homepage ? sanitizeUntrustedText(repo.homepage, 500) : undefined,
        repositoryUrl: sanitizeUntrustedText(repo.html_url, 500),
        metrics,
      },
      source: {
        kind: 'integration',
        reference: `github:${username}/${repoName}`,
        evidenceSha256,
      },
      suggestedConfidence: repo.fork ? 0.75 : 0.9,
    });

    // Track language stats
    if (language) {
      if (!languageStats[language]) {
        languageStats[language] = { count: 0, stars: 0 };
      }
      languageStats[language].count += 1;
      languageStats[language].stars += stars;
    }
  }

  // 3. Extract Skill facts from GitHub languages
  for (const [lang, stats] of Object.entries(languageStats)) {
    const factKey = slugifyFactKey('skill', lang);
    candidateFacts.push({
      factKey,
      category: 'skill',
      payload: {
        name: lang,
        category: 'language',
        yearsOfExperience: null,
        proficiency:
          stats.count >= 5 || stats.stars >= 50
            ? 'expert'
            : stats.count >= 2
              ? 'advanced'
              : 'intermediate',
      },
      source: {
        kind: 'integration',
        reference: `github:${username}:languages`,
        evidenceSha256,
      },
      suggestedConfidence: 0.9,
    });
  }

  return candidateFacts;
}
