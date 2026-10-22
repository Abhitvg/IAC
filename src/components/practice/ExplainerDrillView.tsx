import React, { useState, useEffect, useRef } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { useAppStore } from '../../store/useAppStore';
import { ExplainerDrillService } from '../../services/practice/coach/ExplainerDrillService';
import { StructureAnalyzer } from '../../services/practice/coach/StructureAnalyzer';
import { ConcretenessAnalyzer } from '../../services/practice/coach/ConcretenessAnalyzer';
import { DeliveryCoach } from '../../services/practice/DeliveryCoach';
import { ExplainerAttempt, ConceptCard } from '../../services/practice/types';
import {
  Timer,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Edit3,
  Save,
  TrendingUp,
  Award,
  BookOpen,
  Mic,
  MicOff,
} from 'lucide-react';

export const ExplainerDrillView: React.FC = () => {
  const {
    activeExplainerTopic,
    setActiveExplainerTopic,
    explainerAttempts,
    recordExplainerAttempt,
    conceptCards,
    saveConceptCard,
    feedbackRecords,
  } = usePracticeStore();
  const { isRecording, toggleRecording, transcript } = useAppStore();

  const [timeLimit, setTimeLimit] = useState<30 | 60 | 90>(90);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [candidateText, setCandidateText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [latestAttempt, setLatestAttempt] = useState<ExplainerAttempt | null>(null);

  // Concept card state
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [cardCoreIdea, setCardCoreIdea] = useState('');
  const [cardWorkedExample, setCardWorkedExample] = useState('');
  const [cardPitfall, setCardPitfall] = useState('');
  const [cardTradeOff, setCardTradeOff] = useState('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync live spoken words from microphone into candidateText during drill
  useEffect(() => {
    if (transcript && transcript.length > 0 && isRecording) {
      const userText = transcript
        .filter((m: any) => m.speaker === 'user' || m.speaker === 'unknown')
        .map((m: any) => m.text)
        .join(' ');
      if (userText) {
        setCandidateText(userText);
      }
    }
  }, [transcript, isRecording]);

  // Available topics from feedback or defaults
  const availableTopics = Array.from(
    new Set([
      'Distributed Caching',
      'Event Loop & Microtasks',
      'OT vs CRDT Collaborative Editing',
      'Kafka Partitioning & Consumer Groups',
      'Two Pointers & Sliding Window',
      ...feedbackRecords.flatMap((r) => r.weaknesses.map((w) => w.topic)),
    ])
  ).filter(Boolean);

  // Active concept card
  const currentCard = conceptCards[activeExplainerTopic.toLowerCase()];

  useEffect(() => {
    if (currentCard) {
      setCardCoreIdea(currentCard.coreIdea);
      setCardWorkedExample(currentCard.workedExample);
      setCardPitfall(currentCard.commonPitfall);
      setCardTradeOff(currentCard.tradeOff);
    } else {
      // Initialize default card
      ExplainerDrillService.generateConceptCard({ topic: activeExplainerTopic }).then((card) => {
        saveConceptCard(card);
        setCardCoreIdea(card.coreIdea);
        setCardWorkedExample(card.workedExample);
        setCardPitfall(card.commonPitfall);
        setCardTradeOff(card.tradeOff);
      });
    }
  }, [activeExplainerTopic]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const handleStart = () => {
    setElapsed(0);
    setCandidateText('');
    setLatestAttempt(null);
    setIsRunning(true);
    if (!isRecording) {
      toggleRecording();
    }
  };

  const handleStopAndAnalyze = async () => {
    setIsRunning(false);
    if (isRecording) {
      toggleRecording();
    }
    setIsAnalyzing(true);

    const cleanText = candidateText.trim() || 'No answer spoken.';
    const finalElapsed = Math.max(1, elapsed);

    // Run Structure & Concreteness analysis
    const structureAnalysis = await StructureAnalyzer.analyze({
      transcript: cleanText,
      question: `Explain ${activeExplainerTopic} in ${timeLimit} seconds.`,
      durationSeconds: finalElapsed,
    });

    const concretenessAnalysis = await ConcretenessAnalyzer.analyze({
      transcript: cleanText,
      question: `Explain ${activeExplainerTopic} in ${timeLimit} seconds.`,
    });

    const delivery = DeliveryCoach.analyze(cleanText, finalElapsed);

    // Find previous attempt on this topic for delta comparison
    const previousAttemptsForTopic = explainerAttempts.filter(
      (a) => a.topic.toLowerCase() === activeExplainerTopic.toLowerCase()
    );
    const prevAttempt = previousAttemptsForTopic[0];

    const attempt = ExplainerDrillService.evaluateAttempt({
      topic: activeExplainerTopic,
      transcript: cleanText,
      timeLimitSeconds: timeLimit,
      elapsedSeconds: finalElapsed,
      previousAttempt: prevAttempt,
      structureAnalysis,
      concretenessAnalysis,
      delivery,
    });

    recordExplainerAttempt(attempt);
    setLatestAttempt(attempt);
    setIsAnalyzing(false);
  };

  const handleSaveCard = () => {
    const updatedCard: ConceptCard = {
      id: currentCard?.id || `card_${activeExplainerTopic.toLowerCase()}`,
      topic: activeExplainerTopic,
      coreIdea: cardCoreIdea,
      workedExample: cardWorkedExample,
      commonPitfall: cardPitfall,
      tradeOff: cardTradeOff,
      isEditedByUser: true,
      disclaimer: 'AI-generated, verify before relying on it',
      updatedAt: Date.now(),
    };
    saveConceptCard(updatedCard);
    setIsEditingCard(false);
  };

  // Best attempt for this topic today
  const todayKey = new Date().toISOString().split('T')[0];
  const topicAttemptsToday = explainerAttempts.filter(
    (a) => a.topic.toLowerCase() === activeExplainerTopic.toLowerCase() && a.dateKey === todayKey
  );
  const bestAttemptToday = topicAttemptsToday.reduce<ExplainerAttempt | null>((best, curr) => {
    if (!best) return curr;
    return curr.compositeScore > best.compositeScore ? curr : best;
  }, null);

  const secondsRemaining = Math.max(0, timeLimit - elapsed);
  const isOvertime = elapsed > timeLimit;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-3xl space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <span className="text-[11px] uppercase font-extrabold tracking-widest text-indigo-400">
              High-Velocity Verbal Conditioning
            </span>
            <h1 className="text-2xl font-black text-white mt-1">Explain It in 90 Seconds</h1>
            <p className="text-xs text-slate-400 max-w-2xl mt-1">
              Train rapid headline-first opening, signposted pillars, and quantitative concreteness
              under an unforgiving visible countdown timer.
            </p>
          </div>

          {/* Time limit controls */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 px-2 font-bold">Timer:</span>
            {[30, 60, 90].map((t) => (
              <button
                key={t}
                disabled={isRunning}
                onClick={() => setTimeLimit(t as any)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  timeLimit === t
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        {/* Topic Picker Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <span className="text-xs font-bold text-slate-400">Target Weakness:</span>
          <select
            value={activeExplainerTopic}
            disabled={isRunning}
            onChange={(e) => setActiveExplainerTopic(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
          >
            {availableTopics.map((top) => (
              <option key={top} value={top}>
                {top}
              </option>
            ))}
          </select>

          {bestAttemptToday && (
            <span className="ml-auto text-xs text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold">
              <Award className="w-3.5 h-3.5" />
              Best Today: {bestAttemptToday.compositeScore.toFixed(1)}/5.0
            </span>
          )}
        </div>
      </div>

      {/* Main Drill Arena & Timer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
            {/* Visual Countdown Clock */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-indigo-400" />
                {isRunning ? (isOvertime ? 'OVERTIME' : 'COUNTDOWN') : 'PREPARED DRILL'}
              </span>

              <div
                className={`text-6xl font-black font-mono transition ${
                  isOvertime
                    ? 'text-rose-500 animate-pulse'
                    : secondsRemaining <= 10
                      ? 'text-amber-400'
                      : 'text-white'
                }`}
              >
                {isOvertime ? `+${elapsed - timeLimit}s` : `${secondsRemaining}s`}
              </div>

              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2 max-w-md">
                <div
                  className={`h-full transition-all duration-300 ${
                    isOvertime ? 'bg-rose-500 w-full' : 'bg-indigo-500'
                  }`}
                  style={{
                    width: isOvertime ? '100%' : `${Math.min(100, (elapsed / timeLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Answer Input Textarea */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <span>Spoken Answer Transcript:</span>
                  {isRecording && (
                    <span className="flex items-center gap-1.5 text-rose-400 text-[10px] animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Mic Active
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-xs">
                    {candidateText.split(/\s+/).filter(Boolean).length} words
                  </span>
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition ${
                      isRecording
                        ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isRecording ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                    <span>{isRecording ? 'Stop Mic' : '🎤 Speak Answer'}</span>
                  </button>
                </div>
              </div>
              <textarea
                value={candidateText}
                onChange={(e) => setCandidateText(e.target.value)}
                placeholder="Start drill and speak or paste your technical explanation here. Aim for: (1) Headline in first 15s, (2) 3 signposted points with tools & numbers, (3) 1 trade-off, (4) summary close."
                rows={5}
                className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none leading-relaxed"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  🚀 Start {timeLimit}s Drill
                </button>
              ) : (
                <button
                  onClick={handleStopAndAnalyze}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-2"
                >
                  ⏹ Finish & Score Attempt
                </button>
              )}

              {latestAttempt && !isRunning && (
                <button
                  onClick={handleStart}
                  className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry Topic Now
                </button>
              )}
            </div>
          </div>

          {/* Drill Result Card with Score Delta & Improvement Target */}
          {isAnalyzing && (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-indigo-300 animate-pulse">
              Running Structure, Concreteness, and Speech delivery audit...
            </div>
          )}

          {latestAttempt && !isAnalyzing && (
            <div className="p-6 bg-slate-900 border border-indigo-500/30 rounded-3xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-400">
                    Attempt #{latestAttempt.attemptNumber} Report
                  </span>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    Composite Score: {latestAttempt.compositeScore.toFixed(1)} / 5.0
                  </h3>
                </div>

                <div className="flex gap-2">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      latestAttempt.stayedWithinTime
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {latestAttempt.stayedWithinTime
                      ? `✓ ${latestAttempt.elapsedSeconds}s / ${latestAttempt.timeLimitSeconds}s`
                      : `✗ Overtime (${latestAttempt.elapsedSeconds}s)`}
                  </span>
                </div>
              </div>

              {/* Retry Score Delta Banner */}
              {latestAttempt.scoreDelta && (
                <div className="p-3 bg-indigo-950/60 border border-indigo-500/30 rounded-xl text-xs flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="flex flex-wrap gap-4 text-indigo-200">
                    <span>
                      Structure:{' '}
                      <strong
                        className={
                          latestAttempt.scoreDelta.structureDelta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {latestAttempt.scoreDelta.structureDelta >= 0 ? '+' : ''}
                        {latestAttempt.scoreDelta.structureDelta}
                      </strong>
                    </span>
                    <span>
                      Concreteness:{' '}
                      <strong
                        className={
                          latestAttempt.scoreDelta.concretenessDelta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {latestAttempt.scoreDelta.concretenessDelta >= 0 ? '+' : ''}
                        {latestAttempt.scoreDelta.concretenessDelta}
                      </strong>
                    </span>
                    <span>
                      Overall Delta:{' '}
                      <strong
                        className={
                          latestAttempt.scoreDelta.compositeDelta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {latestAttempt.scoreDelta.compositeDelta >= 0 ? '+' : ''}
                        {latestAttempt.scoreDelta.compositeDelta}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Structure
                  </span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    {latestAttempt.structureScore} / 5
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Concreteness
                  </span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    {latestAttempt.concretenessScore} / 5
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Pacing
                  </span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    {latestAttempt.delivery.speakingPaceWpm} WPM
                  </span>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Filler Words
                  </span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    {latestAttempt.delivery.fillerPercentage}%
                  </span>
                </div>
              </div>

              {/* One Improvement Target */}
              <div className="p-4 bg-amber-950/30 border border-amber-500/40 rounded-2xl flex items-start gap-3 text-xs text-amber-200">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-extrabold uppercase text-[10px] tracking-wider text-amber-300 block">
                    One Target for Next Attempt:
                  </span>
                  <p className="leading-relaxed font-semibold text-amber-100">
                    {latestAttempt.improvementTarget}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Editable Concept Card */}
        <div className="space-y-4">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                Topic Concept Card
              </h3>
              {!isEditingCard ? (
                <button
                  onClick={() => setIsEditingCard(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              ) : (
                <button
                  onClick={handleSaveCard}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold"
                >
                  <Save className="w-3 h-3" />
                  Save
                </button>
              )}
            </div>

            {/* AI-Generated Disclaimer */}
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[10px] text-slate-400 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>AI-generated, verify before relying on it:</strong> Never present generated
                cards as authoritative. Verify facts against documentation.
              </span>
            </div>

            {/* Concept Card Content */}
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold text-indigo-300 uppercase block">
                  1. Core Idea (3 Sentences):
                </span>
                {!isEditingCard ? (
                  <p className="text-slate-300 mt-1 leading-relaxed">{cardCoreIdea}</p>
                ) : (
                  <textarea
                    value={cardCoreIdea}
                    onChange={(e) => setCardCoreIdea(e.target.value)}
                    rows={3}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs"
                  />
                )}
              </div>

              <div>
                <span className="text-[10px] font-bold text-emerald-300 uppercase block">
                  2. Worked Example:
                </span>
                {!isEditingCard ? (
                  <p className="text-slate-300 mt-1 leading-relaxed">{cardWorkedExample}</p>
                ) : (
                  <textarea
                    value={cardWorkedExample}
                    onChange={(e) => setCardWorkedExample(e.target.value)}
                    rows={2}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs"
                  />
                )}
              </div>

              <div>
                <span className="text-[10px] font-bold text-rose-300 uppercase block">
                  3. Common Pitfall:
                </span>
                {!isEditingCard ? (
                  <p className="text-slate-300 mt-1 leading-relaxed">{cardPitfall}</p>
                ) : (
                  <textarea
                    value={cardPitfall}
                    onChange={(e) => setCardPitfall(e.target.value)}
                    rows={2}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs"
                  />
                )}
              </div>

              <div>
                <span className="text-[10px] font-bold text-amber-300 uppercase block">
                  4. Key Trade-Off:
                </span>
                {!isEditingCard ? (
                  <p className="text-slate-300 mt-1 leading-relaxed">{cardTradeOff}</p>
                ) : (
                  <textarea
                    value={cardTradeOff}
                    onChange={(e) => setCardTradeOff(e.target.value)}
                    rows={2}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs"
                  />
                )}
              </div>
            </div>

            {currentCard?.isEditedByUser && (
              <span className="text-[10px] text-emerald-400 font-bold block pt-1">
                ✓ User-verified & edited locally
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
