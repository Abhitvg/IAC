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
import { Mic, MicOff, Settings, History } from 'lucide-react';
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
  } = useAppStore();

  const { activeView, setActiveView } = usePracticeStore();

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
        background: 'var(--bg-primary, #090d16)',
        color: 'var(--text-primary, #e8e6f0)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Application Bar with Accessibility Landmark */}
      <header
        role="banner"
        style={{
          height: '42px',
          background: 'var(--bg-secondary, #090d16)',
          borderBottom: '1px solid var(--border-default, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 50,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: 'var(--text-bright, #f8fafc)',
              letterSpacing: '-0.2px',
              margin: 0,
            }}
          >
            AI Interview{' '}
            <span style={{ color: 'var(--accent-secondary, #818cf8)' }}>Assistant</span>
          </h1>

          {/* Mode Switcher Segmented Control */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '2px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView('teleprompter')}
              style={{
                padding: '3px 10px',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: activeView === 'teleprompter' ? '#4f46e5' : 'transparent',
                color: activeView === 'teleprompter' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
            >
              🛡️ Live Copilot / Teleprompter
            </button>
            <button
              type="button"
              onClick={() => setActiveView('mock_gym')}
              style={{
                padding: '3px 10px',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: activeView === 'mock_gym' ? '#4f46e5' : 'transparent',
                color: activeView === 'mock_gym' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
            >
              🏋️ Mock Practice Gym
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '11px',
          }}
        >
          {/* Audio Recording / Dictation Button */}
          <button
            type="button"
            onClick={toggleRecording}
            aria-label={isRecording ? 'Stop Audio Recording' : 'Start Audio Recording'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: isRecording ? '#e11d48' : 'rgba(255, 255, 255, 0.08)',
              color: isRecording ? '#ffffff' : '#cbd5e1',
              border: isRecording ? '1px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
            <span>{isRecording ? 'Recording (Stop)' : 'Record Audio (R)'}</span>
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
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
            }}
          >
            <History size={13} />
            <span>Sessions</span>
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
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
            }}
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Main View Display: Dedicated Practice Gym */}
      <main
        role="main"
        aria-label="Application Workspace"
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
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
