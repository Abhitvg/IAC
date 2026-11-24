import ResumeAndJobModal from './components/ResumeAndJobModal';
import React, { useEffect, useCallback, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import TeleprompterView from './components/teleprompter/TeleprompterView';
import { MockGymView } from './components/practice/MockGymView';
import { CareerOpsView } from './components/careerOps/CareerOpsView';
import SettingsPanel from './components/SettingsPanel';
import SessionsPanel from './components/SessionsPanel';
import OnboardingModal from './components/OnboardingModal';
import { CandidateProfileWizard } from './components/CandidateProfileWizard';
import Toast from './components/Toast';
import { InterviewEngine } from './services/InterviewEngine';
import { AppSidebar, AppNavId } from './screens/AppSidebar';
import { AppTopBar } from './screens/AppTopBar';
import { OverviewDashboardScreen } from './screens/OverviewDashboardScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { EvidenceVaultScreen } from './screens/EvidenceVaultScreen';
import { ResumeAndDocumentsScreen } from './screens/ResumeAndDocumentsScreen';
import { KnowledgeBaseScreen } from './screens/KnowledgeBaseScreen';
import { InterviewHistoryScreen } from './screens/InterviewHistoryScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { InterviewPreparationScreen } from './screens/InterviewPreparationScreen';
import { CommandSpotlightModal } from './components/spotlight/CommandSpotlightModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
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
    setSettingsOpen,
    setSessionsOpen,
    setProfileWizardOpen,
    isRecording,
    isGenerating,
    isInterviewFocusMode,
    toggleInterviewFocusMode,
  } = useAppStore();

  const [currentNav, setCurrentNav] = useState<AppNavId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

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

  // Keyboard navigation shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"], [role="textbox"]')
      ) {
        return;
      }
      if (settingsOpen || sessionsOpen) return;

      // Keep the app-level focus toggle available in every workspace.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.code === 'KeyF' || e.key.toLowerCase() === 'f')
      ) {
        e.preventDefault();
        toggleInterviewFocusMode();
        return;
      }

      // The live interview view owns its contextual shortcuts (including Cmd/Ctrl+K
      // conversation search and Cmd/Ctrl+1/2/3 response modes). Do not let the shell
      // also consume those keystrokes as navigation or command-spotlight actions.
      if (currentNav === 'teleprompter') return;

      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setCurrentNav('overview');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setCurrentNav('preparation');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setCurrentNav('teleprompter');
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }

      // Preserve native browser/OS shortcuts such as Cmd+C, Ctrl+R, and Alt+Tab.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
    [
      settingsOpen,
      sessionsOpen,
      currentNav,
      isRecording,
      isGenerating,
      toggleRecording,
      analyzeTranscript,
      copyAnswer,
      clearAndResetToListen,
      toggleInterviewFocusMode,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const showOnboarding = settings && settings.hasCompletedOnboarding === false;

  const navTitles: Record<AppNavId, string> = {
    overview: 'Candidate Overview',
    preparation: 'Interview Preparation',
    teleprompter: 'Live Interview Workspace',
    mock_gym: 'Practice Studio Gym',
    career_ops: 'CareerOps Job Engine',
    projects: 'Candidate Projects',
    evidence_vault: 'Evidence Vault',
    resume_docs: 'Resume & Documents',
    knowledge_base: 'Knowledge Base',
    history: 'Interview History',
    analytics: 'Performance Analytics',
    settings: 'Settings',
  };

  // Determine if full-screen distraction-free mode is enabled for live teleprompter
  const isDistractionFreeTeleprompter = currentNav === 'teleprompter' && isInterviewFocusMode;

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: currentNav === 'teleprompter' ? 'transparent' : '#0D0F14',
        color: '#F3F4F8',
        overflow: 'hidden',
        display: 'flex',
      }}
    >
      {/* Primary Sidebar (Hidden in Distraction-Free Teleprompter Focus) */}
      {!isDistractionFreeTeleprompter && (
        <AppSidebar
          currentNav={currentNav}
          onSelectNav={setCurrentNav}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* Main Content Region */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: currentNav === 'teleprompter' ? 'transparent' : '#0D0F14',
        }}
      >
        {/* Top Header Bar */}
        {!isDistractionFreeTeleprompter && (
          <AppTopBar
            currentTitle={navTitles[currentNav] || 'Interview Assistant'}
            onOpenSpotlight={() => setSpotlightOpen(true)}
          />
        )}

        {/* View Routing Region */}
        <main
          role="main"
          aria-label="Application Workspace"
          style={{
            flex: 1,
            overflowY: currentNav === 'teleprompter' ? 'hidden' : 'auto',
            position: 'relative',
            background: 'transparent',
          }}
        >
          {currentNav === 'overview' && (
            <OverviewDashboardScreen onNavigate={(v) => setCurrentNav(v)} />
          )}
          {currentNav === 'preparation' && (
            <InterviewPreparationScreen onLaunchLive={() => setCurrentNav('teleprompter')} />
          )}
          {currentNav === 'teleprompter' && <TeleprompterView />}
          {currentNav === 'mock_gym' && <MockGymView />}
          {currentNav === 'career_ops' && (
            <ErrorBoundary fallbackTitle="Career Ops Studio">
              <CareerOpsView />
            </ErrorBoundary>
          )}
          {currentNav === 'projects' && <ProjectsScreen />}
          {currentNav === 'evidence_vault' && <EvidenceVaultScreen />}
          {currentNav === 'resume_docs' && <ResumeAndDocumentsScreen />}
          {currentNav === 'knowledge_base' && <KnowledgeBaseScreen />}
          {currentNav === 'history' && <InterviewHistoryScreen />}
          {currentNav === 'analytics' && <AnalyticsScreen />}
        </main>
      </div>

      {showOnboarding && <OnboardingModal />}
      {resumeModalOpen && <ResumeAndJobModal />}
      <CandidateProfileWizard />
      {settingsOpen && <SettingsPanel />}
      {sessionsOpen && <SessionsPanel />}
      <CommandSpotlightModal
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        onNavigate={(v) => setCurrentNav(v)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenProfileWizard={() => setProfileWizardOpen(true)}
        onOpenSessions={() => setSessionsOpen(true)}
      />
      <Toast />
    </div>
  );
}
