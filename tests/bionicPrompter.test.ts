import { describe, it, expect } from 'vitest';
import {
  extractGlanceableGazeBullets,
  formatBionicWord,
} from '../src/services/teleprompter/bionicPrompterService';

describe('Bionic Prompter & Gaze Service', () => {
  it('chunks long candidate answers into glanceable gaze bullets', () => {
    const answer =
      'We designed an event-driven architecture using Kafka partitions to handle 50k QPS with sub-10ms latency. The Redis cache layer absorbs hot reads, ensuring high availability under bursty spikes.';
    const bullets = extractGlanceableGazeBullets(answer);
    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets.every((b) => b.text.split(' ').length <= 7)).toBe(true);
  });

  it('detects metric chips for instant visual anchoring', () => {
    const answer =
      'Achieved 98% test coverage and maintained 99.99% SLA across 4 distributed Kubernetes clusters.';
    const bullets = extractGlanceableGazeBullets(answer);
    const hasMetric = bullets.some((b) => b.metricChip && (b.metricChip.includes('98%') || b.metricChip.includes('99.99%')));
    expect(hasMetric).toBe(true);
  });

  it('formats bionic word fixation correctly', () => {
    const formatted = formatBionicWord('Architecture');
    expect(formatted.bold.length).toBeGreaterThan(0);
    expect(formatted.normal.length).toBeGreaterThan(0);
    expect(formatted.bold + formatted.normal).toBe('Architecture');
  });
});
