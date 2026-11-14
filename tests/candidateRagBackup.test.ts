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
      expect(matched.some((t) => t.includes('Database Indexing'))).toBe(true);
    });

    it('generates augmented markdown context for system prompts', () => {
      const context = ragService.generateAugmentedContext('Sheetal Electrotech RFQ pricing', 2);
      expect(context).toContain('Verified Candidate Evidence & Grounded Context');
      expect(context).toContain('Sheetal Electrotech');
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
});
