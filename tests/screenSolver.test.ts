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
    it('stitches overlapping lines and preserves the rest of the problem', () => {
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
      expect((stitched.match(/Output: \[0,1\]/g) || []).length).toBe(1);
      expect(stitched).toContain('2 <= nums.length <= 10^4');
      expect(stitched).toContain('Example 1:');
      expect(stitched).toContain('Example 2:');
    });

    it('handles chained multi-page captures', () => {
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
      const fullProblem = stitchOcrTexts(stitchOcrTexts(page1, page2), page3);
      expect(fullProblem).toContain('Problem: Trapping Rain Water');
      expect(fullProblem).toContain('Example 1:');
      expect(fullProblem).toContain('Example 2:');
      expect(fullProblem).toContain('Constraints:');
      expect(fullProblem).toContain('1 <= n <= 2 * 10^4');
      expect((fullProblem.match(/Output: 9/g) || []).length).toBe(1);
    });

    it('accepts a confident single-line seam but rejects a short false match', () => {
      const top = 'Line A\nLine B\nTarget long seam line with specific text';
      const bottom = 'Target long seam line with specific text\nFollowing line C\nFollowing line D';
      const result = stitchOcrTexts(top, bottom);
      expect(result).toContain('Line A');
      expect(result).toContain('Following line D');
      expect(
        result.split('\n').filter((line) => line.includes('Target long seam line'))
      ).toHaveLength(1);
      expect(stitchOcrTexts('Question statement\nand', 'and\nanother unrelated section')).toContain(
        '--- [SCROLLED SECTION / CONTINUED] ---'
      );
    });

    it('handles empty inputs and falls back when pages do not overlap', () => {
      expect(stitchOcrTexts('', 'Constraints: N <= 10^5')).toBe('Constraints: N <= 10^5');
      expect(stitchOcrTexts('Given an array', '')).toBe('Given an array');
      expect(stitchOcrTexts('   ', '   ')).toBe('');
      const result = stitchOcrTexts(
        'Page 1 header and problem statement',
        'Constraints: 1 <= k <= 10^5'
      );
      expect(result).toContain('--- [SCROLLED SECTION / CONTINUED] ---');
      expect(result).toContain('Constraints: 1 <= k <= 10^5');
    });

    it('fuzzy-matches punctuation differences across the OCR seam', () => {
      const top = 'Line A\nLine B\nConstraints: 1 <= nums.length <= 10^5.';
      const bottom = 'Constraints: 1 <= nums.length <= 10^5\nExample 3:\nInput: nums = [1]';
      const result = stitchOcrTexts(top, bottom);
      expect(result).toContain('Line A');
      expect(result).toContain('Example 3:');
      expect(result.split('\n').filter((line) => /constraints:/i.test(line))).toHaveLength(1);
    });
  });

  describe('OCR utilities', () => {
    it('detects common source languages without treating English as non-English', () => {
      expect(detectLanguageHint('Given an array of integers').isNonEnglish).toBe(false);
      expect(detectLanguageHint('Dado un arreglo de enteros y un objetivo').languageName).toBe(
        'Spanish'
      );
      expect(detectLanguageHint("Étant donné un tableau d'entiers").languageName).toBe('French');
      expect(detectLanguageHint('Gegeben ist ein Array von ganzen Zahlen').languageName).toBe(
        'German'
      );
      expect(detectLanguageHint('给定一个整数数组 nums 和一个整数目标值 target').languageName).toBe(
        'Chinese'
      );
      expect(detectLanguageHint('Dado um arranjo de inteiros retorne a soma').languageName).toBe(
        'Portuguese'
      );
      expect(
        detectLanguageHint('Dato un vettore di interi restituisci gli indici').languageName
      ).toBe('Italian');
    });

    it('filters browser chrome while preserving code, brackets, and mathematical constraints', () => {
      const raw = `File Edit View Window Help
10:45 AM
https://leetcode.com/problems/two-sum/
33. Search in Rotated Sorted Array
1 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9
public int[] searchRange(int[] nums, int target) {
    return new int[]{-1, -1};
}`;
      const cleaned = cleanExtractedOcrText(raw);
      expect(cleaned).not.toContain('File Edit View');
      expect(cleaned).not.toContain('10:45 AM');
      expect(cleaned).not.toContain('https://leetcode.com');
      expect(cleaned).toContain('33. Search in Rotated Sorted Array');
      expect(cleaned).toContain('nums[i]');
      expect(cleaned).toContain('searchRange');
    });

    it('extracts visible problem titles from common formats', () => {
      expect(
        extractProblemHeadline('42. Trapping Rain Water\nGiven n non-negative integers...')
      ).toBe('42. Trapping Rain Water');
      expect(extractProblemHeadline('Design an LRU Cache\nImplement the LRUCache class')).toBe(
        'Design an LRU Cache'
      );
      expect(extractProblemHeadline('Given an array of integers nums and an integer target')).toBe(
        'Given an array of integers nums and an integer target'
      );
    });
  });

  describe('buildScreenSolverPrompt() - Stable mode-specific contracts', () => {
    const languages = ['Java', 'Python', 'C++', 'TypeScript'];

    languages.forEach((language) => {
      it(`uses one adaptive implementation contract for ${language}`, () => {
        const prompt = buildScreenSolverPrompt(
          'Given an array nums. Find the longest subarray with sum K. N <= 10^5.',
          language,
          'Software Engineer',
          'coding'
        );
        expect(prompt).toContain(`MODE: LIVE CODING — ${language}`);
        expect(prompt).toContain('SELECT ONE IMPLEMENTATION CONTRACT');
        expect(prompt).toContain('existing editor stub, class, function signature');
        expect(prompt).toContain('exactly one complete implementation');
        expect(prompt).toContain('exactly one fenced code block');
        expect(prompt).toContain('Do not add a main method or test harness');
        expect(prompt).toContain('Do not invent constraints');
        expect(prompt).toContain('Discuss time and auxiliary-space complexity accurately');
        expect(prompt).not.toContain('FORMAT 1: ULTRA-MINIMAL TYPEABLE SOLUTION');
        expect(prompt).not.toContain('FORMAT 2: COMPLETE ONLINE JUDGE CLASS');
        expect(prompt).not.toContain('N <= 10^5: MUST be O(N) or O(N log N)');
        expect(prompt).not.toContain('64-bit integer overflow guard');
        expect(prompt).toContain('Avoid inflated claims');
      });
    });

    it('preserves a visible judge signature and prevents a competing main method', () => {
      const prompt = buildScreenSolverPrompt(
        'class Solution { public String reverseString(String input) { } }',
        'Java',
        'Software Engineer',
        'coding'
      );
      expect(prompt).toContain('Preserve visible class names, method signatures');
      expect(prompt).toContain('complete that exact contract');
      expect(prompt).toContain('Do not rename it or add a competing entry point');
      expect(prompt).toContain('Do not add a main method or test harness');
    });

    it('keeps quiz answers direct and refuses to invent cropped choices', () => {
      const prompt = buildScreenSolverPrompt(
        'Which HTTP status code represents Temporary Redirect?\nA) 301\nB) 302\nC) 404\nD) 500',
        'Java',
        'Backend Engineer',
        'quiz'
      );
      expect(prompt).toContain('MODE: MULTIPLE-CHOICE QUESTION');
      expect(prompt).toContain('correct option and its exact visible wording');
      expect(prompt).toContain('Never invent missing choices');
    });

    it('removes the unrelated forced phase framework from spoken interview answers', () => {
      const prompt = buildScreenSolverPrompt(
        'How do you handle backpressure in a reactive streaming architecture?',
        'Java',
        'Platform Engineer',
        'interview'
      );
      expect(prompt).toContain('MODE: SPOKEN TECHNICAL INTERVIEW');
      expect(prompt).toContain('Answer the exact question directly in the first sentence');
      expect(prompt).toContain('Do not force every answer into a fixed phase framework');
      expect(prompt).toContain('Do not invent first-person work history');
      expect(prompt).not.toContain('3-Beat Framework');
      expect(prompt).not.toContain('Phase 1 Ingestion');
      expect(prompt).not.toContain('Phase 2 In-flight Processing');
    });

    it('uses the role only as relevant context, not as a reason to pad the answer', () => {
      const prompt = buildScreenSolverPrompt(
        'Reverse a string in Java.',
        'Java',
        'Software Engineer — DevOps / Cloud Platform',
        'coding'
      );
      expect(prompt).toContain('Use it only when it materially changes the explanation');
      expect(prompt).toContain('do not force unrelated technologies into the answer');
    });
  });

  describe('Stealth Auto-Typer AppleScript Verification (macOS)', () => {
    it('parses complex code text without AppleScript syntax errors', () => {
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
      fs.unlinkSync(tmpCodePath);
      fs.unlinkSync(tmpScriptPath);
    });
  });
});
