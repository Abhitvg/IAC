import { z } from 'zod';

const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const ProfileFactPayloadSchema = z
  .object({
    headline: boundedString(200),
    summary: boundedString(4000),
    location: boundedString(120),
    workAuthorization: z
      .object({
        countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(20),
        requiresSponsorship: z.boolean(),
      })
      .optional(),
  })
  .strict();

export const ExperienceFactPayloadSchema = z
  .object({
    company: boundedString(160),
    role: boundedString(160),
    location: boundedString(120).optional(),
    startDate: boundedString(30), // YYYY, YYYY-MM, or formatted date
    endDate: boundedString(30).nullable(), // null indicates current
    isCurrent: z.boolean(),
    achievements: z.array(boundedString(1000)).max(30),
    technologies: z.array(boundedString(60)).max(50),
  })
  .strict();

export const EducationFactPayloadSchema = z
  .object({
    institution: boundedString(200),
    degree: boundedString(160),
    fieldOfStudy: boundedString(160).optional(),
    startDate: boundedString(30).optional(),
    endDate: boundedString(30),
    grade: boundedString(40).optional(),
  })
  .strict();

export const SkillFactPayloadSchema = z
  .object({
    name: boundedString(80),
    category: z.enum([
      'language',
      'framework',
      'database',
      'tool',
      'cloud',
      'architecture',
      'methodology',
      'soft_skill',
      'other',
    ]),
    yearsOfExperience: z.number().nonnegative().max(50).nullable().optional(),
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable().optional(),
  })
  .strict();

export const ProjectFactPayloadSchema = z
  .object({
    name: boundedString(160),
    description: boundedString(2000),
    role: boundedString(120).optional(),
    technologies: z.array(boundedString(60)).max(50),
    url: boundedString(500).optional(),
    repositoryUrl: boundedString(500).optional(),
    metrics: boundedString(500).optional(),
  })
  .strict();

export const CertificationFactPayloadSchema = z
  .object({
    name: boundedString(200),
    issuer: boundedString(160),
    issueDate: boundedString(30),
    expiryDate: boundedString(30).nullable().optional(),
    credentialId: boundedString(120).optional(),
    credentialUrl: boundedString(500).optional(),
  })
  .strict();

export type ProfileFactPayload = z.infer<typeof ProfileFactPayloadSchema>;
export type ExperienceFactPayload = z.infer<typeof ExperienceFactPayloadSchema>;
export type EducationFactPayload = z.infer<typeof EducationFactPayloadSchema>;
export type SkillFactPayload = z.infer<typeof SkillFactPayloadSchema>;
export type ProjectFactPayload = z.infer<typeof ProjectFactPayloadSchema>;
export type CertificationFactPayload = z.infer<typeof CertificationFactPayloadSchema>;

export type AnyFactPayload =
  | { type: 'profile'; payload: ProfileFactPayload }
  | { type: 'experience'; payload: ExperienceFactPayload }
  | { type: 'education'; payload: EducationFactPayload }
  | { type: 'skill'; payload: SkillFactPayload }
  | { type: 'project'; payload: ProjectFactPayload }
  | { type: 'certification'; payload: CertificationFactPayload };

/**
 * Candidate fact produced by importers before user confirmation and KMS envelope encryption.
 */
export interface CandidateFact {
  factKey: string;
  category: 'profile' | 'experience' | 'education' | 'skill' | 'project' | 'certification';
  payload: AnyFactPayload['payload'];
  source: {
    kind: 'user_input' | 'document' | 'integration' | 'import';
    reference?: string;
    evidenceSha256?: string;
  };
  suggestedConfidence: number; // 0.0 to 1.0
}
