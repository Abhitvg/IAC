/**
 * CareerOps Overleaf 1-Click Pusher & LaTeX Previewer
 *
 * Integrates directly with Overleaf's web endpoint (https://www.overleaf.com/docs)
 * allowing users to launch a new, compilable Overleaf project containing
 * their Sourabh Bajaj (sb2nov) resume in 1 click without manual copy-pasting.
 */

export interface ParsedResumeSection {
  title: string;
  lines: string[];
}

export function openInOverleaf(latexSource: string, projectName: string = 'Resume_Sourabh_Bajaj') {
  if (typeof document === 'undefined') return;

  // Overleaf web API supports creating documents via POST to https://www.overleaf.com/docs with snip input
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://www.overleaf.com/docs';
  form.target = '_blank';

  const snipInput = document.createElement('input');
  snipInput.type = 'hidden';
  snipInput.name = 'snip';
  snipInput.value = latexSource;
  form.appendChild(snipInput);

  const snipNameInput = document.createElement('input');
  snipNameInput.type = 'hidden';
  snipNameInput.name = 'snip_name';
  snipNameInput.value = `${projectName}.tex`;
  form.appendChild(snipNameInput);

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

/**
 * Parses LaTeX source into structured human-readable sections for instant visual preview
 */
export function parseLatexForVisualPreview(latexSource: string): {
  name: string;
  email: string;
  role: string;
  sections: ParsedResumeSection[];
} {
  let name = 'Candidate';
  let email = '';
  let role = 'Software Engineer';

  const nameMatch = latexSource.match(/\\textbf{\\href{[^}]+}{\\Large\s+([^}]+)}}/);
  if (nameMatch) name = nameMatch[1].trim();

  const emailMatch = latexSource.match(/mailto:([^}]+)/);
  if (emailMatch) email = emailMatch[1].trim();

  const roleMatch = latexSource.match(/Target Role\s*:\s*([^\\\n]+)/);
  if (roleMatch) role = roleMatch[1].trim();

  const sections: ParsedResumeSection[] = [];
  const sectionRegex = /\\section{([^}]+)}([\s\S]*?)(?=\\section{|\\end{document}|$)/g;

  let match;
  while ((match = sectionRegex.exec(latexSource)) !== null) {
    const title = match[1].trim();
    const body = match[2];

    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('%'))
      .map((l) =>
        l
          .replace(/\\textbf{([^}]+)}/g, '$1')
          .replace(/\\textit{([^}]+)}/g, '$1')
          .replace(/\\small/g, '')
          .replace(/\\resumeItem{([^}]+)}{([^}]+)}/g, '• $1: $2')
          .replace(/\\resumeSubItem{([^}]+)}{([^}]+)}/g, '• $1: $2')
          .replace(/\\resumeSubheading\s*{([^}]+)}{([^}]+)}\s*{([^}]+)}{([^}]+)}/g, '$1 — $2 | $3 ($4)')
          .replace(/\\\S+/g, '')
          .replace(/[{}]/g, '')
          .replace(/\\&/g, '&')
          .replace(/\\%/g, '%')
          .trim()
      )
      .filter((l) => l.length > 1);

    sections.push({ title, lines });
  }

  return { name, email, role, sections };
}
