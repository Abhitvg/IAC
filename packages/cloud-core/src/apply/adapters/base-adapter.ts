import type { ApplyAdapter, JobPlatform } from '../../plugins';
import type { FormField } from '../answer-bank';

export interface AtsFormSchema {
  platform: JobPlatform;
  url: string;
  fields: FormField[];
  supportsDirectAutoApply: boolean;
  requiresUserLogin: boolean;
}

export abstract class BaseAtsApplyAdapter implements ApplyAdapter {
  abstract readonly id: string;
  abstract readonly platform: JobPlatform;

  abstract canHandle(url: string): boolean;

  abstract getStandardFields(): FormField[];

  abstract formatPayload(
    answers: Record<string, string | boolean | number>,
    attachments?: { resumeUrl?: string; coverLetterText?: string }
  ): Record<string, unknown>;
}
