import React from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';

export const DeliveryTrendsView: React.FC = () => {
  const { sessionHistory } = usePracticeStore();

  const sessionsWithDelivery = sessionHistory
    .filter((s) => s.questionHistory.some((q) => q.delivery))
    .slice(0, 10)
    .reverse();

  const sessionCount = sessionsWithDelivery.length;
  const hasSufficientData = sessionCount >= 3;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Speech & Delivery Performance Trends
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Delivery improves rapidly once you track the numbers: filler words, speaking pace (WPM),
          hesitation, and rambling.
        </p>
      </div>

      {sessionCount === 0 ? (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 text-xs">
          No delivery history recorded yet. Complete practice sessions to see your speech metrics
          trend over time.
        </div>
      ) : (
        <div className="space-y-4">
          {!hasSufficientData && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-center justify-between">
              <div>
                <span className="font-bold">Establishing Baseline: </span>
                <span>
                  A minimum of three completed sessions is required before drawing trend
                  conclusions. Currently recorded: {sessionCount}/3 sessions.
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 font-semibold">
                {3 - sessionCount} more needed
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-bold uppercase text-slate-400">Average Pacing</span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {hasSufficientData ? (
                  <>
                    {Math.round(
                      sessionsWithDelivery.reduce((acc, s) => {
                        const d = s.questionHistory.find((q) => q.delivery)?.delivery;
                        return acc + (d?.speakingPaceWpm || 130);
                      }, 0) / sessionsWithDelivery.length
                    )}{' '}
                    <span className="text-sm font-normal text-slate-400">WPM</span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-slate-500 italic">
                    Needs &ge; 3 sessions
                  </span>
                )}
              </div>
              <span className="text-[10px] text-emerald-400">Target: 120 - 160 WPM</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-bold uppercase text-slate-400">
                Average Filler Density
              </span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {hasSufficientData ? (
                  <>
                    {(
                      sessionsWithDelivery.reduce((acc, s) => {
                        const d = s.questionHistory.find((q) => q.delivery)?.delivery;
                        return acc + (d?.fillerPercentage || 0);
                      }, 0) / sessionsWithDelivery.length
                    ).toFixed(1)}
                    %
                  </>
                ) : (
                  <span className="text-sm font-normal text-slate-500 italic">
                    Needs &ge; 3 sessions
                  </span>
                )}
              </div>
              <span className="text-[10px] text-emerald-400">Target: &lt; 3.0%</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-bold uppercase text-slate-400">Rambling Incidents</span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {hasSufficientData ? (
                  <>
                    {
                      sessionsWithDelivery.filter((s) =>
                        s.questionHistory.some((q) => q.delivery?.isRambling)
                      ).length
                    }{' '}
                    <span className="text-sm font-normal text-slate-400">
                      / {sessionsWithDelivery.length} rounds
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-slate-500 italic">
                    Needs &ge; 3 sessions
                  </span>
                )}
              </div>
              <span className="text-[10px] text-amber-400">Answers &gt; 120s flagged</span>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-bold uppercase text-indigo-400">Structure Score</span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {hasSufficientData ? (
                  <>
                    {(
                      sessionsWithDelivery.reduce((acc, s) => {
                        const evalData = s.questionHistory.find((q) => q.evaluation)?.evaluation;
                        const score =
                          evalData?.structureAnalysis?.structureScore ||
                          evalData?.dimensions?.find((d) =>
                            d.name.toLowerCase().includes('structure')
                          )?.score ||
                          3.0;
                        return acc + score;
                      }, 0) / sessionsWithDelivery.length
                    ).toFixed(1)}{' '}
                    <span className="text-sm font-normal text-slate-400">/ 5.0</span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-slate-500 italic">
                    Needs &ge; 3 sessions
                  </span>
                )}
              </div>
              <span className="text-[10px] text-indigo-400">Headline + Signposting</span>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-bold uppercase text-emerald-400">
                Concreteness Score
              </span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {hasSufficientData ? (
                  <>
                    {(
                      sessionsWithDelivery.reduce((acc, s) => {
                        const evalData = s.questionHistory.find((q) => q.evaluation)?.evaluation;
                        const score =
                          evalData?.concretenessAnalysis?.concretenessScore ||
                          evalData?.dimensions?.find((d) =>
                            d.name.toLowerCase().includes('concrete')
                          )?.score ||
                          3.0;
                        return acc + score;
                      }, 0) / sessionsWithDelivery.length
                    ).toFixed(1)}{' '}
                    <span className="text-sm font-normal text-slate-400">/ 5.0</span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-slate-500 italic">
                    Needs &ge; 3 sessions
                  </span>
                )}
              </div>
              <span className="text-[10px] text-emerald-400">Numbers + Tool Names</span>
            </div>
          </div>

          {/* Historical Session Rows */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-white">Recent Session Metrics</h3>
            <div className="space-y-2">
              {sessionsWithDelivery.map((session, idx) => {
                const delivery = session.questionHistory.find((q) => q.delivery)?.delivery;
                const evalData = session.questionHistory.find((q) => q.evaluation)?.evaluation;

                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center text-xs"
                  >
                    <div>
                      <div className="flex gap-2 items-center">
                        <span className="font-bold text-white capitalize">
                          {session.roundType.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(
                            session.questionHistory[0]?.evaluation?.assessedAt || Date.now()
                          ).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {session.questionHistory[0]?.question}
                      </p>
                    </div>

                    <div className="flex gap-4 items-center">
                      <div className="flex gap-2 items-center">
                        {evalData?.structureAnalysis && (
                          <span className="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-800/50 text-[10px] text-indigo-300 font-bold">
                            Struct: {evalData.structureAnalysis.structureScore}/5
                          </span>
                        )}
                        {evalData?.concretenessAnalysis && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/50 text-[10px] text-emerald-300 font-bold">
                            Concrete: {evalData.concretenessAnalysis.concretenessScore}/5
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-white block">
                          {delivery?.speakingPaceWpm || 0} WPM
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {delivery?.fillerWordsCount || 0} fillers (
                          {delivery?.fillerPercentage || 0}%)
                        </span>
                      </div>

                      <div className="px-3 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold">
                        {evalData?.overallScore.toFixed(1) || '3.5'} / 5.0
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
