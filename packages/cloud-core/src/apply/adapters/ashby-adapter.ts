import { BaseAtsApplyAdapter } from './base-adapter';
import type { FormField } from '../answer-bank';

export class AshbyApplyAdapter extends BaseAtsApplyAdapter {
  readonly id = 'apply-adapter-ashby';
  readonly platform = 'ashby' as const;

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('ashbyhq.com') || url.toLowerCase().includes('jobs.ashbyhq.com');
  }

  getStandardFields(): FormField[] {
    return [
      { id: 'name', name: 'name', label: 'Name', type: 'text', required: true },
      { id: 'email', name: 'email', label: 'Email', type: 'email', required: true },
      { id: 'phoneNumber', name: 'phoneNumber', label: 'Phone Number', type: 'phone', required: false },
      { id: 'resume', name: 'resume', label: 'Resume', type: 'file', required: true },
      { id: 'linkedinUrl', name: 'linkedinUrl', label: 'LinkedIn', type: 'text', required: false },
      { id: 'githubUrl', name: 'githubUrl', label: 'GitHub', type: 'text', required: false },
      { id: 'websiteUrl', name: 'websiteUrl', label: 'Personal Website', type: 'text', required: false },
      { id: 'coverLetter', name: 'coverLetter', label: 'Cover Letter', type: 'textarea', required: false },
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
      phoneNumber: answers['phoneNumber'] || answers['phone'] || '',
      resumeUrl: attachments?.resumeUrl,
      coverLetter: attachments?.coverLetterText || answers['coverLetter'] || '',
      linkedinUrl: answers['linkedinUrl'] || answers['linkedin'] || '',
      githubUrl: answers['githubUrl'] || answers['github'] || '',
      websiteUrl: answers['websiteUrl'] || answers['portfolio'] || '',
    };
  }
}
