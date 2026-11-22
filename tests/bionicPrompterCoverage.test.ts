import { describe, expect, it } from 'vitest';
import {
  BIONIC_PRIMARY_BULLET_LIMIT,
  extractGlanceableGazeBullets,
  selectPrimaryGlanceableBullets,
} from '../src/services/teleprompter/bionicPrompterService';

describe('Bionic answer coverage', () => {
  it('retains every extracted point instead of truncating long answers', () => {
    const prose = Array.from(
      { length: 32 },
      (_, index) => `Point ${index + 1} explains an important system behavior.`
    ).join(' ');

    const bullets = extractGlanceableGazeBullets(prose);

    expect(bullets.length).toBeGreaterThan(BIONIC_PRIMARY_BULLET_LIMIT);
    expect(bullets[0].text).toContain('Point 1');
    expect(bullets.some((bullet) => bullet.text.includes('Point 32'))).toBe(true);
  });

  it('keeps the opening, high-signal trade-offs, and conclusion in the primary set', () => {
    const bullets = Array.from({ length: 30 }, (_, index) => ({
      id: `gaze-${index}`,
      text:
        index === 16
          ? 'A key trade-off is latency versus consistency.'
          : index === 17
            ? 'p95 latency remains 40 ms.'
            : index === 29
              ? 'In conclusion, retain rollback and recovery safeguards.'
              : `Engineering point ${index} describes the system behavior.`,
      metricChip: index === 17 ? '40 ms' : undefined,
      highlightWords: [],
    }));

    const { primary, remaining } = selectPrimaryGlanceableBullets(bullets);

    expect(primary).toHaveLength(BIONIC_PRIMARY_BULLET_LIMIT);
    expect(primary[0].id).toBe('gaze-0');
    expect(primary.some((bullet) => bullet.id === 'gaze-16')).toBe(true);
    expect(primary.some((bullet) => bullet.id === 'gaze-17')).toBe(true);
    expect(primary.some((bullet) => bullet.id === 'gaze-29')).toBe(true);
    expect(primary.length + remaining.length).toBe(bullets.length);
    expect(new Set([...primary, ...remaining].map((bullet) => bullet.id)).size).toBe(
      bullets.length
    );
  });

  it('keeps complete sentences and table rows intact', () => {
    const bullets = extractGlanceableGazeBullets(
      [
        '## Pricing models',
        'Pay-as-you-go is billed for what you use, while commitments can reduce the unit price.',
        '| Model | What it is | Typical use case |',
        '| --- | --- | --- |',
        '| On-Demand | Pay for usage | Variable workloads |',
      ].join('\n')
    );

    expect(bullets).toHaveLength(3);
    expect(bullets[0].text).toBe('Pricing models');
    expect(bullets[1].text).toBe(
      'Pay-as-you-go is billed for what you use, while commitments can reduce the unit price.'
    );
    expect(bullets[2].tableRows).toEqual([
      ['Model', 'What it is', 'Typical use case'],
      ['On-Demand', 'Pay for usage', 'Variable workloads'],
    ]);
  });

  it('does not split or hide short answers', () => {
    const bullets = [{ id: 'gaze-0', text: 'A short answer.', highlightWords: [] }];

    expect(selectPrimaryGlanceableBullets(bullets)).toEqual({
      primary: bullets,
      remaining: [],
    });
  });
});
