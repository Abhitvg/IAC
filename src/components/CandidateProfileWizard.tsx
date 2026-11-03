import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  { id: 'declarations', label: 'I. Declarations (Audit)', shortLabel: 'Declarations', icon: <ShieldAlert size={16} />, required: true },
  { id: 'review', label: 'Review & Confirm', shortLabel: 'Review', icon: <CheckCircle2 size={16} />, required: true },
];

export const CandidateProfileWizard: React.FC = () => {
  const { profileWizardOpen, setProfileWizardOpen, setToast } = useAppStore();
  const profileService = useMemo(() => CanonicalProfileService.getInstance(), []);

  const [activeStep, setActiveStep] = useState<WizardSection>('identity');
  const [profile, setProfile] = useState<CanonicalCandidateProfile>(() => profileService.getProfile());
  const [autosaveNotice, setAutosaveNotice] = useState<string>('Autosaved to local vault');
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Subscribe to service updates
  useEffect(() => {
    const unsub = profileService.subscribe((updated) => setProfile(updated));
    return () => unsub();
  }, [profileService]);

  // Debounced Autosave
  const triggerSave = useCallback(
    (nextProfile: CanonicalCandidateProfile) => {
      setProfile(nextProfile);
      profileService.saveProfile(nextProfile);
      setAutosaveNotice('Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    },
    [profileService]
  );

  // Calculate completion percentage
  const completionPercentage = useMemo(() => {
    let score = 0;
    const maxScore = 9;

    if (profile.identity.fullName.trim() && profile.identity.email.trim()) score += 1;
    if (profile.education.length > 0) score += 1;
    if (profile.career.currentRole.trim()) score += 1;
    if (profile.skills.length > 0) score += 1;
    if (profile.experience.length > 0) score += 1;
    if (profile.projects.length > 0) score += 1;
    if (profile.achievements.length > 0) score += 1;
    if (profile.preferences.preferredCodingLanguage) score += 1;
    if (profile.declarations.workAuthorization.confirmed || profile.declarations.sponsorshipRequired.confirmed) score += 1;

    return Math.round((score / maxScore) * 100);
  }, [profile]);

  if (!profileWizardOpen) return null;

  const currentStepIdx = WIZARD_STEPS.findIndex((s) => s.id === activeStep);

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

  // Export profile
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(profileService.exportJson());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `iac_candidate_profile_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setToast?.('Candidate profile exported successfully.');
  };

  // Import JSON profile
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = profileService.importJson(content);
        if (ok) {
          setToast?.('Imported profile successfully.');
        } else {
          setToast?.('Failed to parse candidate profile JSON.');
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
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
          height: '90vh',
          maxHeight: '850px',
          background: '#11141B',
          border: '1px solid #292E3A',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Wizard Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #292E3A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#171B24',
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
                <h2 id="wizard-title" style={{ fontSize: '16px', fontWeight: 700, color: '#F3F4F8', margin: 0 }}>
                  Candidate Profile &amp; Grounding Wizard
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
                All sensitive declarations require explicit confirmation. Unverified claims remain quarantined.
              </p>
            </div>
          </div>

          {/* Quick Actions (Autosave, Export, Close) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#687082' }}>{autosaveNotice}</span>

            <button
              type="button"
              onClick={handleExportJson}
              title="Export Profile JSON"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#CBD5E1',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={13} /> Export
            </button>

            <label
              title="Import Profile JSON"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#1E2330',
                border: '1px solid #292E3A',
                color: '#CBD5E1',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Upload size={13} /> Import JSON
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImportJsonFile}
              />
            </label>

            <button
              type="button"
              onClick={() => setProfileWizardOpen(false)}
              aria-label="Resume Later / Close Wizard"
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
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Wizard Main Container: Sidebar + Form Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Step Navigation Sidebar */}
          <div
            style={{
              width: '230px',
              borderRight: '1px solid #292E3A',
              background: '#0F1218',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflowY: 'auto',
            }}
          >
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
                      padding: '8px 12px',
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
                  </button>
                );
              })}
            </div>

            {/* Ingestion & Reset Utilities */}
            <div style={{ paddingTop: '12px', borderTop: '1px solid #1E2330', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: '#171B24',
                  border: '1px solid #292E3A',
                  color: '#9299AA',
                  fontSize: '11px',
                  cursor: isImporting ? 'wait' : 'pointer',
                  justifyContent: 'center',
                }}
              >
                <FileText size={13} />
                <span>{isImporting ? 'Ingesting...' : 'Import Resume (PDF/DOCX)'}</span>
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
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  fontSize: '11px',
                  cursor: 'pointer',
                  justifyContent: 'center',
                }}
              >
                <RotateCcw size={13} /> Reset All Data
              </button>
            </div>
          </div>

          {/* Form Step Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 32px',
              background: '#11141B',
            }}
          >
            {/* Step A: Personal Identity */}
            {activeStep === 'identity' && (
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  A. Personal Identity
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '20px' }}>
                  Basic identity information for personalizing interviews and form assistance.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Full Legal Name *
                    </label>
                    <input
                      type="text"
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
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
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
                      Email Address *
                    </label>
                    <input
                      type="email"
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
                        border: '1px solid #292E3A',
                        borderRadius: '6px',
                        color: '#F3F4F8',
                        fontSize: '13px',
                      }}
                    />
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

                <div style={{ marginTop: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                    Links &amp; Profiles
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      B. Education &amp; Certifications
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Academic degrees, institutions, and graduation timelines.
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
                    No education records added yet. Click &quot;Add Degree&quot; or import your resume.
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  C. Career &amp; Target Roles
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '20px' }}>
                  Define your current trajectory and target seniority for tailored response depth.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                      value={profile.career.totalExperienceYears || ''}
                      onChange={(e) => {
                        const next = {
                          ...profile,
                          career: { ...profile.career, totalExperienceYears: Number(e.target.value) || 0 },
                        };
                        triggerSave(next);
                      }}
                      placeholder="e.g. 6"
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
                      value={profile.career.targetSeniority}
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

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '4px' }}>
                      Target Roles (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={profile.career.targetRoles.join(', ')}
                      onChange={(e) => {
                        const roles = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                        const next = {
                          ...profile,
                          career: { ...profile.career, targetRoles: roles },
                        };
                        triggerSave(next);
                      }}
                      placeholder="Distributed Systems Engineer, Senior Backend Engineer, Cloud Architect"
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
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      D. Skills &amp; Experience Rigor
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Differentiate practical production experience from theoretical knowledge.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newSkill: CandidateSkill = {
                        id: `skill_${Date.now()}`,
                        name: '',
                        proficiency: 'intermediate',
                        experienceType: 'practical',
                        yearsUsed: 1,
                        projectReferences: [],
                        evidenceSource: 'Candidate Self-Declared',
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
                    No skills added yet. Add key technologies or import from resume.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                            <option value="practical">Practical / Production</option>
                            <option value="theoretical">Theoretical Only</option>
                          </select>

                          <select
                            value={skill.proficiency}
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
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                            <option value="expert">Expert</option>
                          </select>
                        </div>
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
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      E. Work Experience &amp; Personal Contributions
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Distinguish what you personally built from collective team responsibilities.
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
                            Role #{idx + 1}: {exp.title || 'Untitled Role'} {exp.employer ? `@ ${exp.employer}` : ''}
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
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
                            Personally Implemented Work (Verified Contributions Only)
                          </label>
                          <textarea
                            rows={3}
                            placeholder="State exactly what modules, services, or APIs you personally authored..."
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
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      F. Projects &amp; Provenance Tracking
                    </h3>
                    <p style={{ fontSize: '12px', color: '#9299AA', margin: '2px 0 0 0' }}>
                      Repositories and architectures. Code presence does not prove authorship without verified contribution.
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
                        ownership: 'PRIMARY_CONTRIBUTOR',
                        exactContribution: '',
                        technologyStack: [],
                        deploymentStatus: 'deployed_production',
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
                            Project #{idx + 1}: {proj.name || 'Untitled Project'}
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <input
                            type="text"
                            placeholder="Project Title"
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
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
                              <option value="SOLE_OWNER">Sole Owner / Author</option>
                              <option value="PRIMARY_CONTRIBUTOR">Primary Contributor</option>
                              <option value="COLLABORATOR">Collaborator / Maintenance</option>
                              <option value="UNKNOWN">Unknown / Unspecified</option>
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#CBD5E1', marginBottom: '2px' }}>
                              Deployment Status
                            </label>
                            <select
                              value={proj.deploymentStatus}
                              onChange={(e) => {
                                const next = [...profile.projects];
                                next[idx].deploymentStatus = e.target.value as any;
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
                              <option value="deployed_production">Deployed to Production</option>
                              <option value="staging_demo">Staging / Demo</option>
                              <option value="prototype">Prototype / PoC</option>
                              <option value="proposed_design">Proposed Design (Not built)</option>
                              <option value="unreleased">Unreleased</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: '#35C991', fontWeight: 600, marginBottom: '2px' }}>
                            Exact Contribution &amp; Architecture (Mandatory for Speaking Gate)
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Describe your exact personal contribution and components implemented..."
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
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                      G. Achievements &amp; Publications
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
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  H. Teleprompter &amp; Answer Preferences
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '20px' }}>
                  Tune how answers are structured and paced during live interviews.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', margin: 0 }}>
                    I. Employment Declarations &amp; Work Eligibility
                  </h3>
                </div>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(247, 185, 85, 0.1)',
                    border: '1px solid rgba(247, 185, 85, 0.3)',
                    color: '#FDE047',
                    fontSize: '12px',
                    marginBottom: '20px',
                    lineHeight: '1.4',
                  }}
                >
                  <strong>Zero-Fabrication Guarantee:</strong> IAC will NEVER infer your citizenship, visa status, or security clearance from your name, location, or education. You must explicitly confirm these declarations to enable automatic form answering.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Work Authorization */}
                  <div style={{ padding: '16px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
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
                  <div style={{ padding: '16px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
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
                        <span>Will NOT now or in the future require sponsorship</span>
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
                        <span>WILL require visa sponsorship (e.g. H-1B, O-1)</span>
                      </label>
                    </div>
                  </div>

                  {/* Relocation & Clearance */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '14px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#F3F4F8', display: 'block', marginBottom: '8px' }}>
                        3. Relocation Willingness
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1', marginBottom: '6px' }}>
                        <input
                          type="checkbox"
                          checked={profile.declarations.willingToRelocate.willing === true}
                          onChange={(e) => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                willingToRelocate: {
                                  ...profile.declarations.willingToRelocate,
                                  willing: e.target.checked,
                                  confirmed: true,
                                  confirmedAt: Date.now(),
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Willing to relocate for the right role</span>
                      </label>
                    </div>

                    <div style={{ padding: '14px', background: '#171B24', border: '1px solid #292E3A', borderRadius: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#F3F4F8', display: 'block', marginBottom: '8px' }}>
                        4. Security Clearance
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#CBD5E1', marginBottom: '6px' }}>
                        <input
                          type="checkbox"
                          checked={profile.declarations.securityClearance.active === true}
                          onChange={(e) => {
                            const next = {
                              ...profile,
                              declarations: {
                                ...profile.declarations,
                                securityClearance: {
                                  ...profile.declarations.securityClearance,
                                  active: e.target.checked,
                                  confirmed: true,
                                  confirmedAt: Date.now(),
                                },
                              },
                            };
                            triggerSave(next);
                          }}
                        />
                        <span>Active government security clearance</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Review & Confirm */}
            {activeStep === 'review' && (
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F3F4F8', marginBottom: '4px' }}>
                  Review Candidate Profile &amp; Provenance Ledger
                </h3>
                <p style={{ fontSize: '12px', color: '#9299AA', marginBottom: '20px' }}>
                  Verify that all claims accurately reflect your verified background before closing.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A' }}>
                    <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#8B7CFF', margin: '0 0 8px 0' }}>
                      Identity &amp; Career
                    </h4>
                    <div style={{ fontSize: '13px', color: '#F3F4F8', lineHeight: '1.6' }}>
                      <div><strong>Name:</strong> {profile.identity.fullName || 'Not provided'}</div>
                      <div><strong>Email:</strong> {profile.identity.email || 'Not provided'}</div>
                      <div><strong>Location:</strong> {profile.identity.location || 'Not provided'}</div>
                      <div><strong>Current Role:</strong> {profile.career.currentRole || 'Not specified'}</div>
                      <div><strong>Experience:</strong> {profile.career.totalExperienceYears} years</div>
                      <div><strong>Target Level:</strong> {profile.career.targetSeniority}</div>
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#171B24', borderRadius: '8px', border: '1px solid #292E3A' }}>
                    <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#35C991', margin: '0 0 8px 0' }}>
                      Grounding &amp; Declarations
                    </h4>
                    <div style={{ fontSize: '13px', color: '#F3F4F8', lineHeight: '1.6' }}>
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

                <div style={{ textAlign: 'center', marginTop: '24px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      profileService.saveProfile(profile);
                      setToast?.('Candidate profile saved & locked for live grounding.');
                      setProfileWizardOpen(false);
                    }}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      background: '#8B7CFF',
                      border: 'none',
                      color: '#fff',
                      fontSize: '14px',
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
            padding: '14px 24px',
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
          }}
        >
          <div
            style={{
              maxWidth: '400px',
              padding: '24px',
              background: '#171B24',
              borderRadius: '12px',
              border: '1px solid #EF4444',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444', marginBottom: '12px' }}>
              <AlertTriangle size={24} />
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Reset All Candidate Data?</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '20px', lineHeight: '1.4' }}>
              This will erase all personal identity, education, projects, skills, and employment declarations from your local browser vault. This action cannot be undone.
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
