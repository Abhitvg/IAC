/**
 * Session Management Service
 * Handles interview session storage, history, and performance analytics
 */

import { InterviewSession, SessionQuestion, SessionPerformance, QuestionCategory } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create a new interview session
 */
export function createSession(): InterviewSession {
  const now = new Date();
  return {
    id: uuidv4(),
    date: now.toISOString().split('T')[0],
    startTime: now.toISOString(),
    questions: [],
  };
}

/**
 * Add a question to the current session
 */
export function addQuestionToSession(
  session: InterviewSession,
  question: string,
  category: QuestionCategory,
  difficulty: string,
  answer: string,
  language?: string,
  responseTime: number = 0
): InterviewSession {
  const newQuestion: SessionQuestion = {
    id: uuidv4(),
    question,
    category,
    difficulty: difficulty as any,
    answer,
    language: language as any,
    timestamp: new Date().toISOString(),
    responseTime,
  };

  return {
    ...session,
    questions: [...session.questions, newQuestion],
  };
}

/**
 * End a session and generate performance analysis
 */
export function endSession(session: InterviewSession): InterviewSession {
  return {
    ...session,
    endTime: new Date().toISOString(),
    performance: analyzePerformance(session.questions),
  };
}

/**
 * Analyze session performance
 */
export function analyzePerformance(questions: SessionQuestion[]): SessionPerformance {
  if (questions.length === 0) {
    return {
      totalQuestions: 0,
      categoryCounts: {},
      strongAreas: [],
      weakAreas: [],
      averageResponseTime: 0,
      recommendations: ['Start a practice session to see your performance analysis.'],
    };
  }

  // Count categories
  const categoryCounts: Record<string, number> = {};
  for (const q of questions) {
    categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
  }

  // Calculate average response time
  const validTimes = questions.filter(q => q.responseTime > 0);
  const averageResponseTime = validTimes.length > 0
    ? validTimes.reduce((sum, q) => sum + q.responseTime, 0) / validTimes.length
    : 0;

  // Identify strong/weak areas based on frequency and response times
  const categoryTimes: Record<string, number[]> = {};
  for (const q of questions) {
    if (!categoryTimes[q.category]) categoryTimes[q.category] = [];
    if (q.responseTime > 0) categoryTimes[q.category].push(q.responseTime);
  }

  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1]);

  const strongAreas = sortedCategories
    .slice(0, 3)
    .map(([cat]) => cat);

  // Categories with fewer questions or higher response times are weak areas
  const allCategories: QuestionCategory[] = [
    'Coding', 'DSA', 'System Design', 'DBMS', 'Operating Systems',
    'Computer Networks', 'OOP', 'JavaScript', 'React', 'Node.js',
  ];
  
  const weakAreas = allCategories
    .filter(cat => !categoryCounts[cat] || categoryCounts[cat] <= 1)
    .slice(0, 3);

  // Generate recommendations
  const recommendations: string[] = [];
  
  if (weakAreas.length > 0) {
    recommendations.push(`Focus on: ${weakAreas.join(', ')}`);
  }

  if (averageResponseTime > 30) {
    recommendations.push('Practice faster problem analysis to reduce response time.');
  }

  if (!categoryCounts['System Design']) {
    recommendations.push('Practice system design questions — they are common in senior-level interviews.');
  }

  if (!categoryCounts['Behavioral']) {
    recommendations.push('Prepare behavioral answers using the STAR method.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Great session! Keep up the consistent practice.');
  }

  return {
    totalQuestions: questions.length,
    categoryCounts,
    strongAreas,
    weakAreas,
    averageResponseTime: Math.round(averageResponseTime * 10) / 10,
    recommendations,
  };
}

/**
 * Save session to local storage
 */
export async function saveSession(session: InterviewSession, sessionsDir: string): Promise<void> {
  const sessionDir = `${sessionsDir}/${session.date}`;
  
  // Save full session data
  const sessionData = JSON.stringify(session, null, 2);
  await window.electronAPI.writeFile(`${sessionDir}/session_${session.id}.json`, sessionData);

  // Save questions separately for easy access
  const questionsData = JSON.stringify(session.questions, null, 2);
  await window.electronAPI.writeFile(`${sessionDir}/questions_${session.id}.json`, questionsData);

  // Save performance if available
  if (session.performance) {
    const perfData = JSON.stringify(session.performance, null, 2);
    await window.electronAPI.writeFile(`${sessionDir}/performance_${session.id}.json`, perfData);
  }
}

/**
 * Load all sessions from local storage
 */
export async function loadSessions(sessionsDir: string): Promise<InterviewSession[]> {
  const sessions: InterviewSession[] = [];

  try {
    const dirs = await window.electronAPI.listDir(sessionsDir);
    
    for (const dir of dirs) {
      if (!dir.isDirectory) continue;
      
      const files = await window.electronAPI.listDir(dir.path);
      for (const file of files) {
        if (file.name.startsWith('session_') && file.name.endsWith('.json')) {
          try {
            const buffer = await window.electronAPI.readFile(file.path);
            const text = new TextDecoder().decode(buffer);
            const session = JSON.parse(text) as InterviewSession;
            sessions.push(session);
          } catch (e) {
            console.error(`Failed to load session: ${file.path}`, e);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load sessions:', e);
  }

  return sessions.sort((a, b) => 
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}

/**
 * Delete all session data
 */
export async function clearAllSessions(sessionsDir: string): Promise<void> {
  try {
    await window.electronAPI.deleteFile(sessionsDir);
  } catch (e) {
    console.error('Failed to clear sessions:', e);
  }
}
