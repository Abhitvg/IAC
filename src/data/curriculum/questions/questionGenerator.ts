import { CurriculumCatalogService } from '../CurriculumCatalog';
import {
  CurriculumQuestion,
  QuestionDifficultyTier,
  TechnicalQuestionType,
  difficultyTierToNumeric,
} from './types';
import { QuestionValidator } from './questionValidator';

export interface GenerateQuestionOptions {
  topicId: string;
  questionType?: TechnicalQuestionType;
  difficultyTier?: QuestionDifficultyTier;
  targetConcept?: string;
}

export class CurriculumQuestionGenerator {
  /**
   * Deterministically generates a verified curriculum question for any topic in the catalog.
   */
  public static generateDeterministic(options: GenerateQuestionOptions): CurriculumQuestion {
    const catalog = CurriculumCatalogService.getInstance();
    const topic = catalog.getTopic(options.topicId);
    if (!topic) {
      throw new Error(`Topic '${options.topicId}' not found in CurriculumCatalog.`);
    }

    const type = options.questionType || 'conceptual';
    const tier = options.difficultyTier || (topic.difficulty as QuestionDifficultyTier) || 'intermediate';
    const numericDiff = difficultyTierToNumeric(tier);
    const concept =
      options.targetConcept ||
      (topic.coreConcepts.length > 0 ? topic.coreConcepts[0] : topic.name);

    const questionId = `gen_${topic.id}_${type}_${tier}_${Date.now()}`;

    let prompt = '';
    let objective = '';
    const expectedKnowledge: string[] = [...topic.coreConcepts.slice(0, 4)];
    const rubricCriteria: string[] = [];
    const expectedConcepts: string[] = [concept];
    const failurePatterns: string[] = [...topic.commonMisconceptions.slice(0, 2)];
    const edgeCases: string[] = [];
    const answerChars: string[] = [];
    const followUps: string[] = [];

    switch (type) {
      case 'conceptual':
        prompt = `Explain the core principles and internal mechanics of ${concept} in the context of ${topic.name}. What fundamental problems does it solve?`;
        objective = `Evaluate foundational conceptual clarity regarding ${concept}.`;
        rubricCriteria.push(
          `Accurately explains the definition and architectural role of ${concept}`,
          `Articulates trade-offs and constraints associated with ${concept}`
        );
        edgeCases.push('Degenerate boundary states', 'Empty or single-element inputs');
        answerChars.push('Structured explanation beginning with high-level concept before diving into mechanics');
        followUps.push(`How does ${concept} interact with ${topic.relatedTopics[0] || 'related systems'}?`);
        break;

      case 'definition_explanation':
        prompt = `Define ${concept} precisely. How does it differ from related constructs in ${topic.name}, and what are its standard invariants?`;
        objective = `Assess precision of technical definitions and invariant guarantees for ${concept}.`;
        rubricCriteria.push(
          `Gives a precise technical definition without hand-waving`,
          `Identifies key invariants and boundary behaviors`
        );
        edgeCases.push('Null or uninitialized states', 'Resource constraint limits');
        answerChars.push('Clear formal definition followed by concrete contrasting examples');
        followUps.push(`Under what conditions would an engineer violate or relax this invariant?`);
        break;

      case 'coding_problem':
        prompt = `Implement an efficient algorithm in ${topic.name} that leverages ${concept} to solve the optimal subproblem without exceeding linear time overhead.`;
        objective = `Verify practical coding implementation, invariant maintenance, and syntax accuracy.`;
        rubricCriteria.push(
          `Produces functionally correct code handling input bounds`,
          `Maintains correct asymptotic time and space complexity`,
          `Handles boundary and empty collection edge cases cleanly`
        );
        edgeCases.push('Empty inputs', 'Maximum boundary sizes', 'Duplicate keys/values');
        answerChars.push('Clean variable naming, invariant verbalization before coding, complexity stated');
        followUps.push(`Can this implementation be optimized for space by using in-place manipulation?`);
        break;

      case 'complexity_analysis':
        prompt = `Perform a rigorous asymptotic time and space complexity analysis for operations involving ${concept} in ${topic.name}. Include best, average, worst, and amortized cases where applicable.`;
        objective = `Assess mastery of Big-O notations, recursion tree / master theorem analysis, and auxiliary space tracking.`;
        rubricCriteria.push(
          `Correctly derives time complexity with mathematical justification`,
          `Accurately distinguishes auxiliary memory from input storage`,
          `Identifies operations with amortized versus worst-case bounds`
        );
        edgeCases.push('Worst-case adversarial inputs causing degenerate performance');
        answerChars.push('Explicit Big-O notation with clear step-by-step mathematical reasoning');
        followUps.push(`How does cache locality or hardware architecture impact these theoretical Big-O numbers?`);
        break;

      case 'debugging':
        prompt = `Consider a production implementation in ${topic.name} where ${concept} suffers intermittent failures or performance degradation under concurrent load. How do you diagnose and isolate the root cause?`;
        objective = `Evaluate structured debugging methodology, error localization, and observability skills.`;
        rubricCriteria.push(
          `Applies methodical diagnostic isolation rather than random guessing`,
          `Identifies common failure modes related to ${concept}`,
          `Suggests appropriate monitoring metrics and tracing tools`
        );
        edgeCases.push('Transient race conditions', 'Memory leaks or resource leaks under sustained load');
        answerChars.push('Hypothesis-driven debugging process with reproduction steps');
        followUps.push(`What regression test would you write to prevent this issue from recurring?`);
        break;

      case 'edge_case':
        prompt = `What are the critical edge cases, boundary conditions, and failure modes when applying ${concept} in ${topic.name}? How should robust systems defend against them?`;
        objective = `Assess defensive programming awareness and thoroughness in anticipating failure modes.`;
        rubricCriteria.push(
          `Enumerates non-obvious boundary and adversarial edge cases`,
          `Proposes clean defensive guards without excessive defensive bloat`
        );
        edgeCases.push('Integer overflow', 'Cycle detection', 'Exhaustion of thread or file handles');
        answerChars.push('Systematic categorization of edge cases into input, resource, and concurrency domains');
        followUps.push(`How does the system fail gracefully when hard resource limits are hit?`);
        break;

      case 'architecture_tradeoff':
        prompt = `Analyze the architectural trade-offs of utilizing ${concept} versus an alternative design in ${topic.name}. Consider throughput, latency, memory footprint, and engineering complexity.`;
        objective = `Evaluate senior-level technical decision making, trade-off evaluation, and pragmatism.`;
        rubricCriteria.push(
          `Articulates balanced pros and cons without dogmatism`,
          `Grounds decision in workload characteristics (e.g. read-heavy vs write-heavy)`,
          `Quantifies impacts on latency, throughput, and memory`
        );
        edgeCases.push('Shift in workload ratio skewing initial assumptions');
        answerChars.push('Contrasts two concrete approaches using a multi-criteria decision matrix');
        followUps.push(`At what scale threshold does the alternative architecture become necessary?`);
        break;

      case 'real_world_scenario':
        prompt = `You are tasked with designing a critical feature in a distributed production service using ${topic.name}. How do you apply ${concept} to satisfy stringent SLA requirements?`;
        objective = `Evaluate application of theoretical concepts to high-scale production systems.`;
        rubricCriteria.push(
          `Bridges theoretical algorithms with real-world infrastructure constraints`,
          `Addresses fault tolerance, graceful degradation, and observability`,
          `Demonstrates awareness of operational complexity`
        );
        edgeCases.push('Partial network partitions', 'Sudden bursty traffic spikes');
        answerChars.push('End-to-end perspective including data flow, failure recovery, and monitoring');
        followUps.push(`How do you perform zero-downtime schema or algorithmic migrations on this system?`);
        break;

      case 'follow_up':
        prompt = `Following up on your approach to ${concept}: what happens if the input scale increases by 10,000x and no longer fits on a single machine?`;
        objective = `Assess capacity to scale algorithms, partition state, and reason about distributed trade-offs.`;
        rubricCriteria.push(
          `Transitions gracefully from single-node to distributed architectures`,
          `Discusses data partitioning (sharding) and consistency models`
        );
        edgeCases.push('Cross-partition transactions and hot key bottlenecks');
        answerChars.push('Proposes sharding, replication, and distributed coordination strategies');
        followUps.push(`How do you handle node failure during a re-sharding operation?`);
        break;

      case 'advanced_problem_solving':
        prompt = `Synthesize an advanced solution combining ${concept} from ${topic.name} with concepts from ${topic.relatedTopics[0] || 'related domains'} to achieve optimal asymptotic bounds under strict memory limits.`;
        objective = `Evaluate creative problem solving, synthesis of multiple data structures, and algorithmic mastery.`;
        rubricCriteria.push(
          `Synthesizes multiple advanced concepts into a coherent solution`,
          `Proves correctness and optimality of the composite design`
        );
        edgeCases.push('Adversarial inputs designed to maximize hash collisions or tree depth');
        answerChars.push('Detailed invariant explanation followed by composite structural design');
        followUps.push(`Can we achieve even lower latency by accepting an approximate / probabilistic result?`);
        break;
    }

    if (rubricCriteria.length < 2) {
      rubricCriteria.push(`Demonstrates accurate understanding of ${topic.name}`);
    }
    if (failurePatterns.length === 0) {
      failurePatterns.push(`Superficial or hand-waving explanation lacking technical depth`);
    }
    if (edgeCases.length === 0) {
      edgeCases.push('Standard boundary and empty inputs');
    }
    if (answerChars.length === 0) {
      answerChars.push('Clear, structured communication with stated assumptions');
    }
    if (followUps.length === 0) {
      followUps.push(`How would you test this design in production?`);
    }

    const question: CurriculumQuestion = {
      id: questionId,
      curriculumTopicId: topic.id,
      conceptReference: concept,
      questionType: type,
      difficultyTier: tier,
      difficultyNumeric: numericDiff,
      prompt,
      interviewObjective: objective,
      expectedKnowledge,
      evaluationCriteria: {
        rubricCriteria,
        expectedConcepts,
        failurePatterns,
      },
      relevantEdgeCases: edgeCases,
      expectedAnswerCharacteristics: answerChars,
      followUpOpportunities: followUps,
      timeBudgetMinutes: Math.min(45, Math.max(10, numericDiff * 7)),
      tags: [topic.category, topic.id, type, tier],
    };

    const validation = QuestionValidator.validate(question);
    if (!validation.valid) {
      throw new Error(
        `Generated question failed validation: ${validation.errors.join(', ')}`
      );
    }

    return question;
  }

  /**
   * Generates a grounding prompt for an LLM to generate a question,
   * incorporating curriculum invariants and misconceptions.
   */
  public static buildLLMQuestionGenerationPrompt(options: GenerateQuestionOptions): string {
    const catalog = CurriculumCatalogService.getInstance();
    const topic = catalog.getTopic(options.topicId);
    if (!topic) {
      throw new Error(`Topic '${options.topicId}' not found.`);
    }

    const groundingSection = catalog.generateGroundingPromptSection(topic.id);
    const type = options.questionType || 'conceptual';
    const tier = options.difficultyTier || 'intermediate';

    return `You are an expert technical interviewer creating a rigorously grounded technical interview question.

${groundingSection}

TARGET QUESTION PARAMETERS:
- Question Type: ${type}
- Difficulty Tier: ${tier}
- Specific Concept Focus: ${options.targetConcept || 'Core concepts in topic'}

TASK:
Produce a technical interview question strictly grounded in the technical baseline above.
Return ONLY valid JSON matching this schema:
{
  "id": "gen_${topic.id}_${Date.now()}",
  "curriculumTopicId": "${topic.id}",
  "conceptReference": "<specific concept from baseline>",
  "questionType": "${type}",
  "difficultyTier": "${tier}",
  "difficultyNumeric": ${difficultyTierToNumeric(tier)},
  "prompt": "<precise question text>",
  "interviewObjective": "<clear objective>",
  "expectedKnowledge": ["point 1", "point 2"],
  "evaluationCriteria": {
    "rubricCriteria": ["criterion 1", "criterion 2"],
    "expectedConcepts": ["concept 1"],
    "failurePatterns": ["misconception 1"]
  },
  "relevantEdgeCases": ["edge case 1"],
  "expectedAnswerCharacteristics": ["characteristic 1"],
  "followUpOpportunities": ["follow up 1"],
  "timeBudgetMinutes": 15,
  "tags": ["${topic.category}", "${topic.id}", "${type}"]
}`;
  }
}
