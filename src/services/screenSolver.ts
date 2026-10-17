/**
 * Zero-Hallucination Screen Problem Solver Service
 * Integrates Apple Vision OCR extraction with Groq / Qwen 27B reasoning
 * for 100% accurate coding and theoretical solutions.
 */

export function cleanExtractedOcrText(rawText: string): string {
  if (!rawText) return "";
  const lines = rawText.split("\n");

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Filter common macOS menu bar / browser chrome noise
    if (/^(File|Edit|Selection|View|Go|Run|Terminal|Window|Help)$/i.test(trimmed)) return false;
    if (/^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?\s*(AM|PM)?$/i.test(trimmed)) return false;
    if (/^(http:\/\/|https:\/\/|chrome:\/\/|localhost:)/i.test(trimmed)) return false;
    return true;
  });

  return filtered.join("\n").trim();
}

export function extractProblemHeadline(cleanedText: string): string {
  if (!cleanedText) return "Screen Question";
  const lines = cleanedText.split("\n").map(l => l.trim()).filter(Boolean);
  
  // Look for LeetCode / problem numbering like "33. Search in Rotated Sorted Array" or "Problem: ..."
  for (const line of lines.slice(0, 5)) {
    if (/^[0-9]{1,4}\.\s+[A-Za-z0-9]/.test(line)) {
      return line.slice(0, 60);
    }
    if (/^(Question|Problem|Design|Implement|Given|Explain|What|How)\b/i.test(line)) {
      return line.slice(0, 60);
    }
  }

  return lines[0] ? lines[0].slice(0, 60) : "Captured Screen Problem";
}

export function buildScreenSolverPrompt(
  cleanedOcrText: string,
  preferredLanguage: string = "JavaScript",
  targetRole?: string
): string {
  return `You are an elite Senior Staff Engineer and competitive programming champion solving a problem shared directly on screen during a live technical interview for ${targetRole || 'Software Engineer'}.

--- EXTRACTED SCREEN OCR TEXT ---
${cleanedOcrText}
--- END SCREEN OCR TEXT ---

STRICT ZERO-HALLUCINATION & 100% ACCURACY DIRECTIVE:
Adhere strictly to the exact problem, constraints, and inputs visible on screen. Do NOT invent phantom libraries or unstated requirements.

Determine if this is a CODING/ALGORITHM/SQL question OR a SYSTEM DESIGN/THEORY question:

=========================================
A. IF CODING / DSA / SQL / BUG-FIX:
=========================================
1. 🎯 PROBLEM IDENTIFICATION & CONSTRAINTS:
   - Restate the exact problem statement, input/output types, and constraints (e.g. N <= 10^5, time limits).
   - Identify critical edge cases (empty input, negatives, single element, duplicates, overflow).

2. ⚡ OPTIMAL APPROACH & BIG-O COMPLEXITY:
   - Identify the exact optimal pattern (e.g., Two Pointers, Monotonic Stack, Dynamic Programming, Binary Search, Sliding Window).
   - State why brute force is suboptimal.
   - Mathematical Big-O Time Complexity: O(...) with proof.
   - Mathematical Big-O Space Complexity: O(...) with memory breakdown.

3. 💻 100% VERIFIED WORKING CODE (${preferredLanguage}):
   - Provide complete, syntactically flawless code in ${preferredLanguage}.
   - Include key comments on tricky logic.
   - MUST compile and pass all edge cases. NO pseudocode.

4. 🧪 STEP-BY-STEP DRY RUN:
   - Walk through the primary example from the screen with a variable trace table.

5. 🗣️ VERBAL TELEPROMPTER SCRIPT (2-3 sentences):
   - A crisp, natural verbal explanation the candidate can speak aloud right now to introduce their approach with absolute confidence.

=========================================
B. IF SYSTEM DESIGN / CORE CS THEORY / DEVOPS / WEB TECH:
=========================================
1. 💡 CORE DEFINITION:
   - A precise, standard-compliant 2-3 sentence definition.

2. ⚙️ ARCHITECTURAL MECHANICS (UNDER THE HOOD):
   - How it works internally (protocols, memory, concurrency, ACID/BASE guarantees, consensus).

3. ⚖️ TRADEOFFS & ALTERNATIVES:
   - Compare with 1-2 industry alternatives (e.g. Kafka vs SQS, Optimistic vs Pessimistic, Redis vs Memcached).

4. 🚀 REAL-WORLD BEST PRACTICES:
   - Production failure modes and mitigation strategies.

5. 🗣️ VERBAL TELEPROMPTER SCRIPT:
   - Crisp bullet points ready to speak naturally on call.`;
}
