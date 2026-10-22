import React, { useState } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { ProgressMetricsService } from '../../services/practice/feedback/ProgressMetricsService';
import { ProgressExporter } from '../../services/practice/feedback/ProgressExporter';
import { WeaknessMap } from '../../services/practice/feedback/WeaknessMap';

import {
  MockSessionState,
  TopicMastery,
  WeaknessMapResult,
  WeaknessPracticePlan,
  FeedbackRecord,
} from '../../services/practice/types';

export interface ProgressViewProps {
  sessionHistory?: MockSessionState[];
  topicMasteries?: TopicMastery[];
  weaknessMap?: WeaknessMapResult | null;
  weaknessPlan?: WeaknessPracticePlan | null;
  feedbackRecords?: FeedbackRecord[];
}

export const ProgressView: React.FC<ProgressViewProps> = (props) => {
  const store = usePracticeStore();
  const sessionHistory = props.sessionHistory ?? store.sessionHistory;
  const topicMasteries = props.topicMasteries ?? store.topicMasteries;
  const feedbackRecords = props.feedbackRecords ?? store.feedbackRecords;
  const weaknessPlan = props.weaknessPlan ?? store.weaknessPlan;
  const weaknessMap =
    props.weaknessMap ??
    (feedbackRecords && feedbackRecords.length > 0
      ? WeaknessMap.aggregateFeedback(feedbackRecords)
      : null);

  const [includeTranscripts, setIncludeTranscripts] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const summary = ProgressMetricsService.computeProgressSummary(sessionHistory, topicMasteries);

  const handleExportMarkdown = () => {
    const markdown = ProgressExporter.generateMarkdownReport(
      {
        weaknessMap,
        weaknessPlan,
        sessionHistory,
        topicMasteries,
        feedbackRecords,
      },
      {
        includeTranscripts,
      }
    );

    // Create download trigger
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `interview-progress-report-${new Date().toISOString().split('T')[0]}.md`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyClipboard = () => {
    const markdown = ProgressExporter.generateMarkdownReport(
      {
        weaknessMap,
        weaknessPlan,
        sessionHistory,
        topicMasteries,
        feedbackRecords,
      },
      {
        includeTranscripts,
      }
    );

    navigator.clipboard.writeText(markdown);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📈 Coaching Progress &amp; Metric Evolution
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Track your Structure, Concreteness, and Speech Delivery progression across practice
            rounds.
          </p>
        </div>

        {/* Quick Export Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyClipboard}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            {copiedNotice ? '✓ Copied Report!' : '📋 Copy Report'}
          </button>
          <button
            onClick={handleExportMarkdown}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            📥 Export Markdown (.md)
          </button>
          <button
            onClick={handlePrintPdf}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow transition"
          >
            🖨️ Print / PDF
          </button>
        </div>
      </div>

      {/* Calibration Reminder Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-1">
        <div className="font-bold flex items-center gap-1.5 text-amber-300">
          <span>⚖️ Calibration Reminder</span>
        </div>
        <p className="leading-relaxed text-slate-300">{ProgressExporter.CALIBRATION_REMINDER}</p>
      </div>

      {/* Baseline Status Notice */}
      {summary.isDataThin ? (
        <div
          data-testid="data-thin-banner"
          className="p-5 bg-slate-900 border border-amber-500/30 rounded-2xl space-y-2 text-xs"
        >
          <div className="flex items-center justify-between text-amber-400 font-bold">
            <span>⚠️ Establishing Baseline: Data is Thin</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[11px]">
              {summary.sessionCount} / {ProgressMetricsService.MINIMUM_SESSIONS_FOR_TREND} Sessions
            </span>
          </div>
          <p className="text-slate-300 leading-relaxed">{summary.dataThinMessage}</p>
          <p className="text-[11px] text-slate-400">
            Trend lines are withheld until at least 3 completed practice sessions exist to avoid
            over-indexing on noise.
          </p>
        </div>
      ) : (
        /* Trend Line Section (Only renders when sessionCount >= 3) */
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white text-sm">Cross-Session Skill Trend Lines</h3>
            <div className="flex gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2.5 h-0.5 bg-blue-500 inline-block" /> Structure
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-2.5 h-0.5 bg-purple-500 inline-block" /> Concreteness
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-0.5 bg-emerald-500 inline-block" /> Delivery
              </span>
            </div>
          </div>

          <div
            data-testid="progress-trend-line"
            className="h-44 w-full bg-slate-950/60 rounded-xl p-4 flex flex-col justify-between border border-slate-800"
          >
            {/* SVG Trend Line Graph */}
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 500 100"
              preserveAspectRatio="none"
            >
              {/* Grid Lines */}
              <line x1="0" y1="20" x2="500" y2="20" stroke="#334155" strokeDasharray="3 3" />
              <line x1="0" y1="50" x2="500" y2="50" stroke="#334155" strokeDasharray="3 3" />
              <line x1="0" y1="80" x2="500" y2="80" stroke="#334155" strokeDasharray="3 3" />

              {/* Structure Line (Blue) */}
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                points={summary.metrics
                  .map((m, i) => {
                    const x = (i / Math.max(1, summary.metrics.length - 1)) * 480 + 10;
                    const y = 90 - (m.structureScore / 5) * 80;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Concreteness Line (Purple) */}
              <polyline
                fill="none"
                stroke="#c084fc"
                strokeWidth="2.5"
                points={summary.metrics
                  .map((m, i) => {
                    const x = (i / Math.max(1, summary.metrics.length - 1)) * 480 + 10;
                    const y = 90 - (m.concretenessScore / 5) * 80;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Delivery Line (Emerald) */}
              <polyline
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                points={summary.metrics
                  .map((m, i) => {
                    const x = (i / Math.max(1, summary.metrics.length - 1)) * 480 + 10;
                    const y = 90 - (m.deliveryScore / 5) * 80;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            </svg>

            <div className="flex justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800">
              <span>Session 1</span>
              <span>Session {summary.metrics.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Averages Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-slate-400 block font-semibold uppercase text-[10px]">
            Structure Average
          </span>
          <span className="text-2xl font-black text-blue-400">
            {summary.averageStructure > 0 ? `${summary.averageStructure}/5.0` : '--'}
          </span>
          <span className="text-[10px] text-slate-500 block">Headline + Signposting</span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-slate-400 block font-semibold uppercase text-[10px]">
            Concreteness Average
          </span>
          <span className="text-2xl font-black text-purple-400">
            {summary.averageConcreteness > 0 ? `${summary.averageConcreteness}/5.0` : '--'}
          </span>
          <span className="text-[10px] text-slate-500 block">Examples + Numbers + Tools</span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-slate-400 block font-semibold uppercase text-[10px]">
            Delivery Average
          </span>
          <span className="text-2xl font-black text-emerald-400">
            {summary.averageDelivery > 0 ? `${summary.averageDelivery}/5.0` : '--'}
          </span>
          <span className="text-[10px] text-slate-500 block">Pacing + Low Fillers</span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-slate-400 block font-semibold uppercase text-[10px]">
            Average Speaking Pace
          </span>
          <span className="text-2xl font-black text-amber-400">
            {summary.averageWpm > 0 ? `${summary.averageWpm} WPM` : '--'}
          </span>
          <span className="text-[10px] text-slate-500 block">Target: 120-150 WPM</span>
        </div>
      </div>

      {/* Historical Sessions Table with Confidence Indicators */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <h3 className="font-bold text-white text-sm">Session History &amp; Confidence Rating</h3>

        {summary.metrics.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No completed practice sessions yet. Start a practice round to record your progress.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2 font-semibold">Session</th>
                  <th className="py-2 font-semibold">Round Type</th>
                  <th className="py-2 font-semibold">Structure</th>
                  <th className="py-2 font-semibold">Concreteness</th>
                  <th className="py-2 font-semibold">Delivery</th>
                  <th className="py-2 font-semibold">Speaking Pace</th>
                  <th className="py-2 font-semibold">Score Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {summary.metrics.map((m) => (
                  <tr key={m.sessionId} className="hover:bg-slate-800/30">
                    <td className="py-3 font-semibold text-slate-200">{m.sessionId}</td>
                    <td className="py-3 capitalize text-slate-300">
                      {m.roundType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 text-blue-400 font-bold">{m.structureScore} / 5</td>
                    <td className="py-3 text-purple-400 font-bold">{m.concretenessScore} / 5</td>
                    <td className="py-3 text-emerald-400 font-bold">{m.deliveryScore} / 5</td>
                    <td className="py-3 text-slate-300">{m.speakingPaceWpm} WPM</td>
                    <td className="py-3">
                      {m.confidence === 'high' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          High Confidence (LLM Verified)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Low Confidence (Estimated)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Options & Privacy Controls */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <h3 className="font-bold text-white text-sm">Privacy &amp; Export Configuration</h3>
        <p className="text-xs text-slate-400">
          Exports compile your weakness map, 7-day practice plan, calibration reminders, and
          progress charts into clean, shareable formats.
        </p>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTranscripts}
              onChange={(e) => setIncludeTranscripts(e.target.checked)}
              className="mt-0.5 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <div>
              <span className="text-xs font-semibold text-slate-200 block">
                Include raw candidate transcripts in export (Opt-In Only)
              </span>
              <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
                By default, reports never include your spoken transcript text to protect
                confidential company details or private stories. Check this box only if you wish to
                export full transcripts.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
