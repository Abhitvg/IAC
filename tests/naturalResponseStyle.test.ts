import { describe, it, expect, vi } from 'vitest';
import {
  classifyQuestionIntent,
  LENGTH_TARGETS,
  buildConversationalPromptSection,
  QuestionIntent,
} from '../src/services/responseStyle';
import {
  buildCandidateSystemPrompt,
  DEFAULT_RESUME,
  DEFAULT_JOB_DESCRIPTION,
} from '../src/services/candidatePersona';
import { classifyQuestion, createSystemPrompt } from '../src/services/ai';
import { buildScreenSolverPrompt } from '../src/services/screenSolver';
import { AIStreamParser } from '../src/services/AIStreamParser';
import { SentenceBuffer } from '../src/services/SentenceBuffer';

describe('Deterministic Question Intent Classification', () => {
  it('correctly classifies conceptual questions as definition, conceptual, or comparison', () => {
    expect(classifyQuestionIntent('What is AWS?', 'interview')).toBe('definition');
    expect(classifyQuestionIntent('What is a race condition?', 'interview')).toBe('definition');
    expect(
      classifyQuestionIntent('What is the difference between EC2 and Lambda?', 'interview')
    ).toBe('comparison');
    expect(classifyQuestionIntent('Explain database normalization.', 'interview')).toBe(
      'conceptual'
    );
    expect(
      classifyQuestionIntent('What is the time complexity of binary search?', 'interview')
    ).toBe('definition');
  });

  it('correctly classifies system design questions', () => {
    expect(classifyQuestionIntent('How would you design a URL shortener?', 'interview')).toBe(
      'system_design'
    );
    expect(
      classifyQuestionIntent('Design a distributed key-value store scaled to 10M users', 'interview')
    ).toBe('system_design');
  });

  it('correctly classifies behavioral and resume questions', () => {
    expect(classifyQuestionIntent('Tell me about a challenging project.', 'interview')).toBe(
      'behavioral'
    );
    expect(
      classifyQuestionIntent('Give me an example of a time you handled a production outage', 'interview')
    ).toBe('behavioral');
    expect(classifyQuestionIntent('Walk me through your resume.', 'interview')).toBe('resume');
  });

  it('correctly classifies multiple choice questions as quiz', () => {
    const mcq1 = 'Which HTTP status code represents Temporary Redirect?\nA) 301\nB) 302\nC) 404\nD) 500';
    expect(classifyQuestionIntent(mcq1, 'interview')).toBe('quiz');
    expect(classifyQuestionIntent('Which of the following is true regarding ACID transactions?', 'interview')).toBe(
      'quiz'
    );
    expect(classifyQuestionIntent('Any question in quiz mode', 'quiz')).toBe('quiz');
  });

  it('correctly classifies coding tasks versus conceptual questions in coding mode', () => {
    // Conceptual question in interview mode must NOT become coding task
    expect(classifyQuestionIntent('What is an array?', 'interview')).toBe('definition');
    expect(classifyQuestionIntent('What is binary search?', 'interview')).toBe('definition');

    // Explicit code requests become coding
    expect(classifyQuestionIntent('Write a function to reverse a linked list', 'interview')).toBe(
      'coding'
    );
    expect(classifyQuestionIntent('Given an array nums, find the two sum target', 'coding')).toBe(
      'coding'
    );

    // Complexity question in coding mode remains definition
    expect(
      classifyQuestionIntent('What is the time complexity of binary search?', 'coding')
    ).toBe('definition');
  });

  it('correctly classifies contextual follow-up questions when prior context exists', () => {
    expect(classifyQuestionIntent('Why?', 'interview', true)).toBe('follow_up');
    expect(classifyQuestionIntent('How so?', 'interview', true)).toBe('follow_up');
    expect(
      classifyQuestionIntent('What about when memory is constrained?', 'interview', true)
    ).toBe('follow_up');
  });
});

describe('Mode-Aware Word Count and Token Targets', () => {
  it('enforces mode-aware length targets matching specified guidelines', () => {
    expect(LENGTH_TARGETS.definition.minWords).toBe(30);
    expect(LENGTH_TARGETS.definition.maxWords).toBe(50);

    expect(LENGTH_TARGETS.conceptual.minWords).toBe(50);
    expect(LENGTH_TARGETS.conceptual.maxWords).toBe(90);

    expect(LENGTH_TARGETS.comparison.minWords).toBe(60);
    expect(LENGTH_TARGETS.comparison.maxWords).toBe(100);

    expect(LENGTH_TARGETS.system_design.minWords).toBe(100);
    expect(LENGTH_TARGETS.system_design.maxWords).toBe(180);

    expect(LENGTH_TARGETS.behavioral.minWords).toBe(80);
    expect(LENGTH_TARGETS.behavioral.maxWords).toBe(140);

    expect(LENGTH_TARGETS.follow_up.minWords).toBe(30);
    expect(LENGTH_TARGETS.follow_up.maxWords).toBe(70);

    expect(LENGTH_TARGETS.quiz.minWords).toBe(30);
    expect(LENGTH_TARGETS.quiz.maxWords).toBe(60);
  });
});

describe('Conversational Response Style Prompt Construction', () => {
  const verifiedResume = `Abhishek Singh
Senior Software Developer
Projects: DocFlow (real-time collaborative editor using WebSockets and CRDTs), Quorum (distributed event streaming platform).
Skills: Java, TypeScript, Spring Boot, React, Kafka, Docker, AWS.`;

  it('1. "What is AWS?" receives conversational prompt without rigid frameworks or Electron bloat', () => {
    const q = 'What is AWS?';
    const classification = classifyQuestion(q);
    const intent = classifyQuestionIntent(q, 'interview');

    expect(classification.category).toBe('AWS');
    expect(intent).toBe('definition');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Senior Cloud Engineer',
      'Java',
      'interview',
      [],
      classification.category,
      intent,
      q
    );

    // Mandates conversational spoken style
    expect(prompt).toContain('CONVERSATIONAL SPOKEN INTERVIEW RESPONSE STYLE');
    expect(prompt).toContain('ANSWER DIRECTLY IN SENTENCE 1');
    expect(prompt).toContain('NATURAL SPOKEN ENGLISH');
    expect(prompt).toContain('ONE PRACTICAL REAL-WORLD EXAMPLE');
    expect(prompt).toContain('30–50 words');

    // Strictly forbids textbook laundry lists, emojis, corporate filler
    expect(prompt).toContain('NO textbook-style bullet lists');
    expect(prompt).toContain('NO corporate buzzwords');
    expect(prompt).toContain('NO cliché AI filler');
    expect(prompt).toContain('NO FABRICATION');

    // Verifies positive benchmark example is included for clarity
    expect(prompt).toContain('AWS is Amazon\'s cloud platform');

    // Verifies rigid 3-beat phase 1/2/3 framework and Electron bloat are NOT injected
    expect(prompt).not.toContain('Phase 1 (Ingestion & Initialization)');
    expect(prompt).not.toContain('Phase 2 (Execution & In-Flight Processing)');
    expect(prompt).not.toContain('ELECTRON & DESKTOP RUNTIME MASTERY');
  });

  it('2. "What is the difference between EC2 and Lambda?" receives comparison prompt with trade-offs', () => {
    const q = 'What is the difference between EC2 and Lambda?';
    const classification = classifyQuestion(q);
    const intent = classifyQuestionIntent(q, 'interview');

    expect(intent).toBe('comparison');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Backend Engineer',
      'Java',
      'interview',
      [],
      classification.category,
      intent,
      q
    );

    expect(prompt).toContain('60–100 words');
    expect(prompt).toContain('The trade-off is');
    expect(prompt).not.toContain('Phase 1 (Ingestion & Initialization)');
  });

  it('3. "Explain database normalization." receives conceptual prompt with practical example', () => {
    const q = 'Explain database normalization.';
    const classification = classifyQuestion(q);
    const intent = classifyQuestionIntent(q, 'interview');

    expect(classification.category).toBe('DBMS');
    expect(intent).toBe('conceptual');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Database Engineer',
      'Java',
      'interview',
      [],
      classification.category,
      intent,
      q
    );

    expect(prompt).toContain('50–90 words');
    expect(prompt).toContain('ONE PRACTICAL REAL-WORLD EXAMPLE');
    expect(prompt).not.toContain('Phase 1 (Ingestion & Initialization)');
  });

  it('4. "What is a race condition?" receives crisp definition prompt', () => {
    const q = 'What is a race condition?';
    const classification = classifyQuestion(q);
    const intent = classifyQuestionIntent(q, 'interview');

    expect(classification.category).toBe('Operating Systems');
    expect(intent).toBe('definition');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Systems Engineer',
      'Java',
      'interview',
      [],
      classification.category,
      intent,
      q
    );

    expect(prompt).toContain('30–50 words');
    expect(prompt).toContain('ANSWER DIRECTLY IN SENTENCE 1');
  });

  it('5. "How would you design a URL shortener?" receives system design framework', () => {
    const q = 'How would you design a URL shortener?';
    const classification = classifyQuestion(q);
    const intent = classifyQuestionIntent(q, 'interview');

    expect(intent).toBe('system_design');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Staff Architect',
      'Java',
      'interview',
      [],
      classification.category,
      intent,
      q
    );

    expect(prompt).toContain('SYSTEM DESIGN ARCHITECTURE FRAMEWORK');
    expect(prompt).toContain('High-Level Architecture');
    expect(prompt).toContain('Key Bottlenecks & Trade-Offs');
    expect(prompt).toContain('100–180 words');
  });

  it('6. "Tell me about a challenging project." enforces MIT CAPD STAR without fabricating experience', () => {
    const q = 'Tell me about a challenging project.';
    const classification = classifyQuestion(q);
    const intent = classifyQuestionIntent(q, 'interview');

    expect(intent).toBe('behavioral');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Senior Developer',
      'Java',
      'interview',
      [],
      classification.category,
      intent,
      q
    );

    expect(prompt).toContain('MIT CAPD STAR METHOD FOR BEHAVIORAL QUESTIONS');
    expect(prompt).toContain('Never invent companies or roles');
    expect(prompt).toContain('Never fabricate metrics');
    expect(prompt).toContain('80–140 words');
  });

  it('7. "What is the time complexity of binary search?" produces crisp verbal definition in interview mode', () => {
    const q = 'What is the time complexity of binary search?';
    const intent = classifyQuestionIntent(q, 'interview');

    expect(intent).toBe('definition');

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Software Developer',
      'Java',
      'interview',
      [],
      'DSA',
      intent,
      q
    );

    expect(prompt).toContain('30–50 words');
    // In interview mode, simple time complexity question does NOT dump a 4-phase LeetCode framework
    expect(prompt).not.toContain('CODING & ALGORITHM IMPLEMENTATION FRAMEWORK');
  });

  it('8. Multiple choice question in quiz mode produces high-contrast correct answer prompt', () => {
    const q = 'Which HTTP status code represents Temporary Redirect?\nA) 301\nB) 302\nC) 404\nD) 500';
    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Backend Engineer',
      'Java',
      'quiz',
      [],
      'Computer Networks',
      'quiz',
      q
    );

    expect(prompt).toContain('ACTIVE MODE: QUIZ & MULTIPLE CHOICE ASSESSMENT (MCQ)');
    expect(prompt).toContain('✅ CORRECT ANSWER:');
    expect(prompt).toContain('Option [A / B / C / D]:');
    expect(prompt).toContain('💡 DIRECT PROOF & REASONING:');
    expect(prompt).toContain('❌ WHY OTHER OPTIONS ARE INCORRECT:');
  });

  it('9. Screen-captured coding problem retains complete runnable code and concise verbal walkthrough', () => {
    const ocr = `33. Search in Rotated Sorted Array
Given a sorted array of distinct integers nums and an integer target, return the index of target.
1 <= nums.length <= 10^5`;

    const prompt = buildScreenSolverPrompt(ocr, 'Java', 'Staff Engineer', 'coding');

    expect(prompt).toContain('ACTIVE MODE: ZERO-FAIL CODING CHALLENGE (Java)');
    expect(prompt).toContain('FORMAT 1: ULTRA-MINIMAL TYPEABLE SOLUTION');
    expect(prompt).toContain('FORMAT 2: COMPLETE ONLINE JUDGE CLASS');
    expect(prompt).toContain('class Solution');
    expect(prompt).toContain('SPOKEN CANDIDATE SCRIPT');
    expect(prompt).toContain('60-80 word');
  });

  it('10. Follow-up question references prior context without duplicating previous definitions', () => {
    const history = [
      {
        question: 'What is database normalization?',
        answer: 'Database normalization is the process of organizing relational tables to reduce redundancy and improve data integrity.',
        category: 'DBMS',
      },
    ];

    const followUpQ = 'Can you elaborate on third normal form?';
    const intent = classifyQuestionIntent(followUpQ, 'interview', true);

    const prompt = buildCandidateSystemPrompt(
      verifiedResume,
      DEFAULT_JOB_DESCRIPTION,
      'Backend Developer',
      'Java',
      'interview',
      history,
      'DBMS',
      intent,
      followUpQ
    );

    expect(prompt).toContain('PRIOR CONVERSATION CONTEXT');
    expect(prompt).toContain('[Q1]: What is database normalization?');
    expect(prompt).toContain('Do NOT repeat prior answers');
    expect(prompt).toContain('FOLLOW_UPS: [question1] | [question2] | [question3]');
  });
});

describe('Prompt Conflict & Duplicate Resolution', () => {
  it('has a single unified follow-up format and never emits contradictory instructions', () => {
    const prompt = buildCandidateSystemPrompt(
      '',
      DEFAULT_JOB_DESCRIPTION,
      'Engineer',
      'Java',
      'interview',
      [],
      'General',
      'conceptual',
      'Explain microservices'
    );

    // Follow-up format must appear exactly once
    const matches = prompt.match(/FOLLOW_UPS:\s*\[question1\]/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);

    // No obsolete bullet header instruction
    expect(prompt).not.toContain('**Possible Follow-ups:**');
  });

  it('never injects Electron runtime internals into unrelated questions', () => {
    const prompt = buildCandidateSystemPrompt(
      '',
      DEFAULT_JOB_DESCRIPTION,
      'Cloud Developer',
      'Java',
      'interview',
      [],
      'AWS',
      'definition',
      'What is Amazon S3?'
    );

    expect(prompt).not.toContain('ELECTRON & DESKTOP RUNTIME MASTERY');
    expect(prompt).not.toContain('heap snapshot');
    expect(prompt).not.toContain('ipcRenderer');
  });

  it('injects Electron runtime internals only when relevant to question or role', () => {
    const prompt = buildCandidateSystemPrompt(
      '',
      DEFAULT_JOB_DESCRIPTION,
      'Electron Desktop Engineer',
      'TypeScript',
      'interview',
      [],
      'General',
      'conceptual',
      'How do you manage IPC performance in Electron?'
    );

    expect(prompt).toContain('ELECTRON & DESKTOP RUNTIME MASTERY');
    expect(prompt).toContain('contextBridge');
  });
});

describe('Streaming Parsing & Clean Sentence Buffering', () => {
  it('strips hidden reasoning markers and flushes sentences cleanly without partial tags', () => {
    const parser = new AIStreamParser();
    const sentenceBuffer = new SentenceBuffer();

    const chunk1 = '<think>Let me formulate a conversational answer for AWS.</think>AWS is Amazon\'s cloud platform. ';
    const chunk2 = 'Instead of buying physical servers, you rent resources on demand. ';
    const chunk3 = 'For example, EC2 runs applications, while S3 stores files. FOLLOW_UPS: What is S3? | What is EC2? | What is a VPC?';

    const clean1 = parser.parseChunk(chunk1);
    const clean2 = parser.parseChunk(chunk2);
    const clean3 = parser.parseChunk(chunk3);
    const remainder = parser.flush();

    expect(clean1).not.toContain('<think>');
    expect(clean1).not.toContain('Let me formulate');
    expect(clean1).toBe('AWS is Amazon\'s cloud platform. ');

    const sentences1 = sentenceBuffer.push(clean1);
    const sentences2 = sentenceBuffer.push(clean2);
    const sentences3 = sentenceBuffer.push(clean3 + remainder);
    const flushed = sentenceBuffer.flush();

    const allSentences = [...sentences1, ...sentences2, ...sentences3, ...flushed];

    expect(allSentences.length).toBeGreaterThanOrEqual(2);
    expect(allSentences[0]).toBe('AWS is Amazon\'s cloud platform.');
    expect(allSentences[1]).toBe('Instead of buying physical servers, you rent resources on demand.');
  });
});
