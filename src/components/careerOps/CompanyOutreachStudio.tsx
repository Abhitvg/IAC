import React, { useState, useMemo } from 'react';
import {
  Building,
  Briefcase,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Mail,
  MessageSquare,
  Search,
  Sparkles,
  Users,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { JobApplication, NetworkContact } from '../../services/careerOps/types';
import {
  generateCompanyOutreachPlan,
  queueAllPipelineCompaniesToAssist,
  generateLinkedInConnectionNote,
  buildLinkedInSearchUrl,
  CompanyEmployeeTarget,
} from '../../services/careerOps/linkedinOutreachService';
import { useNetworkStore } from '../../store/useNetworkStore';
import { copyToClipboard } from '../../utils/clipboard';

interface CompanyOutreachStudioProps {
  applications: JobApplication[];
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onOpenAssistQueue: () => void;
  candidateName?: string;
}

export const CompanyOutreachStudio: React.FC<CompanyOutreachStudioProps> = ({
  applications,
  activeJobId,
  onSelectJob,
  onOpenAssistQueue,
  candidateName = 'Abhishek Singh',
}) => {
  const { contacts, addContact } = useNetworkStore();

  // Selected company state
  const currentApp = useMemo(() => {
    return (
      applications.find((a) => a.id === activeJobId) ||
      applications[0] ||
      null
    );
  }, [applications, activeJobId]);

  const [customCompany, setCustomCompany] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Active company and role to generate for
  const companyName = isCustomMode ? customCompany || 'Target Company' : currentApp?.company || 'Target Company';
  const roleTitle = isCustomMode ? customRole || 'Software Engineer' : currentApp?.role || 'Software Engineer';
  const strategicHook = currentApp?.evaluationReport?.strategicAngle || 'distributed systems and production infrastructure';

  // Individual persona customize state
  const [activeTabByTier, setActiveTabByTier] = useState<Record<string, 'connection_note' | 'inmail' | 'email'>>({
    hiring_manager: 'connection_note',
    recruiter: 'connection_note',
    peer: 'connection_note',
  });

  const [employeeNameByTier, setEmployeeNameByTier] = useState<Record<string, string>>({
    hiring_manager: '',
    recruiter: '',
    peer: '',
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCopy = async (text: string, id: string, label: string) => {
    await copyToClipboard(text);
    setCopiedId(id);
    showToast(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Generate the full outreach plan
  const outreachPlan = useMemo(() => {
    return generateCompanyOutreachPlan(
      companyName,
      roleTitle,
      candidateName,
      strategicHook,
      currentApp?.id
    );
  }, [companyName, roleTitle, candidateName, strategicHook, currentApp?.id]);

  // Bulk Queue All Pipeline Companies
  const handleQueueAll = () => {
    if (applications.length === 0) {
      showToast('No applications in your pipeline to queue.');
      return;
    }
    const result = queueAllPipelineCompaniesToAssist(
      applications,
      contacts,
      addContact,
      candidateName
    );
    showToast(
      `⚡ Queued ${result.queuedCount} employee targets across ${result.companiesCount} companies to your Assist Queue!`
    );
  };

  // Queue a single target
  const handleQueueSingleTarget = (target: CompanyEmployeeTarget, personName?: string) => {
    const finalNote = personName
      ? generateLinkedInConnectionNote({
          tier: target.tier,
          company: companyName,
          role: roleTitle,
          personName,
          candidateName,
          techHook: strategicHook,
        })
      : target.connectionNote;

    addContact({
      name: personName || `${companyName} ${target.tier === 'hiring_manager' ? 'Hiring Leader' : target.tier === 'recruiter' ? 'Talent Partner' : 'Peer Engineer'}`,
      title: target.defaultTitle,
      company: companyName,
      linkedinUrl: target.linkedinSearchUrl,
      stage: 'outreach_queued',
      isSuppressed: false,
      jobId: currentApp?.id,
      outreachDraft: finalNote,
      notes: `Targeted outreach for ${roleTitle} at ${companyName}. Note generated under 300 chars.`,
    });

    showToast(`Added ${target.tierLabel} to your LinkedIn Assist Queue!`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
          border: '1px solid rgba(249, 115, 22, 0.3)',
          borderRadius: '14px',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 16px rgba(2, 132, 199, 0.35)',
            }}
          >
            <Users size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                LinkedIn Company Employee Outreach Studio
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                }}
              >
                STRICTLY ≤ 300 CHARS • USER GESTURE ONLY
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Connect with Hiring Managers, Recruiters, and Engineers across all target companies with 1-click LinkedIn searches and tailored notes.
            </p>
          </div>
        </div>

        {/* Global Bulk Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleQueueAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(249, 115, 22, 0.35)',
            }}
          >
            <Zap size={14} />
            <span>Queue All Pipeline Companies ({applications.length})</span>
          </button>

          <button
            onClick={onOpenAssistQueue}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={14} color="#fb923c" />
            <span>Open Assist Queue</span>
          </button>
        </div>
      </div>

      {/* Company Selector Ribbon */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
            Select Target Company from Pipeline ({applications.length} Available)
          </span>
          <button
            onClick={() => setIsCustomMode(!isCustomMode)}
            style={{
              background: 'transparent',
              border: 'none',
              color: isCustomMode ? '#fb923c' : '#38bdf8',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isCustomMode ? '← Back to Pipeline Companies' : '+ Enter Custom Company'}
          </button>
        </div>

        {!isCustomMode ? (
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {applications.map((app) => {
              const isSelected = app.id === currentApp?.id;
              return (
                <button
                  key={app.id}
                  onClick={() => onSelectJob(app.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1px solid rgba(249, 115, 22, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isSelected ? '#fb923c' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <Building size={13} color={isSelected ? '#fb923c' : '#64748b'} />
                  <span>{app.company}</span>
                  <span style={{ fontSize: '10px', opacity: 0.7, fontWeight: 500 }}>
                    ({app.role})
                  </span>
                </button>
              );
            })}
            {applications.length === 0 && (
              <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                No active job applications found. Click "+ Enter Custom Company" to start outreach!
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Company Name
              </label>
              <input
                type="text"
                value={customCompany}
                onChange={(e) => setCustomCompany(e.target.value)}
                placeholder="e.g. Stripe, Google, Datadog..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Target Role Title
              </label>
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Company Active Focus Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          background: 'rgba(2, 132, 199, 0.1)',
          border: '1px solid rgba(2, 132, 199, 0.3)',
          borderRadius: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building size={16} color="#38bdf8" />
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
            Target Company: {companyName}
          </span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>•</span>
          <Briefcase size={14} color="#94a3b8" />
          <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Role: {roleTitle}</span>
        </div>

        <a
          href={buildLinkedInSearchUrl(companyName, roleTitle)}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#38bdf8',
            textDecoration: 'none',
            background: 'rgba(2, 132, 199, 0.15)',
            padding: '4px 10px',
            borderRadius: '6px',
          }}
        >
          <span>Open All {companyName} People on LinkedIn</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Target Employee Tier Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {outreachPlan.targets.map((target) => {
          const activeTab = activeTabByTier[target.tier] || 'connection_note';
          const personName = employeeNameByTier[target.tier] || '';

          // Compute personalized note if personName is supplied
          const noteText = personName
            ? generateLinkedInConnectionNote({
                tier: target.tier,
                company: companyName,
                role: roleTitle,
                personName,
                candidateName,
                techHook: strategicHook,
              })
            : target.connectionNote;

          const charCount = noteText.length;
          const isOverLimit = charCount > 300;

          return (
            <div
              key={target.tier}
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Target Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                      {target.tierLabel}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: '#94a3b8',
                      }}
                    >
                      {target.defaultTitle}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Keywords: {target.searchKeywords}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href={target.linkedinSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(2, 132, 199, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(2, 132, 199, 0.35)',
                      fontSize: '11px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Search size={12} />
                    <span>Find on LinkedIn</span>
                    <ExternalLink size={11} />
                  </a>

                  <button
                    onClick={() => handleQueueSingleTarget(target, personName)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(249, 115, 22, 0.15)',
                      color: '#fb923c',
                      border: '1px solid rgba(249, 115, 22, 0.35)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Zap size={12} />
                    <span>Add to Assist Queue</span>
                  </button>
                </div>
              </div>

              {/* Personalization Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  Personalize with Name:
                </span>
                <input
                  type="text"
                  value={personName}
                  onChange={(e) =>
                    setEmployeeNameByTier({ ...employeeNameByTier, [target.tier]: e.target.value })
                  }
                  placeholder={`Found someone on LinkedIn? Type their name (e.g. Sarah) for instant tailored note...`}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '11px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Message Format Sub-Tabs */}
              <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px' }}>
                {[
                  { id: 'connection_note' as const, label: 'LinkedIn Connection Note (≤ 300 chars)' },
                  { id: 'inmail' as const, label: 'LinkedIn InMail / DM Draft' },
                  { id: 'email' as const, label: 'Direct Cold Email Draft' },
                ].map((fmt) => {
                  const isFmtActive = activeTab === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() =>
                        setActiveTabByTier({ ...activeTabByTier, [target.tier]: fmt.id })
                      }
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: isFmtActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        color: isFmtActive ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {fmt.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab 1: Connection Note (Strictly <= 300 chars) */}
              {activeTab === 'connection_note' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isOverLimit ? '#f87171' : '#34d399',
                        }}
                      >
                        {charCount} / 300 Characters
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        (Guaranteed to fit in LinkedIn's connection request note)
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        handleCopy(noteText, `${target.tier}-note`, 'Connection Note')
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: copiedId === `${target.tier}-note` ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        color: copiedId === `${target.tier}-note` ? '#4ade80' : '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedId === `${target.tier}-note` ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === `${target.tier}-note` ? 'Copied Note!' : 'Copy Note'}</span>
                    </button>
                  </div>

                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#e2e8f0',
                      fontSize: '12px',
                      lineHeight: '1.6',
                    }}
                  >
                    "{noteText}"
                  </div>
                </div>
              )}

              {/* Tab 2: InMail / DM Draft */}
              {activeTab === 'inmail' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() =>
                        handleCopy(target.inmailDraft, `${target.tier}-inmail`, 'InMail Draft')
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: copiedId === `${target.tier}-inmail` ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        color: copiedId === `${target.tier}-inmail` ? '#4ade80' : '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedId === `${target.tier}-inmail` ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === `${target.tier}-inmail` ? 'Copied InMail!' : 'Copy InMail'}</span>
                    </button>
                  </div>

                  <pre
                    style={{
                      margin: 0,
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#e2e8f0',
                      fontSize: '11px',
                      lineHeight: '1.6',
                      fontFamily: 'inherit',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {target.inmailDraft}
                  </pre>
                </div>
              )}

              {/* Tab 3: Direct Email Draft */}
              {activeTab === 'email' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
                      Subject: {target.emailSubject}
                    </span>

                    <button
                      onClick={() =>
                        handleCopy(
                          `Subject: ${target.emailSubject}\n\n${target.emailBody}`,
                          `${target.tier}-email`,
                          'Cold Email'
                        )
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: copiedId === `${target.tier}-email` ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        color: copiedId === `${target.tier}-email` ? '#4ade80' : '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedId === `${target.tier}-email` ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === `${target.tier}-email` ? 'Copied Email!' : 'Copy Full Email'}</span>
                    </button>
                  </div>

                  <pre
                    style={{
                      margin: 0,
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#e2e8f0',
                      fontSize: '11px',
                      lineHeight: '1.6',
                      fontFamily: 'inherit',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {target.emailBody}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

