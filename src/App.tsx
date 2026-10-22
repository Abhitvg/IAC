import ResumeAndJobModal from './components/ResumeAndJobModal';
import React, { useEffect, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import { MockGymView } from './components/practice/MockGymView';
import SettingsPanel from './components/SettingsPanel';
import SessionsPanel from './components/SessionsPanel';
import OnboardingModal from './components/OnboardingModal';
import Toast from './components/Toast';
import { InterviewEngine } from './services/InterviewEngine';
import './styles/index.css';

export default function App() {
  const {
    settings,
    loadSettings,
    loadSessionHistory,
    toggleRecording,
    analyzeTranscript,
    copyAnswer,
    settingsOpen,
    sessionsOpen,
    resumeModalOpen,
    isRecording,
    isGenerating,
  } = useAppStore();

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
    [settingsOpen, sessionsOpen, isRecording, isGenerating]
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <span style={{ color: 'var(--accent-secondary, #818cf8)' }}>Practice Gym</span>
          </h1>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--accent-secondary, #a5b4fc)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontWeight: 600,
            }}
          >
            Mock &amp; Coaching Mode
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '11px',
            color: 'var(--text-muted, #64748b)',
          }}
        >
          <span>Ready • Electron 33</span>
        </div>
      </header>

      {/* Main View Display: Dedicated Practice Gym */}
      <main
        role="main"
        aria-label="Mock Practice Gym Workspace"
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
      >
        <MockGymView />
      </main>

      {showOnboarding && <OnboardingModal />}
      {resumeModalOpen && <ResumeAndJobModal />}
      {settingsOpen && <SettingsPanel />}
      {sessionsOpen && <SessionsPanel />}
      <Toast />
    </div>
  );
}
