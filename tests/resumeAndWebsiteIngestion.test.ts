import { describe, it, expect } from 'vitest';
import { extractStructuredResume } from '../src/services/ingestion/resumeStructuredExtractor';
import { parseDateString, calculateDurationMonths, validateChronology, extractExplicitMetrics } from '../src/services/ingestion/claimNormalizer';
import { validateAndNormalizeUrl } from '../src/services/website/urlSafetyPolicy';
import { extractCleanHtmlContent } from '../src/services/website/htmlContentExtractor';
import { classifyPage } from '../src/services/website/pageClassifier';
import { computeSimpleHash, detectPageChanges } from '../src/services/website/websiteChangeDetector';
import { SEED_WEBSITE_URL, WebsiteSourceService } from '../src/services/website/websiteSourceService';

describe('Phase 2 & Phase 3 — Ingestion & Website Source Suite', () => {
  describe('2. Resume Ingestion & Structured Claims', () => {
    const sampleResumeText = `
ABHISHEK SINGH
abhishek@testdomain.com | +1-555-0199 | https://github.com/Abhitvg | https://abhishek-jade.vercel.app

EXPERIENCE
Staff Systems Engineer | HyperScale Corp | 2022-01 - Present
• Designed distributed Kafka transaction processing engine handling 450k QPS with sub-25ms p99 latency.
• Reduced AWS infrastructure spend by 32% through container right-sizing on EKS.

Software Development Engineer | CloudNova Inc | 2019-06 - 2021-12
• Built microservices in Java and Spring Boot serving 10M daily active users.
• Spearheaded database migration to PostgreSQL achieving 99.99% uptime.

PROJECTS
Porcupine Telemetry Engine | TypeScript, Go, Kafka
• High-performance telemetry pipeline aggregating system metrics with 50ms end-to-end latency.

EDUCATION
Bachelor of Technology in Computer Science | University Institute of Engineering | 2015 - 2019

SKILLS
Languages: Java, TypeScript, Python, Go, SQL
Frameworks: Spring Boot, React, Node.js
Cloud & DevOps: AWS, Docker, Kubernetes, Terraform, Kafka, PostgreSQL
`;

    it('extracts personal identity correctly without inventing missing fields', () => {
      const result = extractStructuredResume(sampleResumeText, 'src-test-1');
      expect(result.personalProfile.fullName).toBe('ABHISHEK SINGH');
      expect(result.personalProfile.email).toBe('abhishek@testdomain.com');
      expect(result.personalProfile.phone).toBe('+1-555-0199');
      expect(result.personalProfile.githubUrl).toContain('github.com/Abhitvg');
      expect(result.personalProfile.websites).toContain('https://abhishek-jade.vercel.app');
    });

    it('extracts employment history with dates and explicit metrics', () => {
      const result = extractStructuredResume(sampleResumeText, 'src-test-1');
      expect(result.employment.length).toBeGreaterThanOrEqual(2);

      const firstRole = result.employment[0];
      expect(firstRole.employer).toContain('HyperScale Corp');
      expect(firstRole.role).toContain('Staff Systems Engineer');
      expect(firstRole.isCurrentRole).toBe(true);
      expect(firstRole.metrics).toEqual(expect.arrayContaining(['450k QPS', '25ms', '32%']));
    });

    it('separates parsed claims with RESUME_REPORTED evidence status', () => {
      const result = extractStructuredResume(sampleResumeText, 'src-test-1');
      expect(result.claims.length).toBeGreaterThan(0);
      for (const claim of result.claims) {
        expect(claim.evidenceStatus).toBe('RESUME_REPORTED');
        expect(claim.sourceType).toBe('resume_pdf');
        expect(claim.extractionConfidence).toBeGreaterThan(0);
      }
    });

    it('normalizes dates and calculates duration accurately', () => {
      const parsedStart = parseDateString('2022-01');
      expect(parsedStart?.year).toBe(2022);
      expect(parsedStart?.month).toBe(1);

      const parsedCurrent = parseDateString('Present');
      expect(parsedCurrent?.isCurrent).toBe(true);

      const duration = calculateDurationMonths('2020-01', '2020-12');
      expect(duration).toBe(12);
    });

    it('detects impossible chronology (end date before start date)', () => {
      const alerts = validateChronology([
        { id: 'job-1', title: 'Faulty Job', startDate: '2023-01', endDate: '2021-01' },
      ]);
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe('impossible_dates');
      expect(alerts[0].severity).toBe('error');
    });

    it('extracts explicit quantitative metrics without generating missing ones', () => {
      const text = 'Improved throughput by 45% and reduced p99 latency to 12ms across 5 million users';
      const metrics = extractExplicitMetrics(text);
      expect(metrics).toContain('45%');
      expect(metrics).toContain('12ms');
      expect(metrics).toContain('5 million users');
    });
  });

  describe('3. Personal Website Ingestion & SSRF Protection', () => {
    it('seeds candidate personal website URL correctly', () => {
      expect(SEED_WEBSITE_URL).toBe('https://abhishek-jade.vercel.app/');
      const sources = WebsiteSourceService.getSources();
      expect(sources[0]?.seedUrl).toBe('https://abhishek-jade.vercel.app/');
    });

    it('blocks loopback and localhost access', () => {
      expect(validateAndNormalizeUrl('http://localhost:3000').safe).toBe(false);
      expect(validateAndNormalizeUrl('http://127.0.0.1:8080').safe).toBe(false);
      expect(validateAndNormalizeUrl('http://[::1]/admin').safe).toBe(false);
    });

    it('blocks private IPv4 CIDR ranges and link-local cloud metadata', () => {
      // 10.0.0.0/8
      expect(validateAndNormalizeUrl('http://10.0.0.1').safe).toBe(false);
      // 172.16.0.0/12
      expect(validateAndNormalizeUrl('http://172.20.5.1').safe).toBe(false);
      // 192.168.0.0/16
      expect(validateAndNormalizeUrl('http://192.168.1.1').safe).toBe(false);
      // AWS / GCP Cloud Metadata (169.254.169.254)
      expect(validateAndNormalizeUrl('http://169.254.169.254/latest/meta-data').safe).toBe(false);
      expect(validateAndNormalizeUrl('http://metadata.google.internal/computeMetadata').safe).toBe(false);
    });

    it('blocks non-HTTP protocols (file, ftp, javascript, data)', () => {
      expect(validateAndNormalizeUrl('file:///etc/passwd').safe).toBe(false);
      expect(validateAndNormalizeUrl('ftp://ftp.example.com').safe).toBe(false);
      expect(validateAndNormalizeUrl('data:text/html,<b>pwned</b>').safe).toBe(false);
      expect(validateAndNormalizeUrl('javascript:alert(1)').safe).toBe(false);
    });

    it('normalizes valid public URLs and removes tracking queries', () => {
      const res = validateAndNormalizeUrl('https://abhishek-jade.vercel.app/projects?utm_source=twitter&ref=blog#section1');
      expect(res.safe).toBe(true);
      expect(res.normalizedUrl).toBe('https://abhishek-jade.vercel.app/projects');
    });

    it('extracts clean text and outbound links without executing scripts', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Abhishek Singh | Portfolio</title></head>
          <body>
            <nav><a href="/home">Home</a></nav>
            <script>window.pwned = true;</script>
            <main>
              <h1>Systems Engineer</h1>
              <p>I built event-driven microservices processing 100k events/sec with sub-50ms latency.</p>
              <a href="/projects/kafka">View Kafka Project</a>
            </main>
            <footer>Copyright 2026</footer>
          </body>
        </html>
      `;

      const result = extractCleanHtmlContent(sampleHtml, 'https://abhishek-jade.vercel.app', 'src-web-test');
      expect(result.title).toBe('Abhishek Singh | Portfolio');
      expect(result.cleanText).toContain('Systems Engineer');
      expect(result.cleanText).toContain('I built event-driven microservices');
      expect(result.cleanText).not.toContain('window.pwned');
      expect(result.outboundLinks).toContain('https://abhishek-jade.vercel.app/projects/kafka');

      // Check extracted claims
      expect(result.claims.length).toBeGreaterThanOrEqual(1);
      expect(result.claims[0].evidenceStatus).toBe('WEBSITE_REPORTED');
    });

    it('classifies pages into appropriate sections based on path and content', () => {
      expect(classifyPage('https://example.com/projects', 'Projects', '')).toBe('projects');
      expect(classifyPage('https://example.com/about-me', 'About', '')).toBe('about');
      expect(classifyPage('https://example.com/resume.pdf', 'Resume', '')).toBe('resume');
      expect(classifyPage('https://example.com/research-papers', 'Publications', '')).toBe('research');
      expect(classifyPage('https://example.com/contact', 'Contact Me', '')).toBe('contact');
    });

    it('detects page content changes using cryptographic hashing', () => {
      const hash1 = computeSimpleHash('Initial Page Content');
      const hash2 = computeSimpleHash('Updated Page Content');
      expect(hash1).not.toBe(hash2);

      const prev = [
        {
          url: 'https://example.com/p1',
          canonicalUrl: 'https://example.com/p1',
          title: 'Page 1',
          classification: 'projects' as const,
          htmlContent: '',
          cleanText: 'Initial text',
          contentHash: hash1,
          statusCode: 200,
          fetchedAt: 100,
          byteSize: 100,
          outboundLinks: [],
          extractedClaims: [],
        },
      ];

      const current = [
        {
          ...prev[0],
          cleanText: 'Updated text',
          contentHash: hash2,
        },
      ];

      const diffs = detectPageChanges(prev, current);
      expect(diffs).toHaveLength(1);
      expect(diffs[0].type).toBe('modified');
    });
  });
});

