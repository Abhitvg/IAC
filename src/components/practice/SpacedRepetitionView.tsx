import React from "react";
import { usePracticeStore } from "../../store/usePracticeStore";
import { SpacedScheduler } from "../../services/practice/SpacedScheduler";
import { TopicMastery } from "../../services/practice/types";

export const SpacedRepetitionView: React.FC = () => {
  const { topicMasteries, startMockSession } = usePracticeStore();

  const dailyQueue = SpacedScheduler.getDailyPracticeQueue(topicMasteries, 4);

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "DSA":
        return "text-indigo-400 border-indigo-500/30 bg-indigo-500/10";
      case "System Design":
        return "text-purple-400 border-purple-500/30 bg-purple-500/10";
      case "Behavioral":
        return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
      default:
        return "text-sky-400 border-sky-500/30 bg-sky-500/10";
    }
  };

  const handleLaunchTopic = (topic: TopicMastery) => {
    let roundType: any = "dsa_coding";
    if (topic.category === "System Design") roundType = "system_design";
    else if (topic.category === "Behavioral") roundType = "behavioral";
    startMockSession(roundType);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Spaced Repetition & Topic Mastery (SM-2)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          The SM-2 algorithm schedules drills based on your weakest gaps so you never waste time practicing what you already master.
        </p>
      </div>

      {/* Today's Priority Practice Queue */}
      <div className="p-5 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-2xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Today's Recommended Queue
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              Targeted Drills Based on Lowest Retention
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            {dailyQueue.length} Drills Due Today
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dailyQueue.map((item) => (
            <div
              key={item.topicId}
              className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex justify-between items-center hover:border-slate-700 transition"
            >
              <div className="space-y-1">
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getCategoryColor(
                    item.category
                  )}`}
                >
                  {item.category}
                </span>
                <h4 className="text-xs font-bold text-white">{item.topicName}</h4>
                <div className="text-[11px] text-slate-400">
                  Mastery: <span className="text-indigo-300 font-semibold">{item.masteryScore}%</span> | Ease: {item.easeFactor}
                </div>
              </div>
              <button
                onClick={() => handleLaunchTopic(item)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition"
              >
                Practice Drill
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* All Topic Mastery Status */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-300">
          All Curriculum Topics & Mastery Levels
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {topicMasteries.map((topic) => (
            <div
              key={topic.topicId}
              className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5"
            >
              <div className="flex justify-between items-center">
                <div>
                  <span
                    className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${getCategoryColor(
                      topic.category
                    )}`}
                  >
                    {topic.category}
                  </span>
                  <h4 className="text-xs font-bold text-white mt-1">{topic.topicName}</h4>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-white">
                    {topic.masteryScore}%
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {topic.repetitions} reviews
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    topic.masteryScore >= 75
                      ? "bg-emerald-500"
                      : topic.masteryScore >= 45
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(5, topic.masteryScore)}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                <span>Interval: {topic.intervalDays} days</span>
                <span>
                  Next Review:{" "}
                  {new Date(topic.nextReviewDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
