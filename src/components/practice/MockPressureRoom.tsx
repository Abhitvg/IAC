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
  // scratchpad

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

  if (!activeSession) {
    return null;
  }

  // Format timer MM:SS
  const mins = Math.floor(activeSession.timeRemainingSeconds / 60);
  const secs = activeSession.timeRemainingSeconds % 60;
  const timerStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isTimeCritical = activeSession.timeRemainingSeconds < 300; // < 5 mins

  // Current active question item
  const currentHistoryItem =
    activeSession.questionHistory[activeSession.questionHistory.length - 1];
  const lastCompletedItem =
    activeSession.questionHistory[
      activeSession.questionHistory.length - (activeSession.isActive ? 2 : 1)
    ];

  return (
    <div className="space-y-6">
      {/* Top Pressure Header: Persona & Visible Timer */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center font-bold text-white shadow">
            {activeSession.persona === 'strict_big_tech'
              ? 'ST'
              : activeSession.persona === 'startup_pragmatist'
                ? 'SP'
                : 'FR'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white capitalize">
                {activeSession.persona.replace(/_/g, ' ')} Interviewer
              </span>
              {activeSession.rehearsalPhase && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeSession.rehearsalPhase} Phase
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {activeSession.interviewerThinkingSeconds > 0 ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 animate-pulse font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Interviewer is taking notes & reflecting (
                  {activeSession.interviewerThinkingSeconds}s)...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Observing & Listening to your response
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Visible Pressure Timer */}
        <div className="flex items-center gap-3">
          <div
            role="timer"
            aria-live="off"
            aria-label={`Time remaining: ${timerStr}`}
            className={`px-4 py-2 rounded-xl font-mono text-xl font-extrabold border transition ${
              isTimeCritical
                ? 'bg-rose-950/60 text-rose-300 border-rose-500/50 animate-pulse'
                : 'bg-slate-950 text-white border-slate-800'
            }`}
          >
            ⏱️ {timerStr}
          </div>

          <button
            onClick={endSession}
            aria-label="End practice session early"
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Mid-Answer Interruption Banner */}
      {interruptionBanner && (
        <div className="p-4 bg-rose-950/40 border-2 border-rose-500 rounded-2xl flex items-start justify-between gap-4 animate-bounce">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                Interviewer Interrupted Mid-Answer:
              </span>
              <p className="text-sm font-semibold text-white mt-0.5">"{interruptionBanner}"</p>
              <p className="text-[11px] text-rose-200 mt-1">
                Address this specific challenge immediately before moving on with your answer.
              </p>
            </div>
          </div>
          <button
            onClick={dismissInterruption}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow"
          >
            Acknowledge & Continue
          </button>
        </div>
      )}

      {/* Question Card */}
      {activeSession.isActive ? (
        <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {currentHistoryItem?.category || 'Question'}
              </span>
              {currentHistoryItem?.isFollowUp && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Targeted Weakness Follow-up
                </span>
              )}
            </div>
          </div>

          <h3 className="text-lg font-bold text-white leading-snug">
            "{activeSession.currentQuestion}"
          </h3>

          {/* Tiered Hints Accordion */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-400">
                Tiered Coaching Hints (Cost penalty against rubric score):
              </span>
              <span className="text-[11px] text-amber-400">
                Penalty: -{activeHintsUsed.reduce((sum, h) => sum + h.penaltyPoints, 0).toFixed(1)}{' '}
                pts
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {[1, 2, 3].map((tierNum) => {
                const hint = availableHints.find((h) => h.tier === tierNum);
                const isUnlocked = activeHintsUsed.some((h) => h.tier === tierNum);

                return (
                  <div
                    key={tierNum}
                    className={`p-3 rounded-xl border text-xs transition ${
                      isUnlocked
                        ? 'bg-slate-950 border-indigo-500/40 text-slate-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-white">
                        Tier {tierNum}: {hint?.title || `Hint ${tierNum}`}
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        -{hint?.penaltyPoints || tierNum * 0.5} pts
                      </span>
                    </div>

                    {isUnlocked ? (
                      <p className="text-slate-200 text-xs mt-1 leading-relaxed">{hint?.content}</p>
                    ) : (
                      <button
                        onClick={() => requestHint(tierNum as any)}
                        className="w-full mt-1.5 py-1 text-center bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded text-[11px] font-semibold transition"
                      >
                        Unlock Hint (-{hint?.penaltyPoints || tierNum * 0.5} pts)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Candidate Answer Workspace */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-center">
              <label
                htmlFor="candidate-response-input"
                className="text-xs font-semibold text-slate-300 flex items-center gap-2"
              >
                <span>Your Live Response (Speak out loud or type structure):</span>
                {isRecording && (
                  <span className="flex items-center gap-1.5 text-rose-400 text-[10px] animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Microphone Live
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={toggleRecording}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {isRecording ? 'Stop Dictation' : '🎤 Speak Answer'}
              </button>
            </div>

            <textarea
              id="candidate-response-input"
              aria-label="Your Live Response"
              value={currentCandidateAnswer}
              onChange={(e) => setCurrentCandidateAnswer(e.target.value)}
              placeholder="Start speaking into your microphone or type your initial technical thoughts here..."
              className="w-full h-32 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-mono"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-slate-400">
                Word count: {currentCandidateAnswer.split(/\s+/).filter(Boolean).length} words
              </span>

              <button
                onClick={submitCurrentAnswer}
                disabled={currentCandidateAnswer.trim().length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                Submit Answer &amp; Get Evidence Assessment →
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Consolidated Rehearsal Debrief */
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                Consolidated Rehearsal Scorecard
              </span>
              <h3 className="text-2xl font-black text-white mt-1">
                Final Hiring Decision:{' '}
                <span
                  className={`${
                    activeSession.overallScorecard?.finalRating.includes('Hire')
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
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
            <span>Latest Answer Evaluation &amp; Speech Metrics</span>
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
