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
  if (/[\u4e00-\u9fa5]/.test(text)) return { isNonEnglish: true, languageName: "Chinese", flag: "🇨🇳" };
  if (/[\u3040-\u30ff]/.test(text)) return { isNonEnglish: true, languageName: "Japanese", flag: "🇯🇵" };
  if (/[\u0400-\u04ff]/.test(text)) return { isNonEnglish: true, languageName: "Russian", flag: "🇷🇺" };
  if (/\b(dado|arreglo|devuelva|enteros|ejemplo|entrada|salida|explicación|solución|puedes|índices|pregunta|entrevista|cadena|matriz)\b/i.test(lower)) {
    return { isNonEnglish: true, languageName: "Spanish", flag: "🇪🇸" };
  }
  if (/\b(étant|tableau|renvoie|entier|exemple|entrée|sortie|fonction|chaîne|question|entrevue)\b/i.test(lower)) {
    return { isNonEnglish: true, languageName: "French", flag: "🇫🇷" };
  }
  if (/\b(gegeben|ganzzahl|zurückgeben|beispiel|eingabe|ausgabe|funktion|zeichenkette|aufgabe)\b/i.test(lower)) {
    return { isNonEnglish: true, languageName: "German", flag: "🇩🇪" };
  }
  if (/\b(dado|matriz|retorne|saída|exemplo|inteiro|função)\b/i.test(lower)) {
    return { isNonEnglish: true, languageName: "Portuguese", flag: "🇧🇷" };
  }
  if (/\b(dato|restituisci|vettore|intero|esempio|stringa|funzione)\b/i.test(lower)) {
    return { isNonEnglish: true, languageName: "Italian", flag: "🇮🇹" };
  }
  return { isNonEnglish: false, languageName: "English", flag: "🇬🇧" };
}

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
  
  // Look for LeetCode / problem numbering like "33. Search in Rotated Sorted Array" or "Pregunta: ..."
  for (const line of lines.slice(0, 5)) {
    if (/^[0-9]{1,4}\.\s+[A-Za-z0-9]/.test(line)) {
      return line.slice(0, 60);
    }
    if (/^(Question|Problem|Design|Implement|Given|Explain|What|How|Pregunta|Problema|Dado|Dada|Diseñe|Explique)\b/i.test(line)) {
      return line.slice(0, 60);
    }
  }

  return lines[0] ? lines[0].slice(0, 60) : "Captured Screen Problem";
}

export function buildScreenSolverPrompt(
  cleanedOcrText: string,
  preferredLanguage: string = "Java",
  targetRole?: string,
  mode: "coding" | "interview" | "quiz" = "coding"
): string {
  const langHint = detectLanguageHint(cleanedOcrText);

  return `You are an elite multilingual Senior Staff Software Engineer and competitive programming champion assisting a candidate in a live technical evaluation for "${targetRole || 'Software Engineer'}".

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

${mode === "quiz" ? `======================================================================
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
` : mode === "interview" ? `======================================================================
🚨 ACTIVE MODE: CONVERSATIONAL TECHNICAL INTERVIEW
======================================================================
Provide a direct, articulate first-person spoken script (~65 to 110 words) ready to read aloud live off the teleprompter:
- Open with a decisive answer.
- Explain the architectural mechanics, trade-offs, and failure recovery.
- Ground the answer in real production experience (e.g., ATMA Research, Quorum on AWS EKS, Porcupine).
` : `======================================================================
🚨 ACTIVE MODE: CODING CHALLENGE (${preferredLanguage})
======================================================================
1. 🎯 PROBLEM BREAKDOWN & CONSTRAINTS:
   - Restate exact problem, input/output types, and constraints (e.g. N <= 10^5, time limits).
   - Identify critical edge cases (empty input, negatives, single element, duplicates, overflow).

2. ⚡ OPTIMAL APPROACH & BIG-O COMPLEXITY:
   - Identify the exact optimal pattern (e.g., Hash Map, Two Pointers, Monotonic Stack, Dynamic Programming, Binary Search, Sliding Window).
   - Time Complexity: O(...) with mathematical proof.
   - Space Complexity: O(...) with auxiliary memory breakdown.

3. 💻 100% VERIFIED WORKING CODE (${preferredLanguage}):
   - Provide complete, production-grade, syntactically flawless ${preferredLanguage} code inside a single markdown code block:
   \`\`\`${preferredLanguage.toLowerCase()}
   // Clean, complete, optimal solution in ${preferredLanguage}
   \`\`\`
   - Include guard clauses for edge cases and clean, descriptive variable names. MUST compile and run.

4. 🧪 STEP-BY-STEP DRY RUN:
   - Concise variable trace table stepping through the primary example from the screen.

5. 🗣️ VERBAL EXPLANATION (Spoken script):
   - A crisp, natural first-person verbal explanation (~65 to 90 words) the candidate can speak aloud to the interviewer while typing the solution.`}`;
}