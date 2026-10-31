/**
 * Resume Parsing Service
 * Extracts structured data from resume files
 */

import { ResumeContext } from '../types';

/**
 * Parse resume text into structured context
 */
export function parseResumeText(text: string): ResumeContext {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

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
    'React',
    'Angular',
    'Vue',
    'Node.js',
    'Express',
    'Next.js',
    'TypeScript',
    'JavaScript',
    'Python',
    'Java',
    'C++',
    'C#',
    'Go',
    'Rust',
    'Ruby',
    'Swift',
    'Kotlin',
    'PHP',
    'Dart',
    'Flutter',
    'React Native',
    'MongoDB',
    'PostgreSQL',
    'MySQL',
    'Redis',
    'DynamoDB',
    'Firebase',
    'AWS',
    'Azure',
    'GCP',
    'Docker',
    'Kubernetes',
    'Jenkins',
    'Terraform',
    'Git',
    'GitHub',
    'GitLab',
    'CI/CD',
    'Agile',
    'Scrum',
    'REST',
    'GraphQL',
    'gRPC',
    'WebSocket',
    'Kafka',
    'RabbitMQ',
    'TensorFlow',
    'PyTorch',
    'Scikit-learn',
    'Pandas',
    'NumPy',
    'Spring Boot',
    'Hibernate',
    'Django',
    'Flask',
    'FastAPI',
    'HTML',
    'CSS',
    'SASS',
    'Tailwind',
    'Bootstrap',
    'Linux',
    'Unix',
    'Bash',
    'PowerShell',
    'SQL',
    'NoSQL',
    'Elasticsearch',
    'Cassandra',
    'OAuth',
    'JWT',
    'HTTPS',
    'SSL',
    'TLS',
    'Webpack',
    'Vite',
    'Babel',
    'ESLint',
    'Jest',
    'Mocha',
    'Cypress',
    'Selenium',
    'Figma',
    'Sketch',
    'Adobe XD',
    'Jira',
    'Confluence',
    'Notion',
    'Slack',
  ];

  const lowerText = text.toLowerCase();
  context.technologies = techKeywords.filter((tech) => lowerText.includes(tech.toLowerCase()));

  return context;
}

/**
 * Read and parse a resume file
 * Handles PDF, DOCX, TXT, and MD formats
 */
export async function loadResume(filePath: string): Promise<ResumeContext> {
  const extension = filePath.split('.').pop()?.toLowerCase();

  let text: string;

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
 * Extract text from PDF buffer using client-side pdfjs-dist fallback
 */
async function extractPdfText(buffer: Buffer | ArrayBuffer): Promise<string> {
  try {
    const uint8 = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
    const pdfjs = await import('pdfjs-dist');
    
    // Configure worker source for browser environment if not yet configured
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.0.379'}/pdf.worker.min.mjs`;
    }

    const loadingTask = pdfjs.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageStrings: string[] = [];

      for (const item of content.items) {
        if ('str' in item && typeof item.str === 'string') {
          pageStrings.push(item.str);
        }
      }

      fullText += pageStrings.join(' ') + '\n\n';
    }

    const cleaned = fullText.trim();
    if (cleaned) {
      return cleaned;
    }
  } catch (err) {
    console.warn('[extractPdfText] Browser PDF parsing error:', err);
  }

  return 'Could not extract readable text from PDF. The document may be image-only or scanned. Please paste your resume text directly into the editor below or upload as .txt, .md, or .docx.';
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

    return (
      textParts.join(' ').trim() ||
      'DOCX parsing limited. Please use TXT or MD format for best results.'
    );
  } catch {
    return 'Could not parse DOCX. Please try TXT or MD format.';
  }
}

/**
 * Read and parse any File object (dropped or selected)
 * Supports PDF, DOCX, TXT, MD, JSON
 */
export async function readAndParseFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    if (window.electronAPI?.parsePdf) {
      try {
        const text = await window.electronAPI.parsePdf(arrayBuffer);
        if (text && text.trim()) return text.trim();
      } catch (err) {
        console.warn('Electron parsePdf error, falling back to browser extractor:', err);
      }
    }
    return await extractPdfText(arrayBuffer);
  }

  if (extension === 'docx' || extension === 'doc') {
    const arrayBuffer = await file.arrayBuffer();
    if (window.electronAPI?.parseDocx) {
      try {
        const text = await window.electronAPI.parseDocx(arrayBuffer);
        if (text && text.trim()) return text.trim();
      } catch (err) {
        console.warn('Electron parseDocx error, falling back to browser extractor:', err);
      }
    }
    return await extractDocxText(arrayBuffer);
  }

  // Plain text formats (.txt, .md, .json, .csv, etc.)
  return await file.text();
}
