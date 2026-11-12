import { BaseAtsApplyAdapter } from './base-adapter';
import type { FormField } from '../answer-bank';

export class GreenhouseApplyAdapter extends BaseAtsApplyAdapter {
  readonly id = 'apply-adapter-greenhouse';
  readonly platform = 'greenhouse' as const;

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('greenhouse.io') || lower.includes('boards.greenhouse.io');
  }

  getStandardFields(): FormField[] {
    return [
      { id: 'first_name', name: 'first_name', label: 'First Name', type: 'text', required: true },
      { id: 'last_name', name: 'last_name', label: 'Last Name', type: 'text', required: true },
      { id: 'email', name: 'email', label: 'Email', type: 'email', required: true },
      { id: 'phone', name: 'phone', label: 'Phone', type: 'phone', required: false },
      { id: 'resume', name: 'resume', label: 'Resume/CV', type: 'file', required: true },
      { id: 'cover_letter', name: 'cover_letter', label: 'Cover Letter', type: 'textarea', required: false },
      { id: 'urls[LinkedIn]', name: 'urls[LinkedIn]', label: 'LinkedIn Profile', type: 'text', required: false },
      { id: 'urls[GitHub]', name: 'urls[GitHub]', label: 'GitHub Profile', type: 'text', required: false },
      { id: 'urls[Portfolio]', name: 'urls[Portfolio]', label: 'Website / Portfolio', type: 'text', required: false },
    ];
  }

  formatPayload(
    answers: Record<string, string | boolean | number>,
    attachments?: { resumeUrl?: string; coverLetterText?: string }
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      first_name: answers['first_name'] || answers['firstName'] || '',
      last_name: answers['last_name'] || answers['lastName'] || '',
      email: answers['email'] || '',
      phone: answers['phone'] || answers['phoneNumber'] || '',
      resume_url: attachments?.resumeUrl,
      cover_letter_text: attachments?.coverLetterText,
      urls: {
        LinkedIn: answers['urls[LinkedIn]'] || answers['linkedin'] || answers['linkedinUrl'],
        GitHub: answers['urls[GitHub]'] || answers['github'] || answers['githubUrl'],
        Portfolio: answers['urls[Portfolio]'] || answers['portfolio'] || answers['portfolioUrl'],
      },
    };

    // Include custom answers
    for (const [key, value] of Object.entries(answers)) {
      if (!payload[key] && !key.startsWith('urls[')) {
        payload[key] = value;
      }
    }

    return payload;
  }
}

