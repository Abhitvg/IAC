import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import {
  WizardSection,
  WIZARD_STEPS,
  EMAIL_REGEX,
  CandidateIdentity,
  CandidateCareerOverview,
  CandidateDeclarations,
  CandidateAnswerPreferences,
} from './wizard/types';
import { WizardHeader } from './wizard/WizardHeader';
import { WizardSidebar } from './wizard/WizardSidebar';
import { WizardFooter } from './wizard/WizardFooter';
import { IdentitySection } from './wizard/IdentitySection';
import { EducationSection } from './wizard/EducationSection';
import { CareerSection } from './wizard/CareerSection';
import { SkillsSection } from './wizard/SkillsSection';
import { ExperienceSection } from './wizard/ExperienceSection';
import { ProjectsSection } from './wizard/ProjectsSection';
import { AchievementsSection } from './wizard/AchievementsSection';
import { PreferencesSection } from './wizard/PreferencesSection';
import { DeclarationsSection } from './wizard/DeclarationsSection';
import { ReviewSection } from './wizard/ReviewSection';

export const CandidateProfileWizard: React.FC = () => {
  const { profileWizardOpen, setProfileWizardOpen, setToast } = useAppStore();
  const profileService = useMemo(() => CanonicalProfileService.getInstance(), []);

  const [activeStep, setActiveStep] = useState<WizardSection>('identity');
  const [profile, setProfile] = useState<CanonicalCandidateProfile>(() =>
    profileService.getProfile()
  );
  const profileRef = useRef<CanonicalCandidateProfile>(profile);
  profileRef.current = profile;

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveStatusText, setSaveStatusText] = useState<string>('All changes saved');
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Active section flush handler registry
  const sectionFlushRef = useRef<(() => void) | null>(null);
  const registerFlushHandler = useCallback((flushFn: () => void) => {
    sectionFlushRef.current = flushFn;
    return () => {
      if (sectionFlushRef.current === flushFn) {
        sectionFlushRef.current = null;
      }
    };
  }, []);

  // Avoid subscriber feedback loops caused by our own saves
  const lastSelfSaveTimestampRef = useRef<number>(0);

  // Subscribe to service updates (from external sources like ingestion or ledger)
  useEffect(() => {
    const unsub = profileService.subscribe((updated) => {
      if (Date.now() - lastSelfSaveTimestampRef.current < 400) {
        // Ignored: notification triggered by our own recent save
        return;
      }
      setProfile(updated);
    });
    return () => unsub();
  }, [profileService]);

  // Flush pending debounced autosave immediately to guarantee data persistence
  const flushPendingSave = useCallback(() => {
    if (sectionFlushRef.current) {
      try {
        sectionFlushRef.current();
      } catch (err) {
        console.error('[CandidateProfileWizard] Section flush error:', err);
      }
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    try {
      lastSelfSaveTimestampRef.current = Date.now();
      const saved = profileService.saveProfile(profileRef.current);
      if (saved) {
        setSaveStatus('saved');
        const time = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
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
  }, [profileService]);

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
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !containerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !containerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profileWizardOpen, setProfileWizardOpen, flushPendingSave]);

  // Commit updated profile with debounce or immediate save
  const commitProfileChange = useCallback(
    (nextProfile: CanonicalCandidateProfile, immediate = false) => {
      setProfile(nextProfile);
      profileRef.current = nextProfile;
      setSaveStatus('saving');
      setSaveStatusText('Saving...');

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (immediate) {
        try {
          lastSelfSaveTimestampRef.current = Date.now();
          const success = profileService.saveProfile(nextProfile);
          if (success) {
            setSaveStatus('saved');
            const time = new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            setSaveStatusText(`Autosaved at ${time}`);
          } else {
            setSaveStatus('error');
            setSaveStatusText('Storage quota exceeded');
          }
        } catch (err) {
          console.error('[CandidateProfileWizard] Save failed:', err);
          setSaveStatus('error');
          setSaveStatusText('Error saving changes to local storage');
        }
      } else {
        debounceTimerRef.current = setTimeout(() => {
          try {
            lastSelfSaveTimestampRef.current = Date.now();
            const success = profileService.saveProfile(nextProfile);
            if (success) {
              setSaveStatus('saved');
              const time = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
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
        }, 350);
      }
    },
    [profileService]
  );

  // Section update handlers
  const handleUpdateIdentity = useCallback(
    (nextIdentity: CandidateIdentity, immediate = false) => {
      commitProfileChange({ ...profileRef.current, identity: nextIdentity }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdateEducation = useCallback(
    (nextEdu: CandidateEducation[], immediate = false) => {
      commitProfileChange({ ...profileRef.current, education: nextEdu }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdateCareer = useCallback(
    (nextCareer: CandidateCareerOverview, immediate = false) => {
      commitProfileChange({ ...profileRef.current, career: nextCareer }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdateSkills = useCallback(
    (nextSkills: CandidateSkill[], immediate = false) => {
      commitProfileChange({ ...profileRef.current, skills: nextSkills }, immediate);
    },
    [commitProfileChange]
  );

  const handleDeleteSkillFact = useCallback(
    (skillName: string) => {
      profileService.deleteFact(`skill:${skillName}`, 'Removed by candidate in wizard');
    },
    [profileService]
  );

  const handleUpdateExperience = useCallback(
    (nextExp: CandidateWorkExperience[], immediate = false) => {
      commitProfileChange({ ...profileRef.current, experience: nextExp }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdateProjects = useCallback(
    (nextProjects: CandidateProject[], immediate = false) => {
      commitProfileChange({ ...profileRef.current, projects: nextProjects }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdateAchievements = useCallback(
    (nextAch: CandidateAchievement[], immediate = false) => {
      commitProfileChange({ ...profileRef.current, achievements: nextAch }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdatePreferences = useCallback(
    (nextPref: CandidateAnswerPreferences, immediate = false) => {
      commitProfileChange({ ...profileRef.current, preferences: nextPref }, immediate);
    },
    [commitProfileChange]
  );

  const handleUpdateDeclarations = useCallback(
    (nextDec: CandidateDeclarations, immediate = false) => {
      commitProfileChange({ ...profileRef.current, declarations: nextDec }, immediate);
    },
    [commitProfileChange]
  );

  const handleCompleteAndLock = useCallback(() => {
    flushPendingSave();
    profileService.saveProfile(profileRef.current);
    setToast?.('Candidate profile locked and saved for live grounding.');
    setProfileWizardOpen(false);
  }, [flushPendingSave, profileService, setProfileWizardOpen, setToast]);

  // Clean up debounce timer on unmount
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
    if (
      profile.identity.fullName.trim().length >= 2 &&
      EMAIL_REGEX.test(profile.identity.email.trim())
    ) {
      score += 1;
    }

    // 2. Education: Institution & Degree specified
    if (
      profile.education.length > 0 &&
      profile.education.some((e) => e.institution.trim() && e.degree.trim())
    ) {
      score += 1;
    }

    // 3. Career: Current role non-empty and target seniority specified (not UNKNOWN)
    if (
      profile.career.currentRole.trim().length > 0 &&
      profile.career.targetSeniority &&
      profile.career.targetSeniority !== 'UNKNOWN'
    ) {
      score += 1;
    }

    // 4. Skills: Has skills; practical skills must have at least one project reference
    if (
      profile.skills.length > 0 &&
      profile.skills.some(
        (s) =>
          s.name.trim().length > 0 &&
          (s.experienceType === 'theoretical' || s.projectReferences.length > 0)
      )
    ) {
      score += 1;
    }

    // 5. Experience: Employer and title non-empty
    if (
      profile.experience.length > 0 &&
      profile.experience.some((exp) => exp.employer.trim() && exp.title.trim())
    ) {
      score += 1;
    }

    // 6. Projects: Name and non-trivial exact contribution (>= 10 chars)
    if (
      profile.projects.length > 0 &&
      profile.projects.some(
        (p) => p.name.trim().length > 0 && p.exactContribution.trim().length >= 10
      )
    ) {
      score += 1;
    }

    // 7. Achievements: Title non-empty
    if (
      profile.achievements.length > 0 &&
      profile.achievements.some((a) => a.title.trim().length > 0)
    ) {
      score += 1;
    }

    // 8. Preferences: Preferred language & coding language specified
    if (
      profile.preferences.language.trim().length > 0 &&
      profile.preferences.preferredCodingLanguage.trim().length > 0
    ) {
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

  const currentStepIdx = WIZARD_STEPS.findIndex((s) => s.id === activeStep);
  const currentStep = WIZARD_STEPS[currentStepIdx];
  const isSkippable = !currentStep.required;

  const navigateToStep = useCallback((nextStep: WizardSection) => {
    if (sectionFlushRef.current) {
      sectionFlushRef.current();
    }
    setActiveStep(nextStep);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStepIdx < WIZARD_STEPS.length - 1) {
      navigateToStep(WIZARD_STEPS[currentStepIdx + 1].id);
    }
  }, [currentStepIdx, navigateToStep]);

  const handlePrev = useCallback(() => {
    if (currentStepIdx > 0) {
      navigateToStep(WIZARD_STEPS[currentStepIdx - 1].id);
    }
  }, [currentStepIdx, navigateToStep]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  // Export profile with latest unsaved changes flushed
  const handleExportJson = useCallback(() => {
    flushPendingSave();
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(profileService.exportJson());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `iac_candidate_profile_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setToast?.('Candidate profile exported successfully.');
  }, [flushPendingSave, profileService, setToast]);

  // Import JSON profile with rigorous schema validation
  const handleImportJsonFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportErrors(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const result = profileService.importJson(content);
          if (result.success) {
            setProfile(profileService.getProfile());
            setToast?.('Imported and verified profile successfully.');
            setImportErrors(null);
          } else {
            setImportErrors(result.errors || ['Schema validation error']);
            setToast?.(`Import rejected: ${result.errors?.length || 1} schema errors detected.`);
          }
        }
      };
      reader.readAsText(file);
    },
    [profileService, setToast]
  );

  // Resume Ingestion Import
  const handleResumeFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImporting(true);
      try {
        setToast?.('Parsing and analyzing resume...');
        const ingestion = await DocumentIngestionService.ingestFile(file);
        profileService.populateFromIngestion(ingestion);
        setProfile(profileService.getProfile());
        setToast?.(`Imported resume facts (${ingestion.claims?.length || 0} claims extracted).`);
      } catch (err: any) {
        console.error('Resume import error:', err);
        setToast?.(`Failed to import resume: ${err?.message || err}`);
      } finally {
        setIsImporting(false);
      }
    },
    [profileService, setToast]
  );

  const handleResetProfile = useCallback(() => {
    const result = profileService.clearAllCandidateData();
    setProfile(profileService.getProfile());
    setShowClearConfirm(false);

    if (!result.success) {
      setToast?.(
        result.failedStores.includes('canonical-profile')
          ? 'Profile was not deleted because browser storage rejected the request. Your existing profile remains available.'
          : `Reset incomplete. Candidate data may remain in: ${result.failedStores.join(', ')}.`
      );
      return;
    }

    setToast?.('All candidate profile copies were reset.');
  }, [profileService, setToast]);

  const handleClose = useCallback(() => {
    flushPendingSave();
    setProfileWizardOpen(false);
  }, [flushPendingSave, setProfileWizardOpen]);

  if (!profileWizardOpen) return null;

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
        <WizardHeader
          completionPercentage={completionPercentage}
          saveStatus={saveStatus}
          saveStatusText={saveStatusText}
          importErrors={importErrors}
          isImporting={isImporting}
          onExportJson={handleExportJson}
          onImportJsonFile={handleImportJsonFile}
          onResumeFileUpload={handleResumeFileUpload}
          onShowClearConfirm={() => setShowClearConfirm(true)}
          onClose={handleClose}
        />

        {showClearConfirm && (
          <div
            style={{
              padding: '12px 24px',
              background: '#2D1B1B',
              borderBottom: '1px solid #EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '13px', color: '#FCA5A5' }}>
              Are you sure? This will delete all candidate claims and restore factory blank state.
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: 'transparent',
                  border: '1px solid #6B7280',
                  color: '#CBD5E1',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetProfile}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: '#EF4444',
                  border: 'none',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Yes, Reset All
              </button>
            </div>
          </div>
        )}

        <div className="wizard-main-layout">
          <WizardSidebar
            activeStep={activeStep}
            isImporting={isImporting}
            onSelectStep={navigateToStep}
            onImportJsonFile={handleImportJsonFile}
            onResumeFileUpload={handleResumeFileUpload}
            onShowClearConfirm={() => setShowClearConfirm(true)}
          />

          <div
            style={{
              flex: 1,
              padding: '24px 32px',
              overflowY: 'auto',
              background: '#11141B',
            }}
          >
            {activeStep === 'identity' && (
              <IdentitySection
                identity={profile.identity}
                onUpdateIdentity={handleUpdateIdentity}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'education' && (
              <EducationSection
                education={profile.education}
                onUpdateEducation={handleUpdateEducation}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'career' && (
              <CareerSection
                career={profile.career}
                onUpdateCareer={handleUpdateCareer}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'skills' && (
              <SkillsSection
                skills={profile.skills}
                onUpdateSkills={handleUpdateSkills}
                onDeleteSkillFact={handleDeleteSkillFact}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'experience' && (
              <ExperienceSection
                experience={profile.experience}
                onUpdateExperience={handleUpdateExperience}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'projects' && (
              <ProjectsSection
                projects={profile.projects}
                onUpdateProjects={handleUpdateProjects}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'achievements' && (
              <AchievementsSection
                achievements={profile.achievements}
                onUpdateAchievements={handleUpdateAchievements}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'preferences' && (
              <PreferencesSection
                preferences={profile.preferences}
                onUpdatePreferences={handleUpdatePreferences}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'declarations' && (
              <DeclarationsSection
                declarations={profile.declarations}
                onUpdateDeclarations={handleUpdateDeclarations}
                registerFlushHandler={registerFlushHandler}
              />
            )}

            {activeStep === 'review' && (
              <ReviewSection profile={profile} onCompleteAndLock={handleCompleteAndLock} />
            )}
          </div>
        </div>

        <WizardFooter
          currentStepIdx={currentStepIdx}
          isSkippable={isSkippable}
          onPrev={handlePrev}
          onNext={handleNext}
          onSkip={handleSkip}
        />
      </div>
    </div>
  );
};
