/**
 * Routing policy for uncertain live-interview transcripts.
 *
 * Question-shaped uncertainty is handled automatically; confirmation is never a
 * prerequisite for generating an answer. Non-question speech remains ignored.
 */
export interface InterviewTranscriptClassification {
  type: string;
  needsConfirmation?: boolean;
  confidence: number;
}

export function shouldAutoRouteUncertainQuestion(
  classification: InterviewTranscriptClassification
): boolean {
  if (classification.type === 'UNCLASSIFIED') {
    return Boolean(classification.needsConfirmation);
  }

  return (
    classification.type === 'INTERVIEWER_INTERRUPTION' &&
    (Boolean(classification.needsConfirmation) || classification.confidence < 0.7)
  );
}
