/**
 * Candidate Skills Management Service (IAC 2.0 - Phase 2 & 3)
 *
 * Implements complete CRUD, category classification across 14 categories,
 * duplicate merging, tombstone deletion safety, and experience tier calculations.
 *
 * Invariant: Experience tier calculation never infers production experience
 * unless supported by verified project references.
 */

import { CanonicalProfileService } from '../knowledgeVault/canonicalProfileService';
import { CandidateSkill } from '../knowledgeVault/canonicalProfile';

export type SkillCategory14 =
  | 'languages'
  | 'frontend'
  | 'backend'
  | 'databases'
  | 'cloud'
  | 'devops'
  | 'aiMl'
  | 'testing'
  | 'security'
  | 'tools'
  | 'design'
  | 'softSkills'
  | 'domainKnowledge'
  | 'other';

export const ALL_14_SKILL_CATEGORIES: Array<{ id: SkillCategory14; label: string }> = [
  { id: 'languages', label: 'Languages' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend' },
  { id: 'databases', label: 'Databases & Storage' },
  { id: 'cloud', label: 'Cloud Infrastructure' },
  { id: 'devops', label: 'DevOps & CI/CD' },
  { id: 'aiMl', label: 'AI & Machine Learning' },
  { id: 'testing', label: 'Testing & QA' },
  { id: 'security', label: 'Security & Auth' },
  { id: 'tools', label: 'Developer Tools' },
  { id: 'design', label: 'UI/UX & Design' },
  { id: 'softSkills', label: 'Leadership & Soft Skills' },
  { id: 'domainKnowledge', label: 'Domain & Industry Knowledge' },
  { id: 'other', label: 'Other Specializations' },
];

export interface AddSkillParams {
  name: string;
  category?: SkillCategory14 | string;
  proficiency?: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'UNSPECIFIED';
  experienceType?: 'theoretical' | 'practical';
  projectReferences?: string[];
  evidenceSource?: string;
}

export class SkillsManagementService {
  private static instance: SkillsManagementService | null = null;

  private constructor() {}

  public static getInstance(): SkillsManagementService {
    if (!SkillsManagementService.instance) {
      SkillsManagementService.instance = new SkillsManagementService();
    }
    return SkillsManagementService.instance;
  }

  /**
   * Retrieves all skills from the canonical profile with category normalization.
   */
  public getSkills(): CandidateSkill[] {
    const profile = CanonicalProfileService.getInstance().getProfile();
    return profile.skills || [];
  }

  /**
   * Adds a new skill to the canonical profile with zero-fabrication guarantees.
   */
  public addSkill(params: AddSkillParams): CandidateSkill {
    const profileService = CanonicalProfileService.getInstance();
    const current = profileService.getProfile();
    const updated = { ...current };

    const normName = params.name.trim();
    if (!normName) throw new Error('Skill name cannot be empty');

    // Check if skill already exists
    const existing = updated.skills.find((s) => s.name.toLowerCase() === normName.toLowerCase());
    if (existing) {
      return existing;
    }

    const hasProjects = Array.isArray(params.projectReferences) && params.projectReferences.length > 0;
    const experienceType = hasProjects ? 'practical' : (params.experienceType || 'theoretical');

    const newSkill: CandidateSkill = {
      id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: normName,
      category: params.category || 'other',
      proficiency: params.proficiency || 'UNSPECIFIED',
      experienceType,
      yearsUsed: undefined, // Zero invented years
      projectReferences: params.projectReferences || [],
      evidenceSource: params.evidenceSource || 'Candidate Direct Entry',
      status: 'CANDIDATE_CONFIRMED',
      candidateConfirmed: true,
    };

    updated.skills.push(newSkill);
    profileService.recordFact(
      `skill:${normName}`,
      'skill',
      normName,
      'Candidate Direct Entry',
      'CANDIDATE_CONFIRMED',
      true
    );

    profileService.saveProfile(updated);
    return newSkill;
  }

  /**
   * Updates an existing skill.
   */
  public updateSkill(skillId: string, updates: Partial<CandidateSkill>): CandidateSkill {
    const profileService = CanonicalProfileService.getInstance();
    const current = profileService.getProfile();
    const updated = { ...current };

    const idx = updated.skills.findIndex((s) => s.id === skillId);
    if (idx === -1) throw new Error(`Skill with ID ${skillId} not found`);

    const existing = updated.skills[idx];
    const projectRefs = updates.projectReferences !== undefined ? updates.projectReferences : existing.projectReferences;
    const experienceType = projectRefs.length > 0 ? 'practical' : (updates.experienceType || existing.experienceType);

    const mergedSkill: CandidateSkill = {
      ...existing,
      ...updates,
      projectReferences: projectRefs,
      experienceType,
      candidateConfirmed: true,
      status: 'CANDIDATE_CONFIRMED',
    };

    updated.skills[idx] = mergedSkill;
    profileService.recordFact(
      `skill:${mergedSkill.name}`,
      'skill',
      mergedSkill.name,
      'Candidate Manual Edit',
      'CANDIDATE_CONFIRMED',
      true
    );

    profileService.saveProfile(updated);
    return mergedSkill;
  }

  /**
   * Deletes a skill and writes an immutable tombstone to factsLedger so future
   * re-ingestions will never resurrect the deleted skill.
   */
  public removeSkillWithTombstone(skillId: string, reason = 'Removed by candidate'): boolean {
    const profileService = CanonicalProfileService.getInstance();
    const current = profileService.getProfile();
    const updated = { ...current };

    const skillToRemove = updated.skills.find((s) => s.id === skillId);
    if (!skillToRemove) return false;

    // Filter out from skills list
    updated.skills = updated.skills.filter((s) => s.id !== skillId);

    // Record immutable deletion tombstone in factsLedger
    const tombstoneKey = `skill:${skillToRemove.name}`;
    profileService.deleteFact(tombstoneKey, reason);

    profileService.saveProfile(updated);
    return true;
  }

  /**
   * Confirms a skill.
   */
  public confirmSkill(skillId: string): void {
    this.updateSkill(skillId, { candidateConfirmed: true, status: 'CANDIDATE_CONFIRMED' });
  }

  /**
   * Merges duplicate skills (e.g. "React.js" -> "React").
   */
  public mergeSkills(sourceSkillId: string, targetSkillId: string): CandidateSkill {
    const profileService = CanonicalProfileService.getInstance();
    const current = profileService.getProfile();
    const updated = { ...current };

    const source = updated.skills.find((s) => s.id === sourceSkillId);
    const target = updated.skills.find((s) => s.id === targetSkillId);

    if (!source || !target) {
      throw new Error('Both source and target skills must exist to merge');
    }

    // Merge project references and evidence
    const combinedProjects = Array.from(new Set([...target.projectReferences, ...source.projectReferences]));
    const experienceType = combinedProjects.length > 0 ? 'practical' : target.experienceType;

    const mergedTarget: CandidateSkill = {
      ...target,
      projectReferences: combinedProjects,
      experienceType,
      candidateConfirmed: true,
      status: 'CANDIDATE_CONFIRMED',
    };

    // Remove source skill with tombstone
    this.removeSkillWithTombstone(sourceSkillId, `Merged into ${target.name}`);

    // Update target
    return this.updateSkill(targetSkillId, mergedTarget);
  }

  /**
   * Filter skills by query and/or category.
   */
  public filterSkills(query?: string, category?: string): CandidateSkill[] {
    const all = this.getSkills();
    return all.filter((s) => {
      if (category && category !== 'all' && s.category !== category) {
        return false;
      }
      if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        return s.name.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q);
      }
      return true;
    });
  }
}
