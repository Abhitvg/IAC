/**
 * Zero-Hallucination Multilingual Screen Problem Solver Service
 * Integrates Apple Vision Multilingual OCR with Groq / Qwen 27B reasoning
 * Automatically detects non-English text (e.g. Spanish, French, German, Chinese)
 * and translates it into English before providing 100% verified solutions.
 */

export interface LanguageDetectionResult {
  isNonEnglish: boolean;
  languageName: string;
  flag: string;
}

export function detectLanguageHint(text: string): LanguageDetectionResult {
  const lower = text.toLowerCase();
  if (/[\u4e00-\u9fa5]/.test(text))
    return { isNonEnglish: true, languageName: 'Chinese', flag: '🇨🇳' };
  if (/[\u3040-\u30ff]/.test(text))
    return { isNonEnglish: true, languageName: 'Japanese', flag: '🇯🇵' };
  if (/[\u0400-\u04ff]/.test(text))
    return { isNonEnglish: true, languageName: 'Russian', flag: '🇷🇺' };
  if (
    /\b(retorne|arranjo|saída|função|questão|inteiro)\b/i.test(lower)
  ) {
    return { isNonEnglish: true, languageName: 'Portuguese', flag: '🇧🇷' };
  }
  if (/\b(restituisci|vettore|funzione|quesito)\b/i.test(lower)) {
    return { isNonEnglish: true, languageName: 'Italian', flag: '🇮🇹' };
  }
  if (
    /\b(dado|arreglo|devuelva|enteros|ejemplo|entrada|salida|explicación|solución|puedes|índices|pregunta|entrevista|cadena|matriz)\b/i.test(
      lower
    )
  ) {
    return { isNonEnglish: true, languageName: 'Spanish', flag: '🇪🇸' };
  }
  if (
    /\b(étant|tableau|renvoie|entier|exemple|entrée|sortie|fonction|chaîne|question|entrevue)\b/i.test(
      lower
    )
  ) {
    return { isNonEnglish: true, languageName: 'French', flag: '🇫🇷' };
  }
  if (
    /\b(gegeben|ganzzahl|zurückgeben|beispiel|eingabe|ausgabe|funktion|zeichenkette|aufgabe)\b/i.test(
      lower
    )
  ) {
    return { isNonEnglish: true, languageName: 'German', flag: '🇩🇪' };
  }
  return { isNonEnglish: false, languageName: 'English', flag: '🇬🇧' };
}

export function cleanExtractedOcrText(rawText: string): string {
  if (!rawText) return '';
  const lines = rawText.split('\n');

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Filter common macOS menu bar / browser chrome noise
    if (/^(File|Edit|Selection|View|Go|Run|Terminal|Window|Help)(\s+(File|Edit|Selection|View|Go|Run|Terminal|Window|Help))*$/i.test(trimmed)) return false;
    if (/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?\s*(AM|PM)?$/i.test(trimmed)) return false;
    if (/^(http:\/\/|https:\/\/|chrome:\/\/|localhost:)/i.test(trimmed)) return false;
    return true;
  });

  return filtered.join('\n').trim();
}

/**
 * Stitches two sequential OCR screen captures (e.g. before and after scrolling down).
 * Automatically finds the overlapping seam lines between the bottom of topText
 * and the top of bottomText, deduplicates them, and produces a single continuous problem text.
 */
export function stitchOcrTexts(topText: string, bottomText: string): string {
  if (!topText || !topText.trim()) return (bottomText || '').trim();
  if (!bottomText || !bottomText.trim()) return topText.trim();

  const topLines = topText.split('\n').map((l) => l.trimEnd());
  const bottomLines = bottomText.split('\n').map((l) => l.trimEnd());
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const maxOverlapCheck = Math.min(topLines.length, bottomLines.length, 25);
  let bestOverlapCount = 0;

  for (let overlap = maxOverlapCheck; overlap >= 1; overlap--) {
    let match = true;
    let matchedNonEmpty = 0;
    let totalChars = 0;
    for (let i = 0; i < overlap; i++) {
      const topIdx = topLines.length - overlap + i;
      const bottomIdx = i;
      const lineTop = norm(topLines[topIdx]);
      const lineBottom = norm(bottomLines[bottomIdx]);

      if (!lineTop && !lineBottom) continue;
      if (!lineTop || !lineBottom) {
        match = false;
        break;
      }
      if (lineTop === lineBottom || lineTop.includes(lineBottom) || lineBottom.includes(lineTop)) {
        matchedNonEmpty++;
        totalChars += Math.min(lineTop.length, lineBottom.length);
      } else {
        match = false;
        break;
      }
    }
    if (match && matchedNonEmpty >= 1 && (overlap > 1 || totalChars >= 8)) {
      bestOverlapCount = overlap;
      break;
    }
  }

  if (bestOverlapCount > 0) {
    return [...topLines, ...bottomLines.slice(bestOverlapCount)].join('\n').trim();
  }

  return `${topText.trim()}\n\n--- [SCROLLED SECTION / CONTINUED] ---\n\n${bottomText.trim()}`;
}

export function extractProblemHeadline(cleanedText: string): string {
  if (!cleanedText) return 'Screen Question';
  const lines = cleanedText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Look for LeetCode / problem numbering like "33. Search in Rotated Sorted Array" or "Pregunta: ..."
  for (const line of lines.slice(0, 5)) {
    if (/^[0-9]{1,4}\.\s+[A-Za-z0-9]/.test(line)) {
      return line.slice(0, 60);
    }
    if (
      /^(Question|Problem|Design|Implement|Given|Explain|What|How|Pregunta|Problema|Dado|Dada|Diseñe|Explique)\b/i.test(
        line
      )
    ) {
      return line.slice(0, 60);
    }
  }

  return lines[0] ? lines[0].slice(0, 60) : 'Captured Screen Problem';
}

export function buildScreenSolverPrompt(
  cleanedOcrText: string,
  preferredLanguage: string = 'Java',
  targetRole?: string,
  mode: 'coding' | 'interview' | 'quiz' = 'coding'
): string {
  const _langHint = detectLanguageHint(cleanedOcrText);

  return `You are an elite multilingual Senior Staff Software Engineer and ACM ICPC World Finalist assisting a candidate in a live technical evaluation for "${targetRole || 'Software Engineer'}".

--- EXTRACTED SCREEN OCR TEXT ---
${cleanedOcrText}
--- END SCREEN OCR TEXT ---

MULTILINGUAL TRANSLATION & ZERO-HALLUCINATION DIRECTIVES:
1. 🌐 AUTOMATIC LANGUAGE DETECTION & ENGLISH TRANSLATION:
   - Identify the source language of the screen text.
   - If non-English (e.g. Spanish 🇪🇸, French 🇫🇷, German 🇩🇪, Portuguese 🇧🇷, Chinese 🇨🇳):
     • Output: "**Detected Language: [Language Name + Flag]**"
     • Under "**🌐 ENGLISH TRANSLATION:**", translate the full question, constraints, inputs, and examples into clear, precise English.
   - If English: state "**Detected Language: English 🇬🇧**".

2. STRICT 100% ACCURACY & ZERO-HALLUCINATION:
   - Adhere strictly to the exact problem, constraints, and inputs from the screen.
   - Do NOT invent phantom libraries, unstated assumptions, or non-existent constraints.

${
  mode === 'quiz'
    ? `======================================================================
🚨 ACTIVE MODE: QUIZ & MULTIPLE CHOICE ASSESSMENT (MCQ)
======================================================================
Deliver the answer with immediate, crystal-clear precision:

✅ CORRECT ANSWER:
**Option [A / B / C / D]: [Exact Text of Correct Option]**

💡 DIRECT PROOF & REASONING:
[2-3 sentences explaining the exact theoretical, mathematical, or architectural rule proving why this choice is correct]

❌ WHY OTHER OPTIONS ARE INCORRECT:
- [Option]: [Why it is false or misleading]
- [Option]: [Why it is false or misleading]
`
    : mode === 'interview'
      ? `======================================================================
🚨 ACTIVE MODE: CONVERSATIONAL TECHNICAL INTERVIEW
======================================================================
Provide a direct, articulate first-person spoken script (~65 to 110 words) structured with the 3-Beat Framework:
• Beat 1: Decisive executive answer & core architectural principle stated in sentence 1.
• Beat 2: Concrete chronological phase ordering (Phase 1 Ingestion ➔ Phase 2 In-flight Processing ➔ Phase 3 Teardown/Recovery).
• Beat 3: Production trade-off (memory vs CPU, backpressure, or debugging diagnostics).
- Ground the answer in the candidate's verified production experience and resume projects.
`
      : `======================================================================
🚨 ACTIVE MODE: ZERO-FAIL CODING CHALLENGE (${preferredLanguage})
======================================================================
YOU MUST DELIVER BOTH FORMATS BELOW IN A SINGLE COMPLETE RESPONSE WITH ZERO OMISSIONS:

1. 🎯 PROBLEM SPECIFICATION & DEFENSIVE EDGE CASES:
   - Exact input/output types and constraints (e.g. N <= 10^5, -10^9 <= val <= 10^9).
   - Time & Space Complexity Target:
     • N <= 10^5: MUST be O(N) or O(N log N). STRICTLY FORBIDDEN to use O(N^2) (causes Time Limit Exceeded).
   - Edge cases audited: Empty/null (N=0), single element (N=1), negative values, duplicates, and 64-bit integer overflow guard (use 'long' in Java or 'long long' in C++ for sums/multiplications).

2. ⚡ FORMAT 1: ULTRA-MINIMAL TYPEABLE SOLUTION (5–12 LINES MAX):
   - Provide ONLY the concise core algorithm method body (under 12 lines) that passes 100% of test cases.
   - NO comments, NO blank lines, NO outer class wrappers, NO import statements.
   - Designed specifically for manual typing or auto-typing in under 45 seconds when clipboard pasting is blocked.
   \`\`\`${preferredLanguage.toLowerCase()}
   // ⚡ TYPEABLE BODY (Shortest logic passing 100% of test cases)
   \`\`\`

3. 📦 FORMAT 2: COMPLETE ONLINE JUDGE CLASS (100% COMPILABLE & ZERO MISSING CODE):
   - Complete, production-grade, compilable class (e.g., 'class Solution') ready to copy-paste directly into LeetCode / HackerRank / CodeSignal / IDE.
   - STRICT ZERO-OMISSION GUARANTEE:
     • MUST include ALL necessary imports (e.g., 'import java.util.*;' in Java; 'from typing import List, Dict, Optional, Tuple; from collections import deque, defaultdict, Counter; import heapq' in Python; standard #includes in C++).
     • ABSOLUTELY FORBIDDEN: NEVER use '// TODO', '...', or omit any helper methods, comparators, or ListNode/TreeNode definitions.
     • Every single line must be 100% implemented, syntactically flawless, and ready to pass all test cases on first run.
   \`\`\`${preferredLanguage.toLowerCase()}
   // 📦 COMPLETE ONLINE JUDGE CLASS (Zero placeholders, 100% compilable)
   \`\`\`

4. 🧪 MATHEMATICAL VERIFICATION & DRY RUN:
   - Line-by-line variable trace table stepping through Example 1 and a Tricky Edge Case (empty, negative, or duplicate elements).
   - Verify expected output vs actual output to mathematically guarantee 0 test case failures.

5. 🗣️ SPOKEN CANDIDATE SCRIPT:
   - A natural, confident 60-80 word first-person explanation the candidate can speak to the interviewer while code is being typed.`
}`;
}
