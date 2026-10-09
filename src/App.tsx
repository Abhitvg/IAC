import React, { useEffect, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import TitleBar from './components/TitleBar';
import InterviewWorkspace from './components/interview/InterviewWorkspace';
import SettingsPanel from './components/SettingsPanel';
import SessionsPanel from './components/SessionsPanel';
import Toast from './components/Toast';
import './styles/index.css';

export default function App() {
  const {
    loadSettings,
    loadSessionHistory,
    toggleRecording,
    analyzeTranscript,
    copyAnswer,
    setResponseMode,
    regenerateAnswer,
    settingsOpen,
    sessionsOpen,
    isRecording,
    isGenerating,
  } = useAppStore();

  useEffect(() => {
    loadSettings();
    loadSessionHistory();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
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

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0f' }}>
      <TitleBar />
      <InterviewWorkspace />
      {settingsOpen && <SettingsPanel />}
      {sessionsOpen && <SessionsPanel />}
      <Toast />
    </div>
  );
}