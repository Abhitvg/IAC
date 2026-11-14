import { describe, it, expect, beforeEach } from 'vitest';
import { CandidateRagService } from '../src/services/rag/candidateRagService';
import { INITIAL_CANDIDATE_RAG_ENTRIES } from '../src/services/rag/candidateRagData';

describe('Candidate RAG & Backup Service Suite', () => {
  let ragService: CandidateRagService;

  beforeEach(() => {
    // Clear localStorage mocks before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    ragService = CandidateRagService.getInstance();
    ragService.seedInitialKnowledge();
  });

  describe('Grounded Knowledge Ingestion', () => {
    it('populates all expected candidate information upon initialization', () => {
      const chunks = ragService.getAllChunks();
      expect(chunks.length).toBeGreaterThanOrEqual(INITIAL_CANDIDATE_RAG_ENTRIES.length);

      const titles = chunks.map((c) => c.title);
      expect(chunks.some((c) => c.content.includes('Abhishek Singh'))).toBe(true);
      expect(titles.some((t) => t.includes('Sheetal Electrotech'))).toBe(true);
      expect(titles.some((t) => t.includes('UKCOP / DoonSilk'))).toBe(true);
      expect(titles.some((t) => t.includes('Bakraw'))).toBe(true);
      expect(titles.some((t) => t.includes('Porcupine'))).toBe(true);
      expect(titles.some((t) => t.includes('NCERT Virasat'))).toBe(true);
      expect(titles.some((t) => t.includes('Jawaharlal Nehru University'))).toBe(true);
      expect(titles.some((t) => t.includes('GATE 2024'))).toBe(true);
    });

    it('organizes chunks into valid documents with categories', () => {
      const docs = ragService.getAllDocuments();
      expect(docs.length).toBeGreaterThan(0);
      const categories = docs.map((d) => d.category);
      expect(categories).toContain('profile');
      expect(categories).toContain('project');
      expect(categories).toContain('competency');
      expect(categories).toContain('star_story');
      expect(categories).toContain('interview_qa');
    });
  });

  describe('Hybrid Semantic & Lexical Retrieval (RAG)', () => {
    it('retrieves relevant project chunks for "Sheetal Electrotech catalog"', () => {
      const results = ragService.retrieve('Sheetal Electrotech catalog and RFQ quoting', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('Sheetal Electrotech');
      expect(results[0].score).toBeGreaterThan(0.3);
      expect(results.some((r) => r.chunk.content.includes('Sheetal Electrotech'))).toBe(true);
    });

    it('retrieves concurrency and task queue evidence for "Porcupine background jobs"', () => {
      const results = ragService.retrieve('Porcupine background worker thread pool queue', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      const matchedTitles = results.map((r) => r.chunk.title);
      expect(matchedTitles.some((t) => t.includes('Porcupine'))).toBe(true);
      expect(results.some((r) => r.chunk.content.includes('Porcupine'))).toBe(true);
    });

    it('retrieves git branching standards for "branching strategy commit"', () => {
      const results = ragService.retrieve('branching strategy commit trunk based development', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('Branching');
      expect(results[0].chunk.content).toContain('Trunk-Based Development');
    });

    it('retrieves database indexing rules for "composite index B-Tree selectivity"', () => {
      const results = ragService.retrieve('composite index B-Tree selectivity EXPLAIN ANALYZE', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      const matched = results.map((r) => r.chunk.title);
      expect(matched.some((t) => t.includes('Database') || t.includes('B-Tree'))).toBe(true);
    });

    it('retrieves CS fundamentals for "process vs thread IPC shared memory"', () => {
      const results = ragService.retrieve('process vs thread context switch IPC shared memory', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('Process vs Thread');
      expect(results[0].chunk.category).toBe('cs_fundamentals');
      expect(results[0].chunk.content).toContain('Inter-Process Communication');
    });

    it('retrieves Web Development standards for "JavaScript event loop microtasks"', () => {
      const results = ragService.retrieve('JavaScript event loop call stack microtask macrotask libuv', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('Event Loop');
      expect(results[0].chunk.category).toBe('web_development');
      expect(results[0].chunk.content).toContain('Promise');
    });

    it('retrieves React & Frontend architecture for "React Server Components vs Client Components"', () => {
      const results = ragService.retrieve('React Server Components RSC use client Next.js streaming', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('React Server Components');
      expect(results[0].chunk.category).toBe('web_development');
    });

    it('retrieves Software Engineering principles for "SOLID single responsibility dependency inversion"', () => {
      const results = ragService.retrieve('SOLID principles single responsibility dependency inversion', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('SOLID Principles');
      expect(results[0].chunk.category).toBe('software_engineering');
    });

    it('retrieves Database internals for "ACID transaction isolation levels dirty read MVCC"', () => {
      const results = ragService.retrieve('database ACID isolation levels dirty reads non-repeatable read MVCC', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('ACID Guarantees & Transaction Isolation');
      expect(results[0].chunk.category).toBe('backend_database');
    });

    it('retrieves System Design principles for "CAP theorem PACELC distributed systems"', () => {
      const results = ragService.retrieve('CAP theorem PACELC consistency availability partition tolerance', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('CAP Theorem');
      expect(results[0].chunk.category).toBe('system_design');
    });

    it('retrieves Security standards for "OAuth 2.0 PKCE JWT token rotation"', () => {
      const results = ragService.retrieve('OAuth 2.0 PKCE JWT token rotation authorization code', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('OAuth 2.0');
      expect(results[0].chunk.category).toBe('security_devops');
    });

    it('retrieves Git branching & commit strategies for "branching and commit strategy"', () => {
      const results = ragService.retrieve('branching and commit strategy trunk-based development PR squash rebase', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('Branching Strategy');
      expect(results[0].chunk.category).toBe('software_engineering');
      expect(results[0].chunk.content).toContain('Trunk-Based Development');
    });

    it('retrieves Java & JVM architecture for "Java JVM garbage collection ZGC virtual threads"', () => {
      const results = ragService.retrieve('Java JVM garbage collection G1GC ZGC virtual threads Loom memory', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toMatch(/Java|JVM/i);
      expect(results[0].chunk.category).toBe('backend_database');
      expect(results[0].chunk.content).toContain('JVM');
    });

    it('retrieves Spring Boot & Hibernate standards for "Spring Boot IoC Hibernate N+1 query"', () => {
      const results = ragService.retrieve('Spring Boot IoC dependency injection Hibernate JPA N+1 problem', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toMatch(/Spring/i);
      expect(results[0].chunk.category).toBe('backend_database');
    });

    it('retrieves Docker & Kubernetes architecture for "Docker multi-stage Kubernetes control plane"', () => {
      const results = ragService.retrieve('Docker containers multi-stage Kubernetes control plane pods', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toMatch(/Docker|Kubernetes/i);
      expect(results[0].chunk.category).toBe('security_devops');
    });

    it('retrieves React 19 architecture for "React 19 Server Actions useActionState useOptimistic"', () => {
      const results = ragService.retrieve('React 19 Server Actions useActionState useOptimistic Fiber', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toMatch(/React 19/i);
      expect(results[0].chunk.category).toBe('web_development');
    });

    it('retrieves Python & FastAPI architecture for "Python CPython GIL FastAPI ASGI Pydantic"', () => {
      const results = ragService.retrieve('Python CPython GIL FastAPI ASGI Pydantic asyncio', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toContain('Python Architecture');
      expect(results[0].chunk.category).toBe('backend_database');
    });

    it('retrieves Kafka & Redis architecture for "Apache Kafka zero-copy Redis cluster"', () => {
      const results = ragService.retrieve('Apache Kafka event streaming zero-copy commit log Redis cluster', {
        topK: 3,
        minScore: 0.1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].chunk.title).toMatch(/Kafka|Redis/i);
      expect(results[0].chunk.category).toBe('backend_database');
    });

    it('generates augmented markdown context for candidate questions', () => {
      const context = ragService.generateAugmentedContext('Sheetal Electrotech RFQ pricing', 2);
      expect(context).toContain('Verified Candidate Evidence & Grounded Context');
      expect(context).toContain('Sheetal Electrotech');
      expect(context).toContain('Relevance:');
    });

    it('generates augmented markdown context for purely technical CS/Web questions', () => {
      const context = ragService.generateAugmentedContext('How does the Node.js event loop handle microtasks vs macrotasks?', 2);
      expect(context).toContain('Technical Engineering Knowledge & CS Standards');
      expect(context).toContain('Event Loop');
      expect(context).toContain('Relevance:');
    });
  });

  describe('Backup & Restore Operations', () => {
    it('creates a complete backup snapshot with checksum and metadata', () => {
      const snapshot = ragService.createBackup('Test Automation Snapshot');
      expect(snapshot.id).toMatch(/^backup-\d+-[a-f0-9]+$/);
      expect(snapshot.label).toBe('Test Automation Snapshot');
      expect(snapshot.totalChunks).toBe(ragService.getChunkCount());
      expect(snapshot.checksum).toHaveLength(8);
      expect(snapshot.chunks.length).toBe(ragService.getChunkCount());
    });

    it('lists all available backup manifests', () => {
      ragService.createBackup('Snapshot 1');
      ragService.createBackup('Snapshot 2');

      const backups = ragService.listBackups();
      expect(backups.length).toBeGreaterThanOrEqual(2);
      expect(backups[0].label).toBe('Snapshot 2');
      expect(backups[0].sizeBytes).toBeGreaterThan(100);
    });

    it('restores knowledge accurately from an existing snapshot', () => {
      const originalCount = ragService.getChunkCount();
      const snapshot = ragService.createBackup('Pre-Deletion Snapshot');

      // Add a custom chunk
      ragService.addChunk({
        category: 'project',
        title: 'Temporary Test Project',
        content: 'This will be cleared on restore.',
        keywords: ['Temporary', 'Test'],
      });
      expect(ragService.getChunkCount()).toBe(originalCount + 1);

      // Restore to previous snapshot
      const restored = ragService.restoreBackup(snapshot.id);
      expect(restored).toBe(true);
      expect(ragService.getChunkCount()).toBe(originalCount);
      expect(ragService.getAllChunks().some((c) => c.title === 'Temporary Test Project')).toBe(false);
    });

    it('exports and imports backup JSON bundles cleanly', () => {
      const exportedJson = ragService.exportBackupJson();
      expect(exportedJson).toContain('"totalChunks"');
      expect(exportedJson).toContain('"checksum"');

      // Mutate state
      ragService.addChunk({
        category: 'competency',
        title: 'Unique Imported Competency',
        content: 'Verified testing data.',
        keywords: ['Imported', 'Test'],
      });

      // Import exported JSON
      const imported = ragService.importBackupJson(exportedJson);
      expect(imported).toBe(true);
      expect(ragService.getAllChunks().some((c) => c.title === 'Unique Imported Competency')).toBe(false);
    });

    it('deletes backup snapshots cleanly', () => {
      const snapshot = ragService.createBackup('Snapshot to Delete');
      const countBefore = ragService.listBackups().length;

      const deleted = ragService.deleteBackup(snapshot.id);
      expect(deleted).toBe(true);
      expect(ragService.listBackups().length).toBe(countBefore - 1);
    });
  });

  describe('Autonomous Zero-Stall Emergency Answer Synthesis', () => {
    it('synthesizes an immediate high-quality response for branching and commit strategy questions', () => {
      const answer = ragService.synthesizeEmergencyAnswer(
        'Thank you for explaining your branching and commit strategy. Moving forward, when you deploy to production how do you handle merges?'
      );
      expect(answer.length).toBeGreaterThan(50);
      expect(answer).toMatch(/Trunk-Based Development|Conventional Commits|feature branch|squash/i);
    });

    it('synthesizes an immediate high-quality response for Java and Virtual Threads', () => {
      const answer = ragService.synthesizeEmergencyAnswer(
        'How do Java 21 Project Loom virtual threads improve concurrency over OS platform threads?'
      );
      expect(answer.length).toBeGreaterThan(50);
      expect(answer).toMatch(/Virtual Threads|Loom|carrier|JVM|concurrency/i);
    });

    it('synthesizes an immediate high-quality response for Docker and Kubernetes', () => {
      const answer = ragService.synthesizeEmergencyAnswer(
        'What are the key best practices for Docker multi-stage builds and Kubernetes pod scheduling?'
      );
      expect(answer.length).toBeGreaterThan(50);
      expect(answer).toMatch(/Multi-Stage|Docker|Kubernetes|Pods|cgroups/i);
    });

    it('synthesizes an immediate high-quality response for technical questions', () => {
      const answer = ragService.synthesizeEmergencyAnswer('Explain the JavaScript event loop and microtask queue');
      expect(answer.length).toBeGreaterThan(50);
      expect(answer).toMatch(/event loop|microtask|single-threaded|libuv|Promise/i);
    });

    it('synthesizes grounded response for candidate project questions', () => {
      const answer = ragService.synthesizeEmergencyAnswer('Tell me about your work on Sheetal Electrotech');
      expect(answer.length).toBeGreaterThan(50);
      expect(answer).toContain('Sheetal Electrotech');
    });

    it('synthesizes resilient general engineering answer when question is blank or novel', () => {
      const blankAnswer = ragService.synthesizeEmergencyAnswer('');
      expect(blankAnswer.length).toBeGreaterThan(30);

      const novelAnswer = ragService.synthesizeEmergencyAnswer('How would you design a distributed hypergraph ledger?');
      expect(novelAnswer.length).toBeGreaterThan(30);
    });
  });
});
