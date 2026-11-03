import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  FileText,
  SkipForward,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  CanonicalProfileService,
  CanonicalCandidateProfile,
  CandidateEducation,
  CandidateSkill,
  CandidateWorkExperience,
  CandidateProject,
  CandidateAchievement,
} from '../services/knowledgeVault';
import { DocumentIngestionService } from '../services/ingestion/documentIngestionService';

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

interface StepDef {
  id: WizardSection;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  required?: boolean;
}

const WIZARD_STEPS: StepDef[] = [
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CandidateProfileWizard: React.FC = () => {
  const { profileWizardOpen, setProfileWizardOpen, setToast } = useAppStore();
  const profileService = useMemo(() => CanonicalProfileService.getInstance(), []);

  const [activeStep, setActiveStep] = useState<WizardSection>('identity');
  const [profile, setProfile] = useState<CanonicalCandidateProfile>(() => profileService.getProfile());
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveStatusText, setSaveStatusText] = useState<string>('All changes saved');
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Subscribe to service updates
  useEffect(() => {
    const unsub = profileService.subscribe((updated) => setProfile(updated));
    return () => unsub();
  }, [profileService]);

  // Flush pending debounced autosave immediately to guarantee data persistence
  const flushPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    try {
      const saved = profileService.saveProfile(profile);
      if (saved) {
        setSaveStatus('saved');
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setSaveStatusText(`All changes saved (${time})`);
      } else {
        setSaveStatus('error');
        setSaveStatusText('Storage quota exceeded or save error');
      }
    } catch (err) {
      console.error('[CandidateProfileWizard] Immediate flush failed:', err);
      setSaveStatus('error');
      setSaveStatusText('Failed to save profile');
    }
  }, [profile, profileService]);

  // Handle application close / beforeunload to safely flush pending changes
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushPendingSave();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  // Focus restoration & trapping: save active element on open, trap Tab, restore focus on close
  useEffect(() => {
    if (profileWizardOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Focus modal container or first interactive element
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const firstFocusable = containerRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            containerRef.current.focus();
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [profileWizardOpen]);

  // Keyboard navigation, accessibility, and focus trapping (Tab & Escape)
  useEffect(() => {
    if (!profileWizardOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        flushPendingSave();
        setProfileWizardOpen(false);
        return;
      }

      // Trap Tab key within dialog modal
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null); // only visible elements

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profileWizardOpen, setProfileWizardOpen, flushPendingSave]);

  // Genuine Debounced Autosave with error handling
  const triggerSave = useCallback(
    (nextProfile: CanonicalCandidateProfile) => {
      setProfile(nextProfile);
      setSaveStatus('saving');
      setSaveStatusText('Saving...');

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        try {
          const success = profileService.saveProfile(nextProfile);
          if (success) {
            setSaveStatus('saved');
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setSaveStatusText(`Autosaved at ${time}`);
          } else {
            setSaveStatus('error');
            setSaveStatusText('Storage quota exceeded');
          }
        } catch (err) {
          console.error('[CandidateProfileWizard] Autosave failed:', err);
          setSaveStatus('error');
          setSaveStatusText('Error saving changes to local storage');
        }
      }, 500);
    },
    [profileService]
  );

  // Clean up debounce timer on unmount and flush pending save
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Strict completion calculation based on valid, sufficiently complete fields
  const completionPercentage = useMemo(() => {
    let score = 0;
    const maxScore = 9;

    // 1. Identity: Valid full name (>= 2 chars) and valid email
    if (profile.identity.fullName.trim().length >= 2 && EMAIL_REGEX.test(profile.identity.email.trim())) {
      score += 1;
    }

    // 2. Education: Institution & Degree specified
    if (profile.education.length > 0 && profile.education.some((e) => e.institution.trim() && e.degree.trim())) {
      score += 1;
    }

    // 3. Career: Current role non-empty and target seniority specified (not UNKNOWN)
    if (profile.career.currentRole.trim().length > 0 && profile.career.targetSeniority && profile.career.targetSeniority !== 'UNKNOWN') {
      score += 1;
    }

    // 4. Skills: Has skills; practical skills must have at least one project reference
    if (
      profile.skills.length > 0 &&
      profile.skills.some((s) => s.name.trim().length > 0 && (s.experienceType === 'theoretical' || s.projectReferences.length > 0))
    ) {
      score += 1;
    }

    // 5. Experience: Employer and title non-empty
    if (profile.experience.length > 0 && profile.experience.some((exp) => exp.employer.trim() && exp.title.trim())) {
      score += 1;
    }

    // 6. Projects: Name and non-trivial exact contribution (>= 10 chars)
    if (
      profile.projects.length > 0 &&
      profile.projects.some((p) => p.name.trim().length > 0 && p.exactContribution.trim().length >= 10)
    ) {
      score += 1;
    }

    // 7. Achievements: Title non-empty
    if (profile.achievements.length > 0 && profile.achievements.some((a) => a.title.trim().length > 0)) {
      score += 1;
    }

    // 8. Preferences: Preferred language & coding language specified
    if (profile.preferences.language.trim().length > 0 && profile.preferences.preferredCodingLanguage.trim().length > 0) {
      score += 1;
    }

    // 9. Declarations: At least one explicitly confirmed declaration
    if (
      profile.declarations.workAuthorization.confirmed ||
      profile.declarations.sponsorshipRequired.confirmed ||
      profile.declarations.willingToRelocate.confirmed ||
      profile.declarations.securityClearance.confirmed
    ) {
      score += 1;
    }

    return Math.round((score / maxScore) * 100);
  }, [profile]);

  if (!profileWizardOpen) return null;

  const currentStepIdx = WIZARD_STEPS.findIndex((s) => s.id === activeStep);
  const currentStep = WIZARD_STEPS[currentStepIdx];
  const isSkippable = !currentStep.required;

  const handleNext = () => {
    if (currentStepIdx < WIZARD_STEPS.length - 1) {
      setActiveStep(WIZARD_STEPS[currentStepIdx + 1].id);
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setActiveStep(WIZARD_STEPS[currentStepIdx - 1].id);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  // Export profile with latest unsaved changes flushed
  const handleExportJson = () => {
    flushPendingSave();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(profileService.exportJson());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `iac_candidate_profile_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setToast?.('Candidate profile exported successfully.');
  };

  // Import JSON profile with rigorous schema validation
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErrors(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = profileService.importJson(content);
        if (result.success) {
          setToast?.('Imported and verified profile successfully.');
          setImportErrors(null);
        } else {
          setImportErrors(result.errors || ['Schema validation error']);
          setToast?.(`Import rejected: ${result.errors?.length || 1} schema errors detected.`);
        }
      }
    };
    reader.readAsText(file);
  };

  // Resume Ingestion Import
  const handleResumeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      setToast?.('Parsing and analyzing resume...');
      const ingestion = await DocumentIngestionService.ingestFile(file);
      profileService.populateFromIngestion(ingestion);
      setToast?.(`Imported resume facts (${ingestion.claims?.length || 0} claims extracted).`);
    } catch (err: any) {
      console.error('Resume import error:', err);
      setToast?.(`Failed to import resume: ${err?.message || err}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Field validation flags
  const isFullNameValid = profile.identity.fullName.trim().length >= 2;
  const isEmailValid = EMAIL_REGEX.test(profile.identity.email.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <style>{`
        .wizard-shell {
          width: 95vw;
          max-width: 1120px;
          height: 90vh;
          max-height: 860px;
          background: #11141B;
          border: 1px solid #292E3A;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        }
        .wizard-main-layout {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        .wizard-sidebar {
          width: 230px;
          border-right: 1px solid #292E3A;
          background: #0F1218;
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          overflow-y: auto;
        }
        .wizard-grid-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .wizard-main-layout {
            flex-direction: column;
          }
          .wizard-sidebar {
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #292E3A;
            flex-direction: row;
            overflow-x: auto;
            padding: 8px;
            gap: 6px;
          }
          .wizard-grid-2col {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="wizard-shell" ref={containerRef}>
        {/* Wizard Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #292E3A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#171B24',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(139, 124, 255, 0.15)',
                color: '#8B7CFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 id="wizard-title" style={{ fontSize: '15px', fontWeight: 700, color: '#F3F4F8', margin: 0 }}>
                  Candidate Intelligence Wizard
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: completionPercentage > 75 ? 'rgba(53, 201, 145, 0.2)' : 'rgba(247, 185, 85, 0.2)',
                    color: completionPercentage > 75 ? '#35C991' : '#F7B955',
                    fontWeight: 700,
                  }}
                >
                  {completionPercentage}% Complete
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#9299AA', margin: '2px 0 0 0' }}>
                Factual grounding: Declarations require explicit confirmation. Unverified claims are quarantined.
              </p>
            </div>
          </div>

          {/* Quick Actions (Autosave, Export, Import, Close) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                color: saveStatus === 'error' ? '#f87171' : saveStatus === 'saving' ? '#F7B955' : '#35C991',
                marginRight: '6px',
              }}
            >
              {saveStatusText}
            </span>

            <button
              type="button"
              onClick={handleExportJson}
              title="Export Profile JSON"
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#CBD5E1',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Download size={12} /> Export
            </button>

            <label
              title="Import Profile JSON"
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#CBD5E1',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Upload size={12} /> Import JSON
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJsonFile} />
            </label>

            <button
              type="button"
              onClick={() => {
                flushPendingSave();
                setProfileWizardOpen(false);
              }}
              aria-label="Resume Later / Close Wizard (Esc)"
              title="Close Wizard (Esc)"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9299AA',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Validation Errors Banner */}
        {importErrors && (
          <div
            role="alert"
            style={{
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Profile Import Rejected (Schema Invariant Violation):</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {importErrors.slice(0, 4).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Wizard Main Container: Sidebar + Form Content */}
        <div className="wizard-main-layout">
          {/* Step Navigation Sidebar */}
          <div className="wizard-sidebar">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {WIZARD_STEPS.map((step) => {
                const isActive = step.id === activeStep;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: isActive ? 'rgba(139, 124, 255, 0.15)' : 'transparent',
                      color: isActive ? '#8B7CFF' : '#9299AA',
                      border: isActive ? '1px solid rgba(139, 124, 255, 0.3)' : '1px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <span style={{ color: isActive ? '#8B7CFF' : '#687082' }}>{step.icon}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {step.shortLabel}
                    </span>
                    {step.required && <span style={{ fontSize: '9px', color: '#F7B955' }}>*</span>}
                  </button>
                );
              })}
            </div>

            {/* Ingestion & Reset Utilities */}
            <div style={{ paddingTop: '10px', borderTop: '1px solid #1E2330', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#171B24',
                  border: '1px solid #292E3A',
                  color: '#9299AA',
                  fontSize: '11px',
                  cursor: isImporting ? 'wait' : 'pointer',
                  justifyContent: 'center',
                }}
              >
                <FileText size={12} />
                <span>{isImporting ? 'Ingesting...' : 'Import Resume File'}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  style={{ display: 'none' }}
                  onChange={handleResumeFileUpload}
                  disabled={isImporting}
                />
              </label>

              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  fontSize: '11px',
                  cursor: 'pointer',
                  justifyContent: 'center',
                }}
              >
                <RotateCcw size={12} /> Reset Data
              </button>
            </div>
          </div>

          {/* Form Step Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 28px',
              background: '#11141B',
            }}
          >
            {/* Step A: Personal Identity */}
            {activeStep === 'identity' && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  A. Personal Identity
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
                  Required core identity for grounding candidate answers and application assistance.
                </p>

                <div className="wizard-grid-2col">
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Full Legal Name <span style={{ color: '#F7B955' }}>*</span>
                    </label>
                    <input
                      type="text"
                      aria-required="true"
                      aria-invalid={!isFullNameValid && profile.identity.fullName.length > 0}
                      value={profile.identity.fullName}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: { ...profile.identity, fullName: e.target.value, candidateConfirmed: true },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. Jane Doe"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: !isFullNameValid && profile.identity.fullName.length > 0 ? '1px solid #f87171' : '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                    {!isFullNameValid && profile.identity.fullName.length > 0 && (
                      <span style={{ fontSize: '10px', color: '#f87171', marginTop: '2px', display: 'block' }}>
                        Please enter your full name (at least 2 characters)
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Preferred Name
                    </label>
                    <input
                      type="text"
                      value={profile.identity.preferredName || ''}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: { ...profile.identity, preferredName: e.target.value },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. JD"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Email Address <span style={{ color: '#F7B955' }}>*</span>
                    </label>
                    <input
                      type="email"
                      aria-required="true"
                      aria-invalid={!isEmailValid && profile.identity.email.length > 0}
                      value={profile.identity.email}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: { ...profile.identity, email: e.target.value, candidateConfirmed: true },
                        };
                        triggerSave(next);
                      }}
                      placeholder="jane.doe@example.com"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: !isEmailValid && profile.identity.email.length > 0 ? '1px solid #f87171' : '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                    {!isEmailValid && profile.identity.email.length > 0 && (
                      <span style={{ fontSize: '10px', color: '#f87171', marginTop: '2px', display: 'block' }}>
                        Please enter a valid email address
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={profile.identity.phone || ''}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: { ...profile.identity, phone: e.target.value },
                        };
                        triggerSave(next);
                      }}
                      placeholder="+1 (555) 000-0000"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Current Location
                    </label>
                    <input
                      type="text"
                      value={profile.identity.location}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: { ...profile.identity, location: e.target.value },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. San Francisco, CA"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Time Zone
                    </label>
                    <input
                      type="text"
                      value={profile.identity.timeZone || ''}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: { ...profile.identity, timeZone: e.target.value },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. America/Los_Angeles"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                    Links &amp; Profiles
                  </label>
                  <div className="wizard-grid-2col">
                    <input
                      type="text"
                      placeholder="GitHub URL (https://github.com/...)"
                      value={profile.identity.links.github || ''}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: {
                            ...profile.identity,
                            links: { ...profile.identity.links, github: e.target.value },
                          },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="LinkedIn URL (https://linkedin.com/in/...)"
                      value={profile.identity.links.linkedin || ''}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          identity: {
                            ...profile.identity,
                            links: { ...profile.identity.links, linkedin: e.target.value },
                          },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step B: Education */}
            {activeStep === 'education' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      B. Education &amp; Certifications (Optional)
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Academic degrees and graduation timelines.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newEdu: CandidateEducation = {
                        id: `edu_${Date.now()}`,
                        institution: '',
                        degree: '',
                        fieldOfStudy: '',
                        startDate: '',
                        endDate: '',
                        grade: '',
                        status: 'CANDIDATE_CONFIRMED',
                        candidateConfirmed: true,
                      };
                      triggerSave({ ...profile, education: [...profile.education, newEdu] });
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={14} /> Add Degree
                  </button>
                </div>

                {profile.education.length === 0 ? (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      background: '#171B24',
                      borderRadius: '8px',
                      border: '1px dashed #292E3A',
                      color: '#9299AA',
                      fontSize: '13px',
                    }}
                  >
                    No education records added yet. Click &quot;Add Degree&quot; or skip to the next section.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {profile.education.map((edu, idx) => (
                      <div
                        key={edu.id}
                        style={{
                          padding: '16px',
                          background: '#171B24',
                          border: '1px solid #292E3A',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#8B7CFF' }}>
                            Degree #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = profile.education.filter((_, i) => i !== idx);
                              triggerSave({ ...profile, education: next });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="wizard-grid-2col">
                          <input
                            type="text"
                            placeholder="Institution (e.g. Stanford University)"
                            value={edu.institution}
                            onChange={(e) => {
                              const next = [...profile.education];
                              next[idx].institution = e.target.value;
                              triggerSave({ ...profile, education: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Degree &amp; Major (e.g. B.S. in Computer Science)"
                            value={edu.degree}
                            onChange={(e) => {
                              const next = [...profile.education];
                              next[idx].degree = e.target.value;
                              triggerSave({ ...profile, education: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Graduation Year / Dates (e.g. 2018 - 2022)"
                            value={edu.endDate || ''}
                            onChange={(e) => {
                              const next = [...profile.education];
                              next[idx].endDate = e.target.value;
                              triggerSave({ ...profile, education: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Grade / CGPA (Optional)"
                            value={edu.grade || ''}
                            onChange={(e) => {
                              const next = [...profile.education];
                              next[idx].grade = e.target.value;
                              triggerSave({ ...profile, education: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step C: Career Overview */}
            {activeStep === 'career' && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  C. Career &amp; Target Roles
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
                  Zero invented defaults: target seniority defaults to UNKNOWN until you specify it.
                </p>

                <div className="wizard-grid-2col">
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Current Role / Title
                    </label>
                    <input
                      type="text"
                      value={profile.career.currentRole}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          career: { ...profile.career, currentRole: e.target.value, candidateConfirmed: true },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. Senior Backend Engineer"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Total Experience (Years)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={profile.career.totalExperienceYears !== undefined ? profile.career.totalExperienceYears : ''}
                      onChange={(e) => {
                        const val = e.target.value.trim() === '' ? undefined : Number(e.target.value);
                        const next = {
                          ...profile,
                          career: { ...profile.career, totalExperienceYears: val },
                        };
                        triggerSave(next);
                      }}
                      placeholder="Leave blank if unstated"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Target Seniority Level
                    </label>
                    <select
                      value={profile.career.targetSeniority || 'UNKNOWN'}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          career: { ...profile.career, targetSeniority: e.target.value as any },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    >
                      <option value="UNKNOWN">Unspecified / Unknown</option>
                      <option value="junior">Junior Engineer</option>
                      <option value="mid">Mid-Level Engineer</option>
                      <option value="senior">Senior Engineer</option>
                      <option value="staff">Staff / Lead Engineer</option>
                      <option value="principal">Principal Engineer</option>
                      <option value="executive">Engineering Manager / Director</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Notice Period
                    </label>
                    <input
                      type="text"
                      value={profile.career.noticePeriod}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          career: { ...profile.career, noticePeriod: e.target.value },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. Immediate / 2 Weeks / 30 Days"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step D: Skills */}
            {activeStep === 'skills' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      D. Skills &amp; Rigorous Experience Bounds
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Practical production skills must resolve against registered projects demonstrating actual implementation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newSkill: CandidateSkill = {
                        id: `skill_${Date.now()}`,
                        name: '',
                        proficiency: 'UNSPECIFIED',
                        experienceType: 'theoretical',
                        yearsUsed: undefined,
                        projectReferences: [],
                        evidenceSource: 'Candidate Manual Entry',
                        status: 'CANDIDATE_CONFIRMED',
                        candidateConfirmed: true,
                      };
                      triggerSave({ ...profile, skills: [...profile.skills, newSkill] });
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={14} /> Add Skill
                  </button>
                </div>

                {profile.skills.length === 0 ? (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      background: '#171B24',
                      borderRadius: '8px',
                      border: '1px dashed #292E3A',
                      color: '#9299AA',
                      fontSize: '13px',
                    }}
                  >
                    No skills added yet. Add a skill or skip.
                  </div>
                ) : (
                  <div className="wizard-grid-2col">
                    {profile.skills.map((skill, idx) => (
                      <div
                        key={skill.id}
                        style={{
                          padding: '12px',
                          background: '#171B24',
                          border: '1px solid #292E3A',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Skill Name (e.g. Go, Kafka)"
                            value={skill.name}
                            onChange={(e) => {
                              const next = [...profile.skills];
                              next[idx].name = e.target.value;
                              triggerSave({ ...profile, skills: next });
                            }}
                            style={{
                              flex: 1,
                              padding: '4px 8px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '13px',
                              fontWeight: 600,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = profile.skills.filter((_, i) => i !== idx);
                              triggerSave({ ...profile, skills: next });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', marginLeft: '6px' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select
                            value={skill.experienceType}
                            onChange={(e) => {
                              const next = [...profile.skills];
                              next[idx].experienceType = e.target.value as any;
                              triggerSave({ ...profile, skills: next });
                            }}
                            style={{
                              flex: 1,
                              padding: '4px 6px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: skill.experienceType === 'practical' ? '#35C991' : '#F7B955',
                              fontSize: '11px',
                            }}
                          >
                            <option value="theoretical">Theoretical Only</option>
                            <option value="practical">Practical / Production</option>
                          </select>

                          <select
                            value={skill.proficiency || 'UNSPECIFIED'}
                            onChange={(e) => {
                              const next = [...profile.skills];
                              next[idx].proficiency = e.target.value as any;
                              triggerSave({ ...profile, skills: next });
                            }}
                            style={{
                              flex: 1,
                              padding: '4px 6px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#CBD5E1',
                              fontSize: '11px',
                            }}
                          >
                            <option value="UNSPECIFIED">Proficiency Unspecified</option>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                            <option value="expert">Expert</option>
                          </select>
                        </div>

                        {skill.experienceType === 'practical' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '10px', color: '#35C991', marginBottom: '2px' }}>
                              Referenced Projects (Required for Practical Claims):
                            </label>
                            <input
                              type="text"
                              placeholder="Comma-separated project names (e.g. TelemetryPipeline)"
                              value={skill.projectReferences.join(', ')}
                              onChange={(e) => {
                                const refs = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                const next = [...profile.skills];
                                next[idx].projectReferences = refs;
                                triggerSave({ ...profile, skills: next });
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                background: '#0F1218',
                                border: '1px solid #292E3A',
                                borderRadius: '4px',
                                color: '#F3F4F8',
                                fontSize: '11px',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step E: Work Experience */}
            {activeStep === 'experience' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      E. Work Experience &amp; Authorship
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Distinguish what you personally built from collective team duties.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newExp: CandidateWorkExperience = {
                        id: `exp_${Date.now()}`,
                        employer: '',
                        title: '',
                        startDate: '',
                        endDate: '',
                        isCurrent: false,
                        responsibilities: [],
                        personallyImplemented: [],
                        teamContributions: [],
                        leadershipResponsibilities: [],
                        outcomesAndMetrics: [],
                        technologiesUsed: [],
                        missingOrUncertainFacts: [],
                        status: 'CANDIDATE_CONFIRMED',
                        candidateConfirmed: true,
                      };
                      triggerSave({ ...profile, experience: [...profile.experience, newExp] });
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={14} /> Add Role
                  </button>
                </div>

                {profile.experience.length === 0 ? (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      background: '#171B24',
                      borderRadius: '8px',
                      border: '1px dashed #292E3A',
                      color: '#9299AA',
                      fontSize: '13px',
                    }}
                  >
                    No employment history entered yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {profile.experience.map((exp, idx) => (
                      <div
                        key={exp.id}
                        style={{
                          padding: '16px',
                          background: '#171B24',
                          border: '1px solid #292E3A',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#F3F4F8' }}>
                            Role #{idx + 1}: {exp.title || 'Untitled'} {exp.employer ? `@ ${exp.employer}` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = profile.experience.filter((_, i) => i !== idx);
                              triggerSave({ ...profile, experience: next });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="wizard-grid-2col" style={{ marginBottom: '10px' }}>
                          <input
                            type="text"
                            placeholder="Employer / Company"
                            value={exp.employer}
                            onChange={(e) => {
                              const next = [...profile.experience];
                              next[idx].employer = e.target.value;
                              triggerSave({ ...profile, experience: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Title / Position"
                            value={exp.title}
                            onChange={(e) => {
                              const next = [...profile.experience];
                              next[idx].title = e.target.value;
                              triggerSave({ ...profile, experience: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#35C991', fontWeight: 600, marginBottom: '4px' }}>
                            Personally Implemented Work (Strictly Your Own Code / Architecture)
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Detail exactly what services, algorithms, or modules you personally implemented..."
                            value={exp.personallyImplemented.join('\n')}
                            onChange={(e) => {
                              const next = [...profile.experience];
                              next[idx].personallyImplemented = e.target.value.split('\n').filter(Boolean);
                              triggerSave({ ...profile, experience: next });
                            }}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                              lineHeight: '1.4',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step F: Projects */}
            {activeStep === 'projects' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      F. Projects &amp; Provenance Tracking
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Repository code presence does not prove personal authorship without explicit contribution.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newProj: CandidateProject = {
                        id: `proj_${Date.now()}`,
                        name: '',
                        description: '',
                        repositoryUrl: '',
                        ownership: 'UNKNOWN',
                        exactContribution: '',
                        technologyStack: [],
                        deploymentStatus: 'UNKNOWN',
                        outcomes: [],
                        evidenceReferences: [],
                        status: 'CANDIDATE_CONFIRMED',
                        candidateConfirmed: true,
                      };
                      triggerSave({ ...profile, projects: [...profile.projects, newProj] });
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={14} /> Add Project
                  </button>
                </div>

                {profile.projects.length === 0 ? (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      background: '#171B24',
                      borderRadius: '8px',
                      border: '1px dashed #292E3A',
                      color: '#9299AA',
                      fontSize: '13px',
                    }}
                  >
                    No projects registered yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {profile.projects.map((proj, idx) => (
                      <div
                        key={proj.id}
                        style={{
                          padding: '16px',
                          background: '#171B24',
                          border: '1px solid #292E3A',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#F3F4F8' }}>
                            Project #{idx + 1}: {proj.name || 'Untitled'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = profile.projects.filter((_, i) => i !== idx);
                              triggerSave({ ...profile, projects: next });
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="wizard-grid-2col" style={{ marginBottom: '10px' }}>
                          <input
                            type="text"
                            placeholder="Project Name (e.g. RaftKV)"
                            value={proj.name}
                            onChange={(e) => {
                              const next = [...profile.projects];
                              next[idx].name = e.target.value;
                              triggerSave({ ...profile, projects: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Repository URL (e.g. https://github.com/org/repo)"
                            value={proj.repositoryUrl || ''}
                            onChange={(e) => {
                              const next = [...profile.projects];
                              next[idx].repositoryUrl = e.target.value;
                              triggerSave({ ...profile, projects: next });
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                            }}
                          />
                        </div>

                        <div className="wizard-grid-2col" style={{ marginBottom: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#CBD5E1', marginBottom: '2px' }}>
                              Ownership Category
                            </label>
                            <select
                              value={proj.ownership}
                              onChange={(e) => {
                                const next = [...profile.projects];
                                next[idx].ownership = e.target.value as any;
                                triggerSave({ ...profile, projects: next });
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: '#0F1218',
                                border: '1px solid #292E3A',
                                borderRadius: '4px',
                                color: '#F3F4F8',
                                fontSize: '11px',
                              }}
                            >
                              <option value="UNKNOWN">Unknown / Unspecified</option>
                              <option value="SOLE_OWNER">Sole Owner / Author</option>
                              <option value="PRIMARY_CONTRIBUTOR">Primary Contributor</option>
                              <option value="COLLABORATOR">Collaborator / Maintenance</option>
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#CBD5E1', marginBottom: '2px' }}>
                              Technology Stack (Comma-separated)
                            </label>
                            <input
                              type="text"
                              placeholder="Go, gRPC, Protobuf, Docker"
                              value={proj.technologyStack.join(', ')}
                              onChange={(e) => {
                                const techs = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                const next = [...profile.projects];
                                next[idx].technologyStack = techs;
                                triggerSave({ ...profile, projects: next });
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                background: '#0F1218',
                                border: '1px solid #292E3A',
                                borderRadius: '4px',
                                color: '#F3F4F8',
                                fontSize: '11px',
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#35C991', fontWeight: 600, marginBottom: '2px' }}>
                            Exact Personal Contribution (Required to Enable Live Answers)
                          </label>
                          <textarea
                            rows={3}
                            placeholder="State exactly what modules, logic, or optimizations you authored..."
                            value={proj.exactContribution}
                            onChange={(e) => {
                              const next = [...profile.projects];
                              next[idx].exactContribution = e.target.value;
                              triggerSave({ ...profile, projects: next });
                            }}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: '#0F1218',
                              border: '1px solid #292E3A',
                              borderRadius: '4px',
                              color: '#F3F4F8',
                              fontSize: '12px',
                              lineHeight: '1.4',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step G: Achievements */}
            {activeStep === 'achievements' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      G. Achievements &amp; Publications (Optional)
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Awards, research papers, patents, and measurable recognitions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newAch: CandidateAchievement = {
                        id: `ach_${Date.now()}`,
                        title: '',
                        category: 'award',
                        status: 'CANDIDATE_CONFIRMED',
                        candidateConfirmed: true,
                      };
                      triggerSave({ ...profile, achievements: [...profile.achievements, newAch] });
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Plus size={14} /> Add Achievement
                  </button>
                </div>

                {profile.achievements.length === 0 ? (
                  <div
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      background: '#171B24',
                      borderRadius: '8px',
                      border: '1px dashed #292E3A',
                      color: '#9299AA',
                      fontSize: '13px',
                    }}
                  >
                    No achievements added.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {profile.achievements.map((ach, idx) => (
                      <div
                        key={ach.id}
                        style={{
                          padding: '12px',
                          background: '#171B24',
                          border: '1px solid #292E3A',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <select
                          value={ach.category}
                          onChange={(e) => {
                            const next = [...profile.achievements];
                            next[idx].category = e.target.value as any;
                            triggerSave({ ...profile, achievements: next });
                          }}
                          style={{
                            padding: '6px 8px',
                            background: '#0F1218',
                            border: '1px solid #292E3A',
                            borderRadius: '4px',
                            color: '#8B7CFF',
                            fontSize: '12px',
                          }}
                        >
                          <option value="award">Award</option>
                          <option value="publication">Publication</option>
                          <option value="certification">Certification</option>
                          <option value="recommendation">Recommendation</option>
                          <option value="outcome">Measurable Outcome</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Title or description..."
                          value={ach.title}
                          onChange={(e) => {
                            const next = [...profile.achievements];
                            next[idx].title = e.target.value;
                            triggerSave({ ...profile, achievements: next });
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            background: '#0F1218',
                            border: '1px solid #292E3A',
                            borderRadius: '4px',
                            color: '#F3F4F8',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = profile.achievements.filter((_, i) => i !== idx);
                            triggerSave({ ...profile, achievements: next });
                          }}
                          style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step H: Answer Preferences */}
            {activeStep === 'preferences' && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  H. Teleprompter &amp; Answer Preferences
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
                  Tune how answers are structured and paced during live interviews.
                </p>

                <div className="wizard-grid-2col">
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Answer Length
                    </label>
                    <select
                      value={profile.preferences.answerLength}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          preferences: { ...profile.preferences, answerLength: e.target.value as any },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    >
                      <option value="concise">Concise (Under 60 seconds speaking time)</option>
                      <option value="balanced">Balanced (90-120 seconds)</option>
                      <option value="detailed">Detailed (Comprehensive walkthrough)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Speaking Perspective
                    </label>
                    <select
                      value={profile.preferences.responsePerspective}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          preferences: { ...profile.preferences, responsePerspective: e.target.value as any },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    >
                      <option value="first_person">First-Person (&quot;I designed...&quot; when verified)</option>
                      <option value="neutral">Neutral 3rd-Person (Objective technical guidance)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Technical Depth
                    </label>
                    <select
                      value={profile.preferences.technicalDepth}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          preferences: { ...profile.preferences, technicalDepth: e.target.value as any },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    >
                      <option value="conceptual">High-Level Conceptual &amp; Trade-offs</option>
                      <option value="balanced">Balanced Architecture &amp; Decisions</option>
                      <option value="deep_code_and_architecture">Deep Implementation &amp; Concurrency</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Preferred Coding Language
                    </label>
                    <input
                      type="text"
                      value={profile.preferences.preferredCodingLanguage}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          preferences: { ...profile.preferences, preferredCodingLanguage: e.target.value },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. TypeScript, Python, Go, Java"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: '#171B24',
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step I: Employment Declarations */}
            {activeStep === 'declarations' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <ShieldAlert size={20} color="#F7B955" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                    I. Employment Declarations (Candidate Confirmation Required)
                  </h3>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(247, 185, 85, 0.1)',
                    border: '1px solid rgba(247, 185, 85, 0.3)',
                    color: '#FDE047',
                    fontSize: '12px',
                    marginBottom: '16px',
                    lineHeight: '1.4',
                  }}
                >
                  <strong>Zero-Inference Invariant:</strong> These declarations are strictly optional. Unconfirmed declarations remain unstated and will prompt for clarification rather than being fabricated.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Work Authorization */}
                  <div style={{ padding: '14px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#F3F4F8' }}>
                        1. Work Authorization Status
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#35C991' }}>
                        <input
                          type="checkbox"
                          checked={profile.declarations.workAuthorization.confirmed}
                          onChange={(e) => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                workAuthorization: {
                                  ...profile.declarations.workAuthorization,
                                  confirmed: e.target.checked,
                                  confirmedAt: e.target.checked ? Date.now() : undefined,
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Confirm this declaration</span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                        <input
                          type="radio"
                          name="workAuth"
                          checked={profile.declarations.workAuthorization.authorized === true}
                          onChange={() => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                workAuthorization: {
                                  ...profile.declarations.workAuthorization,
                                  authorized: true,
                                  confirmed: true,
                                  confirmedAt: Date.now(),
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Legally authorized to work</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                        <input
                          type="radio"
                          name="workAuth"
                          checked={profile.declarations.workAuthorization.authorized === false}
                          onChange={() => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                workAuthorization: {
                                  ...profile.declarations.workAuthorization,
                                  authorized: false,
                                  confirmed: true,
                                  confirmedAt: Date.now(),
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Not authorized without permit</span>
                      </label>
                    </div>

                    <input
                      type="text"
                      placeholder="Authorized jurisdictions (e.g. United States, European Union, Canada)"
                      value={profile.declarations.workAuthorization.jurisdictions.join(', ')}
                      onChange={(e) => {
                        const jurisdictions = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        const next = {
                          ...profile,
                          declarations: {
                            ...profile.declarations,
                            workAuthorization: { ...profile.declarations.workAuthorization, jurisdictions },
                          },
                        };
                        triggerSave(next);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: '#0F1218',
                        border: '1px solid #292E3A',
                        borderRadius: '4px',
                        color: '#F3F4F8',
                        fontSize: '12px',
                      }}
                    />
                  </div>

                  {/* Visa Sponsorship */}
                  <div style={{ padding: '14px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#F3F4F8' }}>
                        2. Visa Sponsorship Requirements
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#35C991' }}>
                        <input
                          type="checkbox"
                          checked={profile.declarations.sponsorshipRequired.confirmed}
                          onChange={(e) => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                sponsorshipRequired: {
                                  ...profile.declarations.sponsorshipRequired,
                                  confirmed: e.target.checked,
                                  confirmedAt: e.target.checked ? Date.now() : undefined,
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Confirm this declaration</span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                        <input
                          type="radio"
                          name="sponsorship"
                          checked={profile.declarations.sponsorshipRequired.required === false}
                          onChange={() => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                sponsorshipRequired: {
                                  ...profile.declarations.sponsorshipRequired,
                                  required: false,
                                  confirmed: true,
                                  confirmedAt: Date.now(),
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Will NOT require sponsorship</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1' }}>
                        <input
                          type="radio"
                          name="sponsorship"
                          checked={profile.declarations.sponsorshipRequired.required === true}
                          onChange={() => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                sponsorshipRequired: {
                                  ...profile.declarations.sponsorshipRequired,
                                  required: true,
                                  confirmed: true,
                                  confirmedAt: Date.now(),
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>WILL require visa sponsorship</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Review & Confirm */}
            {activeStep === 'review' && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  Review Candidate Intelligence &amp; Provenance Ledger
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '16px' }}>
                  Verify that all claims accurately reflect your verified background before closing.
                </p>

                <div className="wizard-grid-2col" style={{ marginBottom: '16px' }}>
                  <div style={{ padding: '14px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A' }}>
                    <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#8B7CFF', margin: '0 0 8px 0' }}>
                      Identity &amp; Career
                    </h4>
                    <div style={{ fontSize: '12px', color: '#F3F4F8', lineHeight: '1.6' }}>
                      <div><strong>Name:</strong> {profile.identity.fullName || 'Not provided'}</div>
                      <div><strong>Email:</strong> {profile.identity.email || 'Not provided'}</div>
                      <div><strong>Location:</strong> {profile.identity.location || 'Not provided'}</div>
                      <div><strong>Current Role:</strong> {profile.career.currentRole || 'Not specified'}</div>
                      <div><strong>Seniority:</strong> {profile.career.targetSeniority || 'UNKNOWN'}</div>
                    </div>
                  </div>

                  <div style={{ padding: '14px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A' }}>
                    <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#35C991', margin: '0 0 8px 0' }}>
                      Grounding &amp; Declarations
                    </h4>
                    <div style={{ fontSize: '12px', color: '#F3F4F8', lineHeight: '1.6' }}>
                      <div>
                        <strong>Work Authorization:</strong>{' '}
                        {profile.declarations.workAuthorization.confirmed
                          ? profile.declarations.workAuthorization.authorized ? 'Authorized' : 'Not Authorized'
                          : 'Unconfirmed'}
                      </div>
                      <div>
                        <strong>Sponsorship:</strong>{' '}
                        {profile.declarations.sponsorshipRequired.confirmed
                          ? profile.declarations.sponsorshipRequired.required ? 'Required' : 'Not Required'
                          : 'Unconfirmed'}
                      </div>
                      <div><strong>Registered Skills:</strong> {profile.skills.length} skills</div>
                      <div><strong>Verified Projects:</strong> {profile.projects.length} projects</div>
                      <div><strong>Employment Roles:</strong> {profile.experience.length} roles</div>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      profileService.saveProfile(profile);
                      setToast?.('Candidate profile locked and saved for live grounding.');
                      setProfileWizardOpen(false);
                    }}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(139, 124, 255, 0.3)',
                    }}
                  >
                    <CheckCircle2 size={16} /> Complete &amp; Lock Profile
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Wizard Footer Navigation */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #292E3A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#171B24',
          }}
        >
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStepIdx === 0}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#0F1218',
              border: '1px solid #292E3A',
              color: currentStepIdx === 0 ? '#475569' : '#CBD5E1',
              fontSize: '12px',
              cursor: currentStepIdx === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ChevronLeft size={14} /> Previous
          </button>

          <span style={{ fontSize: '11px', color: '#9299AA' }}>
            Step {currentStepIdx + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[currentStepIdx].label}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSkippable && currentStepIdx < WIZARD_STEPS.length - 1 && (
              <button
                type="button"
                onClick={handleSkip}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>Skip</span>
                <SkipForward size={13} />
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              disabled={currentStepIdx === WIZARD_STEPS.length - 1}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: currentStepIdx === WIZARD_STEPS.length - 1 ? '#0F1218' : '#8B7CFF',
                border: 'none',
                color: currentStepIdx === WIZARD_STEPS.length - 1 ? '#475569' : '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: currentStepIdx === WIZARD_STEPS.length - 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Clearing Data */}
      {showClearConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              maxWidth: '400px',
              width: '100%',
              padding: '24px',
              background: '#171B24',
              borderRadius: '12px',
              border: '1px solid #EF4444',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444', marginBottom: '12px' }}>
              <AlertTriangle size={24} />
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Reset All Candidate Data?</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '20px', lineHeight: '1.4' }}>
              This will erase all personal identity, education, projects, skills, and employment declarations from your local browser vault.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#292E3A',
                  border: 'none',
                  color: '#CBD5E1',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  profileService.clearAllCandidateData();
                  setShowClearConfirm(false);
                  setToast?.('All candidate data erased.');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: '#EF4444',
                  border: 'none',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Yes, Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
