/**
 * Candidate Knowledge Vault Service
 * Manages the unified, persistent candidate knowledge graph, evidence provenance,
 * deduplication, and hybrid retrieval.
 */

import {
  CandidateKnowledgeVault,
  CandidateProfile,
  CandidateSource,
  EvidenceRecord,
  ExperienceRecord,
  ProjectRecord,
  TechnologyRecord,
  KnowledgeQueryOptions,
  KnowledgeQueryResult,
  TechCategory,
  EvidenceClassification,
} from './types';
import { IngestionResult } from '../ingestion/types';
import { CrawledPage } from '../website/websiteIngestionTypes';

const STORAGE_KEY = 'iac_candidate_knowledge_vault_v2';
const SCHEMA_VERSION = 2;

function createEmptyProfile(): CandidateProfile {
  return {
    id: `cand-${Date.now()}`,
    name: '',
    email: '',
    phone: '',
    location: '',
    links: {},
    summary: '',
    evidenceIds: [],
  };
}

export function createInitialVault(): CandidateKnowledgeVault {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: createEmptyProfile(),
    sources: [],
    experiences: [],
    projects: [],
    technologies: [],
    evidenceRecords: [],
    relationships: [],
    unreviewedClaims: [],
    lastSavedAt: Date.now(),
  };
}

export class KnowledgeVaultService {
  private static instance: KnowledgeVaultService | null = null;
  private currentVault: CandidateKnowledgeVault;
  private listeners: Array<(vault: CandidateKnowledgeVault) => void> = [];

  private constructor() {
    this.currentVault = this.loadFromStorage();
  }

  public static getInstance(): KnowledgeVaultService {
    if (!KnowledgeVaultService.instance) {
      KnowledgeVaultService.instance = new KnowledgeVaultService();
    }
    return KnowledgeVaultService.instance;
  }

  public getVault(): CandidateKnowledgeVault {
    return this.currentVault;
  }

  public subscribe(listener: (vault: CandidateKnowledgeVault) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentVault);
      } catch (e) {
        console.error('[KnowledgeVault] Listener error:', e);
      }
    }
  }

  public saveVault(vault: CandidateKnowledgeVault, persist = true): void {
    this.currentVault = {
      ...vault,
      lastSavedAt: Date.now(),
    };
    if (persist && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentVault));
      } catch (e) {
        console.error('[KnowledgeVault] Failed to save to localStorage:', e);
      }
    }
    this.notify();
  }

  public resetVault(): boolean {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.error('[KnowledgeVault] Reset failed:', e);
        return false;
      }
    }

    this.currentVault = createInitialVault();
    this.notify();
    return true;
  }

  private loadFromStorage(): CandidateKnowledgeVault {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.schemaVersion === SCHEMA_VERSION) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('[KnowledgeVault] Failed to parse vault from storage:', e);
      }
    }
    return createInitialVault();
  }

  /**
   * Ingest and merge results from a parsed resume or document
   */
  public populateFromIngestionResult(result: IngestionResult): void {
    const vault = { ...this.currentVault };
    const sourceEvidenceIds: string[] = [];

    // 1. Add Source Record
    const existingSourceIdx = vault.sources.findIndex((s) => s.sourceId === result.sourceId);
    const sourceRecord: CandidateSource = {
      sourceId: result.sourceId,
      sourceType: result.sourceType,
      title: result.documentTitle,
      urlOrPath: result.documentTitle,
      hash: `hash-${result.rawText.length}-${result.ingestedAt}`,
      addedAt: result.ingestedAt,
      lastUpdatedAt: Date.now(),
      rawSnippetCount: result.claims.length,
    };

    if (existingSourceIdx >= 0) {
      vault.sources[existingSourceIdx] = sourceRecord;
    } else {
      vault.sources.push(sourceRecord);
    }

    // 2. Generate Evidence Records from Claims
    for (const claim of result.claims) {
      const evId = `ev-${claim.claimId}`;
      const evRecord: EvidenceRecord = {
        evidenceId: evId,
        sourceId: result.sourceId,
        sourceType: result.sourceType,
        rawSnippet: claim.rawText,
        contentHash: `hash-${claim.claimId}`,
        classification: claim.evidenceStatus as EvidenceClassification,
        confidence: claim.extractionConfidence,
        capturedAt: Date.now(),
      };
      vault.evidenceRecords.push(evRecord);
      sourceEvidenceIds.push(evId);
    }

    // 3. Update Profile if currently empty or newly extracted
    if (!vault.profile.name && result.personalProfile.fullName) {
      vault.profile.name = result.personalProfile.fullName;
    }
    if (!vault.profile.email && result.personalProfile.email) {
      vault.profile.email = result.personalProfile.email;
    }
    if (!vault.profile.phone && result.personalProfile.phone) {
      vault.profile.phone = result.personalProfile.phone;
    }
    if (!vault.profile.location && result.personalProfile.location) {
      vault.profile.location = result.personalProfile.location;
    }
    vault.profile.links = {
      ...vault.profile.links,
      github: result.personalProfile.githubUrl || vault.profile.links.github,
      linkedin: result.personalProfile.linkedinUrl || vault.profile.links.linkedin,
      portfolio: result.personalProfile.websites?.[0] || vault.profile.links.portfolio,
      other: result.personalProfile.websites?.slice(1) || vault.profile.links.other,
    };
    vault.profile.evidenceIds = Array.from(
      new Set([...vault.profile.evidenceIds, ...sourceEvidenceIds])
    );

    // 4. Ingest and Deduplicate Experience Records
    for (const emp of result.employment) {
      const existingExp = vault.experiences.find(
        (e) =>
          e.company.toLowerCase().trim() === emp.employer.toLowerCase().trim() &&
          e.role.toLowerCase().trim() === emp.role.toLowerCase().trim()
      );

      if (existingExp) {
        // Merge responsibilities and technologies
        existingExp.responsibilities = Array.from(
          new Set([...existingExp.responsibilities, ...emp.responsibilities])
        );
        existingExp.technologies = Array.from(
          new Set([...existingExp.technologies, ...emp.technologies])
        );
        existingExp.metrics = Array.from(new Set([...existingExp.metrics, ...emp.metrics]));
        existingExp.evidenceIds = Array.from(
          new Set([...existingExp.evidenceIds, ...sourceEvidenceIds])
        );
      } else {
        const expId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newExp: ExperienceRecord = {
          id: expId,
          company: emp.employer,
          role: emp.role,
          startDate: emp.startDate || 'Unknown',
          endDate: emp.endDate || 'Present',
          isCurrent: emp.isCurrentRole,
          durationMonths: emp.durationMonths || 0,
          location: undefined,
          responsibilities: emp.responsibilities,
          technologies: emp.technologies,
          metrics: emp.metrics,
          associatedProjectIds: [],
          evidenceIds: [...sourceEvidenceIds],
          status: 'RESUME_REPORTED',
        };
        vault.experiences.push(newExp);

        // Add relationship
        vault.relationships.push({
          id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromType: 'candidate',
          fromId: vault.profile.id,
          relation: 'worked_at',
          toType: 'experience',
          toId: expId,
        });
      }
    }

    // 5. Ingest and Deduplicate Projects
    for (const proj of result.projects) {
      const existingProj = vault.projects.find(
        (p) => p.title.toLowerCase().trim() === proj.name.toLowerCase().trim()
      );

      if (existingProj) {
        existingProj.technologies = Array.from(
          new Set([...existingProj.technologies, ...proj.technologies])
        );
        existingProj.outcomes = Array.from(new Set([...existingProj.outcomes, ...proj.outcomes]));
        existingProj.metrics = Array.from(new Set([...existingProj.metrics, ...proj.metrics]));
        existingProj.evidenceIds = Array.from(
          new Set([...existingProj.evidenceIds, ...sourceEvidenceIds])
        );
      } else {
        const projId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newProj: ProjectRecord = {
          id: projId,
          title: proj.name,
          description: proj.description,
          role: proj.candidateRole,
          technologies: proj.technologies,
          architecture: proj.architecture,
          contributions: [
            {
              id: `contrib-${projId}-0`,
              description: proj.rawText || proj.description,
              ownership: proj.candidateRole === 'sole_author' ? 'SOLE_OWNER' : 'UNKNOWN',
            },
          ],
          outcomes: proj.outcomes,
          metrics: proj.metrics,
          repoUrl: proj.repositoryUrl,
          liveUrl: proj.documentationUrl,
          startDate: proj.startDate,
          endDate: proj.endDate,
          evidenceIds: [...sourceEvidenceIds],
          status: 'RESUME_REPORTED',
        };
        vault.projects.push(newProj);

        // Relationship
        vault.relationships.push({
          id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromType: 'candidate',
          fromId: vault.profile.id,
          relation: 'built',
          toType: 'project',
          toId: projId,
        });
      }
    }

    // 6. Ingest Technologies Inventory
    const allCategories: Array<{ cat: TechCategory; list: string[] }> = [
      { cat: 'language', list: result.skills.languages || [] },
      { cat: 'framework', list: result.skills.frameworks || [] },
      { cat: 'database', list: result.skills.databases || [] },
      {
        cat: 'tool',
        list: [
          ...(result.skills.tools || []),
          ...(result.skills.devops || []),
          ...(result.skills.testing || []),
        ],
      },
      { cat: 'cloud', list: result.skills.cloud || [] },
      {
        cat: 'architecture',
        list: [...(result.skills.architecture || []), ...(result.skills.messaging || [])],
      },
      { cat: 'ai_ml', list: result.skills.aiMl || [] },
    ];

    for (const { cat, list } of allCategories) {
      for (const techName of list) {
        if (!techName || techName.length < 2) continue;
        const existingTech = vault.technologies.find(
          (t) => t.name.toLowerCase().trim() === techName.toLowerCase().trim()
        );
        if (existingTech) {
          existingTech.evidenceIds = Array.from(
            new Set([...existingTech.evidenceIds, ...sourceEvidenceIds])
          );
        } else {
          vault.technologies.push({
            name: techName,
            category: cat,
            proficiency: 'proficient',
            associatedProjectIds: [],
            associatedExperienceIds: [],
            evidenceIds: [...sourceEvidenceIds],
          });
        }
      }
    }

    // 7. Append Unreviewed Claims
    vault.unreviewedClaims.push(...result.claims);

    this.saveVault(vault);
  }

  /**
   * Ingest and link crawled personal website pages
   */
  public populateFromWebsitePages(pages: CrawledPage[], seedUrl: string): void {
    const vault = { ...this.currentVault };
    const sourceId = `src-web-${Date.now()}`;
    const evidenceIds: string[] = [];

    // Register Website Source
    const sourceRecord: CandidateSource = {
      sourceId,
      sourceType: 'website_page',
      title: `Website Crawl (${seedUrl})`,
      urlOrPath: seedUrl,
      hash: `web-hash-${pages.length}-${Date.now()}`,
      addedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      rawSnippetCount: pages.reduce((acc, p) => acc + p.extractedClaims.length, 0),
    };
    vault.sources.push(sourceRecord);

    for (const page of pages) {
      // Ingest claims from each page
      for (const claim of page.extractedClaims) {
        const evId = `ev-web-${claim.claimId}`;
        const evRecord: EvidenceRecord = {
          evidenceId: evId,
          sourceId,
          sourceType: 'website_page',
          rawSnippet: claim.rawText,
          contentHash: `hash-${claim.claimId}`,
          classification: 'WEBSITE_REPORTED',
          confidence: claim.extractionConfidence,
          capturedAt: Date.now(),
          verificationNotes: `From ${page.canonicalUrl}`,
        };
        vault.evidenceRecords.push(evRecord);
        evidenceIds.push(evId);
        vault.unreviewedClaims.push(claim);
      }

      // Check if page highlights projects
      if (page.classification === 'projects' || page.title.toLowerCase().includes('project')) {
        for (const link of page.outboundLinks) {
          if (link.includes('github.com/') && !vault.projects.some((p) => p.repoUrl === link)) {
            const repoName = link.split('github.com/')[1]?.split('/')[1] || 'Portfolio Project';
            vault.projects.push({
              id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: repoName,
              description: `Project discovered from portfolio website: ${page.canonicalUrl}`,
              technologies: [],
              contributions: [],
              outcomes: [],
              metrics: [],
              repoUrl: link,
              evidenceIds: [...evidenceIds],
              status: 'WEBSITE_REPORTED',
            });
          }
        }
      }
    }

    this.saveVault(vault);
  }

  /**
   * Candidate review workflow for claims
   */
  public reviewClaim(
    claimId: string,
    action: 'confirm' | 'reject' | 'edit',
    editedValue?: string
  ): void {
    const vault = { ...this.currentVault };
    const claimIdx = vault.unreviewedClaims.findIndex((c) => c.claimId === claimId);
    if (claimIdx === -1) return;

    const claim = vault.unreviewedClaims[claimIdx];

    if (action === 'confirm') {
      claim.evidenceStatus = 'CANDIDATE_CONFIRMED';
      claim.reviewStatus = 'confirmed';
      // Elevate corresponding evidence record
      const ev = vault.evidenceRecords.find((e) => e.rawSnippet === claim.rawText);
      if (ev) {
        ev.classification = 'CANDIDATE_CONFIRMED';
        ev.verifiedAt = Date.now();
      }
    } else if (action === 'reject') {
      claim.evidenceStatus = 'CONTRADICTED';
      claim.reviewStatus = 'rejected';
      const ev = vault.evidenceRecords.find((e) => e.rawSnippet === claim.rawText);
      if (ev) {
        ev.classification = 'CONTRADICTED';
      }
    } else if (action === 'edit' && editedValue) {
      claim.rawText = editedValue;
      claim.normalizedValue = editedValue;
      claim.evidenceStatus = 'CANDIDATE_CONFIRMED';
      claim.reviewStatus = 'edited';
      const ev = vault.evidenceRecords.find((e) => e.rawSnippet === claim.rawText);
      if (ev) {
        ev.rawSnippet = editedValue;
        ev.classification = 'CANDIDATE_CONFIRMED';
        ev.verifiedAt = Date.now();
      }
    }

    // Remove from unreviewed queue if actioned
    vault.unreviewedClaims.splice(claimIdx, 1);
    this.saveVault(vault);
  }

  /**
   * Merge two entities (e.g. projects or experiences)
   */
  public mergeEntities(
    primaryId: string,
    secondaryId: string,
    entityType: 'project' | 'experience'
  ): void {
    const vault = { ...this.currentVault };

    if (entityType === 'project') {
      const pIdx = vault.projects.findIndex((p) => p.id === primaryId);
      const sIdx = vault.projects.findIndex((p) => p.id === secondaryId);
      if (pIdx === -1 || sIdx === -1) return;

      const primary = vault.projects[pIdx];
      const secondary = vault.projects[sIdx];

      primary.technologies = Array.from(
        new Set([...primary.technologies, ...secondary.technologies])
      );
      primary.outcomes = Array.from(new Set([...primary.outcomes, ...secondary.outcomes]));
      primary.metrics = Array.from(new Set([...primary.metrics, ...secondary.metrics]));
      primary.evidenceIds = Array.from(new Set([...primary.evidenceIds, ...secondary.evidenceIds]));
      primary.contributions.push(...secondary.contributions);

      // Re-point relationships
      for (const rel of vault.relationships) {
        if (rel.toId === secondaryId && rel.toType === 'project') {
          rel.toId = primaryId;
        }
      }

      vault.projects.splice(sIdx, 1);
    } else {
      const pIdx = vault.experiences.findIndex((e) => e.id === primaryId);
      const sIdx = vault.experiences.findIndex((e) => e.id === secondaryId);
      if (pIdx === -1 || sIdx === -1) return;

      const primary = vault.experiences[pIdx];
      const secondary = vault.experiences[sIdx];

      primary.responsibilities = Array.from(
        new Set([...primary.responsibilities, ...secondary.responsibilities])
      );
      primary.technologies = Array.from(
        new Set([...primary.technologies, ...secondary.technologies])
      );
      primary.metrics = Array.from(new Set([...primary.metrics, ...secondary.metrics]));
      primary.evidenceIds = Array.from(new Set([...primary.evidenceIds, ...secondary.evidenceIds]));

      for (const rel of vault.relationships) {
        if (rel.toId === secondaryId && rel.toType === 'experience') {
          rel.toId = primaryId;
        }
      }

      vault.experiences.splice(sIdx, 1);
    }

    this.saveVault(vault);
  }

  /**
   * Hybrid retrieval matching candidate knowledge against query
   */
  public query(options: KnowledgeQueryOptions): KnowledgeQueryResult {
    const q = options.query.toLowerCase().trim();
    const qTokens = q.split(/\W+/).filter((t) => t.length > 2);

    const matchedProjects: ProjectRecord[] = [];
    const matchedExperiences: ExperienceRecord[] = [];
    const matchedTechnologies: TechnologyRecord[] = [];
    const matchedEvidenceIds = new Set<string>();

    // 1. Match Technologies
    for (const tech of this.currentVault.technologies) {
      const tName = tech.name.toLowerCase();
      if (q.includes(tName) || qTokens.some((tok) => tok === tName)) {
        matchedTechnologies.push(tech);
        tech.evidenceIds.forEach((id) => matchedEvidenceIds.add(id));
      }
    }

    // 2. Match Projects
    for (const proj of this.currentVault.projects) {
      const pTitle = proj.title.toLowerCase();
      const pDesc = proj.description.toLowerCase();
      const hasTechMatch = proj.technologies.some((t) => q.includes(t.toLowerCase()));
      const hasTokenMatch = qTokens.some((tok) => pTitle.includes(tok) || pDesc.includes(tok));

      if (hasTechMatch || hasTokenMatch || q.includes(pTitle)) {
        matchedProjects.push(proj);
        proj.evidenceIds.forEach((id) => matchedEvidenceIds.add(id));
      }
    }

    // 3. Match Experiences
    for (const exp of this.currentVault.experiences) {
      const company = exp.company.toLowerCase();
      const role = exp.role.toLowerCase();
      const hasTechMatch = exp.technologies.some((t) => q.includes(t.toLowerCase()));
      const hasTokenMatch = qTokens.some((tok) => company.includes(tok) || role.includes(tok));

      if (hasTechMatch || hasTokenMatch || q.includes(company)) {
        matchedExperiences.push(exp);
        exp.evidenceIds.forEach((id) => matchedEvidenceIds.add(id));
      }
    }

    // 4. Retrieve Evidence Records
    const relevantEvidence = this.currentVault.evidenceRecords.filter((e) =>
      matchedEvidenceIds.has(e.evidenceId)
    );

    const hasMatch =
      matchedProjects.length > 0 || matchedExperiences.length > 0 || matchedTechnologies.length > 0;

    return {
      matchedProjects,
      matchedExperiences,
      matchedTechnologies,
      relevantEvidence,
      confidenceScore: hasMatch ? 0.9 : 0.0,
      exactMatch: matchedProjects.length > 0 || matchedExperiences.length > 0,
    };
  }

  public exportJson(): string {
    return JSON.stringify(this.currentVault, null, 2);
  }

  public importJson(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object' && parsed.schemaVersion) {
        this.saveVault(parsed);
        return true;
      }
    } catch (e) {
      console.error('[KnowledgeVault] Failed to import JSON:', e);
    }
    return false;
  }
}
