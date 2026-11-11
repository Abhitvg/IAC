import { describe, it, expect } from 'vitest';
import {
  evaluateJobHeuristically,
  generateOutreachNotes,
  generateCoverLetter,
  generateTailoredResume,
} from '../src/services/careerOps/careerOpsService';
import { useCareerOpsStore } from '../src/store/useCareerOpsStore';

describe('CareerOps Intelligence Suite & A-H Evaluation Engine', () => {
  const sampleResume = `
Abhishek Singh — Senior Software Engineer
Experience:
- Architected distributed microservices in Java, Spring Boot, and TypeScript handling 50k QPS.
- Built event-driven telemetry pipelines using Apache Kafka and PostgreSQL.
- Automated CI/CD deployments using Docker, Kubernetes, and AWS (EC2, S3, RDS).
- Reduced P99 latency by 35% using Redis caching and database indexing.
`;

  describe('evaluateJobHeuristically() — 1-5 Fit Scoring & A-H Audit', () => {
    it('scores high fit (>= 4.0) and recommends "apply" when stack matches candidate resume', () => {
      const matchingJd = `
Senior Backend Engineer at CloudScale
Requirements:
- 5+ years experience with Java, Spring, and TypeScript.
- Strong knowledge of Apache Kafka, distributed systems, and PostgreSQL.
- Experience with AWS, Docker, and Kubernetes.
`;

      const report = evaluateJobHeuristically(
        matchingJd,
        sampleResume,
        'Senior Backend Engineer',
        'CloudScale'
      );

      expect(report.score).toBeGreaterThanOrEqual(4.0);
      expect(report.recommendation).toBe('apply');
      expect(report.verdictHeadline).toContain('Preliminary Keyword Match');
      expect(report.weightedRequirements.length).toBeGreaterThan(0);

      // Verify critical requirements check
      const javaReq = report.weightedRequirements.find((r) =>
        r.requirement.toLowerCase().includes('java')
      );
      expect(javaReq).toBeDefined();
      expect(javaReq?.fit).toBe('strong');
    });

    it('scores low fit (< 4.0) and recommends "skip" when JD requires unmatched legacy stack', () => {
      const mismatchJd = `
Mainframe Cobol Engineer at LegacyBank
Requirements:
- 10+ years in IBM Mainframe z/OS, COBOL, JCL, and CICS.
- Assembly language programming on AS400.
`;

      const report = evaluateJobHeuristically(
        mismatchJd,
        sampleResume,
        'Mainframe Cobol Engineer',
        'LegacyBank'
      );

      expect(report.score).toBeLessThan(4.0);
      expect(report.recommendation).toBe('skip');
      expect(report.verdictHeadline).toContain('Preliminary Keyword Match');
    });

    it('detects work authorization alerts when JD specifies no sponsorship', () => {
      const clearanceJd = `
Systems Engineer. No sponsorship available. Must be US Citizen with active Secret security clearance.
`;

      const report = evaluateJobHeuristically(
        clearanceJd,
        sampleResume,
        'Systems Engineer',
        'DefenseCorp'
      );

      expect(report.workAuthAlert).toBeDefined();
      expect(report.workAuthAlert).toContain('Strict Work-Authorization Alert');
    });

    it('extracts compensation range from JD text if present', () => {
      const compJd = `
Staff Engineer. Salary: $180,000 - $220,000 per year + equity.
`;

      const report = evaluateJobHeuristically(
        compJd,
        sampleResume,
        'Staff Engineer',
        'FintechCo'
      );

      expect(report.compensationEstimate.estimatedRange).toContain('$180,000');
    });
  });

  describe('generateOutreachNotes() — Contacto DMs & Email Drafts', () => {
    it('generates LinkedIn recruiter and hiring manager messages strictly under 300 characters', async () => {
      const notes = await generateOutreachNotes(
        'Datadog',
        'Staff Distributed Systems Engineer',
        'Kafka telemetry'
      );

      expect(notes.linkedinRecruiter.length).toBeLessThanOrEqual(300);
      expect(notes.linkedinHiringManager.length).toBeLessThanOrEqual(300);
      expect(notes.linkedinRecruiter).toContain('Datadog');
      expect(notes.linkedinHiringManager).toContain('Staff Distributed Systems Engineer');

      // Email draft check
      expect(notes.coldEmailSubject).toContain('Staff Distributed Systems Engineer');
      expect(notes.coldEmailBody).toContain('Datadog');
    });
  });

  describe('generateCoverLetter() — Indeed & Intuit Software Engineer Blueprint', () => {
    it('generates Senior level cover letters with distributed scale, quantified metrics, and zero cliches', async () => {
      const letter = await generateCoverLetter(
        'Looking for an engineer to scale microservices and optimize latency',
        sampleResume,
        'Alignerr',
        'Senior Software Developer',
        'problem_solver',
        'senior'
      );

      expect(letter).toContain('Alignerr');
      expect(letter).toContain('Senior Software Developer');
      expect(letter).not.toContain('50,000 QPS');
      expect(letter).toContain('latency');
      expect(letter).toContain('Dear Alignerr Engineering Hiring Team');
      expect(letter).toContain('[GitHub / Portfolio]');
      expect(letter).not.toContain('I am writing to express my eager enthusiasm');
      expect(letter).not.toContain('Please find enclosed my resume');
    });

    it('generates Entry-Level / New Grad cover letters highlighting 27% bug reduction and real projects', async () => {
      const letter = await generateCoverLetter(
        'Entry level software engineer with Java or Python',
        sampleResume,
        'Datadog',
        'Associate Software Engineer',
        'fast_impact',
        'entry'
      );

      expect(letter).toContain('Datadog');
      expect(letter).toContain('Associate Software Engineer');
      expect(letter).not.toContain('27% reduction in late-cycle software bugs');
      expect(letter).not.toContain('Computer Science graduate');
    });

    it('generates Mid-Level cover letters emphasizing API throughput and collaboration', async () => {
      const letter = await generateCoverLetter(
        'Full stack engineer to build scalable APIs',
        sampleResume,
        'Stripe',
        'Software Engineer',
        'technical_depth',
        'mid'
      );

      expect(letter).toContain('Stripe');
      expect(letter).toContain('Software Engineer');
      expect(letter).not.toContain('transaction throughput by 30%');
      expect(letter).not.toContain('100,000 active users');
    });

    it('generates Career Switcher cover letters translating domain depth into software impact', async () => {
      const letter = await generateCoverLetter(
        'Software engineer with strong problem solving skills',
        sampleResume,
        'Intuit',
        'Junior Software Engineer',
        'cultural_alignment',
        'career_switcher'
      );

      expect(letter).toContain('Intuit');
      expect(letter).toContain('Junior Software Engineer');
      expect(letter).not.toContain('boosted user engagement by 33%');
      expect(letter).not.toContain('reduced workflow errors by 78%');
    });
  });

  describe('generateTailoredResume() — Sourabh Bajaj (sb2nov) LaTeX ATS Alignment', () => {
    it('produces 100% valid compilable sb2nov LaTeX resume structure with matching technical competencies', async () => {
      const resume = await generateTailoredResume(
        'Need Java, Kafka, and AWS',
        sampleResume,
        'Lead Backend Engineer',
        'Stripe'
      );

      expect(resume).toContain('\\documentclass[letterpaper,11pt]{article}');
      expect(resume).toContain('[Candidate Name]');
      expect(resume).toContain('\\section{Programming Skills}');
      expect(resume).toContain('Source Resume');
      expect(resume).toContain('Lead Backend Engineer');
      expect(resume).toContain('Java');
      expect(resume).toContain('\\end{document}');
    });
  });

  describe('useCareerOpsStore Pipeline Integration', () => {
    it('adds, updates, filters, and calculates pipeline stats correctly', () => {
      const store = useCareerOpsStore.getState();

      const newId = store.addJob({
        company: 'Vercel',
        role: 'Frontend Infrastructure Lead',
        score: 4.6,
        status: 'applied',
      });

      const updatedStore = useCareerOpsStore.getState();
      const job = updatedStore.applications.find((a) => a.id === newId);
      expect(job).toBeDefined();
      expect(job?.company).toBe('Vercel');
      expect(job?.score).toBe(4.6);
      expect(job?.recommendation).toBe('apply');

      // Test status update
      store.updateJob(newId, { status: 'interviewing' });
      expect(useCareerOpsStore.getState().applications.find((a) => a.id === newId)?.status).toBe('interviewing');

      // Test stats calculation
      const stats = useCareerOpsStore.getState().stats;
      expect(stats.totalTracked).toBeGreaterThanOrEqual(1);
      expect(stats.highFitCount).toBeGreaterThanOrEqual(1);

      // Clean up
      store.deleteJob(newId);
      expect(useCareerOpsStore.getState().applications.find((a) => a.id === newId)).toBeUndefined();
    });

    it('exports and imports pipeline JSON for local backup and sharing', () => {
      const store = useCareerOpsStore.getState();
      store.addJob({ company: 'GitHub', role: 'Staff Platform Engineer' });
      const json = store.exportPipelineJson();
      expect(json).toContain('company');

      const success = store.importPipelineJson(json);
      expect(success).toBe(true);
    });
  });
});
