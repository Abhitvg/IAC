import { triggerCelebrationConfetti } from '../../utils/confetti';
import React, { useEffect, useState } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { useAppStore } from '../../store/useAppStore';
import { EvidenceScorecard } from './EvidenceScorecard';

export const MockPressureRoom: React.FC = () => {
  const {
    activeSession,
    tickTimer,
    currentCandidateAnswer,
    setCurrentCandidateAnswer,
    availableHints,
    activeHintsUsed,
    requestHint,
    interruptionBanner,
    dismissInterruption,
    submitCurrentAnswer,
    endSession,
  } = usePracticeStore();

  const { isRecording, toggleRecording, transcript } = useAppStore();

  // Running visible timer
  useEffect(() => {
    if (!activeSession || !activeSession.isActive) return;
    const interval = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.isActive, activeSession?.timeRemainingSeconds]);

  // Sync mic transcript into practice answer if recording
  useEffect(() => {
    if (transcript && transcript.length > 0 && isRecording) {
      const userText = transcript
        .filter((m: any) => m.speaker === 'user' || m.speaker === 'unknown')
        .map((m: any) => m.text)
        .join(' ');
      if (userText) {
        setCurrentCandidateAnswer(userText);
      }
    }
  }, [transcript, isRecording]);

  const [autoReadQuestions, setAutoReadQuestions] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (!text || !text.trim()) {
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) =>
        (v.lang.startsWith('en') &&
          (v.name.includes('Daniel') || v.name.includes('Samantha') || v.name.includes('Karen'))) ||
        v.lang === 'en-US'
    );
    if (naturalVoice) utterance.voice = naturalVoice;

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Auto-speak new questions when session advances
  useEffect(() => {
    if (autoReadQuestions && activeSession?.currentQuestion && activeSession.isActive) {
      speakText(activeSession.currentQuestion);
    }
    return () => stopSpeaking();
  }, [activeSession?.currentQuestion, autoReadQuestions, activeSession?.isActive]);

  // Auto-speak interruptions
  useEffect(() => {
    if (autoReadQuestions && interruptionBanner) {
      speakText('Excuse me: ' + interruptionBanner);
    }
  }, [interruptionBanner, autoReadQuestions]);

  if (!activeSession) {
    return null;
  }

  // Format timer MM:SS
  const mins = Math.floor(activeSession.timeRemainingSeconds / 60);
  const secs = activeSession.timeRemainingSeconds % 60;
  const timerStr = mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
  const isTimeCritical = activeSession.timeRemainingSeconds < 300; // < 5 mins

  // Current active question item
  const currentHistoryItem =
    activeSession.questionHistory[activeSession.questionHistory.length - 1];
  const lastCompletedItem =
    activeSession.questionHistory[
      activeSession.questionHistory.length - (activeSession.isActive ? 2 : 1)
    ];

  const personaMeta = {
    strict_big_tech: {
      title: 'Principal Bar Raiser',
      badge: 'L6+ Big Tech',
      avatar: '🏛️',
      accent: 'from-indigo-600 to-purple-700',
    },
    startup_pragmatist: {
      title: 'Head of Engineering',
      badge: 'Series B Pragmatist',
      avatar: '⚡',
      accent: 'from-amber-600 to-orange-700',
    },
    friendly_recruiter: {
      title: 'Talent Partner & Lead',
      badge: 'Culture & STAR',
      avatar: '🤝',
      accent: 'from-emerald-600 to-teal-700',
    },
  }[activeSession.persona] || {
    title: 'Interviewer',
    badge: 'Evaluation',
    avatar: '👤',
    accent: 'from-indigo-600 to-purple-700',
  };

  return (
    <div className="space-y-6">
      {/* Top Pressure Header: Persona & Visible Timer */}
      <div className="p-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 rounded-2xl flex flex-wrap justify-between items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div
            className={
              'w-11 h-11 rounded-2xl bg-gradient-to-br ' +
              personaMeta.accent +
              ' flex items-center justify-center text-xl shadow-md border border-white/10'
            }
          >
            {personaMeta.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">
                {personaMeta.title}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                {personaMeta.badge}
              </span>
              {activeSession.rehearsalPhase && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeSession.rehearsalPhase} Phase
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {activeSession.interviewerThinkingSeconds > 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 animate-pulse font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>
                    Taking notes & synthesizing evidence ({activeSession.interviewerThinkingSeconds}
                    s)...
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Observing & Listening to your response</span>
                  <div className="hidden sm:flex items-center gap-0.5 ml-1 h-3 text-emerald-400">
                    <span className="soundwave-bar" />
                    <span className="soundwave-bar" />
                    <span className="soundwave-bar" />
                    <span className="soundwave-bar" />
                    <span className="soundwave-bar" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Visible Pressure Timer */}
        <div className="flex items-center gap-3">
          <div
            role="timer"
            aria-live="off"
            aria-label={'Time remaining: ' + timerStr}
            className={
              'px-4 py-2 rounded-xl font-mono text-xl font-extrabold border transition shadow-inner flex items-center gap-2 ' +
              (isTimeCritical
                ? 'bg-rose-950/70 text-rose-300 border-rose-500 animate-pulse shadow-rose-950/50'
                : 'bg-slate-950/90 text-white border-slate-700/80')
            }
          >
            <span className={isTimeCritical ? 'text-rose-400' : 'text-indigo-400'}>⏱️</span>
            <span>{timerStr}</span>
          </div>

          <button
            onClick={endSession}
            aria-label="End practice session early"
            className="px-3.5 py-2 bg-slate-800/90 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700/80 hover:border-rose-500/40 rounded-xl text-xs font-semibold transition"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Mid-Answer Interruption Banner */}
      {interruptionBanner && (
        <div className="p-4 bg-gradient-to-r from-rose-950/80 via-slate-900 to-rose-950/60 border-2 border-rose-500 rounded-2xl flex items-start justify-between gap-4 shadow-xl shadow-rose-950/50 animate-bounce">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-rose-400">
                Interviewer Interrupted Mid-Answer:
              </span>
              <p className="text-sm font-bold text-white mt-0.5 leading-snug">
                "{interruptionBanner}"
              </p>
              <p className="text-[11px] text-rose-200 mt-1">
                Address this specific challenge immediately before moving on with your answer.
                Composure and concise clarification earn points.
              </p>
            </div>
          </div>
          <button
            onClick={dismissInterruption}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-md transition shrink-0"
          >
            Acknowledge & Continue
          </button>
        </div>
      )}

      {/* Question Card */}
      {activeSession.isActive ? (
        <div className="p-6 bg-gradient-to-br from-slate-900/90 to-slate-950/90 border-l-4 border-l-indigo-500 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {currentHistoryItem?.category || 'Question'}
              </span>
              {currentHistoryItem?.isFollowUp && (
                <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <span>⚡</span>
                  <span>Targeted Weakness Follow-up</span>
                </span>
              )}
            </div>

            {/* Speech synthesis audio controls */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  isSpeaking ? stopSpeaking() : speakText(activeSession.currentQuestion)
                }
                className={
                  'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ' +
                  (isSpeaking
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                    : 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30')
                }
                title="Speak question using AI Voice"
              >
                <span>{isSpeaking ? '⏹️ Stop Voice' : '🔊 Read Aloud'}</span>
                {isSpeaking && (
                  <div className="flex items-center gap-0.5 ml-1 h-2.5 text-rose-300">
                    <span className="soundwave-bar" />
                    <span className="soundwave-bar" />
                    <span className="soundwave-bar" />
                  </div>
                )}
              </button>

              <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoReadQuestions}
                  onChange={(e) => setAutoReadQuestions(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                />
                <span>Auto-read questions</span>
              </label>
            </div>
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-white leading-relaxed">
            "{activeSession.currentQuestion}"
          </h3>

          {/* Tiered Hints Accordion */}
          <div className="pt-3 border-t border-slate-800/80">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-xs font-semibold text-slate-400">
                Tiered Coaching Hints (Cost penalty against rubric score):
              </span>
              <span className="text-[11px] text-amber-400 font-mono font-bold">
                Penalty: -{activeHintsUsed.reduce((sum, h) => sum + h.penaltyPoints, 0).toFixed(1)}{' '}
                pts
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {[1, 2, 3].map((tierNum) => {
                const hint = availableHints.find((h) => h.tier === tierNum);
                const isUnlocked = activeHintsUsed.some((h) => h.tier === tierNum);

                const tierLabels = [
                  'Tier 1: Gentle Nudge',
                  'Tier 2: Targeted Angle',
                  'Tier 3: Near-Solution',
                ];

                return (
                  <div
                    key={tierNum}
                    className={
                      'p-3 rounded-xl border text-xs transition ' +
                      (isUnlocked
                        ? 'bg-slate-950 border-indigo-500/50 text-slate-200 shadow-sm shadow-indigo-500/10'
                        : 'bg-slate-900/60 border-slate-800/90 text-slate-400')
                    }
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white text-xs">
                        {hint?.title || tierLabels[tierNum - 1]}
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono font-semibold">
                        -{hint?.penaltyPoints || tierNum * 0.5} pts
                      </span>
                    </div>

                    {isUnlocked ? (
                      <div className="mt-1.5 p-2 bg-indigo-950/30 rounded-lg border border-indigo-500/20">
                        <p className="text-slate-200 text-xs leading-relaxed">{hint?.content}</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => requestHint(tierNum as any)}
                        className="w-full mt-2 py-1 text-center bg-slate-800/90 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-lg text-[11px] font-semibold transition border border-slate-700/60"
                      >
                        🔒 Unlock Hint (-{hint?.penaltyPoints || tierNum * 0.5} pts)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Candidate Answer Workspace */}
          <div className="space-y-3 pt-3 border-t border-slate-800/80">
            <div className="flex justify-between items-center">
              <label
                htmlFor="candidate-response-input"
                className="text-xs font-semibold text-slate-300 flex items-center gap-2"
              >
                <span>Your Live Response (Speak out loud or type structure):</span>
                {isRecording && (
                  <span className="flex items-center gap-1.5 text-rose-400 text-[10px] font-bold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Microphone Live (Continuous Whisper)
                  </span>
                )}
              </label>

              <button
                type="button"
                onClick={toggleRecording}
                className={
                  'px-3.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ' +
                  (isRecording
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-md shadow-rose-600/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700')
                }
              >
                <span>{isRecording ? '⏹️ Stop Dictation' : '🎤 Speak Answer'}</span>
              </button>
            </div>

            <textarea
              id="candidate-response-input"
              aria-label="Your Live Response"
              value={currentCandidateAnswer}
              onChange={(e) => setCurrentCandidateAnswer(e.target.value)}
              placeholder="Start speaking into your microphone or type your initial technical thoughts here..."
              className="w-full h-36 p-3.5 bg-slate-950/90 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none leading-relaxed font-mono shadow-inner transition"
            />

            <div className="flex justify-between items-center pt-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>Words: {currentCandidateAnswer.split(/\s+/).filter(Boolean).length}</span>
                <span>•</span>
                <span>Characters: {currentCandidateAnswer.length}</span>
              </div>

              <button
                onClick={submitCurrentAnswer}
                disabled={currentCandidateAnswer.trim().length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Submit Answer & Get Evidence Assessment</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Consolidated Rehearsal Debrief */
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                Consolidated Rehearsal Scorecard
              </span>
              <h3 className="text-2xl font-black text-white mt-1">
                Final Hiring Decision:{' '}
                <span
                  className={
                    activeSession.overallScorecard?.finalRating.includes('Hire')
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {activeSession.overallScorecard?.finalRating || 'Hire'}
                </span>
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase">Key Strengths</span>
              <ul className="mt-2 space-y-1 text-xs text-slate-200">
                {activeSession.overallScorecard?.keyStrengths.map((str, idx) => (
                  <li key={idx} className="flex gap-2 items-center">
                    <span className="text-emerald-400">✓</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase">
                Top Improvement Priorities
              </span>
              <ul className="mt-2 space-y-1 text-xs text-slate-200">
                {activeSession.overallScorecard?.topImprovementPriorities.map((prio, idx) => (
                  <li key={idx} className="flex gap-2 items-center">
                    <span className="text-rose-400">!</span>
                    <span>{prio}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Render Most Recent Rubric Assessment */}
      {lastCompletedItem?.evaluation && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Latest Answer Evaluation & Speech Metrics</span>
            <span className="text-xs text-slate-400 font-normal">
              ("{lastCompletedItem.question.slice(0, 45)}...")
            </span>
          </h3>
          <EvidenceScorecard
            evaluation={lastCompletedItem.evaluation}
            delivery={lastCompletedItem.delivery}
            modelAnswer={lastCompletedItem.evaluation.modelAnswer}
          />
        </div>
      )}
    </div>
  );
};
