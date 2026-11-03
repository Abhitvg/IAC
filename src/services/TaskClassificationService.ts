/**
 * TaskClassificationService.ts
 *
 * Intelligent Task & Screen Content Classifier for IAC 2.0.
 *
 * Classifies captured screen OCR, audio transcripts, or user input into
 * granular task categories using multi-signal analysis (OCR text, question wording,
 * form labels, input controls, page headings, question numbering, nearby context).
 */

export type ScreenTaskCategory =
  | 'CODING_PROBLEM'
  | 'TECHNICAL_INTERVIEW'
  | 'BEHAVIORAL_INTERVIEW'
  | 'JOB_APPLICATION_FORM'
  | 'PROFESSIONAL_QUESTIONNAIRE'
  | 'VENDOR_EVALUATION'
  | 'TECHNICAL_SKILLS_ASSESSMENT'
  | 'MULTIPLE_CHOICE_ASSESSMENT'
  | 'GENERAL_FORM'
  | 'DOCUMENT_OR_EMAIL'
  | 'UNKNOWN';

export interface TaskClassificationSignal {
  name: string;
  weight: number;
  matched: string[];
}

export interface TaskClassificationResult {
  category: ScreenTaskCategory;
  confidence: number; // 0.0 to 1.0
  supportingEvidence: string[];
  signals: TaskClassificationSignal[];
  isLowConfidence: boolean; // if confidence < 0.55, prompts user selection
  suggestedAction: 'solve_coding' | 'assist_application' | 'spoken_interview' | 'mcq_quiz' | 'prompt_user';
}

export interface ClassificationContext {
  userSelectedRegion?: boolean;
  previousTaskContext?: ScreenTaskCategory;
  urlHint?: string;
  activeWindowHint?: string;
}

export class TaskClassificationService {
  /**
   * Classifies screen OCR text or input into a structured classification result.
   */
  public static classify(
    text: string,
    context?: ClassificationContext
  ): TaskClassificationResult {
    const raw = (text || '').trim();
    if (!raw || raw.length < 15) {
      return {
        category: 'UNKNOWN',
        confidence: 0.1,
        supportingEvidence: ['Input text is empty or too short to extract meaningful signals.'],
        signals: [],
        isLowConfidence: true,
        suggestedAction: 'prompt_user',
      };
    }

    const lower = raw.toLowerCase();
    const scores: Record<ScreenTaskCategory, number> = {
      CODING_PROBLEM: 0,
      TECHNICAL_INTERVIEW: 0,
      BEHAVIORAL_INTERVIEW: 0,
      JOB_APPLICATION_FORM: 0,
      PROFESSIONAL_QUESTIONNAIRE: 0,
      VENDOR_EVALUATION: 0,
      TECHNICAL_SKILLS_ASSESSMENT: 0,
      MULTIPLE_CHOICE_ASSESSMENT: 0,
      GENERAL_FORM: 0,
      DOCUMENT_OR_EMAIL: 0,
      UNKNOWN: 0,
    };

    const evidenceMap: Record<ScreenTaskCategory, string[]> = {
      CODING_PROBLEM: [],
      TECHNICAL_INTERVIEW: [],
      BEHAVIORAL_INTERVIEW: [],
      JOB_APPLICATION_FORM: [],
      PROFESSIONAL_QUESTIONNAIRE: [],
      VENDOR_EVALUATION: [],
      TECHNICAL_SKILLS_ASSESSMENT: [],
      MULTIPLE_CHOICE_ASSESSMENT: [],
      GENERAL_FORM: [],
      DOCUMENT_OR_EMAIL: [],
      UNKNOWN: [],
    };

    // 1. Check Multiple Choice Assessment
    const mcqMatches = raw.match(/(?:^[A-D]\)|^\([A-D]\)|^[A-D]\.\s|Option [A-D]:)/gim);
    if (mcqMatches && mcqMatches.length >= 2) {
      scores.MULTIPLE_CHOICE_ASSESSMENT += 45 + mcqMatches.length * 10;
      evidenceMap.MULTIPLE_CHOICE_ASSESSMENT.push(`Found ${mcqMatches.length} multiple-choice answer option patterns.`);
    }
    if (/which\s+of\s+the\s+following|select\s+(?:the\s+best|one|all)|choose\s+one\s+answer/i.test(lower)) {
      scores.MULTIPLE_CHOICE_ASSESSMENT += 30;
      evidenceMap.MULTIPLE_CHOICE_ASSESSMENT.push('Detected multiple-choice selection instructions.');
    }

    // 2. Check Vendor Evaluation
    const vendorKeywords = [
      'vendor evaluation',
      'vendor questionnaire',
      'third-party technologies',
      'third-party endpoints',
      'third party',
      'sla compliance',
      'contractor evaluation',
      'choosing that vendor',
      'vendor risk',
      'subcontractor',
      'procurement',
      'rfi/rfp',
      'rfp response',
      'saas vendor',
    ];
    let vendorHits = 0;
    for (const kw of vendorKeywords) {
      if (lower.includes(kw)) {
        vendorHits++;
        scores.VENDOR_EVALUATION += 28;
        evidenceMap.VENDOR_EVALUATION.push(`Matched vendor signal: "${kw}"`);
      }
    }

    // 3. Check Job Application Form
    const jobAppKeywords = [
      'job application',
      'careers',
      'greenhouse',
      'lever.co',
      'workday',
      'ashby',
      'application questions',
      'submit application',
      'authorized to work in',
      'sponsorship now or in the future',
      'equal opportunity employer',
      'resume / cv',
      'cover letter',
      'desired salary',
      'earliest start date',
      'why do you want to join',
      'years of experience with',
    ];
    let jobAppHits = 0;
    for (const kw of jobAppKeywords) {
      if (lower.includes(kw)) {
        jobAppHits++;
        scores.JOB_APPLICATION_FORM += 26;
        evidenceMap.JOB_APPLICATION_FORM.push(`Matched job application signal: "${kw}"`);
      }
    }

    // 4. Check Professional Questionnaire / Form Controls
    const formControlPatterns = [
      /\[\s*text\s*area[^\n\]]*\]/i,
      /\[\s*max\s*\d+\s*chars?[^\n\]]*\]/i,
      /\(\s*\)\s*yes\s*\(\s*\)\s*no/i,
      /\[\s*_{3,}\s*\]/,
      /character\s*limit:\s*\d+/i,
      /max\s*\d+\s*words/i,
      /required\s*field/i,
    ];
    let formControlHits = 0;
    for (const pat of formControlPatterns) {
      if (pat.test(raw)) {
        formControlHits++;
        scores.PROFESSIONAL_QUESTIONNAIRE += 22;
        scores.JOB_APPLICATION_FORM += 15;
        scores.GENERAL_FORM += 18;
        evidenceMap.PROFESSIONAL_QUESTIONNAIRE.push(`Detected form UI input control: ${pat.source}`);
      }
    }

    if (/questionnaire|assessment\s*form|evaluation\s*form|survey|feedback\s*form/i.test(lower)) {
      scores.PROFESSIONAL_QUESTIONNAIRE += 25;
      evidenceMap.PROFESSIONAL_QUESTIONNAIRE.push('Explicit questionnaire/form heading detected.');
    }

    // Numbered questions: "1. What ... 2. What ..."
    const numberedQuestions = raw.match(/^\s*(?:\*\s*)?(?:[1-9]|10)\.\s+[A-Z]/gm);
    if (numberedQuestions && numberedQuestions.length >= 2) {
      scores.PROFESSIONAL_QUESTIONNAIRE += 25;
      scores.JOB_APPLICATION_FORM += 18;
      scores.VENDOR_EVALUATION += (vendorHits > 0 ? 25 : 10);
      evidenceMap.PROFESSIONAL_QUESTIONNAIRE.push(`Detected ${numberedQuestions.length} numbered application questions.`);
    }

    // 5. Check Coding Problem
    const codingSignals = [
      /leetcode/i,
      /hackerrank/i,
      /codility/i,
      /codeforces/i,
      /\bconstraints:\s*\n/i,
      /input:\s*(?:nums|head|root|arr|matrix|s|grid)\s*=/i,
      /output:\s*(?:\[|\d+|true|false|"[^"]*")/i,
      /explanation:\s*/i,
      /time\s*complexity/i,
      /space\s*complexity/i,
      /example\s*1:/i,
      /class\s+solution\s*\{/i,
      /def\s+[a-z_]+\(/i,
      /public\s+(?:int|void|boolean|String|List)/i,
      /return\s+(?:the\s+)?indices/i,
      /memory\s*limit/i,
    ];
    let codingHits = 0;
    for (const pat of codingSignals) {
      if (pat.test(raw)) {
        codingHits++;
        scores.CODING_PROBLEM += 25;
        evidenceMap.CODING_PROBLEM.push(`Matched algorithm/coding signal: ${pat.source}`);
      }
    }

    // Explicit penalty against coding if clearly a questionnaire / form without code
    if ((vendorHits > 0 || jobAppHits > 0 || formControlHits > 0) && codingHits <= 1) {
      scores.CODING_PROBLEM = Math.max(0, scores.CODING_PROBLEM - 40);
    }

    // 6. Check Behavioral Interview
    const behavioralSignals = [
      /tell\s+me\s+about\s+a\s+time/i,
      /describe\s+a\s+situation\s+where/i,
      /give\s+an\s+example\s+of\s+how\s+you/i,
      /how\s+do\s+you\s+handle\s+(?:conflict|disagreement|pressure|stress)/i,
      /what\s+is\s+your\s+greatest\s+(?:strength|weakness)/i,
      /behavioral\s+interview/i,
      /behavioral\s+round/i,
      /star\s+method/i,
      /disagreement\s+with\s+a/i,
    ];
    for (const pat of behavioralSignals) {
      if (pat.test(raw)) {
        scores.BEHAVIORAL_INTERVIEW += 45;
        evidenceMap.BEHAVIORAL_INTERVIEW.push(`Matched behavioral interview prompt: ${pat.source}`);
      }
    }

    // 7. Check Technical Interview (Spoken / Conceptual)
    const technicalInterviewSignals = [
      /how\s+does\s+(?:the\s+)?[a-z0-9_-]+\s+(?:consensus|algorithm|work|prevent|handle)/i,
      /how\s+does\s+(?:kafka|garbage\s+collection|react|postgres|indexing|tls|dns)\s+work/i,
      /what\s+is\s+the\s+difference\s+between\s+[a-z]+\s+and\s+[a-z]+/i,
      /explain\s+the\s+concept\s+of/i,
      /how\s+would\s+you\s+design\s+a/i,
      /system\s+design/i,
      /architecture\s+round/i,
      /trade-offs?\s+between/i,
      /\b(consensus|split-brain|raft|paxos|cap\s+theorem|acid\s+vs\s+base|eventual\s+consistency)\b/i,
    ];
    for (const pat of technicalInterviewSignals) {
      if (pat.test(raw)) {
        scores.TECHNICAL_INTERVIEW += 35;
        evidenceMap.TECHNICAL_INTERVIEW.push(`Matched technical interview conceptual signal: ${pat.source}`);
      }
    }

    // Context hints
    if (context?.previousTaskContext && scores[context.previousTaskContext] > 0) {
      scores[context.previousTaskContext] += 15;
    }

    // Find highest category
    let bestCategory: ScreenTaskCategory = 'UNKNOWN';
    let highestScore = 0;

    for (const [cat, score] of Object.entries(scores) as [ScreenTaskCategory, number][]) {
      if (score > highestScore) {
        highestScore = score;
        bestCategory = cat;
      }
    }

    // Confidence mapping: 0 to 100 normalized
    const confidence = Math.min(0.99, Math.max(0.1, highestScore / 100));
    const isLowConfidence = highestScore < 30 || confidence < 0.5;

    if (isLowConfidence) {
      bestCategory = highestScore >= 15 ? bestCategory : 'UNKNOWN';
    }

    // Determine suggested action
    let suggestedAction: TaskClassificationResult['suggestedAction'] = 'prompt_user';
    if (!isLowConfidence) {
      switch (bestCategory) {
        case 'CODING_PROBLEM':
          suggestedAction = 'solve_coding';
          break;
        case 'MULTIPLE_CHOICE_ASSESSMENT':
          suggestedAction = 'mcq_quiz';
          break;
        case 'JOB_APPLICATION_FORM':
        case 'VENDOR_EVALUATION':
        case 'PROFESSIONAL_QUESTIONNAIRE':
        case 'GENERAL_FORM':
          suggestedAction = 'assist_application';
          break;
        case 'BEHAVIORAL_INTERVIEW':
        case 'TECHNICAL_INTERVIEW':
          suggestedAction = 'spoken_interview';
          break;
        default:
          suggestedAction = 'prompt_user';
      }
    }

    return {
      category: bestCategory,
      confidence: Math.round(confidence * 100) / 100,
      supportingEvidence: evidenceMap[bestCategory] || [],
      signals: [
        { name: 'Vendor Signals', weight: vendorHits, matched: evidenceMap.VENDOR_EVALUATION },
        { name: 'Job Application Signals', weight: jobAppHits, matched: evidenceMap.JOB_APPLICATION_FORM },
        { name: 'Form UI Controls', weight: formControlHits, matched: evidenceMap.PROFESSIONAL_QUESTIONNAIRE },
        { name: 'Coding Signals', weight: codingHits, matched: evidenceMap.CODING_PROBLEM },
      ],
      isLowConfidence,
      suggestedAction,
    };
  }
}
