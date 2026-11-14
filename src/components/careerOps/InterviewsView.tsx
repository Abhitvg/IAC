import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar,
  Clock,
  Video,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileText,
  Star,
  ExternalLink,
  Plus,
  Trash2,
  ChevronRight,
  Zap,
  Building,
  Briefcase,
  Copy,
  Check,
  Search,
  RotateCcw,
  BookOpen,
  MessageSquare,
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import {
  useInterviewScheduleStore,
  ScheduledInterview,
  InterviewRoundType,
  InterviewDebrief,
} from '../../store/useInterviewScheduleStore';
import { predictInterviewLoop, PredictedInterviewLoop } from '../../services/careerOps/jobInterviewPredictor';
import { usePracticeStore } from '../../store/usePracticeStore';
import { JobApplication } from '../../services/careerOps/types';
import { copyToClipboard } from '../../utils/clipboard';

const ROUND_TYPE_CONFIG: Record<
  InterviewRoundType,
  { label: string; bg: string; color: string; border: string; icon: string }
> = {
  phone_screen: {
    label: 'Recruiter Alignment',
    bg: 'rgba(148, 163, 184, 0.12)',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.25)',
    icon: '📞',
  },
  technical_coding: {
    label: 'Technical Coding',
    bg: 'rgba(249, 115, 22, 0.15)',
    color: '#fb923c',
    border: 'rgba(249, 115, 22, 0.35)',
    icon: '💻',
  },
  system_design: {
    label: 'System Design',
    bg: 'rgba(99, 102, 241, 0.15)',
    color: '#818cf8',
    border: 'rgba(99, 102, 241, 0.35)',
    icon: '🏛️',
  },
  behavioral: {
    label: 'Behavioral / Leadership',
    bg: 'rgba(168, 85, 247, 0.15)',
    color: '#c084fc',
    border: 'rgba(168, 85, 247, 0.35)',
    icon: '🗣️',
  },
  onsite_loop: {
    label: 'Full Onsite Loop',
    bg: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: 'rgba(34, 197, 94, 0.35)',
    icon: '🎯',
  },
};

interface InterviewsViewProps {
  applications?: JobApplication[];
  resumeText?: string;
  onOpenJobDrawer?: (job: JobApplication) => void;
}

export const InterviewsView: React.FC<InterviewsViewProps> = ({
  applications = [],
  resumeText = '',
  onOpenJobDrawer,
}) => {
  const {
    interviews,
    selectedInterviewId,
    statusFilter,
    searchQuery,
    setSelectedInterviewId,
    setStatusFilter,
    setSearchQuery,
    addInterview,
    deleteInterview,
    saveDebrief,
    resetToDemo,
  } = useInterviewScheduleStore();

  const { setActiveView, createCompanyPlan } = usePracticeStore();

  const [activeTab, setActiveTab] = useState<'prep' | 'debrief'>('prep');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [copiedNote, setCopiedNote] = useState(false);

  // Debrief Form State
  const [debriefRating, setDebriefRating] = useState<number>(5);
  const [debriefQuestions, setDebriefQuestions] = useState<string>('');
  const [debriefWentWell, setDebriefWentWell] = useState<string>('');
  const [debriefToImprove, setDebriefToImprove] = useState<string>('');
  const [debriefFollowUpNote, setDebriefFollowUpNote] = useState<string>('');

  // Add Interview Modal State
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newRoundName, setNewRoundName] = useState('');
  const [newRoundType, setNewRoundType] = useState<InterviewRoundType>('technical_coding');
  const [newDateTime, setNewDateTime] = useState('');
  const [newDuration, setNewDuration] = useState(45);
  const [newInterviewer, setNewInterviewer] = useState('');
  const [newMeetingLink, setNewMeetingLink] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const activeInterview = useMemo(() => {
    return (
      interviews.find((item) => item.id === selectedInterviewId) ||
      interviews[0] ||
      null
    );
  }, [interviews, selectedInterviewId]);

  // Matching target job
  const matchingJob = useMemo(() => {
    if (!activeInterview) return null;
    return applications.find(
      (a) =>
        a.id === activeInterview.jobId ||
        a.company.toLowerCase() === activeInterview.company.toLowerCase()
    );
  }, [activeInterview, applications]);

  // Predicted loop and questions
  const predictedLoop = useMemo<PredictedInterviewLoop | null>(() => {
    if (!activeInterview) return null;
    const jd = matchingJob?.jdText || `${activeInterview.role} at ${activeInterview.company}`;
    return predictInterviewLoop(activeInterview.company, activeInterview.role, jd);
  }, [activeInterview, matchingJob]);

  // Synchronize debrief state when active interview changes
  useEffect(() => {
    if (activeInterview?.debrief) {
      setDebriefRating(activeInterview.debrief.rating || 5);
      setDebriefQuestions((activeInterview.debrief.questionsAsked || []).join('\n'));
      setDebriefWentWell(activeInterview.debrief.whatWentWell || '');
      setDebriefToImprove(activeInterview.debrief.areasToImprove || '');
      setDebriefFollowUpNote(activeInterview.debrief.followUpNoteDraft || '');
    } else {
      setDebriefRating(5);
      setDebriefQuestions('');
      setDebriefWentWell('');
      setDebriefToImprove('');
      setDebriefFollowUpNote('');
    }
  }, [activeInterview?.id]);

  // Filtered interviews list
  const filteredInterviews = useMemo(() => {
    return interviews.filter((item) => {
      if (statusFilter === 'upcoming' && item.status !== 'upcoming') return false;
      if (statusFilter === 'completed' && item.status !== 'completed') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesComp = item.company.toLowerCase().includes(q);
        const matchesRole = item.role.toLowerCase().includes(q);
        const matchesRound = item.roundName.toLowerCase().includes(q);
        const matchesInterviewer = (item.interviewerName || '').toLowerCase().includes(q);
        if (!matchesComp && !matchesRole && !matchesRound && !matchesInterviewer) return false;
      }
      return true;
    });
  }, [interviews, statusFilter, searchQuery]);

  // Keyboard navigation: j/k selection, m to launch mock gym, d to switch to debrief, / to search
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

      if (filteredInterviews.length === 0) return;

      const currentIndex = filteredInterviews.findIndex((i) => i.id === selectedInterviewId);

      if (e.key === 'j') {
        e.preventDefault();
        const nextIndex = currentIndex < filteredInterviews.length - 1 ? currentIndex + 1 : 0;
        setSelectedInterviewId(filteredInterviews[nextIndex].id);
      } else if (e.key === 'k') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredInterviews.length - 1;
        setSelectedInterviewId(filteredInterviews[prevIndex].id);
      } else if (e.key === 'm' && activeInterview) {
        e.preventDefault();
        handleLaunchGym();
      } else if (e.key === 'd') {
        e.preventDefault();
        setActiveTab('debrief');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedInterviewId, filteredInterviews, activeInterview]);

  const handleLaunchGym = () => {
    if (!activeInterview) return;
    const jd = matchingJob?.jdText || `${activeInterview.role} interview round at ${activeInterview.company}`;
    createCompanyPlan(activeInterview.company, activeInterview.role, jd, resumeText);
    setActiveView('mock_gym');
    showToast(`Bridged to IAC Practice Studio for ${activeInterview.company}!`);
  };

  const handleSaveDebriefSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInterview) return;

    const questionsList = debriefQuestions
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);

    const debriefData: InterviewDebrief = {
      completedAt: Date.now(),
      rating: debriefRating,
      questionsAsked: questionsList,
      whatWentWell: debriefWentWell.trim(),
      areasToImprove: debriefToImprove.trim(),
      followUpNoteDraft: debriefFollowUpNote.trim() || undefined,
    };

    saveDebrief(activeInterview.id, debriefData);
    showToast('Saved interview debrief and updated performance telemetry!');
  };

  const handleGenerateThankYouNote = () => {
    if (!activeInterview) return;
    const name = activeInterview.interviewerName || 'the team';
    const note = `Hi ${name},\n\nThank you for taking the time to speak today regarding the ${activeInterview.role} role at ${activeInterview.company}. I thoroughly enjoyed our conversation about ${activeInterview.roundName}${debriefWentWell ? ` and specifically discussing ${debriefWentWell.slice(0, 80)}...` : ''}.\n\nOur discussion reinforced my excitement about the team's mission. Looking forward to the next steps in the process!\n\nBest regards,\nCandidate Engineer`;
    setDebriefFollowUpNote(note);
    showToast('Generated grounded thank-you note draft!');
  };

  const handleCopyThankYou = async () => {
    if (!debriefFollowUpNote.trim()) return;
    await copyToClipboard(debriefFollowUpNote);
    setCopiedNote(true);
    showToast('Copied thank-you note to clipboard!');
    setTimeout(() => setCopiedNote(false), 2000);
  };

  const handleAddInterviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.trim() || !newRole.trim() || !newRoundName.trim()) {
      showToast('Company, role, and round name are required.');
      return;
    }

    const scheduledTimestamp = newDateTime ? new Date(newDateTime).getTime() : Date.now() + 86400000 * 2;

    addInterview({
      jobId: matchingJob?.id || `job-ref-${Date.now()}`,
      company: newCompany.trim(),
      role: newRole.trim(),
      roundName: newRoundName.trim(),
      roundType: newRoundType,
      scheduledAt: scheduledTimestamp,
      durationMinutes: newDuration || 45,
      interviewerName: newInterviewer.trim() || undefined,
      meetingLink: newMeetingLink.trim() || undefined,
      status: 'upcoming',
      notes: newNotes.trim() || undefined,
    });

    showToast(`Scheduled ${newRoundName} with ${newCompany}!`);
    setIsAddModalOpen(false);
    // Reset form
    setNewCompany('');
    setNewRole('');
    setNewRoundName('');
    setNewDateTime('');
    setNewDuration(45);
    setNewInterviewer('');
    setNewMeetingLink('');
    setNewNotes('');
  };

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
      {/* Toast Notification */}
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

      {/* Top Filter and Actions Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[
            { id: 'all', label: 'All Loops', count: interviews.length },
            { id: 'upcoming', label: '⏳ Upcoming', count: interviews.filter((i) => i.status === 'upcoming').length },
            { id: 'completed', label: '✓ Completed', count: interviews.filter((i) => i.status === 'completed').length },
          ].map((chip) => {
            const isChipActive = statusFilter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id as any)}
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

        {/* Search & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={13} color="#64748b" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search interview rounds... (/)"
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

          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
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
            <Plus size={13} />
            <span>Schedule Round</span>
          </button>

          {interviews.length === 0 && (
            <button
              onClick={resetToDemo}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                border: '1px solid rgba(249, 115, 22, 0.35)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⚡ Load Demo Loops
            </button>
          )}
        </div>
      </div>

      {/* Main Two-Pane Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          gap: '14px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* LEFT PANE: Interview Schedule List */}
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
            <span>Upcoming & Past Rounds ({filteredInterviews.length})</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '4px' }}>j/k</kbd> switch
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filteredInterviews.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748b' }}>
                <Calendar size={32} style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>No interviews in this filter</p>
              </div>
            ) : (
              filteredInterviews.map((item) => {
                const isSelected = activeInterview?.id === item.id;
                const roundMeta = ROUND_TYPE_CONFIG[item.roundType] || ROUND_TYPE_CONFIG.technical_coding;
                const dateObj = new Date(item.scheduledAt);

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedInterviewId(item.id)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: isSelected
                        ? 'rgba(249, 115, 22, 0.1)'
                        : 'transparent',
                      borderLeft: isSelected
                        ? '3px solid #fb923c'
                        : item.status === 'upcoming'
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
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#f8fafc' }}>
                        {item.company}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: item.status === 'upcoming' ? '#38bdf8' : '#94a3b8',
                        }}
                      >
                        {dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1' }}>
                      {item.roundName}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: roundMeta.bg,
                          color: roundMeta.color,
                          border: `1px solid ${roundMeta.border}`,
                        }}
                      >
                        {roundMeta.icon} {roundMeta.label}
                      </span>

                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        {item.durationMinutes} min
                      </span>

                      {item.debrief && (
                        <span style={{ fontSize: '10px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 700 }}>
                          <Star size={10} fill="#fbbf24" color="#fbbf24" />
                          <span>{item.debrief.rating}/5</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Company Prep Brief & Debrief Workspace */}
        {activeInterview ? (
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
            {/* Round Detail Header */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                    {activeInterview.company} — {activeInterview.roundName}
                  </h3>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: activeInterview.status === 'upcoming' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: activeInterview.status === 'upcoming' ? '#38bdf8' : '#4ade80',
                      border: activeInterview.status === 'upcoming' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(34, 197, 94, 0.35)',
                    }}
                  >
                    {activeInterview.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                  <span>Role: <strong style={{ color: '#cbd5e1' }}>{activeInterview.role}</strong></span>
                  {activeInterview.interviewerName && (
                    <span>• Interviewer: <strong style={{ color: '#cbd5e1' }}>{activeInterview.interviewerName}</strong> ({activeInterview.interviewerRole || 'Team'})</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeInterview.meetingLink && (
                  <a
                    href={activeInterview.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      fontSize: '11px',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Video size={13} />
                    <span>Join Meeting</span>
                  </a>
                )}

                <button
                  onClick={handleLaunchGym}
                  title="Bridge into IAC Practice Studio (Hotkey: m)"
                  style={{
                    padding: '6px 14px',
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
                    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)',
                  }}
                >
                  <Play size={12} fill="#ffffff" />
                  <span>Start Practice in Mock Gym (m)</span>
                </button>
              </div>
            </div>

            {/* Sub-Tab Switcher */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(15, 23, 42, 0.5)',
                padding: '0 18px',
              }}
            >
              <button
                onClick={() => setActiveTab('prep')}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'prep' ? '2px solid #fb923c' : '2px solid transparent',
                  color: activeTab === 'prep' ? '#fb923c' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <BookOpen size={13} />
                <span>📖 Company Prep Brief</span>
              </button>

              <button
                onClick={() => setActiveTab('debrief')}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'debrief' ? '2px solid #fb923c' : '2px solid transparent',
                  color: activeTab === 'debrief' ? '#fb923c' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <MessageSquare size={13} />
                <span>📝 Post-Interview Debrief {activeInterview.debrief ? '(✓ Logged)' : ''}</span>
              </button>
            </div>

            {/* Sub-Tab 1: Company Prep Brief */}
            {activeTab === 'prep' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {predictedLoop && (
                  <>
                    {/* Architecture Overview */}
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <h4 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                        Architectural Overview & Engineering Culture
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
                        {predictedLoop.overview}
                      </p>
                    </div>

                    {/* Predicted Technical Questions */}
                    <div>
                      <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                        Predicted Technical Questions & System Bottlenecks ({predictedLoop.technicalQuestions.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {predictedLoop.technicalQuestions.map((q) => (
                          <div
                            key={q.id}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '8px',
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(255, 255, 255, 0.06)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#fb923c' }}>
                                [{q.category}] {q.difficulty}
                              </span>
                              <button
                                onClick={handleLaunchGym}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#38bdf8',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontWeight: 600,
                                }}
                              >
                                <span>Practice in Gym</span>
                                <ArrowRight size={11} />
                              </button>
                            </div>
                            <div style={{ fontSize: '12px', color: '#f8fafc', fontWeight: 600, lineHeight: '1.5' }}>
                              {q.prompt}
                            </div>
                            {q.keyEvaluationPoints.length > 0 && (
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                <strong>Evaluation Rubric:</strong> {q.keyEvaluationPoints.join(' • ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Predicted Behavioral Questions */}
                    <div>
                      <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                        Predicted Behavioral & Cross-Functional STAR Questions ({predictedLoop.behavioralQuestions.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {predictedLoop.behavioralQuestions.map((q) => (
                          <div
                            key={q.id}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(255, 255, 255, 0.06)',
                              fontSize: '12px',
                              color: '#cbd5e1',
                              lineHeight: '1.5',
                            }}
                          >
                            {q.prompt}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Sub-Tab 2: Post-Interview Debrief */}
            {activeTab === 'debrief' && (
              <form
                onSubmit={handleSaveDebriefSubmit}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Rating */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    Self-Assessed Performance Rating:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setDebriefRating(star)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: debriefRating >= star ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: debriefRating >= star ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: debriefRating >= star ? '#fbbf24' : '#64748b',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 700,
                          fontSize: '12px',
                        }}
                      >
                        <Star size={13} fill={debriefRating >= star ? '#fbbf24' : 'none'} />
                        <span>{star}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Questions Asked */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Specific Questions Asked by Interviewer (1 per line):
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Design a distributed key-value store with eventual consistency&#10;How do you debug memory leaks in Go microservices?"
                    value={debriefQuestions}
                    onChange={(e) => setDebriefQuestions(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* What went well & areas to improve */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4ade80', marginBottom: '4px' }}>
                      What Went Well (Strong Proof Points):
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Strong architecture breakdown, fast complexity analysis..."
                      value={debriefWentWell}
                      onChange={(e) => setDebriefWentWell(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#f8fafc',
                        fontSize: '12px',
                        lineHeight: '1.5',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#fb923c', marginBottom: '4px' }}>
                      Areas to Improve / Blind Spots:
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Need deeper familiarity with Paxos election edge cases..."
                      value={debriefToImprove}
                      onChange={(e) => setDebriefToImprove(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#f8fafc',
                        fontSize: '12px',
                        lineHeight: '1.5',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Follow-up Thank-you Note */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1' }}>
                      Follow-up Thank You Note Draft:
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateThankYouNote}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#38bdf8',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 700,
                      }}
                    >
                      <Sparkles size={12} />
                      <span>Generate Contextual Draft</span>
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Click 'Generate Contextual Draft' or write your thank you note..."
                    value={debriefFollowUpNote}
                    onChange={(e) => setDebriefFollowUpNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      outline: 'none',
                    }}
                  />
                  {debriefFollowUpNote.trim() && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        onClick={handleCopyThankYou}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: copiedNote ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          color: copiedNote ? '#4ade80' : '#cbd5e1',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {copiedNote ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedNote ? 'Copied' : 'Copy Note'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="submit"
                    style={{
                      padding: '8px 20px',
                      borderRadius: '6px',
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle2 size={14} />
                    <span>Save Debrief & Log Performance</span>
                  </button>
                </div>
              </form>
            )}
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
            Select an interview round on the left to see the prep brief or log a debrief.
          </div>
        )}
      </div>

      {/* MODAL: ADD INTERVIEW ROUND */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="#fb923c" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                  Schedule Interview Round
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddInterviewSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Company *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anthropic"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Role *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Research Systems Engineer"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Round Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Distributed Consensus Screen"
                    value={newRoundName}
                    onChange={(e) => setNewRoundName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Round Format
                  </label>
                  <select
                    value={newRoundType}
                    onChange={(e) => setNewRoundType(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  >
                    <option value="technical_coding">💻 Technical Coding</option>
                    <option value="system_design">🏛️ System Design</option>
                    <option value="behavioral">🗣️ Behavioral / Leadership</option>
                    <option value="phone_screen">📞 Recruiter Alignment</option>
                    <option value="onsite_loop">🎯 Full Onsite Loop</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newDateTime}
                    onChange={(e) => setNewDateTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={360}
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Interviewer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Chen"
                    value={newInterviewer}
                    onChange={(e) => setNewInterviewer(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '4px' }}>
                    Meeting URL (Zoom / Meet)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newMeetingLink}
                    onChange={(e) => setNewMeetingLink(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#94a3b8',
                    border: 'none',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save & Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

