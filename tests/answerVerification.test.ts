import { describe, expect, it } from 'vitest';
import {
  getAnswerVerificationNotice,
  resolveAnswerVerificationBasis,
} from '../src/services/answerVerification';

describe('answer verification provenance', () => {
  it('marks screen-generated code as not executed even when grounding is marked validated', () => {
    const basis = resolveAnswerVerificationBasis({
      type: 'screen',
      technicalIntent: true,
      candidateSpecificQuestion: false,
      candidateSpecificAnswer: false,
    });
    const notice = getAnswerVerificationNotice(basis, 'VALIDATED', true);

    expect(basis).toBe('SCREEN_CODE_NOT_EXECUTED');
    expect(notice?.label).toBe('Code not executed');
    expect(notice?.description).toContain('has not compiled or run');
  });

  it('does not present generic technical reasoning as a candidate-evidence check', () => {
    const basis = resolveAnswerVerificationBasis({
      type: 'interview',
      technicalIntent: true,
      candidateSpecificQuestion: false,
      candidateSpecificAnswer: false,
    });
    const notice = getAnswerVerificationNotice(basis, 'VALIDATED', true);

    expect(basis).toBe('GENERAL_TECHNICAL_REASONING');
    expect(notice?.label).toBe('AI reasoning only');
    expect(notice?.description).toContain('not independently checked');
  });

  it('uses candidate-evidence wording only when the answer was screened against candidate material', () => {
    const basis = resolveAnswerVerificationBasis({
      type: 'interview',
      technicalIntent: false,
      candidateSpecificQuestion: true,
      candidateSpecificAnswer: true,
    });
    const notice = getAnswerVerificationNotice(basis, 'VALIDATED', true);

    expect(basis).toBe('CANDIDATE_EVIDENCE');
    expect(notice?.label).toBe('Candidate-evidence check passed');
    expect(notice?.description).toContain('not an independent fact-check');
  });

  it('does not call a qualified candidate answer a passed check', () => {
    const notice = getAnswerVerificationNotice('CANDIDATE_EVIDENCE', 'FLAGGED_BUT_QUALIFIED', false);

    expect(notice?.tone).toBe('warning');
    expect(notice?.label).toBe('Candidate claims qualified');
  });

  it('does not show a success notice when candidate screening did not pass', () => {
    expect(getAnswerVerificationNotice('CANDIDATE_EVIDENCE', 'FAILED', false)).toBeNull();
  });
});
