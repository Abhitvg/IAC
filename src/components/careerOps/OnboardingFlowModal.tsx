import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  Building,
  DollarSign,
  MapPin,
  Clock,
  X,
  Plus,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { useCareerOpsOnboardingStore } from '../../store/useCareerOpsOnboardingStore';
import { useControlsStore } from '../../store/useControlsStore';

interface OnboardingFlowModalProps {
  onComplete?: () => void;
}

export const OnboardingFlowModal: React.FC<OnboardingFlowModalProps> = ({ onComplete }) => {
  const {
    isOpen,
    currentStep,
    timeToFirstValueMs,
    preferences,
    profileAudit,
    rankedJobs,
    gmailConnected,
    isSubmitting,
    closeOnboarding,
    setStep,
    updatePreferences,
    addTargetRole,
    removeTargetRole,
    connectGmail,
    skipGmailConnection,
    finishOnboarding,
  } = useCareerOpsOnboardingStore();

  const { updateSalaryFloor, setRequiresSponsorship, updateDailyCaps } = useControlsStore();

  const [newRoleInput, setNewRoleInput] = useState('');

  if (!isOpen) return null;

  const handleRoleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRoleInput.trim()) {
      addTargetRole(newRoleInput.trim());
      setNewRoleInput('');
    }
  };

  const handleFinish = () => {
    // Sync onboarding preferences into Controls store
    updateSalaryFloor(preferences.salaryFloor, preferences.currency);
    setRequiresSponsorship(preferences.requiresSponsorship);
    finishOnboarding();
    if (onComplete) onComplete();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="CareerOps 60-Second Onboarding"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Step Progress Header */}
        <div
          style={{
            padding: '16px 24px',
            background: 'rgba(30, 41, 59, 0.5)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                🚀 CareerOps Setup
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                }}
              >
                Step {currentStep} of 4 • ~60s
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {currentStep === 1 && 'Confirm your profile & seniority level'}
              {currentStep === 2 && 'Set your role targets and compensation floor'}
              {currentStep === 3 && 'Instant profile audit & top matched opportunities'}
              {currentStep === 4 && 'Transparent connector permissions (Gmail)'}
            </div>
          </div>

          <button
            onClick={closeOnboarding}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress Bar Indicator */}
        <div style={{ height: '3px', background: 'rgba(255, 255, 255, 0.06)', width: '100%' }}>
          <div
            style={{
              height: '100%',
              width: `${(currentStep / 4) * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #38bdf8)',
              transition: 'width 250ms ease-out',
            }}
          />
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* STEP 1: IDENTITY & SENIORITY (0-15s) */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>
                  Confirm Your Candidate Identity
                </h2>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                  CareerOps anchors all applications and outreach to verified candidate claims with zero hallucinations.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label htmlFor="onboard-full-name" style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                    Full Legal / Preferred Name
                  </label>
                  <input
                    id="onboard-full-name"
                    type="text"
                    value={preferences.name}
                    onChange={(e) => updatePreferences({ name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label htmlFor="onboard-email-address" style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                    Primary Email Address
                  </label>
                  <input
                    id="onboard-email-address"
                    type="email"
                    value={preferences.email}
                    onChange={(e) => updatePreferences({ email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              {/* Seniority Selector */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '8px' }}>
                  Target Seniority Level
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'senior', label: 'Senior', desc: '5–8 yrs' },
                    { id: 'staff', label: 'Staff', desc: '8–12 yrs' },
                    { id: 'principal', label: 'Principal', desc: '12+ yrs' },
                    { id: 'lead', label: 'Lead / Mgmt', desc: 'Team Lead' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => updatePreferences({ seniority: s.id as any })}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        background:
                          preferences.seniority === s.id
                            ? 'rgba(99, 102, 241, 0.2)'
                            : 'rgba(30, 41, 59, 0.4)',
                        border: `1px solid ${
                          preferences.seniority === s.id
                            ? 'rgba(99, 102, 241, 0.6)'
                            : 'rgba(255, 255, 255, 0.08)'
                        }`,
                        color: preferences.seniority === s.id ? '#c7d2fe' : '#94a3b8',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.label}</div>
                      <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Work Authorization */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.3)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                    Immigration / Visa Sponsorship
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Will you now or in the future require visa sponsorship (H-1B, TN, O-1)?
                  </div>
                </div>
                <button
                  onClick={() => updatePreferences({ requiresSponsorship: !preferences.requiresSponsorship })}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: preferences.requiresSponsorship
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                    color: preferences.requiresSponsorship ? '#fca5a5' : '#86efac',
                    border: `1px solid ${
                      preferences.requiresSponsorship ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'
                    }`,
                  }}
                >
                  {preferences.requiresSponsorship ? 'Yes (Requires Sponsorship)' : 'No (US Citizen / PR)'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  onClick={() => setStep(2)}
                  style={{
                    padding: '9px 20px',
                    background: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Next: Target Roles & Comp <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ROLES & COMPENSATION (15-35s) */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>
                  Target Roles & Compensation Floor
                </h2>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                  Define what you are looking for so the discovery pipeline only surfaces high-yield matches.
                </p>
              </div>

              {/* Target Roles Chips */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                  Target Job Titles
                </label>
                <form onSubmit={handleRoleAdd} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Add title (e.g. Distributed Systems Engineer)..."
                    value={newRoleInput}
                    onChange={(e) => setNewRoleInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '7px 12px',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: '7px 14px',
                      background: 'rgba(99, 102, 241, 0.2)',
                      color: '#c7d2fe',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add Title
                  </button>
                </form>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {preferences.targetRoles.map((role) => (
                    <span
                      key={role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '6px',
                        color: '#c7d2fe',
                        fontSize: '12px',
                      }}
                    >
                      {role}
                      <button
                        onClick={() => removeTargetRole(role)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#a5b4fc',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Salary Floor & Work Arrangement */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label htmlFor="onboard-min-base" style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                    Minimum Base Salary ({preferences.currency})
                  </label>
                  <input
                    id="onboard-min-base"
                    type="number"
                    step="5000"
                    value={preferences.salaryFloor}
                    onChange={(e) => updatePreferences({ salaryFloor: parseInt(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Roles with maximum compensation below this threshold are auto-filtered.
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                    Work Arrangement Preference
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    {[
                      { id: 'remote', label: 'Remote' },
                      { id: 'hybrid', label: 'Hybrid' },
                      { id: 'onsite', label: 'Onsite' },
                      { id: 'any', label: 'Any' },
                    ].map((w) => (
                      <button
                        key={w.id}
                        onClick={() => updatePreferences({ remotePreference: w.id as any })}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          background:
                            preferences.remotePreference === w.id
                              ? 'rgba(56, 189, 248, 0.2)'
                              : 'rgba(30, 41, 59, 0.4)',
                          color: preferences.remotePreference === w.id ? '#7dd3fc' : '#94a3b8',
                          border: `1px solid ${
                            preferences.remotePreference === w.id
                              ? 'rgba(56, 189, 248, 0.5)'
                              : 'rgba(255, 255, 255, 0.08)'
                          }`,
                        }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  style={{
                    padding: '9px 20px',
                    background: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Discover Matching Roles & Audit Profile <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: FIRST VALUE - AUDIT & TOP RANKED JOBS (35-50s) */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#f59e0b" />
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Instant Profile Audit & Top Matches Unlocked
                  </h2>
                </div>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  First value generated in {timeToFirstValueMs ? `${(timeToFirstValueMs / 1000).toFixed(1)}s` : '< 1s'}.
                  Here is your baseline market readiness and top 3 matched companies.
                </p>
              </div>

              {/* Profile Audit Summary Card */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#34d399',
                      }}
                    >
                      {profileAudit.score}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        Profile Strength Score ({profileAudit.score}/100)
                      </div>
                      <div style={{ fontSize: '11px', color: '#86efac' }}>
                        High alignment with senior technical benchmarks
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {profileAudit.detectedSkills.slice(0, 4).map((sk) => (
                      <span
                        key={sk}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc',
                        }}
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Key Market Positioning:
                  </div>
                  {profileAudit.keyStrengths.map((str, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <CheckCircle2 size={12} color="#10b981" /> {str}
                    </div>
                  ))}
                </div>
              </div>

              {/* Top 3 Ranked Jobs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase' }}>
                  Top 3 High-Yield Opportunities Ready for Pipeline
                </div>

                {rankedJobs.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>{job.role}</span>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>at {job.company}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        <span>💰 {job.salary}</span>
                        <span>📍 {job.location}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        {job.matchReasons.map((reason, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                            }}
                          >
                            ✓ {reason}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        fontWeight: 700,
                        fontSize: '13px',
                        textAlign: 'center',
                      }}
                    >
                      {job.matchScore}%<div style={{ fontSize: '9px', fontWeight: 500 }}>Match</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  onClick={() => setStep(2)}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  style={{
                    padding: '9px 20px',
                    background: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Configure Mail & Automation Permissions <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: GMAIL CONNECTOR & SCOPE EXPLANATION (50-60s) */}
          {currentStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={18} color="#38bdf8" />
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Connect Gmail (Transparent Scope Consent)
                  </h2>
                </div>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Only requested <em>after</em> finding your matches. Connect your account to monitor recruiter
                  replies, extract interview booking slots, and send confirmed outreach.
                </p>
              </div>

              {/* Scopes Box */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Requested OAuth Permissions & Rationale
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    borderRadius: '6px',
                  }}
                >
                  <ShieldCheck size={18} color="#10b981" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                      Send Application & Follow-up Emails on Your Behalf
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      Strictly throttled by your Sprint Contract cap (default 15/day). Every email includes a CAN-SPAM
                      one-click unsubscribe link.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    borderRadius: '6px',
                  }}
                >
                  <Lock size={18} color="#38bdf8" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                      Read Recruiter Replies & Interview Invitations
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      Analyzes incoming candidate responses, classifies sentiment, and imports interview dates into your
                      calendar. Never reads personal or non-recruiting threads.
                    </div>
                  </div>
                </div>
              </div>

              {/* Gmail Action Status */}
              {gmailConnected ? (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#86efac',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} /> Gmail account successfully linked and ready for automated sync!
                </div>
              ) : null}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  onClick={() => {
                    skipGmailConnection();
                    handleFinish();
                  }}
                  style={{
                    padding: '9px 16px',
                    background: 'transparent',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Skip for Now (Manual Mode)
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!gmailConnected && (
                    <button
                      onClick={() => connectGmail()}
                      disabled={isSubmitting}
                      style={{
                        padding: '9px 18px',
                        background: 'rgba(56, 189, 248, 0.2)',
                        color: '#7dd3fc',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isSubmitting ? 'wait' : 'pointer',
                      }}
                    >
                      {isSubmitting ? 'Authorizing...' : 'Connect Gmail Account'}
                    </button>
                  )}

                  <button
                    onClick={handleFinish}
                    style={{
                      padding: '9px 20px',
                      background: '#6366f1',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    Enter CareerOps Workspace <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

