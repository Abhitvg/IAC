import { BaseAtsApplyAdapter } from './base-adapter';
import type { FormField } from '../answer-bank';

export class WorkdayApplyAdapter extends BaseAtsApplyAdapter {
  readonly id = 'apply-adapter-workday';
  readonly platform = 'workday' as const;

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('myworkdayjobs.com') || url.toLowerCase().includes('workday.com');
  }

  getStandardFields(): FormField[] {
    return [
      { id: 'legalFirstName', name: 'legalFirstName', label: 'Legal First Name', type: 'text', required: true },
      { id: 'legalLastName', name: 'legalLastName', label: 'Legal Last Name', type: 'text', required: true },
      { id: 'email', name: 'email', label: 'Email Address', type: 'email', required: true },
      { id: 'phoneNumber', name: 'phoneNumber', label: 'Phone Number', type: 'phone', required: false },
      { id: 'resume', name: 'resume', label: 'Resume', type: 'file', required: true },
      { id: 'addressLine1', name: 'addressLine1', label: 'Address Line 1', type: 'text', required: false },
      { id: 'city', name: 'city', label: 'City', type: 'text', required: false },
    ];
  }

  formatPayload(
    answers: Record<string, string | boolean | number>,
    attachments?: { resumeUrl?: string; coverLetterText?: string }
  ): Record<string, unknown> {
    return {
      legalFirstName: answers['legalFirstName'] || answers['first_name'] || answers['firstName'] || '',
      legalLastName: answers['legalLastName'] || answers['last_name'] || answers['lastName'] || '',
      email: answers['email'] || '',
      phoneNumber: answers['phoneNumber'] || answers['phone'] || '',
      address: {
        line1: answers['addressLine1'] || answers['address'] || '',
        city: answers['city'] || answers['location'] || '',
      },
      resume: attachments?.resumeUrl,
      coverLetter: attachments?.coverLetterText,
    };
  }
}
