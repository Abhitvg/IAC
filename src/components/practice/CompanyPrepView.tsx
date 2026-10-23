import React, { useState, useMemo } from 'react';
import { usePracticeStore } from '../../store/usePracticeStore';
import { useAppStore } from '../../store/useAppStore';


interface CompanyBlueprint {
  company: string;
  role: string;
  color: string;
  tags: string[];
  jd: string;
  badge: string;
}

const COMPANY_BLUEPRINTS: CompanyBlueprint[] = [
  {
    company: "Google",
    role: "Senior SWE (L5)",
    color: "#4285F4",
    badge: "Big-O & Concurrency",
    tags: ["Java/Go", "Distributed Storage", "Paxos/Raft"],
    jd: "Google Senior Software Engineer (L5), Cloud & Distributed Systems.\n\nRequirements:\n- 5+ years building highly reliable concurrent distributed services in Java, Go, or C++.\n- Mastery of data structures, graph algorithms, multi-threading, and strict Big-O complexity.\n- Experience designing scalable distributed key-value storage, consensus protocols, and multi-region replication.\n- Clean communication for cross-functional technical leadership and design reviews.",
  },
  {
    company: "Meta",
    role: "Senior SWE (E5)",
    color: "#0668E1",
    badge: "Feeds & High Velocity",
    tags: ["C++/Python", "Feed Architecture", "Cache Scale"],
    jd: "Meta Senior Software Engineer (E5), Core Systems & Product Infrastructure.\n\nRequirements:\n- 5+ years of software engineering experience with C++, Python, or Hack/PHP.\n- Experience designing high-throughput feed architectures, distributed caching layers (Memcached/Redis), and asynchronous queues.\n- Fast-paced execution: clean, bug-free implementation under 45-minute coding rounds.\n- Proven track record of navigating ambiguity and unblocking cross-team initiatives.",
  },
  {
    company: "Amazon",
    role: "SDE II (L5)",
    color: "#FF9900",
    badge: "Leadership & Ops",
    tags: ["Java/AWS", "DynamoDB NoSQL", "Microservices"],
    jd: "Amazon Software Development Engineer II (SDE II), Core Retail & AWS Services.\n\nRequirements:\n- 4+ years of professional development experience in Java, C#, or Go.\n- Deep understanding of object-oriented design, distributed microservices, and NoSQL modeling (DynamoDB).\n- High ownership: root cause production issues, operational reviews, and demonstrate Amazon Leadership Principles.\n- Strong capacity planning and operational excellence background.",
  },
  {
    company: "Stripe",
    role: "Infrastructure (L4/L5)",
    color: "#635BFF",
    badge: "Idempotency & SLAs",
    tags: ["Ruby/Java", "Kafka Streaming", "ACID Locks"],
    jd: "Stripe Software Engineer, Financial Infrastructure & Global Payments.\n\nRequirements:\n- 4+ years building high-reliability backend systems in Ruby, Java, Go, or Python.\n- Deep expertise in idempotent transaction processing, distributed locking, distributed state consistency, and Kafka event streaming.\n- Focus on pragmatic problem solving: testing edge cases, network partitioning, and deterministic retries.\n- Clear, structured technical writing and API design.",
  },
  {
    company: "Apple",
    role: "Systems Engineer (ICT4)",
    color: "#94A3B8",
    badge: "Low Latency & C++",
    tags: ["C++/Swift", "Memory Bounds", "Concurrency"],
    jd: "Apple Senior Cloud Systems Engineer, Infrastructure & Core OS.\n\nRequirements:\n- 5+ years of experience with C++, Swift, or Go on Unix/Linux systems.\n- Deep understanding of memory management, low-level concurrency primitives, asynchronous I/O, and p99 latency optimization.\n- Strong systems architecture: cache coherence, zero-copy networking, and high-availability clustered services.",
  },
  {
    company: "Uber",
    role: "Senior Backend (L5)",
    color: "#E2E8F0",
    badge: "Real-Time Dispatch",
    tags: ["Go/Microservices", "Kafka Streams", "Geo-Index"],
    jd: "Uber Senior Software Engineer, Marketplace & Real-Time Dispatch.\n\nRequirements:\n- 5+ years building distributed backend services with Go or Java.\n- Real-time spatio-temporal routing, high-volume event streaming with Kafka, and low-latency geospatial data stores (H3, Redis).\n- Microservices architecture at scale: circuit breakers, distributed rate limiting, and graceful degradation.",
  },
];

export const CompanyPrepView: React.FC = () => {
  const {
    companyPlans,
    activeCompanyPlan,
    createCompanyPlan,
    toggleDrillCompleted,
    addCompanyNote,
  } = usePracticeStore();
  const { resumeText } = useAppStore();

  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [durationDays, setDurationDays] = useState<7 | 14>(7);
  const [showCreator, setShowCreator] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [roundName, setRoundName] = useState('Round 1: Technical Screen');
  const [formError, setFormError] = useState<string | null>(null);

  const currentPlan = activeCompanyPlan || companyPlans[0];

  const detectedLevel = useMemo(() => {
    if (!jobDescription) return null;
    const lower = jobDescription.toLowerCase();
    if (lower.match(/staff|principal|lead|l6|e6|director/)) return "Staff / Principal (L6+)";
    if (lower.match(/senior|l5|e5|5\+|6\+|7\+/)) return "Senior Engineer (L5)";
    return "Standard SDE (Mid-Level)";
  }, [jobDescription]);

  const detectedKeywords = useMemo(() => {
    if (!jobDescription) return [];
    const lower = jobDescription.toLowerCase();
    const known = [
      "java", "python", "go", "c++", "typescript", "kafka", "redis",
      "dynamodb", "distributed", "microservices", "kubernetes", "aws",
      "sql", "big-o", "concurrency", "idempotent", "graphql", "p99"
    ];
    return known.filter((k) => lower.includes(k));
  }, [jobDescription]);

  const handleApplyBlueprint = (bp: CompanyBlueprint) => {
    setCompanyName(bp.company);
    setRole(bp.role);
    setJobDescription(bp.jd);
    setShowCreator(true);
  };


  const handleCreate = () => {
    if (!companyName.trim()) {
      setFormError('Please provide a company name.');
      return;
    }
    if (!jobDescription.trim()) {
      setFormError('Please paste the job description.');
      return;
    }
    setFormError(null);
    createCompanyPlan(companyName, role, jobDescription, resumeText || '', durationDays);
    setShowCreator(false);
    setCompanyName('');
    setJobDescription('');
  };

  const handleAddNote = () => {
    if (!currentPlan || !newNote.trim()) return;
    addCompanyNote(currentPlan.companyName, roundName, newNote);
    setNewNote('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Company-Specific Preparation & Round Notes
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Paste a Job Description to generate a tailored 7- or 14-day study plan, gap analysis,
            and persist feedback across rounds.
          </p>
        </div>
        <button
          onClick={() => setShowCreator(!showCreator)}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition"
        >
          + Prepare for New Company
        </button>
      </div>

      {/* Plan Creator Form */}
      {showCreator && (
        <div className="p-5 bg-slate-900 border border-indigo-500/30 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
            Target Company & Job Description Parser
          </h3>
          {formError && (
            <div
              role="alert"
              className="p-2 rounded bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs font-medium"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="company-name-input" className="text-slate-400 block mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                id="company-name-input"
                aria-label="Company Name"
                placeholder="e.g. Stripe, Google, Meta, Datadog"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
            <div>
              <label htmlFor="company-role-input" className="text-slate-400 block mb-1">
                Target Role / Seniority
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                id="company-role-input"
                aria-label="Target Role / Seniority"
                placeholder="e.g. Senior Backend Engineer"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
          </div>

          <div className="text-xs">
            <label htmlFor="company-jd-textarea" className="text-slate-400 block mb-1">
              Paste Job Description (JD)
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              id="company-jd-textarea"
              aria-label="Job Description"
              placeholder="Paste requirements, stack, and responsibilities here..."
              className="w-full h-28 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-xs"
            />
            {jobDescription.trim().length > 20 && (
              <div className="mt-2 p-2.5 bg-indigo-950/30 border border-indigo-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                  <span>✓</span>
                  <span>Detected Role: <strong className="text-white">{detectedLevel}</strong></span>
                </div>
                {detectedKeywords.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-semibold">Tech Focus:</span>
                    {detectedKeywords.slice(0, 6).map((k) => (
                      <span key={k} className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 text-[10px] font-mono capitalize">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <div className="flex gap-2 items-center text-xs text-slate-300">
              <span>Roadmap Length:</span>
              <button
                type="button"
                onClick={() => setDurationDays(7)}
                className={`px-3 py-1 rounded text-xs font-bold border ${
                  durationDays === 7
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setDurationDays(14)}
                className={`px-3 py-1 rounded text-xs font-bold border ${
                  durationDays === 14
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                14 Days
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreator(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                Generate Tailored Roadmap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Plan Overview */}
      {currentPlan ? (
        <div className="space-y-6">
          {/* Top Card: Company Summary & Themes */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs uppercase font-bold text-indigo-400">
                  Target Company Strategy
                </span>
                <h3 className="text-2xl font-extrabold text-white mt-0.5">
                  {currentPlan.companyName}
                </h3>
                <span className="text-xs text-slate-400">
                  {currentPlan.seniority} {currentPlan.targetRole} • {currentPlan.durationDays}-Day
                  Preparation Plan
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-w-sm justify-end">
                {currentPlan.extractedStack.map((tech) => (
                  <span
                    key={tech}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            {/* Likely Themes */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80">
              <span className="text-xs font-bold text-slate-300 block mb-1.5">
                Likely Interview Themes for {currentPlan.companyName}:
              </span>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-slate-300">
                {currentPlan.likelyRoundThemes.map((theme, i) => (
                  <li key={i} className="flex gap-2 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                    <span>{theme}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resume Gap Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-1">
                <span className="font-bold text-emerald-400">Matched Strengths:</span>
                <p className="text-emerald-200">
                  {currentPlan.resumeGapAnalysis.matchedStrengths.join(', ') ||
                    'General software engineering fundamentals'}
                </p>
              </div>
              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1">
                <span className="font-bold text-rose-400">JD Skills to Highlight / Study:</span>
                <p className="text-rose-200">
                  {currentPlan.resumeGapAnalysis.missingCompetencies.join(', ') || 'None flagged'}
                </p>
              </div>
            </div>
          </div>

          {/* Daily Drills Roadmap */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-300">
              {currentPlan.durationDays}-Day Structured Roadmap
            </h3>
            <div className="space-y-2">
              {currentPlan.dailyDrills.map((drill) => (
                <div
                  key={drill.day}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                    drill.completed
                      ? 'bg-slate-900/40 border-slate-800/50 text-slate-500'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={drill.completed}
                      onChange={() => toggleDrillCompleted(0, drill.day)}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700"
                    />
                    <div>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs font-bold text-indigo-400">Day {drill.day}:</span>
                        <span
                          className={`text-xs font-bold ${drill.completed ? 'line-through text-slate-500' : 'text-white'}`}
                        >
                          {drill.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {drill.focusCategory}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{drill.targetExercise}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Round Notes & Continuity */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white">Round-to-Round Continuity Notes</h3>
                <p className="text-[11px] text-slate-400">
                  Record feedback and weak spots from Round 1 so Round 2 preparation builds directly
                  on what happened.
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {currentPlan.persistentNotes.map((note, i) => (
                <div
                  key={i}
                  className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono"
                >
                  {note}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="Round Name (e.g. Round 2: System Design)"
                className="w-1/3 p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="What did they drill into? (e.g. Invalidation edge cases, trade-offs)"
                className="flex-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
              <button
                onClick={handleAddNote}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Company Prep Hero */}
          <div className="p-6 sm:p-8 bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-3xl space-y-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-400">
                Company-Calibrated Curriculum Generator
              </span>
              <span className="text-xs text-slate-400">7 or 14-Day Targeted Blueprints</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-white">
              Targeted Big Tech &amp; Startup Interview Blueprints
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Every tech tier evaluates differently. Google strictly enforces Big-O optimality; Meta tests high-velocity clean execution; Amazon probes Leadership Principles; Stripe demands idempotent distributed systems design. Choose a verified blueprint below or paste your specific target job description.
            </p>

            <div className="pt-2">
              <button
                onClick={() => setShowCreator(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>+</span>
                <span>Paste Custom Job Description</span>
              </button>
            </div>
          </div>

          {/* Premier Company Logo Pills Grid */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1-Click Premier Company Blueprints
              </span>
              <span className="text-[11px] text-indigo-400 font-semibold">Instant Calibration</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COMPANY_BLUEPRINTS.map((bp) => (
                <button
                  key={bp.company}
                  onClick={() => handleApplyBlueprint(bp)}
                  className="company-logo-pill card-interactive p-4 bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl text-left space-y-2.5 transition group"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white shadow-sm"
                        style={{ background: bp.color }}
                      >
                        {bp.company.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                          {bp.company}
                        </h4>
                        <span className="text-[10px] text-slate-400">{bp.role}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                      {bp.badge}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {bp.tags.map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-300 border border-slate-800">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="text-[10px] font-semibold text-indigo-400 group-hover:translate-x-0.5 transition flex items-center gap-1 pt-0.5">
                    <span>Load {bp.company} Blueprint</span>
                    <span>&rarr;</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Roadmap Architecture Preview Showcase */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sample Generated Study Plan Preview
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold">Automated Output</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="font-bold text-white block">Extracted Stack &amp; Gap Matrix</span>
                <div className="flex flex-wrap gap-1">
                  {["Java", "Kafka Streams", "Redis Lock", "p99 Latencies", "ACID Outbox"].map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono">
                      {s}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Matches your resume bullets against JD requirements and tags competencies to emphasize in round 1.
                </p>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                <span className="font-bold text-white block">Structured Daily Drill Sequence</span>
                <div className="space-y-1 text-[11px] text-slate-300 font-mono">
                  <div className="flex justify-between">
                    <span>Day 1: Concurrency Primitives</span>
                    <span className="text-indigo-400">System Design</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 2: Idempotent Payment Flow</span>
                    <span className="text-sky-400">Architecture</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 3: STAR High-Impact Scale</span>
                    <span className="text-rose-400">Behavioral</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};