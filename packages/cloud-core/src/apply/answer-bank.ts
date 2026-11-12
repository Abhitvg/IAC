import { z } from 'zod';
import type { SprintContract } from '../contract';
import type {
  ProfileFactPayload,
  ExperienceFactPayload,
  EducationFactPayload,
  SkillFactPayload,
} from '../career-graph-types';

export const FormFieldTypeEnum = z.enum([
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'radio',
  'checkbox',
  'file',
]);

export type FormFieldType = z.infer<typeof FormFieldTypeEnum>;

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  description?: string;
}

export interface ResolvedFieldAnswer {
  fieldId: string;
  fieldName: string;
  value: string | boolean | number;
  source: 'contract_default' | 'profile_fact' | 'experience_fact' | 'computed';
  confirmedFactId?: string;
}

export interface UnanswerableField {
  fieldId: string;
  fieldName: string;
  label: string;
  required: boolean;
  reason: 'missing_default_answer' | 'unconfirmed_fact' | 'sensitive_unconfigured';
}

export interface FormResolutionResult {
  canSubmit: boolean;
  answers: Record<string, string | boolean | number>;
  resolvedFields: ResolvedFieldAnswer[];
  unanswerableRequiredFields: UnanswerableField[];
  skipReason?: string;
}

export interface CandidateConfirmedProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  experiences?: ExperienceFactPayload[];
  educations?: EducationFactPayload[];
  skills?: SkillFactPayload[];
  profile?: ProfileFactPayload;
}

export class AnswerBank {
  private readonly contract: SprintContract;
  private readonly profile: CandidateConfirmedProfile;

  constructor(contract: SprintContract, profile: CandidateConfirmedProfile) {
    this.contract = contract;
    this.profile = profile;
  }

  private normalizeKey(text: string): string {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Calculates total years of professional experience from confirmed experience facts.
   * Prevents exaggeration or fabricated numbers (H3).
   */
  public getCalculatedYearsOfExperience(): number {
    if (!this.profile.experiences || this.profile.experiences.length === 0) {
      return 0;
    }

    let totalMonths = 0;
    for (const exp of this.profile.experiences) {
      const startYear = parseInt(exp.startDate.slice(0, 4), 10);
      const startMonth = exp.startDate.length >= 7 ? parseInt(exp.startDate.slice(5, 7), 10) : 1;
      
      let endYear: number;
      let endMonth: number;
      if (exp.isCurrent || !exp.endDate) {
        const now = new Date();
        endYear = now.getFullYear();
        endMonth = now.getMonth() + 1;
      } else {
        endYear = parseInt(exp.endDate.slice(0, 4), 10);
        endMonth = exp.endDate.length >= 7 ? parseInt(exp.endDate.slice(5, 7), 10) : 12;
      }

      if (!isNaN(startYear) && !isNaN(endYear)) {
        const months = Math.max(0, (endYear - startYear) * 12 + (endMonth - startMonth));
        totalMonths += months;
      }
    }

    return Math.max(0, Math.round((totalMonths / 12) * 10) / 10);
  }

  /**
   * Resolves a single field using confirmed facts or Sprint Contract defaults.
   */
  public resolveField(field: FormField): ResolvedFieldAnswer | UnanswerableField {
    const normName = this.normalizeKey(field.name || '');
    const normLabel = this.normalizeKey(field.label || '');
    const combined = `${normName} ${normLabel}`.trim();

    // 1. Basic profile & identity fields
    if (combined.includes('first name') || normName === 'firstname') {
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: this.profile.firstName,
        source: 'profile_fact',
      };
    }

    if (combined.includes('last name') || normName === 'lastname') {
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: this.profile.lastName,
        source: 'profile_fact',
      };
    }

    if (combined.includes('full name') || normName === 'fullname' || normName === 'name') {
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: `${this.profile.firstName} ${this.profile.lastName}`.trim(),
        source: 'profile_fact',
      };
    }

    if (combined.includes('email')) {
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: this.profile.email,
        source: 'profile_fact',
      };
    }

    if (combined.includes('phone') || combined.includes('mobile') || combined.includes('telephone')) {
      if (this.profile.phone) {
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: this.profile.phone,
          source: 'profile_fact',
        };
      }
    }

    if (combined.includes('location') || combined.includes('city') || combined.includes('address')) {
      const loc = this.profile.location || this.contract.locations[0];
      if (loc) {
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: loc,
          source: 'profile_fact',
        };
      }
    }

    // 2. Links / URLs
    if (combined.includes('linkedin')) {
      if (this.profile.linkedinUrl) {
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: this.profile.linkedinUrl,
          source: 'profile_fact',
        };
      }
    }

    if (combined.includes('github')) {
      if (this.profile.githubUrl) {
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: this.profile.githubUrl,
          source: 'profile_fact',
        };
      }
    }

    if (combined.includes('portfolio') || combined.includes('website') || combined.includes('personal site')) {
      if (this.profile.portfolioUrl) {
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: this.profile.portfolioUrl,
          source: 'profile_fact',
        };
      }
    }

    // 3. Work Authorization & Sponsorship (from Contract)
    if (
      combined.includes('legally authorized') ||
      combined.includes('work authorization') ||
      combined.includes('authorized to work') ||
      combined.includes('eligible to work')
    ) {
      const isSelectOrRadio = field.type === 'select' || field.type === 'radio';
      const val = isSelectOrRadio ? 'Yes' : true;
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: val,
        source: 'contract_default',
      };
    }

    if (
      combined.includes('sponsorship') ||
      combined.includes('require visa') ||
      combined.includes('require sponsorship') ||
      combined.includes('need sponsorship')
    ) {
      const req = this.contract.workAuthorization.requiresSponsorship;
      const isSelectOrRadio = field.type === 'select' || field.type === 'radio';
      const val = isSelectOrRadio ? (req ? 'Yes' : 'No') : req;
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: val,
        source: 'contract_default',
      };
    }

    // 4. Compensation / Salary expectations (from Contract)
    if (
      combined.includes('salary') ||
      combined.includes('compensation') ||
      combined.includes('desired pay') ||
      combined.includes('expected salary')
    ) {
      const amount = this.contract.salaryFloor.amount;
      const val = field.type === 'number' ? amount : `${amount} ${this.contract.salaryFloor.currency}`;
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: val,
        source: 'contract_default',
      };
    }

    // 5. Total Years of Experience
    if (
      combined.includes('years of experience') ||
      combined.includes('total experience') ||
      combined.includes('experience in years')
    ) {
      const yoe = this.getCalculatedYearsOfExperience();
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: field.type === 'number' ? Math.floor(yoe) : String(Math.floor(yoe)),
        source: 'computed',
      };
    }

    // 6. Sprint Contract Default Answers Lookup
    // Checks configured default answers matching field key or label
    for (const [key, answerObj] of Object.entries(this.contract.defaultAnswers)) {
      const normKey = this.normalizeKey(key);
      if (
        combined.includes(normKey) ||
        normKey.includes(normName) ||
        (normLabel && normKey.includes(normLabel))
      ) {
        return {
          fieldId: field.id,
          fieldName: field.name,
          value: answerObj.answer,
          source: 'contract_default',
          confirmedFactId: answerObj.confirmedFactIds[0],
        };
      }
    }

    // 7. If field is not recognized and not required, it can be safely skipped or left blank.
    if (!field.required) {
      return {
        fieldId: field.id,
        fieldName: field.name,
        value: '',
        source: 'computed',
      };
    }

    // 8. If required field is unrecognized with no contract default:
    // HARD CONSTRAINT: Unknown or sensitive questions: use Sprint Contract defaults; if none exist, skip the job (never block on a human).
    return {
      fieldId: field.id,
      fieldName: field.name,
      label: field.label,
      required: true,
      reason: 'missing_default_answer',
    };
  }

  /**
   * Resolves all fields in an ATS application form.
   * Returns canSubmit = false and skipReason if any required field is unanswerable.
   */
  public resolveApplicationForm(fields: FormField[]): FormResolutionResult {
    const answers: Record<string, string | boolean | number> = {};
    const resolvedFields: ResolvedFieldAnswer[] = [];
    const unanswerableRequiredFields: UnanswerableField[] = [];

    for (const field of fields) {
      const res = this.resolveField(field);
      if ('reason' in res) {
        if (field.required) {
          unanswerableRequiredFields.push(res);
        }
      } else {
        answers[field.name || field.id] = res.value;
        resolvedFields.push(res);
      }
    }

    if (unanswerableRequiredFields.length > 0) {
      const missingLabels = unanswerableRequiredFields.map((f) => `"${f.label || f.fieldName}"`).join(', ');
      return {
        canSubmit: false,
        answers,
        resolvedFields,
        unanswerableRequiredFields,
        skipReason: `Missing Sprint Contract default answers for required fields: ${missingLabels}`,
      };
    }

    return {
      canSubmit: true,
      answers,
      resolvedFields,
      unanswerableRequiredFields: [],
    };
  }
}
