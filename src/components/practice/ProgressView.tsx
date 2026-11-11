import { copyToClipboard } from '../../utils/clipboard';
import React, { useState } from "react";
import { usePracticeStore } from "../../store/usePracticeStore";
import { ProgressMetricsService } from "../../services/practice/feedback/ProgressMetricsService";
import { ProgressExporter } from "../../services/practice/feedback/ProgressExporter";
import { WeaknessMap } from "../../services/practice/feedback/WeaknessMap";
import {
  TrendingUp,
  Download,
  Copy,
  Printer,
  Check,
  ShieldCheck,
  Activity,
  Layers,
  Zap,
  Gauge,
  Sparkles,
} from "lucide-react";

import {
  MockSessionState,
  TopicMastery,
  WeaknessMapResult,
  WeaknessPracticePlan,
  FeedbackRecord,
} from "../../services/practice/types";

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

  const handleExportMarkdown = async () => {
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
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `interview-progress-report-${new Date().toISOString().split("T")[0]}.md`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyClipboard = async () => {
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

    await copyToClipboard(markdown);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-indigo-950/40 backdrop-blur-xl border border-slate-800/90 rounded-2xl flex flex-wrap justify-between items-center gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
              📈 Coaching Progress &amp; Metric Evolution
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Telemetry Analytics
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
            Track your Structure, Concreteness, and Speech Delivery progression across practice
            rounds.
          </p>
        </div>

        {/* Quick Export Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopyClipboard}
            className="card-interactive px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700/80 shadow transition flex items-center gap-1.5"
          >
            {copiedNotice ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copiedNotice ? "✓ Copied Report!" : "📋 Copy Report"}</span>
          </button>
          <button
            onClick={handleExportMarkdown}
            className="card-interactive px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5 border border-indigo-400/30"
          >
            <Download size={13} />
            <span>📥 Export Markdown (.md)</span>
          </button>
          <button
            onClick={handlePrintPdf}
            className="card-interactive px-3 py-1.5 bg-purple-600/90 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-purple-600/25 transition flex items-center gap-1.5 border border-purple-400/30"
          >
            <Printer size={13} />
            <span>🖨️ Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Calibration Reminder Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-1 shadow-sm backdrop-blur-sm">
        <div className="font-bold flex items-center gap-1.5 text-amber-300">
          <span>⚖️ Calibration Reminder</span>
        </div>
        <p className="leading-relaxed text-slate-300">{ProgressExporter.CALIBRATION_REMINDER}</p>
      </div>

      {/* Baseline Status Notice */}
      {summary.isDataThin ? (
        <div
          data-testid="data-thin-banner"
          className="p-5 bg-slate-900/90 border border-amber-500/30 rounded-2xl space-y-2 text-xs backdrop-blur-sm shadow-md"
        >
          <div className="flex items-center justify-between text-amber-400 font-bold">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>⚠️ Establishing Baseline: Data is Thin</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-[11px] border border-amber-500/30 font-mono">
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
        <div className="p-6 bg-slate-900/90 border border-slate-800/90 rounded-2xl space-y-4 shadow-xl backdrop-blur-xl">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-400" />
              <span>Cross-Session Skill Trend Lines</span>
            </h3>
            <div className="flex gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                <span className="w-2.5 h-1 rounded-full bg-blue-500 inline-block shadow-sm" /> Structure
              </span>
              <span className="flex items-center gap-1.5 text-purple-400 font-medium">
                <span className="w-2.5 h-1 rounded-full bg-purple-500 inline-block shadow-sm" /> Concreteness
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2.5 h-1 rounded-full bg-emerald-500 inline-block shadow-sm" /> Delivery
              </span>
            </div>
          </div>

          <div
            data-testid="progress-trend-line"
            className="h-48 w-full bg-slate-950/70 rounded-xl p-4 flex flex-col justify-between border border-slate-800 shadow-inner"
          >
            {/* SVG Trend Line Graph */}
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 500 100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="gridGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#334155" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="#475569" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#334155" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="20" x2="500" y2="20" stroke="url(#gridGlow)" strokeDasharray="3 3" />
              <line x1="0" y1="50" x2="500" y2="50" stroke="url(#gridGlow)" strokeDasharray="3 3" />
              <line x1="0" y1="80" x2="500" y2="80" stroke="url(#gridGlow)" strokeDasharray="3 3" />

              {/* Structure Line (Blue) */}
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={summary.metrics
                  .filter((m) => m.structureScore !== null)
                  .map((m, i, measured) => {
                    const x = (i / Math.max(1, measured.length - 1)) * 480 + 10;
                    const y = 90 - ((m.structureScore ?? 0) / 5) * 80;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />

              {/* Concreteness Line (Purple) */}
              <polyline
                fill="none"
                stroke="#c084fc"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={summary.metrics
                  .filter((m) => m.concretenessScore !== null)
                  .map((m, i, measured) => {
                    const x = (i / Math.max(1, measured.length - 1)) * 480 + 10;
                    const y = 90 - ((m.concretenessScore ?? 0) / 5) * 80;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />

              {/* Delivery Line (Emerald) */}
              <polyline
                fill="none"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={summary.metrics
                  .filter((m) => m.deliveryScore !== null)
                  .map((m, i, measured) => {
                    const x = (i / Math.max(1, measured.length - 1)) * 480 + 10;
                    const y = 90 - ((m.deliveryScore ?? 0) / 5) * 80;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>

            <div className="flex justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
              <span className="font-mono">Session 1</span>
              <span className="font-mono">Session {summary.metrics.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Averages Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="card-interactive p-4 bg-slate-900/80 border border-slate-800/80 rounded-xl space-y-1 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
              Structure Average
            </span>
            <Layers size={14} className="text-blue-400/80" />
          </div>
          <span className="text-2xl font-black text-blue-400 tracking-tight block">
            {summary.averageStructure > 0 ? `${summary.averageStructure}/5.0` : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block">Headline + Signposting</span>
        </div>

        <div className="card-interactive p-4 bg-slate-900/80 border border-slate-800/80 rounded-xl space-y-1 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
              Concreteness Average
            </span>
            <Zap size={14} className="text-purple-400/80" />
          </div>
          <span className="text-2xl font-black text-purple-400 tracking-tight block">
            {summary.averageConcreteness > 0 ? `${summary.averageConcreteness}/5.0` : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block">Examples + Numbers + Tools</span>
        </div>

        <div className="card-interactive p-4 bg-slate-900/80 border border-slate-800/80 rounded-xl space-y-1 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
              Delivery Average
            </span>
            <Activity size={14} className="text-emerald-400/80" />
          </div>
          <span className="text-2xl font-black text-emerald-400 tracking-tight block">
            {summary.averageDelivery > 0 ? `${summary.averageDelivery}/5.0` : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block">Pacing + Low Fillers</span>
        </div>

        <div className="card-interactive p-4 bg-slate-900/80 border border-slate-800/80 rounded-xl space-y-1 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
              Average Speaking Pace
            </span>
            <Gauge size={14} className="text-amber-400/80" />
          </div>
          <span className="text-2xl font-black text-amber-400 tracking-tight block">
            {summary.averageWpm > 0 ? `${summary.averageWpm} WPM` : "--"}
          </span>
          <span className="text-[10px] text-slate-500 block">Target: 120-150 WPM</span>
        </div>
      </div>

      {/* Historical Sessions Table with Confidence Indicators */}
      <div className="p-6 bg-slate-900/90 border border-slate-800/90 rounded-2xl space-y-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <span>Session History &amp; Confidence Rating</span>
          </h3>
          {summary.metrics.length > 0 && (
            <span className="text-xs text-slate-400">
              Total {summary.metrics.length} {summary.metrics.length === 1 ? "round" : "rounds"}
            </span>
          )}
        </div>

        {summary.metrics.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center text-xl">
              📈
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              No completed practice sessions yet. Start a practice round to record your progress.
            </p>
            <button
              type="button"
              onClick={() => store.setActiveTab("arena")}
              className="card-interactive px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition inline-flex items-center gap-1.5"
            >
              <span>🏋️ Launch Rehearsal Session</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2.5 px-2 font-semibold">Session</th>
                  <th className="py-2.5 px-2 font-semibold">Round Type</th>
                  <th className="py-2.5 px-2 font-semibold">Structure</th>
                  <th className="py-2.5 px-2 font-semibold">Concreteness</th>
                  <th className="py-2.5 px-2 font-semibold">Delivery</th>
                  <th className="py-2.5 px-2 font-semibold">Speaking Pace</th>
                  <th className="py-2.5 px-2 font-semibold">Score Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {summary.metrics.map((m) => (
                  <tr key={m.sessionId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-2 font-semibold text-slate-200 font-mono text-[11px]">
                      {m.sessionId}
                    </td>
                    <td className="py-3 px-2 capitalize text-slate-300">
                      {m.roundType.replace(/_/g, " ")}
                    </td>
                    <td className="py-3 px-2 text-blue-400 font-bold">{m.structureScore === null ? "--" : `${m.structureScore} / 5`}</td>
                    <td className="py-3 px-2 text-purple-400 font-bold">{m.concretenessScore === null ? "--" : `${m.concretenessScore} / 5`}</td>
                    <td className="py-3 px-2 text-emerald-400 font-bold">{m.deliveryScore === null ? "--" : `${m.deliveryScore} / 5`}</td>
                    <td className="py-3 px-2 text-slate-300 font-mono">{m.speakingPaceWpm === null ? "--" : `${m.speakingPaceWpm} WPM`}</td>
                    <td className="py-3 px-2">
                      {m.confidence === "llm_assisted" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          LLM-assisted (not independently verified)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-semibold shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Heuristic estimate (low confidence)
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
      <div className="p-6 bg-slate-900/90 border border-slate-800/90 rounded-2xl space-y-4 shadow-xl backdrop-blur-xl">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400" />
          <span>Privacy &amp; Export Configuration</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Exports compile your weakness map, 7-day practice plan, calibration reminders, and
          progress charts into clean, shareable formats.
        </p>

        <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-3">
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
