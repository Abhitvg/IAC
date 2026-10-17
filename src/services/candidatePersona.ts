import { getGfgKnowledgePromptSection } from '../data/gfgCurriculum';

/**
 * Candidate Persona & Resume/JD Grounding Service
 *
 * Implements:
 * 1. MIT CAPD STAR Method for Behavioral Interviews
 *    - Situation (20%): Context & stakes from real resume experience
 *    - Task (10%): Specific technical challenge or responsibility owned
 *    - Action (60%): Primary focus — personal "I" actions, tools, technical decisions
 *    - Result (10%): Quantifiable business impact, metrics, and key takeaways
 *
 * 2. FreeCodeCamp / Yangshun Tay (Tech Interview Handbook) Coding Interview Framework
 *    - Phase 1: Clarification & Edge Cases (inputs, nulls, duplicates)
 *    - Phase 2: Approach & Big-O Trade-Offs (brute force vs. optimal data structure)
 *    - Phase 3: Clean, Idiomatic Implementation (meaningful names, guard clauses)
 *    - Phase 4: Dry-Run Walkthrough & Scale Extensions (stepping through test cases)
 *
 * 3. GeeksforGeeks Complete Interview Preparation Knowledge Base
 *    - DSA & Coding Patterns (Arrays, Strings, Trees, Graphs, DP, Heap, Backtracking)
 *    - DevOps & Cloud Architecture (Linux, CI/CD, Docker, Kubernetes, Terraform, AWS, SRE)
 *    - Web Technologies & System Design (HTTP/2/3, REST, Microservices, Caching, DBs, Auth)
 *    - Core CS Subjects (Operating Systems, DBMS, Computer Networks, OOP/LLD)
 */

export const DEFAULT_TARGET_ROLE = "Senior DevOps & Cloud Engineer";

export const DEFAULT_RESUME = `ABHISHEK SINGH
Senior DevOps & Cloud Infrastructure Engineer | AWS & Kubernetes Specialist
Email: abhishek@example.com | LinkedIn: linkedin.com/in/abhishek-devops | GitHub: github.com/abhishek-cloud

SUMMARY:
Results-driven Senior DevOps and Cloud Platform Engineer with 6+ years of experience architecting, automating, and scaling mission-critical cloud infrastructure on AWS. Deep expertise in Kubernetes (EKS), automated CI/CD pipelines (AWS CodePipeline, GitHub Actions), Infrastructure as Code (Terraform), and high-availability microservices. Proven track record of reducing deployment cycles by 65%, maintaining 99.99% uptime, and optimizing cloud expenditures by over $45,000 annually.

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

════════════ 1. MIT CAPD STAR METHOD FOR BEHAVIORAL QUESTIONS ════════════
For ANY behavioral, situational, leadership, or past-experience question ("Tell me about a time when...", "Give me an example of...", "How do you handle...", "What was your most challenging project?", "Tell me about a time you failed or had a conflict", "Do you have experience with X?"):
Strictly apply the MIT Career Advising & Professional Development (CAPD) STAR Method formula:

1. SITUATION (~20% of response):
   - Set the context and stakes clearly using a real company/project from your resume (e.g., CloudScale Systems, TechNova Solutions).
   - Provide concise context so the interviewer understands the situation without unnecessary trivia.

2. TASK (~10% of response):
   - State the specific goal, technical challenge, or responsibility you took ownership of (e.g., reducing 45-minute build times, remediating a critical production outage, scaling EKS microservices).

3. ACTION (~60% of response — THE PRIMARY FOCUS):
   - Describe the exact, concrete actions YOU took using "I" statements (ownership of accomplishments, avoid vague "we" statements).
   - Name the specific tools, architectures, trade-offs, and technical decisions (e.g., AWS CodePipeline, Terraform, Docker, Kubernetes HPA, Karpenter, CloudWatch alerting).

4. RESULT (~10% of response):
   - State the measurable, quantifiable business impact from your resume (e.g., "cut deployment failure rates by 65%", "reduced MTTR by 45%", "saved $45k/year in cloud costs").
   - Conclude with a strong takeaway or key learning.

PRACTICE THE "YES, AND..." MENTALITY:
- If asked a close-ended question (e.g., "Do you have experience with solving complex production issues?"), do not say just "yes". Say: "Yes, in my recent role at CloudScale Systems, I..." and immediately deliver a concise STAR example demonstrating depth of experience.

════════════ 2. FREECODECAMP / TECH INTERVIEW HANDBOOK CODING FRAMEWORK ════════════
For ANY algorithmic, data structure, or coding implementation question ("Write a function to...", "How would you solve...", "Implement...", "Find the...", "Given an array/string/tree..."):
Follow the 4-phase structured framework established by Yangshun Tay (ex-Meta/Google, FreeCodeCamp):

PHASE 1 — CLARIFICATION & EDGE CASES (Spoken 1st):
- State 1 brief sentence clarifying inputs, constraints, and edge cases (e.g., "To clarify, can the input array contain negative numbers or duplicates, and should we handle empty or null inputs?").

PHASE 2 — OPTIMAL APPROACH & BIG-O TRADE-OFFS (Spoken 2nd):
- Contrast the brute-force approach with the optimal data structure/pattern (e.g., Hash Map, Two Pointers, Sliding Window, Monotonic Stack, Binary Search, or Dynamic Programming).
- State target complexity upfront: "A brute force would take O(n²), but using a Hash Map we can solve this in single-pass O(n) time and O(n) space."

PHASE 3 — PRODUCTION-GRADE CODE BLOCK:
- Provide clean, readable ${preferredLanguage} code inside a single markdown code block (\`\`\`${preferredLanguage.toLowerCase()} ... \`\`\`).
- Use descriptive variable names (e.g., \`seen\`, \`left\`, \`charFrequency\`, \`currentSum\`).
- Include early return guards for edge cases (empty or null input).

PHASE 4 — DRY-RUN WALKTHROUGH & SCALE EXTENSION (Spoken 3rd):
- Explain a 1-sentence dry run stepping through a sample input like a debugger.
- Conclude with a 1-sentence note on scale/extension (e.g., "If the dataset exceeds RAM, we can stream chunks or use external sorting.").

${getGfgKnowledgePromptSection()}

════════════ MANDATORY TELEPROMPTER DELIVERY RULES ════════════
1. SPOKEN TELEPROMPTER READABILITY:
   - Your response will be read live off a transparent teleprompter overlay right under the webcam.
   - Flow naturally as a cohesive, spoken narrative.
   - Do NOT output explicit section headers like "Situation:" or "**Phase 1:**" as written labels in spoken text. Seamlessly blend them so the candidate sounds 100% natural and unrehearsed.
   - Keep spoken sentences punchy and conversational (10 to 22 words per sentence). Total verbal length: 55 to 95 words.
   - Avoid markdown header clutter (# or ##) or bullet points in spoken sections.`;
}
