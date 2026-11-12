import { describe, it, expect } from 'vitest';
import { predictInterviewLoop } from '../src/services/careerOps/jobInterviewPredictor';

describe('Digital Twin Company Interview Loop Predictor', () => {
  it('predicts Anthropic specific interview stages and safety technical loop', () => {
    const loop = predictInterviewLoop('Anthropic', 'Research Engineer', 'Python, distributed systems, evaluation harnesses, safety');
    expect(loop.stages.length).toBe(5);
    expect(loop.stages[0].format).toBe('Recruiter Call');
    expect(loop.stages[2].name).toContain('AI Infrastructure');
    expect(loop.technicalQuestions.some((q) => q.prompt.includes('safety benchmarking'))).toBe(true);
  });

  it('predicts Stripe specific idempotency questions and stages', () => {
    const loop = predictInterviewLoop('Stripe', 'Backend Engineer', 'Go, distributed ledger, Kafka, idempotency');
    expect(loop.stages.length).toBe(5);
    expect(loop.technicalQuestions.some((q) => q.prompt.includes('idempotent payment API'))).toBe(true);
  });

  it('predicts OpenAI specific inference and KV-cache questions', () => {
    const loop = predictInterviewLoop('OpenAI', 'Systems Engineer', 'CUDA, Python, LLM inference, Kubernetes');
    expect(loop.stages.length).toBe(5);
    expect(loop.technicalQuestions.some((q) => q.prompt.includes('continuous batching'))).toBe(true);
  });
});
