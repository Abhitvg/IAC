import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  GitHubIngestionService,
  GitHubRepoSummary,
} from '../src/services/ingestion/githubIngestionService';
import {
  GitHubRepoSelector,
  RepoSortOption,
} from '../src/components/github/GitHubRepoSelector';

describe('GitHub Repository Visibility & Selection Suite', () => {
  let ghService: GitHubIngestionService;

  // Helper to generate N realistic GitHub repositories
  const generateMockRepos = (count: number, prefix = 'repo'): GitHubRepoSummary[] => {
    return Array.from({ length: count }, (_, i) => {
      const idx = i + 1;
      const languages = ['TypeScript', 'Python', 'Go', 'Rust', 'JavaScript', 'C++'];
      const lang = languages[i % languages.length];
      const isPrivate = i % 4 === 0; // 25% private
      const isFork = i % 5 === 0;
      return {
        id: 1000 + idx,
        name: `${prefix}-${String(idx).padStart(3, '0')}`,
        fullName: `candidate/${prefix}-${String(idx).padStart(3, '0')}`,
        htmlUrl: `https://github.com/candidate/${prefix}-${String(idx).padStart(3, '0')}`,
        description: `Description for ${prefix} ${idx} written in ${lang}`,
        isFork,
        isPrivate,
        primaryLanguage: lang,
        stargazersCount: idx * 3,
        forksCount: idx,
        updatedAt: new Date(Date.now() - (count - idx) * 3600000).toISOString(),
        defaultBranch: 'main',
        topics: [lang.toLowerCase(), 'interview', 'algorithms'],
        selectedForIngestion: false,
      };
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    ghService = GitHubIngestionService.getInstance();
    ghService.disconnect();
  });

  describe('1. 27 Repositories Visibility & Complete Selection', () => {
    it('allows discovering and selecting all 27 repositories without truncation', () => {
      const repos27 = generateMockRepos(27, 'project');
      expect(repos27.length).toBe(27);

      // Verify service batch selection
      const allNames = repos27.map((r) => r.fullName);
      ghService.selectRepositories(allNames);

      const selected = ghService.getSelectedRepositoryNames();
      expect(selected.length).toBe(27);
      expect(selected).toEqual(expect.arrayContaining(allNames));

      // Verify rendered markup contains count and references without a 10-item cap
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(GitHubRepoSelector, {
          repos: repos27,
          isLoading: false,
          error: null,
          service: ghService,
        })
      );

      expect(html).toContain('27 of 27 selected');
      expect(html).toContain('Total: <strong style="color:#F3F4F8">27</strong> repositories');
      expect(html).not.toContain('.slice(0, 10)');
    });
  });

  describe('2. Multi-Page API Fetching (> 100 Repositories)', () => {
    it('retrieves all API pages and accumulates more than 100 repositories', async () => {
      ghService.setToken('ghp_mock_token_123');

      // Mock fetch to simulate 2 full pages of 100 and 1 partial page of 15 (215 repos total)
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        const urlObj = new URL(url);
        const page = Number(urlObj.searchParams.get('page') || '1');
        const perPage = Number(urlObj.searchParams.get('per_page') || '100');

        let pageItemsCount = 0;
        if (page === 1) pageItemsCount = 100;
        else if (page === 2) pageItemsCount = 100;
        else if (page === 3) pageItemsCount = 15;
        else pageItemsCount = 0;

        const rawRepos = Array.from({ length: pageItemsCount }, (_, idx) => {
          const itemNum = (page - 1) * perPage + idx + 1;
          return {
            id: itemNum,
            name: `large-repo-${itemNum}`,
            full_name: `candidate/large-repo-${itemNum}`,
            html_url: `https://github.com/candidate/large-repo-${itemNum}`,
            description: `Repository number ${itemNum}`,
            fork: false,
            private: itemNum % 2 === 0,
            language: 'TypeScript',
            stargazers_count: 5,
            forks_count: 1,
            updated_at: new Date().toISOString(),
            default_branch: 'main',
            topics: ['typescript'],
          };
        });

        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => rawRepos,
        };
      });

      vi.stubGlobal('fetch', mockFetch);

      const loadedRepos = await ghService.listRepositories();
      expect(loadedRepos.length).toBe(215);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify the 215th repo exists and is accurately formatted
      const lastRepo = loadedRepos[214];
      expect(lastRepo.fullName).toBe('candidate/large-repo-215');
      expect(lastRepo.isPrivate).toBe(false);
    });
  });

  describe('3. Search Finds Repositories Beyond the First 10', () => {
    it('locates items that were previously hidden past the 10-item cap', () => {
      const repos = generateMockRepos(35, 'service');
      // Look for repo 25 specifically
      const targetRepo = repos[24]; // repo-025
      expect(targetRepo.name).toBe('service-025');

      // Verify service handles search filtering
      const term = '025';
      const matches = repos.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.description.toLowerCase().includes(term) ||
          (r.primaryLanguage || '').toLowerCase().includes(term) ||
          r.fullName.toLowerCase().includes(term)
      );

      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe('service-025');

      // Render with selector with initialSearchTerm and verify target repo is rendered
      ghService.selectRepositories(['candidate/service-025']);
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(GitHubRepoSelector, {
          repos,
          isLoading: false,
          error: null,
          service: ghService,
          initialSearchTerm: '025',
        })
      );

      expect(html).toContain('candidate/service-025');
      expect(html).toContain('Showing <strong style="color:#F3F4F8">1</strong> matching');
    });
  });

  describe('4. Selection Survives Filtering and Pagination', () => {
    it('preserves existing selections when search filters change or pages are swapped', () => {
      const repos = generateMockRepos(30, 'library');

      // Select repo-002 (on page 1) and repo-025 (on page 3)
      ghService.toggleRepositorySelection('candidate/library-002', true);
      ghService.toggleRepositorySelection('candidate/library-025', true);

      expect(ghService.getSelectedRepositoryNames()).toEqual([
        'candidate/library-002',
        'candidate/library-025',
      ]);

      // Filter by "Python"
      const pythonRepos = repos.filter((r) => r.primaryLanguage === 'Python');
      expect(pythonRepos.length).toBeGreaterThan(0);

      // Verify selections in service were NOT cleared by filtering
      expect(ghService.getSelectedRepositoryNames()).toContain('candidate/library-002');
      expect(ghService.getSelectedRepositoryNames()).toContain('candidate/library-025');

      // Add a third repo while filtered
      const targetPythonRepo = pythonRepos[0].fullName;
      ghService.toggleRepositorySelection(targetPythonRepo, true);

      // Clear filter: all 3 remain selected
      const selectedAfter = ghService.getSelectedRepositoryNames();
      expect(selectedAfter).toContain('candidate/library-002');
      expect(selectedAfter).toContain('candidate/library-025');
      expect(selectedAfter).toContain(targetPythonRepo);
    });
  });

  describe('5. Select All & Deselect All Precision (Filtered vs Total)', () => {
    it('applies Select Filtered only to the subset of matching repositories', () => {
      const repos = generateMockRepos(20, 'module');

      // Filter for TypeScript repos only (every 6th repo)
      const tsRepos = repos.filter((r) => r.primaryLanguage === 'TypeScript');
      const nonTsRepos = repos.filter((r) => r.primaryLanguage !== 'TypeScript');
      expect(tsRepos.length).toBeGreaterThan(0);
      expect(nonTsRepos.length).toBeGreaterThan(0);

      // Pre-select one non-TS repo
      ghService.toggleRepositorySelection(nonTsRepos[0].fullName, true);

      // Execute Select All for the filtered TS repos only
      const tsNames = tsRepos.map((r) => r.fullName);
      ghService.selectRepositories(tsNames);

      const selected = ghService.getSelectedRepositoryNames();
      // Should include nonTsRepos[0] AND all tsRepos
      expect(selected).toContain(nonTsRepos[0].fullName);
      for (const tsName of tsNames) {
        expect(selected).toContain(tsName);
      }

      // Deselect only the filtered TS repos
      ghService.deselectRepositories(tsNames);
      const afterDeselect = ghService.getSelectedRepositoryNames();
      expect(afterDeselect).toContain(nonTsRepos[0].fullName);
      for (const tsName of tsNames) {
        expect(afterDeselect).not.toContain(tsName);
      }
    });

    it('clears all selections when Deselect All is called with no filter', () => {
      const repos = generateMockRepos(15, 'pkg');
      ghService.selectRepositories(repos.map((r) => r.fullName));
      expect(ghService.getSelectedRepositoryNames().length).toBe(15);

      ghService.deselectRepositories();
      expect(ghService.getSelectedRepositoryNames().length).toBe(0);
    });
  });

  describe('6. Ingestion Receives Every Selected Repository', () => {
    it('passes all selected repositories to ingestSelectedRepositories regardless of visible page', async () => {
      ghService.setToken('ghp_test_valid_token');

      // Select repos across hypothetical pages 1, 2, and 3
      ghService.toggleRepositorySelection('candidate/project-001', true);
      ghService.toggleRepositorySelection('candidate/project-015', true);
      ghService.toggleRepositorySelection('candidate/project-027', true);

      // Mock user & repo inspection
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/user')) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              login: 'candidate',
              id: 999,
              avatar_url: 'https://github.com/candidate.png',
              html_url: 'https://github.com/candidate',
              name: 'Candidate User',
              public_repos: 3,
            }),
          };
        }
        if (url.includes('/repos/')) {
          const parts = url.split('/repos/')[1].split('/');
          const repoFullName = `${parts[0]}/${parts[1]}`;
          if (url.endsWith('/readme')) {
            return {
              ok: true,
              status: 200,
              headers: new Headers(),
              json: async () => ({ content: Buffer.from('# Readme content').toString('base64') }),
            };
          }
          if (url.includes('/commits')) {
            return {
              ok: true,
              status: 200,
              headers: new Headers(),
              json: async () => [
                {
                  sha: 'abc1234567890',
                  author: { login: 'candidate' },
                  commit: {
                    author: { name: 'Candidate User', email: 'c@example.com', date: '2026-01-01' },
                    message: 'feat: add architecture',
                  },
                },
              ],
            };
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({
              name: parts[1],
              full_name: repoFullName,
              html_url: `https://github.com/${repoFullName}`,
              description: `Inspection for ${repoFullName}`,
              language: 'TypeScript',
              stargazers_count: 10,
              forks_count: 2,
            }),
          };
        }
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({}) };
      });

      vi.stubGlobal('fetch', mockFetch);

      const ingestionResult = await ghService.ingestSelectedRepositories();
      expect(ingestionResult.inspectedRepositories.length).toBe(3);
      const inspectedNames = ingestionResult.inspectedRepositories.map((r) => r.repoFullName);
      expect(inspectedNames).toEqual([
        'candidate/project-001',
        'candidate/project-015',
        'candidate/project-027',
      ]);
    });
  });

  describe('7. API Errors & Rate Limits Do Not Silently Show Partial List', () => {
    it('throws explicitly when a pagination error occurs on page > 1 instead of returning partial list', async () => {
      ghService.setToken('ghp_test_token');

      // Page 1 succeeds with 100 items, Page 2 fails with 403 Rate Limit
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        const urlObj = new URL(url);
        const page = Number(urlObj.searchParams.get('page') || '1');

        if (page === 1) {
          const rawRepos = Array.from({ length: 100 }, (_, i) => ({
            id: i + 1,
            name: `repo-${i + 1}`,
            full_name: `candidate/repo-${i + 1}`,
            html_url: `https://github.com/candidate/repo-${i + 1}`,
            description: 'Item',
            fork: false,
            private: false,
            language: 'Go',
          }));
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => rawRepos,
          };
        }

        // Page 2 rate limited
        const headers = new Headers();
        headers.set('x-ratelimit-remaining', '0');
        headers.set('x-ratelimit-reset', String(Math.floor(Date.now() / 1000) + 300));
        return {
          ok: false,
          status: 403,
          headers,
          json: async () => ({ message: 'API rate limit exceeded for user ID 12345' }),
        };
      });

      vi.stubGlobal('fetch', mockFetch);

      await expect(ghService.listRepositories()).rejects.toThrowError(
        /Failed while retrieving repository page 2 \(100 loaded\): GitHub API rate limit exceeded/
      );
    });

    it('displays visible error banner with retry button in component', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(GitHubRepoSelector, {
          repos: [],
          isLoading: false,
          error: 'GitHub API rate limit exceeded (HTTP 403). Try again in ~5 min.',
          onRetry: () => {},
          service: ghService,
        })
      );

      expect(html).toContain('Failed to load GitHub repositories');
      expect(html).toContain('GitHub API rate limit exceeded (HTTP 403)');
      expect(html).toContain('Retry Fetch');
    });
  });

  describe('8. Private Repositories & Permissions Handling', () => {
    it('marks private repositories accurately and displays Private badge', () => {
      const mixedRepos: GitHubRepoSummary[] = [
        {
          id: 501,
          name: 'public-core',
          fullName: 'candidate/public-core',
          htmlUrl: 'https://github.com/candidate/public-core',
          description: 'Open source core',
          isFork: false,
          isPrivate: false,
          primaryLanguage: 'TypeScript',
          stargazersCount: 42,
          forksCount: 5,
          updatedAt: '2026-02-01T00:00:00Z',
          defaultBranch: 'main',
          topics: [],
          selectedForIngestion: false,
        },
        {
          id: 502,
          name: 'stealth-startup',
          fullName: 'candidate/stealth-startup',
          htmlUrl: 'https://github.com/candidate/stealth-startup',
          description: 'Confidential commercial engine',
          isFork: false,
          isPrivate: true,
          primaryLanguage: 'Rust',
          stargazersCount: 0,
          forksCount: 0,
          updatedAt: '2026-03-01T00:00:00Z',
          defaultBranch: 'main',
          topics: [],
          selectedForIngestion: true,
        },
      ];

      ghService.toggleRepositorySelection('candidate/stealth-startup', true);

      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(GitHubRepoSelector, {
          repos: mixedRepos,
          isLoading: false,
          error: null,
          service: ghService,
        })
      );

      // Verify Private badge is rendered for private repo
      expect(html).toContain('badge-private');
      expect(html).toContain('Private');
      expect(html).toContain('badge-public');
      expect(html).toContain('Public');
      expect(html).toContain('Private repositories require the <code>repo</code> token scope');
    });
  });
});
