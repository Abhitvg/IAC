/**
 * CareerOps Internal PDF & Executive Document Exporter
 *
 * Converts structured resumes and cover letters directly into print-perfect,
 * ATS-compliant 1-page PDF documents without exposing raw LaTeX code to the user.
 */

import { parseLatexForVisualPreview } from './overleafPusher';

export interface ResumePrintData {
  name: string;
  role: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
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
  companyName: string;
  roleTitle: string;
  letterText: string;
  date?: string;
}

/**
 * Builds clean, executive, 1-page ATS-optimized HTML for printing to PDF.
 */
export function buildResumeHtml(data: ResumePrintData): string {
  const contactParts: string[] = [];
  if (data.email) contactParts.push(`<a href="mailto:${data.email}">${data.email}</a>`);
  if (data.phone) contactParts.push(data.phone);
  if (data.location) contactParts.push(data.location);
  if (data.linkedin) contactParts.push(`<a href="${data.linkedin.startsWith('http') ? data.linkedin : 'https://' + data.linkedin}">LinkedIn</a>`);
  if (data.github) contactParts.push(`<a href="${data.github.startsWith('http') ? data.github : 'https://' + data.github}">GitHub</a>`);

  const sectionsHtml = data.sections
    .map((sec) => {
      const itemsHtml = sec.lines
        .map((line) => {
          if (line.startsWith('•')) {
            const cleanLine = line.replace(/^•\s*/, '');
            return `<li class="bullet">${cleanLine}</li>`;
          }
          if (line.includes('—') || line.includes('|')) {
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${data.name} - ${data.role} Resume</title>
  <style>
    @page {
      size: letter;
      margin: 0.45in 0.5in 0.45in 0.5in;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.35;
      color: #111827;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      text-align: center;
      margin-bottom: 12px;
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
      font-size: 11pt;
      font-weight: 700;
      color: #2563eb;
      margin-bottom: 4px;
    }
    .header .contact-line {
      font-size: 8.5pt;
      color: #475569;
    }
    .header .contact-line a {
      color: #2563eb;
      text-decoration: none;
    }
    .resume-section {
      margin-bottom: 10px;
      break-inside: avoid;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 800;
      letter-spacing: 0.6px;
      color: #0f172a;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 2px;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    .subheading {
      font-size: 9.5pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 4px;
      margin-bottom: 2px;
    }
    .text-line {
      font-size: 9pt;
      color: #334155;
      margin-bottom: 2px;
    }
    .bullet-list {
      list-style-type: disc;
      padding-left: 18px;
      margin-top: 2px;
      margin-bottom: 4px;
    }
    .bullet {
      font-size: 9pt;
      line-height: 1.38;
      color: #334155;
      margin-bottom: 2px;
    }
    .bullet strong {
      color: #0f172a;
    }
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
    <div class="contact-line">${contactParts.join(' &nbsp;•&nbsp; ')}</div>
  </div>
  ${sectionsHtml}
</body>
</html>`;
}

/**
 * Builds clean, executive cover letter HTML for printing to PDF.
 */
export function buildCoverLetterHtml(data: CoverLetterPrintData): string {
  const paragraphs = data.letterText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const formattedParagraphs = paragraphs
    .map((p) => `<p style="margin-bottom: 14px; font-size: 10.5pt; line-height: 1.55; color: #1e293b;">${p.replace(/\n/g, '<br/>')}</p>`)
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
      margin: 0.8in 0.8in 0.8in 0.8in;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
      max-width: 650px;
      margin: 0 auto;
      padding: 20px;
    }
    .letterhead {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .candidate-name {
      font-size: 18pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
    }
    .candidate-contact {
      font-size: 9pt;
      color: #64748b;
      margin-top: 4px;
    }
    .recipient-block {
      margin-bottom: 20px;
      font-size: 10pt;
      color: #334155;
      line-height: 1.4;
    }
    .date-line {
      font-size: 9.5pt;
      color: #64748b;
      margin-bottom: 16px;
    }
    .re-line {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 16px;
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
    <div class="candidate-contact">
      ${[data.email, data.phone, data.location].filter(Boolean).join(' • ')}
    </div>
  </div>

  <div class="date-line">${formattedDate}</div>

  <div class="recipient-block">
    <strong>Engineering Hiring Team</strong><br/>
    ${data.companyName}<br/>
  </div>

  <div class="re-line">RE: Application for ${data.roleTitle}</div>

  <div class="letter-body">
    ${formattedParagraphs}
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
  iframe.title = title;

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Allow styles and fonts to paint before triggering native PDF print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('[CareerOps PDF] print iframe error, falling back to window.print():', err);
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }
  }, 250);
}

/**
 * 1-Click Resume PDF Export: Converts tailored resume directly to PDF
 */
export function exportTailoredResumeToPdf(
  rawResumeOrLatex: string,
  targetRole: string,
  companyName: string,
  candidateDetails?: { name?: string; email?: string; phone?: string; location?: string; linkedin?: string; github?: string }
): void {
  const parsed = parseLatexForVisualPreview(rawResumeOrLatex);

  const resumeData: ResumePrintData = {
    name: candidateDetails?.name || (parsed.name !== 'Candidate' ? parsed.name : 'Engineering Candidate'),
    role: targetRole || parsed.role || 'Software Engineer',
    email: candidateDetails?.email || parsed.email || undefined,
    phone: candidateDetails?.phone || undefined,
    location: candidateDetails?.location || undefined,
    linkedin: candidateDetails?.linkedin || undefined,
    github: candidateDetails?.github || undefined,
    sections: parsed.sections.length > 0
      ? parsed.sections
      : [
          {
            title: 'Professional Summary',
            lines: [
              `Seasoned engineer focused on ${targetRole} with direct expertise in building production systems for ${companyName}.`,
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

  const html = buildResumeHtml(resumeData);
  printHtmlToPdf(html, `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Resume`);
}

/**
 * 1-Click Cover Letter PDF Export
 */
export function exportCoverLetterToPdf(
  letterText: string,
  companyName: string,
  roleTitle: string,
  candidateDetails?: { name?: string; email?: string; phone?: string; location?: string }
): void {
  const html = buildCoverLetterHtml({
    candidateName: candidateDetails?.name || 'Candidate',
    email: candidateDetails?.email,
    phone: candidateDetails?.phone,
    location: candidateDetails?.location,
    companyName,
    roleTitle,
    letterText,
  });

  printHtmlToPdf(html, `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Cover_Letter`);
}
