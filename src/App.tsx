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
import { Mic, Settings, History, Volume2, VolumeX } from 'lucide-react';
import { isSoundMuted, toggleSoundMuted } from './utils/soundEffects';
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
    isInterviewFocusMode,
    toggleInterviewFocusMode,
  } = useAppStore();

  const {
    activeView,
    setActiveView,
    sessionHistory,
    storyBank,
    topicMasteries,
  } = usePracticeStore();

  const [soundMuted, setSoundMutedState] = React.useState(() => isSoundMuted());
  const handleToggleSound = () => {
    const next = toggleSoundMuted();
    setSoundMutedState(next);
  };


  const totalRounds = sessionHistory?.length || 0;
  const storiesCount = storyBank?.length || 0;
  const avgMastery =
    topicMasteries && topicMasteries.length > 0
      ? Math.round(
          topicMasteries.reduce((acc, t) => acc + (t.masteryScore || 0), 0) /
            topicMasteries.length
        )
      : 0;
  const storyCoveragePct = Math.min(100, Math.round((storiesCount / 5) * 100));
  const roundsScorePct = Math.min(100, Math.round((totalRounds / 5) * 100));
  const readinessScore = Math.min(
    100,
    Math.round(storyCoveragePct * 0.3 + avgMastery * 0.4 + roundsScorePct * 0.3)
  );
  const practiceStreak = totalRounds > 0 ? Math.min(Math.max(totalRounds, 1), 14) : 0;

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

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === 'KeyF' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        toggleInterviewFocusMode();
        return;
      }

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
      {/* Top Application Bar with Accessibility Landmark (Hidden in Interview Focus Mode) */}
      {!isInterviewFocusMode && (
      <header
        role="banner"
        className="px-3 sm:px-5"
        style={{
          minHeight: "44px",
          background:
            activeView === "teleprompter"
              ? `rgba(9, 13, 22, ${Math.min(0.85, windowOpacity * 0.75 + 0.2)})`
              : "rgba(9, 13, 22, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 2px 16px rgba(0, 0, 0, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          zIndex: 50,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          {/* Logo Brand Mark */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <div
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "7px",
                background: "linear-gradient(135deg, #4f46e5, #7c3aed, #c084fc)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                boxShadow: "0 0 12px rgba(99, 102, 241, 0.45)",
              }}
            >
              ⚡
            </div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs sm:text-[13px] font-black text-slate-100 tracking-tight m-0 hidden md:inline">
                Interview<span style={{ color: "#a5b4fc" }}>Pro</span>
              </h1>
              <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                AI Copilot
              </span>
            </div>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div
            style={{
              display: "flex",
              background: "rgba(0, 0, 0, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "8px",
              padding: "2px",
              gap: "2px",
              boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.3)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView("teleprompter")}
              title="Live Copilot / Teleprompter Mode (OCR, Audio Transcription, Real-time Answers)"
              style={{
                padding: "4px 9px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                border:
                  activeView === "teleprompter"
                    ? "1px solid rgba(129, 140, 248, 0.5)"
                    : "1px solid transparent",
                background:
                  activeView === "teleprompter"
                    ? "linear-gradient(135deg, #4f46e5, #6366f1)"
                    : "transparent",
                color: activeView === "teleprompter" ? "#ffffff" : "#94a3b8",
                boxShadow:
                  activeView === "teleprompter" ? "0 2px 10px rgba(79, 70, 229, 0.45)" : "none",
                transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                whiteSpace: "nowrap",
              }}
            >
              <span className="hidden lg:inline">🛡️ Live Copilot</span>
              <span className="hidden sm:inline lg:hidden">🛡️ Copilot</span>
              <span className="sm:hidden">🛡️</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("mock_gym")}
              title="Mock Practice Gym (Pressure Simulations, Spaced Drills, STAR Story Bank)"
              style={{
                padding: "4px 9px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                border:
                  activeView === "mock_gym"
                    ? "1px solid rgba(129, 140, 248, 0.5)"
                    : "1px solid transparent",
                background:
                  activeView === "mock_gym"
                    ? "linear-gradient(135deg, #4f46e5, #6366f1)"
                    : "transparent",
                color: activeView === "mock_gym" ? "#ffffff" : "#94a3b8",
                boxShadow: activeView === "mock_gym" ? "0 2px 10px rgba(79, 70, 229, 0.45)" : "none",
                transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                whiteSpace: "nowrap",
              }}
            >
              <span className="hidden lg:inline">🏋️ Practice Gym</span>
              <span className="hidden sm:inline lg:hidden">🏋️ Gym</span>
              <span className="sm:hidden">🏋️</span>
            </button>
          </div>

          {/* Readiness Badges in Header */}
          {practiceStreak > 0 && (
            <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-sm">
              <span>🔥</span>
              <span>{practiceStreak}d Streak</span>
            </span>
          )}
          {readinessScore > 0 && (
            <span className="hidden 2xl:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 shadow-sm">
              <span>🎯</span>
              <span>{readinessScore}% Ready</span>
            </span>
          )}
        </div>

        {/* Right Action Buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            flexShrink: 0,
          }}
        >
          {/* Audio Recording Button with Beacon */}
          <button
            type="button"
            onClick={toggleRecording}
            aria-label={isRecording ? "Stop Audio Recording" : "Start Audio Recording"}
            title="Toggle Audio Recording (Shortcut: R)"
            className="card-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 9px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              background: isRecording
                ? "linear-gradient(135deg, #e11d48, #be123c)"
                : "rgba(255, 255, 255, 0.06)",
              color: isRecording ? "#ffffff" : "#cbd5e1",
              border: isRecording ? "1px solid #f43f5e" : "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: isRecording ? "0 0 14px rgba(225, 29, 72, 0.45)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {isRecording ? (
              <span className="beacon-recording" />
            ) : (
              <Mic size={13} style={{ color: "#cbd5e1" }} />
            )}
            <span className="hidden md:inline">{isRecording ? "Recording Active (R)" : "Record Audio (R)"}</span>
            <span className="hidden sm:inline md:hidden">{isRecording ? "Recording" : "Record"}</span>
            <span className="sm:hidden">{isRecording ? "Rec" : "Mic"}</span>
          </button>

          {/* Past Sessions History Button */}
          <button
            type="button"
            onClick={() => setSessionsOpen(true)}
            aria-label="View Past Practice Sessions"
            title="Past Sessions History"
            className="card-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 9px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 600,
              background: "rgba(255, 255, 255, 0.05)",
              color: "#94a3b8",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              cursor: "pointer",
            }}
          >
            <History size={13} />
            <span className="hidden sm:inline">Sessions</span>
            {totalRounds > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-500/30 text-indigo-200">
                {totalRounds}
              </span>
            )}
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open Settings"
            title="Configure Microphone, Models & Privacy"
            className="card-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 9px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 600,
              background: "rgba(255, 255, 255, 0.05)",
              color: "#94a3b8",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              cursor: "pointer",
            }}
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Sound FX Mute/Unmute Button */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundMuted ? "Unmute Practice Sound Effects" : "Mute Practice Sound Effects"}
            title={soundMuted ? "Sound Effects Muted (Click to Unmute)" : "Sound Effects Active (Click to Mute)"}
            className="card-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "28px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 600,
              background: soundMuted ? "rgba(239, 68, 68, 0.12)" : "rgba(255, 255, 255, 0.05)",
              color: soundMuted ? "#f87171" : "#94a3b8",
              border: soundMuted ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(255, 255, 255, 0.1)",
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            {soundMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        </div>
      </header>
      )}

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
