import React from 'react';
import {
  User,
  GraduationCap,
  Briefcase,
  Wrench,
  Building,
  FolderGit2,
  Trophy,
  Sliders,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import {
  CanonicalCandidateProfile,
  CandidateEducation,
  CandidateSkill,
  CandidateWorkExperience,
  CandidateProject,
  CandidateAchievement,
  CandidatePreferences,
  EmploymentDeclarations,
} from '../../services/knowledgeVault';

export type CandidateIdentity = CanonicalCandidateProfile['identity'];
export type CandidateCareerOverview = CanonicalCandidateProfile['career'];
export type CandidateDeclarations = EmploymentDeclarations;
export type CandidateAnswerPreferences = CandidatePreferences;

export type WizardSection =
  | 'identity'
  | 'education'
  | 'career'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'achievements'
  | 'preferences'
  | 'declarations'
  | 'review';

export interface StepDef {
  id: WizardSection;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  required?: boolean;
}

export const WIZARD_STEPS: StepDef[] = [
  { id: 'identity', label: 'A. Personal Identity', shortLabel: 'Identity', icon: <User size={16} />, required: true },
  { id: 'education', label: 'B. Education', shortLabel: 'Education', icon: <GraduationCap size={16} /> },
  { id: 'career', label: 'C. Career Overview', shortLabel: 'Career', icon: <Briefcase size={16} /> },
  { id: 'skills', label: 'D. Skills & Evidence', shortLabel: 'Skills', icon: <Wrench size={16} /> },
  { id: 'experience', label: 'E. Work Experience', shortLabel: 'Experience', icon: <Building size={16} /> },
  { id: 'projects', label: 'F. Projects & Provenance', shortLabel: 'Projects', icon: <FolderGit2 size={16} /> },
  { id: 'achievements', label: 'G. Achievements', shortLabel: 'Achievements', icon: <Trophy size={16} /> },
  { id: 'preferences', label: 'H. Answer Preferences', shortLabel: 'Preferences', icon: <Sliders size={16} /> },
  { id: 'declarations', label: 'I. Declarations (Audit)', shortLabel: 'Declarations', icon: <ShieldAlert size={16} />, required: false },
  { id: 'review', label: 'Review & Confirm', shortLabel: 'Review', icon: <CheckCircle2 size={16} />, required: true },
];

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

