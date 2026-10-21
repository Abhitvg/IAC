import React, { useState } from "react";
import { usePracticeStore } from "../../store/usePracticeStore";
import { MockRoundType, InterviewPersona } from "../../services/practice/types";
import { MockPressureRoom } from "./MockPressureRoom";
import { StoryBankView } from "./StoryBankView";
import { SpacedRepetitionView } from "./SpacedRepetitionView";
import { CompanyPrepView } from "./CompanyPrepView";
import { DeliveryTrendsView } from "./DeliveryTrendsView";

export const MockGymView: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeSession,
    startMockSession,
  } = usePracticeStore();

  const [selectedPersona, setSelectedPersona] = useState<InterviewPersona>("strict_big_tech");
  const [interruptionEnabled, setInterruptionEnabled] = useState(true);
  const [showLauncher, setShowLauncher] = useState(false);

  const handleLaunch = (roundType: MockRoundType) => {
    startMockSession(roundType, selectedPersona, interruptionEnabled);
    setShowLauncher(false);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sub-Header Navigation */}
      <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
        <div className="flex gap-2">
          {[
            { id: "arena", label: "Mock Arena" },
            { id: "story_bank", label: "Story Bank (STAR)" },
            { id: "spaced_drills", label: "Spaced Repetition" },
            { id: "company_prep", label: "Company Prep" },
            { id: "delivery_trends", label: "Delivery Trends" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={interruptionEnabled}
              onChange={(e) => setInterruptionEnabled(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-indigo-600"
            />
            <span>Pressure Interruptions</span>
          </label>

          <button
            onClick={() => setShowLauncher(true)}
            className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold shadow transition"
          >
            + Start Practice Round
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
        {activeTab === "arena" && (
          activeSession ? (
            <MockPressureRoom />
          ) : (
            <div className="space-y-6">
              {/* Hero Banner */}
              <div className="p-8 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-3xl space-y-4">
                <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
                  Evidence-Based Interview Practice Gym
                </span>
                <h1 className="text-3xl font-black text-white leading-tight">
                  Perform Under Real Pressure.
                </h1>
                <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                  Real interviews are decided in the second and third question. Train against an AI interviewer with visible countdown timers, realistic notetaking pauses, mid-answer interruptions, and strict rubric evidence.
                </p>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => handleLaunch("dress_rehearsal")}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-lg transition"
                  >
                    🚀 Start 45-Min Full Dress Rehearsal
                  </button>
                  <button
                    onClick={() => handleLaunch("dsa_coding")}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    DSA Coding Sprint (25m)
                  </button>
                  <button
                    onClick={() => handleLaunch("system_design")}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    System Design Deep Dive (35m)
                  </button>
                  <button
                    onClick={() => handleLaunch("behavioral")}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    Behavioral STAR Drill (15m)
                  </button>
                </div>
              </div>

              {/* Feature Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                  <span className="text-lg">🎯</span>
                  <h3 className="font-bold text-white text-sm">Evidence, Not Vibes</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Evaluates Problem Understanding, Big-O Complexity, Testing, and STAR ownership. Quotes your exact transcript words that won or lost points.
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                  <span className="text-lg">⚡</span>
                  <h3 className="font-bold text-white text-sm">Targeted Weakness Follow-ups</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Reverses follow-up prediction to probe the weakest part of what you said ("You mentioned caching, what is your invalidation strategy?").
                  </p>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                  <span className="text-lg">📊</span>
                  <h3 className="font-bold text-white text-sm">Speech & Delivery Analytics</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Whisper transcription measures words per minute (WPM), filler word breakdown, hesitation latency, and flags rambling answers over 2 minutes.
                  </p>
                </div>
              </div>
            </div>
          )
        )}

        {activeTab === "story_bank" && <StoryBankView />}
        {activeTab === "spaced_drills" && <SpacedRepetitionView />}
        {activeTab === "company_prep" && <CompanyPrepView />}
        {activeTab === "delivery_trends" && <DeliveryTrendsView />}
      </div>

      {/* Round Launcher Modal */}
      {showLauncher && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Configure Practice Round</h3>
              <button
                onClick={() => setShowLauncher(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Interviewer Persona</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["strict_big_tech", "startup_pragmatist", "friendly_recruiter"] as InterviewPersona[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPersona(p)}
                      className={`p-2.5 rounded-lg border font-semibold text-center capitalize transition ${
                        selectedPersona === p
                          ? "bg-indigo-600 text-white border-indigo-500 shadow"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      {p.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="text-slate-400 block mb-2">Select Round Preset</label>
                <div className="space-y-2">
                  <button
                    onClick={() => handleLaunch("dress_rehearsal")}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left flex justify-between items-center transition"
                  >
                    <div>
                      <span className="font-bold text-white block">45-Minute Dress Rehearsal</span>
                      <span className="text-[11px] text-slate-400">Icebreaker → STAR → Tech Deep Dive → Q&A → Scorecard</span>
                    </div>
                    <span className="text-indigo-400 font-bold">45m</span>
                  </button>

                  <button
                    onClick={() => handleLaunch("dsa_coding")}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left flex justify-between items-center transition"
                  >
                    <div>
                      <span className="font-bold text-white block">DSA Coding Pressure Sprint</span>
                      <span className="text-[11px] text-slate-400">Problem understanding, Big-O proof, dry run testing</span>
                    </div>
                    <span className="text-indigo-400 font-bold">25m</span>
                  </button>

                  <button
                    onClick={() => handleLaunch("system_design")}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left flex justify-between items-center transition"
                  >
                    <div>
                      <span className="font-bold text-white block">System Design Deep Dive</span>
                      <span className="text-[11px] text-slate-400">Requirements, QPS math, sharding, caching, failure modes</span>
                    </div>
                    <span className="text-purple-400 font-bold">35m</span>
                  </button>

                  <button
                    onClick={() => handleLaunch("behavioral")}
                    className="w-full p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left flex justify-between items-center transition"
                  >
                    <div>
                      <span className="font-bold text-white block">Behavioral STAR Drill</span>
                      <span className="text-[11px] text-slate-400">Conflict, failure ownership, ambiguity, quantified impact</span>
                    </div>
                    <span className="text-emerald-400 font-bold">15m</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
