import path from 'path';
import fs from 'fs';
import { describe, it, expect } from 'vitest';
import {
  detectLanguageHint,
  cleanExtractedOcrText,
  extractProblemHeadline,
  stitchOcrTexts,
  buildScreenSolverPrompt,
} from '../src/services/screenSolver';
import { execSync } from 'child_process';
import os from 'os';

describe('Screen Problem Solver & Multi-Page OCR Stitcher Suite', () => {
  describe('stitchOcrTexts() - Multi-Page Scroll Seam Deduplication', () => {
    it('seamlessly stitches overlapping lines between top and bottom screen captures', () => {
      const page1 = `Given an array of integers nums and an integer target.
Return indices of the two numbers such that they add up to target.
Example 1:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].`;

      const page2 = `Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
Example 2:
Input: nums = [3,2,4], target = 6
Output: [1,2]
Constraints:
2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9`;

      const stitched = stitchOcrTexts(page1, page2);

      // Verify that Output: [0,1] and Explanation only appear ONCE in the combined text
      const outputCount = (stitched.match(/Output: \[0,1\]/g) || []).length;
      expect(outputCount).toBe(1);

      // Verify that the constraints from page 2 are present
      expect(stitched).toContain('2 <= nums.length <= 10^4');
      expect(stitched).toContain('Example 1:');
      expect(stitched).toContain('Example 2:');
    });

    it('handles 3-page chained scroll captures (scrolling twice for huge questions)', () => {
      const page1 = `Problem: Trapping Rain Water
Given n non-negative integers representing an elevation map where width of each bar is 1.
Compute how much water it can trap after raining.
Example 1:
Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]
Output: 6`;

      const page2 = `Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]
Output: 6
Example 2:
Input: height = [4,2,0,3,2,5]
Output: 9`;

      const page3 = `Input: height = [4,2,0,3,2,5]
Output: 9
Constraints:
n == height.length
1 <= n <= 2 * 10^4
0 <= height[i] <= 10^5`;

      // Chain 1 -> 2 -> 3
      const pass1 = stitchOcrTexts(page1, page2);
      const fullProblem = stitchOcrTexts(pass1, page3);

      expect(fullProblem).toContain('Problem: Trapping Rain Water');
      expect(fullProblem).toContain('Example 1:');
      expect(fullProblem).toContain('Example 2:');
      expect(fullProblem).toContain('Constraints:');
      expect(fullProblem).toContain('1 <= n <= 2 * 10^4');

      // Seam deduplication verification across all 3 pages
      const example2Count = (fullProblem.match(/Output: 9/g) || []).length;
      expect(example2Count).toBe(1);
    });

    it('handles single-line seam match if line has at least 8 alphanumeric characters', () => {
      const top = `Line A
Line B
Target long seam line with specific text`;
      const bottom = `Target long seam line with specific text
Following line C
Following line D`;

      const result = stitchOcrTexts(top, bottom);
      expect(result).toContain('Line A');
      expect(result).toContain('Following line D');
      const lines = result.split('\n');
      expect(lines.filter((l) => l.includes('Target long seam line')).length).toBe(1);
    });

    it('does NOT false-positive match 1-line overlaps that are too short (under 8 chars)', () => {
      const top = `Question statement
and`;
      const bottom = `and
another completely unrelated section`;

      const result = stitchOcrTexts(top, bottom);
      // Because "and" is only 3 chars, it should NOT treat it as a confident seam
      expect(result).toContain('--- [SCROLLED SECTION / CONTINUED] ---');
    });

    it('handles empty top or bottom text gracefully', () => {
      expect(stitchOcrTexts('', 'Constraints: N <= 10^5')).toBe('Constraints: N <= 10^5');
      expect(stitchOcrTexts('Given an array', '')).toBe('Given an array');
      expect(stitchOcrTexts('   ', '   ')).toBe('');
    });

    it('falls back cleanly with section banner when pages do not overlap', () => {
      const top = 'Page 1 header and problem statement';
      const bottom = 'Constraints: 1 <= k <= 10^5';
      const result = stitchOcrTexts(top, bottom);
      expect(result).toContain('Page 1 header');
      expect(result).toContain('--- [SCROLLED SECTION / CONTINUED] ---');
      expect(result).toContain('Constraints: 1 <= k <= 10^5');
    });

    it('fuzzy-matches lines across minor OCR punctuation differences', () => {
      const top = `Line A
Line B
Constraints: 1 <= nums.length <= 10^5.`;
      const bottom = `Constraints: 1 <= nums.length <= 10^5
Example 3:
Input: nums = [1]`;

      const result = stitchOcrTexts(top, bottom);
      expect(result).toContain('Line A');
      expect(result).toContain('Example 3:');
      const lines = result.split('\n');
      expect(lines.filter((l) => l.toLowerCase().includes('constraints:')).length).toBe(1);
    });
  });

  describe('detectLanguageHint()', () => {
    it('detects English and non-English problem statements', () => {
      expect(detectLanguageHint('Given an array of integers').isNonEnglish).toBe(false);
      expect(detectLanguageHint('Dado un arreglo de enteros y un objetivo').languageName).toBe('Spanish');
      expect(detectLanguageHint('Étant donné un tableau d\'entiers').languageName).toBe('French');
      expect(detectLanguageHint('Gegeben ist ein Array von ganzen Zahlen').languageName).toBe('German');
      expect(detectLanguageHint('给定一个整数数组 nums 和一个整数目标值 target').languageName).toBe('Chinese');
      expect(detectLanguageHint('Dado um arranjo de inteiros retorne a soma').languageName).toBe('Portuguese');
      expect(detectLanguageHint('Dato un vettore di interi restituisci gli indici').languageName).toBe('Italian');
    });
  });

  describe('cleanExtractedOcrText()', () => {
    it('filters common browser and macOS noise', () => {
      const raw = `File Edit View Window Help
10:45 AM
https://leetcode.com/problems/two-sum/
33. Search in Rotated Sorted Array
Given a sorted array of distinct integers`;

      const cleaned = cleanExtractedOcrText(raw);
      expect(cleaned).not.toContain('File Edit View');
      expect(cleaned).not.toContain('10:45 AM');
      expect(cleaned).not.toContain('https://leetcode.com');
      expect(cleaned).toContain('33. Search in Rotated Sorted Array');
      expect(cleaned).toContain('Given a sorted array of distinct integers');
    });

    it('preserves code snippets, brackets, and math symbols intact', () => {
      const raw = `1 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9
public int[] searchRange(int[] nums, int target) {
    return new int[]{-1, -1};
}`;
      const cleaned = cleanExtractedOcrText(raw);
      expect(cleaned).toContain('1 <= nums.length <= 10^5');
      expect(cleaned).toContain('nums[i]');
      expect(cleaned).toContain('searchRange');
    });
  });

  describe('extractProblemHeadline()', () => {
    it('extracts LeetCode question numbers and titles accurately', () => {
      expect(extractProblemHeadline('42. Trapping Rain Water\nGiven n non-negative integers...')).toBe(
        '42. Trapping Rain Water'
      );
      expect(extractProblemHeadline('Design an LRU Cache\nImplement the LRUCache class')).toBe(
        'Design an LRU Cache'
      );
      expect(extractProblemHeadline('Given an array of integers nums and an integer target')).toBe(
        'Given an array of integers nums and an integer target'
      );
    });
  });

  describe('buildScreenSolverPrompt() - Multi-Language Zero-Fail Enforcement', () => {
    const testLanguages = ['Java', 'Python', 'C++', 'TypeScript'];

    testLanguages.forEach((lang) => {
      it(`mandates zero-fail dual format and edge-case guards for ${lang}`, () => {
        const prompt = buildScreenSolverPrompt(
          'Given an array nums. Find the longest subarray with sum K. N <= 10^5.',
          lang,
          'Senior Software Engineer',
          'coding'
        );

        // Format 1: Ultra-minimal typeable body
        expect(prompt).toContain('FORMAT 1: ULTRA-MINIMAL TYPEABLE SOLUTION');
        expect(prompt).toContain('5–12 LINES MAX');
        expect(prompt).toContain('TYPEABLE BODY');
        expect(prompt).toContain('```' + lang.toLowerCase());

        // Format 2: Complete Online Judge Class with zero omissions
        expect(prompt).toContain('FORMAT 2: COMPLETE ONLINE JUDGE CLASS');
        expect(prompt).toContain('ZERO-OMISSION GUARANTEE');
        expect(prompt).toContain('NEVER use \'// TODO\', \'...\'');
        expect(prompt).toContain('class Solution');

        // Complexity & TLE Avoidance
        expect(prompt).toContain('N <= 10^5: MUST be O(N) or O(N log N)');
        expect(prompt).toContain('Time Limit Exceeded');

        // Defensive Guards
        expect(prompt).toContain('64-bit integer overflow guard');
        expect(prompt).toContain('Empty/null (N=0)');
        expect(prompt).toContain('single element (N=1)');
        expect(prompt).toContain('negative values');
        expect(prompt).toContain('duplicates');

        // Spoken candidate script for verbal communication
        expect(prompt).toContain('SPOKEN CANDIDATE SCRIPT');
      });
    });

    it('generates direct concise answer for quiz MCQ mode', () => {
      const prompt = buildScreenSolverPrompt(
        'Which HTTP status code represents Temporary Redirect?\nA) 301\nB) 302\nC) 404\nD) 500',
        'Java',
        'Backend Engineer',
        'quiz'
      );
      expect(prompt).toContain('ACTIVE MODE: QUIZ & MULTIPLE CHOICE ASSESSMENT (MCQ)');
      expect(prompt).toContain('Option [A / B / C / D]:');
      expect(prompt).toContain('WHY OTHER OPTIONS ARE INCORRECT');
    });

    it('generates 3-Beat framework spoken script for interview mode', () => {
      const prompt = buildScreenSolverPrompt(
        'How do you handle backpressure in a reactive streaming architecture?',
        'Java',
        'Staff Architect',
        'interview'
      );
      expect(prompt).toContain('ACTIVE MODE: CONVERSATIONAL TECHNICAL INTERVIEW');
      expect(prompt).toContain('3-Beat Framework');
      expect(prompt).toContain('Beat 1: Decisive executive answer');
      expect(prompt).toContain('Beat 2: Concrete chronological phase ordering');
      expect(prompt).toContain('Beat 3: Production trade-off');
    });
  });

  describe('Stealth Auto-Typer AppleScript Verification (macOS)', () => {
    it('successfully parses code files with complex quotes, backslashes, and line breaks without AppleScript errors', () => {
      if (process.platform !== 'darwin') return;

      const complexCode = `class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Test "double quotes" and 'single quotes' and \\ backslashes
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int comp = target - nums[i];
            if (map.containsKey(comp)) return new int[]{map.get(comp), i};
            map.put(nums[i], i);
        }
        return new int[0];
    }
}`;

      const tmpCodePath = path.join(os.tmpdir(), `iac_test_code_${Date.now()}.txt`);
      const tmpScriptPath = path.join(os.tmpdir(), `iac_test_script_${Date.now()}.applescript`);

      fs.writeFileSync(tmpCodePath, complexCode, 'utf8');

      const appleScript = `
set f to "${tmpCodePath}"
set theCode to read POSIX file f as «class utf8»
tell application "System Events"
    return length of theCode
end tell
`;
      fs.writeFileSync(tmpScriptPath, appleScript, 'utf8');

      const stdout = execSync(`osascript "${tmpScriptPath}"`).toString().trim();
      expect(Number(stdout)).toBe(complexCode.length);

      // Clean up temp files
      fs.unlinkSync(tmpCodePath);
      fs.unlinkSync(tmpScriptPath);
    });
  });
});
