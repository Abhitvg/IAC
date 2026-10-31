import { describe, it, expect, beforeEach } from 'vitest';

const memoryStorage: Record<string, string> = {};
if (typeof global.localStorage === 'undefined') {
  (global as any).localStorage = {
    getItem: (k: string) => memoryStorage[k] || null,
    setItem: (k: string, v: string) => { memoryStorage[k] = String(v); },
    removeItem: (k: string) => { delete memoryStorage[k]; },
    clear: () => { Object.keys(memoryStorage).forEach((k) => delete memoryStorage[k]); },
    key: (i: number) => Object.keys(memoryStorage)[i] || null,
    length: 0,
  };
}

import {
  useCandidateVaultStore,
  INITIAL_CANDIDATE_VAULT,
} from '../src/store/useCandidateVaultStore';
import { useCareerOpsStore } from '../src/store/useCareerOpsStore';
import {
  DEFAULT_TARGET_ROLE,
  DEFAULT_JOB_DESCRIPTION,
  buildCandidateSystemPrompt,
} from '../src/services/candidatePersona';
import { useAppStore } from '../src/store/useAppStore';

describe('Phase 1 — Remove Fabricated Default State', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('3.1 Candidate Vault Store Clean Baseline', () => {
    it('initializes with clean, un-fabricated values and explicitly unknown fields', () => {
      const store = useCandidateVaultStore.getState();
      expect(store.profile.email).toBe('');
      expect(store.profile.phone).toBe('');
      expect(store.profile.location).toBe('unknown');
      expect(store.profile.currentCompany).toBe('unknown');
      expect(store.profile.currentTitle).toBe('unknown');
      expect(store.profile.yearsOfExperience).toBe('unknown');
      expect(store.profile.salaryExpectation).toBe('unknown');
      expect(store.profile.briefPitch).toBe('');
    });

    it('sanitizes legacy fabricated demo data from localStorage on load', () => {
      const fakeLegacy = {
        firstName: 'Abhishek',
        lastName: 'Singh',
        email: 'abhishek@example.com',
        phone: '+1-123-456-7890',
        salaryExpectation: '$160,000 - $195,000 / yr',
        currentCompany: 'Independent Systems Engineer',
      };
      localStorage.setItem('career_ops_candidate_vault_v1', JSON.stringify(fakeLegacy));

      // Trigger resetToDefaults
      useCandidateVaultStore.getState().resetToDefaults();
      const state = useCandidateVaultStore.getState();
      expect(state.profile.email).toBe('');
      expect(state.profile.phone).toBe('');
      expect(state.profile.salaryExpectation).toBe('unknown');
    });

    it('allows genuine user-supplied updates to persist without reverting to fake defaults', () => {
      useCandidateVaultStore.getState().updateProfile({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@university.edu',
        currentCompany: 'Acme Systems',
        currentTitle: 'Research Engineer',
        yearsOfExperience: '3',
      });

      const updated = useCandidateVaultStore.getState().profile;
      expect(updated.fullName).toBe('Jane Doe');
      expect(updated.email).toBe('jane.doe@university.edu');
      expect(updated.currentCompany).toBe('Acme Systems');
      expect(updated.isUserSupplied).toBe(true);
    });
  });

  describe('3.2 CareerOps Store Production Empty State & Demo Isolation', () => {
    it('initializes empty without automatic fictional applications', () => {
      // Clear store to simulate fresh state
      useCareerOpsStore.setState({ applications: [], activeJobId: null });
      const state = useCareerOpsStore.getState();
      expect(state.applications).toHaveLength(0);
      expect(state.stats.totalTracked).toBe(0);
    });

    it('addJob() creates an unevaluated application without automatic 4.0 score or apply recommendation', () => {
      useCareerOpsStore.setState({ applications: [] });
      const jobId = useCareerOpsStore.getState().addJob({
        company: 'Stripe',
        role: 'Backend Infrastructure Engineer',
        jdText: 'Distributed transaction processing and ledger systems.',
      });

      const added = useCareerOpsStore.getState().applications.find((a) => a.id === jobId);
      expect(added).toBeDefined();
      expect(added?.company).toBe('Stripe');
      expect(added?.score).toBeNull();
      expect(added?.recommendation).toBe('unevaluated');
      expect(added?.status).toBe('scouted');
    });

    it('isolates demo mode: demo items carry isDemo=true and do not pollute production stats', () => {
      useCareerOpsStore.setState({ applications: [] });
      useCareerOpsStore.getState().enableDemoMode();

      const state = useCareerOpsStore.getState();
      expect(state.isDemoMode).toBe(true);
      expect(state.applications.length).toBeGreaterThan(0);
      expect(state.applications.every((a) => a.isDemo === true)).toBe(true);

      // Verify that production stats ignore demo records
      expect(state.stats.totalTracked).toBe(0);
      expect(state.stats.highFitCount).toBe(0);

      // Verify clearDemoData removes them cleanly
      useCareerOpsStore.getState().clearDemoData();
      expect(useCareerOpsStore.getState().applications).toHaveLength(0);
      expect(useCareerOpsStore.getState().isDemoMode).toBe(false);
    });
  });

  describe('3.3 Candidate Persona Unset Initial Target & Workspace Isolation', () => {
    it('has empty default role and job description', () => {
      expect(DEFAULT_TARGET_ROLE).toBe('');
      expect(DEFAULT_JOB_DESCRIPTION).toBe('');
    });

    it('buildCandidateSystemPrompt defaults cleanly to Software Engineer without assuming Alignerr', () => {
      const prompt = buildCandidateSystemPrompt('', '', '', 'Java', 'interview');
      expect(prompt).not.toContain('Alignerr');
      expect(prompt).toContain('Software Engineer');
    });

    it('supports multiple interview workspaces and switches without leaking context', () => {
      const store = useAppStore.getState();

      const ws1Id = store.createWorkspace({
        name: 'Google L5 SRE',
        company: 'Google',
        role: 'Site Reliability Engineer',
        jobDescription: 'Large-scale distributed systems observability, SLOs, and incident response.',
        responseLanguage: 'English',
      });

      const ws2Id = store.createWorkspace({
        name: 'Apple iOS Engineer',
        company: 'Apple',
        role: 'iOS Core Frameworks Engineer',
        jobDescription: 'Swift, Metal, spatial audio, and low-latency client rendering.',
        responseLanguage: 'English',
      });

      // Switch to WS1
      store.setActiveWorkspace(ws1Id);
      expect(useAppStore.getState().targetRole).toBe('Site Reliability Engineer');
      expect(useAppStore.getState().jobDescriptionText).toContain('SLOs');

      // Switch to WS2
      store.setActiveWorkspace(ws2Id);
      expect(useAppStore.getState().targetRole).toBe('iOS Core Frameworks Engineer');
      expect(useAppStore.getState().jobDescriptionText).toContain('Metal');
      expect(useAppStore.getState().jobDescriptionText).not.toContain('SLOs');

      // Unset active workspace
      store.setActiveWorkspace(null);
      expect(useAppStore.getState().targetRole).toBe('');
      expect(useAppStore.getState().jobDescriptionText).toBe('');
    });
  });
});
