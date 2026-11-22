export interface RoleInterviewProfile {
  isCloudPlatformRole: boolean;
  companyName: string | null;
  experienceBand: 'early-career' | 'unspecified';
  focusAreas: string[];
}

const ROLE_FOCUS_AREAS: Array<{ label: string; pattern: RegExp; guidance: string }> = [
  {
    label: 'Java and Spring Boot',
    pattern: /\bjava\b|\bspring(?:\s+boot)?\b/i,
    guidance:
      'Java fundamentals, object-oriented design, dependency injection, Spring Boot REST controllers, validation, exception handling, transaction boundaries, and maintainable service layering.',
  },
  {
    label: 'Microservices and APIs',
    pattern: /\bmicroservices?\b|\brest(?:ful)? apis?\b|\bapi development\b/i,
    guidance:
      'Service boundaries, API contracts and versioning, idempotency, timeouts, retries, circuit breakers, data consistency, and backward compatibility.',
  },
  {
    label: 'AWS and cloud platform',
    pattern: /\baws\b|\biaas\b|\bcloud technology\b|\bcloud infrastructure\b/i,
    guidance:
      'AWS identity and least-privilege access, network boundaries, compute/container choices, fault isolation, logs, metrics, traces, and cost-aware operations.',
  },
  {
    label: 'Terraform and infrastructure as code',
    pattern: /\bterraform\b|\binfrastructure as code\b|\biac\b/i,
    guidance:
      'Reusable modules, explicit variables and outputs, provider version pinning, remote state and locking, plan review, drift detection, safe apply boundaries, and rollback or recovery planning.',
  },
  {
    label: 'CI/CD and Jenkins',
    pattern: /\bci\s*\/\s*cd\b|\bjenkins\b|\bcontinuous integration\b|\bcontinuous delivery\b/i,
    guidance:
      'A staged pipeline covering build, unit and integration tests, static/security checks, immutable artifacts, environment promotion, deployment health checks, and rollback.',
  },
  {
    label: 'Docker and Kubernetes',
    pattern: /\bdocker\b|\bkubernetes\b|\bk8s\b/i,
    guidance:
      'Container image hygiene, non-root execution, Kubernetes Deployments and Services, readiness/liveness probes, resource requests and limits, configuration/secrets, rolling updates, and recovery.',
  },
  {
    label: 'Testing and SDLC',
    pattern: /\bunit tests?\b|\bintegration tests?\b|\bautomated tests?\b|\bsdlc\b|\bagile\b/i,
    guidance:
      'Tests at service and integration boundaries, deterministic CI gates, regression coverage, reviewable changes, release safety, and short feedback loops.',
  },
  {
    label: 'Reliability and SLAs',
    pattern: /\bsla\b|\bservice level\b|\bdefects?\b|\bavailability\b|\bproduction support\b/i,
    guidance:
      'Prioritise customer impact, reproduce and isolate the fault, mitigate safely, identify root cause, verify recovery, and add monitoring or regression protection.',
  },
];

export function buildRoleInterviewProfile(
  targetRole: string,
  jobDescriptionText: string
): RoleInterviewProfile {
  const context = (targetRole || '') + '\n' + (jobDescriptionText || '');
  const focusAreas = ROLE_FOCUS_AREAS.filter((area) => area.pattern.test(context)).map(
    (area) => area.label
  );
  const explicitPlatformRole =
    /\b(devops|platform engineer|cloud engineer|site reliability|sre|infrastructure engineer|iaas)\b/i.test(
      context
    );
  const isCloudPlatformRole =
    explicitPlatformRole ||
    focusAreas.length >= 3 ||
    focusAreas.some((area) =>
      [
        'Terraform and infrastructure as code',
        'CI/CD and Jenkins',
        'Docker and Kubernetes',
      ].includes(area)
    );

  const experienceBand =
    /\b1\s*(?:-|–|to)\s*2\s*years?\b/i.test(context) ||
    /\b(?:one|1)\s+to\s+(?:two|2)\s+years?\b/i.test(context)
      ? 'early-career'
      : 'unspecified';

  return {
    isCloudPlatformRole,
    companyName: /\bsophos\b/i.test(context) ? 'Sophos' : null,
    experienceBand,
    focusAreas,
  };
}

export function buildRoleInterviewContextSection(
  targetRole: string,
  jobDescriptionText: string
): string {
  const profile = buildRoleInterviewProfile(targetRole, jobDescriptionText);
  if (!profile.isCloudPlatformRole) return '';

  const context = (targetRole || '') + '\n' + (jobDescriptionText || '');
  const guidance = ROLE_FOCUS_AREAS.filter((area) => area.pattern.test(context))
    .map((area) => '- ' + area.label + ': ' + area.guidance)
    .join('\n');

  const companyLine = profile.companyName
    ? 'The supplied posting names Sophos. Do not infer proprietary internal tools, architecture, interview questions, or team practices that the posting does not state.'
    : 'Do not infer proprietary company tools, architecture, interview questions, or team practices from a generic job description.';

  const experienceLine =
    profile.experienceBand === 'early-career'
      ? 'The posting specifies 1–2 years of experience. Calibrate answers to an early-career engineer: strong fundamentals, clear ownership of scoped tasks, testing discipline, and willingness to learn. Do not inflate seniority.'
      : 'Calibrate seniority to the evidence in the candidate profile and the actual scope of the posting.';

  return [
    '',
    '════════════ ROLE-SPECIFIC INTERVIEW CONTEXT ════════════',
    'Target role: ' + (targetRole || 'Software Engineer'),
    'Role track: Cloud platform / DevOps-oriented software engineering',
    'Priority areas detected in the full job description: ' +
      (profile.focusAreas.join(', ') || 'cloud platform engineering') +
      '.',
    experienceLine,
    companyLine,
    '',
    'TECHNICAL LENSES TO APPLY WHEN RELEVANT:',
    guidance,
    '',
    'ANSWER SELECTION RULES:',
    '- Answer the exact question first; do not force every technology into every answer.',
    '- For Java/backend questions, explain the mechanism and the practical API or service boundary before naming tools.',
    '- For Terraform and CI/CD questions, distinguish validation/plan from apply, and explain tests, approvals, artifact promotion, failure handling, and rollback.',
    '- For AWS/container questions, include least privilege, network boundaries, health checks, resource limits, observability, and safe deployment where relevant.',
    '- For incident/SLA questions, use impact → triage → mitigation → root cause → verification → prevention.',
    '- Use a real candidate project only when the resume or candidate knowledge base supports the specific claim. Distinguish “I implemented” from “I would implement.”',
    '- If direct hands-on experience with a required tool is not evidenced, do not pretend otherwise. Briefly connect a verified adjacent skill, then explain a credible implementation approach.',
    '- Prefer a clear 45–90 second spoken answer with one concrete example and one meaningful trade-off. Avoid dumping service names or reciting the job description.',
    '',
  ].join('\n');
}
