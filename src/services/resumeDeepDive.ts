/**
 * Resume Deep Dive preparation.
 *
 * Converts parsed resume evidence into a comprehensive interview-preparation map.
 * It deliberately does not synthesize historical implementation details: missing
 * architecture, ownership, incidents, and metric methodology become clarification tasks.
 */

import {
  CandidateFact,
  CandidateKnowledgeBase,
  ProjectProfile,
  VerificationStatus,
} from './candidateIntelligence';

export interface ResumeStoryEvidence {
  text: string;
  verificationStatus: VerificationStatus;
  source: 'project_claim' | 'candidate_fact' | 'project_field';
}

export interface ResumeStoryModule {
  id: string;
  title: string;
  kind: 'project' | 'experience' | 'achievement' | 'technical_skill';
  evidence: ResumeStoryEvidence[];
  narrativePrompts: string[];
  interviewerQuestions: string[];
  clarificationNeeded: string[];
}

export interface ResumeDeepDivePlan {
  modules: ResumeStoryModule[];
  totalEvidenceItems: number;
  clarificationCount: number;
  coverage: {
    projects: number;
    experiences: number;
    achievements: number;
    technicalSkills: number;
  };
}

const UNIQUE = (items: ResumeStoryEvidence[]): ResumeStoryEvidence[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function factEvidence(facts: CandidateFact[]): ResumeStoryEvidence[] {
  return facts.map((fact) => ({
    text: fact.fact,
    verificationStatus: fact.verificationStatus,
    source: 'candidate_fact',
  }));
}

function projectEvidence(project: ProjectProfile): ResumeStoryEvidence[] {
  const items: ResumeStoryEvidence[] = [];
  for (const claim of project.rawClaims || []) {
    items.push({
      text: claim.rawText,
      verificationStatus: 'RESUME_REPORTED',
      source: 'project_claim',
    });
  }

  const fields: Array<[string, string | string[]]> = [
    ['Problem', project.problemStatement],
    ['Architecture', project.architecture],
    ['Technology stack', project.technologyStack],
    ['Data flow', project.dataFlow],
    ['Backend design', project.backendDesign],
    ['Frontend design', project.frontendDesign],
    ['Database design', project.databaseDesign],
    ['Integrations', project.integrations],
    ['Security', project.security],
    ['Deployment', project.deployment],
    ['Personal contribution', project.personalContribution],
    ['Team contribution', project.teamContribution],
    ['Challenges', project.challenges],
    ['Results', project.verifiedResults],
    ['Known limitations', project.knownLimitations],
  ];

  for (const [label, value] of fields) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (entry && entry !== 'UNKNOWN') {
        items.push({
          text: `${label}: ${entry}`,
          verificationStatus: project.verificationStatus,
          source: 'project_field',
        });
      }
    }
  }
  return UNIQUE(items);
}

function projectClarifications(project: ProjectProfile): string[] {
  const prov = project.fieldProvenance;
  const missing: string[] = [];
  if (
    !prov?.personalContribution?.value ||
    prov.personalContribution.value === 'UNKNOWN' ||
    prov.personalContribution.verificationStatus !== 'CANDIDATE_CONFIRMED'
  ) {
    missing.push('What exactly did you personally implement, decide, review, or operate?');
  }
  if (!prov?.architecture?.value || prov.architecture.value === 'UNKNOWN') {
    missing.push('Describe the actual architecture and request/data flow used at the time.');
  }
  if (!prov?.deployment?.value || prov.deployment.value === 'UNKNOWN') {
    missing.push(
      'Where and how was it deployed? Separate what you did from the team deployment process.'
    );
  }
  if (!prov?.engineeringChallenges?.value?.length) {
    missing.push(
      'What real engineering challenge did you encounter, and what evidence identified its cause?'
    );
  }
  if (
    !prov?.performanceMetrics?.value?.length ||
    prov.performanceMetrics.verificationStatus !== 'CANDIDATE_CONFIRMED'
  ) {
    missing.push(
      'For each resume metric, confirm the baseline, measurement window, data source, and your contribution.'
    );
  }
  if (!prov?.databaseDesign?.value || prov.databaseDesign.value === 'UNKNOWN') {
    missing.push(
      'If a database was involved, explain the actual schema, indexes, consistency needs, and query patterns.'
    );
  }
  return missing;
}

function projectQuestions(name: string): string[] {
  return [
    `What problem did ${name} solve, and who used it?`,
    `Walk me through ${name}'s actual architecture and one complete request or data flow.`,
    `Which parts of ${name} did you personally build, and which were owned by others?`,
    `What was the hardest technical decision in ${name}, and what alternatives did you consider?`,
    `Describe a real failure or difficult bug in ${name}. What evidence led you to the root cause?`,
    `How did you test, deploy, monitor, and safely change ${name}?`,
    `What would you redesign today, and why?`,
  ];
}

function factModule(fact: CandidateFact): ResumeStoryModule {
  const kind =
    fact.category === 'metric' || fact.category === 'outcome'
      ? 'achievement'
      : fact.category === 'role' || fact.category === 'responsibility'
        ? 'experience'
        : 'technical_skill';

  return {
    id: fact.id,
    title: fact.fact,
    kind,
    evidence: factEvidence([fact]),
    narrativePrompts: [
      'Explain the context and why this work or skill mattered.',
      'Separate what you personally did from what the team did.',
      'Give a concrete technical example supported by your actual experience.',
      'State the result only as documented; explain how it was measured if known.',
    ],
    interviewerQuestions: [
      'Can you explain exactly how this worked?',
      'What was your personal contribution?',
      'What trade-off or limitation did you encounter?',
      'How did you verify the result?',
    ],
    clarificationNeeded:
      fact.verificationStatus === 'RESUME_REPORTED'
        ? [
            'Confirm the exact scope of your involvement and the details you can defend from first-hand experience.',
          ]
        : [],
  };
}

/**
 * Adds a compact, question-relevant rehearsal brief to a live answer prompt.
 * The full plan remains available to a preparation UI; live mode receives only
 * the strongest matching modules to avoid dumping the entire resume into context.
 * Live answers are zero-interruption: missing details never trigger candidate input or confirmation.
 */
export function buildResumeDeepDivePromptSection(
  kb: CandidateKnowledgeBase,
  question: string,
  maxModules: number = 2
): string {
  const plan = buildResumeDeepDivePlan(kb);
  if (!plan.modules.length) return '';

  const tokens = (question || '').toLowerCase().match(/[a-z0-9+#.-]{3,}/g) || [];
  const ranked = plan.modules
    .map((module) => {
      const haystack = (
        module.title +
        ' ' +
        module.evidence.map((item) => item.text).join(' ')
      ).toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { module, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked.filter((item) => item.score > 0).slice(0, maxModules);
  if (!selected.length) return '';

  const sections = selected.map(({ module }) => {
    const evidence = module.evidence
      .slice(0, 8)
      .map((item) => `- [${item.verificationStatus}] ${item.text}`)
      .join('\n');
    const unknowns = module.clarificationNeeded.length
      ? '- Some implementation details are absent from the source. Do not infer them, request input, or block the answer.'
      : '- No explicit gaps were generated; still do not infer missing facts.';
    const followUps = module.interviewerQuestions
      .slice(0, 5)
      .map((item) => `- ${item}`)
      .join('\n');
    return `MODULE: ${module.title} (${module.kind})
SOURCE EVIDENCE:
${evidence || '- No parsed evidence available.'}
UNESTABLISHED DETAILS — DO NOT INVENT OR ASK THE CANDIDATE:
${unknowns || '- No explicit gaps were generated; still do not infer missing facts.'}
LIKELY INTERVIEWER QUESTIONS:
${followUps}`;
  });

  return `
════════════ RESUME DEEP-DIVE REHEARSAL CONTEXT ════════════
Use the matching resume evidence below to make the answer specific and coherent.
Treat RESUME_REPORTED facts as candidate-provided claims, not independently verified facts.
Do not turn unknowns into historical events. NEVER request candidate input, clarification, approval,
or confirmation during a live interview. If a detail is missing, answer the supported part directly,
then give a technically sound general explanation or clearly label a possible design as hypothetical.
Do not present that general explanation as something the candidate personally implemented.
${sections.join('\\n\\n')}
═══════════════════════════════════════════════════════════
`;
}

/**
 * Creates one preparation module per parsed project and resume fact.
 * This is a coverage map and interview rehearsal scaffold, not a fabricated biography.
 */
export function buildResumeDeepDivePlan(kb: CandidateKnowledgeBase): ResumeDeepDivePlan {
  const projects = kb.getAllProjects();
  const facts = kb.getAllFacts();
  const modules: ResumeStoryModule[] = [];

  for (const project of projects) {
    const evidence = projectEvidence(project);
    modules.push({
      id: `project:${project.id}`,
      title: project.name,
      kind: 'project',
      evidence,
      narrativePrompts: [
        'Give a concise overview: problem, users, and why the system was needed.',
        'Tell the story in chronological order, using only established historical facts.',
        'Walk through the actual architecture, data flow, and technologies named in the source.',
        'Identify your personal contribution separately from team responsibilities.',
        'Explain a real challenge, the evidence you used, the fix, and how you verified it.',
        'Explain outcomes and metrics without inventing baselines or causal claims.',
        'Close with a genuine lesson and what you would improve today.',
      ],
      interviewerQuestions: projectQuestions(project.name),
      clarificationNeeded: projectClarifications(project),
    });
  }

  for (const fact of facts) {
    modules.push(factModule(fact));
  }

  const counts = {
    projects: modules.filter((module) => module.kind === 'project').length,
    experiences: modules.filter((module) => module.kind === 'experience').length,
    achievements: modules.filter((module) => module.kind === 'achievement').length,
    technicalSkills: modules.filter((module) => module.kind === 'technical_skill').length,
  };

  return {
    modules,
    totalEvidenceItems: modules.reduce((sum, module) => sum + module.evidence.length, 0),
    clarificationCount: modules.reduce((sum, module) => sum + module.clarificationNeeded.length, 0),
    coverage: counts,
  };
}
