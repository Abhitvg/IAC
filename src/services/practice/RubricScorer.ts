import { RubricDimension, RubricEvaluation, TieredHint } from './types';
import { LLMScorer } from './scoring/LLMScorer';
import { EvidenceValidator } from './scoring/EvidenceValidator';
import { DeterministicSignalsExtractor } from './scoring/DeterministicSignals';
import { StructureAnalyzer } from './coach/StructureAnalyzer';
import { ConcretenessAnalyzer } from './coach/ConcretenessAnalyzer';
import { AIProviderConfig } from '../../types';

export interface RubricConfig {
  category: 'coding' | 'system_design' | 'behavioral';
  question: string;
  candidateAnswer: string;
  codeSnippet?: string;
  hintsUsed?: TieredHint[];
  config?: Partial<AIProviderConfig>;
  llmCaller?: (prompt: string, model: string) => Promise<string>;
}

export class RubricScorer {
  /**
   * Primary asynchronous entry point: Uses LLMScorer with EvidenceValidator and strict Zod schema.
   */
  public static async evaluateAsync(config: RubricConfig): Promise<RubricEvaluation> {
    return this.evaluateWithLLM(config);
  }

  public static evaluate(config: RubricConfig): RubricEvaluation {
    return this.evaluateSync(config);
  }

  private static async evaluateWithLLM(config: RubricConfig): Promise<RubricEvaluation> {
    const cleanAnswer = (config.candidateAnswer || '').trim();
    const signals = DeterministicSignalsExtractor.extract(cleanAnswer);

    // Call LLMScorer
    const report = await LLMScorer.evaluate({
      transcript: cleanAnswer,
      question: {
        type: config.category,
        prompt: config.question,
      },
      hintsUsed: config.hintsUsed || [],
      config: config.config,
      llmCaller: config.llmCaller ? (p: string, m?: string) => config.llmCaller!(p, m || 'gpt-4o-mini') : undefined,
    });

    const questionEval = report.questions[0];
    const dimensions: RubricDimension[] = [];

    if (questionEval) {
      for (const [_key, dim] of Object.entries(questionEval.dimensions)) {
        dimensions.push({
          name: dim.name.replace(/_/g, ' '),
          category: config.category,
          score: dim.score,
          maxScore: 5,
          weight: 1.0 / Object.keys(questionEval.dimensions).length,
          feedback: dim.note || 'Evaluated by verified scoring rubric.',
          evidenceQuote: dim.evidence || undefined,
          missingAspect: dim.evidence ? undefined : 'No verifiable transcript quote provided.',
          penaltyDeduction: dim.penaltyDeduction,
          matchType: dim.matchType,
        });
      }
    }

    // Structure & Concreteness Coach analysis
    const structureAnalysis = await StructureAnalyzer.analyze({
      transcript: cleanAnswer,
      question: config.question,
      llmCaller: config.llmCaller ? (p: string, m?: string) => config.llmCaller!(p, m || 'gpt-4o-mini') : undefined,
    });

    const concretenessAnalysis = await ConcretenessAnalyzer.analyze({
      transcript: cleanAnswer,
      question: config.question,
      llmCaller: config.llmCaller ? (p: string, m?: string) => config.llmCaller!(p, m || 'gpt-4o-mini') : undefined,
    });

    const paragraphs = cleanAnswer.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
    const weakestParagraph = paragraphs[0] || cleanAnswer;
    const suggestedRewrite = await StructureAnalyzer.generateRewrite({
      paragraph: weakestParagraph,
      llmCaller: config.llmCaller,
    });

    dimensions.push({
      name: 'Structure & Organization',
      category: config.category,
      score: structureAnalysis.structureScore,
      maxScore: 5,
      weight: 0.15,
      feedback:
        structureAnalysis.reasons.join(' ') ||
        'Evaluation of headline, signposting, and trade-offs.',
      evidenceQuote:
        structureAnalysis.headlineFirst.quote || structureAnalysis.signposting.quote || undefined,
      missingAspect:
        structureAnalysis.structureScore < 3
          ? 'Needs clearer signposting and headline-first opening.'
          : undefined,
    });

    dimensions.push({
      name: 'Concreteness & Evidence',
      category: config.category,
      score: concretenessAnalysis.concretenessScore,
      maxScore: 5,
      weight: 0.15,
      feedback:
        concretenessAnalysis.reasons.join(' ') ||
        'Evaluation of numerical estimates and named production technologies.',
      evidenceQuote:
        concretenessAnalysis.concreteExamples[0]?.quote ||
        concretenessAnalysis.quantitiesOrThresholds[0]?.quote ||
        undefined,
      missingAspect:
        concretenessAnalysis.concretenessScore < 3
          ? 'Missing concrete production numbers and specific tools.'
          : undefined,
    });

    return {
      overallScore: report.overall.score,
      percentage: Math.round((report.overall.score / 5.0) * 100),
      dimensions,
      topLeverageFixes: report.overall.top_fixes,
      modelAnswer:
        questionEval?.model_answer_outline?.join('\n') || 'Follow standard structured framework.',
      diffMissingPoints: questionEval?.missed_points || [],
      assessedAt: Date.now(),
      uncertainty: report.uncertainty,
      isHeuristicEstimate: report.isHeuristicEstimate,
      confidenceBanner: report.confidenceBanner,
      signals,
      structureAnalysis,
      concretenessAnalysis,
      suggestedRewrite,
    };
  }

  /**
   * Synchronous heuristic estimate (for unit tests / instant local previews).
   * Labeled strictly as heuristic estimate. Never gives 5/5 to keyword stuffing.
   */
  public static evaluateSync(config: RubricConfig): RubricEvaluation {
    const cleanAnswer = (config.candidateAnswer || '').trim();
    // lower unneeded
    const signals = DeterministicSignalsExtractor.extract(cleanAnswer);
    const sentences = cleanAnswer.split(/(?<=[.?!])\s+/).filter((s) => s.length > 5);

    const dimensions: RubricDimension[] = [];
    const diffMissingPoints: string[] = [];

    const dimKeys =
      config.category === 'coding'
        ? [
            {
              key: 'problem_understanding',
              name: 'Problem Understanding & Constraints',
              weight: 0.15,
            },
            { key: 'approach', name: 'Approach & Trade-off Exploration', weight: 0.2 },
            { key: 'correctness', name: 'Algorithmic Correctness', weight: 0.25 },
            { key: 'complexity', name: 'Complexity Analysis (Time & Space)', weight: 0.2 },
            { key: 'testing', name: 'Testing & Code Dry-Run', weight: 0.2 },
          ]
        : config.category === 'system_design'
          ? [
              { key: 'requirements', name: 'Requirements & Scope Framing', weight: 0.2 },
              { key: 'estimation', name: 'Scale Estimation & Math', weight: 0.2 },
              { key: 'architecture', name: 'Architecture & Component Decoupling', weight: 0.2 },
              { key: 'tradeoffs', name: 'Trade-offs & Deep Dives', weight: 0.2 },
              { key: 'failure_modes', name: 'Failure Modes & Resilience', weight: 0.2 },
            ]
          : [
              { key: 'structure', name: 'STAR Structure & Framing', weight: 0.2 },
              { key: 'specificity', name: 'Context Specificity', weight: 0.2 },
              {
                key: 'ownership',
                name: "Action & Individual Ownership ('I' vs 'we')",
                weight: 0.25,
              },
              { key: 'impact', name: 'Quantified Result & Impact', weight: 0.2 },
              { key: 'reflection', name: 'Learnings & Reflection', weight: 0.15 },
            ];

    // Hint penalties applied in code: Tier 1: 0.25, Tier 2: 0.5, Tier 3: 1.0
    let totalPenalty = 0;
    for (const h of config.hintsUsed || []) {
      if (h.tier === 1) totalPenalty += 0.25;
      else if (h.tier === 2) totalPenalty += 0.5;
      else if (h.tier === 3) totalPenalty += 1.0;
    }
    const penaltyPerDim = dimKeys.length > 0 ? totalPenalty / dimKeys.length : 0;

    for (const d of dimKeys) {
      let rawScore = 2.0;
      let quote = '';
      let note = 'no verifiable evidence';

      // Look for a genuine candidate sentence
      if (sentences.length > 0) {
        if (
          d.key === 'complexity' &&
          (signals.hasBigONotation || signals.hasTimeComplexityMention)
        ) {
          const cSentence = sentences.find(
            (s) => s.toLowerCase().includes('o(') || s.toLowerCase().includes('complexity')
          );
          if (cSentence) {
            quote = cSentence;
            rawScore =
              signals.hasSpaceComplexityMention && signals.hasTimeComplexityMention ? 3.5 : 2.5;
            if (!signals.hasSpaceComplexityMention) {
              diffMissingPoints.push(
                'Complexity Analysis: Missing auxiliary space complexity calculation.'
              );
            }
            note = 'Stated complexity figures.';
          }
        } else if (d.key === 'ownership' && signals.ownershipRatio >= 0.6 && signals.iCount >= 3) {
          const oSentence = sentences.find((s) => s.toLowerCase().includes('i '));
          if (oSentence) {
            quote = oSentence;
            rawScore = 3.5;
            note = 'Demonstrated individual ownership.';
          }
        } else if (d.key === 'impact' && signals.hasNumberOrPercentage) {
          const numSentence = sentences.find((s) => /\b\d+(?:%|ms|s|k|m|\$|users)?\b/i.test(s));
          if (numSentence) {
            quote = numSentence;
            rawScore = 3.5;
            note = 'Delivered quantified numbers.';
          }
        } else if (d.key === 'problem_understanding' && signals.hasConstraintClarification) {
          const uSentence = sentences.find(
            (s) => s.toLowerCase().includes('constraint') || s.toLowerCase().includes('empty')
          );
          if (uSentence) {
            quote = uSentence;
            rawScore = 3.5;
            note = 'Clarified input constraints.';
          }
        }
      }

      // Validate with EvidenceValidator: if quote is missing or invalid, caps score at 2
      const validation = EvidenceValidator.validateEvidence(quote, cleanAnswer, rawScore, note);
      const postPenaltyScore = Math.max(
        1.0,
        Math.round((validation.score - penaltyPerDim) * 10) / 10
      );

      dimensions.push({
        name: d.name,
        category: config.category,
        score: postPenaltyScore,
        maxScore: 5,
        weight: d.weight,
        feedback: validation.note,
        evidenceQuote: validation.evidence || undefined,
        missingAspect: validation.evidence ? undefined : 'No verifiable transcript quote found.',
        penaltyDeduction: Math.round(penaltyPerDim * 100) / 100,
        matchType: validation.matchType,
      });

      if (!validation.evidence) {
        if (d.key === 'complexity') {
          diffMissingPoints.push(
            'Complexity Analysis: Missing auxiliary space complexity calculation.'
          );
        } else {
          diffMissingPoints.push(
            `${d.name}: Provide explicit verbal justification with concrete data.`
          );
        }
      }
    }

    const weightedScore = dimensions.reduce((acc, d) => acc + d.score * d.weight, 0);
    const overallScore = Math.round(weightedScore * 10) / 10;

    return {
      overallScore,
      percentage: Math.round((overallScore / 5.0) * 100),
      dimensions,
      topLeverageFixes: [
        'Articulate constraints and boundary edge cases before diving into code or architecture.',
        'Always state Big-O Time AND Auxiliary Space complexity explicitly.',
      ],
      modelAnswer:
        'Follow structured framework: clarify constraints -> explore trade-offs -> test boundary cases.',
      diffMissingPoints,
      assessedAt: Date.now(),
      uncertainty:
        'Evaluated by offline heuristic estimate. Semantic correctness cannot be guaranteed without LLM.',
      isHeuristicEstimate: true,
      confidenceBanner: 'Estimated, low confidence: evaluated by offline heuristic fallback.',
      signals,
    };
  }
}
