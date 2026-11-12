import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Inbox,
  Mail,
  Send,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Copy,
  Archive,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
  Building,
  Briefcase,
  FileText,
  ShieldAlert,
  ChevronRight,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useInboxStore, InboxThread } from '../../store/useInboxStore';
import { useCandidateVaultStore } from '../../store/useCandidateVaultStore';
import { JobApplication } from '../../services/careerOps/types';
import { copyToClipboard } from '../../utils/clipboard';

const CATEGORY_STYLES: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  interview_invite: {
    label: '🎙️ Interview Invite',
    bg: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: 'rgba(34, 197, 94, 0.35)',
  },
  assessment: {
    label: '💻 Tech Assessment',
    bg: 'rgba(249, 115, 22, 0.15)',
    color: '#fb923c',
    border: 'rgba(249, 115, 22, 0.35)',
  },
  info_request: {
    label: '❓ Recruiter Question',
    bg: 'rgba(245, 158, 11, 0.15)',
    color: '#fbbf24',
    border: 'rgba(245, 158, 11, 0.35)',
  },
  referral_confirmation: {
    label: '🤝 Referral Confirmed',
    bg: 'rgba(168, 85, 247, 0.15)',
    color: '#c084fc',
    border: 'rgba(168, 85, 247, 0.35)',
  },
  rejection: {
    label: '❌ Not Moving Forward',
    bg: 'rgba(148, 163, 184, 0.12)',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.25)',
  },
  spam: {
    label: '⚠️ Spam / Cold Pitch',
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  other: {
    label: '✉️ General Inbound',
    bg: 'rgba(255, 255, 255, 0.06)',
    color: '#cbd5e1',
    border: 'rgba(255, 255, 255, 0.15)',
  },
};

interface InboxViewProps {
  applications?: JobApplication[];
  onSelectJob?: (job: JobApplication) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({ applications = [], onSelectJob }) => {
  const {
    threads,
    selectedThreadId,
    searchQuery,
    categoryFilter,
    statusFilter,
    setSearchQuery,
    setCategoryFilter,
    setStatusFilter,
    setSelectedThreadId,
    markAsArchived,
    unarchive,
    sendCandidateReply,
    resetToDemo,
  } = useInboxStore();

  const vault = useCandidateVaultStore((s) => s.profile);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedReply, setCopiedReply] = useState(false);
  const [replyText, setReplyText] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Active selected thread
  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === selectedThreadId) || threads[0] || null;
  }, [threads, selectedThreadId]);

  // Synchronize reply text when active thread changes
  useEffect(() => {
    if (activeThread) {
      setReplyText(activeThread.customReplyText || activeThread.suggestedReply || '');
    }
  }, [activeThread?.id]);

  // Filtered threads
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      // Status filter
      if (statusFilter === 'unread' && t.status !== 'unread') return false;
      if (statusFilter === 'archived' && t.status !== 'archived') return false;
      if (statusFilter === 'all' && t.status === 'archived') return false; // Hide archived in 'all'

      // Category filter
      if (categoryFilter === 'urgent') {
        if (t.classification.urgency !== 'urgent') return false;
      } else if (categoryFilter !== 'all') {
        if (t.classification.category !== categoryFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSubject = t.subject.toLowerCase().includes(q);
        const matchesSender = t.senderName.toLowerCase().includes(q) || t.senderEmail.toLowerCase().includes(q);
        const matchesCompany = t.company.toLowerCase().includes(q);
        const matchesBody = t.messages.some((m) => m.text.toLowerCase().includes(q));
        if (!matchesSubject && !matchesSender && !matchesCompany && !matchesBody) return false;
      }

      return true;
    });
  }, [threads, statusFilter, categoryFilter, searchQuery]);

  // Keyboard navigation: j/k selection, r to focus reply, e to archive, c to copy reply, / to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (filteredThreads.length === 0) return;

      const currentIndex = filteredThreads.findIndex((t) => t.id === selectedThreadId);

      if (e.key === 'j') {
        e.preventDefault();
        const nextIndex = currentIndex < filteredThreads.length - 1 ? currentIndex + 1 : 0;
        setSelectedThreadId(filteredThreads[nextIndex].id);
      } else if (e.key === 'k') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredThreads.length - 1;
        setSelectedThreadId(filteredThreads[prevIndex].id);
      } else if (e.key === 'r') {
        e.preventDefault();
        replyInputRef.current?.focus();
      } else if (e.key === 'e' && activeThread) {
        e.preventDefault();
        if (activeThread.status === 'archived') {
          unarchive(activeThread.id);
          showToast('Thread unarchived.');
        } else {
          markAsArchived(activeThread.id);
          showToast('Thread archived.');
        }
      } else if (e.key === 'c' && replyText.trim()) {
        e.preventDefault();
        void handleCopyReply();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedThreadId, filteredThreads, activeThread, replyText]);

  // Metrics counts
  const counts = useMemo(() => {
    return {
      all: threads.filter((t) => t.status !== 'archived').length,
      unread: threads.filter((t) => t.status === 'unread').length,
      urgent: threads.filter((t) => t.classification.urgency === 'urgent' && t.status !== 'archived').length,
      questions: threads.filter((t) => t.classification.category === 'info_request' && t.status !== 'archived').length,
      referrals: threads.filter((t) => t.classification.category === 'referral_confirmation' && t.status !== 'archived').length,
      archived: threads.filter((t) => t.status === 'archived').length,
    };
  }, [threads]);

  const handleCopyReply = async () => {
    if (!replyText.trim()) return;
    await copyToClipboard(replyText);
    setCopiedReply(true);
    showToast('Reply copied to clipboard!');
    setTimeout(() => setCopiedReply(false), 2000);
  };

  const handleSendReply = () => {
    if (!activeThread || !replyText.trim()) return;
    sendCandidateReply(activeThread.id, replyText);
    showToast('Sent reply and logged to conversation thread!');
  };

  const insertVaultAnswer = (textToInsert: string) => {
    setReplyText((prev) => (prev ? `${prev}\n\n${textToInsert}` : textToInsert));
    showToast('Inserted Candidate Vault detail.');
  };

  const matchingJob = useMemo(() => {
    if (!activeThread) return null;
    return applications.find(
      (a) => a.id === activeThread.jobId || a.company.toLowerCase() === activeThread.company.toLowerCase()
    );
  }, [activeThread, applications]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        maxWidth: '1360px',
        margin: '0 auto',
        width: '100%',
        height: 'calc(100vh - 170px)',
        minHeight: '620px',
        color: '#f8fafc',
      }}
    >
      {/* Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(249, 115, 22, 0.5)',
            color: '#f8fafc',
            padding: '10px 18px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Zap size={14} color="#fb923c" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 16px',
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Category Filter Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Inbound', count: counts.all },
            { id: 'urgent', label: '🔥 Urgent Invites', count: counts.urgent },
            { id: 'info_request', label: '❓ Recruiter Questions', count: counts.questions },
            { id: 'referral_confirmation', label: '🤝 Referrals', count: counts.referrals },
            { id: 'archived', label: '📦 Archived', count: counts.archived },
          ].map((chip) => {
            const isChipActive =
              chip.id === 'archived'
                ? statusFilter === 'archived'
                : statusFilter !== 'archived' && categoryFilter === chip.id;

            return (
              <button
                key={chip.id}
                onClick={() => {
                  if (chip.id === 'archived') {
                    setStatusFilter('archived');
                    setCategoryFilter('all');
                  } else {
                    setStatusFilter('all');
                    setCategoryFilter(chip.id as any);
                  }
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: isChipActive
                    ? '1px solid rgba(249, 115, 22, 0.45)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isChipActive ? 'rgba(249, 115, 22, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  color: isChipActive ? '#fb923c' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{chip.label}</span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '10px',
                    background: isChipActive ? 'rgba(249, 115, 22, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                    color: isChipActive ? '#ffffff' : '#cbd5e1',
                  }}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input & Demo reload */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={13} color="#64748b" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search emails... (/)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '5px 10px 5px 28px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '11px',
                outline: 'none',
              }}
            />
          </div>

          {threads.length === 0 && (
            <button
              onClick={resetToDemo}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚡ Load Demo Inbox
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Pane Split Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          gap: '14px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* LEFT PANE: Thread List */}
        <div
          style={{
            borderRadius: '12px',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(15, 23, 42, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#94a3b8',
              fontWeight: 700,
            }}
          >
            <span>Conversations ({filteredThreads.length})</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>j/k</kbd> switch
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748b' }}>
                <Mail size={32} style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>No conversations in this filter</p>
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = activeThread?.id === thread.id;
                const catMeta =
                  CATEGORY_STYLES[thread.classification.category] || CATEGORY_STYLES.other;

                return (
                  <div
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: isSelected
                        ? 'rgba(249, 115, 22, 0.1)'
                        : thread.status === 'unread'
                        ? 'rgba(255, 255, 255, 0.03)'
                        : 'transparent',
                      borderLeft: isSelected
                        ? '3px solid #fb923c'
                        : thread.status === 'unread'
                        ? '3px solid #38bdf8'
                        : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 800, fontSize: '12px', color: '#f8fafc' }}>
                        {thread.senderName}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        {Math.round((Date.now() - thread.receivedAt) / 60000) < 60
                          ? `${Math.round((Date.now() - thread.receivedAt) / 60000)}m ago`
                          : `${Math.round((Date.now() - thread.receivedAt) / 3600000)}h ago`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#cbd5e1',
                        }}
                      >
                        {thread.company}
                      </span>

                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: catMeta.bg,
                          color: catMeta.color,
                          border: `1px solid ${catMeta.border}`,
                        }}
                      >
                        {catMeta.label}
                      </span>

                      {thread.status === 'replied' && (
                        <span style={{ fontSize: '9px', color: '#4ade80', fontWeight: 700 }}>
                          ✓ Replied
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: thread.status === 'unread' ? 700 : 500,
                        color: thread.status === 'unread' ? '#ffffff' : '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {thread.subject}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Thread Detail & Reply Workspace */}
        {activeThread ? (
          <div
            style={{
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Thread Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 23, 42, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                  {activeThread.subject}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                  <span>From: <strong style={{ color: '#cbd5e1' }}>{activeThread.senderName}</strong> ({activeThread.senderEmail})</span>
                  <span>•</span>
                  <span>Target: <strong>{activeThread.company}</strong> — {activeThread.role}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {matchingJob && onSelectJob && (
                  <button
                    onClick={() => onSelectJob(matchingJob)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'rgba(249, 115, 22, 0.15)',
                      color: '#fb923c',
                      border: '1px solid rgba(249, 115, 22, 0.35)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Briefcase size={12} />
                    <span>View Job Drawer</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    if (activeThread.status === 'archived') {
                      unarchive(activeThread.id);
                      showToast('Unarchived thread.');
                    } else {
                      markAsArchived(activeThread.id);
                      showToast('Archived thread.');
                    }
                  }}
                  title={activeThread.status === 'archived' ? 'Unarchive (e)' : 'Archive (e)'}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Archive size={12} />
                  <span>{activeThread.status === 'archived' ? 'Unarchive' : 'Archive'}</span>
                </button>
              </div>
            </div>

            {/* Prompt Injection / H5 Sanitization Notice */}
            {activeThread.classification.defangedTokensDetected && (
              <div
                style={{
                  padding: '8px 18px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#f87171',
                }}
              >
                <ShieldAlert size={14} />
                <span>
                  <strong>Hard Line H5 Warning:</strong> Prompt-injection tokens were detected and neutralized in this inbound message.
                </span>
              </div>
            )}

            {/* Extracted Interactive Action Banner (Scheduling Links / Assessments) */}
            {(activeThread.classification.schedulingUrl ||
              activeThread.classification.assessmentUrl ||
              activeThread.classification.proposedSlots.length > 0) && (
              <div
                style={{
                  padding: '10px 18px',
                  background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.12), rgba(99, 102, 241, 0.12))',
                  borderBottom: '1px solid rgba(34, 197, 94, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} color="#4ade80" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                    {activeThread.classification.schedulingUrl
                      ? 'Recruiter Scheduling Link Detected'
                      : activeThread.classification.assessmentUrl
                      ? 'Technical Assessment Detected'
                      : 'Proposed Meeting Times Detected'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {activeThread.classification.schedulingUrl && (
                    <a
                      href={activeThread.classification.schedulingUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Pick Time Slot</span>
                      <ExternalLink size={12} />
                    </a>
                  )}

                  {activeThread.classification.assessmentUrl && (
                    <a
                      href={activeThread.classification.assessmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #f97316, #ea580c)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>Open Assessment</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {activeThread.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.isCandidate ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    background: msg.isCandidate
                      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.2))'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: msg.isCandidate
                      ? '1px solid rgba(99, 102, 241, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                      fontSize: '10px',
                      color: msg.isCandidate ? '#a5b4fc' : '#94a3b8',
                      fontWeight: 700,
                    }}
                  >
                    <span>{msg.senderName}</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      lineHeight: '1.6',
                      color: '#f8fafc',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Composer Workspace */}
            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(15, 23, 42, 0.85)',
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {/* Quick Truthful Candidate Vault Fast-Pill Injections */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                  Candidate Vault Shortcuts:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    insertVaultAnswer(
                      `Work Authorization: I am fully authorized to work in the United States and ${
                        vault.requiresSponsorship ? 'will require' : 'do not require'
                      } sponsorship.`
                    )
                  }
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  + Work Authorization
                </button>

                <button
                  type="button"
                  onClick={() =>
                    insertVaultAnswer(
                      `Compensation: My expected total compensation bracket is around ${
                        vault.salaryExpectation || '$185,000 - $225,000'
                      }, open to discussion based on scope and equity.`
                    )
                  }
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  + Salary Expectations
                </button>

                <button
                  type="button"
                  onClick={() =>
                    insertVaultAnswer(
                      'Availability: I am available for a conversation this week on Tuesday, Wednesday, or Thursday between 10:00 AM and 4:00 PM EST.'
                    )
                  }
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#cbd5e1',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  + Propose Free/Busy Slots
                </button>
              </div>

              {/* Textarea */}
              <textarea
                ref={replyInputRef}
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write or edit your reply... (Press 'r' to focus)"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  resize: 'none',
                  outline: 'none',
                }}
              />

              {/* Composer Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>c</kbd> copy reply • <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>r</kbd> focus
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={handleCopyReply}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: copiedReply ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      color: copiedReply ? '#4ade80' : '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {copiedReply ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedReply ? 'Copied' : 'Copy Draft'}</span>
                  </button>

                  <button
                    onClick={handleSendReply}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #f97316, #ea580c)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Send size={12} />
                    <span>Send & Mark Replied</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
            }}
          >
            Select a conversation on the left to read or reply.
          </div>
        )}
      </div>
    </div>
  );
};

