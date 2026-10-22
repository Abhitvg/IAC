import React, { useState } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { SpacedScheduler } from '../../services/practice/SpacedScheduler';
import { TopicMastery } from '../../services/practice/types';

export const SpacedRepetitionView: React.FC = () => {
  const { topicMasteries, startMockSession, importCustomQuestionPack } = usePracticeStore();
  const [showImporter, setShowImporter] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success?: boolean; message?: string } | null>(
    null
  );

  const dailyQueue = SpacedScheduler.getDailyPracticeQueue(topicMasteries, 4);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const res = importCustomQuestionPack(content);
        if (res.success) {
          setImportStatus({
            success: true,
            message: `Successfully imported ${res.importedCount} questions into your practice bank!`,
          });
        } else {
          setImportStatus({
            success: false,
            message: res.errors?.join(', ') || 'Failed to validate custom question pack.',
          });
        }
      } catch {
        setImportStatus({
          success: false,
          message: 'Unable to parse JSON file structure.',
        });
      }
    };
    reader.readAsText(file);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'DSA':
        return 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10';
      case 'System Design':
        return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
      case 'Behavioral':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      default:
        return 'text-sky-400 border-sky-500/30 bg-sky-500/10';
    }
  };

  const handleLaunchTopic = (topic: TopicMastery) => {
    let roundType: any = 'dsa_coding';
    if (topic.category === 'System Design') roundType = 'system_design';
    else if (topic.category === 'Behavioral') roundType = 'behavioral';
    startMockSession(roundType);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Spaced Repetition &amp; Topic Mastery (SM-2)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            The SM-2 algorithm schedules drills based on your weakest gaps so you never waste time
            practicing what you already master.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowImporter(!showImporter)}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
          aria-label="Toggle Custom Question Pack Import"
        >
          📥 Import Question Pack
        </button>
      </div>

      {/* Custom Pack Import Drawer */}
      {showImporter && (
        <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-xl space-y-3">
          <h4 className="text-xs font-bold uppercase text-indigo-400">
            Import Custom Question Pack (.json)
          </h4>
          <p className="text-xs text-slate-300">
            Upload a JSON file matching schema:{' '}
            <code>[&#123; id, type, topic, prompt, expectedPoints &#125;]</code>
          </p>
          <input
            type="file"
            accept=".json"
            onChange={handleFileImport}
            className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
            aria-label="Select Custom Question Pack JSON file"
          />
          {importStatus && (
            <div
              role="alert"
              className={`p-2.5 rounded-lg text-xs font-medium border ${
                importStatus.success
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              }`}
            >
              {importStatus.message}
            </div>
          )}
        </div>
      )}

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
                  Mastery:{' '}
                  <span className="text-indigo-300 font-semibold">{item.masteryScore}%</span> |
                  Ease: {item.easeFactor}
                </div>
              </div>
              <button
                onClick={() => handleLaunchTopic(item)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition"
                aria-label={`Practice drill for ${item.topicName}`}
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
          All Curriculum Topics &amp; Mastery Levels
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
                  <span className="text-sm font-extrabold text-white">{topic.masteryScore}%</span>
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
                      ? 'bg-emerald-500'
                      : topic.masteryScore >= 45
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.max(5, topic.masteryScore)}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                <span>Interval: {topic.intervalDays} days</span>
                <span>
                  Next Review:{' '}
                  {new Date(topic.nextReviewDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
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
