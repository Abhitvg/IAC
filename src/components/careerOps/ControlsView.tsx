import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Download,
  Trash2,
  RotateCcw,
  RefreshCw,
  Power,
  Mail,
  Calendar,
  Share2,
  FileText,
  Building,
  DollarSign,
  Globe,
  Clock,
  Eye,
  Check,
  X,
  Key,
} from 'lucide-react';
import { useControlsStore, DailyCaps } from '../../store/useControlsStore';

export const ControlsView: React.FC = () => {
  const {
    globalKillSwitch,
    shadowMode,
    killSwitchReason,
    contractRevision,
    contractSignedAt,
    dailyCaps,
    referralHoldDays,
    salaryFloor,
    requiresSponsorship,
    blocklistCompanies,
    tone,
    pausedChannels,
    connectors,
    isExportingDsar,
    isPurgingData,
    dsarExportPackage,
    deletionReceipt,
    saveStatus,
    errorMessage,
    toggleKillSwitch,
    toggleShadowMode,
    toggleChannel,
    updateDailyCaps,
    updateReferralHoldDays,
    updateSalaryFloor,
    setRequiresSponsorship,
    addBlocklistCompany,
    removeBlocklistCompany,
    setTone,
    saveSprintContract,
    exportDsarData,
    purgeAccountData,
    reconnectConnector,
    disconnectConnector,
    resetToDefaults,
  } = useControlsStore();

  const [newCompanyInput, setNewCompanyInput] = useState('');
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [activeSection, setActiveSection] = useState<'caps' | 'channels' | 'connectors' | 'dsar'>('caps');
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'k') {
        e.preventDefault();
        toggleKillSwitch(!globalKillSwitch, 'Toggled via keyboard hotkey (k)');
      } else if (e.key === 's') {
        e.preventDefault();
        saveSprintContract();
      } else if (e.key === 'e') {
        e.preventDefault();
        exportDsarData();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalKillSwitch, toggleKillSwitch, saveSprintContract, exportDsarData]);

  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCompanyInput.trim()) {
      addBlocklistCompany(newCompanyInput.trim());
      setNewCompanyInput('');
    }
  };

  const handlePurgeSubmit = async () => {
    if (purgeConfirmText.trim().toUpperCase() !== 'DELETE MY ACCOUNT AND DATA') {
      setLocalFeedback('You must type exactly "DELETE MY ACCOUNT AND DATA" to confirm.');
      return;
    }
    const receipt = await purgeAccountData(purgeConfirmText);
    if (receipt) {
      setLocalFeedback('Account purged and tenant cryptographic keys permanently shred.');
    }
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto', color: '#f1f5f9' }}>
      {/* Global Kill Switch Banner */}
      {globalKillSwitch ? (
        <div
          role="alert"
          style={{
            marginBottom: '20px',
            padding: '16px 20px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid rgba(239, 68, 68, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <ShieldAlert size={28} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#fca5a5' }}>
                GLOBAL EMERGENCY KILL SWITCH ACTIVE
              </div>
              <div style={{ fontSize: '12px', color: '#fecaca', marginTop: '2px' }}>
                {killSwitchReason || 'All automated applications, outreach emails, and queues are completely frozen.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => toggleKillSwitch(false)}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Power size={14} /> Resume Systems
          </button>
        </div>
      ) : null}

      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '20px',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              Governance, Safety Caps & Privacy
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              Sprint Contract v{contractRevision}.0
            </span>
            {shadowMode && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: '#fde047',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                }}
              >
                👻 Shadow Mode
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Calm, deterministic execution with strict velocity limits, transparent OAuth scopes, and irreversible DSAR deletion.
          </p>
        </div>

        {/* Global Action Latches */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => toggleShadowMode(!shadowMode)}
            title="Runs evaluation & drafting without firing live network requests"
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: shadowMode ? 'rgba(234, 179, 8, 0.2)' : 'rgba(30, 41, 59, 0.6)',
              color: shadowMode ? '#fde047' : '#94a3b8',
              border: `1px solid ${shadowMode ? 'rgba(234, 179, 8, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Eye size={14} />
            {shadowMode ? 'Shadow Active' : 'Shadow Mode'}
          </button>

          <button
            onClick={() => toggleKillSwitch(!globalKillSwitch, 'Emergency stop engaged by candidate')}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: globalKillSwitch ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
              color: globalKillSwitch ? '#ffffff' : '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Power size={14} />
            {globalKillSwitch ? 'Kill Switch Engaged' : 'Emergency Stop (k)'}
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '20px',
          paddingBottom: '8px',
        }}
      >
        {[
          { id: 'caps', label: '⚡ Velocity Caps & Contract', icon: Sliders },
          { id: 'channels', label: '🔀 Channel Toggles', icon: CheckCircle2 },
          { id: 'connectors', label: '🔌 Connector Permissions', icon: Lock },
          { id: 'dsar', label: '🛡️ Privacy & Erasure (DSAR)', icon: ShieldAlert },
        ].map((tab) => {
          const isActive = activeSection === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#f8fafc' : '#94a3b8',
                background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <Icon size={14} color={isActive ? '#818cf8' : '#64748b'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION 1: VELOCITY CAPS & SPRINT CONTRACT */}
      {activeSection === 'caps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Velocity Sliders Card */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Daily Autonomous Velocity Caps</h2>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Hard bounds prevent account flaggings, rate limits, and spam filter escalations.
                </p>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Signed: {new Date(contractSignedAt).toLocaleDateString()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
              {/* Daily Applications */}
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label htmlFor="daily-apps-input" style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Direct ATS Applications</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8' }}>
                    {dailyCaps.applications} / day
                  </span>
                </div>
                <input
                  id="daily-apps-input"
                  aria-label="Direct ATS Applications per day"
                  type="range"
                  min="0"
                  max="60"
                  value={dailyCaps.applications}
                  onChange={(e) => updateDailyCaps({ applications: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', accentColor: '#6366f1' }}
                />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                  Lever / Greenhouse recommended: $\le$ 25/day to preserve applicant reputation.
                </div>
              </div>

              {/* Daily Emails */}
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label htmlFor="daily-emails-input" style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Personalized Outreach Emails</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                    {dailyCaps.emails} / day
                  </span>
                </div>
                <input
                  id="daily-emails-input"
                  aria-label="Personalized Outreach Emails per day"
                  type="range"
                  min="0"
                  max="40"
                  value={dailyCaps.emails}
                  onChange={(e) => updateDailyCaps({ emails: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', accentColor: '#0ea5e9' }}
                />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                  CAN-SPAM / GDPR footer enforced. Auto-pause triggers if bounce rate exceeds 5%.
                </div>
              </div>

              {/* Assist Queue Items */}
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label htmlFor="assist-queue-input" style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>LinkedIn Assist Queue</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa' }}>
                    {dailyCaps.assistQueueItems} / day
                  </span>
                </div>
                <input
                  id="assist-queue-input"
                  aria-label="LinkedIn Assist Queue items per day"
                  type="range"
                  min="0"
                  max="25"
                  value={dailyCaps.assistQueueItems}
                  onChange={(e) => updateDailyCaps({ assistQueueItems: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', accentColor: '#8b5cf6' }}
                />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                  Hard Line H1: Staged locally. Zero headless bots; user click required.
                </div>
              </div>

              {/* Calendar Events */}
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label htmlFor="calendar-sync-input" style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Calendar Interview Syncs</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#34d399' }}>
                    {dailyCaps.calendarEvents} / day
                  </span>
                </div>
                <input
                  id="calendar-sync-input"
                  aria-label="Calendar Interview Syncs per day"
                  type="range"
                  min="0"
                  max="15"
                  value={dailyCaps.calendarEvents}
                  onChange={(e) => updateDailyCaps({ calendarEvents: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', accentColor: '#10b981' }}
                />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                  Blocks prep buffers around recognized recruiter interview links.
                </div>
              </div>
            </div>
          </div>

          {/* Referral-First Strategy Hold & Salary Floor */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Strategy Hold */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Clock size={16} color="#fbbf24" />
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Referral-First Hold Period</h3>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0' }}>
                When a role matches your profile, outreach waves run first. Direct ATS submission is held until an
                internal referral is offered or the hold expires.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <input
                  type="range"
                  min="1"
                  max="7"
                  value={referralHoldDays}
                  onChange={(e) => updateReferralHoldDays(parseInt(e.target.value) || 4)}
                  style={{ flex: 1, accentColor: '#f59e0b' }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#fbbf24',
                    background: 'rgba(245, 158, 11, 0.15)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                >
                  {referralHoldDays} Days
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                * Referral rules vary by employer. Active referral conversations indefinitely hold ATS auto-apply.
              </div>
            </div>

            {/* Compensation & Work Auth */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <DollarSign size={16} color="#34d399" />
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Salary Floor & Sponsorship</h3>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0' }}>
                Filter out low-ball compensation and ensure immigration parameters strictly match.
              </p>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="min-base-salary" style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Minimum Base Salary ({salaryFloor.currency})
                  </label>
                  <input
                    id="min-base-salary"
                    type="number"
                    step="5000"
                    value={salaryFloor.amount}
                    onChange={(e) => updateSalaryFloor(parseInt(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Requires Sponsorship
                  </span>
                  <button
                    onClick={() => setRequiresSponsorship(!requiresSponsorship)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: requiresSponsorship ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      border: `1px solid ${requiresSponsorship ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                      borderRadius: '6px',
                      color: requiresSponsorship ? '#fca5a5' : '#86efac',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {requiresSponsorship ? 'Yes (H-1B / Visa)' : 'No (Citizen / PR)'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Blocklist & Competitor Filter */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Building size={16} color="#f87171" />
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Company Blocklist & Exclusion Zone</h3>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0' }}>
              Never evaluate, apply to, or message employees at these companies (e.g. current employer or direct conflicts).
            </p>

            <form onSubmit={handleAddCompany} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input
                type="text"
                placeholder="Enter company name (e.g. Acme Inc.)..."
                value={newCompanyInput}
                onChange={(e) => setNewCompanyInput(e.target.value)}
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
                  padding: '7px 16px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#c7d2fe',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add to Blocklist
              </button>
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {blocklistCompanies.map((company) => (
                <span
                  key={company}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    color: '#fca5a5',
                    fontSize: '12px',
                  }}
                >
                  {company}
                  <button
                    onClick={() => removeBlocklistCompany(company)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {blocklistCompanies.length === 0 && (
                <span style={{ fontSize: '12px', color: '#64748b' }}>No companies currently blocked.</span>
              )}
            </div>
          </div>

          {/* Save / Re-sign Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '14px', marginTop: '10px' }}>
            {saveStatus === 'saved' && (
              <span style={{ fontSize: '12px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={14} /> Contract signed & revision recorded (v{contractRevision}.0)
              </span>
            )}
            {saveStatus === 'error' && (
              <span style={{ fontSize: '12px', color: '#ef4444' }}>
                {errorMessage || 'Failed to save sprint contract'}
              </span>
            )}
            <button
              onClick={() => saveSprintContract()}
              disabled={saveStatus === 'saving'}
              style={{
                padding: '9px 20px',
                background: '#6366f1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {saveStatus === 'saving' ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Save & Sign Revision v{contractRevision + 1}.0 (s)
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2: CHANNEL TOGGLES */}
      {activeSection === 'channels' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {[
            {
              id: 'ats' as const,
              name: 'Direct ATS Auto-Apply',
              desc: 'Fills Workday, Greenhouse, Ashby, and Lever forms strictly when Truthfulness score is 100%.',
              icon: Globe,
              color: '#6366f1',
              notes: 'Held for 4 days if referral outreach is active.',
            },
            {
              id: 'email' as const,
              name: 'Verified Email Outreach',
              desc: 'Sends high-signal, ≤300 char emails with one-click unsubscribe footers and bounce protection.',
              icon: Mail,
              color: '#38bdf8',
              notes: 'Auto-pauses if bounce rate > 5%.',
            },
            {
              id: 'calendar' as const,
              name: 'Interview Calendar Sync',
              desc: 'Detects Calendly and Google Meet links from replies and books interview rehearsal slots.',
              icon: Calendar,
              color: '#34d399',
              notes: 'Reads calendar availability to prevent scheduling conflicts.',
            },
            {
              id: 'linkedin_assist' as const,
              name: 'LinkedIn Assist Queue',
              desc: 'Stages personalized connection requests for your review. Zero automated bots or scraping.',
              icon: Share2,
              color: '#a78bfa',
              notes: 'Hard Line H1: Physical user gesture required.',
            },
          ].map((ch) => {
            const isPaused = pausedChannels.includes(ch.id);
            const Icon = ch.icon;
            return (
              <div
                key={ch.id}
                style={{
                  background: isPaused ? 'rgba(30, 41, 59, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                  borderRadius: '10px',
                  border: `1px solid ${isPaused ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon size={18} color={ch.color} />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>{ch.name}</span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: isPaused ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: isPaused ? '#fca5a5' : '#86efac',
                        border: `1px solid ${isPaused ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                      }}
                    >
                      {isPaused ? 'PAUSED' : 'ACTIVE'}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                    {ch.desc}
                  </p>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{ch.notes}</div>
                </div>

                <button
                  onClick={() => toggleChannel(ch.id)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: isPaused ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isPaused ? '#86efac' : '#fca5a5',
                    border: `1px solid ${isPaused ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}
                >
                  {isPaused ? 'Resume Channel' : 'Pause Channel'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 3: CONNECTOR PERMISSIONS & HEALTH */}
      {activeSection === 'connectors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {connectors.map((connector) => (
            <div
              key={connector.id}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Key size={18} color="#818cf8" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>{connector.name}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background:
                            connector.status === 'connected'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color: connector.status === 'connected' ? '#86efac' : '#fca5a5',
                        }}
                      >
                        {connector.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {connector.accountEmail} • Last synced {new Date(connector.lastSyncedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {connector.status === 'connected' ? (
                    <button
                      onClick={() => disconnectConnector(connector.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#fca5a5',
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => reconnectConnector(connector.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#86efac',
                        cursor: 'pointer',
                      }}
                    >
                      Re-authorize
                    </button>
                  )}
                </div>
              </div>

              {/* Scopes Breakdown */}
              <div style={{ background: 'rgba(30, 41, 59, 0.3)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Plain-Language Scope Breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {connector.scopes.map((s) => (
                    <div
                      key={s.scope}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: '8px',
                        background: 'rgba(15, 23, 42, 0.4)',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{s.name}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{s.description}</div>
                        <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px' }}>
                          {s.scope}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            s.riskLevel === 'elevated'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(99, 102, 241, 0.15)',
                          color: s.riskLevel === 'elevated' ? '#fde047' : '#c7d2fe',
                        }}
                      >
                        {s.riskLevel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SECTION 4: DSAR PRIVACY & CRYPTO-SHREDDING */}
      {activeSection === 'dsar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Export Data Card */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={18} color="#818cf8" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Data Subject Portability (GDPR Art. 15 / CCPA)</h3>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Download a complete, machine-readable JSON archive of all your confirmed facts, applications, drafts, and activity logs.
                </p>
              </div>

              <button
                onClick={() => exportDsarData()}
                disabled={isExportingDsar}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#c7d2fe',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isExportingDsar ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isExportingDsar ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                Export All Data (e)
              </button>
            </div>

            {dsarExportPackage && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#34d399' }}>
                    ✓ DSAR Package Ready ({new Date(dsarExportPackage.exportedAt).toLocaleTimeString()})
                  </span>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    SHA-256: {dsarExportPackage.integrityChecksumSha256.slice(0, 16)}...
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#cbd5e1' }}>
                  <span>📋 {dsarExportPackage.recordCounts.applications} Applications</span>
                  <span>👥 {dsarExportPackage.recordCounts.contacts} Network Contacts</span>
                  <span>✍️ {dsarExportPackage.recordCounts.outreachDrafts} Drafts</span>
                  <span>🔒 {dsarExportPackage.recordCounts.facts} Confirmed Facts</span>
                  <span>📜 {dsarExportPackage.recordCounts.auditLogs} Audit Logs</span>
                </div>
              </div>
            )}
          </div>

          {/* Right to Erasure & Crypto-Shredding Card */}
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.05)',
              borderRadius: '10px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Trash2 size={20} color="#ef4444" />
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fca5a5', margin: 0 }}>
                Permanent Erasure & Crypto-Shredding (GDPR Art. 17)
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: '#fecaca', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              This permanently wipes all candidate facts, resumes, contact histories, and OAuth credentials.
              Your tenant encryption keys will be cryptographically zeroized, rendering any encrypted backups irreversibly unreadable.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label htmlFor="purge-confirm-input" style={{ fontSize: '12px', color: '#fca5a5', display: 'block', marginBottom: '6px' }}>
                To confirm, type <strong style={{ color: '#ffffff' }}>DELETE MY ACCOUNT AND DATA</strong> below:
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  id="purge-confirm-input"
                  type="text"
                  placeholder="DELETE MY ACCOUNT AND DATA"
                  value={purgeConfirmText}
                  onChange={(e) => setPurgeConfirmText(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                  }}
                />
                <button
                  onClick={handlePurgeSubmit}
                  disabled={isPurgingData || purgeConfirmText.trim().toUpperCase() !== 'DELETE MY ACCOUNT AND DATA'}
                  style={{
                    padding: '8px 18px',
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor:
                      purgeConfirmText.trim().toUpperCase() === 'DELETE MY ACCOUNT AND DATA'
                        ? 'pointer'
                        : 'not-allowed',
                    opacity: purgeConfirmText.trim().toUpperCase() === 'DELETE MY ACCOUNT AND DATA' ? 1 : 0.5,
                  }}
                >
                  {isPurgingData ? 'Purging...' : 'Permanently Delete & Shred'}
                </button>
              </div>
            </div>

            {localFeedback && (
              <div style={{ fontSize: '12px', color: '#fbbf24', marginTop: '8px' }}>{localFeedback}</div>
            )}

            {deletionReceipt && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fca5a5', marginBottom: '6px' }}>
                  ✓ Cryptographic Deletion Receipt Generated
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '6px' }}>
                  Deleted At: {new Date(deletionReceipt.deletedAt).toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                  KMS Tenant Key: {deletionReceipt.cryptoShreddingVerification.tenantKeyId} [STATE:{' '}
                  {deletionReceipt.cryptoShreddingVerification.keyState.toUpperCase()}]
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px' }}>
                  Zeroization Proof: {deletionReceipt.cryptoShreddingVerification.sha256Proof}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

