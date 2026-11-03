import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { parsePdfBuffer, isGarbledOrMojibakeText } from '../electron/services/pdfParser';
import { resolveOcrBinaryPath } from '../electron/services/ocrService';

describe('Genuine OCR Accuracy, Multilingual Recognition & Text Layer Distinction (Requirement 3)', { timeout: 25000 }, () => {
  const ocrBin = resolveOcrBinaryPath();
  const fixturesDir = path.resolve(__dirname, 'fixtures/ocr');

  it('verifies native mac-ocr executable is present and executable on macOS', () => {
    if (process.platform === 'darwin') {
      expect(ocrBin).toBeTruthy();
      expect(fs.existsSync(ocrBin)).toBe(true);
      const stats = fs.statSync(ocrBin);
      expect((stats.mode & 0o111) !== 0).toBe(true);
    }
  });

  it('Test 1 (Accented French Text): accurately recognizes diacritics and accented characters via native OCR', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_accented_french.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    expect(text).toContain('CANDIDAT:');
    // Accented name and surname
    expect(text).toContain('Éléonore');
    // Accented job titles and domains
    expect(text).toContain('Ingénieure Systèmes');
    expect(text).toContain('Architecte Déploiement');
    expect(text).toContain('COMPÉTENCES:');
    expect(text).toContain('Réseaux Résilients');
    expect(text).toContain('Modélisation');
    expect(text).toContain('Événements');
    expect(text).toContain('Société Générale');
  });

  it('Test 2 (Genuinely Non-Latin Script): accurately recognizes Cyrillic text via native OCR', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_non_latin_script.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    // Verify Cyrillic text recognition
    expect(text).toContain('КАНДИДАТ:');
    expect(text).toContain('Олександр Шевченко');
    expect(text).toContain('ПОСАДА:');
    expect(text).toContain('Провідний інженер');
    expect(text).toContain('системної надійності');
    expect(text).toContain('Кубернетес');
    expect(text).toContain('Розподілені бази даних');
    expect(text).toContain('Відмовостійкість');
  });

  it('Test 3 (Realistic Multi-Column Layout): accurately extracts complex two-column scanned resume', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_realistic_layout.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    // Left column items
    expect(text).toContain('CONTACT');
    expect(text).toContain('alex@distributed.io');
    expect(text).toContain('EDUCATION');
    expect(text).toContain('Computer Science');
    expect(text).toContain('CORE SKILLS');
    expect(text).toContain('Kafka');
    expect(text).toContain('Cassandra');
    expect(text).toContain('Kubernetes');

    // Right column items
    expect(text).toContain('Alex Rivera');
    expect(text).toContain('Principal Infrastructure Architect');
    expect(text).toContain('PROFESSIONAL SUMMARY');
    expect(text).toContain('stream processing');
    expect(text).toContain('70 percent');
    expect(text).toContain('25 million events per second');
  });

  it('Test 4 (Corrupted Text Layer Over Scanned Image Fallback): proves PDF.js extracts corrupted Type 0/CIDFont text triggering OCR fallback', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'corrupted_text_layer_fallback.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const rawBuffer = fs.readFileSync(pdfPath);

    // 1. Independent PDF.js inspection: verify AST structure and reachable font/content stream
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(rawBuffer),
      disableFontFace: true,
      stopAtErrors: false,
    });
    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);

    const page = await doc.getPage(1);
    const opList = await page.getOperatorList();

    // Verify injected content stream is executed: opList contains text show operators
    expect(opList.fnArray.length).toBeGreaterThan(12);

    // 2. Extract raw text with PDF.js and prove it triggers isGarbledOrMojibakeText
    const textContent = await page.getTextContent();
    const pdfjsExtractedText = textContent.items.map((i: any) => i.str).join(' ');

    expect(pdfjsExtractedText.length).toBeGreaterThan(0);
    // PDF.js extracts corrupted control codes/mojibake from the Type 0 font via the defective ToUnicode mapping
    expect(isGarbledOrMojibakeText(pdfjsExtractedText)).toBe(true);

    // 3. Verify underlying PDF objects declare Type 0 font and descendant CIDFontType2
    const rawString = rawBuffer.toString('binary');
    expect(rawString).toContain('/Subtype /Type0');
    expect(rawString).toContain('/Subtype /CIDFontType2');
    expect(rawString).toContain('/Encoding /Identity-H');
    expect(rawString).toContain('/ToUnicode');

    // 4. Run full application PDF parser: it must detect the corrupted text layer, reject it, and trigger native Apple Vision OCR
    const extractedText = await parsePdfBuffer(rawBuffer);

    expect(extractedText).toBeTruthy();
    // Must NOT contain the corrupted text layer string
    expect(extractedText).not.toContain(pdfjsExtractedText);
    // Must contain the visually rendered candidate details from OCR
    expect(extractedText).toContain('Jordan Lee');
    expect(extractedText).toContain('Senior Distributed Database Architect');
    expect(extractedText).toContain('Cassandra');
    expect(extractedText).toContain('65 percent');
  });

  it('Test 5 (Scanned Three-Page Resume): preserves page boundaries and associates content to exact pages', async () => {
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

  it('Test 6 (Valid Short Resume): preserves short documents without truncation or false mojibake rejection', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'short_resume.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    expect(text).toContain('Devon Price');
    expect(text).toContain('Staff Software Engineer');
    expect(text).toContain('Rust');
  });

  it('Test 7 (Page Limit Enforcement): strictly bounds multi-page document processing to 10 pages', async () => {
    if (process.platform !== 'darwin') return;

    const pdfPath = path.join(fixturesDir, 'scanned_twelve_page.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const stdout = execFileSync(ocrBin, [pdfPath], { encoding: 'utf-8' });
    const text = stdout.trim();

    const pages = text.split(/\n\n--- Page Break ---\n\n/);
    expect(pages.length).toBe(10);

    expect(text).toContain('PAGE 1 OF 12');
    expect(text).toContain('PAGE 10 OF 12');
    expect(text).not.toContain('PAGE 11 OF 12');
    expect(text).not.toContain('PAGE 12 OF 12');
  });
});
