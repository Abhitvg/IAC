import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Real Packaged macOS ARM64 Application Validation (Requirement 4)', () => {
  const packagedExecutable = path.resolve(
    __dirname,
    '../release/mac-arm64/AI-Interview-Assistant.app/Contents/MacOS/AI-Interview-Assistant'
  );
  const packagedResources = path.resolve(
    __dirname,
    '../release/mac-arm64/AI-Interview-Assistant.app/Contents/Resources'
  );
  const fixturesDir = path.resolve(__dirname, '../tests/fixtures/ocr');

  test.beforeAll(() => {
    if (!fs.existsSync(packagedExecutable)) {
      throw new Error(`Packaged application executable not found at: ${packagedExecutable}. Run npm run electron:build.`);
    }
  });

  test('launches the actual packaged ARM64 app, loads renderer, verifies preload and executes OCR pipeline', async () => {
    // Ensure clean production environment without dev server injection or node inspector
    const env = { ...process.env, NODE_ENV: 'production' };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VITE_DEV_SERVER_URL;

    const electronApp = await electron.launch({
      executablePath: packagedExecutable,
      args: ['--no-sandbox'],
      env,
    });

    try {
      // 1. Verify app window launches and renders successfully
      const window = await electronApp.firstWindow();
      expect(window).toBeTruthy();

      const title = await window.title();
      expect(title).toContain('AI Interview');

      const url = window.url();
      expect(url).toContain('app.asar/dist/index.html');

      // 2. Verify packaged preload script operates and exposes electronAPI
      const hasPreload = await window.evaluate(() => typeof (window as any).electronAPI !== 'undefined');
      expect(hasPreload).toBe(true);

      // 3. Verify packaged assets exist in Contents/Resources
      expect(fs.existsSync(path.join(packagedResources, 'bin', 'mac-ocr'))).toBe(true);
      expect(fs.existsSync(path.join(packagedResources, 'cmaps'))).toBe(true);
      expect(fs.existsSync(path.join(packagedResources, 'standard_fonts'))).toBe(true);

      // Helper to invoke parsePdf over packaged IPC
      const invokeParsePdf = async (buffer: Buffer): Promise<string> => {
        return await window.evaluate(async (base64) => {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return await (window as any).electronAPI.parsePdf(bytes.buffer);
        }, buffer.toString('base64'));
      };

      // 4. Test scanned single-page resume extraction through packaged application pipeline
      const singlePdfBytes = fs.readFileSync(path.join(fixturesDir, 'scanned_single_page.pdf'));
      const singleResult = await invokeParsePdf(singlePdfBytes);

      expect(singleResult).toContain('Samantha Vance');
      expect(singleResult).toContain('Lead Site Reliability Architect');
      expect(singleResult).toContain('Kubernetes, Prometheus, Terraform, Golang');
      expect(singleResult).not.toContain('Could not extract readable text');

      // 5. Test scanned multi-page resume extraction through packaged application pipeline
      const threePdfBytes = fs.readFileSync(path.join(fixturesDir, 'scanned_three_page.pdf'));
      const threeResult = await invokeParsePdf(threePdfBytes);

      expect(threeResult).toContain('Marcus Sterling');
      expect(threeResult).toContain('PAGE 1');
      expect(threeResult).toContain('PAGE 2');
      expect(threeResult).toContain('PAGE 3');
      expect(threeResult).toContain('38 percent');

      // 6. Test real embedded CID unmapped font document through packaged application pipeline
      const cidPdfBytes = fs.readFileSync(path.join(fixturesDir, 'real_cid_mapping_issue.pdf'));
      const cidResult = await invokeParsePdf(cidPdfBytes);

      expect(cidResult).toContain('Jordan Lee');
      expect(cidResult).toContain('Senior Distributed Database Architect');
      expect(cidResult).toContain('65 percent');
      // Must NOT contain corrupted mojibake
      expect(cidResult).not.toContain('00i03000G000d060000000:000500000');

      // 7. Verify failure handling on non-PDF corrupt input surfaces error notice without hallucinating candidate content
      const corruptBytes = Buffer.from('NOT_A_VALID_PDF_BINARY_CORRUPT_STREAM');
      const failureResult = await invokeParsePdf(corruptBytes);

      expect(failureResult === '' || failureResult.includes('Could not extract readable text')).toBe(true);
      // Invariant: Never fabricate candidate names, roles, or skills on failure
      expect(failureResult).not.toContain('Samantha');
      expect(failureResult).not.toContain('Engineer');
      expect(failureResult).not.toContain('CloudScale');
      expect(failureResult).not.toContain('TechNova');
    } finally {
      await electronApp.close();
    }
  });
});

