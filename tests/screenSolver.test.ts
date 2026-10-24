import { describe, it, expect } from 'vitest';
import {
  detectLanguageHint,
  cleanExtractedOcrText,
  extractProblemHeadline,
  stitchOcrTexts,
  buildScreenSolverPrompt,
} from '../src/services/screenSolver';

describe('Screen Problem Solver & Multi-Page OCR Stitcher', () => {
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
Target line with period.`;
      const bottom = `Target line with period
Following line C
Following line D`;

      const result = stitchOcrTexts(top, bottom);
      expect(result).toContain('Line A');
      expect(result).toContain('Following line D');
      // The duplicated target line should be merged
      const lines = result.split('\n');
      expect(lines.filter((l) => l.toLowerCase().includes('target line')).length).toBe(1);
    });
  });

  describe('detectLanguageHint()', () => {
    it('detects English and non-English problem statements', () => {
      expect(detectLanguageHint('Given an array of integers').isNonEnglish).toBe(false);
      expect(detectLanguageHint('Dado un arreglo de enteros y un objetivo').languageName).toBe('Spanish');
      expect(detectLanguageHint('Étant donné un tableau d\'entiers').languageName).toBe('French');
      expect(detectLanguageHint('Gegeben ist ein Array von ganzen Zahlen').languageName).toBe('German');
      expect(detectLanguageHint('给定一个整数数组 nums 和一个整数目标值 target').languageName).toBe('Chinese');
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
  });

  describe('extractProblemHeadline()', () => {
    it('extracts LeetCode question numbers and titles accurately', () => {
      expect(extractProblemHeadline('42. Trapping Rain Water\nGiven n non-negative integers...')).toBe(
        '42. Trapping Rain Water'
      );
      expect(extractProblemHeadline('Design an LRU Cache\nImplement the LRUCache class')).toBe(
        'Design an LRU Cache'
      );
    });
  });

  describe('buildScreenSolverPrompt() - Zero-Fail Coding Prompt Enforcement', () => {
    it('mandates both Ultra-Minimal Typeable Body and Complete Compilable Class', () => {
      const prompt = buildScreenSolverPrompt(
        'Given an array nums. Return the maximum subarray sum. N <= 10^5.',
        'Java',
        'Senior Software Engineer',
        'coding'
      );

      // Must require ultra-minimal typeable solution for manual typing when paste is disabled
      expect(prompt).toContain('FORMAT 1: ULTRA-MINIMAL TYPEABLE SOLUTION');
      expect(prompt).toContain('5–12 LINES MAX');
      expect(prompt).toContain('TYPEABLE BODY');

      // Must require full compilable class with zero omissions
      expect(prompt).toContain('FORMAT 2: COMPLETE ONLINE JUDGE CLASS');
      expect(prompt).toContain('ZERO-OMISSION GUARANTEE');
      expect(prompt).toContain('NEVER use \'// TODO\', \'...\'');

      // Must mandate Big-O constraint enforcement to avoid TLE
      expect(prompt).toContain('N <= 10^5: MUST be O(N) or O(N log N)');
      expect(prompt).toContain('Time Limit Exceeded');

      // Must mandate defensive guards (overflow, negatives, null/empty)
      expect(prompt).toContain('64-bit integer overflow guard');
      expect(prompt).toContain('Empty/null (N=0)');
    });
  });
});
