import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { parsePdfBuffer } from '../electron/services/pdfParser';
import { resolveOcrBinaryPath, executeOcr } from '../electron/services/ocrService';

describe('Genuine OCR Accuracy & Native Multi-Page Integration Tests', () => {
  const ocrBin = resolveOcrBinaryPath();
  const fixturesDir = path.resolve(__dirname, 'fixtures/ocr');

  it('verifies native mac-ocr executable is present and executable on macOS', () => {
    if (process.platform === 'darwin') {
      expect(ocrBin).toBeTruthy();
      expect(fs.existsSync(ocrBin)).toBe(true);
      const stats = fs.statSync(ocrBin);
      // Verify executable permission bit
      expect((stats.mode & 0o111) !== 0).toBe(true);
    }
  });

  it('Test 1 (Scanned Single-Page Resume): extracts expected name, role, and skills accurately', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_single_page.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    expect(text).toBeTruthy();
    expect(text).toContain('Samantha Vance');
    expect(text).toContain('Lead Site Reliability Architect');
    expect(text).toContain('Kubernetes');
    expect(text).toContain('10 years');
    // Ensure no generic fallback message is confused with real OCR
    expect(text).not.toContain('Could not extract readable text');
  });

  it('Test 2 (Scanned Three-Page Resume): performs page-by-page OCR and associates text to correct pages', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_three_page.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    const pages = text.split(/\n\n--- Page Break ---\n\n/);
    expect(pages.length).toBe(3);

    // Page 1 assertions
    expect(pages[0]).toContain('CANDIDATE: Marcus Sterling');
    expect(pages[0]).toContain('Principal Cloud Infrastructure Engineer');

    // Page 2 assertions
    expect(pages[1]).toContain('ARCHITECTURE AND DISTRIBUTED SYSTEMS');
    expect(pages[1]).toContain('Kubernetes worker nodes');

    // Page 3 assertions
    expect(pages[2]).toContain('METRICS AND BUSINESS IMPACT');
    expect(pages[2]).toContain('38 percent');
  });

  it('Test 3 (Scanned Multilingual Document): extracts non-English European text accurately', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_multilingual.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    expect(text).toContain('Jean-Luc Dupont');
    expect(text).toMatch(/INGENIEUR SYSTEMES/i);
    expect(text).toContain('Societe Generale');
    expect(text).toContain('KUBERNETES');
  });

  it('Test 4 (Valid Short Resume): extracts short summary without dropping text', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'short_resume.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    expect(text).toContain('Devon Price');
    expect(text).toContain('Staff Software Engineer');
    expect(text).toContain('Rust');
  });

  it('Test 5 (Unusual Scanned Simulation): extracts text from visual pixels of unmapped document', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'unusual_cid_mojibake.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    expect(text).toContain('Jordan Lee');
    expect(text).toContain('Cassandra');
    expect(text).toContain('65 percent');
  });

  it('Test 6 (Page Limit Enforcement): strictly caps multi-page documents to max 10 pages', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_twelve_page.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    const pages = text.split(/\n\n--- Page Break ---\n\n/);
    // Max pages is bounded to 10
    expect(pages.length).toBe(10);

    // Page 1 and Page 10 must be present
    expect(text).toContain('PAGE 1 OF 12');
    expect(text).toContain('PAGE 10 OF 12');

    // Pages 11 and 12 must be excluded by the 10-page bound
    expect(text).not.toContain('PAGE 11 OF 12');
    expect(text).not.toContain('PAGE 12 OF 12');
  });

  it('Test 7 (Full Application PDF Parser Pipeline): falls back to OCR and extracts clean text from image-only PDF', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_single_page.pdf');
    const buffer = fs.readFileSync(pdfPath);

    // parsePdfBuffer runs PDF.js, detects 0 text length, and triggers executeOcr
    const extractedText = await parsePdfBuffer(buffer);

    expect(extractedText).toBeTruthy();
    expect(extractedText).toContain('Samantha Vance');
    expect(extractedText).toContain('Lead Site Reliability Architect');
    expect(extractedText).not.toContain('Could not extract readable text');
  });
});

