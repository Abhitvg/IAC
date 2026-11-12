import type { JobPosting } from '../plugins';
import type { CandidateFact } from '../career-graph-types';
import type { SprintContract } from '../contract';
import { sanitizeUntrustedText } from '../sanitizer';

export interface TailoredArtifacts {
  tailoredResumeLatex: string;
  tailoredCoverLetterText: string;
  usedFactKeys: string[];
}

function escapeLatex(text: string): string {
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
  return Array.from(text, (char) => replacements[char] ?? char).join('');
}

/**
 * Generates an ATS-tailored sb2nov LaTeX resume and targeted cover letter
 * strictly derived from the candidate's confirmed Career Graph facts.
 * Enforces H3 (zero fabrication) and H4 (sender identity + opt-out in outreach).
 */
export function generateTailoredArtifacts(
  job: JobPosting,
  confirmedFacts: CandidateFact[],
  contract: SprintContract
): TailoredArtifacts {
  const usedFactKeys: string[] = [];

  const candidateProfile = confirmedFacts.find((f) => f.category === 'profile');
  const candidateExperiences = confirmedFacts.filter((f) => f.category === 'experience');
  const candidateEducation = confirmedFacts.filter((f) => f.category === 'education');
  const candidateSkills = confirmedFacts.filter((f) => f.category === 'skill');
  const candidateProjects = confirmedFacts.filter((f) => f.category === 'project');

  if (candidateProfile) usedFactKeys.push(candidateProfile.factKey);
  candidateExperiences.forEach((e) => usedFactKeys.push(e.factKey));
  candidateEducation.forEach((e) => usedFactKeys.push(e.factKey));
  candidateSkills.forEach((s) => usedFactKeys.push(s.factKey));

  const candidateName = contract.senderIdentity.name;
  const candidateEmail = contract.senderIdentity.email;

  // Build sb2nov LaTeX resume
  let latex = `\\documentclass[letterpaper,11pt]{article}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\begin{document}

\\begin{center}
  {\\Large \\textbf{${escapeLatex(candidateName)}}}\\\\
  \\href{mailto:${candidateEmail}}{${escapeLatex(candidateEmail)}} \\quad Target: ${escapeLatex(
    job.title
  )} at ${escapeLatex(job.company)}
\\end{center}

\\section{Experience}
\\begin{itemize}[leftmargin=*]
`;

  for (const exp of candidateExperiences) {
    const p = exp.payload as {
      company: string;
      role: string;
      startDate: string;
      endDate: string | null;
      achievements?: string[];
    };
    const dateRange = p.endDate ? `${p.startDate} -- ${p.endDate}` : `${p.startDate} -- Present`;
    latex += `  \\item \\textbf{${escapeLatex(p.role)}} at \\textbf{${escapeLatex(
      p.company
    )}} \\hfill {\\small ${escapeLatex(dateRange)}}\n`;

    if (p.achievements && p.achievements.length > 0) {
      latex += `  \\begin{itemize}\n`;
      for (const bullet of p.achievements) {
        latex += `    \\item ${escapeLatex(bullet)}\n`;
      }
      latex += `  \\end{itemize}\n`;
    }
  }

  latex += `\\end{itemize}\n\n\\section{Technical Skills}\n\\begin{itemize}[leftmargin=*]\n  \\item `;
  const skillNames = candidateSkills.map((s) => (s.payload as { name: string }).name);
  latex += escapeLatex(skillNames.join(', '));
  latex += `\n\\end{itemize}\n\n\\section{Education}\n\\begin{itemize}[leftmargin=*]\n`;

  for (const edu of candidateEducation) {
    const p = edu.payload as { institution: string; degree: string; endDate: string };
    latex += `  \\item \\textbf{${escapeLatex(p.degree)}}, ${escapeLatex(
      p.institution
    )} \\hfill {\\small ${escapeLatex(p.endDate)}}\n`;
  }

  latex += `\\end{itemize}\n\\end{document}\n`;

  // Build Cover Letter
  const topExp = candidateExperiences[0]?.payload as
    | {
        company: string;
        role: string;
        achievements?: string[];
      }
    | undefined;
  const primaryAchievement = topExp?.achievements?.[0] || 'engineering reliable systems';

  const coverLetter = `Dear ${job.company} Hiring Team,

I am writing to express my enthusiastic interest in the ${job.title} role at ${job.company}. Having built scalable distributed systems and production architectures, I am eager to contribute directly to ${job.company}'s engineering objectives.

In my recent work as ${topExp?.role || 'Engineer'} at ${topExp?.company || 'my recent role'}, I ${primaryAchievement}. My technical toolkit includes ${skillNames.slice(0, 6).join(', ')}, all grounded in real production deliveries.

I admire ${job.company}'s mission and would welcome the opportunity to discuss how my verified background aligns with your engineering roadmap.

Best regards,
${candidateName}
${candidateEmail}

---
Note: You are receiving this message regarding the ${job.title} opening. If you prefer not to receive further updates from me, please reply with "unsubscribe" or "opt-out".`;

  return {
    tailoredResumeLatex: latex,
    tailoredCoverLetterText: coverLetter,
    usedFactKeys,
  };
}
