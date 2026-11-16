/**
 * Session Management Service
 * Handles interview session storage, history, and performance analytics
 */

import { InterviewSession, SessionQuestion, SessionPerformance, QuestionCategory } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { DiagnosticLoggerService } from './diagnosticLogger';

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
  const validTimes = questions.filter((q) => q.responseTime > 0);
  const averageResponseTime =
    validTimes.length > 0
      ? validTimes.reduce((sum, q) => sum + q.responseTime, 0) / validTimes.length
      : 0;

  // Identify strong/weak areas based on frequency and response times
  const categoryTimes: Record<string, number[]> = {};
  for (const q of questions) {
    if (!categoryTimes[q.category]) categoryTimes[q.category] = [];
    if (q.responseTime > 0) categoryTimes[q.category].push(q.responseTime);
  }

  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

  const strongAreas = sortedCategories.slice(0, 3).map(([cat]) => cat);

  // Categories with fewer questions or higher response times are weak areas
  const allCategories: QuestionCategory[] = [
    'Coding',
    'DSA',
    'System Design',
    'DBMS',
    'Operating Systems',
    'Computer Networks',
    'OOP',
    'JavaScript',
    'React',
    'Node.js',
  ];

  const weakAreas = allCategories
    .filter((cat) => !categoryCounts[cat] || categoryCounts[cat] <= 1)
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
    recommendations.push(
      'Practice system design questions — they are common in senior-level interviews.'
    );
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
 * Save one canonical session record. The Electron write IPC uses a same-directory
 * temporary file and atomic rename, so a failed write cannot leave a truncated
 * session or mismatched session/questions/performance sidecars.
 */
export async function saveSession(session: InterviewSession, _sessionsDir: string): Promise<void> {
  const sessionData = JSON.stringify(session);
  const requestId = `session_save_${session.id}`;
  const startedAt = Date.now();

  try {
    if (!window.electronAPI?.secureRecordSet) {
      throw new Error(
        'Secure session storage is unavailable in this browser. Session data was not written in plaintext.'
      );
    }
    await window.electronAPI.secureRecordSet('interview-sessions', session.id, sessionData);
    DiagnosticLoggerService.getInstance().recordEvent({
      requestId,
      pipelineStage: 'ready',
      sessionSaveDurationMs: Date.now() - startedAt,
      sessionQuestionCount: session.questions.length,
      sessionSaveOutcome: 'SUCCESS',
      finalOutcome: 'SUCCESS',
      message: 'Interview session saved to encrypted storage.',
    });
  } catch (error) {
    DiagnosticLoggerService.getInstance().recordEvent({
      requestId,
      pipelineStage: 'failed',
      sessionSaveDurationMs: Date.now() - startedAt,
      sessionQuestionCount: session.questions.length,
      sessionSaveOutcome: 'FAILED',
      finalOutcome: 'FAILED',
      message: 'Interview session save failed; session content omitted from diagnostics.',
    });
    throw error;
  }
}

/**
 * Load encrypted sessions and retain legacy plaintext sessions for user-directed
 * export/migration. Legacy files are deliberately not modified or deleted.
 */
export async function loadSessions(sessionsDir: string): Promise<InterviewSession[]> {
  const sessionsById = new Map<string, InterviewSession>();

  try {
    if (window.electronAPI?.secureRecordList && window.electronAPI?.secureRecordGet) {
      const ids = await window.electronAPI.secureRecordList('interview-sessions');
      for (const id of ids) {
        try {
          const raw = await window.electronAPI.secureRecordGet('interview-sessions', id);
          if (!raw) continue;
          const session = JSON.parse(raw) as InterviewSession;
          if (session && session.id === id && Array.isArray(session.questions)) {
            sessionsById.set(id, session);
          }
        } catch (error) {
          console.error(
            'Failed to decrypt an interview session; encrypted data was retained.',
            error
          );
        }
      }
    }

    // Legacy data remains readable but is never silently migrated or removed.
    if (window.electronAPI?.listDir && window.electronAPI?.readFile) {
      const dirs = await window.electronAPI.listDir(sessionsDir);
      for (const dir of dirs) {
        if (!dir.isDirectory) continue;
        const files = await window.electronAPI.listDir(dir.path);
        for (const file of files) {
          if (!file.name.startsWith('session_') || !file.name.endsWith('.json')) continue;
          try {
            const buffer = await window.electronAPI.readFile(file.path);
            const session = JSON.parse(new TextDecoder().decode(buffer)) as InterviewSession;
            if (session?.id && Array.isArray(session.questions) && !sessionsById.has(session.id)) {
              sessionsById.set(session.id, session);
            }
          } catch (error) {
            console.error('Failed to read a legacy session; source file was retained.', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load interview sessions:', error);
  }

  return Array.from(sessionsById.values()).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
}

/**
 * Delete encrypted and legacy session records only when the user explicitly
 * invokes the existing clear-history action.
 */
export async function clearAllSessions(sessionsDir: string): Promise<void> {
  try {
    if (window.electronAPI?.secureRecordList && window.electronAPI?.secureRecordDelete) {
      const ids = await window.electronAPI.secureRecordList('interview-sessions');
      for (const id of ids) {
        await window.electronAPI.secureRecordDelete('interview-sessions', id);
      }
    }
    if (window.electronAPI?.deleteFile) {
      await window.electronAPI.deleteFile(sessionsDir);
    }
  } catch (error) {
    console.error('Failed to clear sessions:', error);
    throw error;
  }
}
