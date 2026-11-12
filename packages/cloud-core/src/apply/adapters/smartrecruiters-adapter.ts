import { BaseAtsApplyAdapter } from './base-adapter';
import type { FormField } from '../answer-bank';

export class SmartRecruitersApplyAdapter extends BaseAtsApplyAdapter {
  readonly id = 'apply-adapter-smartrecruiters';
  readonly platform = 'smartrecruiters' as const;

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('smartrecruiters.com') || url.toLowerCase().includes('jobs.smartrecruiters.com');
  }

  getStandardFields(): FormField[] {
    return [
      { id: 'firstName', name: 'firstName', label: 'First Name', type: 'text', required: true },
      { id: 'lastName', name: 'lastName', label: 'Last Name', type: 'text', required: true },
      { id: 'email', name: 'email', label: 'Email Address', type: 'email', required: true },
      { id: 'phoneNumber', name: 'phoneNumber', label: 'Phone Number', type: 'phone', required: false },
      { id: 'location', name: 'location', label: 'City, State/Country', type: 'text', required: false },
      { id: 'resume', name: 'resume', label: 'Resume', type: 'file', required: true },
      { id: 'messageToHiringManager', name: 'messageToHiringManager', label: 'Message to Hiring Manager', type: 'textarea', required: false },
    ];
  }

  formatPayload(
    answers: Record<string, string | boolean | number>,
    attachments?: { resumeUrl?: string; coverLetterText?: string }
  ): Record<string, unknown> {
    return {
      firstName: answers['firstName'] || answers['first_name'] || '',
      lastName: answers['lastName'] || answers['last_name'] || '',
      email: answers['email'] || '',
      phoneNumber: answers['phoneNumber'] || answers['phone'] || '',
      location: answers['location'] || '',
      resume: attachments?.resumeUrl,
      messageToHiringManager: attachments?.coverLetterText || answers['messageToHiringManager'] || '',
    };
  }
}

