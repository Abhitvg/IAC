/**
 * evaluationScorer.ts
 *
 * Multi-Dimensional Weighted Scoring System for IAC 2.0 Evaluation Framework.
 *
 * Implements the 7 evaluation dimensions with strict weighted scoring:
 * - Factual Grounding (Weight: 0.30) [Mandatory filter: Failing grounding fails entire answer]
 * - Technical Correctness (Weight: 0.30)
 * - Relevance (Weight: 0.12)
 * - Completeness (Weight: 0.10)
 * - Clarity & Spoken Naturalness (Weight: 0.08)
 * - Practical Applicability (Weight: 0.05)
 * - Consistency (Weight: 0.05)
 */

import { CandidateKnowledgeBase, FactualGroundingValidator } from './candidateIntelligence';

export interface EvaluationDimensions {
  factualGrounding: number; // 0 - 100
  technicalCorrectness: number; // 0 - 100
  relevance: number; // 0 - 100
  completeness: number; // 0 - 100
  clarity: number; // 0 - 100
  practicalApplicability: number; // 0 - 100
  consistency: number; // 0 - 100
}

export interface EvaluationResult {
  overallScore: number; // 0 - 100
  passed: boolean; // >= 75
  dimensions: EvaluationDimensions;
  criticalFailure: boolean;
  failureReason?: string;
  violations: string[];
}

export class EvaluationScorer {
  public static readonly WEIGHTS = {
    factualGrounding: 0.30,
    technicalCorrectness: 0.30,
    relevance: 0.12,
    completeness: 0.10,
    clarity: 0.08,
    practicalApplicability: 0.05,
    consistency: 0.05,
  };

  /**
   * Scores an answer against a candidate knowledge base and technical criteria.
   */
  public static evaluateAnswer(
    question: string,
    answer: string,
    kb: CandidateKnowledgeBase,
    technicalCriteria: {
      requiredMechanisms?: string[];
      forbiddenMisconceptions?: string[];
      expectedCode?: boolean;
    } = {}
  ): EvaluationResult {
    const qLower = question.toLowerCase();
    const aLower = answer.toLowerCase();
    const violations: string[] = [];

    // 1. Factual Grounding Score (0 - 100)
    const groundingCheck = FactualGroundingValidator.validateAnswer(answer, kb, question);
    let factualGrounding = groundingCheck.score;
    if (!groundingCheck.isGrounded) {
      violations.push(...groundingCheck.violations);
    }

    // 2. Technical Correctness Score (0 - 100)
    let technicalCorrectness = 100;
    if (technicalCriteria.forbiddenMisconceptions) {
      for (const misc of technicalCriteria.forbiddenMisconceptions) {
        if (new RegExp(misc, 'i').test(answer)) {
          technicalCorrectness -= 35;
          violations.push(`Technical misconception detected: ${misc}`);
        }
      }
    }

    if (technicalCriteria.requiredMechanisms) {
      for (const mech of technicalCriteria.requiredMechanisms) {
        if (!new RegExp(mech, 'i').test(answer)) {
          technicalCorrectness -= 15;
          violations.push(`Missing essential technical mechanism: ${mech}`);
        }
      }
    }
    technicalCorrectness = Math.max(0, technicalCorrectness);

    // 3. Relevance Score (0 - 100)
    let relevance = 100;
    const qTokens = qLower.split(/\W+/).filter((t) => t.length > 3);
    const matchedTokens = qTokens.filter((t) => aLower.includes(t));
    if (qTokens.length > 0) {
      const matchRatio = matchedTokens.length / qTokens.length;
      relevance = Math.round(Math.min(100, Math.max(40, matchRatio * 120)));
    }

    // 4. Completeness Score (0 - 100)
    let completeness = 90;
    if (aLower.includes('the trade-off is') || aLower.includes('trade-off') || aLower.includes('cost is')) {
      completeness += 10;
    } else {
      completeness -= 15;
    }
    if (aLower.includes('for example') || aLower.includes('in practice')) {
      completeness = Math.min(100, completeness + 5);
    }
    completeness = Math.max(20, Math.min(100, completeness));

    // 5. Clarity & Spoken Naturalness (0 - 100)
    let clarity = 95;
    // Penalize AI cliché filler
    const clichéFiller = [
      'certainly!',
      "that's a great question",
      "let's dive deep",
      'as an ai language model',
      'in summary,',
      'it is important to note',
    ];
    for (const filler of clichéFiller) {
      if (aLower.includes(filler)) {
        clarity -= 25;
        violations.push(`Cliché AI filler detected: "${filler}"`);
      }
    }
    // Penalize markdown bullet lists in spoken answers
    const bulletCount = (answer.match(/^\s*[-*•]\s+/gm) || []).length;
    if (bulletCount > 3) {
      clarity -= 20;
      violations.push('Excessive bullet points in spoken answer (expected natural conversational prose)');
    }
    clarity = Math.max(10, Math.min(100, clarity));

    // 6. Practical Applicability (0 - 100)
    let practicalApplicability = 85;
    if (/\b(?:latency|database|thread|cache|production|benchmark|failover)\b/i.test(answer)) {
      practicalApplicability += 15;
    }
    practicalApplicability = Math.min(100, practicalApplicability);

    // 7. Consistency (0 - 100)
    let consistency = 95;
    if (violations.length > 0) {
      consistency -= Math.min(40, violations.length * 10);
    }

    // Weighted Score Calculation
    let overallScore =
      factualGrounding * EvaluationScorer.WEIGHTS.factualGrounding +
      technicalCorrectness * EvaluationScorer.WEIGHTS.technicalCorrectness +
      relevance * EvaluationScorer.WEIGHTS.relevance +
      completeness * EvaluationScorer.WEIGHTS.completeness +
      clarity * EvaluationScorer.WEIGHTS.clarity +
      practicalApplicability * EvaluationScorer.WEIGHTS.practicalApplicability +
      consistency * EvaluationScorer.WEIGHTS.consistency;

    overallScore = Math.round(overallScore);

    // Mandatory Rule: Polished but fabricated answer must receive a FAILING score (< 50)
    let criticalFailure = false;
    let failureReason: string | undefined;

    if (factualGrounding < 60) {
      criticalFailure = true;
      overallScore = Math.min(overallScore, 45); // Hard cap at failing
      failureReason = 'Factual grounding failure: Answer contains fabricated achievements, metrics, or technologies.';
    } else if (technicalCorrectness < 50) {
      criticalFailure = true;
      overallScore = Math.min(overallScore, 48);
      failureReason = 'Technical correctness failure: Answer contains severe architectural misconceptions.';
    }

    const passed = overallScore >= 75 && !criticalFailure;

    return {
      overallScore,
      passed,
      dimensions: {
        factualGrounding,
        technicalCorrectness,
        relevance,
        completeness,
        clarity,
        practicalApplicability,
        consistency,
      },
      criticalFailure,
      failureReason,
      violations,
    };
  }
}
