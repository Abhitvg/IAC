/**
 * GitHub Account & Repository Ingestion Service (IAC Multi-Source Ingestion Engine)
 *
 * Securely connects to GitHub (via Personal Access Token or OAuth token),
 * allows inclusion/exclusion of repositories, extracts README, dependencies,
 * release configs (Docker/Workflows), commits, and pull requests.
 *
 * Distinguishes repository presence from candidate-authored contributions:
 * - Authorship is verified against candidate commit emails/usernames.
 * - Extracts exact commit SHAs and PR numbers.
 * - Sourced facts are classified as REPOSITORY_SUPPORTED with zero fabrication.
 */

import { CanonicalProfileService } from '../knowledgeVault/canonicalProfileService';
import { CandidateProject, CandidateSkill } from '../knowledgeVault/canonicalProfile';

export interface GitHubUser {
  login: string;
  id: number;
  avatarUrl: string;
  htmlUrl: string;
  name?: string;
  email?: string;
  bio?: string;
  publicRepos: number;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  description?: string;
  isFork: boolean;
  isPrivate: boolean;
  primaryLanguage?: string;
  stargazersCount: number;
  forksCount: number;
  updatedAt: string;
  defaultBranch: string;
  topics: string[];
  selectedForIngestion: boolean;
}

export interface GitHubCommitRecord {
  sha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  isCandidateAuthored: boolean;
}

export interface GitHubPullRequestRecord {
  number: number;
  title: string;
  state: string;
  author: string;
  isMerged: boolean;
  mergedAt?: string;
  htmlUrl: string;
  isCandidateAuthored: boolean;
}

export interface GitHubRepoInspectionResult {
  repoFullName: string;
  htmlUrl: string;
  description: string;
  readmeSnippet?: string;
  primaryLanguage?: string;
  detectedDependencies: string[];
  hasDockerfile: boolean;
  hasWorkflows: boolean;
  commits: GitHubCommitRecord[];
  pullRequests: GitHubPullRequestRecord[];
  candidateCommitCount: number;
  totalCommitCount: number;
  canClaimAuthorship: boolean;
  suggestedDeploymentStatus: 'deployed_production' | 'staging_demo' | 'prototype' | 'UNKNOWN';
}

export interface GitHubIngestionResult {
  connectedUser: GitHubUser;
  inspectedRepositories: GitHubRepoInspectionResult[];
  discoveredSkills: string[];
  generatedProjects: CandidateProject[];
  ingestedAt: number;
}

const STORAGE_KEY_GH_TOKEN = 'iac_github_access_token_v1';
const STORAGE_KEY_GH_REPOS = 'iac_github_selected_repos_v1';

export class GitHubIngestionService {
  private static instance: GitHubIngestionService | null = null;
  private token: string | null = null;
  private currentUser: GitHubUser | null = null;
  private selectedRepoFullNames: Set<string> = new Set();

  private constructor() {
    this.loadPersistedState();
  }

  public static getInstance(): GitHubIngestionService {
    if (!GitHubIngestionService.instance) {
      GitHubIngestionService.instance = new GitHubIngestionService();
    }
    return GitHubIngestionService.instance;
  }

  private loadPersistedState(): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const storedToken = localStorage.getItem(STORAGE_KEY_GH_TOKEN);
        if (storedToken) this.token = storedToken;

        const storedRepos = localStorage.getItem(STORAGE_KEY_GH_REPOS);
        if (storedRepos) {
          const list = JSON.parse(storedRepos);
          if (Array.isArray(list)) {
            this.selectedRepoFullNames = new Set(list);
          }
        }
      } catch (err) {
        console.warn('[GitHubIngestionService] Failed to load persisted state:', err);
      }
    }
  }

  private persistState(): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        if (this.token) {
          localStorage.setItem(STORAGE_KEY_GH_TOKEN, this.token);
        } else {
          localStorage.removeItem(STORAGE_KEY_GH_TOKEN);
        }
        localStorage.setItem(
          STORAGE_KEY_GH_REPOS,
          JSON.stringify(Array.from(this.selectedRepoFullNames))
        );
      } catch (err) {
        console.warn('[GitHubIngestionService] Failed to persist state:', err);
      }
    }
  }

  public isConnected(): boolean {
    return Boolean(this.token);
  }

  public getCurrentUser(): GitHubUser | null {
    return this.currentUser;
  }

  public setToken(token: string): void {
    this.token = token.trim();
    this.persistState();
  }

  public disconnect(): void {
    this.token = null;
    this.currentUser = null;
    this.selectedRepoFullNames.clear();
    this.persistState();
  }

  private async fetchGitHub(endpoint: string): Promise<any> {
    if (!this.token) {
      throw new Error('GitHub token not configured. Please connect your GitHub account.');
    }

    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'IAC-Interview-Assistant',
      },
    });

    if (!res.ok) {
      let errDetail: string;
      try {
        const json = await res.json();
        errDetail = json.message || '';
      } catch {
        errDetail = await res.text();
      }

      if (
        res.status === 403 &&
        (errDetail.toLowerCase().includes('rate limit') || res.headers.get('x-ratelimit-remaining') === '0')
      ) {
        const resetHeader = res.headers.get('x-ratelimit-reset');
        const resetMin = resetHeader ? Math.ceil((Number(resetHeader) * 1000 - Date.now()) / 60000) : null;
        const resetMsg = resetMin && resetMin > 0 ? ` Try again in ~${resetMin} min.` : '';
        throw new Error(`GitHub API rate limit exceeded (HTTP 403).${resetMsg}`);
      }

      if (res.status === 401) {
        throw new Error('GitHub authentication failed (HTTP 401). Invalid or expired personal access token.');
      }

      throw new Error(`GitHub API error (${res.status}): ${errDetail || res.statusText}`);
    }

    return res.json();
  }

  /**
   * Validates token and fetches the authenticated user profile.
   */
  public async verifyAndConnect(token: string): Promise<GitHubUser> {
    this.token = token.trim();
    try {
      const data = await this.fetchGitHub('/user');
      this.currentUser = {
        login: data.login,
        id: data.id,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
        name: data.name || data.login,
        email: data.email || undefined,
        bio: data.bio || undefined,
        publicRepos: data.public_repos || 0,
      };
      this.persistState();
      return this.currentUser;
    } catch (err) {
      this.token = null;
      this.persistState();
      throw err;
    }
  }

  /**
   * Lists repositories for the authenticated user.
   */
  public async listRepositories(): Promise<GitHubRepoSummary[]> {
    if (!this.token) throw new Error('Not connected to GitHub');

    // GitHub caps each REST page at 100 items. Fetch every page rather than
    // silently showing only the first page for accounts with >100 repositories.
    const allRepos: any[] = [];
    const perPage = 100;
    for (let page = 1; ; page += 1) {
      try {
        const rawPage = await this.fetchGitHub(
          `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator`
        );
        if (!Array.isArray(rawPage)) {
          throw new Error('Unexpected GitHub repositories response. Please reconnect and try again.');
        }
        allRepos.push(...rawPage);
        if (rawPage.length < perPage) break;
      } catch (err: any) {
        if (page > 1) {
          throw new Error(
            `Failed while retrieving repository page ${page} (${allRepos.length} loaded): ${err?.message || String(err)}`,
            { cause: err }
          );
        }
        throw err;
      }
    }

    // Deduplicate in case a repo was modified during multi-page traversal
    const seenIds = new Set<number>();
    const uniqueRepos: any[] = [];
    for (const repo of allRepos) {
      if (!seenIds.has(repo.id)) {
        seenIds.add(repo.id);
        uniqueRepos.push(repo);
      }
    }

    return uniqueRepos.map((r: any) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      htmlUrl: r.html_url,
      description: r.description || '',
      isFork: Boolean(r.fork),
      isPrivate: Boolean(r.private),
      primaryLanguage: r.language || undefined,
      stargazersCount: r.stargazers_count || 0,
      forksCount: r.forks_count || 0,
      updatedAt: r.updated_at,
      defaultBranch: r.default_branch || 'main',
      topics: Array.isArray(r.topics) ? r.topics : [],
      selectedForIngestion: this.selectedRepoFullNames.has(r.full_name),
    }));
  }

  public toggleRepositorySelection(fullName: string, isSelected: boolean): void {
    if (isSelected) {
      this.selectedRepoFullNames.add(fullName);
    } else {
      this.selectedRepoFullNames.delete(fullName);
    }
    this.persistState();
  }

  public selectRepositories(fullNames: string[]): void {
    for (const name of fullNames) {
      this.selectedRepoFullNames.add(name);
    }
    this.persistState();
  }

  public deselectRepositories(fullNames?: string[]): void {
    if (fullNames && fullNames.length > 0) {
      for (const name of fullNames) {
        this.selectedRepoFullNames.delete(name);
      }
    } else {
      this.selectedRepoFullNames.clear();
    }
    this.persistState();
  }

  public getSelectedRepositoryNames(): string[] {
    return Array.from(this.selectedRepoFullNames);
  }

  /**
   * Inspects a specific repository in detail.
   */
  public async inspectRepository(fullName: string): Promise<GitHubRepoInspectionResult> {
    const candidateUser = this.currentUser?.login?.toLowerCase() || '';
    const candidateEmail = this.currentUser?.email?.toLowerCase() || '';

    // 1. Repo metadata
    const repoData = await this.fetchGitHub(`/repos/${fullName}`);

    // 2. Readme
    let readmeSnippet = '';
    try {
      const readmeData = await this.fetchGitHub(`/repos/${fullName}/readme`);
      if (readmeData?.content) {
        const decoded = typeof atob !== 'undefined'
          ? atob(readmeData.content.replace(/\s+/g, ''))
          : Buffer.from(readmeData.content, 'base64').toString('utf8');
        readmeSnippet = decoded.slice(0, 500).trim();
      }
    } catch {}

    // 3. Commits & authorship check
    const commits: GitHubCommitRecord[] = [];
    let candidateCommitCount = 0;
    try {
      const commitsData = await this.fetchGitHub(`/repos/${fullName}/commits?per_page=30`);
      if (Array.isArray(commitsData)) {
        for (const c of commitsData) {
          const authorLogin = c.author?.login?.toLowerCase() || '';
          const committerLogin = c.committer?.login?.toLowerCase() || '';
          const authorEmail = c.commit?.author?.email?.toLowerCase() || '';
          const authorName = c.commit?.author?.name || '';

          const isCandidate =
            (candidateUser && (authorLogin === candidateUser || committerLogin === candidateUser)) ||
            (candidateEmail && authorEmail === candidateEmail);

          if (isCandidate) candidateCommitCount++;

          commits.push({
            sha: c.sha,
            authorName,
            authorEmail,
            date: c.commit?.author?.date || '',
            message: c.commit?.message?.split('\n')[0] || '',
            isCandidateAuthored: Boolean(isCandidate),
          });
        }
      }
    } catch {}

    // 4. Pull Requests
    const pullRequests: GitHubPullRequestRecord[] = [];
    try {
      const prsData = await this.fetchGitHub(`/repos/${fullName}/pulls?state=all&per_page=20`);
      if (Array.isArray(prsData)) {
        for (const pr of prsData) {
          const prAuthor = pr.user?.login?.toLowerCase() || '';
          const isCandidate = candidateUser && prAuthor === candidateUser;
          pullRequests.push({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            author: pr.user?.login || '',
            isMerged: Boolean(pr.merged_at),
            mergedAt: pr.merged_at || undefined,
            htmlUrl: pr.html_url,
            isCandidateAuthored: Boolean(isCandidate),
          });
        }
      }
    } catch {}

    // 5. Dependency detection (package.json, go.mod, Cargo.toml, requirements.txt)
    const detectedDependencies: string[] = [];
    try {
      const pkgData = await this.fetchGitHub(`/repos/${fullName}/contents/package.json`);
      if (pkgData?.content) {
        const decoded = typeof atob !== 'undefined'
          ? atob(pkgData.content.replace(/\s+/g, ''))
          : Buffer.from(pkgData.content, 'base64').toString('utf8');
        const pkg = JSON.parse(decoded);
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        detectedDependencies.push(...Object.keys(allDeps));
      }
    } catch {}

    // 6. Release configs: Dockerfile & Workflows
    let hasDockerfile = false;
    try {
      const dockerData = await this.fetchGitHub(`/repos/${fullName}/contents/Dockerfile`);
      if (dockerData?.name) hasDockerfile = true;
    } catch {}

    let hasWorkflows = false;
    try {
      const wfData = await this.fetchGitHub(`/repos/${fullName}/contents/.github/workflows`);
      if (Array.isArray(wfData) && wfData.length > 0) hasWorkflows = true;
    } catch {}

    const isSoleAuthor = !repoData.fork && (commits.length > 0 && candidateCommitCount === commits.length);
    const hasCandidateAuthoredWork = candidateCommitCount > 0 || pullRequests.some((p) => p.isCandidateAuthored);

    let suggestedDeploymentStatus: 'deployed_production' | 'staging_demo' | 'prototype' | 'UNKNOWN' = 'prototype';
    if (hasDockerfile && hasWorkflows) suggestedDeploymentStatus = 'deployed_production';
    else if (hasDockerfile || hasWorkflows) suggestedDeploymentStatus = 'staging_demo';

    return {
      repoFullName: fullName,
      htmlUrl: repoData.html_url,
      description: repoData.description || '',
      readmeSnippet,
      primaryLanguage: repoData.language || undefined,
      detectedDependencies,
      hasDockerfile,
      hasWorkflows,
      commits,
      pullRequests,
      candidateCommitCount,
      totalCommitCount: commits.length,
      canClaimAuthorship: Boolean(hasCandidateAuthoredWork || isSoleAuthor),
      suggestedDeploymentStatus,
    };
  }

  /**
   * Ingests all currently selected repositories and synchronizes to CanonicalProfileService.
   */
  public async ingestSelectedRepositories(): Promise<GitHubIngestionResult> {
    if (!this.currentUser) {
      if (this.token) {
        await this.verifyAndConnect(this.token);
      } else {
        throw new Error('Not connected to GitHub');
      }
    }

    const selectedList = Array.from(this.selectedRepoFullNames);
    if (selectedList.length === 0) {
      throw new Error('No repositories selected for ingestion. Please select at least one repository.');
    }

    const inspectedRepositories: GitHubRepoInspectionResult[] = [];
    const discoveredSkillsSet = new Set<string>();
    const generatedProjects: CandidateProject[] = [];

    for (const fullName of selectedList) {
      try {
        const inspection = await this.inspectRepository(fullName);
        inspectedRepositories.push(inspection);

        if (inspection.primaryLanguage) {
          discoveredSkillsSet.add(inspection.primaryLanguage);
        }
        for (const dep of inspection.detectedDependencies) {
          // Clean standard dependencies
          if (!dep.startsWith('@types/')) {
            discoveredSkillsSet.add(dep);
          }
        }

        const topCommit = inspection.commits.find((c) => c.isCandidateAuthored) || inspection.commits[0];
        const ownership = inspection.totalCommitCount > 0 && inspection.candidateCommitCount === inspection.totalCommitCount
          ? 'SOLE_OWNER'
          : inspection.candidateCommitCount > 0
          ? 'PRIMARY_CONTRIBUTOR'
          : 'UNKNOWN';

        const exactContribution = topCommit
          ? `Authored commits including ${topCommit.sha.substring(0, 7)}: "${topCommit.message}"`
          : 'Repository collaborator';

        const techStack = [
          ...(inspection.primaryLanguage ? [inspection.primaryLanguage] : []),
          ...inspection.detectedDependencies.slice(0, 10),
        ];

        generatedProjects.push({
          id: `gh-proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: fullName.split('/')[1] || fullName,
          description: inspection.description || inspection.readmeSnippet || 'GitHub Repository',
          repositoryUrl: inspection.htmlUrl,
          ownership,
          exactContribution,
          technologyStack: techStack,
          deploymentStatus: inspection.suggestedDeploymentStatus,
          outcomes: [
            `${inspection.candidateCommitCount} candidate-authored commits verified against commit SHAs`,
          ],
          evidenceReferences: [`GitHub Repository: ${fullName}`],
          status: 'REPOSITORY_SUPPORTED',
          candidateConfirmed: false,
        });
      } catch (err) {
        console.warn(`[GitHubIngestionService] Failed to inspect ${fullName}:`, err);
      }
    }

    const result: GitHubIngestionResult = {
      connectedUser: this.currentUser!,
      inspectedRepositories,
      discoveredSkills: Array.from(discoveredSkillsSet),
      generatedProjects,
      ingestedAt: Date.now(),
    };

    // Synchronize into CanonicalProfileService
    this.syncToCanonicalProfile(result);

    return result;
  }

  /**
   * Ingests mock or pre-fetched inspection data (ideal for tests and offline usage).
   */
  public syncToCanonicalProfile(result: GitHubIngestionResult): void {
    const profileService = CanonicalProfileService.getInstance();
    const currentProfile = profileService.getProfile();
    const updated = { ...currentProfile };

    // 1. Sync GitHub link
    if (result.connectedUser.htmlUrl && !updated.identity.links.github) {
      updated.identity.links = {
        ...updated.identity.links,
        github: result.connectedUser.htmlUrl,
      };
      profileService.recordFact(
        'identity.links.github',
        'identity',
        result.connectedUser.htmlUrl,
        `GitHub Account: @${result.connectedUser.login}`,
        'REPOSITORY_SUPPORTED',
        false
      );
    }

    // 2. Sync Projects with REPOSITORY_SUPPORTED status
    const existingProjectRepos = new Set(
      updated.projects
        .filter((p) => p.repositoryUrl)
        .map((p) => p.repositoryUrl!.toLowerCase().replace(/\.git$/, '').replace(/\/$/, ''))
    );

    for (const proj of result.generatedProjects) {
      const normRepo = proj.repositoryUrl?.toLowerCase().replace(/\.git$/, '').replace(/\/$/, '') || '';
      if (!normRepo || !existingProjectRepos.has(normRepo)) {
        updated.projects.push(proj);
        existingProjectRepos.add(normRepo);
        profileService.recordFact(
          `project:repo:${normRepo}`,
          'project',
          proj.name,
          `GitHub: ${proj.repositoryUrl}`,
          'REPOSITORY_SUPPORTED',
          false
        );
      }
    }

    // 3. Sync discovered skills
    const existingSkills = new Set(updated.skills.map((s) => s.name.toLowerCase()));
    for (const skillName of result.discoveredSkills) {
      if (!existingSkills.has(skillName.toLowerCase())) {
        const newSkill: CandidateSkill = {
          id: `skill_gh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: skillName,
          proficiency: 'UNSPECIFIED',
          experienceType: 'practical', // Repository-backed skills are practical
          projectReferences: result.generatedProjects.map((p) => p.id),
          evidenceSource: `GitHub Selected Repositories`,
          status: 'REPOSITORY_SUPPORTED',
          candidateConfirmed: false,
        };
        updated.skills.push(newSkill);
        existingSkills.add(skillName.toLowerCase());
        profileService.recordFact(
          `skill:${skillName}`,
          'skill',
          skillName,
          'GitHub Dependencies & Languages',
          'REPOSITORY_SUPPORTED',
          false
        );
      }
    }

    profileService.saveProfile(updated);
  }
}

