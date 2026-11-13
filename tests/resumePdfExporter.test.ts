import { describe, it, expect } from 'vitest';
import {
  buildResumeHtml,
  buildCoverLetterHtml,
  type ResumePrintData,
  type CoverLetterPrintData,
} from '../src/services/careerOps/resumePdfExporter';

describe('CareerOps Internal PDF Converter & Executive Resume/Cover Letter Exporter', () => {
  it('generates executive 1-page ATS resume HTML without raw LaTeX tags', () => {
    const resumeData: ResumePrintData = {
      name: 'Abhishek Singh',
      role: 'Staff Distributed Systems Engineer',
      email: 'candidate@domain.com',
      phone: '+1 (555) 019-2834',
      location: 'San Francisco, CA',
      linkedin: 'linkedin.com/in/abhisheksingh',
      github: 'github.com/abhisheksingh',
      sections: [
        {
          title: 'Professional Summary',
          lines: [
            'Staff Engineer with 8+ years experience scaling high-throughput distributed architectures, Kafka streaming pipelines, and Go microservices.',
          ],
        },
        {
          title: 'Experience',
          lines: [
            'Datadog — Staff Systems Engineer | New York, NY (2022 - Present)',
            '• Architected event-driven telemetry pipeline processing 50k QPS with Go and Kafka.',
            '• Reduced P99 ingestion latency by 45% through custom memory-pooled serialization.',
          ],
        },
        {
          title: 'Technical Skills',
          lines: [
            'Languages: Go, TypeScript, Python, SQL, C++',
            'Infrastructure: Kubernetes, Docker, Kafka, AWS, PostgreSQL, Redis',
          ],
        },
      ],
    };

    const html = buildResumeHtml(resumeData);

    expect(html).toContain('Abhishek Singh');
    expect(html).toContain('Staff Distributed Systems Engineer');
    expect(html).toContain('candidate@domain.com');
    expect(html).toContain('PROFESSIONAL SUMMARY');
    expect(html).toContain('Architected event-driven telemetry pipeline');
    // Ensure no raw LaTeX syntax leaks
    expect(html).not.toContain('\\documentclass');
    expect(html).not.toContain('\\begin{document}');
    expect(html).not.toContain('\\resumeItem');
    expect(html).not.toContain('\\textbf');
    expect(html).toContain('@page {');
    expect(html).toContain('size: letter');
  });

  it('generates executive cover letter HTML with natural tone and proper letterhead', () => {
    const letterData: CoverLetterPrintData = {
      candidateName: 'Abhishek Singh',
      email: 'candidate@domain.com',
      phone: '+1 (555) 019-2834',
      location: 'San Francisco, CA',
      companyName: 'Datadog',
      roleTitle: 'Staff Distributed Systems Engineer',
      letterText: `I am applying for the Staff Distributed Systems Engineer position at Datadog. Over the past several years, my core technical focus has been building reliable production systems with Go, Kafka, and Kubernetes.

Looking closely at what your team is building, the technical focus aligns directly with the engineering problems I enjoy solving most: designing robust services, keeping latencies low and predictable, and partnering closely with product and infrastructure teammates to ship features predictably.

I appreciate how Datadog approaches engineering craft, and I would welcome the opportunity to speak with the team about where I can make an immediate impact.`,
    };

    const html = buildCoverLetterHtml(letterData);

    expect(html).toContain('Abhishek Singh');
    expect(html).toContain('Engineering Hiring Team');
    expect(html).toContain('Datadog');
    expect(html).toContain('RE: Application for Staff Distributed Systems Engineer');
    expect(html).toContain('Over the past several years, my core technical focus has been building reliable production systems');
    // Zero AI clichés
    expect(html).not.toContain('I am writing to express my enthusiastic interest');
    expect(html).not.toContain('In today\'s fast-paced digital world');
    expect(html).not.toContain('testament to');
    expect(html).not.toContain('delve into');
    expect(html).toContain('@page {');
  });
});
