import { describe, it, expect } from 'vitest';
import { InterviewerService } from '../src/services/practice/InterviewerService';
import {
  buildInterviewerPrompt,
  InterviewerResponseSchema,
} from '../src/services/practice/prompts/interviewer';
import { CurriculumCatalogService } from '../src/data/curriculum/CurriculumCatalog';

describe('Phase 3 — Intelligent AI Interviewer Engine', () => {
  const candidateAnswer =
    'I would implement the cache with a hash map for O(1) lookups and a doubly linked list to track the eviction order.';

  describe('1. Explicit Interview Actions Schema', () => {
    it('parses all 6 valid interviewer actions (ask, probe, challenge, clarify, move_on, wrap_up)', () => {
      const actions = ['ask', 'probe', 'challenge', 'clarify', 'move_on', 'wrap_up'];
      for (const act of actions) {
        const parsed = InterviewerResponseSchema.safeParse({
          action: act.toUpperCase(), // Test case insensitivity
          spoken: `Interviewer speech for ${act}`,
          reason: `Reason for ${act}`,
          evidence: act === 'probe' ? 'doubly linked list' : '',
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.data.action).toBe(act);
        }
      }
    });

    it('rejects unsupported actions outside the schema', () => {
      const parsed = InterviewerResponseSchema.safeParse({
        action: 'lecture_candidate',
        spoken: 'Let me explain the answer to you.',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('2. Conditional Evidence Validation', () => {
    it('accepts ASK action without candidate evidence', async () => {
      const mockCaller = async () =>
        JSON.stringify({
          action: 'ask',
          spoken: 'How would you handle concurrent reads and writes to this LRU cache?',
          reason: 'Introduce concurrency topic.',
          evidence: '',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: { id: 'q1', prompt: 'Design an LRU cache.' },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
        },
        mockCaller
      );

      expect(turn.action).toBe('ask');
      expect(turn.spoken).toContain('concurrent reads and writes');
      expect(turn.evidence).toBe('');
      expect(turn.isOffline).toBe(false);
    });

    it('accepts CHALLENGE action when evidence is a verbatim substring of candidate answer', async () => {
      const mockCaller = async () =>
        JSON.stringify({
          action: 'challenge',
          spoken:
            'You said a doubly linked list tracks eviction order. What happens if a node update race condition occurs?',
          reason: 'Challenge synchronization invariant.',
          evidence: 'doubly linked list to track the eviction order',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: { id: 'q1', prompt: 'Design an LRU cache.' },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
        },
        mockCaller
      );

      expect(turn.action).toBe('challenge');
      expect(turn.evidence).toBe('doubly linked list to track the eviction order');
      expect(turn.isOffline).toBe(false);
    });

    it('drops CHALLENGE action and advances when cited evidence is fabricated / not spoken', async () => {
      const mockCaller = async () =>
        JSON.stringify({
          action: 'challenge',
          spoken: 'You claimed you can use a bloom filter for exact deletion. Why?',
          reason: 'Challenge bloom filter claim.',
          evidence: 'bloom filter for exact deletion', // Hallucination: candidate never said this!
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: { id: 'q1', prompt: 'Design an LRU cache.' },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
        },
        mockCaller
      );

      expect(turn.action).toBe('move_on');
      expect(turn.spoken).toContain("Let's move on to the next question");
      expect(turn.reason).toContain('Challenge dropped: cited evidence was not a verifiable substring');
    });

    it('accepts CLARIFY action with verbatim evidence and drops when fabricated', async () => {
      const mockValidClarify = async () =>
        JSON.stringify({
          action: 'clarify',
          spoken: 'When you say "O(1) lookups", are you referring to worst case or average case?',
          reason: 'Clarify Big-O invariant.',
          evidence: 'O(1) lookups',
        });

      const turnValid = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: { id: 'q1', prompt: 'Design an LRU cache.' },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
        },
        mockValidClarify
      );

      expect(turnValid.action).toBe('clarify');
      expect(turnValid.evidence).toBe('O(1) lookups');

      // Now with invalid evidence
      const mockInvalidClarify = async () =>
        JSON.stringify({
          action: 'clarify',
          spoken: 'Clarify what you mean by skip list.',
          reason: 'Clarify skip list.',
          evidence: 'skip list',
        });

      const turnInvalid = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'rigorous',
          interview_type: 'coding',
          question_json: { id: 'q1', prompt: 'Design an LRU cache.' },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
        },
        mockInvalidClarify
      );

      expect(turnInvalid.action).toBe('move_on');
      expect(turnInvalid.reason).toContain('Clarify dropped');
    });

    it('accepts MOVE_ON and WRAP_UP without mandatory candidate evidence', async () => {
      const mockMoveOn = async () =>
        JSON.stringify({
          action: 'move_on',
          spoken: 'Great explanation. Let us move to the next topic.',
          reason: 'Satisfactory answer.',
          evidence: '',
        });

      const turn = await InterviewerService.generateTurn(
        {
          persona_name: 'Alex',
          persona_style: 'friendly',
          interview_type: 'coding',
          question_json: { id: 'q1', prompt: 'Design an LRU cache.' },
          rolling_transcript: `Candidate: ${candidateAnswer}`,
          lastAnswer: candidateAnswer,
        },
        mockMoveOn
      );

      expect(turn.action).toBe('move_on');
      expect(turn.isOffline).toBe(false);
    });
  });

  describe('3. Curriculum Grounding Injections', () => {
    it('injects curriculum baseline and misconceptions into prompt when curriculumTopicId is supplied', () => {
      const prompt = buildInterviewerPrompt({
        persona_name: 'Jordan',
        persona_style: 'rigorous',
        interview_type: 'coding',
        question_json: {
          id: 'q_hash',
          prompt: 'Explain collision resolution.',
          curriculumTopicId: 'ds_hash_tables',
        },
        rolling_transcript: 'Interview started.',
        curriculumTopicId: 'ds_hash_tables',
      });

      expect(prompt).toContain('TECHNICAL CURRICULUM BASELINE FOR CURRENT TOPIC:');
      expect(prompt).toContain('Hash Tables');
      expect(prompt).toContain('Common Candidate Misconceptions:');
      expect(prompt).toContain('probe incomplete explanations, and challenge common candidate misconceptions');
    });

    it('curriculum offline fallback challenges candidate answer matching catalog misconceptions', () => {
      // Candidate answer demonstrating string immutability misconception from ds_arrays_strings
      const faultyAnswer =
        'In my loop I just do repeated string concatenation with the plus operator because string concatenation in loops is O(N).';

      const turn = InterviewerService.generateOfflineFallback({
        lastAnswer: faultyAnswer,
        question_json: { prompt: 'Process string logs', curriculumTopicId: 'ds_arrays_strings' },
        interview_type: 'coding',
        curriculumTopicId: 'ds_arrays_strings',
      });

      expect(turn.action).toBe('challenge');
      expect(turn.reason).toContain('Curriculum-grounded challenge on common misconception');
      expect(turn.isOffline).toBe(true);
    });
  });
});
