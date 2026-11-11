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
    'java',
    'spring',
    'python',
    'typescript',
    'javascript',
    'react',
    'node',
    'aws',
    'docker',
    'kubernetes',
    'kafka',
    'sql',
    'nosql',
    'postgresql',
    'mongodb',
    'microservices',
    'system design',
    'distributed systems',
    'ci/cd',
    'linux',
    'git',
    'testing',
    'graphql',
    'rest',
  ];

  const jdTechMatches = techKeywords.filter((k) => jdLower.includes(k));
  const matchedInResume = jdTechMatches.filter((k) => resumeLower.includes(k));
  const missingTech = jdTechMatches.filter((k) => !resumeLower.includes(k));

  const roleTokens = roleTitle
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
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
    fit: resumeLower.includes(roleTitle.toLowerCase().split(' ')[0]) ? 'partial' : 'gap',
    evidence: resumeLower.includes(roleTitle.toLowerCase().split(' ')[0])
      ? 'The role keyword appears in the supplied resume text; verify the surrounding context.'
      : 'No role-token match found in the supplied resume text; assess transferable evidence manually.',
  });

  // Top tech requirements
  jdTechMatches.slice(0, 5).forEach((tech, idx) => {
    const has = resumeLower.includes(tech);
    weightedRequirements.push({
      requirement: `Production proficiency with ${tech.toUpperCase()}`,
      weight: idx < 2 ? 'critical' : 'high',
      fit: has ? 'partial' : 'gap',
      evidence: has
        ? `The keyword ${tech} appears in the supplied resume text; this does not by itself verify proficiency or production use.`
        : `No explicit keyword match for ${tech} in current CV digest.`,
    });
  });

  // Check work authorization signals
  let workAuthAlert: string | undefined;
  if (/no sponsorship|must be us citizen|security clearance required|no c2c/i.test(jdLower)) {
    workAuthAlert =
      '⚠️ Strict Work-Authorization Alert: Posting specifies no visa sponsorship or clearance required.';
  }

  // Estimate compensation from text if numbers present
  let estimatedRange = 'Not disclosed in the job description';
  const salaryMatch = jdText.match(
    /\$[0-9]{2,3}(?:,[0-9]{3})*(?:\s*-\s*\$[0-9]{2,3}(?:,[0-9]{3})*)?/
  );
  if (salaryMatch) {
    estimatedRange = `${salaryMatch[0]} (Extracted from JD)`;
  }

  return {
    score,
    recommendation,
    verdictHeadline:
      recommendation === 'apply'
        ? `🟡 Preliminary Keyword Match (${score}/5.0) — ${matchedInResume.length} matching terms found; verify evidence`
        : `🟡 Preliminary Keyword Match (${score}/5.0) — Missing terms: ${missingTech.slice(0, 3).join(', ') || 'limited role overlap'}`,
    summary:
      recommendation === 'apply'
        ? `A lightweight keyword scan found overlap with ${matchedInResume.length} listed technical terms. This is not proof of proficiency or eligibility; inspect each requirement against your actual experience before applying.`
        : `A lightweight keyword scan found gaps in ${missingTech.slice(0, 4).join(', ') || 'role terminology'}. This is not a definitive rejection; review transferable experience and non-keyword requirements before deciding.`,
    weightedRequirements,
    levelStrategy:
      'Use only the seniority, ownership, and delivery evidence explicitly supported by the source resume; do not infer level from keyword overlap.',
    identifiedGaps:
      missingTech.length > 0
        ? missingTech.map((t) => `Missing direct reference to ${t.toUpperCase()}`)
        : ['No tracked keyword gaps found; this does not establish full qualification.'],
    strategicAngle:
      'Choose a verified resume example that directly addresses the highest-priority requirement in this job description.',
    compensationEstimate: {
      estimatedRange,
      analysis: 'No independent market benchmark is calculated in offline heuristic mode.',
    },
    workAuthAlert,
    topInterviewStories: [
      'Prepare a STAR example from verified experience that demonstrates the most relevant technical requirement.',
      'Prepare a real example of diagnosing a difficult engineering issue; do not invent incident details or outcomes.',
      'Prepare a project example that demonstrates maintainability, testing, and collaboration where supported by your resume.',
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
2. Weight requirements: critical, high, or medium. A keyword match alone is not proof of proficiency; mark it partial unless the resume contains concrete, relevant evidence. Mark unsupported claims as gaps or unknown.
3. Identify genuine gaps without sugarcoating.
4. Extract compensation only when stated in the job description. If absent, return 'Not disclosed'; do not invent a market range. Do not infer seniority or eligibility.
5. Provide top 3 tailored STAR interview story prompts.

OUTPUT FORMAT: Return strictly valid JSON with no markdown wrapping or preamble, matching this exact schema:
{
  "score": 4.3,
  "recommendation": "apply",
  "verdictHeadline": "🟢 High Fit: Strong systems background matches core JD needs",
  "summary": "Concise 2-sentence summary of mutual fit and leverage points.",
  "weightedRequirements": [
    { "requirement": "Java", "weight": "critical", "fit": "partial", "evidence": "The source resume mentions Java; verify depth and context before scoring proficiency." },
    { "requirement": "Kafka", "weight": "high", "fit": "gap", "evidence": "No concrete Kafka evidence was supplied." }
  ],
  "levelStrategy": "Use only seniority and ownership evidence explicitly present in the source resume.",
  "identifiedGaps": ["List only requirements that are absent or unsupported in the source resume."],
  "strategicAngle": "Connect one verified candidate example to a stated job requirement.",
  "compensationEstimate": {
    "estimatedRange": "Not disclosed in the job description",
    "analysis": "No salary range was supplied in the posting."
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
        systemPrompt:
          'You are an expert technical recruiter and career strategist. You return only valid, well-formed JSON.',
      },
      'javascript',
      {
        onToken: (tok) => {
          fullResponse += tok;
        },
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
export const SB2NOV_LATEX_TEMPLATE = `% Source-preserving sb2nov-compatible template.
% Offline mode does not invent candidate identity, employers, achievements, metrics, or education.

\\documentclass[letterpaper,11pt]{article}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.375in}
\\addtolength{\\evensidemargin}{-0.375in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\newcommand{\\resumeItem}[2]{\\item\\small{\\textbf{#1}: #2}}
\\begin{document}
\\begin{center}
  {\\Large \\textbf{[Candidate Name]}}\\\\
  [Email] \\quad [Phone] \\quad [Portfolio / GitHub]\\\\
  Target Role: {{TARGET_ROLE}} at {{COMPANY_NAME}}
\\end{center}

\\section{Experience}
\\begin{itemize}[leftmargin=*]
  \\item {{SOURCE_RESUME}}
\\end{itemize}

\\section{Projects}
\\textit{No projects are added in offline mode unless they are explicitly present in the source resume.}

\\section{Programming Skills}
\\textit{Use only skills explicitly listed in the source resume.}

\\section{Education}
\\textit{Use only education details explicitly listed in the source resume.}
\\end{document}
`;

function escapeLatexText(value: string): string {
  const replacements: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    '%': '\\%',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    _: '\\_',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return Array.from(value, (character) => replacements[character] ?? character).join('');
}

function buildSourceResumeLatex(
  resumeText: string,
  roleTitle: string,
  companyName: string
): string {
  const source = resumeText.trim()
    ? escapeLatexText(resumeText.trim()).split(/\r?\n/).join('\\\\\n')
    : 'No source resume supplied. Add a verified resume before generating a tailored version.';
  return SB2NOV_LATEX_TEMPLATE.replace(/{{TARGET_ROLE}}/g, escapeLatexText(roleTitle))
    .replace(/{{COMPANY_NAME}}/g, escapeLatexText(companyName))
    .replace('{{SOURCE_RESUME}}', source);
}

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
    return buildSourceResumeLatex(resumeText, roleTitle, companyName);
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
      systemPrompt:
        'You are an elite LaTeX resume architect who outputs 100% valid compilable sb2nov LaTeX resumes with zero preamble or markdown wrapping.',
    },
    'javascript',
    {
      onToken: (tok) => {
        full += tok;
      },
      onSentence: () => {},
      onComplete: () => {},
      onError: () => {},
    }
  );

  return (
    full ||
    SB2NOV_LATEX_TEMPLATE.replace(/{{TARGET_ROLE}}/g, roleTitle).replace(
      /{{COMPANY_NAME}}/g,
      companyName
    )
  );
}

export type CoverLetterAngle =
  'problem_solver' | 'technical_depth' | 'fast_impact' | 'cultural_alignment';

export type CoverLetterExperienceLevel = 'senior' | 'mid' | 'entry' | 'career_switcher';

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
    problem_solver:
      'Connect one verified candidate example to a problem explicitly described in the job description.',
    technical_depth:
      'Explain technical depth only where the source resume provides concrete evidence.',
    fast_impact:
      'Describe realistic early contributions based on verified skills; do not invent outcomes or metrics.',
    cultural_alignment:
      'Reference company mission or culture only when supported by the supplied job description.',
  };

  const levelDescriptions: Record<CoverLetterExperienceLevel, string> = {
    senior:
      'Emphasize architecture ownership, mentoring, and cross-functional leadership only when directly supported by the resume.',
    mid: 'Emphasize end-to-end delivery, API design, and testing only where the resume provides concrete examples.',
    entry:
      'Emphasize verified education, projects, internships, and fundamentals without inventing outcomes or metrics.',
    career_switcher:
      'Emphasize verified transferable experience and shipped projects; do not assume prior career duration or business outcomes.',
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
   - Highlight only accomplishments explicitly supported by the candidate resume.
   - Use a metric only when the exact metric is present in the resume; otherwise do not invent one.
   - Directly connect technical decisions to user and business value.

3. PARAGRAPH 3 (Relevant Tech Stack & Team Collaboration):
   - Mirror high-value technical keywords directly from the JD (languages, frameworks, cloud infrastructure, databases).
   - Emphasize engineering rigor: testing (unit/integration/E2E), CI/CD automation, code reviews, and cross-functional agile teamwork with Product and Design.

4. PARAGRAPH 4 (Why ${companyName} & Confident Close):
   - Mention company-specific product or mission details only when supported by the supplied job description; otherwise keep this section role-focused.
   - Confident, professional call to action to discuss team needs.
   - Include actionable contact placeholders: [Phone Number] | [Email] | [GitHub / Portfolio].
   - Professional sign-off: "Sincerely,\nCandidate Name".

Length: 180 to 260 words max. Sharp, authentic, role-appropriate tone. Never invent candidate identity, seniority, years of experience, projects, employers, metrics, or company facts.`;

  if (!providerConfig || !providerConfig.apiKey) {
    const sourceContext = resumeText.trim()
      ? 'My relevant experience and project work are documented in the attached resume. I would welcome the opportunity to discuss the parts most closely aligned with your team’s needs.'
      : 'I would be glad to share my resume and discuss how my verified experience aligns with the role.';
    return `Dear ${companyName} Hiring Team,

I am applying for the ${roleTitle} position at ${companyName}. The role’s focus on ${jdText.trim().slice(0, 180) || 'software engineering'} is relevant to the work I am looking to contribute to.

${sourceContext}

I focus on clear engineering fundamentals, maintainable implementation, and collaborating with product and engineering teams to deliver reliable software. I would be happy to provide specific examples from my work that match the responsibilities described in the job posting.

Thank you for reviewing my application. I would welcome a conversation about the role and the problems your team is prioritizing.

Sincerely,
[Candidate Name]`;
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
      systemPrompt:
        'You write sharp, authentic, senior-level software engineering cover letters that hiring managers actually enjoy reading, adhering to Indeed and Intuit industry best practices.',
    },
    'javascript',
    {
      onToken: (tok) => {
        full += tok;
      },
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
  // Keep deterministic drafts factual; candidate-specific claims belong in reviewed resume evidence.
  const linkedinRecruiter =
    `Hi! I'm interested in the ${roleTitle} opening at ${companyName} and would appreciate the chance to connect and learn what the team is prioritizing. Thanks!`.slice(
      0,
      298
    );

  const linkedinHiringManager =
    `Hi! I'm interested in the ${roleTitle} role at ${companyName} and would welcome a chance to learn more about the team's current engineering priorities. Thanks!`.slice(
      0,
      298
    );

  const coldEmailSubject = `Regarding the ${roleTitle} role at ${companyName}`;
  const coldEmailBody = `Hi ${companyName} Team,

I'm reaching out regarding the ${roleTitle} position at ${companyName}. I would welcome the opportunity to discuss the role and the engineering problems your team is prioritizing.

My relevant experience and projects are described in my resume. I would be glad to explain how that verified work aligns with the role.

Resume: [Resume Link]
Portfolio: [Portfolio Link]

Best regards,
[Candidate Name]`;

  return {
    linkedinRecruiter,
    linkedinHiringManager,
    coldEmailSubject,
    coldEmailBody,
  };
}
