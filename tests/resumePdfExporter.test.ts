import { describe, it, expect } from 'vitest';
import {
  buildResumeHtml,
  buildCoverLetterHtml,
  type ResumePrintData,
  type CoverLetterPrintData,
} from '../src/services/careerOps/resumePdfExporter';

describe('CareerOps Internal PDF Converter & Executive Resume/Cover Letter Exporter', () => {
  const sampleResumeData: ResumePrintData = {
    name: 'Abhishek Singh',
    role: 'Senior Web Developer, Global Ecommerce',
    email: 'Abhisheksingh1thakur@gmail.com',
    phone: '+91-8850970898',
    location: 'New Delhi, India',
    github: 'github.com/Abhitvg',
    portfolio: 'abhishek-jade.vercel.app',
    sections: [
      {
        title: 'Professional Summary',
        lines: [
          'Frontend-focused full-stack engineer with 4+ years experience building customer-facing web products, eCommerce experiences, and production applications with React, Next.js, TypeScript, and Tailwind CSS.',
        ],
      },
      {
        title: 'Core Technical Skills',
        lines: [
          'Frontend: React, Next.js, TypeScript, JavaScript (ES6+), Tailwind CSS, HTML5, CSS3',
          'Backend & Integration: Node.js, Express, Java, Spring Boot, REST APIs, microservices',
          'Data & Services: MongoDB, PostgreSQL, SQLite, Firebase, Cassandra, Kafka',
        ],
      },
      {
        title: 'Professional Experience',
        lines: [
          'ATMA Research & Consultancy — Full-Stack / Product Engineering | Jul 2025 – Present',
          '• Developed the ATMA AI corporate website using Next.js and modern React patterns.',
          '• Architected product interfaces for Porcupine, an Electron + Next.js command center.',
        ],
      },
      {
        title: 'Selected Product & Frontend Projects',
        lines: [
          'Sheetal Electrotech — B2B Manufacturing Platform | 2026',
          'Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Neon Postgres · Vercel Blob',
          '• Built a responsive, bilingual corporate web platform with localized routes and RFQ workflow.',
        ],
      },
    ],
  };

  it('generates executive 1-page ATS resume HTML in modern_sans style without raw LaTeX tags', () => {
    const html = buildResumeHtml(sampleResumeData, 'modern_sans');

    expect(html).toContain('Abhishek Singh');
    expect(html).toContain('Senior Web Developer, Global Ecommerce');
    expect(html).toContain('Abhisheksingh1thakur@gmail.com');
    expect(html).toContain('PROFESSIONAL SUMMARY');
    expect(html).toContain('CORE TECHNICAL SKILLS');
    expect(html).toContain('skill-category-row');
    expect(html).toContain('tech-badge-row');
    expect(html).toContain('Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Neon Postgres · Vercel Blob');
    // Ensure no raw LaTeX syntax leaks
    expect(html).not.toContain('\\documentclass');
    expect(html).not.toContain('\\begin{document}');
    expect(html).not.toContain('\\resumeItem');
    expect(html).not.toContain('\\textbf');
    expect(html).toContain('@page {');
    expect(html).toContain('size: letter');
    expect(html).toContain('font-family: -apple-system');
  });

  it('generates classic sb2nov serif resume HTML in classic_serif style', () => {
    const html = buildResumeHtml(sampleResumeData, 'classic_serif');

    expect(html).toContain('Abhishek Singh');
    expect(html).toContain('Times New Roman');
    expect(html).toContain('PROFESSIONAL SUMMARY');
    expect(html).toContain('ATMA Research & Consultancy');
    expect(html).not.toContain('\\documentclass');
  });

  it('generates executive cover letter HTML with natural tone and proper letterhead', () => {
    const letterData: CoverLetterPrintData = {
      candidateName: 'Abhishek Singh',
      email: 'Abhisheksingh1thakur@gmail.com',
      phone: '+91-8850970898',
      location: 'New Delhi, India',
      github: 'github.com/Abhitvg',
      portfolio: 'abhishek-jade.vercel.app',
      companyName: 'reMarkable',
      roleTitle: 'Senior Web Developer, Global Ecommerce',
      letterText: `I am applying for the Senior Web Developer position on reMarkable’s Global Ecommerce team. I am a Computer Science graduate from Jawaharlal Nehru University with more than four years of software development experience building customer-facing web products, commerce experiences and production applications.

My project work includes several directly relevant commerce and product experiences. For UKCOP / DoonSilk, I worked on cooperative-commerce and product workflows. Bakraw involved a customer-facing meat-commerce experience, while The Balance Bite is a food-focused digital product. I have also developed a bilingual B2B manufacturing platform for Sheetal Electrotech with Next.js 16, React 19, Neon Postgres, and private file storage.

I would bring to reMarkable a product-minded engineering approach, strong hands-on experience with the modern React ecosystem, and the ability to collaborate with designers, product managers and backend engineers.`,
    };

    const html = buildCoverLetterHtml(letterData);

    expect(html).toContain('Abhishek Singh');
    expect(html).toContain('APPLICATION — SENIOR WEB DEVELOPER, GLOBAL ECOMMERCE, REMARKABLE');
    expect(html).toContain('Engineering Hiring Team');
    expect(html).toContain('reMarkable');
    expect(html).toContain('RE: Application for Senior Web Developer, Global Ecommerce');
    expect(html).toContain('Sheetal Electrotech');
    // Zero AI clichés
    expect(html).not.toContain('I am writing to express my enthusiastic interest');
    expect(html).not.toContain('In today\'s fast-paced digital world');
    expect(html).not.toContain('testament to');
    expect(html).not.toContain('delve into');
    expect(html).toContain('@page {');
  });
});
