import React from "react";
import { RubricEvaluation, DeliveryMetrics } from "../../services/practice/types";

interface Props {
  evaluation?: RubricEvaluation;
  delivery?: DeliveryMetrics;
  modelAnswer?: string;
}

export const EvidenceScorecard: React.FC<Props> = ({ evaluation, delivery, modelAnswer }) => {
  if (!evaluation && !delivery) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400">
        No evaluation recorded yet. Submit your answer to see evidence-based scoring.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-200">
      {/* Top Banner with Overall Score & Delivery Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {evaluation && (
          <div className="p-5 bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/30 rounded-xl shadow-lg">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                  Rubric Assessment
                </span>
                <div className="text-3xl font-extrabold text-white mt-1">
                  {evaluation.overallScore.toFixed(1)} / 5.0
                </div>
              </div>
              <div className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                {evaluation.percentage}% Score
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-300">
              Evaluated against fixed criteria with quoted verbatim evidence.
            </div>
          </div>
        )}

        {delivery && (
          <div className="p-5 bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-500/30 rounded-xl shadow-lg">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                  Delivery & Articulation
                </span>
                <div className="text-3xl font-extrabold text-white mt-1">
                  {delivery.deliveryScore.toFixed(1)} / 5.0
                </div>
              </div>
              <div className="flex gap-1.5">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {delivery.speakingPaceWpm} WPM
                </span>
                {delivery.isRambling && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                    Rambling &gt;2m
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-300">
              {delivery.deliveryFeedback}
            </div>
          </div>
        )}
      </div>

      {/* Delivery Metrics Details */}
      {delivery && (
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl">
          <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Speech Metrics Diagnostics
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400 block">Speaking Pace:</span>
              <span className="text-sm font-bold text-white">{delivery.speakingPaceWpm} WPM</span>
              <span className="text-[10px] text-slate-400 block capitalize">({delivery.paceCategory} tempo)</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400 block">Filler Words:</span>
              <span className="text-sm font-bold text-white">{delivery.fillerWordsCount} ({delivery.fillerPercentage}%)</span>
              <span className="text-[10px] text-slate-400 block">target: &lt; 3.0%</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400 block">Hesitation to Start:</span>
              <span className="text-sm font-bold text-white">{delivery.timeToFirstSentenceSeconds}s</span>
              <span className="text-[10px] text-slate-400 block">ideal: 1.0 - 3.0s</span>
            </div>
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80">
              <span className="text-slate-400 block">Duration:</span>
              <span className="text-sm font-bold text-white">{delivery.durationSeconds}s</span>
              <span className="text-[10px] text-slate-400 block">{delivery.isRambling ? "Too long (rambling)" : "Crisp milestone"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Dimension by Dimension Breakdown with Evidence Quotes */}
      {evaluation && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            Evidence-Based Rubric Dimensions
          </h4>

          <div className="space-y-3">
            {evaluation.dimensions.map((dim, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-white">{dim.name}</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                    {dim.score.toFixed(1)} / {dim.maxScore}
                  </span>
                </div>

                <p className="text-xs text-slate-300">{dim.feedback}</p>

                {dim.evidenceQuote && (
                  <div className="p-2.5 bg-emerald-950/30 border-l-2 border-emerald-500 rounded text-xs text-emerald-200">
                    <span className="font-semibold text-emerald-400 block text-[10px] uppercase">
                      Exact Quote from Candidate:
                    </span>
                    "{dim.evidenceQuote}"
                  </div>
                )}

                {dim.missingAspect && (
                  <div className="p-2.5 bg-rose-950/30 border-l-2 border-rose-500 rounded text-xs text-rose-200">
                    <span className="font-semibold text-rose-400 block text-[10px] uppercase">
                      Missing from Transcript:
                    </span>
                    {dim.missingAspect}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Leverage Fixes */}
      {evaluation && evaluation.topLeverageFixes.length > 0 && (
        <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Top Leverage Adjustments for Next Round
          </h4>
          <ul className="space-y-1.5 text-xs text-amber-200">
            {evaluation.topLeverageFixes.map((fix, idx) => (
              <li key={idx} className="flex gap-2 items-start">
                <span className="font-bold text-amber-400">{idx + 1}.</span>
                <span>{fix}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Side-by-Side Model Answer Comparison */}
      {(modelAnswer || evaluation?.modelAnswer) && (
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
          <h4 className="text-sm font-semibold text-indigo-300">
            Gold-Standard Model Answer
          </h4>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-200 whitespace-pre-line leading-relaxed font-mono">
            {modelAnswer || evaluation?.modelAnswer}
          </div>
        </div>
      )}
    </div>
  );
};
