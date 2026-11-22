export type AnswerVerificationBasis =
  | 'CANDIDATE_EVIDENCE' | 'GENERAL_TECHNICAL_REASONING' | 'SCREEN_CODE_NOT_EXECUTED';

export interface AnswerVerificationBasisInput {
  type: 'interview' | 'screen';
  technicalIntent: boolean;
  candidateSpecificQuestion: boolean;
  candidateSpecificAnswer: boolean;
}

export interface AnswerVerificationNotice {
  tone: 'success' | 'neutral' | 'warning';
  label: string;
  description: string;
}

/**
 * Separates candidate-evidence screening from general model reasoning and code execution.
 * A successful grounding decision is not proof that generated code was compiled or run.
 */
export function resolveAnswerVerificationBasis(
  input: AnswerVerificationBasisInput
): AnswerVerificationBasis {
  if (input.type === 'screen') return 'SCREEN_CODE_NOT_EXECUTED';
  if (input.technicalIntent && !input.candidateSpecificQuestion && !input.candidateSpecificAnswer) {
    return 'GENERAL_TECHNICAL_REASONING';
  }
  return 'CANDIDATE_EVIDENCE';
}

export function getAnswerVerificationNotice(
  basis: AnswerVerificationBasis | null | undefined,
  validationStatus: string,
  isValidated: boolean
): AnswerVerificationNotice | null {
  if (basis === 'SCREEN_CODE_NOT_EXECUTED') {
    return {
      tone: 'warning',
      label: 'Code not executed',
      description:
        'IAC has not compiled or run this code. Review the platform signature and run the target tests before relying on the solution.',
    };
  }

  if (basis === 'GENERAL_TECHNICAL_REASONING') {
    return {
      tone: 'neutral',
      label: 'AI reasoning only',
      description:
        'This general technical answer was not independently checked against external references or executed.',
    };
  }

  if (basis === 'CANDIDATE_EVIDENCE') {
    if (validationStatus === 'FLAGGED_BUT_QUALIFIED') {
      return {
        tone: 'warning',
        label: 'Candidate claims qualified',
        description:
          'Some personal claims were qualified against the available candidate material. Review the wording before using it.',
      };
    }
    if (isValidated && validationStatus === 'VALIDATED') {
      return {
        tone: 'success',
        label: 'Candidate-evidence check passed',
        description:
          'No unsupported personal claims were detected against the loaded candidate material. This is not an independent fact-check of technical content.',
      };
    }
  }

  return null;
}
