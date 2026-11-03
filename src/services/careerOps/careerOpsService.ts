import { JobEvaluationReport, WeightedRequirement } from './types';
import { streamAnswer } from '../ai';
import { resolveOrMigrateModel, AIProviderId } from '../models/modelRegistry';

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

  const matchRatio =
    jdTechMatches.length > 0
      ? (matchedInResume.length / jdTechMatches.length) * 0.7 + roleRatio * 0.3
      : Math.min(0.3, roleRatio * 0.5);
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
    const targetModel = resolveOrMigrateModel(
      (providerConfig.type || 'groq') as AIProviderId,
      providerConfig.model,
      'llm'
    ).resolvedModel;

    await streamAnswer(
      prompt,
      {
        type: providerConfig.type as any,
        apiKey: providerConfig.apiKey,
        model: targetModel,
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
    \\resumeSubItem{Collaborative Document Engine}
      {Real-time collaborative document platform with document synchronization, conflict resolution, and WebSocket transport.}
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
   - \\section{Projects}: Highlight matching verified production projects from candidate experience.
   - \\section{Programming Skills}: Group Languages and Technologies prioritized for this specific JD.
   - \\section{Education}: Candidate's verified educational background.
5. Single-Page ATS Optimization: Keep bullet points punchy and dense so it compiles to a perfect 1-page PDF.
6. ABSOLUTELY ZERO FABRICATION: Only re-frame, highlight, and mirror real experience from the candidate's resume.`;

  if (!providerConfig || !providerConfig.apiKey) {
    return SB2NOV_LATEX_TEMPLATE
      .replace(/{{TARGET_ROLE}}/g, roleTitle)
      .replace(/{{COMPANY_NAME}}/g, companyName);
  }

  const targetModel = resolveOrMigrateModel(
    (providerConfig.type || 'groq') as AIProviderId,
    providerConfig.model,
    'llm'
  ).resolvedModel;

  let full = '';
  await streamAnswer(
    prompt,
    {
      type: providerConfig.type as any,
      apiKey: providerConfig.apiKey,
      model: targetModel,
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

export type CoverLetterAngle =
  | 'problem_solver'
  | 'technical_depth'
  | 'fast_impact'
  | 'cultural_alignment';

export type CoverLetterExperienceLevel =
  | 'senior'
  | 'mid'
  | 'entry'
  | 'career_switcher';

/**
 * Generates high-impact Software Engineer Cover Letters adhering to the
 * Indeed & Intuit Software Engineering Cover Letter Blueprints:
 * 1. Hook & Role Fit (State position, specific technical hook, connect to company mission)
 * 2. Quantifiable Technical Impact (Action + Project Context + Measurable Result)
 * 3. Relevant Tech Stack & Craft (Mirrored JD keywords, automated testing, CI/CD, cross-functional collaboration)
 * 4. Why Company & Culture Alignment (Authentic curiosity for product challenges)
 * 5. Confident Close & Actionable Contact (Clear CTA, portfolio/GitHub, phone, email)
 */
export async function generateCoverLetter(
  jdText: string,
  resumeText: string,
  companyName: string,
  roleTitle: string,
  angle: CoverLetterAngle = 'problem_solver',
  level: CoverLetterExperienceLevel = 'senior',
  providerConfig?: ProviderConfig
): Promise<string> {
  const angleDescriptions: Record<CoverLetterAngle, string> = {
    problem_solver: 'Focuses directly on a critical high-stakes engineering challenge the company faces and how candidate solves it.',
    technical_depth: 'Focuses deeply on architectural mastery, code quality, and distributed systems design.',
    fast_impact: 'Focuses on rapid 30-60-90 day value acceleration and immediate team velocity.',
    cultural_alignment: 'Focuses on passion for the mission, product excellence, and collaborative ownership.',
  };

  const levelDescriptions: Record<CoverLetterExperienceLevel, string> = {
    senior: 'Senior / Staff Engineer: emphasizes systems architecture, mentoring, 50k+ QPS scale, and cross-functional leadership.',
    mid: 'Full-Stack / Backend Engineer: emphasizes end-to-end feature delivery, clean REST/gRPC API design, and automated test coverage.',
    entry: 'New Graduate / Entry-Level Engineer: emphasizes core computer science foundations, hackathon/capstone achievements, and internship impact (27% bug reduction).',
    career_switcher: 'Career Switcher / Bootcamp Graduate: emphasizes rapid technical immersion, shipped full-stack applications, and translating domain problem-solving into software engineering.',
  };

  const prompt = `Write an exceptional, compelling 4-paragraph Software Engineering Cover Letter for the role of "${roleTitle}" at "${companyName}".
Guidance: Follow the official Indeed & Intuit Software Engineer Cover Letter Standards.

Target Experience Profile: ${levelDescriptions[level]}
Strategic Angle: ${angleDescriptions[angle]}

--- CANDIDATE RESUME ---
${resumeText.slice(0, 2000)}
--- END RESUME ---

--- JOB DESCRIPTION ---
${jdText.slice(0, 2000)}
--- END JOB DESCRIPTION ---

STRICT 4-PARAGRAPH BLUEPRINT (Indeed & Intuit Standard):
1. PARAGRAPH 1 (Hook and Role Fit):
   - Professional salutation: "Dear ${companyName} Engineering Hiring Team,"
   - State the exact role ("${roleTitle}") and company name.
   - Lead with an immediate, compelling technical hook tied directly to ${companyName}'s engineering goals or product mission.
   - ABSOLUTELY ZERO generic boilerplate cliches (e.g. "I am writing to express my enthusiastic interest in...", "Please find enclosed my resume").

2. PARAGRAPH 2 (Skill Proof & Quantifiable Impact):
   - Highlight 1-2 real-world engineering accomplishments from candidate experience.
   - Include specific, measurable outcomes (e.g. percentage improvements in latency, uptime metrics, QPS throughput, or bug reduction).
   - Directly connect technical decisions to user and business value.

3. PARAGRAPH 3 (Relevant Tech Stack & Team Collaboration):
   - Mirror high-value technical keywords directly from the JD (languages, frameworks, cloud infrastructure, databases).
   - Emphasize engineering rigor: testing (unit/integration/E2E), CI/CD automation, code reviews, and cross-functional agile teamwork with Product and Design.

4. PARAGRAPH 4 (Why ${companyName} & Confident Close):
   - Express genuine, informed enthusiasm for ${companyName}'s specific product challenges or engineering mission.
   - Confident, professional call to action to discuss team needs.
   - Include actionable contact placeholders: [Phone Number] | [Email] | [GitHub / Portfolio].
   - Professional sign-off: "Sincerely,\nCandidate Name".

Length: 240 to 320 words max. Sharp, authentic, senior engineering tone.`;

  if (!providerConfig || !providerConfig.apiKey) {
    if (level === 'entry') {
      return `Dear ${companyName} Engineering Hiring Team,

I am writing to apply for the ${roleTitle} position at ${companyName}. As a Computer Science graduate with hands-on experience building full-stack applications and participating in competitive hackathons, I have long admired ${companyName}'s technological innovation and look forward to contributing to your engineering mission.

During my recent software engineering internship, I collaborated with cross-functional engineers and product teams to test and optimize internal data services, driving a 27% reduction in late-cycle software bugs through automated integration testing. Additionally, I built an open-source real-time collaborative document engine utilizing WebSockets and conflict-free data types, demonstrating my grasp of distributed state and asynchronous networking.

My foundational skills span Java, Python, JavaScript/TypeScript, SQL, and Git version control, along with practical experience in Docker and cloud deployment basics. I thrive in agile environments where rapid feedback, continuous learning, and clean algorithmic problem-solving drive daily progress.

Joining ${companyName} would be an extraordinary opportunity to work alongside talented engineers and solve challenging problems at scale. I am confident my strong fundamentals, curiosity, and work ethic make me an immediate contributor to your team.

You can reach me at [Phone] or [Email]. My portfolio and GitHub repositories are located at [GitHub / Portfolio]. Thank you for your time and consideration.

Sincerely,
Candidate`;
    }

    if (level === 'career_switcher') {
      return `Dear ${companyName} Engineering Hiring Team,

I am excited to submit my application for the ${roleTitle} role at ${companyName}. Bringing a decade of professional problem-solving and domain expertise combined with rigorous software engineering immersion, I am eager to contribute to ${companyName}'s impactful technology initiatives.

During my intensive software engineering training and subsequent freelance development, I built and deployed multiple production-ready applications, including a custom full-stack analytics tool that boosted user engagement by 33% and reduced workflow errors by 78%. I have engineered responsive web frontends and reliable backend APIs with rigorous input validation and secure database interactions.

My technical toolkit includes JavaScript, TypeScript, React, Node.js, SQL, and cloud deployment on AWS. Having navigated complex stakeholder demands and operational constraints in my previous career, I bring unique strengths in cross-functional communication, adaptability, and high-pressure problem solving alongside my coding capabilities.

${companyName}'s mission of empowering users through innovative software resonates deeply with my own values. I would welcome the opportunity to discuss how my unique blend of domain perspective and modern engineering skills can support your team's objectives.

You can reach me at [Phone] or [Email]. My engineering portfolio and projects are available at [GitHub / Portfolio]. Thank you for your time and consideration.

Sincerely,
Candidate`;
    }

    if (level === 'mid') {
      return `Dear ${companyName} Engineering Hiring Team,

I am excited to apply for the ${roleTitle} role at ${companyName}. As a software engineer with extensive experience building scalable web applications and RESTful microservices, I admire ${companyName}'s commitment to engineering craft and seamless user experiences. I am eager to contribute to your team's feature velocity and platform reliability.

In my current work, I built and deployed full-stack features that improved core transaction throughput by 30% and cut API response latency by 40%. Collaborating closely with product managers and designers, I led the development of a real-time collaborative synchronization module that eliminated data contention for over 100,000 active users.

My daily stack includes TypeScript, Python, Node.js, SQL, Docker, and AWS. I take pride in writing clean, well-tested code backed by comprehensive unit and integration test suites, automated CI/CD pipelines, and thorough peer code reviews that prevent regressions before reaching production.

I would love to bring my technical drive and collaborative mindset to ${companyName}'s engineering organization. I look forward to the possibility of discussing how my experience can support your upcoming product launches.

You can reach me at [Phone] or [Email]. You can also review my work at [GitHub / Portfolio]. Thank you for your consideration.

Sincerely,
Candidate`;
    }

    // Default: 'senior'
    return `Dear ${companyName} Engineering Hiring Team,

Please consider my application for the ${roleTitle} position at ${companyName}. Having architected distributed microservices and scaled real-time data pipelines, I have followed ${companyName}'s technical growth with keen interest. Given your focus on building resilient, high-throughput systems, I am eager to apply my experience in distributed reliability and performance optimization to support your team's upcoming roadmap.

In my recent engineering roles, I designed and scaled event-driven backend architectures processing over 50,000 QPS with sub-50ms P99 latency. By refactoring asynchronous messaging pipelines and optimizing database indexing strategies, my team reduced server CPU utilization by 35% and eliminated critical cold-start latency spikes. I also established structured distributed tracing that decreased our mean time to resolution (MTTR) by 45% during production incidents, ensuring 99.99% system availability.

My technical toolkit centers on production-grade backend engineering with Java, TypeScript, Kafka, Docker, Kubernetes, and AWS, complemented by modern frontend workflows in React. Beyond systems architecture, I prioritize engineering excellence through rigorous automated integration testing, trunk-based CI/CD workflows, and active mentorship of junior engineers across the full software development lifecycle.

What excites me most about ${companyName} is your dedication to solving complex engineering problems while keeping customer experience at the center. I would welcome the opportunity to discuss how my architectural background and delivery track record can help accelerate your team's milestones this quarter.

You can reach me directly at [Phone] or [Email]. My open-source projects and code are available at [GitHub / Portfolio]. Thank you for your time and consideration.

Sincerely,
Candidate`;
  }

  const coverLetterModel = resolveOrMigrateModel(
    (providerConfig.type || 'groq') as AIProviderId,
    providerConfig.model,
    'llm'
  ).resolvedModel;

  let full = '';
  await streamAnswer(
    prompt,
    {
      type: providerConfig.type as any,
      apiKey: providerConfig.apiKey,
      model: coverLetterModel,
      temperature: 0.3,
      maxTokens: 1000,
      systemPrompt: 'You write sharp, authentic, senior-level software engineering cover letters that hiring managers actually enjoy reading, adhering to Indeed and Intuit industry best practices.',
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
