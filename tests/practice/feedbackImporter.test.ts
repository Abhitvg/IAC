import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  FeedbackImporter,
  redactFeedbackText,
  validateEvidenceSubstring,
  computeFeedbackHash,
  heuristicExtract,
} from '../../src/services/practice/feedback/FeedbackImporter';
import { LLMManager } from '../../src/services/providers/LLMProvider';

function loadFixture(filename: string) {
  const filePath = path.join(__dirname, 'fixtures/feedback', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('FeedbackImporter - Phase 1 Acceptance Tests', () => {
  describe('Local Redaction & Security', () => {
    it('redacts email addresses, phone numbers, and URLs from raw text', () => {
      const input =
        'Please email recruiter Jane at jane.doe@techcorp.com or call +1-415-555-0149. Visit https://techcorp.com/jobs.';
      const redacted = redactFeedbackText(input);

      expect(redacted).not.toContain('jane.doe@techcorp.com');
      expect(redacted).not.toContain('+1-415-555-0149');
      expect(redacted).not.toContain('https://techcorp.com/jobs');
      expect(redacted).toContain('[REDACTED_EMAIL]');
      expect(redacted).toContain('[REDACTED_PHONE]');
      expect(redacted).toContain('[REDACTED_URL]');
    });

    it('redacts user-provided custom names while preserving surrounding text', () => {
      const input = 'Interviewer Bob Smith said candidate was strong in Go.';
      const redacted = redactFeedbackText(input, ['Bob Smith']);

      expect(redacted).not.toContain('Bob Smith');
      expect(redacted).toContain('[REDACTED_NAME]');
      expect(redacted).toContain('candidate was strong in Go');
    });

    it('throws error and halts if confirmed is false (refuses to transmit without explicit confirmation)', async () => {
      await expect(
        FeedbackImporter.importFeedback({
          rawText: 'Good skills but needs more structure.',
          confirmed: false,
        })
      ).rejects.toThrow(/FeedbackConfirmationRequiredError/);
    });
  });

  describe('Verbatim Substring Evidence Validation', () => {
    const sampleRedacted =
      'The candidate showed strong mastery of Go concurrency, but lacked concrete examples when discussing cache eviction policies.';

    it('accepts evidence that matches verbatim or with whitespace/case normalization', () => {
      const validQuote = 'Lacked concrete examples when discussing cache eviction policies';
      expect(validateEvidenceSubstring(validQuote, sampleRedacted)).toBe(true);
    });

    it('rejects fabricated or invented evidence not present in the text', () => {
      const fabricated = 'failed to explain B-tree indexing complexity';
      expect(validateEvidenceSubstring(fabricated, sampleRedacted)).toBe(false);
    });

    it('discards items with fabricated evidence during import', async () => {
      const mockLLM = {
        generateCompletion: vi.fn().mockResolvedValue(
          JSON.stringify({
            strengths: [
              {
                topic: 'Go Concurrency',
                skill: 'knowledge',
                evidence: 'strong mastery of Go concurrency', // Valid
              },
              {
                topic: 'Python',
                skill: 'knowledge',
                evidence: 'invented evidence about Python django', // Invalid / Fabricated
              },
            ],
            weaknesses: [
              {
                topic: 'Cache Eviction',
                skill: 'concreteness',
                severity: 2,
                evidence: 'lacked concrete examples when discussing cache eviction policies', // Valid
                requestedFix: 'Add real metrics',
              },
              {
                topic: 'Kubernetes',
                skill: 'depth',
                severity: 3,
                evidence: 'hallucinated quote about cluster pods', // Invalid / Fabricated
                requestedFix: 'Study k8s',
              },
            ],
            overallTone: 'Balanced',
            uncertainty: 'None',
          })
        ),
      } as unknown as LLMManager;

      const record = await FeedbackImporter.importFeedback({
        rawText: sampleRedacted,
        confirmed: true,
        llmManager: mockLLM,
      });

      // Only valid quotes should survive
      expect(record.strengths).toHaveLength(1);
      expect(record.strengths[0].topic).toBe('Go Concurrency');

      expect(record.weaknesses).toHaveLength(1);
      expect(record.weaknesses[0].topic).toBe('Cache Eviction');
    });
  });

  describe('Extraction against 3 Original Feedback Fixtures', () => {
    it('successfully extracts and structures backend systems feedback fixture', async () => {
      const fixture = loadFixture('fixture_backend.json');
      const mockLLM = {
        generateCompletion: vi.fn().mockResolvedValue(JSON.stringify(fixture.mockExtraction)),
      } as unknown as LLMManager;

      const record = await FeedbackImporter.importFeedback({
        rawText: fixture.rawText,
        confirmed: true,
        metadata: {
          company: fixture.company,
          role: fixture.role,
          date: fixture.date,
          roundType: fixture.roundType,
        },
        llmManager: mockLLM,
      });

      expect(record.company).toBe('Stripe-like Fintech Corp');
      expect(record.redactedText).not.toContain('john.doe@fintechcorp.io');
      expect(record.redactedText).not.toContain('+1-415-555-0199');
      expect(record.strengths.length).toBeGreaterThan(0);
      expect(record.weaknesses.length).toBe(2);
      expect(record.weaknesses.some((w) => w.skill === 'structure')).toBe(true);
      expect(record.weaknesses.some((w) => w.skill === 'concreteness')).toBe(true);
      expect(record.sourceHash).toBeTruthy();
    });

    it('successfully extracts frontend architecture feedback fixture', async () => {
      const fixture = loadFixture('fixture_frontend.json');
      const mockLLM = {
        generateCompletion: vi.fn().mockResolvedValue(JSON.stringify(fixture.mockExtraction)),
      } as unknown as LLMManager;

      const record = await FeedbackImporter.importFeedback({
        rawText: fixture.rawText,
        confirmed: true,
        metadata: {
          company: fixture.company,
          role: fixture.role,
        },
        llmManager: mockLLM,
      });

      expect(record.redactedText).not.toContain('sarah.c@ecomvelocity.com');
      expect(record.weaknesses.some((w) => w.topic.includes('Web Vitals'))).toBe(true);
      expect(record.isEstimated).toBe(false);
    });

    it('successfully extracts system design feedback fixture', async () => {
      const fixture = loadFixture('fixture_system_design.json');
      const mockLLM = {
        generateCompletion: vi.fn().mockResolvedValue(JSON.stringify(fixture.mockExtraction)),
      } as unknown as LLMManager;

      const record = await FeedbackImporter.importFeedback({
        rawText: fixture.rawText,
        confirmed: true,
        metadata: {
          company: fixture.company,
        },
        llmManager: mockLLM,
      });

      expect(record.redactedText).not.toContain('alex.v@cloudscale.net');
      expect(record.weaknesses.some((w) => w.skill === 'concreteness')).toBe(true);
      expect(record.weaknesses.some((w) => w.skill === 'depth')).toBe(true);
    });
  });

  describe('Deduplication by Source Hash', () => {
    it('produces identical source hashes for identical text regardless of outer whitespace', () => {
      const text1 = 'Candidate gave strong answers in Python but missed time complexity.';
      const text2 = '  Candidate gave strong answers in Python but missed time complexity.   ';
      expect(computeFeedbackHash(text1)).toBe(computeFeedbackHash(text2));
    });

    it('produces different hashes for distinct feedback contents', () => {
      const text1 = 'Candidate excelled at CSS grid.';
      const text2 = 'Candidate excelled at Docker orchestration.';
      expect(computeFeedbackHash(text1)).not.toBe(computeFeedbackHash(text2));
    });
  });

  describe('Heuristic Fallback Extractor', () => {
    it('splits sentences into strengths and weaknesses with estimated label when LLM is unavailable', () => {
      const text =
        'The candidate was very strong in algorithm complexity. However, they lacked concrete examples on database scaling and rambled when discussing caches.';
      const result = heuristicExtract(text);

      expect(result.isEstimated).toBe(true);
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.weaknesses.length).toBeGreaterThan(0);
      expect(result.uncertainty).toContain('Heuristic estimate');
    });

    it('retries once on invalid JSON from LLM and falls back to heuristic if retry also fails', async () => {
      const mockLLM = {
        generateCompletion: vi
          .fn()
          .mockResolvedValueOnce('Invalid non-json output!')
          .mockResolvedValueOnce('Still broken non-json!'),
      } as unknown as LLMManager;

      const text =
        'Candidate had good database knowledge but struggled with system design tradeoffs.';
      const record = await FeedbackImporter.importFeedback({
        rawText: text,
        confirmed: true,
        llmManager: mockLLM,
      });

      expect(record.isEstimated).toBe(true);
      expect(record.weaknesses.length).toBeGreaterThan(0);
      expect(mockLLM.generateCompletion).toHaveBeenCalledTimes(2);
    });
  });
});
