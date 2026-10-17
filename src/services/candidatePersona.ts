/**
 * Candidate Persona & Context Alignment Service
 * Grounds interview assistant responses in the candidate resume and job description.
 */

export const DEFAULT_TARGET_ROLE = "Senior Cloud & DevOps Engineer";

export const DEFAULT_RESUME = `Abhishek Singh
Senior DevOps & Cloud Infrastructure Engineer
Email: abhishek@example.com | GitHub: github.com/Abhitvg | LinkedIn: linkedin.com/in/abhishek

SUMMARY:
Results-driven Senior DevOps & Cloud Engineer with 6+ years of experience designing, automating, and scaling mission-critical cloud infrastructure on AWS. Expert in Kubernetes, Docker containerization, AWS CodePipeline, Terraform infrastructure-as-code, and distributed microservices architecture. Proven track record of reducing deployment cycles from days to minutes and maintaining 99.99% system availability.

PROFESSIONAL EXPERIENCE:
Senior DevOps Engineer | CloudScale Systems (2022 - Present)
- Architected enterprise CI/CD pipelines using AWS CodePipeline, CodeBuild, and CodeDeploy, cutting deployment failure rates by 65% and reducing deployment time from 45 minutes to 7 minutes.
- Designed and managed production Kubernetes (EKS) clusters hosting 80+ microservices with automated Horizontal Pod Autoscaling (HPA) and Karpenter node provisioning.
- Implemented Infrastructure as Code using Terraform and CloudFormation to automate provisioning of multi-region VPCs, RDS Aurora clusters, DynamoDB, and Redis caches.
- Led migration of monolithic application into Dockerized microservices on AWS ECS/Fargate, cutting cloud infrastructure costs by 32% ($45k/year).
- Established end-to-end observability using Prometheus, Grafana, and AWS CloudWatch with automated alerting and incident escalation policies.

Cloud Engineer | TechNova Solutions (2019 - 2022)
- Built automated release pipelines using Jenkins, GitHub Actions, and AWS CodePipeline for high-traffic Node.js and Python microservices.
- Automated server provisioning and configuration using Ansible and Docker, eliminating configuration drift across staging and production environments.
- Enforced zero-trust security architecture with AWS IAM least-privilege roles, KMS encryption at rest and in transit, and secret management via AWS Secrets Manager.
- Collaborated with software engineering teams to resolve complex production incidents, reducing Mean Time to Recovery (MTTR) by 45%.

TECHNICAL SKILLS:
- Cloud: AWS (EC2, S3, CodePipeline, CodeBuild, CodeDeploy, ECS, EKS, Lambda, RDS, DynamoDB, VPC, CloudFront, Route53, IAM)
- Containers & Orchestration: Docker, Kubernetes, Helm, EKS, ECS, Containerd
- CI/CD & Automation: AWS CodePipeline, GitHub Actions, Jenkins, GitLab CI, ArgoCD
- Infrastructure as Code: Terraform, AWS CloudFormation, Ansible
- Monitoring & Logging: Prometheus, Grafana, CloudWatch, Datadog, ELK Stack
- Programming & Scripting: TypeScript, JavaScript, Python, Bash, Go, SQL
- Networking & Security: TCP/IP, DNS, SSL/TLS, OAuth2, JWT, VPC Peering, Transit Gateway

EDUCATION:
Bachelor of Technology in Computer Science & Engineering`;

export const DEFAULT_JOB_DESCRIPTION = `Job Title: Senior Cloud & DevOps Engineer
Company: Global Enterprise Cloud Solutions
Location: Remote / Hybrid

ABOUT THE ROLE:
We are looking for a Senior DevOps & Cloud Engineer to join our infrastructure platform team. You will lead the design, implementation, and optimization of our AWS cloud platform, automated CI/CD release pipelines, and containerized Kubernetes environments.

KEY RESPONSIBILITIES:
- Architect and maintain highly scalable, fault-tolerant cloud infrastructure on AWS.
- Build and optimize CI/CD automation pipelines using AWS CodePipeline, GitHub Actions, and modern continuous delivery tools.
- Manage and scale containerized workloads using Kubernetes (EKS) and Docker.
- Write robust, reusable Infrastructure as Code (Terraform / CloudFormation).
- Collaborate with engineering teams to ensure high reliability, performance, security, and low-latency response times.
- Participate in on-call rotations and lead root cause analysis for production incidents.

REQUIRED QUALIFICATIONS:
- 5+ years of hands-on experience with AWS cloud services (EC2, EKS, CodePipeline, Lambda, RDS, VPC).
- Deep expertise in Kubernetes cluster management, containerization, and microservices architecture.
- Extensive experience designing CI/CD pipelines (AWS CodePipeline, Jenkins, or GitHub Actions).
- Strong proficiency in Terraform for Infrastructure as Code.
- Solid background in scripting with Python, Bash, or TypeScript/Go.
- Strong understanding of cloud security, networking protocols, and zero-downtime deployment strategies.`;

const COMMON_TECH_SKILLS = [
  "AWS", "Kubernetes", "Docker", "CodePipeline", "CI/CD", "Terraform",
  "Ansible", "CloudFormation", "EKS", "ECS", "Lambda", "EC2", "S3",
  "RDS", "DynamoDB", "Prometheus", "Grafana", "CloudWatch", "Datadog",
  "Linux", "Bash", "Python", "TypeScript", "JavaScript", "Go", "Java",
  "Node.js", "React", "Next.js", "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "Git", "GitHub Actions", "Jenkins", "GitLab CI", "ArgoCD", "Helm",
  "Microservices", "REST API", "GraphQL", "gRPC", "Kafka", "RabbitMQ",
  "Zero Trust", "IAM", "KMS", "SSL/TLS", "TCP/IP", "DNS", "VPC"
];

export function analyzeAlignment(resumeText: string, jobDescriptionText: string): {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
} {
  const resumeLower = (resumeText || "").toLowerCase();
  const jdLower = (jobDescriptionText || "").toLowerCase();

  const jdRequiredSkills = COMMON_TECH_SKILLS.filter(skill =>
    jdLower.includes(skill.toLowerCase())
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const skill of jdRequiredSkills) {
    if (resumeLower.includes(skill.toLowerCase())) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const score = jdRequiredSkills.length > 0
    ? Math.round((matchedSkills.length / jdRequiredSkills.length) * 100)
    : 85;

  return { score, matchedSkills, missingSkills };
}

export function buildCandidateSystemPrompt(
  resumeText: string,
  jobDescriptionText: string,
  targetRole: string,
  preferredLanguage: string = "JavaScript"
): string {
  const resume = (resumeText || "").trim() || DEFAULT_RESUME;
  const jd = (jobDescriptionText || "").trim() || DEFAULT_JOB_DESCRIPTION;
  const role = (targetRole || "").trim() || DEFAULT_TARGET_ROLE;

  return `You are an elite, highly articulate software and DevOps engineer acting as the candidate in a live interview for the role of "${role}".
You are speaking directly to the interviewer in the FIRST PERSON ("I", "in my recent project", "at my previous company", "my approach").
NEVER say "As an AI", "The candidate should say", or break character under any circumstances.

════════════ CANDIDATE RESUME / BACKGROUND ════════════
${resume}

════════════ TARGET JOB DESCRIPTION / REQUIREMENTS ════════════
${jd}

════════════ MANDATORY TELEPROMPTER DELIVERY RULES ════════════
1. FIRST-PERSON EXPERT DELIVERY:
   - Answer directly and authoritatively as the candidate.
   - For behavioral or background questions ("Tell me about yourself", "Walk me through your experience", "Why this company?"), directly cite your real companies, projects, and metrics from your resume.
   - Emphasize and mirror the specific tools, workflows, and responsibilities highlighted in the target job description.

2. TELEPROMPTER READABILITY:
   - Your response is displayed on a translucent teleprompter overlay right under the webcam for the candidate to read smoothly in real-time.
   - Use clean, conversational English sentences (10 to 22 words per sentence).
   - Aim for a concise, impactful verbal response (around 45 to 85 words total unless explaining a deep architecture or coding problem).
   - Do NOT use markdown headers (# or ##), do NOT use raw ASCII tables, and avoid bullet-point clutter. Use natural narrative transitions.

3. FOR CODING OR SYSTEM DESIGN QUESTIONS:
   - If asked for code, provide a brief, clean solution in ${preferredLanguage} inside a single markdown code block, preceded by a one-sentence problem breakdown and followed by the Big-O Time & Space complexity.
   - If asked for System Design, outline the high-level architecture, primary components, scaling strategy, and key trade-offs in direct spoken terms.`;
}
