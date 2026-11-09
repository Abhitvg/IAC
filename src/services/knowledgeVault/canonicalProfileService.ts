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

  public saveProfile(profile: CanonicalCandidateProfile): boolean {
    this.currentProfile = {
      ...profile,
      updatedAt: Date.now(),
    };

    let savedSuccessfully = true;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentProfile));
      } catch (e) {
        savedSuccessfully = false;
        console.error(
          '[CanonicalProfileService] Failed to save profile to localStorage (quota or storage error):',
          e
        );
      }
    }

    // Bidirectional sync with legacy stores
    this.syncToSubsystems(this.currentProfile);
    this.notify();
    return savedSuccessfully;
  }

  /**
   * Resets all candidate data to initial clean state with zero fabrications.
   */
  public clearAllCandidateData(clearCandidateDocuments: () => boolean): {
    success: boolean;
    failedStores: string[];
  } {
    // First remove the canonical source of truth. If this fails, leave every copy
    // untouched so the UI cannot claim that candidate data was deleted.
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.error('[CanonicalProfileService] Failed to clear canonical profile:', e);
        return { success: false, failedStores: ['canonical-profile'] };
      }
    }

    this.currentProfile = createDefaultCanonicalProfile();
    const failedStores: string[] = [];

    try {
      if (!KnowledgeVaultService.getInstance().resetVault()) {
        failedStores.push('knowledge-vault');
      }
    } catch (e) {
      console.error('[CanonicalProfileService] Knowledge Vault reset failed:', e);
      failedStores.push('knowledge-vault');
    }

    try {
      if (!useCandidateVaultStore.getState().resetToDefaults()) {
        failedStores.push('career-ops-vault');
      }
    } catch (e) {
      console.error('[CanonicalProfileService] CareerOps vault reset failed:', e);
      failedStores.push('career-ops-vault');
    }

    try {
      const knowledgeBase = CandidateKnowledgeBase.getActiveKnowledgeBase();
      knowledgeBase.loadFromResume('');
      knowledgeBase.setCandidateProfile('');
    } catch (e) {
      console.error('[CanonicalProfileService] In-memory candidate knowledge reset failed:', e);
      failedStores.push('candidate-knowledge-base');
    }

    // Keep this service independent from the application store module. The app
    // store imports InterviewEngine, which imports AnswerGenerationService; pulling
    // useAppStore into this service creates a module-initialization cycle.
    try {
      if (!clearCandidateDocuments()) {
        failedStores.push('candidate-documents');
      }
    } catch (e) {
      console.error('[CanonicalProfileService] Candidate document reset failed:', e);
      failedStores.push('candidate-documents');
    }

    // Do not call syncToSubsystems here: it merges non-empty values from the old
    // CareerOps profile and appends projects to the Knowledge Vault.
    this.notify();
    return { success: failedStores.length === 0, failedStores };
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
    sourceUrlOrFile?: string,
    skipSave = false
  ): CanonicalFact<T> {
    const existing = this.currentProfile.factsLedger[field];

    // Deterministic Conflict Policy (P1.6): Candidate-confirmed facts are never overwritten by unconfirmed imported/synced updates
    if (existing && existing.candidateConfirmed && !candidateConfirmed) {
      return existing as CanonicalFact<T>;
    }

    // Tombstone Protection: A deleted fact is not silently resurrected by an unconfirmed update
    if (existing && existing.isDeleted && !candidateConfirmed) {
      return existing as CanonicalFact<T>;
    }

    // Status Upgrade Protection: Candidate manual edits can never elevate status to INDEPENDENTLY_VERIFIED
    let safeStatus = requestedStatus;
    if (
      candidateConfirmed &&
      requestedStatus === 'INDEPENDENTLY_VERIFIED' &&
      (!existing || existing.status !== 'INDEPENDENTLY_VERIFIED')
    ) {
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
      confirmedAt: candidateConfirmed ? existing?.confirmedAt || now : undefined,
      createdAt: existing?.createdAt || now,
      lastVerifiedAt:
        safeStatus === 'INDEPENDENTLY_VERIFIED' || candidateConfirmed
          ? now
          : existing?.lastVerifiedAt,
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
    if (!skipSave) {
      this.saveProfile(this.currentProfile);
    }
    return fact;
  }

  /**
   * Deletes an individual fact with an immutable audit tombstone.
   * Does NOT silently erase history. Creates a tombstone if not already present.
   */
  public deleteFact(field: string, reason = 'Candidate requested deletion'): boolean {
    const existing = this.currentProfile.factsLedger[field];
    const now = Date.now();
    if (existing) {
      if (!existing.isDeleted) {
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

    // Record an immutable tombstone even if the fact was not previously stored in the ledger
    const tombstone: CanonicalFact = {
      id: `fact_tombstone_${field.replace(/[^a-zA-Z0-9_]/g, '_')}_${now}`,
      category: 'project',
      field,
      value: null,
      source: 'candidate_deletion',
      status: 'UNKNOWN',
      confidence: 1.0,
      candidateConfirmed: true,
      confirmedAt: now,
      createdAt: now,
      isExpired: false,
      isDeleted: true,
      editHistory: [
        {
          timestamp: now,
          updatedBy: 'candidate',
          reason,
          action: 'DELETED',
        },
      ],
    };
    this.currentProfile.factsLedger[field] = tombstone;
    this.saveProfile(this.currentProfile);
    return true;
  }

  /**
   * Deletes a project by ID and records tombstones by title and repo URL in the facts ledger.
   */
  public deleteProject(projectId: string, reason = 'Candidate deleted project'): boolean {
    const projIndex = this.currentProfile.projects.findIndex((p) => p.id === projectId);
    if (projIndex === -1) return false;
    const proj = this.currentProfile.projects[projIndex];
    this.currentProfile.projects.splice(projIndex, 1);
    this.deleteFact(`project:${proj.name.toLowerCase().trim()}`, reason);
    if (proj.repositoryUrl) {
      const normRepo = proj.repositoryUrl
        .toLowerCase()
        .replace(/\.git$/, '')
        .replace(/\/$/, '');
      this.deleteFact(`project:repo:${normRepo}`, reason);
    }
    this.saveProfile(this.currentProfile);
    return true;
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
        console.warn(
          '[CanonicalProfileService] Schema validation failed for imported JSON:',
          validation.errors
        );
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
        this.recordFact(
          'identity.fullName',
          'identity',
          result.personalProfile.fullName,
          sourceLabel,
          'RESUME_REPORTED',
          false,
          undefined,
          true
        );
      }
      if (result.personalProfile.email && !updated.identity.candidateConfirmed) {
        updated.identity.email = result.personalProfile.email;
        this.recordFact(
          'identity.email',
          'identity',
          result.personalProfile.email,
          sourceLabel,
          'RESUME_REPORTED',
          false,
          undefined,
          true
        );
      }
      if (result.personalProfile.phone && !updated.identity.candidateConfirmed) {
        updated.identity.phone = result.personalProfile.phone;
        this.recordFact(
          'identity.phone',
          'identity',
          result.personalProfile.phone,
          sourceLabel,
          'RESUME_REPORTED',
          false,
          undefined,
          true
        );
      }
      if (result.personalProfile.location && !updated.identity.candidateConfirmed) {
        updated.identity.location = result.personalProfile.location;
        this.recordFact(
          'identity.location',
          'identity',
          result.personalProfile.location,
          sourceLabel,
          'RESUME_REPORTED',
          false,
          undefined,
          true
        );
      }
      if (
        result.personalProfile.githubUrl ||
        result.personalProfile.linkedinUrl ||
        result.personalProfile.portfolioUrl ||
        (result.personalProfile.otherLinks && result.personalProfile.otherLinks.length > 0)
      ) {
        updated.identity.links = {
          ...updated.identity.links,
          github: result.personalProfile.githubUrl || updated.identity.links.github,
          linkedin: result.personalProfile.linkedinUrl || updated.identity.links.linkedin,
          portfolio: result.personalProfile.portfolioUrl || updated.identity.links.portfolio,
          other: Array.from(
            new Set([
              ...(updated.identity.links.other || []),
              ...(result.personalProfile.otherLinks || []),
            ])
          ),
        };
      }
    }

    // Skills: 14 categories, zero invented yearsUsed or proficiency
    if (result.skills) {
      const categoryEntries: Array<[string, string[]]> = [
        ['languages', result.skills.languages || []],
        ['frontend', result.skills.frontend || []],
        ['backend', result.skills.backend || []],
        ['databases', result.skills.databases || []],
        ['cloud', result.skills.cloud || []],
        ['devops', result.skills.devops || []],
        ['aiMl', result.skills.aiMl || []],
        ['testing', result.skills.testing || []],
        ['security', result.skills.security || []],
        ['tools', result.skills.tools || []],
        ['design', result.skills.design || []],
        ['softSkills', result.skills.softSkills || []],
        ['domainKnowledge', result.skills.domainKnowledge || []],
        ['other', result.skills.other || []],
      ];

      const existingSkillMap = new Map(updated.skills.map((s) => [s.name.toLowerCase(), s]));
      for (const [catName, skillList] of categoryEntries) {
        for (const skillName of skillList) {
          const norm = skillName.toLowerCase();
          if (!existingSkillMap.has(norm)) {
            const newSkill: CandidateSkill = {
              id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: skillName,
              category: catName,
              proficiency: 'UNSPECIFIED', // Zero invented proficiency
              experienceType: 'theoretical', // Resume mentions default to theoretical until linked to verified project
              yearsUsed: undefined, // Zero invented years
              projectReferences: [],
              evidenceSource: sourceLabel,
              status: 'RESUME_REPORTED',
              candidateConfirmed: false,
            };
            updated.skills.push(newSkill);
            existingSkillMap.set(norm, newSkill);
            this.recordFact(
              `skill:${skillName}`,
              'skill',
              skillName,
              sourceLabel,
              'RESUME_REPORTED',
              false,
              undefined,
              true
            );
          } else {
            const existing = existingSkillMap.get(norm)!;
            if (!existing.category) {
              existing.category = catName;
            }
          }
        }
      }
    }

    // Education
    if (result.education && result.education.length > 0) {
      const existingEdu = new Set(
        updated.education.map((e) => `${e.institution}_${e.degree}`.toLowerCase())
      );
      for (const edu of result.education) {
        const key = `${edu.institution}_${edu.degree}`.toLowerCase();
        if (!existingEdu.has(key)) {
          const newEdu: CandidateEducation = {
            id: `edu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            institution: edu.institution,
            degree: edu.degree,
            fieldOfStudy: edu.department || edu.specialization || '',
            startDate: edu.startDate,
            endDate: edu.endDate,
            grade: edu.gradeGpa,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.education.push(newEdu);
          this.recordFact(
            `education:${key}`,
            'education',
            `${edu.degree} from ${edu.institution}`,
            sourceLabel,
            'RESUME_REPORTED',
            false,
            undefined,
            true
          );
        }
      }
    }

    // Work Experience
    if (result.employment && result.employment.length > 0) {
      const existingRoles = new Set(
        updated.experience.map((e) => `${e.employer}_${e.title}`.toLowerCase())
      );
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
            leadershipResponsibilities: exp.ownershipClaims || [],
            outcomesAndMetrics: exp.metrics || [],
            technologiesUsed: exp.technologies || [],
            missingOrUncertainFacts: ['Personal implementation ownership unconfirmed'],
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.experience.push(newExp);
          this.recordFact(
            `experience:${key}`,
            'experience',
            `${exp.role} at ${exp.employer}`,
            sourceLabel,
            'RESUME_REPORTED',
            false,
            undefined,
            true
          );
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
            projectUrl: proj.projectUrl || proj.documentationUrl,
            ownership: 'UNKNOWN', // Zero invented authorship
            exactContribution: proj.exactContribution || '',
            technologyStack: proj.technologies || [],
            deploymentStatus: proj.deploymentStatus || 'UNKNOWN',
            outcomes: proj.outcomes || [],
            evidenceReferences: [sourceLabel],
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.projects.push(newProj);
          this.recordFact(
            `project:${proj.name}`,
            'project',
            proj.name,
            sourceLabel,
            'RESUME_REPORTED',
            false,
            undefined,
            true
          );
        }
      }
    }

    // Certifications & Achievements
    const existingAchievements = new Set(updated.achievements.map((a) => a.title.toLowerCase()));

    if (result.certifications && result.certifications.length > 0) {
      for (const cert of result.certifications) {
        if (!existingAchievements.has(cert.name.toLowerCase())) {
          const newCert: CandidateAchievement = {
            id: cert.id || `cert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            title: cert.name,
            category: 'certification',
            issuerOrPublisher: cert.issuer,
            evidenceUrlOrRef: cert.url,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.achievements.push(newCert);
          existingAchievements.add(cert.name.toLowerCase());
          this.recordFact(
            `certification:${cert.name}`,
            'achievement',
            cert.name,
            sourceLabel,
            'RESUME_REPORTED',
            false,
            undefined,
            true
          );
        }
      }
    }

    if (result.publications && result.publications.length > 0) {
      for (const pub of result.publications) {
        if (!existingAchievements.has(pub.title.toLowerCase())) {
          const newPub: CandidateAchievement = {
            id: pub.id || `pub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            title: pub.title,
            category: 'publication',
            evidenceUrlOrRef: pub.url,
            status: 'RESUME_REPORTED',
            candidateConfirmed: false,
          };
          updated.achievements.push(newPub);
          existingAchievements.add(pub.title.toLowerCase());
          this.recordFact(
            `publication:${pub.title}`,
            'achievement',
            pub.title,
            sourceLabel,
            'RESUME_REPORTED',
            false,
            undefined,
            true
          );
        }
      }
    }

    if (result.achievements && result.achievements.length > 0) {
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
          existingAchievements.add(ach.headline.toLowerCase());
          this.recordFact(
            `achievement:${ach.headline}`,
            'achievement',
            ach.headline,
            sourceLabel,
            'RESUME_REPORTED',
            false,
            undefined,
            true
          );
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
   * Enforces:
   * 1. Deterministic conflict policy: candidate-confirmed data is preserved.
   * 2. Project deduplication across differing IDs (by repo URL or normalized title).
   * 3. Tombstone protection: deleted projects are not resurrected by unconfirmed sync.
   * 4. Audit trail logging.
   */
  public syncFromKnowledgeVault(vault: any): void {
    if (this.isSyncing || !vault) return;
    this.isSyncing = true;
    try {
      const updated = { ...this.currentProfile };
      let changed = false;

      // Sync projects from vault
      if (Array.isArray(vault.projects)) {
        for (const vp of vault.projects) {
          const normRepo = vp.repoUrl
            ?.toLowerCase()
            .replace(/\.git$/, '')
            .replace(/\/$/, '');
          const normTitle = (vp.title || '').toLowerCase().trim();

          // Deduplication: find match by ID, normalized repositoryUrl, or title
          const existingProject = updated.projects.find((p) => {
            if (p.id && vp.id && p.id.toLowerCase() === vp.id.toLowerCase()) return true;
            if (normTitle && p.name && p.name.toLowerCase().trim() === normTitle) return true;
            if (normRepo && p.repositoryUrl) {
              const curRepo = p.repositoryUrl
                .toLowerCase()
                .replace(/\.git$/, '')
                .replace(/\/$/, '');
              if (curRepo === normRepo) return true;
            }
            return false;
          });

          if (existingProject) {
            // Merge duplicate into existing project
            // Deterministic Conflict Policy: Never overwrite candidate-confirmed exactContribution
            if (!existingProject.candidateConfirmed && vp.contributions?.[0]?.description) {
              existingProject.exactContribution = vp.contributions[0].description;
            }
            // Merge technology stack (union)
            const techSet = new Set([
              ...existingProject.technologyStack,
              ...(vp.technologies || []),
            ]);
            existingProject.technologyStack = Array.from(techSet);
            // Merge evidence references
            const evSet = new Set([
              ...existingProject.evidenceReferences,
              ...(vp.evidenceIds || []),
            ]);
            existingProject.evidenceReferences = Array.from(evSet);

            // Never downgrade verification status
            if (existingProject.status === 'UNKNOWN' && vp.status) {
              existingProject.status = vp.status;
            }
            changed = true;
          } else {
            // Tombstone check: if project was explicitly deleted by candidate, do not resurrect
            const tombstoneKeyTitle = `project:${normTitle}`;
            const tombstoneKeyRepo = normRepo ? `project:repo:${normRepo}` : '';
            if (
              updated.factsLedger[tombstoneKeyTitle]?.isDeleted ||
              (tombstoneKeyRepo && updated.factsLedger[tombstoneKeyRepo]?.isDeleted)
            ) {
              continue;
            }

            const isConfirmed = vp.status === 'CANDIDATE_CONFIRMED';
            updated.projects.push({
              id: vp.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: vp.title,
              description: vp.description || '',
              repositoryUrl: vp.repoUrl,
              projectUrl: vp.liveUrl,
              ownership: 'UNKNOWN',
              exactContribution: vp.contributions?.[0]?.description || '',
              technologyStack: vp.technologies || [],
              deploymentStatus: 'UNKNOWN',
              outcomes: vp.outcomes || [],
              evidenceReferences: vp.evidenceIds || [],
              status: vp.status || 'UNKNOWN',
              candidateConfirmed: isConfirmed,
            });

            this.recordFact(
              tombstoneKeyTitle,
              'project',
              vp.title,
              'sync:knowledge_vault',
              vp.status || 'UNKNOWN',
              isConfirmed
            );
            changed = true;
          }
        }
      }

      if (changed) {
        this.currentProfile = updated;
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentProfile));
          } catch (e) {
            console.error('[CanonicalProfileService] LocalStorage save error during sync:', e);
          }
        }
        this.notify();
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Syncs user-supplied values from CareerOps vault into CanonicalProfileService.
   * Enforces deterministic conflict policy: candidate-confirmed profile data is preserved.
   */
  public syncFromCareerOpsVault(careerVault: any): void {
    if (this.isSyncing || !careerVault || !careerVault.isUserSupplied) return;
    this.isSyncing = true;
    try {
      const updated = { ...this.currentProfile };
      let changed = false;

      // Deterministic conflict policy: if local identity is confirmed, do not overwrite with unconfirmed sync
      if (
        careerVault.fullName &&
        !updated.identity.candidateConfirmed &&
        careerVault.fullName !== updated.identity.fullName
      ) {
        updated.identity.fullName = careerVault.fullName;
        this.recordFact(
          'identity.fullName',
          'identity',
          careerVault.fullName,
          'sync:career_ops',
          'CANDIDATE_CONFIRMED',
          true
        );
        changed = true;
      }
      if (
        careerVault.email &&
        !updated.identity.candidateConfirmed &&
        careerVault.email !== updated.identity.email
      ) {
        updated.identity.email = careerVault.email;
        this.recordFact(
          'identity.email',
          'identity',
          careerVault.email,
          'sync:career_ops',
          'CANDIDATE_CONFIRMED',
          true
        );
        changed = true;
      }
      if (
        careerVault.phone &&
        !updated.identity.candidateConfirmed &&
        careerVault.phone !== updated.identity.phone
      ) {
        updated.identity.phone = careerVault.phone;
        this.recordFact(
          'identity.phone',
          'identity',
          careerVault.phone,
          'sync:career_ops',
          'CANDIDATE_CONFIRMED',
          true
        );
        changed = true;
      }
      if (
        careerVault.location &&
        careerVault.location !== 'unknown' &&
        !updated.identity.candidateConfirmed &&
        careerVault.location !== updated.identity.location
      ) {
        updated.identity.location = careerVault.location;
        this.recordFact(
          'identity.location',
          'identity',
          careerVault.location,
          'sync:career_ops',
          'CANDIDATE_CONFIRMED',
          true
        );
        changed = true;
      }
      if (
        careerVault.currentTitle &&
        careerVault.currentTitle !== 'unknown' &&
        !updated.career.candidateConfirmed &&
        careerVault.currentTitle !== updated.career.currentRole
      ) {
        updated.career.currentRole = careerVault.currentTitle;
        this.recordFact(
          'career.currentRole',
          'career',
          careerVault.currentTitle,
          'sync:career_ops',
          'CANDIDATE_CONFIRMED',
          true
        );
        changed = true;
      }

      if (changed) {
        this.currentProfile = updated;
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentProfile));
          } catch (e) {
            console.error(
              '[CanonicalProfileService] LocalStorage save error during CareerOps sync:',
              e
            );
          }
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
                ? [
                    {
                      id: `contrib_${cp.id}`,
                      description: cp.exactContribution,
                      ownership: cp.ownership,
                    },
                  ]
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
          authorizedToWork:
            profile.declarations.workAuthorization.authorized ?? store.profile.authorizedToWork,
          requiresSponsorship:
            profile.declarations.sponsorshipRequired.required ?? store.profile.requiresSponsorship,
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
            console.warn(
              '[CanonicalProfileService] Stored profile failed schema validation, resetting to safe defaults:',
              validation.errors
            );
          }
        }
      } catch (e) {
        console.error('[CanonicalProfileService] Failed to load profile from localStorage:', e);
      }
    }
    return defaultProfile;
  }
}
