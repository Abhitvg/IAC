import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Briefcase,
  Zap,
  FileText,
  Mail,
  Mic,
  Compass,
  Settings,
  Sparkles,
  ArrowRight,
  User,
  Shield,
  Layers,
  BarChart3,
  BookOpen,
  FolderGit2,
  Clock,
  ExternalLink,
  Keyboard,
  X,
  Radar,
  Eye,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useCareerOpsStore } from '../../store/useCareerOpsStore';
import type { AppNavId } from '../../screens/AppSidebar';

interface CommandSpotlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (navId: AppNavId) => void;
  onOpenSettings?: () => void;
  onOpenProfileWizard?: () => void;
  onOpenSessions?: () => void;
}

interface SpotlightItem {
  id: string;
  category: 'Screen' | 'Target Job' | 'Action' | 'CareerOps';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ComponentType<{ size?: number | string; color?: string; style?: React.CSSProperties }>;
  action: () => void;
  keywords?: string[];
}

export function CommandSpotlightModal({
  isOpen,
  onClose,
  onNavigate,
  onOpenSettings,
  onOpenProfileWizard,
  onOpenSessions,
}: CommandSpotlightModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    toggleRecording,
    isRecording,
    clearAndResetToListen,
    setToast,
  } = useAppStore();

  const {
    applications,
    setActiveJobId,
    enableDemoMode,
    clearDemoData,
    isDemoMode,
  } = useCareerOpsStore();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allItems: SpotlightItem[] = useMemo(() => {
    const items: SpotlightItem[] = [];

    // --- 1. Quick Navigation Screens ---
    items.push(
      {
        id: 'nav-overview',
        category: 'Screen',
        title: 'Candidate Overview',
        subtitle: 'Readiness metrics, verified evidence ratio, and recent sessions',
        icon: Compass,
        action: () => {
          onNavigate('overview');
          onClose();
        },
        keywords: ['home', 'dashboard', 'readiness', 'stats'],
      },
      {
        id: 'nav-careerops',
        category: 'Screen',
        title: 'CareerOps Job Engine',
        subtitle: '1-5 fit evaluation, ATS resume tailoring, and outreach inbox',
        badge: `${applications.length} Tracked`,
        badgeColor: '#fb923c',
        icon: Briefcase,
        action: () => {
          onNavigate('career_ops');
          onClose();
        },
        keywords: ['jobs', 'applications', 'pipeline', 'scout', 'ats', 'outreach'],
      },
      {
        id: 'nav-teleprompter',
        category: 'Screen',
        title: 'Live Interview Teleprompter',
        subtitle: 'Real-time AI voice transcription, question detection, and grounding',
        badge: isRecording ? 'LIVE MIC' : undefined,
        badgeColor: '#ef4444',
        icon: Mic,
        action: () => {
          onNavigate('teleprompter');
          onClose();
        },
        keywords: ['teleprompter', 'live', 'interview', 'coaching', 'audio', 'mic'],
      },
      {
        id: 'nav-practice',
        category: 'Screen',
        title: 'Practice Studio Gym',
        subtitle: 'Timed System Design, STAR Behavioral, and Technical drills',
        icon: Zap,
        action: () => {
          onNavigate('mock_gym');
          onClose();
        },
        keywords: ['practice', 'gym', 'drills', 'mock', 'star', 'pressure room'],
      },
      {
        id: 'nav-vault',
        category: 'Screen',
        title: 'Evidence Vault',
        subtitle: 'Zero-trust verified work history claims, metrics, and receipts',
        icon: Shield,
        action: () => {
          onNavigate('evidence_vault');
          onClose();
        },
        keywords: ['vault', 'evidence', 'grounding', 'facts', 'claims'],
      },
      {
        id: 'nav-documents',
        category: 'Screen',
        title: 'Resume & Documents Library',
        subtitle: 'Uploaded CVs, LinkedIn imports, GitHub repo connections',
        icon: FileText,
        action: () => {
          onNavigate('resume_docs');
          onClose();
        },
        keywords: ['resume', 'cv', 'linkedin', 'github', 'pdf', 'upload'],
      },
      {
        id: 'nav-knowledge',
        category: 'Screen',
        title: 'Knowledge Base',
        subtitle: 'Domain knowledge chunks, company culture principles, and STAR stories',
        icon: BookOpen,
        action: () => {
          onNavigate('knowledge_base');
          onClose();
        },
        keywords: ['knowledge', 'star', 'stories', 'notes'],
      },
      {
        id: 'nav-history',
        category: 'Screen',
        title: 'Interview History & Replays',
        subtitle: 'Full transcripts and analysis from past interviews',
        icon: Clock,
        action: () => {
          onNavigate('history');
          onClose();
        },
        keywords: ['history', 'recordings', 'replays', 'past'],
      },
      {
        id: 'nav-analytics',
        category: 'Screen',
        title: 'Interview Analytics & Velocity',
        subtitle: 'Confidence trends, speaking cadence (WPM), and filler word counts',
        icon: BarChart3,
        action: () => {
          onNavigate('analytics');
          onClose();
        },
        keywords: ['analytics', 'metrics', 'wpm', 'filler', 'trends'],
      }
    );

    // --- 2. Tracked Applications in CareerOps ---
    applications.forEach((app) => {
      items.push({
        id: `app-${app.id}`,
        category: 'Target Job',
        title: `${app.role} @ ${app.company}`,
        subtitle: `${app.location || 'Remote'} • ${app.salaryRange || 'Disclosed in JD'} • Status: ${app.status}`,
        badge: typeof app.score === 'number' ? `★ ${app.score.toFixed(1)}/5.0` : 'Not Scored',
        badgeColor: typeof app.score === 'number' && app.score >= 4.0 ? '#4ade80' : '#94a3b8',
        icon: Briefcase,
        action: () => {
          setActiveJobId(app.id);
          onNavigate('career_ops');
          onClose();
          setToast?.(`Target job switched to: ${app.role} @ ${app.company}`);
        },
        keywords: [app.company, app.role, app.location || '', app.status, 'target', 'job'],
      });
    });

    // --- 3. Instant Actions & Controls ---
    items.push(
      {
        id: 'action-toggle-mic',
        category: 'Action',
        title: isRecording ? 'Mute / Stop Microphone' : 'Start Microphone Listening',
        subtitle: isRecording ? 'Currently listening to interview audio' : 'Begin live transcription',
        badge: isRecording ? 'Recording' : 'Idle',
        badgeColor: isRecording ? '#ef4444' : '#64748b',
        icon: Mic,
        action: () => {
          toggleRecording();
          onClose();
        },
        keywords: ['mic', 'record', 'audio', 'listen', 'stop', 'mute'],
      },
      {
        id: 'action-clear-teleprompter',
        category: 'Action',
        title: 'Reset & Clear Live Teleprompter',
        subtitle: 'Clears current transcript buffer and re-centers detection',
        icon: Zap,
        action: () => {
          clearAndResetToListen();
          onClose();
          setToast?.('Teleprompter transcript cleared.');
        },
        keywords: ['clear', 'reset', 'clean', 'transcript'],
      },
      {
        id: 'action-profile-wizard',
        category: 'Action',
        title: 'Open Candidate Profile Wizard',
        subtitle: 'Review 9-part canonical profile, work history, and skills',
        icon: User,
        action: () => {
          onClose();
          onOpenProfileWizard?.();
        },
        keywords: ['profile', 'wizard', 'cv', 'candidate', 'skills'],
      },
      {
        id: 'action-settings',
        category: 'Action',
        title: 'System Settings & AI Providers',
        subtitle: 'Configure Groq, OpenAI, Anthropic API keys and models',
        icon: Settings,
        action: () => {
          onClose();
          onOpenSettings?.();
        },
        keywords: ['settings', 'api', 'key', 'model', 'groq', 'provider'],
      },
      {
        id: 'action-sessions',
        category: 'Action',
        title: 'Interview Session History',
        subtitle: 'Review past mock and live interview recordings and transcripts',
        icon: Clock,
        action: () => {
          onClose();
          onOpenSessions?.();
        },
        keywords: ['sessions', 'history', 'recordings', 'past'],
      }
    );

    // --- 4. Demo Data Controls ---
    if (applications.length === 0 || !isDemoMode) {
      items.push({
        id: 'action-load-demo',
        category: 'CareerOps',
        title: 'Load Demo Applications (Alignerr, Datadog)',
        subtitle: 'Instantly populates realistic roles with pre-computed A-H fit scores and LaTeX CVs',
        badge: '⚡ Instant Sample',
        badgeColor: '#fb923c',
        icon: Sparkles,
        action: () => {
          enableDemoMode();
          onNavigate('career_ops');
          onClose();
          setToast?.('Loaded demo applications with complete A-H evaluations!');
        },
        keywords: ['demo', 'sample', 'example', 'populate', 'test'],
      });
    } else {
      items.push({
        id: 'action-clear-demo',
        category: 'CareerOps',
        title: 'Clear Demo Applications',
        subtitle: 'Removes demo items to keep your own genuine job pipeline clean',
        badge: 'Reset Pipeline',
        badgeColor: '#f87171',
        icon: X,
        action: () => {
          clearDemoData();
          onClose();
          setToast?.('Cleared demo applications.');
        },
        keywords: ['clear demo', 'remove demo', 'reset'],
      });
    }

    return items;
  }, [
    applications,
    isRecording,
    isDemoMode,
    onNavigate,
    onClose,
    onOpenSettings,
    onOpenProfileWizard,
    onOpenSessions,
    setActiveJobId,
    setToast,
    toggleRecording,
    clearAndResetToListen,
    enableDemoMode,
    clearDemoData,
  ]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const lower = query.toLowerCase();
    return allItems.filter((item) => {
      if (item.title.toLowerCase().includes(lower)) return true;
      if (item.subtitle && item.subtitle.toLowerCase().includes(lower)) return true;
      if (item.category.toLowerCase().includes(lower)) return true;
      if (item.keywords?.some((k) => k.toLowerCase().includes(lower))) return true;
      return false;
    });
  }, [allItems, query]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) {
          item.action();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const activeEl = listEl.querySelector(`[data-spotlight-idx="${selectedIndex}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(249, 115, 22, 0.4)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 35px rgba(249, 115, 22, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <Search size={18} color="#fb923c" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a screen, command, target job, or action... (↑ ↓ to navigate)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 7px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '11px',
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            <span>ESC</span>
          </div>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {filteredItems.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b' }}>
              <p style={{ margin: 0, fontSize: '13px' }}>No matches found for "{query}"</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px' }}>
                Try searching for "CareerOps", "Jobs", "Mic", "Settings", or "Teleprompter"
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  data-spotlight-idx={idx}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'linear-gradient(90deg, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0.05))'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(249, 115, 22, 0.4)'
                      : '1px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: isSelected
                          ? 'rgba(249, 115, 22, 0.25)'
                          : 'rgba(255, 255, 255, 0.05)',
                        border: isSelected
                          ? '1px solid rgba(249, 115, 22, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#fb923c' : '#94a3b8',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: isSelected ? '#ffffff' : '#e2e8f0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#64748b',
                      }}
                    >
                      {item.category}
                    </span>

                    {item.badge && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: item.badgeColor
                            ? `${item.badgeColor}22`
                            : 'rgba(249, 115, 22, 0.15)',
                          color: item.badgeColor || '#fb923c',
                          border: item.badgeColor
                            ? `1px solid ${item.badgeColor}44`
                            : '1px solid rgba(249, 115, 22, 0.3)',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}

                    {isSelected && <ArrowRight size={13} color="#fb923c" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(0, 0, 0, 0.2)',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>
              <strong style={{ color: '#94a3b8' }}>↑ ↓</strong> Navigate
            </span>
            <span>
              <strong style={{ color: '#94a3b8' }}>↵</strong> Select
            </span>
            <span>
              <strong style={{ color: '#94a3b8' }}>ESC</strong> Close
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={11} color="#fb923c" />
            <span style={{ color: '#fb923c', fontWeight: 600 }}>IAC Universal Spotlight</span>
          </div>
        </div>
      </div>
    </div>
  );
}
