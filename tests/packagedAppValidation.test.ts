import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { parsePdfBuffer } from '../electron/services/pdfParser';
import { getOcrEngineInfo } from '../electron/services/ocrService';

describe('Packaged Application Validation (macOS ARM64)', () => {
  const packagedResourcesDir = path.resolve(
    __dirname,
    '../release/mac-arm64/AI-Interview-Assistant.app/Contents/Resources'
  );
  const packagedBinPath = path.join(packagedResourcesDir, 'bin', 'mac-ocr');
  const packagedCmapsDir = path.join(packagedResourcesDir, 'cmaps');
  const packagedFontsDir = path.join(packagedResourcesDir, 'standard_fonts');
  const fixturesDir = path.resolve(__dirname, 'fixtures/ocr');

  beforeAll(() => {
    if (!fs.existsSync(packagedResourcesDir)) {
      throw new Error(
        `Packaged resources directory not found at: ${packagedResourcesDir}. Please run npm run electron:build first.`
      );
    }
  });

  it('verifies packaged binary and PDF resources are present in Contents/Resources', () => {
    expect(fs.existsSync(packagedBinPath)).toBe(true);
    // Check executable permission
    fs.accessSync(packagedBinPath, fs.constants.X_OK);

    expect(fs.existsSync(packagedCmapsDir)).toBe(true);
    const cmaps = fs.readdirSync(packagedCmapsDir);
    expect(cmaps.length).toBeGreaterThan(50);

    expect(fs.existsSync(packagedFontsDir)).toBe(true);
    const fonts = fs.readdirSync(packagedFontsDir);
    expect(fonts.length).toBeGreaterThan(10);
  });

  it('runs packaged mac-ocr binary directly against scanned test PDFs', () => {
    const singlePdf = path.join(fixturesDir, 'scanned_single_page.pdf');
    const result = spawnSync(packagedBinPath, [singlePdf], {
      encoding: 'utf-8',
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Samantha Vance');
    expect(result.stdout).toContain('Lead Site Reliability Architect');
    expect(result.stdout).toContain('Kubernetes, Prometheus, Terraform, Golang');
  });

  it('runs packaged mac-ocr binary against multi-page scanned PDF', () => {
    const threePdf = path.join(fixturesDir, 'scanned_three_page.pdf');
    const result = spawnSync(packagedBinPath, [threePdf], {
      encoding: 'utf-8',
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PAGE 1');
    expect(result.stdout).toContain('Marcus Sterling');
    expect(result.stdout).toContain('PAGE 2');
    expect(result.stdout).toContain('active-active failover');
    expect(result.stdout).toContain('PAGE 3');
    expect(result.stdout).toContain('38 percent');
  });

  it('verifies PDF extraction pipeline resolves resources from process.resourcesPath', async () => {
    const originalResourcesPath = process.resourcesPath;
    try {
      // Simulate running inside packaged app
      (process as any).resourcesPath = packagedResourcesDir;

      const engineInfo = getOcrEngineInfo();
      expect(engineInfo.available).toBe(true);
      expect(engineInfo.binaryPath).toBe(packagedBinPath);

      const singlePdf = path.join(fixturesDir, 'scanned_single_page.pdf');
      const buffer = fs.readFileSync(singlePdf);
      const text = await parsePdfBuffer(buffer);

      expect(text).toContain('Samantha Vance');
      expect(text).toContain('Lead Site Reliability Architect');
      expect(text).not.toContain('Could not extract readable text');
    } finally {
      (process as any).resourcesPath = originalResourcesPath;
    }
  });

  it('verifies packaged PDF extraction on multilingual scanned documents', async () => {
    const originalResourcesPath = process.resourcesPath;
    try {
      (process as any).resourcesPath = packagedResourcesDir;

      const multiPdf = path.join(fixturesDir, 'scanned_multilingual.pdf');
      const buffer = fs.readFileSync(multiPdf);
      const text = await parsePdfBuffer(buffer);

      expect(text).toContain('Jean-Luc Dupont');
      expect(text).toContain('Societe Generale');
      expect(text).toContain('KUBERNETES');
      expect(text).not.toContain('Could not extract readable text');
    } finally {
      (process as any).resourcesPath = originalResourcesPath;
    }
  });
});
