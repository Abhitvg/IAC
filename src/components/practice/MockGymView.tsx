import { playRoundStartChime } from '../../utils/soundEffects';
import React, { useState } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { MockRoundType, InterviewPersona, InterviewPressure } from '../../services/practice/types';
import { CurriculumCatalogService } from '../../data/curriculum/CurriculumCatalog';
import { MockPressureRoom } from './MockPressureRoom';
import { StoryBankView } from './StoryBankView';
import { SpacedRepetitionView } from './SpacedRepetitionView';
import { CompanyPrepView } from './CompanyPrepView';
import { DeliveryTrendsView } from './DeliveryTrendsView';
import { FeedbackImportView } from './FeedbackImportView';
import { WeaknessMapView } from './WeaknessMapView';
import { ExplainerDrillView } from './ExplainerDrillView';
import { ProgressView } from './ProgressView';

export const MockGymView: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeSession,
    startMockSession,
    sessionHistory,
    storyBank,
    topicMasteries,
  } = usePracticeStore();

  const totalRounds = sessionHistory?.length || 0;
  const storiesCount = storyBank?.length || 0;
  const avgMastery =
    topicMasteries && topicMasteries.length > 0
      ? Math.round(
          topicMasteries.reduce((acc, t) => acc + (t.masteryScore || 0), 0) /
            topicMasteries.length
        )
      : 0;

  const practiceStreak = totalRounds > 0 ? Math.min(Math.max(totalRounds, 1), 14) : 0;
  const storyCoveragePct = Math.min(100, Math.round((storiesCount / 5) * 100));
  const roundsScorePct = Math.min(100, Math.round((totalRounds / 5) * 100));
  const readinessScore = Math.min(
    100,
    Math.round(storyCoveragePct * 0.3 + avgMastery * 0.4 + roundsScorePct * 0.3)
  );

  const isReturningUser = totalRounds > 0 || storiesCount > 0;

  const [selectedPersona, setSelectedPersona] = useState<InterviewPersona>('strict_big_tech');
  const [selectedPressure, setSelectedPressure] = useState<InterviewPressure>('normal');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('intermediate');
  const [interruptionEnabled, setInterruptionEnabled] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);

  const catalogTopics = CurriculumCatalogService.getInstance().getAllTopics();

  const handleLaunch = (roundType: MockRoundType) => {
    try { playRoundStartChime(); } catch (_e) {}
    startMockSession(
      roundType,
      selectedPersona,
      interruptionEnabled,
      selectedPressure,
      selectedTopicId !== 'all' ? selectedTopicId : undefined,
      selectedDifficulty
    );
    setShowLauncher(false);
  };

  const navTabs = [
    { id: 'arena', label: 'Mock Arena', icon: '⚔️' },
    { id: 'story_bank', label: 'Story Bank (STAR)', icon: '📖' },
    { id: 'spaced_drills', label: 'Spaced Drills', icon: '🔄' },
    { id: 'company_prep', label: 'Company Prep', icon: '🏢' },
    { id: 'delivery_trends', label: 'Delivery Trends', icon: '📈' },
    { id: 'feedback', label: 'Import Feedback', icon: '📥' },
    { id: 'weakness_map', label: 'Weakness Map', icon: '🎯' },
    { id: 'explainer_drill', label: '90s Drill', icon: '⚡' },
    { id: 'progress', label: 'Progress & Export', icon: '📊' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sub-Header Navigation */}
      <div className="px-3 sm:px-5 py-2 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-4 shrink-0 z-10">
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 scroll-smooth w-full md:w-auto"
          role="tablist"
          aria-label="Mock Practice Sections"
        >
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                role="tab"
                aria-selected={isActive}
                aria-controls={'tabpanel-' + tab.id}
                id={'tab-' + tab.id}
                className={
                  'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 shrink-0 ' +
                  (isActive
                    ? 'tab-active-indicator bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80')
                }
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Controls: Pressure Selector, Interruption Toggle, Start/Active Button */}
        <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 w-full md:w-auto">
          {practiceStreak > 0 && (
            <div
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 font-bold shrink-0"
              title="Consecutive practice days logged"
            >
              <span>🔥</span>
              <span>{practiceStreak}d Streak</span>
            </div>
          )}
          {/* Segmented Pressure Selector */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-0.5 text-xs">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 pl-1.5 sm:pl-2 pr-1">Pressure:</span>
            {(['low', 'normal', 'high'] as InterviewPressure[]).map((p) => {
              const isSelected = selectedPressure === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPressure(p)}
                  className={
                    'px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold rounded-md capitalize transition ' +
                    (isSelected
                      ? p === 'high'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : p === 'normal'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50')
                  }
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Pressure Interruptions Toggle */}
          <button
            type="button"
            onClick={() => setInterruptionEnabled(!interruptionEnabled)}
            className={
              'flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg border text-xs font-semibold transition shrink-0 ' +
              (interruptionEnabled
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700')
            }
            title="Randomly injects mid-answer follow-ups and challenges to test composure under pressure"
          >
            <span
              className={
                'w-2 h-2 rounded-full ' +
                (interruptionEnabled ? 'bg-amber-400 animate-pulse' : 'bg-slate-600')
              }
            />
            <span className="hidden sm:inline">Interruptions</span>
            <span className="sm:hidden">Probes</span>
          </button>

          {/* Action Button: Jump to Active Round or Start New Round */}
          {activeSession && activeSession.isActive ? (
            <button
              type="button"
              onClick={() => setActiveTab('arena')}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 rounded-lg text-xs font-bold transition shadow-sm whitespace-nowrap shrink-0"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="hidden sm:inline">In Session ({activeSession.persona.replace(/_/g, ' ')})</span>
              <span className="sm:hidden">In Session</span>
            </button>
          ) : (
            <button
              onClick={() => setShowLauncher(true)}
              className="flex items-center gap-1 px-3 sm:px-3.5 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-500/20 transition active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <span>⚡</span>
              <span>Start Round</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        key={activeTab}
        className="flex-1 overflow-y-auto p-3 sm:p-6 max-w-6xl mx-auto w-full animate-view-fade"
        role="tabpanel"
        id={'tabpanel-' + activeTab}
        aria-labelledby={'tab-' + activeTab}
      >
        {activeTab === 'arena' &&
          (activeSession ? (
            <MockPressureRoom />
          ) : (
            <div className="space-y-6">
              {/* Hero Banner */}
              <div className="relative overflow-hidden p-5 sm:p-8 bg-gradient-to-br from-indigo-950/80 via-slate-900/95 to-purple-950/50 border border-indigo-500/30 rounded-3xl shadow-2xl space-y-4">
                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-wrap items-center gap-2">
                  {isReturningUser ? (
                    <>
                      <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 shadow-sm">
                        <span>🔥</span>
                        <span>{practiceStreak}-Day Streak</span>
                      </span>
                      <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5 shadow-sm">
                        <span>🎯</span>
                        <span>{readinessScore}% Readiness Score</span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-300 font-medium ml-auto">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {totalRounds} Round{totalRounds === 1 ? "" : "s"} Logged
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        Evidence-Based Interview Practice Gym
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        TTS Audio Ready
                      </span>
                    </>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight tracking-tight">
                  {isReturningUser ? "Welcome back, Engineer." : "Perform Under Real Pressure."}
                </h1>

                <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                  {isReturningUser
                    ? "Consistent deliberate practice compounds into interview fluency. Continue with your scheduled drills, simulate real interruptions, and track quantitative rubric scores."
                    : "Real interviews are decided in the second and third question. Train against an AI interviewer with visible countdown timers, realistic notetaking pauses, mid-answer interruptions, and strict rubric evidence."}
                </p>

                {/* Quick Presets Grid with Differentiated Vibrant Accents */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {/* Rehearsal */}
                  <button
                    onClick={() => handleLaunch("dress_rehearsal")}
                    className="card-interactive drill-card-rehearsal p-4 rounded-2xl text-left shadow-lg relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-lg">🚀</span>
                      <span className="px-2 py-0.5 bg-black/40 text-[10px] font-mono font-bold rounded text-indigo-200 border border-indigo-400/30">
                        45m · 5 Phases
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-indigo-200 transition">
                      Full Dress Rehearsal
                    </div>
                    <div className="text-[11px] text-indigo-100/80 mt-0.5 leading-snug">
                      Icebreaker, DSA, System Design, STAR &amp; Q&amp;A
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] text-indigo-300 font-semibold">
                      <span>✨</span>
                      <span>Full-loop simulation</span>
                    </div>
                  </button>

                  {/* Adaptive Loop */}
                  <button
                    onClick={() => handleLaunch("adaptive_loop")}
                    className="card-interactive drill-card-rehearsal p-4 rounded-2xl text-left shadow-lg relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-lg">🧠</span>
                      <span className="px-2 py-0.5 bg-black/40 text-[10px] font-mono font-bold rounded text-purple-200 border border-purple-400/30">
                        45m · CIU DAG
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-purple-200 transition">
                      Adaptive Technical Loop
                    </div>
                    <div className="text-[11px] text-purple-100/80 mt-0.5 leading-snug">
                      Dynamic difficulty, DAG traversal, and targeted probes
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] text-purple-300 font-semibold">
                      <span>⚡</span>
                      <span>Evidence-guided progression</span>
                    </div>
                  </button>

                  {/* DSA */}
                  <button
                    onClick={() => handleLaunch("dsa_coding")}
                    className="card-interactive drill-card-dsa p-4 rounded-2xl text-left shadow-lg relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-lg">💻</span>
                      <span className="px-2 py-0.5 bg-black/40 text-[10px] font-mono font-bold rounded text-sky-200 border border-sky-400/30">
                        25m · Algorithms
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-sky-200 transition">
                      DSA Coding Sprint
                    </div>
                    <div className="text-[11px] text-sky-100/80 mt-0.5 leading-snug">
                      Problem breakdown, edge cases &amp; Big-O proof
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] text-sky-300 font-semibold">
                      <span>⚡</span>
                      <span>Big-O rigor &amp; edge cases</span>
                    </div>
                  </button>

                  {/* Core CS */}
                  <button
                    onClick={() => handleLaunch("core_cs")}
                    className="card-interactive drill-card-rehearsal p-4 rounded-2xl text-left shadow-lg relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-lg">⚙️</span>
                      <span className="px-2 py-0.5 bg-black/40 text-[10px] font-mono font-bold rounded text-emerald-200 border border-emerald-400/30">
                        30m · Fundamentals
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-200 transition">
                      Core CS Fundamentals
                    </div>
                    <div className="text-[11px] text-emerald-100/80 mt-0.5 leading-snug">
                      OS virtual memory, concurrency, networking, &amp; ACID
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] text-emerald-300 font-semibold">
                      <span>🔬</span>
                      <span>Kernel &amp; low-level systems</span>
                    </div>
                  </button>

                  {/* System Design */}
                  <button
                    onClick={() => handleLaunch("system_design")}
                    className="card-interactive drill-card-sysdesign p-4 rounded-2xl text-left shadow-lg relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-lg">🏗️</span>
                      <span className="px-2 py-0.5 bg-black/40 text-[10px] font-mono font-bold rounded text-amber-200 border border-amber-400/30">
                        35m · Architecture
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-amber-200 transition">
                      System Design Deep Dive
                    </div>
                    <div className="text-[11px] text-amber-100/80 mt-0.5 leading-snug">
                      QPS math, sharding, replication &amp; trade-offs
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] text-amber-300 font-semibold">
                      <span>📐</span>
                      <span>High availability &amp; scale</span>
                    </div>
                  </button>

                  {/* Behavioral */}
                  <button
                    onClick={() => handleLaunch("behavioral")}
                    className="card-interactive drill-card-star p-4 rounded-2xl text-left shadow-lg relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-lg">🎙️</span>
                      <span className="px-2 py-0.5 bg-black/40 text-[10px] font-mono font-bold rounded text-rose-200 border border-rose-400/30">
                        15m · High Impact
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-rose-200 transition">
                      Behavioral STAR Drill
                    </div>
                    <div className="text-[11px] text-rose-100/80 mt-0.5 leading-snug">
                      Conflict, ownership, leadership under ambiguity
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] text-rose-300 font-semibold">
                      <span>🎯</span>
                      <span>Quantified business metrics</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Feature Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="card-interactive p-5 bg-slate-900/80 border border-slate-800/90 hover:border-indigo-500/40 rounded-2xl space-y-2.5 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-lg">
                    🎯
                  </div>
                  <h3 className="font-bold text-white text-sm">Evidence, Not Vibes</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Evaluates Problem Understanding, Big-O Complexity, Testing, and STAR ownership.
                    Quotes your exact transcript words that won or lost points.
                  </p>
                </div>

                <div className="card-interactive p-5 bg-slate-900/80 border border-slate-800/90 hover:border-amber-500/40 rounded-2xl space-y-2.5 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg">
                    ⚡
                  </div>
                  <h3 className="font-bold text-white text-sm">Targeted Weakness Follow-ups</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Reverses follow-up prediction to probe the weakest part of what you said ("You
                    mentioned caching, what is your invalidation strategy?").
                  </p>
                </div>

                <div className="card-interactive p-5 bg-slate-900/80 border border-slate-800/90 hover:border-emerald-500/40 rounded-2xl space-y-2.5 backdrop-blur-sm">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">
                    📊
                  </div>
                  <h3 className="font-bold text-white text-sm">Speech & Delivery Analytics</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Whisper transcription measures words per minute (WPM), filler word breakdown,
                    hesitation latency, and flags rambling answers over 2 minutes.
                  </p>
                </div>
              </div>
            </div>
          ))}

        {activeTab === 'story_bank' && <StoryBankView />}
        {activeTab === 'spaced_drills' && <SpacedRepetitionView />}
        {activeTab === 'company_prep' && <CompanyPrepView />}
        {activeTab === 'delivery_trends' && <DeliveryTrendsView />}
        {activeTab === 'feedback' && <FeedbackImportView />}
        {activeTab === 'weakness_map' && <WeaknessMapView />}
        {activeTab === 'explainer_drill' && <ExplainerDrillView />}
        {activeTab === 'progress' && <ProgressView />}
      </div>

      {/* Round Launcher Modal */}
      {showLauncher && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="configure-round-title"
        >
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <div>
                <h2 id="configure-round-title" className="text-base font-bold text-white">
                  Configure Practice Round
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select your interviewer persona and pressure settings
                </p>
              </div>
              <button
                onClick={() => setShowLauncher(false)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
                aria-label="Close configuration dialog"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1.5">
                  Interviewer Persona
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'strict_big_tech', label: 'Strict Big Tech', icon: '🏛️' },
                    { id: 'startup_pragmatist', label: 'Startup Pragmatist', icon: '⚡' },
                    { id: 'friendly_recruiter', label: 'Friendly Lead', icon: '🤝' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersona(p.id as InterviewPersona)}
                      className={
                        'p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ' +
                        (selectedPersona === p.id
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700')
                      }
                    >
                      <span className="text-base">{p.icon}</span>
                      <span className="font-semibold text-xs leading-tight">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1.5">
                  Interview Pressure
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'low', label: 'Low', desc: 'Relaxed pause, fewer probes', icon: '😌' },
                    { id: 'normal', label: 'Normal', desc: 'Standard interview pace', icon: '⚡' },
                    {
                      id: 'high',
                      label: 'High',
                      desc: 'Fast cadence, aggressive probes',
                      icon: '🔥',
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPressure(p.id as any)}
                      className={
                        'p-2 rounded-xl border text-center transition ' +
                        (selectedPressure === p.id
                          ? p.id === 'high'
                            ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30'
                            : 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700')
                      }
                    >
                      <span className="block font-semibold text-xs">
                        {p.icon} {p.label}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {p.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Curriculum Topic & Difficulty Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Curriculum Topic Focus
                  </label>
                  <select
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">Dynamic Curriculum (Prerequisite DAG)</option>
                    {catalogTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category.replace(/_/g, ' ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Difficulty Caliber
                  </label>
                  <select
                    value={selectedDifficulty}
                    onChange={(e) => setSelectedDifficulty(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl focus:outline-none focus:border-indigo-500 capitalize"
                  >
                    {['beginner', 'easy', 'intermediate', 'advanced', 'expert'].map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="text-slate-300 font-semibold block mb-2">
                  Select Round Preset
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => handleLaunch('adaptive_loop')}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-purple-500/40 rounded-xl text-left flex justify-between items-center transition group"
                  >
                    <div>
                      <span className="font-bold text-white block group-hover:text-purple-300 transition">
                        🧠 Adaptive Technical Loop
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Dynamic prerequisite progression, targeted probing, and real-time difficulty
                      </span>
                    </div>
                    <span className="text-purple-400 font-bold px-2 py-0.5 bg-purple-500/10 rounded">
                      45m
                    </span>
                  </button>

                  <button
                    onClick={() => handleLaunch('dress_rehearsal')}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 rounded-xl text-left flex justify-between items-center transition group"
                  >
                    <div>
                      <span className="font-bold text-white block group-hover:text-indigo-300 transition">
                        🚀 45-Minute Dress Rehearsal
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Icebreaker → STAR → Tech Deep Dive → Q&amp;A → Scorecard
                      </span>
                    </div>
                    <span className="text-indigo-400 font-bold px-2 py-0.5 bg-indigo-500/10 rounded">
                      45m
                    </span>
                  </button>

                  <button
                    onClick={() => handleLaunch('dsa_coding')}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-sky-500/40 rounded-xl text-left flex justify-between items-center transition group"
                  >
                    <div>
                      <span className="font-bold text-white block group-hover:text-sky-300 transition">
                        💻 DSA Coding Pressure Sprint
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Problem understanding, Big-O proof, dry run testing
                      </span>
                    </div>
                    <span className="text-sky-400 font-bold px-2 py-0.5 bg-sky-500/10 rounded">
                      25m
                    </span>
                  </button>

                  <button
                    onClick={() => handleLaunch('core_cs')}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/40 rounded-xl text-left flex justify-between items-center transition group"
                  >
                    <div>
                      <span className="font-bold text-white block group-hover:text-emerald-300 transition">
                        ⚙️ Core CS Fundamentals
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Virtual memory, concurrency, OS kernel, and ACID isolation
                      </span>
                    </div>
                    <span className="text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/10 rounded">
                      30m
                    </span>
                  </button>

                  <button
                    onClick={() => handleLaunch('system_design')}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 rounded-xl text-left flex justify-between items-center transition group"
                  >
                    <div>
                      <span className="font-bold text-white block group-hover:text-amber-300 transition">
                        🏗️ System Design Deep Dive
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Requirements, QPS math, sharding, caching, failure modes
                      </span>
                    </div>
                    <span className="text-amber-400 font-bold px-2 py-0.5 bg-amber-500/10 rounded">
                      35m
                    </span>
                  </button>

                  <button
                    onClick={() => handleLaunch('behavioral')}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-rose-500/40 rounded-xl text-left flex justify-between items-center transition group"
                  >
                    <div>
                      <span className="font-bold text-white block group-hover:text-rose-300 transition">
                        🎙️ Behavioral STAR Drill
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Conflict, failure ownership, ambiguity, quantified impact
                      </span>
                    </div>
                    <span className="text-rose-400 font-bold px-2 py-0.5 bg-rose-500/10 rounded">
                      15m
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
