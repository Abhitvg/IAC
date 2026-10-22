import { CONCRETENESS_EVALUATION_PROMPT } from '../prompts/concreteness';
import {
  ConcretenessAnalysisResult,
  ConcreteExampleItem,
  NamedToolItem,
  QuantityItem,
  SupportedClaimItem,
} from '../types';
import { validateEvidenceSubstring } from '../feedback/FeedbackImporter';
import { LLMManager } from '../../providers/LLMProvider';

export class ConcretenessAnalyzer {
  private static readonly KNOWN_TECH_CATALOG = [
    'redis',
    'kafka',
    'postgres',
    'postgresql',
    'mysql',
    'mongodb',
    'cassandra',
    'dynamodb',
    's3',
    'elasticsearch',
    'opensearch',
    'rabbitmq',
    'grpc',
    'graphql',
    'docker',
    'kubernetes',
    'nginx',
    'envoy',
    'haproxy',
    'prometheus',
    'grafana',
    'react',
    'vue',
    'angular',
    'typescript',
    'javascript',
    'golang',
    'go',
    'python',
    'java',
    'rust',
    'c++',
    'aws',
    'gcp',
    'azure',
    'cloudflare',
    'sqlite',
    'zookeeper',
  ];

  /**
   * Evaluates concreteness, real-world grounding, and supported claims of a spoken technical transcript.
   */
  public static async analyze(params: {
    transcript: string;
    question: string;
    llmCaller?:
      | ((prompt: string, model?: string) => Promise<string>)
      | ((prompt: string, model: string) => Promise<string>);
  }): Promise<ConcretenessAnalysisResult> {
    const rawTranscript = (params.transcript || '').trim();

    if (!rawTranscript) {
      return {
        concreteExamplesCount: 0,
        concreteExamples: [],
        namedToolsOrTechnologies: [],
        quantitiesOrThresholds: [],
        workedExamplePresent: false,
        workedExampleQuote: '',
        claimsWithoutSupport: [],
        concretenessScore: 1,
        reasons: ['No answer transcript provided.'],
      };
    }

    try {
      const prompt = CONCRETENESS_EVALUATION_PROMPT.replace(
        '{{transcript}}',
        rawTranscript
      ).replace('{{question}}', params.question);

      let rawResponse: string;
      if (params.llmCaller) {
        rawResponse = await params.llmCaller(prompt, 'gpt-4o-mini');
      } else {
        const llm = new LLMManager();
        const res = await llm.executeWithFallback([{ role: 'user', content: prompt }], {
          temperature: 0.1,
        });
        rawResponse = res.text;
      }

      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM concreteness output');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return this.validateAndFinalize(parsed, rawTranscript);
    } catch {
      return this.heuristicFallback(rawTranscript);
    }
  }

  /**
   * Validates verbatim quotes and caps score at 2 if fabricated quotes are detected.
   */
  private static validateAndFinalize(
    parsed: any,
    rawTranscript: string
  ): ConcretenessAnalysisResult {
    let quoteFabricated = false;

    // 1. Concrete Examples
    const validExamples: ConcreteExampleItem[] = [];
    if (Array.isArray(parsed.concreteExamples)) {
      for (const ex of parsed.concreteExamples) {
        if (ex?.quote && ex.quote.toLowerCase() !== 'no evidence') {
          if (validateEvidenceSubstring(ex.quote, rawTranscript)) {
            validExamples.push({
              quote: ex.quote,
              description: ex.description || 'Concrete production scenario',
            });
          } else {
            quoteFabricated = true;
          }
        }
      }
    }

    // 2. Named Tools & Technologies
    const validTools: NamedToolItem[] = [];
    if (Array.isArray(parsed.namedToolsOrTechnologies)) {
      for (const t of parsed.namedToolsOrTechnologies) {
        if (t?.quote && t.quote.toLowerCase() !== 'no evidence') {
          if (validateEvidenceSubstring(t.quote, rawTranscript)) {
            validTools.push({
              name: t.name || t.quote,
              quote: t.quote,
            });
          } else {
            quoteFabricated = true;
          }
        }
      }
    }

    // 3. Quantities & Thresholds
    const validQuantities: QuantityItem[] = [];
    if (Array.isArray(parsed.quantitiesOrThresholds)) {
      for (const q of parsed.quantitiesOrThresholds) {
        if (q?.quote && q.quote.toLowerCase() !== 'no evidence') {
          if (validateEvidenceSubstring(q.quote, rawTranscript)) {
            validQuantities.push({
              quantity: q.quantity || q.quote,
              quote: q.quote,
            });
          } else {
            quoteFabricated = true;
          }
        }
      }
    }

    // 4. Worked Example
    let workedExamplePresent = Boolean(parsed.workedExamplePresent);
    let workedExampleQuote = (parsed.workedExampleQuote || '').trim();
    if (
      workedExamplePresent &&
      workedExampleQuote &&
      workedExampleQuote.toLowerCase() !== 'no evidence'
    ) {
      if (!validateEvidenceSubstring(workedExampleQuote, rawTranscript)) {
        quoteFabricated = true;
        workedExamplePresent = false;
        workedExampleQuote = '';
      }
    } else {
      workedExamplePresent = false;
      workedExampleQuote = '';
    }

    // 5. Claims Without Support
    const validClaims: SupportedClaimItem[] = [];
    if (Array.isArray(parsed.claimsWithoutSupport)) {
      for (const c of parsed.claimsWithoutSupport) {
        if (c?.quote && c.quote.toLowerCase() !== 'no evidence') {
          if (validateEvidenceSubstring(c.quote, rawTranscript)) {
            validClaims.push({
              claim: c.claim || c.quote,
              quote: c.quote,
              missingElement: ['example', 'number', 'mechanism'].includes(c.missingElement)
                ? c.missingElement
                : 'example',
            });
          } else {
            quoteFabricated = true;
          }
        }
      }
    }

    let rawScore = Math.max(1, Math.min(5, Math.round(Number(parsed.concretenessScore) || 1)));
    const reasons: string[] = Array.isArray(parsed.reasons) ? parsed.reasons.filter(Boolean) : [];

    if (quoteFabricated) {
      rawScore = Math.min(rawScore, 2);
      reasons.unshift(
        'Score capped at 2: Concreteness evaluation cited quotes not present in the answer transcript.'
      );
    }

    return {
      concreteExamplesCount: validExamples.length,
      concreteExamples: validExamples,
      namedToolsOrTechnologies: validTools,
      quantitiesOrThresholds: validQuantities,
      workedExamplePresent,
      workedExampleQuote,
      claimsWithoutSupport: validClaims,
      concretenessScore: rawScore,
      reasons,
    };
  }

  /**
   * Deterministic heuristic fallback when LLM is offline or returns unparseable output.
   */
  public static heuristicFallback(rawTranscript: string): ConcretenessAnalysisResult {
    const tLower = rawTranscript.toLowerCase();

    // Find quantities / numbers with units
    const quantityRegex =
      /\b\d+(?:\.\d+)?(?:\s*(?:ms|s|sec|seconds|minutes|hours|days|gb|mb|kb|tb|k|m|qps|rps|req\/s|%|percent))?\b/gi;
    const rawMatches = rawTranscript.match(quantityRegex) || [];
    const validQuantities: QuantityItem[] = Array.from(new Set(rawMatches)).map((m) => ({
      quantity: m,
      quote: m,
    }));

    // Find named tools
    const validTools: NamedToolItem[] = [];
    for (const tech of this.KNOWN_TECH_CATALOG) {
      const escaped = tech.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\const regex = new RegExp(`\\b${tech}\\b`, 'i');"
      );
      const regex = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i');
      const match = rawTranscript.match(regex);
      if (match) {
        validTools.push({
          name: match[0],
          quote: match[0],
        });
      }
    }

    // Detect worked example phrases
    const workedExamplePresent =
      tLower.includes('for example') ||
      tLower.includes('for instance') ||
      tLower.includes('in our production') ||
      tLower.includes('in my previous company') ||
      tLower.includes('consider a scenario');

    const concreteExamples: ConcreteExampleItem[] = workedExamplePresent
      ? [{ quote: 'for example', description: 'Grounded example detected' }]
      : [];

    // Calculate heuristic score
    let score = 1;
    const reasons: string[] = [];

    if (validQuantities.length >= 2) {
      score += 1;
      reasons.push(`Found ${validQuantities.length} numerical estimates/thresholds.`);
    } else if (validQuantities.length === 1) {
      reasons.push('Only 1 numerical metric provided.');
    } else {
      reasons.push('Missing quantitative parameters (QPS, latency, data volumes).');
    }

    if (validTools.length >= 2) {
      score += 1;
      reasons.push(
        `Referenced ${validTools.length} specific technologies (${validTools.map((t) => t.name).join(', ')}).`
      );
    } else if (validTools.length === 1) {
      score += 0.5;
      reasons.push('Only 1 specific technology named.');
    } else {
      reasons.push('Abstract explanation with zero named production tools.');
    }

    if (workedExamplePresent) {
      score += 1;
      reasons.push('Walked through a concrete example scenario.');
    } else {
      reasons.push('No worked example scenario given.');
    }

    return {
      concreteExamplesCount: concreteExamples.length,
      concreteExamples,
      namedToolsOrTechnologies: validTools,
      quantitiesOrThresholds: validQuantities,
      workedExamplePresent,
      workedExampleQuote: workedExamplePresent ? 'for example' : '',
      claimsWithoutSupport: [],
      concretenessScore: Math.min(5, Math.max(1, Math.round(score))),
      reasons,
      isHeuristicEstimate: true,
    };
  }
}
