import { BaseAtsApplyAdapter } from './base-adapter';
import type { FormField } from '../answer-bank';

export class WorkableApplyAdapter extends BaseAtsApplyAdapter {
  readonly id = 'apply-adapter-workable';
  readonly platform = 'workable' as const;

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('workable.com') || url.toLowerCase().includes('apply.workable.com');
  }

  getStandardFields(): FormField[] {
    return [
      { id: 'firstname', name: 'firstname', label: 'First Name', type: 'text', required: true },
      { id: 'lastname', name: 'lastname', label: 'Last Name', type: 'text', required: true },
      { id: 'email', name: 'email', label: 'Email', type: 'email', required: true },
      { id: 'phone', name: 'phone', label: 'Phone', type: 'phone', required: false },
      { id: 'address', name: 'address', label: 'Address / Location', type: 'text', required: false },
      { id: 'resume', name: 'resume', label: 'Resume', type: 'file', required: true },
      { id: 'summary', name: 'summary', label: 'Summary', type: 'textarea', required: false },
      { id: 'cover_letter', name: 'cover_letter', label: 'Cover Letter', type: 'textarea', required: false },
    ];
  }

  formatPayload(
    answers: Record<string, string | boolean | number>,
    attachments?: { resumeUrl?: string; coverLetterText?: string }
  ): Record<string, unknown> {
    return {
      firstname: answers['firstname'] || answers['first_name'] || '',
      lastname: answers['lastname'] || answers['last_name'] || '',
      email: answers['email'] || '',
      phone: answers['phone'] || '',
      address: answers['address'] || answers['location'] || '',
      resume: attachments?.resumeUrl,
      summary: answers['summary'] || '',
      cover_letter: attachments?.coverLetterText || answers['cover_letter'] || '',
    };
  }
}

