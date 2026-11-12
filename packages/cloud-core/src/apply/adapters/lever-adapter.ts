import { BaseAtsApplyAdapter } from './base-adapter';
import type { FormField } from '../answer-bank';

export class LeverApplyAdapter extends BaseAtsApplyAdapter {
  readonly id = 'apply-adapter-lever';
  readonly platform = 'lever' as const;

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('jobs.lever.co') || url.toLowerCase().includes('lever.co');
  }

  getStandardFields(): FormField[] {
    return [
      { id: 'name', name: 'name', label: 'Full Name', type: 'text', required: true },
      { id: 'email', name: 'email', label: 'Email', type: 'email', required: true },
      { id: 'phone', name: 'phone', label: 'Phone', type: 'phone', required: false },
      { id: 'org', name: 'org', label: 'Current Company', type: 'text', required: false },
      { id: 'resume', name: 'resume', label: 'Resume', type: 'file', required: true },
      { id: 'urls[LinkedIn]', name: 'urls[LinkedIn]', label: 'LinkedIn Profile', type: 'text', required: false },
      { id: 'urls[GitHub]', name: 'urls[GitHub]', label: 'GitHub Profile', type: 'text', required: false },
      { id: 'urls[Portfolio]', name: 'urls[Portfolio]', label: 'Portfolio Website', type: 'text', required: false },
      { id: 'comments', name: 'comments', label: 'Additional Information', type: 'textarea', required: false },
    ];
  }

  formatPayload(
    answers: Record<string, string | boolean | number>,
    attachments?: { resumeUrl?: string; coverLetterText?: string }
  ): Record<string, unknown> {
    const fullName = answers['name'] || `${answers['first_name'] || ''} ${answers['last_name'] || ''}`.trim();
    return {
      name: fullName,
      email: answers['email'] || '',
      phone: answers['phone'] || '',
      org: answers['org'] || answers['current_company'] || '',
      resume_url: attachments?.resumeUrl,
      comments: attachments?.coverLetterText || answers['comments'] || '',
      urls: {
        LinkedIn: answers['urls[LinkedIn]'] || answers['linkedin'],
        GitHub: answers['urls[GitHub]'] || answers['github'],
        Portfolio: answers['urls[Portfolio]'] || answers['portfolio'],
      },
    };
  }
}
