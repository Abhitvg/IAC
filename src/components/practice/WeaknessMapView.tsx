import React, { useState, useMemo } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { WeaknessMap } from '../../services/practice/feedback/WeaknessMap';
import { PlanGenerator } from '../../services/practice/feedback/PlanGenerator';
import {
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  Target,
  FileQuestion,
} from 'lucide-react';

export const WeaknessMapView: React.FC = () => {
  const {
    feedbackRecords,
    topicMasteries,
    weaknessPlan,
    setWeaknessPlan,
    seedSchedulerFromWeaknesses,
    toggleWeaknessDrillCompleted,
    setActiveTab,
    startMockSession,
  } = usePracticeStore();

  const [dailyBudget, setDailyBudget] = useState<number>(90);
  const [seededNotice, setSeededNotice] = useState<string | null>(null);

  // Compute weakness map from stored feedback records
  const weaknessResult = useMemo(() => {
    return WeaknessMap.aggregateFeedback(feedbackRecords);
  }, [feedbackRecords]);

  const handleGeneratePlan = () => {
    const plan = PlanGenerator.generate7DayPlan(weaknessResult, {
      maxDailyMinutes: dailyBudget,
      startDate: Date.now(),
    });
    setWeaknessPlan(plan);
  };

  const handleSeedScheduler = () => {
    seedSchedulerFromWeaknesses();
    setSeededNotice('Spaced scheduler seeded: weak topics prioritized with lower mastery scores!');
    setTimeout(() => setSeededNotice(null), 4000);
  };

  const handleStartDrill = (topic: string) => {
    const isBehavioral =
      topic.toLowerCase().includes('conflict') ||
      topic.toLowerCase().includes('leadership') ||
      topic.toLowerCase().includes('communication');
    const isCoding =
      topic.toLowerCase().includes('pointer') ||
      topic.toLowerCase().includes('array') ||
      topic.toLowerCase().includes('tree') ||
      topic.toLowerCase().includes('stack') ||
      topic.toLowerCase().includes('graph');

    const roundType = isBehavioral ? 'behavioral' : isCoding ? 'dsa_coding' : 'system_design';
    startMockSession(roundType);
    setActiveTab('arena');
  };

  const getMasteryForTopic = (topicName: string): number | null => {
    const lower = topicName.toLowerCase();
    const match = topicMasteries.find(
      (m) =>
        m.topicName.toLowerCase() === lower ||
        m.topicName.toLowerCase().includes(lower) ||
        lower.includes(m.topicName.toLowerCase())
    );
    return match ? match.masteryScore : null;
  };

  if (feedbackRecords.length === 0) {
    return (
      <div className="space-y-6">
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-4">
          <div className="w-16 h-16 bg-indigo-900/40 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto text-indigo-400">
            <Target className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white">No Interview Feedback Imported Yet</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Paste real interview feedback reports into the Import Feedback tab. The app will redact
            sensitive details, extract structured weaknesses, and rank your recurring gaps here.
          </p>
          <button
            onClick={() => setActiveTab('feedback')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition"
          >
            Go to Import Feedback
          </button>
        </div>
      </div>
    );
  }

  const activePlan =
    weaknessPlan ||
    PlanGenerator.generate7DayPlan(weaknessResult, { maxDailyMinutes: dailyBudget });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-3xl space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <span className="text-[11px] uppercase font-extrabold tracking-widest text-indigo-400">
              Evidence-Based Weakness Diagnostic
            </span>
            <h1 className="text-2xl font-black text-white mt-1">Weakness Map & Practice Plan</h1>
            <p className="text-xs text-slate-400 max-w-2xl mt-1">
              Aggregated from {weaknessResult.totalReportsAnalyzed} independent feedback report
              {weaknessResult.totalReportsAnalyzed === 1 ? '' : 's'}. Weaknesses are ranked by
              interviewer severity, recency decay (60-day half-life), and cross-report recurrence.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSeedScheduler}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-bold rounded-xl flex items-center gap-2 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Seed Spaced Repetition
            </button>
            <button
              onClick={handleGeneratePlan}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate 7-Day Plan
            </button>
          </div>
        </div>

        {seededNotice && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{seededNotice}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Reports</span>
            <span className="text-xl font-extrabold text-white">
              {weaknessResult.totalReportsAnalyzed}
            </span>
          </div>
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Weaknesses</span>
            <span className="text-xl font-extrabold text-indigo-400">
              {weaknessResult.rankedWeaknesses.length}
            </span>
          </div>
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Recurring Gaps
            </span>
            <span className="text-xl font-extrabold text-amber-400">
              {weaknessResult.recurringWeaknesses.length}
            </span>
          </div>
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Missing Content
            </span>
            <span className="text-xl font-extrabold text-rose-400">
              {weaknessResult.missingContentTopics.length}
            </span>
          </div>
        </div>
      </div>

      {/* Missing Content Alert */}
      {weaknessResult.missingContentTopics.length > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-200">
          <FileQuestion className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-amber-300 block">
              Missing Question Bank Content Detected:
            </span>
            <p className="text-amber-200/80 leading-relaxed">
              The following topics from your feedback have no matching questions in the built-in
              question bank:{' '}
              <strong className="text-amber-100">
                {weaknessResult.missingContentTopics.join(', ')}
              </strong>
              . You can still practice them via the upcoming 90-second explainer drill or by
              importing custom question packs.
            </p>
          </div>
        </div>
      )}

      {/* Ranked Weaknesses List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Ranked Weakness Hierarchy
          </h2>
          <span className="text-[11px] text-slate-400">
            Ordered by Severity × Recency × Cross-Report Recurrence
          </span>
        </div>

        <div className="space-y-3">
          {weaknessResult.rankedWeaknesses.map((w, index) => {
            const mastery = getMasteryForTopic(w.topic);

            return (
              <div
                key={w.id}
                className={`p-4 bg-slate-900 border rounded-2xl space-y-3 transition ${
                  w.isRecurring
                    ? 'border-amber-500/40 shadow-sm shadow-amber-900/10'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-black text-xs flex items-center justify-center">
                      #{index + 1}
                    </span>
                    <div>
                      <h3 className="font-bold text-white text-sm">{w.topic}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            w.skill === 'structure'
                              ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50'
                              : w.skill === 'concreteness'
                                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                                : w.skill === 'depth'
                                  ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          Skill: {w.skill}
                        </span>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            w.severity === 3
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : w.severity === 2
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          Severity:{' '}
                          {w.severity === 3
                            ? 'Main Concern'
                            : w.severity === 2
                              ? 'Notable Gap'
                              : 'Minor Polish'}
                        </span>

                        {w.isRecurring && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            Recurring across {w.reportCount} reports
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 font-mono">
                          Rank Score: {w.score.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {mastery !== null && (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Mastery</span>
                        <span
                          className={`text-xs font-bold ${
                            mastery >= 70
                              ? 'text-emerald-400'
                              : mastery >= 40
                                ? 'text-amber-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {mastery}%
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => handleStartDrill(w.topic)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition"
                    >
                      Start Drill
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Evidence & Requested Fix Snippets */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                  {w.evidenceQuotes.length > 0 && (
                    <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Interviewer Evidence:
                      </span>
                      <p className="text-slate-300 italic">"{w.evidenceQuotes[0]}"</p>
                    </div>
                  )}

                  {w.requestedFixes.length > 0 && (
                    <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Requested Fix:
                      </span>
                      <p className="text-indigo-200">{w.requestedFixes[0]}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 7-Day Targeted Plan Section */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              7-Day Feedback-Driven Action Plan
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Each day targets 1 structure drill, 1 concreteness drill, and 1 topic mock.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Daily Budget:</span>
              <select
                value={dailyBudget}
                onChange={(e) => {
                  const b = Number(e.target.value);
                  setDailyBudget(b);
                  const p = PlanGenerator.generate7DayPlan(weaknessResult, { maxDailyMinutes: b });
                  setWeaknessPlan(p);
                }}
                className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2 py-1"
              >
                <option value={60}>60 Minutes / day</option>
                <option value={75}>75 Minutes / day</option>
                <option value={90}>90 Minutes / day (Default)</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activePlan.days.map((day) => (
            <div
              key={day.day}
              className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="font-extrabold text-white text-sm">Day {day.day}</span>
                  <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                    {day.totalTimeMinutes}m total
                  </span>
                </div>

                <div className="space-y-2.5">
                  {day.drills.map((drill) => (
                    <div
                      key={drill.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1 transition ${
                        drill.completed
                          ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-400'
                          : 'bg-slate-950/60 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <label className="flex items-center gap-2 cursor-pointer font-bold">
                          <input
                            type="checkbox"
                            checked={drill.completed}
                            onChange={() => toggleWeaknessDrillCompleted(day.day, drill.id)}
                            className="rounded bg-slate-900 border-slate-700 text-indigo-600 w-3.5 h-3.5"
                          />
                          <span
                            className={
                              drill.completed ? 'line-through text-slate-500' : 'text-slate-100'
                            }
                          >
                            {drill.title}
                          </span>
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {drill.timeBudgetMinutes}m
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 pl-5.5 leading-relaxed">
                        {drill.instructions}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleStartDrill(day.drills[2].targetTopic)}
                className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-lg border border-slate-700 transition"
              >
                Launch Day {day.day} Topic Mock
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
