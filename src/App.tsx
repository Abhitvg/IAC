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
    <div style={{ height: '100vh', width: '100vw', background: '#090d16', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top Application Bar */}
      <div
        style={{
          height: '42px',
          background: '#090d16',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 50,
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.2px' }}>
            AI Interview <span style={{ color: '#818cf8' }}>Practice Gym</span>
          </span>
          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)', fontWeight: 600 }}>
            Mock & Coaching Mode
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#64748b' }}>
          <span>Ready • Electron 33</span>
        </div>
      </div>

      {/* Main View Display: Dedicated Practice Gym */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <MockGymView />
      </div>

      {showOnboarding && <OnboardingModal />}
      {resumeModalOpen && <ResumeAndJobModal />}
      {settingsOpen && <SettingsPanel />}
      {sessionsOpen && <SessionsPanel />}
      <Toast />
    </div>
  );
}
