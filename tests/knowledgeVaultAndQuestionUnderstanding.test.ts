import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeVaultService } from '../src/services/knowledgeVault/knowledgeVaultService';
import { QuestionUnderstandingEngine } from '../src/services/questionUnderstanding';
import { IngestionResult } from '../src/services/ingestion/types';
import { CrawledPage } from '../src/services/website/websiteIngestionTypes';

describe('Knowledge Vault & Universal Question Understanding', () => {
  let vaultService: KnowledgeVaultService;

  beforeEach(() => {
    vaultService = KnowledgeVaultService.getInstance();
    vaultService.resetVault();
  });

  describe('Knowledge Vault Initialization & Ingestion', () => {
    it('initializes with clean, un-fabricated candidate vault', () => {
      const vault = vaultService.getVault();
      expect(vault.profile.name).toBe('');
      expect(vault.profile.email).toBe('');
      expect(vault.experiences).toHaveLength(0);
      expect(vault.projects).toHaveLength(0);
      expect(vault.technologies).toHaveLength(0);
      expect(vault.evidenceRecords).toHaveLength(0);
    });

    it('populates vault from IngestionResult with source provenance and relationships', () => {
      const mockIngestion: IngestionResult = {
        sourceId: 'src-test-1',
        sourceType: 'resume_pdf',
        documentTitle: 'candidate_resume.pdf',
        rawText: 'Candidate Resume Content',
        pageCount: 2,
        isImageOnlyOrScanned: false,
        ocrRequired: false,
        personalProfile: {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+1 555-0199',
          location: 'San Francisco, CA',
          websites: ['https://janedoe.dev'],
          githubUrl: 'https://github.com/janedoe',
          linkedinUrl: 'https://linkedin.com/in/janedoe',
        },
        education: [],
        employment: [
          {
            id: 'emp-1',
            employer: 'Acme Cloud Corp',
            role: 'Staff Infrastructure Engineer',
            startDate: '2021-01',
            endDate: 'Present',
            durationMonths: 36,
            isCurrentRole: true,
            responsibilities: ['Maintained multi-region Kubernetes clusters', 'Optimized distributed tracing pipeline'],
            technologies: ['Kubernetes', 'Go', 'Prometheus'],
            metrics: ['Reduced p99 cluster failover to 45 seconds'],
            associatedProjectIds: [],
            rawText: 'Staff Infrastructure Engineer at Acme Cloud Corp',
          },
        ],
        projects: [
          {
            id: 'proj-1',
            name: 'Distributed Stream Gateway',
            description: 'Low-latency event streaming gateway built with Go and Kafka',
            candidateRole: 'lead',
            technologies: ['Go', 'Apache Kafka', 'gRPC'],
            architecture: 'Microservices event mesh with Raft metadata coordination',
            outcomes: ['Deployed to 3 production regions'],
            metrics: ['Handled 40,000 requests/sec with p99 < 12ms'],
            repositoryUrl: 'https://github.com/janedoe/stream-gw',
            rawText: 'Built Distributed Stream Gateway handling 40k req/sec',
          },
        ],
        skills: {
          languages: ['Go', 'TypeScript', 'Java'],
          frameworks: ['gRPC', 'React'],
          databases: ['PostgreSQL', 'Redis'],
          messaging: ['Apache Kafka'],
          cloud: ['AWS', 'GCP'],
          devops: ['Kubernetes', 'Docker', 'Terraform'],
          testing: ['Vitest', 'JUnit'],
          architecture: ['Distributed Systems', 'Event-Driven Architecture'],
          aiMl: ['LLMs', 'RAG'],
          tools: ['Git', 'Grafana'],
        },
        achievements: [],
        claims: [
          {
            claimId: 'claim-1',
            candidateId: 'cand-1',
            sourceId: 'src-test-1',
            sourceType: 'resume_pdf',
            fieldName: 'employment.role',
            rawText: 'Staff Infrastructure Engineer at Acme Cloud Corp',
            normalizedValue: 'Staff Infrastructure Engineer',
            sourceLocation: { pageNumber: 1 },
            extractionMethod: 'deterministic_parse',
            extractionConfidence: 0.98,
            evidenceStatus: 'RESUME_REPORTED',
            reviewStatus: 'pending_review',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            parserVersion: '2.0.0',
          },
        ],
        chronologyAlerts: [],
        warnings: [],
        ingestedAt: Date.now(),
      };

      vaultService.populateFromIngestionResult(mockIngestion);
      const vault = vaultService.getVault();

      expect(vault.profile.name).toBe('Jane Doe');
      expect(vault.profile.email).toBe('jane@example.com');
      expect(vault.profile.links.github).toBe('https://github.com/janedoe');
      expect(vault.experiences).toHaveLength(1);
      expect(vault.experiences[0].company).toBe('Acme Cloud Corp');
      expect(vault.experiences[0].status).toBe('RESUME_REPORTED');
      expect(vault.projects).toHaveLength(1);
      expect(vault.projects[0].title).toBe('Distributed Stream Gateway');
      expect(vault.technologies.some((t) => t.name === 'Go')).toBe(true);
      expect(vault.technologies.some((t) => t.name === 'Kubernetes')).toBe(true);
      expect(vault.evidenceRecords).toHaveLength(1);
      expect(vault.evidenceRecords[0].classification).toBe('RESUME_REPORTED');
      expect(vault.relationships.some((r) => r.relation === 'worked_at')).toBe(true);
      expect(vault.relationships.some((r) => r.relation === 'built')).toBe(true);
    });

    it('deduplicates existing experiences when re-ingested', () => {
      const mockIngestion: IngestionResult = {
        sourceId: 'src-test-1',
        sourceType: 'resume_pdf',
        documentTitle: 'resume_v1.pdf',
        rawText: 'Experience',
        pageCount: 1,
        isImageOnlyOrScanned: false,
        ocrRequired: false,
        personalProfile: { fullName: 'Alex', email: 'alex@dev.io', phone: '', location: '', websites: [] },
        education: [],
        employment: [
          {
            id: 'emp-1',
            employer: 'TechCorp',
            role: 'Senior Software Engineer',
            startDate: '2020',
            endDate: '2023',
            durationMonths: 36,
            isCurrentRole: false,
            responsibilities: ['Built payments pipeline'],
            technologies: ['Java', 'Spring'],
            metrics: [],
            associatedProjectIds: [],
            rawText: '',
          },
        ],
        projects: [],
        skills: { languages: ['Java'], frameworks: ['Spring'], databases: [], messaging: [], cloud: [], devops: [], testing: [], architecture: [], aiMl: [], tools: [] },
        achievements: [],
        claims: [],
        chronologyAlerts: [],
        warnings: [],
        ingestedAt: Date.now(),
      };

      vaultService.populateFromIngestionResult(mockIngestion);
      expect(vaultService.getVault().experiences).toHaveLength(1);

      // Re-ingest with additional technology
      const mockIngestion2 = {
        ...mockIngestion,
        sourceId: 'src-test-2',
        employment: [
          {
            ...mockIngestion.employment[0],
            responsibilities: ['Built payments pipeline', 'Added Redis caching'],
            technologies: ['Java', 'Spring', 'Redis'],
          },
        ],
      };
      vaultService.populateFromIngestionResult(mockIngestion2);

      const experiences = vaultService.getVault().experiences;
      expect(experiences).toHaveLength(1);
      expect(experiences[0].technologies).toContain('Redis');
      expect(experiences[0].responsibilities).toContain('Added Redis caching');
    });

    it('populates vault from website crawl with WEBSITE_REPORTED evidence classification', () => {
      const mockPages: CrawledPage[] = [
        {
          url: 'https://abhishek-jade.vercel.app/',
          canonicalUrl: 'https://abhishek-jade.vercel.app/',
          title: 'Abhishek Singh | Systems Engineer Portfolio',
          description: 'Personal portfolio and projects',
          pageType: 'portfolio',
          classification: 'projects',
          textContent: 'Projects: Architected an AI-powered interview copilot with Electron and TypeScript.',
          outboundLinks: ['https://github.com/Abhitvg/IAC'],
          extractedClaims: [
            {
              claimId: 'claim-web-1',
              candidateId: 'cand-1',
              sourceId: 'src-web-1',
              sourceType: 'website_page',
              fieldName: 'project.mention',
              rawText: 'Architected an AI-powered interview copilot with Electron and TypeScript',
              normalizedValue: 'AI Interview Copilot',
              sourceLocation: { url: 'https://abhishek-jade.vercel.app/' },
              extractionMethod: 'deterministic_parse',
              extractionConfidence: 0.95,
              evidenceStatus: 'WEBSITE_REPORTED',
              reviewStatus: 'pending_review',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              parserVersion: '2.0.0',
            },
          ],
          contentHash: 'hash-abc-123',
          fetchedAt: Date.now(),
          byteSize: 1024,
        },
      ];

      vaultService.populateFromWebsitePages(mockPages, 'https://abhishek-jade.vercel.app/');
      const vault = vaultService.getVault();

      expect(vault.sources.some((s) => s.sourceType === 'website_page')).toBe(true);
      expect(vault.evidenceRecords.some((e) => e.classification === 'WEBSITE_REPORTED')).toBe(true);
      expect(vault.projects.some((p) => p.repoUrl === 'https://github.com/Abhitvg/IAC')).toBe(true);
    });

    it('allows candidate claim review actions (confirm, reject, edit)', () => {
      const claimId = 'claim-review-test';
      const mockIngestion: IngestionResult = {
        sourceId: 'src-review',
        sourceType: 'resume_pdf',
        documentTitle: 'resume.pdf',
        rawText: 'Built GraphQL gateway',
        pageCount: 1,
        isImageOnlyOrScanned: false,
        ocrRequired: false,
        personalProfile: { fullName: '', email: '', phone: '', location: '', websites: [] },
        education: [],
        employment: [],
        projects: [],
        skills: { languages: [], frameworks: [], databases: [], messaging: [], cloud: [], devops: [], testing: [], architecture: [], aiMl: [], tools: [] },
        achievements: [],
        claims: [
          {
            claimId,
            candidateId: 'cand-1',
            sourceId: 'src-review',
            sourceType: 'resume_pdf',
            fieldName: 'project.metric',
            rawText: 'Led 10 engineers',
            normalizedValue: 10,
            sourceLocation: {},
            extractionMethod: 'deterministic_parse',
            extractionConfidence: 0.9,
            evidenceStatus: 'RESUME_REPORTED',
            reviewStatus: 'pending_review',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            parserVersion: '2.0.0',
          },
        ],
        chronologyAlerts: [],
        warnings: [],
        ingestedAt: Date.now(),
      };

      vaultService.populateFromIngestionResult(mockIngestion);
      expect(vaultService.getVault().unreviewedClaims).toHaveLength(1);

      // Confirm claim
      vaultService.reviewClaim(claimId, 'confirm');
      expect(vaultService.getVault().unreviewedClaims).toHaveLength(0);
      expect(vaultService.getVault().evidenceRecords[0].classification).toBe('CANDIDATE_CONFIRMED');
    });
  });

  describe('Universal Question Understanding Engine', () => {
    it('classifies general technical questions as technical without requiring candidate vault', () => {
      const q1 = 'Explain the Java volatile keyword and how it relates to the happens-before relationship.';
      const res1 = QuestionUnderstandingEngine.analyze(q1);

      expect(res1.questionType).toBe('technical');
      expect(res1.category).toBe('Java and concurrency');
      expect(res1.requiresCandidateVault).toBe(false);
      expect(res1.suggestedStructure).toBe('Direct-Mechanism-Tradeoff');
      expect(res1.isCodeExpected).toBe(false);

      const q2 = 'How does Apache Kafka achieve high throughput with partition offsets and page cache?';
      const res2 = QuestionUnderstandingEngine.analyze(q2);

      expect(res2.questionType).toBe('technical');
      expect(res2.requiresCandidateVault).toBe(false);

      const q3 = 'Design a scalable URL shortener with 10,000 writes per second.';
      const res3 = QuestionUnderstandingEngine.analyze(q3);

      expect(res3.category).toBe('System design');
      expect(res3.requiresCandidateVault).toBe(false);
      expect(res3.suggestedStructure).toBe('Architecture-Components-Tradeoffs');
    });

    it('classifies candidate-specific questions as candidate_specific and requires vault', () => {
      const q = 'Walk me through your resume and describe your most challenging project.';
      const res = QuestionUnderstandingEngine.analyze(q);

      expect(res.questionType).toBe('candidate_specific');
      expect(res.requiresCandidateVault).toBe(true);

      const q2 = 'What did you build at Acme Cloud Corp?';
      const res2 = QuestionUnderstandingEngine.analyze(q2);

      expect(res2.questionType).toBe('candidate_specific');
      expect(res2.requiresCandidateVault).toBe(true);
      expect(res2.vaultRetrievalKeywords).toContain('Acme');
    });

    it('classifies mixed questions combining technical concept and candidate experience', () => {
      const q = 'How did you implement database sharding in your project, and what trade-offs did you consider?';
      const res = QuestionUnderstandingEngine.analyze(q);

      expect(res.questionType).toBe('mixed');
      expect(res.requiresCandidateVault).toBe(true);
      expect(res.vaultRetrievalKeywords).toContain('sharding');
    });

    it('classifies behavioral questions and assigns STAR structure', () => {
      const q = 'Tell me about a time when you had a serious technical disagreement with a team member.';
      const res = QuestionUnderstandingEngine.analyze(q);

      expect(res.questionType).toBe('behavioral');
      expect(res.category).toBe('Behavioral interviews');
      expect(res.suggestedStructure).toBe('STAR');
      expect(res.expectedDepth).toBe('deep');
    });

    it('classifies AI & Machine Learning questions accurately', () => {
      const q = 'How do you evaluate hallucination rates in RAG pipelines using quantitative benchmarks?';
      const res = QuestionUnderstandingEngine.analyze(q);

      expect(res.questionType).toBe('ai_ml');
      expect(res.category).toBe('AI and Machine Learning');
      expect(res.requiresCandidateVault).toBe(false);
    });

    it('classifies role alignment questions', () => {
      const q = 'Why do you want to join our company and work on this team?';
      const res = QuestionUnderstandingEngine.analyze(q);

      expect(res.questionType).toBe('role_alignment');
      expect(res.category).toBe('Career and role alignment');
      expect(res.requiresCandidateVault).toBe(true);
      expect(res.suggestedStructure).toBe('Role-Company-Value');
    });

    it('detects ambiguous queries requiring initial clarification', () => {
      const q = 'Kafka?';
      const res = QuestionUnderstandingEngine.analyze(q);

      expect(res.questionType).toBe('ambiguous');
      expect(res.suggestedStructure).toBe('Clarify-First');
      expect(res.requiresCandidateVault).toBe(false);
    });
  });
});

