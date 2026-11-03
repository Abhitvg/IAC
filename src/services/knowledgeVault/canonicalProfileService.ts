/**
 * Canonical Candidate Profile Service (IAC 2.0 - Phase 2)
 *
 * Centralizes the canonical candidate profile across the entire application.
 * Manages bidirectional synchronization with KnowledgeVaultService,
 * CandidateKnowledgeBase, and CareerOps Vault with reentrancy protection.
 *
 * Enforces runtime schema validation, status upgrade protection,
 * and immutable deletion audit trails.
 */

import {
  CanonicalCandidateProfile,
  createDefaultCanonicalProfile,
  CanonicalFact,
  FactCategory,
  CandidateProject,
  CandidateSkill,
  CandidateWorkExperience,
  CandidateEducation,
  CandidateAchievement,
} from './canonicalProfile';
import { KnowledgeVaultService } from './knowledgeVaultService';
import { CandidateKnowledgeBase } from '../candidateIntelligence';
import { IngestionResult } from '../ingestion/types';
import { validateCanonicalProfile } from './schemaValidation';
import { useCandidateVaultStore } from '../../store/useCandidateVaultStore';

const STORAGE_KEY = 'iac_canonical_candidate_profile_v2';

export class CanonicalProfileService {
  private static instance: CanonicalProfileService | null = null;
  private currentProfile: CanonicalCandidateProfile;
  private listeners: Array<(profile: CanonicalCandidateProfile) => void> = [];
  private isSyncing = false;

  private constructor() {
    this.currentProfile = this.loadFromStorage();
    this.setupBidirectionalListeners();
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
   * Resets all candidate data to initial clean state with zero fabrications.
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

    this.syncToSubsystems(this.currentProfile);
    this.notify();
  }

  /**
   * Adds or updates a single fact in the granular audit ledger.
   * Enforces Status-Upgrade Protection: manual candidate edits can never
   * silently upgrade evidence status to INDEPENDENTLY_VERIFIED.
   */
  public recordFact<T>(
    field: string,
    category: FactCategory,
    value: T,
    source: string,
    requestedStatus: CanonicalFact['status'] = 'UNKNOWN',
    candidateConfirmed = false,
    sourceUrlOrFile?: string
  ): CanonicalFact<T> {
    const existing = this.currentProfile.factsLedger[field];

    // Status Upgrade Protection
    let safeStatus = requestedStatus;
    if (candidateConfirmed && requestedStatus === 'INDEPENDENTLY_VERIFIED' && (!existing || existing.status !== 'INDEPENDENTLY_VERIFIED')) {
      safeStatus = 'CANDIDATE_CONFIRMED';
    }

    const now = Date.now();
    const fact: CanonicalFact<T> = {
      id: existing?.id || `fact_${category}_${field.replace(/[^a-zA-Z0-9_]/g, '_')}_${now}`,
      category,
      field,
      value,
      source,
      sourceUrlOrFile: sourceUrlOrFile || existing?.sourceUrlOrFile,
      status: safeStatus,
      confidence: safeStatus === 'INDEPENDENTLY_VERIFIED' ? 1.0 : candidateConfirmed ? 0.95 : 0.6,
      candidateConfirmed,
      confirmedAt: candidateConfirmed ? (existing?.confirmedAt || now) : undefined,
      createdAt: existing?.createdAt || now,
      lastVerifiedAt: safeStatus === 'INDEPENDENTLY_VERIFIED' || candidateConfirmed ? now : existing?.lastVerifiedAt,
      isExpired: false,
      isDeleted: false,
      editHistory: existing?.editHistory ? [...existing.editHistory] : [],
    };

    if (existing) {
      fact.editHistory.push({
        timestamp: now,
        previousValue: existing.value,
        updatedBy: candidateConfirmed ? 'candidate' : 'system',
        reason: 'Fact updated',
        action: 'UPDATED',
      });
    } else {
      fact.editHistory.push({
        timestamp: now,
        updatedBy: candidateConfirmed ? 'candidate' : 'ingestion',
        action: 'CREATED',
      });
    }

    this.currentProfile.factsLedger[field] = fact;
    this.saveProfile(this.currentProfile);
    return fact;
  }

  /**
   * Deletes an individual fact with an immutable audit tombstone.
   * Does NOT silently erase history.
   */
  public deleteFact(field: string, reason = 'Candidate requested deletion'): boolean {
    const existing = this.currentProfile.factsLedger[field];
    if (existing && !existing.isDeleted) {
      const now = Date.now();
      existing.isDeleted = true;
      existing.editHistory.push({
        timestamp: now,
        previousValue: existing.value,
        updatedBy: 'candidate',
        reason,
        action: 'DELETED',
      });
      this.currentProfile.factsLedger[field] = existing;
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
   * Imports a canonical profile from validated JSON with Zod schema checking and migrations.
   */
  public importJson(jsonStr: string): { success: boolean; errors?: string[] } {
    try {
      const parsed = JSON.parse(jsonStr);
      const validation = validateCanonicalProfile(parsed);
      if (!validation.success) {
        console.warn('[CanonicalProfileService] Schema validation failed for imported JSON:', validation.errors);
        return { success: false, errors: validation.errors };
      }

      this.saveProfile(validation.profile);
      return { success: true };
    } catch (err: any) {
      return { success: false, errors: [err?.message || 'Malformed JSON syntax'] };
    }
  }

  /**
   * Imports structured data from resume ingestion without inventing defaults.
   */
  public populateFromIngestion(result: IngestionResult): void {
    const updated = { ...this.currentProfile };
    const sourceLabel = `Resume: ${result.documentTitle || 'Uploaded File'}`;

    // Identity
    if (result.personalProfile) {
      if (result.personalProfile.fullName && !updated.identity.candidateConfirmed) {
        updated.identity.fullName = result.personalProfile.fullName;
        this.recordFact('identity.fullName', 'identity', result.personalProfile.fullName, sourceLabel, 'RESUME_REPORTED', false);
      }
      if (result.personalProfile.email && !updated.identity.candidateConfirmed) {
        updated.identity.email = result.personalProfile.email;
        this.recordFact('identity.email', 'identity', result.personalProfile.email, sourceLabel, 'RESUME_REPORTED', false);
      }
      if (result.personalProfile.phone && !updated.identity.candidateConfirmed) {
        updated.identity.phone = result.personalProfile.phone;
        this.recordFact('identity.phone', 'identity', result.personalProfile.phone, sourceLabel, 'RESUME_REPORTED', false);
      }
      if (result.personalProfile.location && !updated.identity.candidateConfirmed) {
        updated.identity.location = result.personalProfile.location;
        this.recordFact('identity.location', 'identity', result.personalProfile.location, sourceLabel, 'RESUME_REPORTED', false);
      }
      if (result.personalProfile.githubUrl || result.personalProfile.linkedinUrl) {
        updated.identity.links = {
          ...updated.identity.links,
          github: result.personalProfile.githubUrl || updated.identity.links.github,
          linkedin: result.personalProfile.linkedinUrl || updated.identity.links.linkedin,
        };
      }
    }

    // Skills: No invented yearsUsed or proficiency
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
            proficiency: 'UNSPECIFIED', // Zero invented proficiency
            experienceType: 'theoretical', // Resume mentions default to theoretical until linked to verified project
            yearsUsed: undefined, // Zero invented years
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
          const newEdu: CandidateEducation = {
            id: `edu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            institution: edu.institution,
            degree: edu.degree,
            fieldOfStudy: edu.department || '',
            startDate: edu.startDate,
            endDate: edu.endDate,
            grade: edu.gradeGpa,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.education.push(newEdu);
          this.recordFact(`education:${key}`, 'education', `${edu.degree} from ${edu.institution}`, sourceLabel, 'RESUME_REPORTED', false);
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
          this.recordFact(`experience:${key}`, 'experience', `${exp.role} at ${exp.employer}`, sourceLabel, 'RESUME_REPORTED', false);
        }
      }
    }

    // Projects: Zero invented ownership or outcomes
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
            ownership: 'UNKNOWN', // Zero invented authorship
            exactContribution: '',
            technologyStack: proj.technologies || [],
            deploymentStatus: 'UNKNOWN',
            outcomes: proj.outcomes || [],
            evidenceReferences: [sourceLabel],
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.projects.push(newProj);
          this.recordFact(`project:${proj.name}`, 'project', proj.name, sourceLabel, 'RESUME_REPORTED', false);
        }
      }
    }

    // Achievements
    if (result.achievements && result.achievements.length > 0) {
      const existingAchievements = new Set(updated.achievements.map((a) => a.title.toLowerCase()));
      for (const ach of result.achievements) {
        if (!existingAchievements.has(ach.headline.toLowerCase())) {
          const newAch: CandidateAchievement = {
            id: `ach_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            title: ach.headline,
            category: 'outcome',
            description: ach.context,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.achievements.push(newAch);
          this.recordFact(`achievement:${ach.headline}`, 'achievement', ach.headline, sourceLabel, 'RESUME_REPORTED', false);
        }
      }
    }

    this.saveProfile(updated);
  }

  /**
   * Sets up bidirectional event listeners to legacy subsystems.
   */
  private setupBidirectionalListeners(): void {
    // 1. Listen to KnowledgeVaultService updates
    try {
      KnowledgeVaultService.getInstance().subscribe((vault) => {
        if (this.isSyncing) return;
        this.syncFromKnowledgeVault(vault);
      });
    } catch (e) {
      console.warn('[CanonicalProfileService] KnowledgeVault subscription error:', e);
    }

    // 2. Listen to useCandidateVaultStore (CareerOps) updates
    try {
      useCandidateVaultStore.subscribe((state) => {
        if (this.isSyncing || !state?.profile) return;
        this.syncFromCareerOpsVault(state.profile);
      });
    } catch (e) {
      console.warn('[CanonicalProfileService] CareerOps subscription error:', e);
    }
  }

  /**
   * Syncs changes from KnowledgeVaultService into CanonicalProfileService.
   */
  public syncFromKnowledgeVault(vault: any): void {
    if (this.isSyncing || !vault) return;
    this.isSyncing = true;
    try {
      const updated = { ...this.currentProfile };
      let changed = false;

      // Sync projects from vault
      if (Array.isArray(vault.projects)) {
        const existingProjectNames = new Set(updated.projects.map((p) => p.name.toLowerCase()));
        for (const vp of vault.projects) {
          if (!existingProjectNames.has(vp.title.toLowerCase())) {
            updated.projects.push({
              id: vp.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: vp.title,
              description: vp.description || '',
              repositoryUrl: vp.repoUrl,
              projectUrl: vp.liveUrl,
              ownership: 'UNKNOWN',
              exactContribution: (vp.contributions?.[0]?.description) || '',
              technologyStack: vp.technologies || [],
              deploymentStatus: 'UNKNOWN',
              outcomes: vp.outcomes || [],
              evidenceReferences: vp.evidenceIds || [],
              status: vp.status || 'UNKNOWN',
              candidateConfirmed: vp.status === 'CANDIDATE_CONFIRMED',
            });
            changed = true;
          }
        }
      }

      if (changed) {
        this.currentProfile = updated;
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentProfile));
        }
        this.notify();
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Syncs user-supplied values from CareerOps vault into CanonicalProfileService.
   */
  public syncFromCareerOpsVault(careerVault: any): void {
    if (this.isSyncing || !careerVault || !careerVault.isUserSupplied) return;
    this.isSyncing = true;
    try {
      const updated = { ...this.currentProfile };
      let changed = false;

      if (careerVault.fullName && careerVault.fullName !== updated.identity.fullName) {
        updated.identity.fullName = careerVault.fullName;
        changed = true;
      }
      if (careerVault.email && careerVault.email !== updated.identity.email) {
        updated.identity.email = careerVault.email;
        changed = true;
      }
      if (careerVault.phone && careerVault.phone !== updated.identity.phone) {
        updated.identity.phone = careerVault.phone;
        changed = true;
      }
      if (careerVault.location && careerVault.location !== 'unknown' && careerVault.location !== updated.identity.location) {
        updated.identity.location = careerVault.location;
        changed = true;
      }
      if (careerVault.currentTitle && careerVault.currentTitle !== 'unknown' && careerVault.currentTitle !== updated.career.currentRole) {
        updated.career.currentRole = careerVault.currentTitle;
        changed = true;
      }

      if (changed) {
        this.currentProfile = updated;
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentProfile));
        }
        this.notify();
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Syncs the canonical profile to legacy subsystems so existing views stay synchronized.
   */
  private syncToSubsystems(profile: CanonicalCandidateProfile): void {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
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

        // Deduplicate projects in vault
        const existingVaultTitles = new Set(vault.projects.map((p) => p.title.toLowerCase()));
        for (const cp of profile.projects) {
          if (!existingVaultTitles.has(cp.name.toLowerCase())) {
            vault.projects.push({
              id: cp.id,
              title: cp.name,
              description: cp.description,
              technologies: cp.technologyStack,
              contributions: cp.exactContribution
                ? [{ id: `contrib_${cp.id}`, description: cp.exactContribution, ownership: cp.ownership }]
                : [],
              outcomes: cp.outcomes,
              metrics: [],
              repoUrl: cp.repositoryUrl,
              liveUrl: cp.projectUrl,
              evidenceIds: cp.evidenceReferences,
              status: cp.status,
            });
            existingVaultTitles.add(cp.name.toLowerCase());
          }
        }

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

      // 3. Sync with CareerOps Vault
      try {
        const store = useCandidateVaultStore.getState();
        store.updateProfile({
          fullName: profile.identity.fullName || store.profile.fullName,
          email: profile.identity.email || store.profile.email,
          phone: profile.identity.phone || store.profile.phone,
          location: profile.identity.location || store.profile.location,
          linkedin: profile.identity.links.linkedin || store.profile.linkedin,
          github: profile.identity.links.github || store.profile.github,
          portfolio: profile.identity.links.portfolio || store.profile.portfolio,
          currentTitle: profile.career.currentRole || store.profile.currentTitle,
          noticePeriod: profile.career.noticePeriod || store.profile.noticePeriod,
          authorizedToWork: profile.declarations.workAuthorization.authorized ?? store.profile.authorizedToWork,
          requiresSponsorship: profile.declarations.sponsorshipRequired.required ?? store.profile.requiresSponsorship,
        });
      } catch (e) {
        // Ignored if useCandidateVaultStore not active
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private loadFromStorage(): CanonicalCandidateProfile {
    const defaultProfile = createDefaultCanonicalProfile();
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const validation = validateCanonicalProfile(parsed);
          if (validation.success) {
            return validation.profile;
          } else {
            console.warn('[CanonicalProfileService] Stored profile failed schema validation, resetting to safe defaults:', validation.errors);
          }
        }
      } catch (e) {
        console.error('[CanonicalProfileService] Failed to load profile from localStorage:', e);
      }
    }
    return defaultProfile;
  }
}
