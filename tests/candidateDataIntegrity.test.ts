import { describe, it, expect, beforeEach } from 'vitest';

// Polyfill localStorage for node test runner
const memoryStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => memoryStore[key] || null,
  setItem: (key: string, value: string) => {
    memoryStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete memoryStore[key];
  },
  clear: () => {
    for (const k in memoryStore) delete memoryStore[k];
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

import { useAppStore } from '../src/store/useAppStore';
import {
  DEFAULT_RESUME,
  DEFAULT_TARGET_ROLE,
  DEFAULT_JOB_DESCRIPTION,
} from '../src/services/candidatePersona';

describe('Candidate Data Integrity & Fictional Persona Elimination (P1)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('ensures production default candidate persona fields are strictly empty strings', () => {
    expect(DEFAULT_RESUME).toBe('');
    expect(DEFAULT_TARGET_ROLE).toBe('');
    expect(DEFAULT_JOB_DESCRIPTION).toBe('');
  });

  it('ensures no fictional CloudScale or TechNova references exist in production defaults', () => {
    expect(DEFAULT_RESUME).not.toContain('CloudScale');
    expect(DEFAULT_RESUME).not.toContain('TechNova');
    expect(DEFAULT_JOB_DESCRIPTION).not.toContain('CloudScale');
  });

  it('preserves an arbitrary real user resume without wiping or resetting to hardcoded names', async () => {
    const candidateResume = `
      Sarah Connor — Principal Security Architect
      Summary: 12 years of experience securing cloud distributed platforms and microservices.
      Experience: Lead Security Engineer at Cyberdyne Defense Corp (2018 - 2024).
      Skills: Zero Trust Architecture, Kubernetes RBAC, Vault, AWS IAM, Threat Modeling.
    `;

    mockLocalStorage.setItem('candidate_resume', candidateResume);

    // Trigger load from storage
    await useAppStore.getState().loadSettings();

    // Verify user's resume is 100% preserved and not overwritten
    expect(useAppStore.getState().resumeText).toBe(candidateResume);
    expect(useAppStore.getState().resumeText).toContain('Sarah Connor');
    expect(useAppStore.getState().resumeText).not.toContain('CloudScale');
  });

  it('cleans up legacy development mock strings (CloudScale/TechNova) if present in storage', async () => {
    mockLocalStorage.setItem('candidate_resume', 'Legacy mock text from CloudScale Systems and TechNova...');

    await useAppStore.getState().loadSettings();

    // Legacy mock data should be cleaned up, returning empty rather than injecting fake experience
    expect(useAppStore.getState().resumeText).toBe('');
    expect(mockLocalStorage.getItem('candidate_resume')).toBeNull();
  });

  it('preserves user-supplied target role and job description without false-positive wiping', async () => {
    const userRole = 'Software Developer (Alignerr — AI Assisted Coding)';
    const userJd = 'Mercor partners with leading AI labs and enterprises to train and enhance AI models...';

    mockLocalStorage.setItem('target_role', userRole);
    mockLocalStorage.setItem('target_job_description', userJd);

    await useAppStore.getState().loadSettings();

    expect(useAppStore.getState().targetRole).toBe(userRole);
    expect(useAppStore.getState().jobDescriptionText).toBe(userJd);
  });
});
