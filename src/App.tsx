import ResumeAndJobModal from './components/ResumeAndJobModal';
import React, { useEffect, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import TeleprompterView from './components/teleprompter/TeleprompterView';
import { MockGymView } from './components/practice/MockGymView';
import { usePracticeStore } from './store/usePracticeStore';
import SettingsPanel from './components/SettingsPanel';
import SessionsPanel from './components/SessionsPanel';
import OnboardingModal from './components/OnboardingModal';
import Toast from './components/Toast';
import { InterviewEngine } from './services/InterviewEngine';
import { Mic, Settings, History } from 'lucide-react';
import './styles/index.css';

export default function App() {
  const {
    settings,
    loadSettings,
    loadSessionHistory,
    toggleRecording,
    analyzeTranscript,
    copyAnswer,
    clearAndResetToListen,
    settingsOpen,
    sessionsOpen,
    resumeModalOpen,
    isRecording,
    isGenerating,
    setSettingsOpen,
    setSessionsOpen,
    windowOpacity,
  } = useAppStore();

  const { activeView, setActiveView } = usePracticeStore();

  // Synchronize native Electron window opacity between translucent teleprompter overlay and solid practice gym
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.setWindowOpacity) {
      if (activeView === 'teleprompter') {
        window.electronAPI.setWindowOpacity(windowOpacity);
      } else {
        window.electronAPI.setWindowOpacity(1.0);
      }
    }
  }, [activeView, windowOpacity]);

  useEffect(() => {
    loadSettings();
    loadSessionHistory();
    const unsub = window.electronAPI?.onBrowserContext?.((data) => {
      if (data && data.content) {
        InterviewEngine.handleEvent({
          type: 'QUESTION_DETECTED',
          text: `[Problem Statement from ${data.source || 'browser'}]:\n${data.content.trim()}`,
        });
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  // Synchronize theme with DOM root and body
  useEffect(() => {
    const activeTheme = settings?.theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', activeTheme);
    document.body.className = `${activeTheme}-theme`;
  }, [settings?.theme]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      if (settingsOpen || sessionsOpen) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        clearAndResetToListen();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          e.preventDefault();
          toggleRecording();
          break;
        case 'a':
          e.preventDefault();
          if (!isRecording && !isGenerating) analyzeTranscript();
          break;
        case 'c':
          e.preventDefault();
          copyAnswer();
          break;
      }
    },
    [settingsOpen, sessionsOpen, isRecording, isGenerating, clearAndResetToListen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const showOnboarding = settings && settings.hasCompletedOnboarding === false;

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: activeView === 'teleprompter' ? 'transparent' : 'var(--bg-primary, #090d16)',
        color: 'var(--text-primary, #e8e6f0)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Application Bar with Accessibility Landmark */}
      <header
        role="banner"
        className="px-2 sm:px-4"
        style={{
          minHeight: '44px',
          background:
            activeView === 'teleprompter'
              ? `rgba(9, 13, 22, ${Math.min(0.85, windowOpacity * 0.75 + 0.2)})`
              : 'rgba(9, 13, 22, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          zIndex: 50,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)',
              }}
            >
              ⚡
            </div>
            <h1
              className="text-xs sm:text-[13px] font-extrabold text-slate-100 tracking-tight m-0 hidden md:inline"
            >
              AI Interview <span style={{ color: '#818cf8' }}>Assistant</span>
            </h1>
            <h1
              className="text-xs font-bold text-slate-100 tracking-tight m-0 hidden sm:inline md:hidden"
            >
              AI <span style={{ color: '#818cf8' }}>Copilot</span>
            </h1>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '2px',
              gap: '2px',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.3)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView('teleprompter')}
              title="Live Copilot / Teleprompter Mode"
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border:
                  activeView === 'teleprompter'
                    ? '1px solid rgba(129, 140, 248, 0.4)'
                    : '1px solid transparent',
                background:
                  activeView === 'teleprompter'
                    ? 'linear-gradient(135deg, #4f46e5, #6366f1)'
                    : 'transparent',
                color: activeView === 'teleprompter' ? '#ffffff' : '#94a3b8',
                boxShadow:
                  activeView === 'teleprompter' ? '0 2px 8px rgba(79, 70, 229, 0.4)' : 'none',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="hidden lg:inline">🛡️ Live Copilot / Teleprompter</span>
              <span className="hidden sm:inline lg:hidden">🛡️ Copilot</span>
              <span className="sm:hidden">🛡️</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('mock_gym')}
              title="Mock Practice Gym Mode"
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border:
                  activeView === 'mock_gym'
                    ? '1px solid rgba(129, 140, 248, 0.4)'
                    : '1px solid transparent',
                background:
                  activeView === 'mock_gym'
                    ? 'linear-gradient(135deg, #4f46e5, #6366f1)'
                    : 'transparent',
                color: activeView === 'mock_gym' ? '#ffffff' : '#94a3b8',
                boxShadow: activeView === 'mock_gym' ? '0 2px 8px rgba(79, 70, 229, 0.4)' : 'none',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="hidden lg:inline">🏋️ Mock Practice Gym</span>
              <span className="hidden sm:inline lg:hidden">🏋️ Gym</span>
              <span className="sm:hidden">🏋️</span>
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            flexShrink: 0,
          }}
        >
          {/* Audio Recording / Dictation Button with Beacon */}
          <button
            type="button"
            onClick={toggleRecording}
            aria-label={isRecording ? 'Stop Audio Recording' : 'Start Audio Recording'}
            title="Toggle Audio Recording (Shortcut: R)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: isRecording
                ? 'linear-gradient(135deg, #e11d48, #be123c)'
                : 'rgba(255, 255, 255, 0.06)',
              color: isRecording ? '#ffffff' : '#cbd5e1',
              border: isRecording ? '1px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: isRecording ? '0 0 14px rgba(225, 29, 72, 0.45)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {isRecording ? (
              <span className="beacon-recording" />
            ) : (
              <Mic size={13} style={{ color: '#cbd5e1' }} />
            )}
            <span className="hidden md:inline">{isRecording ? 'Recording Active (R)' : 'Record Audio (R)'}</span>
            <span className="hidden sm:inline md:hidden">{isRecording ? 'Recording' : 'Record'}</span>
            <span className="sm:hidden">{isRecording ? 'Rec' : 'Mic'}</span>
          </button>

          {/* Past Sessions History Button */}
          <button
            type="button"
            onClick={() => setSessionsOpen(true)}
            aria-label="View Past Practice Sessions"
            title="Past Sessions History"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <History size={13} />
            <span className="hidden sm:inline">Sessions</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open Settings"
            title="Configure Microphone, Models & Privacy"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Main View Display: Dedicated Practice Gym */}
      <main
        role="main"
        aria-label="Application Workspace"
        style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'transparent' }}
      >
        {activeView === 'teleprompter' ? <TeleprompterView /> : <MockGymView />}
      </main>

      {showOnboarding && <OnboardingModal />}
      {resumeModalOpen && <ResumeAndJobModal />}
      {settingsOpen && <SettingsPanel />}
      {sessionsOpen && <SessionsPanel />}
      <Toast />
    </div>
  );
}
