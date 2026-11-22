import { describe, expect, it } from 'vitest';
import { resolvePendingQuestionContinuation } from '../src/services/pendingQuestionContinuation';

describe('pending interviewer-question continuation routing', () => {
  it('accepts fragments that plausibly complete the pending question', () => {
    expect(resolvePendingQuestionContinuation('can handle one million concurrent users?')).toBe(
      'append'
    );
    expect(resolvePendingQuestionContinuation('with horizontal scaling and replication')).toBe(
      'append'
    );
  });

  it('ignores filler and candidate-led narration instead of appending it', () => {
    expect(resolvePendingQuestionContinuation('okay')).toBe('ignore');
    expect(
      resolvePendingQuestionContinuation('I would start by defining the service boundaries.')
    ).toBe('ignore');
    expect(resolvePendingQuestionContinuation('First, I would measure the baseline.')).toBe(
      'ignore'
    );
    expect(resolvePendingQuestionContinuation('Yeah, so I would use Redis.')).toBe('ignore');
    expect(resolvePendingQuestionContinuation('The first thing I would do is profile latency.')).toBe(
      'ignore'
    );
    expect(resolvePendingQuestionContinuation("What I'd do is add a cache.")).toBe('ignore');
    expect(resolvePendingQuestionContinuation('What is your approach to caching?')).toBe(
      'new-question'
    );
  });

  it('recognizes a distinct question so the stale pending fragment can be discarded', () => {
    expect(resolvePendingQuestionContinuation('What about failure recovery?')).toBe('new-question');
    expect(resolvePendingQuestionContinuation('Can you compare SQL and NoSQL?')).toBe(
      'new-question'
    );
    expect(resolvePendingQuestionContinuation('And why is that approach preferable?')).toBe(
      'new-question'
    );
  });
});
