import React, { useState } from "react";
import { usePracticeStore } from "../../store/usePracticeStore";
import { StoryBank } from "../../services/practice/StoryBank";
import { BehavioralStory, BehavioralCompetency } from "../../services/practice/types";

export const StoryBankView: React.FC = () => {
  const { storyBank, loadStoryBankFromResume, saveStory, deleteStory } = usePracticeStore();
  const [resumeInput, setResumeInput] = useState("");
  const [showExtractor, setShowExtractor] = useState(false);
  const [editingStory, setEditingStory] = useState<Partial<BehavioralStory> | null>(null);

  const coverageReport = StoryBank.analyzeCoverage(storyBank);

  const competencyLabels: Record<BehavioralCompetency, { name: string; desc: string }> = {
    leadership: { name: "Leadership & Influence", desc: "Initiative, mentoring, cross-team consensus" },
    conflict: { name: "Conflict & Disagreement", desc: "Navigating peer pushback, technical debates" },
    failure_postmortem: { name: "Failure & Accountability", desc: "Production incidents, mistakes, postmortems" },
    ambiguity: { name: "Ambiguity & Velocity", desc: "Moving fast without specs, 0-to-1 execution" },
    high_impact_scale: { name: "Scale & Measurable Impact", desc: "Latency reduction, revenue, cost savings" },
  };

  const handleSave = () => {
    if (!editingStory || !editingStory.title) return;
    const story: BehavioralStory = {
      id: editingStory.id || `story-${Date.now()}`,
      title: editingStory.title || "Untitled Story",
      companyProject: editingStory.companyProject || "Independent",
      situation: editingStory.situation || "",
      task: editingStory.task || "",
      action: editingStory.action || "",
      result: editingStory.result || "",
      metrics: editingStory.metrics || [],
      competencies: editingStory.competencies || ["high_impact_scale"],
    };
    saveStory(story);
    setEditingStory(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Behavioral Story Bank & Competency Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Map past experiences to the STAR framework so you never ramble or freeze under behavioral rounds.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExtractor(!showExtractor)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
          >
            Extract from Resume
          </button>
          <button
            onClick={() =>
              setEditingStory({
                title: "",
                companyProject: "",
                situation: "",
                task: "",
                action: "",
                result: "",
                competencies: ["leadership"],
              })
            }
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
          >
            + Add Story
          </button>
        </div>
      </div>

      {/* Resume Extraction Drawer */}
      {showExtractor && (
        <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-xl space-y-3">
          <h4 className="text-xs font-bold uppercase text-indigo-400">
            Paste Resume / Project Bullets to Auto-Extract STAR Stories
          </h4>
          <textarea
            value={resumeInput}
            onChange={(e) => setResumeInput(e.target.value)}
            placeholder="Paste raw resume text or bullet points here..."
            className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowExtractor(false)}
              className="px-3 py-1 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (resumeInput.trim()) {
                  loadStoryBankFromResume(resumeInput);
                  setResumeInput("");
                  setShowExtractor(false);
                }
              }}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
            >
              Run Extractor
            </button>
          </div>
        </div>
      )}

      {/* Competency Coverage Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(competencyLabels) as BehavioralCompetency[]).map((comp) => {
          const count = coverageReport.coverage[comp] || 0;
          const isMissing = count === 0;
          return (
            <div
              key={comp}
              className={`p-3.5 rounded-xl border ${
                isMissing
                  ? "bg-rose-950/20 border-rose-500/30 text-rose-200"
                  : "bg-slate-900 border-slate-800 text-slate-200"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold">{competencyLabels[comp].name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-extrabold ${
                    isMissing
                      ? "bg-rose-500/30 text-rose-300"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {count} stories
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                {competencyLabels[comp].desc}
              </p>
              {isMissing && (
                <div className="mt-2 text-[10px] font-semibold text-rose-400">
                  ⚠️ Critical Gap: 0 stories
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gap Alerts */}
      {coverageReport.gapAlerts.length > 0 && (
        <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-1.5">
          <div className="text-xs font-bold uppercase text-amber-400">
            Coverage Warnings ({coverageReport.coveragePercentage}% Ready)
          </div>
          {coverageReport.gapAlerts.map((alert, i) => (
            <div key={i} className="text-xs text-amber-200 flex items-start gap-1.5">
              <span>•</span>
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}

      {/* Story List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-300">
          Saved Stories ({storyBank.length})
        </h3>
        {storyBank.length === 0 ? (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
            No stories recorded yet. Click "Extract from Resume" or "+ Add Story" to build your bank.
          </div>
        ) : (
          storyBank.map((story) => (
            <div
              key={story.id}
              className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-bold text-white">{story.title}</h4>
                  <span className="text-xs text-indigo-400">{story.companyProject}</span>
                </div>
                <div className="flex gap-1.5">
                  {story.competencies.map((c) => (
                    <span
                      key={c}
                      className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                    >
                      {c.replace("_", " ")}
                    </span>
                  ))}
                  <button
                    onClick={() => deleteStory(story.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 ml-2"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                <div>
                  <span className="font-semibold text-slate-400">Situation:</span> {story.situation}
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Task:</span> {story.task}
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Action:</span> {story.action}
                </div>
                <div>
                  <span className="font-semibold text-emerald-400">Result:</span> {story.result}
                </div>
              </div>

              {story.metrics && story.metrics.length > 0 && (
                <div className="flex gap-1.5 items-center pt-1">
                  <span className="text-[10px] text-slate-400 font-semibold">Metrics:</span>
                  {story.metrics.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-mono border border-emerald-500/20"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit/Create Story Modal */}
      {editingStory && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">Create / Edit Behavioral Story</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Story Headline / Title</label>
                <input
                  type="text"
                  value={editingStory.title || ""}
                  onChange={(e) => setEditingStory({ ...editingStory, title: e.target.value })}
                  placeholder="e.g. Monolith to Microservices Migration under Zero Downtime"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Company / Project Context</label>
                <input
                  type="text"
                  value={editingStory.companyProject || ""}
                  onChange={(e) => setEditingStory({ ...editingStory, companyProject: e.target.value })}
                  placeholder="e.g. Acme Payments (Staff Engineer)"
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Situation (Context in 20 seconds)</label>
                <textarea
                  value={editingStory.situation || ""}
                  onChange={(e) => setEditingStory({ ...editingStory, situation: e.target.value })}
                  className="w-full h-16 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Task (Your specific responsibility)</label>
                <textarea
                  value={editingStory.task || ""}
                  onChange={(e) => setEditingStory({ ...editingStory, task: e.target.value })}
                  className="w-full h-16 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Action (What YOU personally did - use 'I')</label>
                <textarea
                  value={editingStory.action || ""}
                  onChange={(e) => setEditingStory({ ...editingStory, action: e.target.value })}
                  className="w-full h-20 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-emerald-400 block mb-1 font-bold">Result & Hard Business Metrics</label>
                <textarea
                  value={editingStory.result || ""}
                  onChange={(e) => setEditingStory({ ...editingStory, result: e.target.value })}
                  placeholder="e.g. Reduced p99 latency from 450ms to 90ms, saving $14,000/month."
                  className="w-full h-16 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingStory(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg"
              >
                Save Story
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
