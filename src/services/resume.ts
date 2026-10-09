/**
 * Resume Parsing Service
 * Extracts structured data from resume files
 */

import { ResumeContext } from '../types';

/**
 * Parse resume text into structured context
 */
export function parseResumeText(text: string): ResumeContext {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  const context: ResumeContext = {
    raw: text,
    projects: [],
    skills: [],
    education: [],
    experience: [],
    technologies: [],
    achievements: [],
  };

  let currentSection = '';

  const sectionPatterns: Record<string, RegExp> = {
    projects: /^(projects?|personal projects?|side projects?|portfolio)/i,
    skills: /^(skills?|technical skills?|core competenc|proficienc)/i,
    education: /^(education|academic|degree|universit|college|school)/i,
    experience: /^(experience|work experience|employment|professional experience|work history)/i,
    technologies: /^(technologies|tech stack|tools|frameworks|languages)/i,
    achievements: /^(achievements?|awards?|certifications?|accomplishments?|honors?)/i,
  };

  for (const line of lines) {
    // Check if this line starts a new section
    let foundSection = false;
    for (const [section, pattern] of Object.entries(sectionPatterns)) {
      if (pattern.test(line)) {
        currentSection = section;
        foundSection = true;
        break;
      }
    }

    if (foundSection) continue;

    // Add content to current section
    if (currentSection && line.length > 2) {
      const cleanLine = line.replace(/^[-•*▪◦→►|]+\s*/, '').trim();
      if (cleanLine && currentSection in context) {
        (context[currentSection as keyof ResumeContext] as string[]).push(cleanLine);
      }
    }
  }

  // Extract technologies from the entire text
  const techKeywords = [
    'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Next.js', 'TypeScript',
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby',
    'Swift', 'Kotlin', 'PHP', 'Dart', 'Flutter', 'React Native',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'DynamoDB', 'Firebase',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Terraform',
    'Git', 'GitHub', 'GitLab', 'CI/CD', 'Agile', 'Scrum',
    'REST', 'GraphQL', 'gRPC', 'WebSocket', 'Kafka', 'RabbitMQ',
    'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy',
    'Spring Boot', 'Hibernate', 'Django', 'Flask', 'FastAPI',
    'HTML', 'CSS', 'SASS', 'Tailwind', 'Bootstrap',
    'Linux', 'Unix', 'Bash', 'PowerShell',
    'SQL', 'NoSQL', 'Elasticsearch', 'Cassandra',
    'OAuth', 'JWT', 'HTTPS', 'SSL', 'TLS',
    'Webpack', 'Vite', 'Babel', 'ESLint',
    'Jest', 'Mocha', 'Cypress', 'Selenium',
    'Figma', 'Sketch', 'Adobe XD',
    'Jira', 'Confluence', 'Notion', 'Slack',
  ];

  const lowerText = text.toLowerCase();
  context.technologies = techKeywords.filter(tech => 
    lowerText.includes(tech.toLowerCase())
  );

  return context;
}

/**
 * Read and parse a resume file
 * Handles PDF, DOCX, TXT, and MD formats
 */
export async function loadResume(filePath: string): Promise<ResumeContext> {
  const extension = filePath.split('.').pop()?.toLowerCase();

  let text = '';

  switch (extension) {
    case 'txt':
    case 'md': {
      const buffer = await window.electronAPI.readFile(filePath);
      text = new TextDecoder().decode(buffer);
      break;
    }
    case 'pdf': {
      // PDF parsing happens in the main process
      const buffer = await window.electronAPI.readFile(filePath);
      text = await extractPdfText(buffer);
      break;
    }
    case 'docx': {
      const buffer = await window.electronAPI.readFile(filePath);
      text = await extractDocxText(buffer);
      break;
    }
    default:
      throw new Error(`Unsupported file format: .${extension}. Supported: PDF, DOCX, TXT, MD`);
  }

  if (!text.trim()) {
    throw new Error('Resume file appears to be empty or could not be parsed.');
  }

  return parseResumeText(text);
}

/**
 * Extract text from PDF buffer (basic extraction)
 */
async function extractPdfText(buffer: Buffer | ArrayBuffer): Promise<string> {
  // In browser context, we do basic text extraction
  // For proper PDF parsing, the main process handles it
  try {
    const uint8 = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
    
    // Try to extract readable text from PDF
    const textParts: string[] = [];
    const streamRegex = /stream\s*([\s\S]*?)endstream/g;
    let match;
    
    while ((match = streamRegex.exec(text)) !== null) {
      const content = match[1];
      // Extract text between parentheses (PDF text objects)
      const textRegex = /\(([^)]*)\)/g;
      let textMatch;
      while ((textMatch = textRegex.exec(content)) !== null) {
        const decoded = textMatch[1].replace(/\\n/g, '\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
        if (decoded.length > 1) {
          textParts.push(decoded);
        }
      }
    }

    return textParts.join(' ').replace(/\s+/g, ' ').trim() || 
      'PDF parsing limited in browser. Please use TXT or MD format for best results.';
  } catch {
    return 'Could not parse PDF. Please try TXT or MD format.';
  }
}

/**
 * Extract text from DOCX buffer (basic extraction)
 */
async function extractDocxText(buffer: Buffer | ArrayBuffer): Promise<string> {
  try {
    // Basic XML extraction from DOCX
    const uint8 = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
    
    // DOCX files are ZIP archives containing XML
    // In a full implementation, we'd use JSZip + xml parsing
    // For now, extract any readable text
    const textParts: string[] = [];
    const textRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
    let match;
    
    while ((match = textRegex.exec(text)) !== null) {
      textParts.push(match[1]);
    }

    return textParts.join(' ').trim() || 
      'DOCX parsing limited. Please use TXT or MD format for best results.';
  } catch {
    return 'Could not parse DOCX. Please try TXT or MD format.';
  }
}
