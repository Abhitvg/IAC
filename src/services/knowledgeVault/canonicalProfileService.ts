/**
 * Canonical Candidate Profile Service (IAC 2.0 - Phase 2)
 *
 * Centralizes the canonical candidate profile across the entire application.
 * Synchronizes with KnowledgeVaultService, CandidateKnowledgeBase, and CareerOps Vault.
 */

import {
  CanonicalCandidateProfile,
  createDefaultCanonicalProfile,
  CanonicalFact,
  createCanonicalFact,
  FactCategory,
  CandidateProject,
  CandidateSkill,
  CandidateWorkExperience,
} from './canonicalProfile';
import { KnowledgeVaultService } from './knowledgeVaultService';
import { CandidateKnowledgeBase } from '../candidateIntelligence';
import { IngestionResult } from '../ingestion/types';

const STORAGE_KEY = 'iac_canonical_candidate_profile_v2';

export class CanonicalProfileService {
  private static instance: CanonicalProfileService | null = null;
  private currentProfile: CanonicalCandidateProfile;
  private listeners: Array<(profile: CanonicalCandidateProfile) => void> = [];

  private constructor() {
    this.currentProfile = this.loadFromStorage();
  }

  public static getInstance(): CanonicalProfileService {
    if (!CanonicalProfileService.instance) {
      CanonicalProfileService.instance = new CanonicalProfileService();
    }
    return CanonicalProfileService.instance;
  }

  public getProfile(): CanonicalCandidateProfile {
    return this.currentProfile;
  }

  public subscribe(listener: (profile: CanonicalCandidateProfile) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentProfile);
      } catch (err) {
        console.error('[CanonicalProfileService] Notification error:', err);
      }
    }
  }

  public saveProfile(profile: CanonicalCandidateProfile): void {
    this.currentProfile = {
      ...profile,
      updatedAt: Date.now(),
    };

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentProfile));
      } catch (e) {
        console.error('[CanonicalProfileService] Failed to save profile to localStorage:', e);
      }
    }

    // Bidirectional sync with legacy stores
    this.syncToSubsystems(this.currentProfile);
    this.notify();
  }

  /**
   * Resets all candidate data to initial clean state.
   */
  public clearAllCandidateData(): void {
    this.currentProfile = createDefaultCanonicalProfile();

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.error('[CanonicalProfileService] Failed to clear localStorage:', e);
      }
    }

    try {
      KnowledgeVaultService.getInstance().resetVault();
    } catch (e) {
      console.warn('[CanonicalProfileService] Vault reset warning:', e);
    }

    this.notify();
  }

  /**
   * Adds or updates a single fact in the granular audit ledger.
   */
  public recordFact<T>(
    field: string,
    category: FactCategory,
    value: T,
    source: string,
    status: CanonicalFact['status'] = 'UNKNOWN',
    candidateConfirmed = false
  ): CanonicalFact<T> {
    const fact = createCanonicalFact(field, category, value, source, status, candidateConfirmed);
    const existing = this.currentProfile.factsLedger[field];

    if (existing) {
      fact.editHistory = [
        ...existing.editHistory,
        {
          timestamp: Date.now(),
          previousValue: existing.value,
          updatedBy: candidateConfirmed ? 'candidate' : 'system',
        },
      ];
    }

    this.currentProfile.factsLedger[field] = fact;
    this.saveProfile(this.currentProfile);
    return fact;
  }

  /**
   * Deletes an individual fact from the ledger.
   */
  public deleteFact(field: string): boolean {
    if (this.currentProfile.factsLedger[field]) {
      delete this.currentProfile.factsLedger[field];
      this.saveProfile(this.currentProfile);
      return true;
    }
    return false;
  }

  /**
   * Exports the complete canonical profile as JSON.
   */
  public exportJson(): string {
    return JSON.stringify(this.currentProfile, null, 2);
  }

  /**
   * Imports a canonical profile from validated JSON.
   */
  public importJson(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object' || !parsed.identity) {
        throw new Error('Invalid canonical profile JSON structure');
      }

      const defaultProfile = createDefaultCanonicalProfile();
      this.saveProfile({
        ...defaultProfile,
        ...parsed,
        updatedAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.error('[CanonicalProfileService] Failed to import JSON profile:', err);
      return false;
    }
  }

  /**
   * Imports structured data from resume ingestion without fabricating unverified claims.
   */
  public populateFromIngestion(result: IngestionResult): void {
    const updated = { ...this.currentProfile };
    const sourceLabel = `Resume: ${result.documentTitle || 'Uploaded File'}`;

    // Identity
    if (result.personalProfile) {
      if (result.personalProfile.fullName && !updated.identity.candidateConfirmed) {
        updated.identity.fullName = result.personalProfile.fullName;
        this.recordFact('fullName', 'identity', result.personalProfile.fullName, sourceLabel, 'RESUME_REPORTED', false);
      }
      if (result.personalProfile.email && !updated.identity.candidateConfirmed) {
        updated.identity.email = result.personalProfile.email;
        this.recordFact('email', 'identity', result.personalProfile.email, sourceLabel, 'RESUME_REPORTED', false);
      }
      if (result.personalProfile.phone && !updated.identity.candidateConfirmed) {
        updated.identity.phone = result.personalProfile.phone;
      }
      if (result.personalProfile.location && !updated.identity.candidateConfirmed) {
        updated.identity.location = result.personalProfile.location;
      }
      if (result.personalProfile.githubUrl || result.personalProfile.linkedinUrl) {
        updated.identity.links = {
          ...updated.identity.links,
          github: result.personalProfile.githubUrl || updated.identity.links.github,
          linkedin: result.personalProfile.linkedinUrl || updated.identity.links.linkedin,
        };
      }
    }

    // Skills: Flatten categories from ExtractedSkillsInventory
    if (result.skills) {
      const allExtractedSkills = [
        ...(result.skills.languages || []),
        ...(result.skills.frameworks || []),
        ...(result.skills.databases || []),
        ...(result.skills.cloud || []),
        ...(result.skills.messaging || []),
        ...(result.skills.devops || []),
        ...(result.skills.tools || []),
        ...(result.skills.architecture || []),
        ...(result.skills.aiMl || []),
      ];

      const existingSkillNames = new Set(updated.skills.map((s) => s.name.toLowerCase()));
      for (const skillName of allExtractedSkills) {
        if (!existingSkillNames.has(skillName.toLowerCase())) {
          const newSkill: CandidateSkill = {
            id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: skillName,
            proficiency: 'intermediate',
            experienceType: 'theoretical', // Invariant: Resume mention defaults to theoretical until linked to verified project
            yearsUsed: 1,
            projectReferences: [],
            evidenceSource: sourceLabel,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.skills.push(newSkill);
          this.recordFact(`skill:${skillName}`, 'skill', skillName, sourceLabel, 'RESUME_REPORTED', false);
        }
      }
    }

    // Education
    if (result.education && result.education.length > 0) {
      const existingEdu = new Set(updated.education.map((e) => `${e.institution}_${e.degree}`.toLowerCase()));
      for (const edu of result.education) {
        const key = `${edu.institution}_${edu.degree}`.toLowerCase();
        if (!existingEdu.has(key)) {
          updated.education.push({
            id: `edu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            institution: edu.institution,
            degree: edu.degree,
            fieldOfStudy: edu.department || '',
            startDate: edu.startDate,
            endDate: edu.endDate,
            grade: edu.gradeGpa,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          });
        }
      }
    }

    // Work Experience
    if (result.employment && result.employment.length > 0) {
      const existingRoles = new Set(updated.experience.map((e) => `${e.employer}_${e.title}`.toLowerCase()));
      for (const exp of result.employment) {
        const key = `${exp.employer}_${exp.role}`.toLowerCase();
        if (!existingRoles.has(key)) {
          const newExp: CandidateWorkExperience = {
            id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            employer: exp.employer,
            title: exp.role,
            startDate: exp.startDate || '',
            endDate: exp.endDate || '',
            isCurrent: exp.isCurrentRole || false,
            responsibilities: exp.responsibilities || [],
            personallyImplemented: [], // Invariant: Raw resume bullets are unverified
            teamContributions: [],
            leadershipResponsibilities: [],
            outcomesAndMetrics: exp.metrics || [],
            technologiesUsed: exp.technologies || [],
            missingOrUncertainFacts: ['Personal implementation ownership unconfirmed'],
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.experience.push(newExp);
        }
      }
    }

    // Projects
    if (result.projects && result.projects.length > 0) {
      const existingProjectNames = new Set(updated.projects.map((p) => p.name.toLowerCase()));
      for (const proj of result.projects) {
        if (!existingProjectNames.has(proj.name.toLowerCase())) {
          const newProj: CandidateProject = {
            id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: proj.name,
            description: proj.description || '',
            repositoryUrl: proj.repositoryUrl,
            projectUrl: proj.documentationUrl,
            ownership: 'UNKNOWN', // Invariant: Never assume authorship from resume
            exactContribution: '',
            technologyStack: proj.technologies || [],
            deploymentStatus: 'unreleased',
            outcomes: proj.outcomes || [],
            evidenceReferences: [sourceLabel],
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.projects.push(newProj);
        }
      }
    }

    this.saveProfile(updated);
  }

  /**
   * Syncs the canonical profile to legacy subsystems so existing views stay synchronized.
   */
  private syncToSubsystems(profile: CanonicalCandidateProfile): void {
    // 1. Sync with KnowledgeVaultService
    try {
      const kv = KnowledgeVaultService.getInstance();
      const vault = kv.getVault();
      vault.profile = {
        id: profile.id,
        name: profile.identity.fullName,
        email: profile.identity.email,
        phone: profile.identity.phone || '',
        location: profile.identity.location,
        links: profile.identity.links,
        evidenceIds: [],
      };
      kv.saveVault(vault);
    } catch (e) {
      // Ignored if KnowledgeVaultService not initialized yet
    }

    // 2. Sync with CandidateKnowledgeBase
    try {
      const kb = CandidateKnowledgeBase.getActiveKnowledgeBase();
      for (const p of profile.projects) {
        const safeStatus = (p.status === 'EXPIRED' ? 'UNKNOWN' : p.status) as any;
        const legacyOwnership =
          p.ownership === 'SOLE_OWNER'
            ? 'sole_owner'
            : p.ownership === 'PRIMARY_CONTRIBUTOR'
            ? 'core_contributor'
            : p.ownership === 'COLLABORATOR'
            ? 'contributor'
            : 'unknown';

        kb.registerProject({
          name: p.name,
          ownership: legacyOwnership,
          technologyStack: p.technologyStack,
          repositoryUrl: p.repositoryUrl,
          architecture: p.architecture || 'UNKNOWN',
          personalContribution: p.exactContribution || undefined,
          verificationStatus: safeStatus,
        });
      }
    } catch (e) {
      // Ignored if CandidateKnowledgeBase not active
    }
  }

  private loadFromStorage(): CanonicalCandidateProfile {
    const defaultProfile = createDefaultCanonicalProfile();
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return {
              ...defaultProfile,
              ...parsed,
              identity: { ...defaultProfile.identity, ...(parsed.identity || {}) },
              career: { ...defaultProfile.career, ...(parsed.career || {}) },
              preferences: { ...defaultProfile.preferences, ...(parsed.preferences || {}) },
              declarations: { ...defaultProfile.declarations, ...(parsed.declarations || {}) },
              factsLedger: parsed.factsLedger || {},
            };
          }
        }
      } catch (e) {
        console.error('[CanonicalProfileService] Failed to load profile from localStorage:', e);
      }
    }
    return defaultProfile;
  }
}
