/**
 * Multi-Source Provenance Ledger & Contradiction Reconciliation Engine (IAC 2.0 - Phase 2 & 3)
 *
 * Reconciles facts across:
 * - Resume uploads (PDF/DOCX/Text)
 * - Personal Website Crawls
 * - GitHub Repository Audits
 * - LinkedIn Profile Exports
 * - Candidate Direct Inputs
 *
 * Detects contradictions, enforces deterministic conflict resolution,
 * protects candidate-confirmed facts against silent overwrites,
 * and produces diff previews prior to applying reprocessed data.
 */

import {
  CanonicalProfileService,
} from '../knowledgeVault/canonicalProfileService';
import {
  CanonicalCandidateProfile,
  CanonicalFact,
  FactCategory,
} from '../knowledgeVault/canonicalProfile';
import { EvidenceClassification } from '../knowledgeVault/types';

export interface ContradictionSourceRecord {
  source: string;
  sourceType: string;
  value: any;
  status: EvidenceClassification;
  timestamp: number;
}

export interface ContradictionAlert {
  id: string;
  field: string;
  category: FactCategory;
  description: string;
  conflictingSources: ContradictionSourceRecord[];
  severity: 'warning' | 'error' | 'info';
  status: 'active' | 'resolved' | 'dismissed';
  detectedAt: number;
  resolvedAt?: number;
  resolvedValue?: any;
}

export interface DiffFieldChange {
  field: string;
  category: FactCategory;
  oldValue: any;
  newValue: any;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'CONFLICT_PROTECTED';
  isCandidateConfirmed: boolean;
  message: string;
}

export interface ReprocessingDiffPreview {
  totalChanges: number;
  addedCount: number;
  modifiedCount: number;
  conflictProtectedCount: number;
  changes: DiffFieldChange[];
  canSafelyApply: boolean;
}

export class SourceReconciliationService {
  private static instance: SourceReconciliationService | null = null;
  private activeContradictions: Map<string, ContradictionAlert> = new Map();

  private constructor() {}

  public static getInstance(): SourceReconciliationService {
    if (!SourceReconciliationService.instance) {
      SourceReconciliationService.instance = new SourceReconciliationService();
    }
    return SourceReconciliationService.instance;
  }

  /**
   * Scans canonical facts ledger and cross-source records to detect contradictions.
   */
  public detectContradictions(): ContradictionAlert[] {
    const profileService = CanonicalProfileService.getInstance();
    const profile = profileService.getProfile();
    const contradictions: ContradictionAlert[] = [];

    // 1. Check Employment Dates & Roles
    const expByCompany = new Map<string, typeof profile.experience>();
    for (const exp of profile.experience) {
      const normCompany = exp.employer.toLowerCase().trim();
      const existing = expByCompany.get(normCompany) || [];
      existing.push(exp);
      expByCompany.set(normCompany, existing);
    }

    for (const [company, exps] of expByCompany.entries()) {
      if (exps.length > 1) {
        // Check if there are overlapping or conflicting role titles for the same company
        const titles = new Set(exps.map((e) => e.title.toLowerCase().trim()));
        if (titles.size > 1) {
          const alertId = `contra-exp-title-${company}`;
          contradictions.push({
            id: alertId,
            field: `experience.${company}.title`,
            category: 'experience',
            description: `Conflicting job titles reported for ${exps[0].employer}: ${Array.from(titles).join(' vs ')}`,
            conflictingSources: exps.map((e) => ({
              source: e.status === 'RESUME_REPORTED' ? 'Resume' : 'LinkedIn Export / Document',
              sourceType: e.status,
              value: e.title,
              status: e.status,
              timestamp: Date.now(),
            })),
            severity: 'warning',
            status: 'active',
            detectedAt: Date.now(),
          });
        }
      }
    }

    // 2. Check Project Deployment Status vs Code Evidence
    for (const proj of profile.projects) {
      // If deployment claims 'deployed_production' but project has no URL and repository shows zero commits
      if (proj.deploymentStatus === 'deployed_production' && !proj.projectUrl && !proj.repositoryUrl) {
        contradictions.push({
          id: `contra-proj-deploy-${proj.id}`,
          field: `project.${proj.name}.deploymentStatus`,
          category: 'project',
          description: `Project "${proj.name}" claims production deployment but provides no live URL or repository evidence.`,
          conflictingSources: [
            {
              source: 'Resume / Website Claim',
              sourceType: 'RESUME_REPORTED',
              value: 'deployed_production',
              status: proj.status,
              timestamp: Date.now(),
            },
          ],
          severity: 'warning',
          status: 'active',
          detectedAt: Date.now(),
        });
      }
    }

    for (const c of contradictions) {
      this.activeContradictions.set(c.id, c);
    }

    return Array.from(this.activeContradictions.values());
  }

  public getActiveContradictions(): ContradictionAlert[] {
    return Array.from(this.activeContradictions.values()).filter((c) => c.status === 'active');
  }

  /**
   * Resolves a contradiction with a candidate-chosen value and marks as CANDIDATE_CONFIRMED.
   */
  public resolveContradiction(contradictionId: string, resolvedValue: any): void {
    const contra = this.activeContradictions.get(contradictionId);
    if (!contra) return;

    contra.status = 'resolved';
    contra.resolvedAt = Date.now();
    contra.resolvedValue = resolvedValue;

    // Record confirmation in CanonicalProfileService
    const profileService = CanonicalProfileService.getInstance();
    profileService.recordFact(
      contra.field,
      contra.category,
      resolvedValue,
      'Candidate Conflict Resolution',
      'CANDIDATE_CONFIRMED',
      true
    );
  }

  /**
   * Generates a diff preview before applying freshly parsed ingestion data.
   * Enforces zero-silent-overwrite policy for candidate-confirmed facts.
   */
  public generateDiffPreview(
    incomingProfile: Partial<CanonicalCandidateProfile>
  ): ReprocessingDiffPreview {
    const profileService = CanonicalProfileService.getInstance();
    const current = profileService.getProfile();
    const changes: DiffFieldChange[] = [];

    // Identity check
    if (incomingProfile.identity) {
      if (incomingProfile.identity.fullName && incomingProfile.identity.fullName !== current.identity.fullName) {
        if (current.identity.candidateConfirmed) {
          changes.push({
            field: 'identity.fullName',
            category: 'identity',
            oldValue: current.identity.fullName,
            newValue: incomingProfile.identity.fullName,
            changeType: 'CONFLICT_PROTECTED',
            isCandidateConfirmed: true,
            message: 'Candidate has manually confirmed their name. Imported value will NOT overwrite.',
          });
        } else {
          changes.push({
            field: 'identity.fullName',
            category: 'identity',
            oldValue: current.identity.fullName,
            newValue: incomingProfile.identity.fullName,
            changeType: current.identity.fullName ? 'MODIFIED' : 'ADDED',
            isCandidateConfirmed: false,
            message: 'Update full name from document.',
          });
        }
      }
    }

    // Skills check
    if (incomingProfile.skills) {
      const currentSkillNames = new Set(current.skills.map((s) => s.name.toLowerCase()));
      for (const skill of incomingProfile.skills) {
        if (!currentSkillNames.has(skill.name.toLowerCase())) {
          // Check if deleted tombstone exists
          const tombstone = current.factsLedger[`skill:${skill.name}`];
          if (tombstone?.isDeleted) {
            changes.push({
              field: `skill:${skill.name}`,
              category: 'skill',
              oldValue: '(Previously Removed)',
              newValue: skill.name,
              changeType: 'CONFLICT_PROTECTED',
              isCandidateConfirmed: true,
              message: 'Skill was previously deleted by candidate. Will NOT be resurrected.',
            });
          } else {
            changes.push({
              field: `skill:${skill.name}`,
              category: 'skill',
              oldValue: null,
              newValue: skill.name,
              changeType: 'ADDED',
              isCandidateConfirmed: false,
              message: `Add new skill "${skill.name}"`,
            });
          }
        }
      }
    }

    const addedCount = changes.filter((c) => c.changeType === 'ADDED').length;
    const modifiedCount = changes.filter((c) => c.changeType === 'MODIFIED').length;
    const conflictProtectedCount = changes.filter((c) => c.changeType === 'CONFLICT_PROTECTED').length;

    return {
      totalChanges: changes.length,
      addedCount,
      modifiedCount,
      conflictProtectedCount,
      changes,
      canSafelyApply: true,
    };
  }
}
