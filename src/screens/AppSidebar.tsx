import React from 'react';
import {
  Sparkles,
  Layers,
  Video,
  Dumbbell,
  FolderGit2,
  ShieldCheck,
  FileText,
  BookOpen,
  History,
  BarChart3,
  Settings,
  HelpCircle,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  User,
  Mic,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { usePracticeStore } from '../store/usePracticeStore';

export type AppNavId =
  | 'overview'
  | 'preparation'
  | 'teleprompter'
  | 'mock_gym'
  | 'career_ops'
  | 'projects'
  | 'evidence_vault'
  | 'resume_docs'
  | 'knowledge_base'
  | 'history'
  | 'analytics'
  | 'settings';

interface AppSidebarProps {
  currentNav: AppNavId;
  onSelectNav: (id: AppNavId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentNav,
  onSelectNav,
  collapsed,
  onToggleCollapse,
}) => {
  const { isRecording, toggleRecording, setSettingsOpen } = useAppStore();

  const navSections = [
    {
      title: 'MAIN',
      items: [
        { id: 'overview' as AppNavId, label: 'Overview', icon: <Layers size={16} /> },
        { id: 'preparation' as AppNavId, label: 'Interview Prep', icon: <Sparkles size={16} /> },
        { id: 'teleprompter' as AppNavId, label: 'Live Interview', icon: <Video size={16} />, badge: 'LIVE' },
        { id: 'mock_gym' as AppNavId, label: 'Practice Studio', icon: <Dumbbell size={16} /> },
        { id: 'career_ops' as AppNavId, label: 'CareerOps', icon: <Briefcase size={16} /> },
      ],
    },
    {
      title: 'CANDIDATE INTELLIGENCE',
      items: [
        { id: 'projects' as AppNavId, label: 'Projects', icon: <FolderGit2 size={16} /> },
        { id: 'evidence_vault' as AppNavId, label: 'Evidence Vault', icon: <ShieldCheck size={16} />, badge: 'ZERO-TRUST' },
        { id: 'resume_docs' as AppNavId, label: 'Resume & Documents', icon: <FileText size={16} /> },
        { id: 'knowledge_base' as AppNavId, label: 'Knowledge Base', icon: <BookOpen size={16} /> },
      ],
    },
    {
      title: 'INSIGHTS',
      items: [
        { id: 'history' as AppNavId, label: 'Interview History', icon: <History size={16} /> },
        { id: 'analytics' as AppNavId, label: 'Analytics', icon: <BarChart3 size={16} /> },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'settings' as AppNavId, label: 'Settings', icon: <Settings size={16} /> },
      ],
    },
  ];

  return (
    <aside
      aria-label="Primary Navigation"
      style={{
        width: collapsed ? '72px' : '240px',
        background: '#11141B',
        borderRight: '1px solid #292E3A',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
        zIndex: 40,
        flexShrink: 0,
      }}
    >
      {/* Top Branding */}
      <div>
        <div
          style={{
            height: '52px',
            padding: collapsed ? '0' : '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid #292E3A',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #8B7CFF, #A99DFF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0D0F14',
                fontWeight: 800,
                fontSize: '14px',
                boxShadow: '0 0 12px rgba(139, 124, 255, 0.4)',
              }}
            >
              ⚡
            </div>
            {!collapsed && (
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#F3F4F8', letterSpacing: '-0.02em' }}>
                IAC <span style={{ color: '#8B7CFF', fontWeight: 500, fontSize: '11px' }}>Copilot</span>
              </span>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse Navigation Sidebar"
              style={{
                background: 'none',
                border: 'none',
                color: '#9299AA',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
              }}
              className="hover:text-[#F3F4F8] hover:bg-[#1E2330]"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {navSections.map((sec) => (
            <div key={sec.title}>
              {!collapsed && (
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#9299AA',
                    letterSpacing: '0.06em',
                    padding: '0 8px 6px 8px',
                  }}
                >
                  {sec.title}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {sec.items.map((item) => {
                  const isActive = currentNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === 'settings') {
                          setSettingsOpen(true);
                        } else {
                          onSelectNav(item.id);
                        }
                      }}
                      title={collapsed ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: collapsed ? 'center' : 'space-between',
                        padding: collapsed ? '10px 0' : '8px 10px',
                        borderRadius: '6px',
                        background: isActive ? '#1E2330' : 'transparent',
                        color: isActive ? '#F3F4F8' : '#9299AA',
                        border: isActive ? '1px solid #292E3A' : '1px solid transparent',
                        fontSize: '12px',
                        fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease',
                      }}
                      className={isActive ? '' : 'hover:bg-[#171B24] hover:text-[#F3F4F8]'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: isActive ? '#8B7CFF' : '#9299AA' }}>{item.icon}</span>
                        {!collapsed && <span>{item.label}</span>}
                      </div>

                      {!collapsed && item.badge && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: item.badge === 'LIVE' ? 'rgba(241, 111, 120, 0.2)' : 'rgba(139, 124, 255, 0.15)',
                            color: item.badge === 'LIVE' ? '#F16F78' : '#8B7CFF',
                            border: `1px solid ${item.badge === 'LIVE' ? 'rgba(241, 111, 120, 0.3)' : 'rgba(139, 124, 255, 0.3)'}`,
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer User / Collapse Control */}
      <div
        style={{
          padding: '12px 8px',
          borderTop: '1px solid #292E3A',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand Sidebar"
            style={{
              background: 'none',
              border: 'none',
              color: '#9299AA',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              justifyContent: 'center',
            }}
            className="hover:text-[#F3F4F8]"
          >
            <ChevronRight size={16} />
          </button>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: '6px',
              background: '#171B24',
              border: '1px solid #292E3A',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#1E2330',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8B7CFF',
                  fontSize: '11px',
                }}
              >
                <User size={12} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#F3F4F8' }}>Candidate</span>
            </div>
            <span style={{ fontSize: '10px', color: '#35C991', fontWeight: 600 }}>Active</span>
          </div>
        )}
      </div>
    </aside>
  );
};

