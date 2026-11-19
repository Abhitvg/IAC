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
  Flame,
  Award,
  X,
  Send,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { JobApplication, NetworkContact } from '../../services/careerOps/types';
import {
  generateCompanyOutreachPlan,
  queueAllPipelineCompaniesToAssist,
  generateLinkedInConnectionNote,
  buildLinkedInSearchUrl,
  CompanyEmployeeTarget,
} from '../../services/careerOps/linkedinOutreachService';
import {
  PROVEN_HOOK_FORMULAS,
  LINKEDIN_PROFILE_RUBRIC,
  HookFormula,
} from '../../services/careerOps/linkedinHumanizerData';
import {
  LinkedInHumanizerService,
  HumanScoreReport,
} from '../../services/careerOps/linkedinHumanizerService';
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
  const [activeTabByTier, setActiveTabByTier] = useState<Record<string, 'connection_note' | 'dm_sequence' | 'inmail' | 'email'>>({
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

  // Modals state
  const [showHooksModal, setShowHooksModal] = useState(false);
  const [showHumanizerModal, setShowHumanizerModal] = useState(false);
  const [hooksSearch, setHooksSearch] = useState('');

  // Humanizer interactive sandbox state
  const [humanizerInput, setHumanizerInput] = useState(
    "In today's fast-paced digital landscape, I am thrilled to dive deep into cutting-edge solutions and leverage robust, game-changing paradigms to unlock unprecedented value."
  );
  const [humanizerResult, setHumanizerResult] = useState<{
    cleanText: string;
    scoreReport: HumanScoreReport;
    replacementsCount: number;
    strippedPhrases: string[];
  } | null>(null);

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

  const runHumanizerScrub = () => {
    const service = LinkedInHumanizerService.getInstance();
    const cleanResult = service.humanize(humanizerInput);
    const score = service.scoreHumanText(cleanResult.cleanText);
    setHumanizerResult({
      cleanText: cleanResult.cleanText,
      scoreReport: score,
      replacementsCount: cleanResult.report.totalArtifactsRemoved,
      strippedPhrases: cleanResult.report.lexicalHits.map((h) => h.name),
    });
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
      notes: `Targeted outreach for ${roleTitle} at ${companyName}. Human Score: ${target.humanScore || 96}/100.`,
    });

    showToast(`Added ${target.tierLabel} to your LinkedIn Assist Queue!`);
  };

  const filteredHooks = useMemo(() => {
    if (!hooksSearch.trim()) return PROVEN_HOOK_FORMULAS;
    const q = hooksSearch.toLowerCase();
    return PROVEN_HOOK_FORMULAS.filter(
      (h) => h.name.toLowerCase().includes(q) || h.template.toLowerCase().includes(q) || h.example.toLowerCase().includes(q)
    );
  }, [hooksSearch]);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                POWERED BY LINKEDIN-AGENT-SKILL • ZERO AI SLOP
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              High-converting outreach with 3-pass anti-AI slop scrubbing, 21 hook formulas, and 3-step DM sequences.
            </p>
          </div>
        </div>

        {/* Global Bulk Action Buttons & Tool Openers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowHooksModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Flame size={14} />
            <span>21 Hook Formulas</span>
          </button>

          <button
            onClick={() => {
              setShowHumanizerModal(true);
              runHumanizerScrub();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <ShieldCheck size={14} />
            <span>Anti-Slop Humanizer</span>
          </button>

          <button
            onClick={handleQueueAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
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
            <span>Queue Pipeline ({applications.length})</span>
          </button>

          <button
            onClick={onOpenAssistQueue}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
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
            <span>Assist Queue</span>
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
          const humanScore = target.humanScore || 96;

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
                    {/* Human Score Pill */}
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: humanScore >= 85 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                        color: humanScore >= 85 ? '#4ade80' : '#facc15',
                        border: `1px solid ${humanScore >= 85 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ShieldCheck size={11} />
                      {humanScore}/100 Human Score • 0 Slop
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
              <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px', flexWrap: 'wrap' }}>
                {[
                  { id: 'connection_note' as const, label: 'LinkedIn Connection Note (≤ 300 chars)' },
                  { id: 'dm_sequence' as const, label: '3-Step DM Sequence (li-dm formula)' },
                  { id: 'inmail' as const, label: 'LinkedIn InMail / DM Pitch' },
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

              {/* Tab 2: 3-Step DM Sequence (li-dm Formula) */}
              {activeTab === 'dm_sequence' && target.dmSequence && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700 }}>
                      {'Formula: 3-Step Sequence (< 200 char invite → value-first day +1 → asset day +4 → graceful exit)'}
                    </span>
                    <button
                      onClick={() =>
                        handleCopy(
                          `STEP 0 (Invite Note):\n${target.dmSequence?.inviteNote}\n\nSTEP 1 (Day +1):\n${target.dmSequence?.day1Acceptance}\n\nSTEP 2 (Day +4):\n${target.dmSequence?.day4FollowUp}\n\nSTEP 3 (Day +10):\n${target.dmSequence?.day10CloseTheLoop}`,
                          `${target.tier}-all-seq`,
                          'Full 3-Step Sequence'
                        )
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: copiedId === `${target.tier}-all-seq` ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        color: copiedId === `${target.tier}-all-seq` ? '#4ade80' : '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedId === `${target.tier}-all-seq` ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === `${target.tier}-all-seq` ? 'Copied Entire Sequence!' : 'Copy Entire Sequence'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                    {/* Step 0 */}
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                          Step 0 • Invite Note (&lt; 200 chars, no ask)
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{target.dmSequence.inviteNote.length} chars</span>
                          <button
                            onClick={() => handleCopy(target.dmSequence!.inviteNote, `${target.tier}-seq-0`, 'Step 0')}
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
                          >
                            {copiedId === `${target.tier}-seq-0` ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.5' }}>
                        "{target.dmSequence.inviteNote}"
                      </div>
                    </div>

                    {/* Step 1 */}
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase' }}>
                          Step 1 • Day +1 First Message (Value-first, no calendar link)
                        </span>
                        <button
                          onClick={() => handleCopy(target.dmSequence!.day1Acceptance, `${target.tier}-seq-1`, 'Step 1')}
                          style={{ background: 'transparent', border: 'none', color: '#4ade80', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
                        >
                          {copiedId === `${target.tier}-seq-1` ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.5' }}>
                        "{target.dmSequence.day1Acceptance}"
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#facc15', textTransform: 'uppercase' }}>
                          Step 2 • Day +4 Follow-Up (Asset / Technical proof, zero nagging)
                        </span>
                        <button
                          onClick={() => handleCopy(target.dmSequence!.day4FollowUp, `${target.tier}-seq-2`, 'Step 2')}
                          style={{ background: 'transparent', border: 'none', color: '#facc15', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
                        >
                          {copiedId === `${target.tier}-seq-2` ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.5' }}>
                        "{target.dmSequence.day4FollowUp}"
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#f87171', textTransform: 'uppercase' }}>
                          Step 3 • Day +10 Close-the-Loop (Graceful close, removes pressure)
                        </span>
                        <button
                          onClick={() => handleCopy(target.dmSequence!.day10CloseTheLoop, `${target.tier}-seq-3`, 'Step 3')}
                          style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
                        >
                          {copiedId === `${target.tier}-seq-3` ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: '1.5' }}>
                        "{target.dmSequence.day10CloseTheLoop}"
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: InMail / DM Pitch */}
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

              {/* Tab 4: Direct Email Draft */}
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

      {/* 21 Hook Formulas Modal */}
      {showHooksModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: '16px',
              maxWidth: '850px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(30, 41, 59, 0.7)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Flame size={20} color="#c084fc" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  21 Proven Hook Formulas (Source: Jake Schincariol / Avi Grondin)
                </h3>
              </div>
              <button
                onClick={() => setShowHooksModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <input
                type="text"
                value={hooksSearch}
                onChange={(e) => setHooksSearch(e.target.value)}
                placeholder="Search hook templates (e.g. contrast, mistake, counter-intuitive, benchmark)..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Hooks List */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredHooks.map((h) => (
                <div
                  key={h.id}
                  style={{
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#c084fc' }}>
                      #{h.id} {h.name}
                    </span>
                    <button
                      onClick={() => handleCopy(h.template, `hook-${h.id}`, 'Hook Template')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: copiedId === `hook-${h.id}` ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        color: copiedId === `hook-${h.id}` ? '#4ade80' : '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {copiedId === `hook-${h.id}` ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedId === `hook-${h.id}` ? 'Copied' : 'Copy Template'}</span>
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>
                    {h.template}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: '6px' }}>
                    Example: {h.example}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Anti-AI Slop Humanizer Modal */}
      {showHumanizerModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '16px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(30, 41, 59, 0.7)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Anti-AI Slop Humanizer & 5-Check Detection Panel
                </h3>
              </div>
              <button
                onClick={() => setShowHumanizerModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px', fontWeight: 700 }}>
                  Paste any Outreach Note, Post, or Message to Scrub & Score:
                </label>
                <textarea
                  rows={4}
                  value={humanizerInput}
                  onChange={(e) => setHumanizerInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <button
                  onClick={runHumanizerScrub}
                  style={{
                    marginTop: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={12} />
                  <span>Scrub & Run 5-Check Human Panel</span>
                </button>
              </div>

              {humanizerResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Score Summary Banner */}
                  <div
                    style={{
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>OVERALL HUMAN SCORE</div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: humanizerResult.scoreReport.verdict === 'PASS' ? '#4ade80' : '#f87171' }}>
                        {humanizerResult.scoreReport.overallScore}/100 • {humanizerResult.scoreReport.verdict === 'PASS' ? 'PASS (AUTHENTIC)' : 'FLAGGED (AI DETECTED)'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[
                        ['Burstiness', humanizerResult.scoreReport.burstiness.score],
                        ['Specificity', humanizerResult.scoreReport.specificity.score],
                        ['Slop Density', humanizerResult.scoreReport.slopDensity.score],
                        ['Fingerprint', humanizerResult.scoreReport.fingerprint.score],
                        ['Voice', humanizerResult.scoreReport.voice.score],
                      ].map(([chk, val]) => (
                        <div
                          key={String(chk)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: 'rgba(0, 0, 0, 0.35)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>{String(chk)}</div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: Number(val) >= 70 ? '#4ade80' : '#facc15' }}>{String(val)}/100</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cleaned Result */}
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                        3-Pass Cleaned Text ({humanizerResult.replacementsCount} Replacements Made)
                      </span>
                      <button
                        onClick={() => handleCopy(humanizerResult.cleanText, 'humanizer-modal-copy', 'Cleaned Text')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {copiedId === 'humanizer-modal-copy' ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedId === 'humanizer-modal-copy' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div style={{ fontSize: '12px', color: '#f8fafc', lineHeight: '1.6' }}>
                      "{humanizerResult.cleanText}"
                    </div>
                  </div>

                  {/* Scrubbed phrases tag cloud */}
                  {humanizerResult.strippedPhrases.length > 0 && (
                    <div>
                      <span style={{ fontSize: '10px', color: '#f87171', fontWeight: 800, textTransform: 'uppercase' }}>
                        Removed AI Slop Terms ({humanizerResult.strippedPhrases.length}):
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {humanizerResult.strippedPhrases.map((phrase, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '10px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                            }}
                          >
                            <s>{phrase}</s>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

