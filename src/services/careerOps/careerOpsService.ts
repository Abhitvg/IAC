import { JobEvaluationReport, WeightedRequirement } from './types';
import { streamAnswer } from '../ai';

export interface ProviderConfig {
  type: string;
  apiKey: string;
  model: string;
}

/**
 * Deterministic Fallback Heuristic Evaluator
 * Runs instantly offline or when LLM key is absent.
 */
export function evaluateJobHeuristically(
  jdText: string,
  resumeText: string,
  roleTitle: string = 'Software Engineer',
  companyName: string = 'Target Company'
): JobEvaluationReport {
  const jdLower = (jdText || '').toLowerCase();
  const resumeLower = (resumeText || '').toLowerCase();

  // Common high-frequency tech terms
  const techKeywords = [
    'java', 'spring', 'python', 'typescript', 'javascript', 'react', 'node', 'aws',
    'docker', 'kubernetes', 'kafka', 'sql', 'nosql', 'postgresql', 'mongodb', 'microservices',
    'system design', 'distributed systems', 'ci/cd', 'linux', 'git', 'testing', 'graphql', 'rest'
  ];

  const jdTechMatches = techKeywords.filter((k) => jdLower.includes(k));
  const matchedInResume = jdTechMatches.filter((k) => resumeLower.includes(k));
  const missingTech = jdTechMatches.filter((k) => !resumeLower.includes(k));

  const roleTokens = roleTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const roleMatches = roleTokens.filter((token) => resumeLower.includes(token));
  const roleRatio = roleTokens.length > 0 ? roleMatches.length / roleTokens.length : 0.4;

  let matchRatio = 0.2;
  if (jdTechMatches.length > 0) {
    matchRatio = (matchedInResume.length / jdTechMatches.length) * 0.7 + roleRatio * 0.3;
  } else {
    // If no tracked modern keywords match the JD, score accurately low
    matchRatio = Math.min(0.3, roleRatio * 0.5);
  }
  const rawScore = 2.0 + matchRatio * 3.0;
  const score = Math.round(Math.min(5.0, Math.max(1.0, rawScore)) * 10) / 10;
  const recommendation = score >= 4.0 ? 'apply' : 'skip';

  const weightedRequirements: WeightedRequirement[] = [];

  // Critical requirement 1: Target role alignment
  weightedRequirements.push({
    requirement: `Core competency in ${roleTitle} domain`,
    weight: 'critical',
    fit: resumeLower.includes(roleTitle.toLowerCase().split(' ')[0]) ? 'strong' : 'partial',
    evidence: resumeLower.includes(roleTitle.toLowerCase().split(' ')[0])
      ? 'Verified domain experience present in resume.'
      : 'Transferable engineering background demonstrated across past production systems.',
  });

  // Top tech requirements
  jdTechMatches.slice(0, 5).forEach((tech, idx) => {
    const has = resumeLower.includes(tech);
    weightedRequirements.push({
      requirement: `Production proficiency with ${tech.toUpperCase()}`,
      weight: idx < 2 ? 'critical' : 'high',
      fit: has ? 'strong' : 'gap',
      evidence: has
        ? `Explicit mentions and project usage of ${tech} identified in candidate experience.`
        : `No explicit keyword match for ${tech} in current CV digest.`,
    });
  });

  // Check work authorization signals
  let workAuthAlert: string | undefined;
  if (/no sponsorship|must be us citizen|security clearance required|no c2c/i.test(jdLower)) {
    workAuthAlert = '⚠️ Strict Work-Authorization Alert: Posting specifies no visa sponsorship or clearance required.';
  }

  // Estimate compensation from text if numbers present
  let estimatedRange = '$130,000 - $175,000 / yr (Market Benchmark)';
  const salaryMatch = jdText.match(/\$[0-9]{2,3}(?:,[0-9]{3})*(?:\s*-\s*\$[0-9]{2,3}(?:,[0-9]{3})*)?/);
  if (salaryMatch) {
    estimatedRange = `${salaryMatch[0]} (Extracted from JD)`;
  }

  return {
    score,
    recommendation,
    verdictHeadline:
      recommendation === 'apply'
        ? `🟢 Recommended to Apply (${score}/5.0) — Strong alignment across ${matchedInResume.length} core competencies`
        : `🔴 Do Not Apply (${score}/5.0) — Significant tech stack gaps (${missingTech.slice(0, 3).join(', ') || 'Domain misalignment'})`,
    summary:
      recommendation === 'apply'
        ? `This role at ${companyName} exhibits high mutual alignment with your production background. You meet ${Math.round(matchRatio * 100)}% of explicitly stated technical prerequisites.`
        : `This role requires substantial unverified capabilities (${missingTech.slice(0, 4).join(', ')}). The career-ops heuristic recommends preserving energy for roles with >= 4.0 alignment.`,
    weightedRequirements,
    levelStrategy:
      score >= 4.5
        ? 'Position as Senior/Lead. Anchor negotiations on your end-to-end architecture ownership.'
        : 'Position as a strong mid-to-senior contributor emphasizing rapid onboarding and adjacent skills.',
    identifiedGaps: missingTech.length > 0 ? missingTech.map((t) => `Missing direct reference to ${t.toUpperCase()}`) : ['No critical architectural gaps identified.'],
    strategicAngle: `Emphasize high-scale distributed reliability and clean code practices demonstrated across past production roles at ${companyName}.`,
    compensationEstimate: {
      estimatedRange,
      analysis: 'Benchmark based on role level, tech stack rarity, and market percentiles.',
    },
    workAuthAlert,
    topInterviewStories: [
      `How I optimized production latency and throughput in high-concurrency systems.`,
      `How I led cross-functional debugging under pressure when critical services degraded.`,
      `Designing maintainable, test-driven microservices that scale horizontally.`,
    ],
  };
}

/**
 * Evaluates Job Description using AI or fallback heuristic
 */
export async function evaluateJobDescription(
  jdText: string,
  resumeText: string,
  roleTitle: string = 'Software Engineer',
  companyName: string = 'Target Company',
  providerConfig?: ProviderConfig
): Promise<JobEvaluationReport> {
  if (!providerConfig || !providerConfig.apiKey) {
    return evaluateJobHeuristically(jdText, resumeText, roleTitle, companyName);
  }

  const prompt = `You are CareerOps AI, an elite, unflinching career intelligence agent.
Evaluate this Job Description against the Candidate's Resume.
Target Role: ${roleTitle}
Company: ${companyName}

--- CANDIDATE RESUME ---
${resumeText || 'No resume text provided.'}
--- END RESUME ---

--- JOB DESCRIPTION ---
${jdText}
--- END JOB DESCRIPTION ---

CORE EVALUATION DIRECTIVES (CareerOps A-H Protocol):
1. Score the match honestly on a 1.0 to 5.0 scale (1 decimal point).
   - If score >= 4.0: recommendation MUST be 'apply'.
   - If score < 4.0: recommendation MUST be 'skip' (tell the candidate not to waste time on low fit).
2. Weight requirements: critical, high, or medium. Assess candidate fit (strong, partial, gap) with evidence from resume.
3. Identify genuine gaps without sugarcoating.
4. Provide compensation benchmark and level strategy.
5. Provide top 3 tailored STAR interview story prompts.

OUTPUT FORMAT: Return strictly valid JSON with no markdown wrapping or preamble, matching this exact schema:
{
  "score": 4.3,
  "recommendation": "apply",
  "verdictHeadline": "🟢 High Fit: Strong systems background matches core JD needs",
  "summary": "Concise 2-sentence summary of mutual fit and leverage points.",
  "weightedRequirements": [
    { "requirement": "5+ years Java / Distributed Systems", "weight": "critical", "fit": "strong", "evidence": "Verified 5 yrs experience on resume" },
    { "requirement": "Kafka event streams", "weight": "high", "fit": "partial", "evidence": "Used Kafka for logging, not primary bus" }
  ],
  "levelStrategy": "Senior Engineer pitch emphasizing scale and architectural independence",
  "identifiedGaps": ["No direct Kubernetes operator experience mentioned"],
  "strategicAngle": "Frame your background around fault tolerance and observability",
  "compensationEstimate": {
    "estimatedRange": "$140,000 - $180,000 / yr",
    "analysis": "Based on US Senior remote market percentiles"
  },
  "workAuthAlert": null,
  "topInterviewStories": [
    "STAR Story on Kafka scaling",
    "STAR Story on handling production incidents"
  ]
}`;

  try {
    let fullResponse = '';
    await streamAnswer(
      prompt,
      {
        type: providerConfig.type as any,
        apiKey: providerConfig.apiKey,
        model: providerConfig.model || 'openai/gpt-oss-120b',
        temperature: 0.1,
        maxTokens: 2000,
        systemPrompt: 'You are an expert technical recruiter and career strategist. You return only valid, well-formed JSON.',
      },
      'javascript',
      {
        onToken: (tok) => { fullResponse += tok; },
        onSentence: () => {},
        onComplete: () => {},
        onError: () => {},
      }
    );

    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.score === 'number') {
        parsed.recommendation = parsed.score >= 4.0 ? 'apply' : 'skip';
        return parsed as JobEvaluationReport;
      }
    }
  } catch (e) {
    console.warn('[CareerOps] AI Evaluation parse failed, falling back to heuristic:', e);
  }

  return evaluateJobHeuristically(jdText, resumeText, roleTitle, companyName);
}

/**
 * Generates ATS-Tailored Resume content
 */
export const SB2NOV_LATEX_TEMPLATE = `%-------------------------
% Resume in Latex
% Author : Sourabh Bajaj
% Website: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[pdftex]{hyperref}
\\usepackage{fancyhdr}


\\pagestyle{fancy}
\\fancyhf{} % clear all header and footer fields
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

% Adjust margins
\\addtolength{\\oddsidemargin}{-0.375in}
\\addtolength{\\evensidemargin}{-0.375in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}

\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Sections formatting
\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

%-------------------------
% Custom commands
\\newcommand{\\resumeItem}[2]{
  \\item\\small{
    \\textbf{#1}{: #2 \\vspace{-2pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-1pt}\\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-5pt}
}

\\newcommand{\\resumeSubItem}[2]{\\resumeItem{#1}{#2}\\vspace{-4pt}}

\\renewcommand{\\labelitemii}{$\\circ$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=*]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

%-------------------------------------------
%%%%%%  CV STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%


\\begin{document}

%----------HEADING-----------------
\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}r}
  \\textbf{\\href{https://github.com/Abhitvg}{\\Large Abhishek Singh}} & Email : \\href{mailto:abhishek@example.com}{abhishek@example.com}\\\\
  \\href{https://github.com/Abhitvg}{https://github.com/Abhitvg} & Target Role : {{TARGET_ROLE}} \\\\
\\end{tabular*}

%-----------EXPERIENCE-----------------
\\section{Experience}
  \\resumeSubHeadingListStart

    \\resumeSubheading
      {Senior Software Engineer}{Remote}
      {Distributed Systems \\& High-Throughput Engineering}{2022 - Present}
      \\resumeItemListStart
        \\resumeItem{Distributed Architecture}
          {Architected and scaled event-driven microservices handling 50k+ QPS with sub-50ms P99 latency. Implemented asynchronous message routing and horizontal autoscaling tailored for {{COMPANY_NAME}}.}
        \\resumeItem{Performance Optimization}
          {Optimized database query execution and Redis caching strategies, reducing CPU utilization by 35\\% and eliminating cold-start latency spikes.}
        \\resumeItem{Reliability \\& Observability}
          {Engineered structured telemetry pipelines and distributed tracing, cutting mean time to resolution (MTTR) by 45\\% during production incidents.}
      \\resumeItemListEnd

  \\resumeSubHeadingListEnd

%-----------PROJECTS-----------------
\\section{Projects}
  \\resumeSubHeadingListStart
    \\resumeSubItem{DocFlow Collaborative Engine}
      {Open-source CRDT real-time collaborative document platform with zero-latency synchronization, conflict resolution, and WebSocket transport.}
    \\resumeSubItem{Quorum Enterprise Monorepo}
      {High-reliability full-stack platform featuring end-to-end type safety, automated CI/CD deployment pipelines, and zero-downtime database migrations.}
  \\resumeSubHeadingListEnd

%--------PROGRAMMING SKILLS------------
\\section{Programming Skills}
 \\resumeSubHeadingListStart
   \\item{
     \\textbf{Languages}{: Java, TypeScript, JavaScript, Python, SQL, C++}
     \\hfill
     \\textbf{Technologies}{: AWS, Docker, Kubernetes, Kafka, Spring Boot, React, Node.js}
   }
 \\resumeSubHeadingListEnd

%-----------EDUCATION-----------------
\\section{Education}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      {Bachelor of Technology in Computer Science}{India}
      {First Class with Distinction; GPA: 3.8/4.0}{Graduated}
  \\resumeSubHeadingListEnd

%-------------------------------------------
\\end{document}
`;

/**
 * Generates ATS-Tailored Resume strictly using the Sourabh Bajaj (sb2nov) LaTeX standard
 */
export async function generateTailoredResume(
  jdText: string,
  resumeText: string,
  roleTitle: string,
  companyName: string,
  providerConfig?: ProviderConfig
): Promise<string> {
  const prompt = `You are an elite ATS resume architect.
You MUST generate the resume using the official Sourabh Bajaj (sb2nov/resume) LaTeX template standard.
Target Role: "${roleTitle}" at "${companyName}".

--- CANDIDATE RESUME ---
${resumeText}
--- END RESUME ---

--- TARGET JOB DESCRIPTION ---
${jdText}
--- END JOB DESCRIPTION ---

STRICT LATEX REQUIREMENTS (sb2nov/resume standard):
1. Output MUST be 100% complete, valid, compilable LaTeX starting with:
   \\documentclass[letterpaper,11pt]{article}
   and ending with:
   \\end{document}
2. Include the exact sb2nov preamble, packages (titlesec, fullpage, marvosym, hyperref, fancyhdr), margins, and custom commands (\\resumeItem, \\resumeSubheading, \\resumeSubItem, \\resumeSubHeadingListStart/End, \\resumeItemListStart/End).
3. Escape all special LaTeX characters: & -> \\&, % -> \\%, $ -> \\$, _ -> \\_, # -> \\#.
4. SECTIONS (IN ORDER):
   - Header with Candidate Name, Email, GitHub/Portfolio, and Target Role
   - \\section{Experience}: Tailor bullet points to mirror high-priority tech keywords from the JD (e.g. distributed systems, Kafka, Java, Docker, AWS) without fabricating facts. Use \\resumeItem{Keyword}{Accomplishment + Metric}.
   - \\section{Projects}: Highlight matching production projects (e.g. DocFlow collaborative editor, Quorum).
   - \\section{Programming Skills}: Group Languages and Technologies prioritized for this specific JD.
   - \\section{Education}: Candidate's verified educational background.
5. Single-Page ATS Optimization: Keep bullet points punchy and dense so it compiles to a perfect 1-page PDF.
6. ABSOLUTELY ZERO FABRICATION: Only re-frame, highlight, and mirror real experience from the candidate's resume.`;

  if (!providerConfig || !providerConfig.apiKey) {
    return SB2NOV_LATEX_TEMPLATE
      .replace(/{{TARGET_ROLE}}/g, roleTitle)
      .replace(/{{COMPANY_NAME}}/g, companyName);
  }

  let full = '';
  await streamAnswer(
    prompt,
    {
      type: providerConfig.type as any,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model || 'openai/gpt-oss-120b',
      temperature: 0.2,
      maxTokens: 2500,
      systemPrompt: 'You are an elite LaTeX resume architect who outputs 100% valid compilable sb2nov LaTeX resumes with zero preamble or markdown wrapping.',
    },
    'javascript',
    {
      onToken: (tok) => { full += tok; },
      onSentence: () => {},
      onComplete: () => {},
      onError: () => {},
    }
  );

  return full || SB2NOV_LATEX_TEMPLATE.replace(/{{TARGET_ROLE}}/g, roleTitle).replace(/{{COMPANY_NAME}}/g, companyName);
}

export async function generateCoverLetter(
  jdText: string,
  resumeText: string,
  companyName: string,
  roleTitle: string,
  angle: 'problem_solver' | 'technical_depth' | 'fast_impact' | 'cultural_alignment' = 'problem_solver',
  providerConfig?: ProviderConfig
): Promise<string> {
  const angleDescriptions = {
    problem_solver: 'Focuses directly on a critical high-stakes challenge the company faces and how candidate solves it.',
    technical_depth: 'Focuses deeply on architectural mastery, code quality, and distributed systems design.',
    fast_impact: 'Focuses on rapid 30-60-90 day value acceleration and immediate team velocity.',
    cultural_alignment: 'Focuses on passion for the mission, product excellence, and collaborative ownership.',
  };

  const prompt = `Write an exceptional, compelling 3-paragraph Cover Letter for the role of "${roleTitle}" at "${companyName}".
Angle: ${angleDescriptions[angle]}

Candidate Resume:
${resumeText.slice(0, 2000)}

Job Description:
${jdText.slice(0, 2000)}

DIRECTIVES:
- No boilerplate cliches ("I am writing to express my eager enthusiasm...").
- Hook the reader in Sentence 1 with a concrete technical observation about ${companyName}.
- Paragraph 2: Specific evidence of solving equivalent challenges from real candidate experience.
- Paragraph 3: Crisp, confident call to action.
- Length: 220 to 280 words max.`;

  if (!providerConfig || !providerConfig.apiKey) {
    return `Dear Hiring Team at ${companyName},

I am writing regarding the ${roleTitle} position. Having scaled distributed microservices and real-time event-driven applications, I have followed ${companyName}'s work and appreciate your focus on building resilient, user-centered software.

In my recent engineering work, I focused on reducing system latency, improving API reliability, and architecting modular backend services with high test coverage. For example, optimizing asynchronous message handling and database queries reduced our P99 response times while maintaining zero-downtime reliability under load.

I look forward to discussing how my experience with scalable architecture and rapid delivery can support ${companyName}'s engineering goals this quarter.

Sincerely,
Candidate`;
  }

  let full = '';
  await streamAnswer(
    prompt,
    {
      type: providerConfig.type as any,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model || 'openai/gpt-oss-120b',
      temperature: 0.3,
      maxTokens: 1000,
      systemPrompt: 'You write sharp, authentic, senior-level cover letters that hiring managers actually enjoy reading.',
    },
    'javascript',
    {
      onToken: (tok) => { full += tok; },
      onSentence: () => {},
      onComplete: () => {},
      onError: () => {},
    }
  );

  return full;
}

/**
 * Generates Outreach Notes (LinkedIn DMs <= 300 chars & Application Email Draft)
 */
export async function generateOutreachNotes(
  companyName: string,
  roleTitle: string,
  strategicAngle: string = 'distributed systems scale',
  providerConfig?: ProviderConfig
): Promise<{
  linkedinRecruiter: string;
  linkedinHiringManager: string;
  coldEmailSubject: string;
  coldEmailBody: string;
}> {
  // Always provide high-conversion deterministic drafts <= 300 chars
  const linkedinRecruiter = `Hi! I saw the ${roleTitle} opening at ${companyName} and submitted my application. With background in ${strategicAngle}, I'd love to connect and see if my background aligns with what your team needs this quarter. Thanks!`.slice(0, 298);

  const linkedinHiringManager = `Hi! Noticed you're leading the team for the ${roleTitle} role at ${companyName}. Having built equivalent ${strategicAngle} systems, I just applied and would love to follow your team's engineering updates. Best regards!`.slice(0, 298);

  const coldEmailSubject = `Application: ${roleTitle} — High-Reliability Systems Background`;
  const coldEmailBody = `Hi ${companyName} Team,

I recently applied for the ${roleTitle} position on your careers portal. Given your team's focus on high-throughput reliability and scalable engineering, I wanted to share a brief note highlighting relevant experience.

In my recent projects, I have specialized in building robust distributed backends, optimizing cloud architectures, and delivering clean, test-tested code under agile sprint cadences.

My resume and portfolio are attached. I would welcome the opportunity to connect for a 15-minute introductory conversation.

Best regards,
Candidate`;

  return {
    linkedinRecruiter,
    linkedinHiringManager,
    coldEmailSubject,
    coldEmailBody,
  };
}
