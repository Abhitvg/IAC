/**
 * CareerOps Internal PDF & Executive Document Exporter
 *
 * Converts structured resumes and cover letters directly into print-perfect,
 * ATS-compliant 1-page PDF documents without exposing raw LaTeX code to the user.
 * Supports both "Modern Executive (Sans-Serif)" and "Classic ATS Ivy (Serif/sb2nov)" styles.
 */

import { parseLatexForVisualPreview } from './overleafPusher';

export type ResumeTheme = 'modern_sans' | 'classic_serif';

export interface ResumePrintData {
  name: string;
  role: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  sections: Array<{
    title: string;
    lines: string[];
  }>;
}

export interface CoverLetterPrintData {
  candidateName: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  companyName: string;
  roleTitle: string;
  letterText: string;
  date?: string;
}

/**
 * Builds clean, executive, 1-page ATS-optimized HTML for printing to PDF.
 */
export function buildResumeHtml(data: ResumePrintData, theme: ResumeTheme = 'modern_sans'): string {
  const contactParts: string[] = [];
  if (data.email) contactParts.push(`<a href="mailto:${data.email}">${data.email}</a>`);
  if (data.phone) contactParts.push(`<span>${data.phone}</span>`);
  if (data.location && data.location !== 'unknown') contactParts.push(`<span>${data.location}</span>`);
  if (data.github) {
    const cleanGh = data.github.replace(/^https?:\/\//, '');
    contactParts.push(`<a href="${data.github.startsWith('http') ? data.github : 'https://' + data.github}">GitHub: ${cleanGh}</a>`);
  }
  if (data.linkedin) {
    const cleanLi = data.linkedin.replace(/^https?:\/\//, '');
    contactParts.push(`<a href="${data.linkedin.startsWith('http') ? data.linkedin : 'https://' + data.linkedin}">LinkedIn</a>`);
  }
  if (data.portfolio) {
    const cleanPort = data.portfolio.replace(/^https?:\/\//, '');
    contactParts.push(`<a href="${data.portfolio.startsWith('http') ? data.portfolio : 'https://' + data.portfolio}">Portfolio: ${cleanPort}</a>`);
  }

  const isModern = theme === 'modern_sans';

  const sectionsHtml = data.sections
    .map((sec) => {
      const isSkillsSection = /skills|technologies|proficiencies|competencies/i.test(sec.title);

      const itemsHtml = sec.lines
        .map((line) => {
          // Bullet point
          if (line.startsWith('•') || line.startsWith('-')) {
            const cleanLine = line.replace(/^[•\-]\s*/, '');
            // Highlight lead-in phrases before colon if present (e.g. "Architected pipeline: ...")
            const formattedBullet = cleanLine.replace(
              /^([A-Za-z0-9\s/&—–\-]+:)/,
              '<strong>$1</strong>'
            );
            return `<li class="bullet">${formattedBullet}</li>`;
          }

          // Technical skills category lines (e.g. "Frontend: React, Next.js...")
          if (isSkillsSection && line.includes(':')) {
            const [cat, ...rest] = line.split(':');
            return `<div class="skill-category-row"><span class="skill-label">${cat.trim()}:</span> <span class="skill-values">${rest.join(':').trim()}</span></div>`;
          }

          // Technology badge rows (e.g. "Next.js 16 · React 19 · TypeScript · Tailwind CSS 4")
          if (line.includes('·') && !line.includes('Present') && !line.includes('202')) {
            return `<div class="tech-badge-row">${line}</div>`;
          }

          // Subheadings with dates or locations (e.g. "Company — Role | Dates (Location)")
          if (line.includes('—') || line.includes('|') || line.includes('–')) {
            // Attempt to split left and right parts if dates are present
            const dateMatch = line.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20[12][0-9]|\bPresent\b)[\s\S]*$/i);
            if (dateMatch && isModern) {
              const leftPart = line.slice(0, dateMatch.index).replace(/[|\s—–]+$/, '').trim();
              const rightPart = line.slice(dateMatch.index).trim();
              return `<div class="subheading-split"><span class="subheading-title">${leftPart}</span><span class="subheading-date">${rightPart}</span></div>`;
            }
            return `<div class="subheading">${line}</div>`;
          }

          return `<div class="text-line">${line}</div>`;
        })
        .join('\n');

      return `
        <div class="resume-section">
          <div class="section-title">${sec.title.toUpperCase()}</div>
          <div class="section-content">
            ${itemsHtml.includes('<li') ? `<ul class="bullet-list">${itemsHtml}</ul>` : itemsHtml}
          </div>
        </div>
      `;
    })
    .join('\n');

  const modernStyles = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.35;
      color: #0f172a;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
    }
    .header .name {
      font-size: 19pt;
      font-weight: 800;
      letter-spacing: -0.3px;
      color: #0f172a;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .header .role-title {
      font-size: 9.5pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #1e40af;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .header .contact-line {
      font-size: 8.5pt;
      color: #475569;
      line-height: 1.4;
    }
    .header .contact-line a {
      color: #1e40af;
      text-decoration: none;
    }
    .resume-section {
      margin-bottom: 9px;
      break-inside: avoid;
    }
    .section-title {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #0f172a;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 2px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .subheading-split {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 9pt;
      margin-top: 4px;
      margin-bottom: 1px;
    }
    .subheading-title {
      font-weight: 700;
      color: #0f172a;
    }
    .subheading-date {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      text-align: right;
    }
    .subheading {
      font-size: 9pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 4px;
      margin-bottom: 2px;
    }
    .tech-badge-row {
      font-size: 8pt;
      font-weight: 600;
      color: #0284c7;
      margin-bottom: 2px;
      letter-spacing: 0.2px;
    }
    .skill-category-row {
      font-size: 8.5pt;
      margin-bottom: 2.5px;
      line-height: 1.35;
    }
    .skill-label {
      font-weight: 700;
      color: #0f172a;
    }
    .skill-values {
      color: #334155;
    }
    .text-line {
      font-size: 8.5pt;
      color: #334155;
      margin-bottom: 2px;
    }
    .bullet-list {
      list-style-type: disc;
      padding-left: 16px;
      margin-top: 2px;
      margin-bottom: 4px;
    }
    .bullet {
      font-size: 8.5pt;
      line-height: 1.34;
      color: #334155;
      margin-bottom: 2px;
    }
    .bullet strong {
      color: #0f172a;
      font-weight: 700;
    }
  `;

  const classicStyles = `
    body {
      font-family: "Times New Roman", Times, "Cambria", Georgia, serif;
      font-size: 9.5pt;
      line-height: 1.3;
      color: #000000;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      text-align: center;
      margin-bottom: 8px;
    }
    .header .name {
      font-size: 20pt;
      font-weight: bold;
      color: #000000;
      letter-spacing: 0.2px;
      margin-bottom: 2px;
    }
    .header .role-title {
      font-size: 10pt;
      font-style: italic;
      color: #333333;
      margin-bottom: 3px;
    }
    .header .contact-line {
      font-size: 9pt;
      color: #222222;
    }
    .header .contact-line a {
      color: #000000;
      text-decoration: underline;
    }
    .resume-section {
      margin-bottom: 8px;
      break-inside: avoid;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: bold;
      letter-spacing: 0.5px;
      color: #000000;
      border-bottom: 1px solid #000000;
      padding-bottom: 1px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .subheading-split, .subheading {
      font-size: 9.5pt;
      font-weight: bold;
      color: #000000;
      margin-top: 3px;
      margin-bottom: 1px;
    }
    .subheading-title {
      font-weight: bold;
    }
    .subheading-date {
      float: right;
      font-weight: normal;
      font-style: italic;
    }
    .tech-badge-row {
      font-size: 8.5pt;
      font-style: italic;
      color: #333333;
      margin-bottom: 2px;
    }
    .skill-category-row {
      font-size: 9pt;
      margin-bottom: 2px;
    }
    .skill-label {
      font-weight: bold;
    }
    .skill-values {
      color: #111111;
    }
    .text-line {
      font-size: 9pt;
      color: #111111;
      margin-bottom: 2px;
    }
    .bullet-list {
      list-style-type: disc;
      padding-left: 18px;
      margin-top: 2px;
      margin-bottom: 3px;
    }
    .bullet {
      font-size: 9pt;
      line-height: 1.32;
      color: #111111;
      margin-bottom: 1.5px;
    }
    .bullet strong {
      color: #000000;
      font-weight: bold;
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${data.name} - ${data.role} Resume</title>
  <style>
    @page {
      size: letter;
      margin: 0.42in 0.48in 0.42in 0.48in;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    ${isModern ? modernStyles : classicStyles}
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="name">${data.name}</div>
    <div class="role-title">${data.role}</div>
    <div class="contact-line">${contactParts.join(' &nbsp;|&nbsp; ')}</div>
  </div>
  ${sectionsHtml}
</body>
</html>`;
}

/**
 * Builds clean, executive cover letter HTML for printing to PDF.
 */
export function buildCoverLetterHtml(data: CoverLetterPrintData): string {
  const contactParts: string[] = [];
  if (data.email) contactParts.push(data.email);
  if (data.phone) contactParts.push(data.phone);
  if (data.location && data.location !== 'unknown') contactParts.push(data.location);
  if (data.github) {
    const cleanGh = data.github.replace(/^https?:\/\//, '');
    contactParts.push(`GitHub: ${cleanGh}`);
  }
  if (data.portfolio) {
    const cleanPort = data.portfolio.replace(/^https?:\/\//, '');
    contactParts.push(`Portfolio: ${cleanPort}`);
  }

  const paragraphs = data.letterText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const formattedParagraphs = paragraphs
    .map((p) => `<p style="margin-bottom: 14px; font-size: 10pt; line-height: 1.52; color: #1e293b; text-align: justify;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');

  const formattedDate = data.date || new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cover Letter - ${data.candidateName} for ${data.companyName}</title>
  <style>
    @page {
      size: letter;
      margin: 0.65in 0.75in 0.65in 0.75in;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.52;
      color: #1e293b;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
      max-width: 680px;
      margin: 0 auto;
      padding: 24px;
    }
    .letterhead {
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .candidate-name {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .app-subtitle {
      font-size: 9.5pt;
      font-weight: 700;
      color: #1e40af;
      letter-spacing: 0.5px;
      margin-top: 3px;
      text-transform: uppercase;
    }
    .candidate-contact {
      font-size: 8.5pt;
      color: #475569;
      margin-top: 5px;
      line-height: 1.4;
    }
    .recipient-block {
      margin-top: 14px;
      margin-bottom: 18px;
      font-size: 9.5pt;
      color: #334155;
      line-height: 1.4;
    }
    .recipient-block strong {
      color: #0f172a;
    }
    .date-line {
      font-size: 9pt;
      color: #64748b;
      margin-bottom: 14px;
    }
    .salutation {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 14px;
      font-size: 10pt;
    }
    .signoff {
      margin-top: 20px;
      font-size: 10pt;
      color: #1e293b;
    }
    .signoff-name {
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
      font-size: 10.5pt;
    }
    @media print {
      body {
        max-width: none;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="candidate-name">${data.candidateName}</div>
    <div class="app-subtitle">APPLICATION — ${data.roleTitle.toUpperCase()}, ${data.companyName.toUpperCase()}</div>
    <div class="candidate-contact">
      ${contactParts.join(' &nbsp;|&nbsp; ')}
    </div>
  </div>

  <div class="date-line">${formattedDate}</div>

  <div class="recipient-block">
    <strong>Engineering Hiring Team</strong><br/>
    ${data.companyName}<br/>
    ${data.location && data.location !== 'unknown' ? data.location : 'Engineering Department'}
  </div>

  <div class="salutation">Dear ${data.companyName} Engineering Hiring Team,</div>
  <div class="re-line" style="font-weight: 700; color: #0f172a; margin-bottom: 14px; font-size: 10pt;">RE: Application for ${data.roleTitle}</div>

  <div class="letter-body">
    ${formattedParagraphs}
  </div>

  <div class="signoff">
    Sincerely,<br/>
    <div class="signoff-name">${data.candidateName}</div>
  </div>
</body>
</html>`;
}

/**
 * Executes zero-dependency internal PDF print/export using a clean hidden print container.
 */
export function printHtmlToPdf(html: string, title: string = 'document'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const originalTitle = document.title;
  document.title = title;

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('[CareerOps] Print to PDF failed:', err);
    } finally {
      document.title = originalTitle;
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 2000);
    }
  }, 350);
}

/**
 * 1-Click Resume PDF Export: Converts tailored resume directly to PDF
 */
export function exportTailoredResumeToPdf(
  rawResumeOrLatex: string,
  targetRole: string,
  companyName: string,
  candidateDetails?: {
    name?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  },
  theme: ResumeTheme = 'modern_sans'
): void {
  const parsed = parseLatexForVisualPreview(rawResumeOrLatex);

  const candidateName =
    candidateDetails?.fullName ||
    candidateDetails?.name ||
    (parsed.name !== 'Candidate' ? parsed.name : 'Abhishek Singh');

  const resumeData: ResumePrintData = {
    name: candidateName,
    role: targetRole || parsed.role || 'Senior Software Engineer',
    email: candidateDetails?.email || (parsed.email || undefined),
    phone: candidateDetails?.phone || undefined,
    location: candidateDetails?.location && candidateDetails.location !== 'unknown' ? candidateDetails.location : undefined,
    linkedin: candidateDetails?.linkedin || undefined,
    github: candidateDetails?.github || undefined,
    portfolio: candidateDetails?.portfolio || undefined,
    sections: parsed.sections.length > 0
      ? parsed.sections
      : [
          {
            title: 'Professional Summary',
            lines: [
              `Frontend-focused full-stack engineer with 4+ years of software development experience building customer-facing web products, eCommerce experiences, responsive interfaces and production applications.`,
            ],
          },
          {
            title: 'Technical Experience',
            lines: rawResumeOrLatex
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => l.length > 10 && !l.startsWith('\\') && !l.startsWith('%')),
          },
        ],
  };

  const html = buildResumeHtml(resumeData, theme);
  const safeFilename = `${candidateName.replace(/\s+/g, '_')}_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Resume`;
  printHtmlToPdf(html, safeFilename);
}

/**
 * 1-Click Cover Letter PDF Export
 */
export function exportCoverLetterToPdf(
  letterText: string,
  companyName: string,
  roleTitle: string,
  candidateDetails?: {
    name?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  }
): void {
  const candidateName =
    candidateDetails?.fullName ||
    candidateDetails?.name ||
    'Abhishek Singh';

  const html = buildCoverLetterHtml({
    candidateName,
    email: candidateDetails?.email,
    phone: candidateDetails?.phone,
    location: candidateDetails?.location,
    linkedin: candidateDetails?.linkedin,
    github: candidateDetails?.github,
    portfolio: candidateDetails?.portfolio,
    companyName,
    roleTitle,
    letterText,
  });

  const safeFilename = `${candidateName.replace(/\s+/g, '_')}_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Cover_Letter`;
  printHtmlToPdf(html, safeFilename);
}
