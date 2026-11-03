import { describe, it, expect } from 'vitest';
import { parsePdfBuffer, isGarbledOrMojibakeText } from '../electron/services/pdfParser';
import { getOcrEngineInfo, executeOcr } from '../electron/services/ocrService';

describe('PDF Extraction Reliability & Native OCR Bounds (P1)', () => {
  describe('Mojibake & Corrupt Text Detection', () => {
    it('detects unmapped CID font mojibake with high zero-interleaving and glyph tokens', () => {
      const mojibakeSample = `
        B cJ04 ~$b00X0J ? q ? i000 R 0000 E0 00i0( 0P0$0E0000g0t 0B 0S &00'E000 00/0s0_[LEQ00 ?
        00i03000G0[FJ0H00|90 R0 ~B 0Q/V00 000co *0./ 009 0|01 00 d p/f0^0E0,j0H 6 x0}0L0k'0 0m0i o00b!0000Y900
        00208V c{mN0000\`--=xW00=0IQ0000Kc^ Ga/ 0V d06000000 0 :0'00500000{0^ЛbPB Cv0afU}80f·0800\`000r[if0
        g| (0 000c000F00윽-0?0zT00[0,A0x0?<0Y0z000BM^50 5X u0d0000000 0U9X?0z0 0w00\\0 V0FKxy0 00f0000
      `;
      expect(isGarbledOrMojibakeText(mojibakeSample)).toBe(true);
    });

    it('does NOT reject legitimate non-English UTF-8 text (French, German, Spanish, Japanese, Chinese, Cyrillic)', () => {
      const frenchResume = `
        Expérience Professionnelle: Ingénieur Logiciel Senior chez Société Générale à Paris.
        Développement de microservices bancaires avec Spring Boot et Apache Kafka.
        Gestion d'une infrastructure cloud Kubernetes hautement disponible pour 50 000 utilisateurs quotidiens.
      `;
      expect(isGarbledOrMojibakeText(frenchResume)).toBe(false);

      const germanResume = `
        Berufserfahrung: Senior Cloud Architect bei Siemens AG in München.
        Konzeption und Implementierung hochverfügbarer Cloud-Infrastrukturen auf AWS und Microsoft Azure.
        Erfolgreiche Migration von Rechenzentrums-Workloads mit einer Kostenreduktion von 30%.
      `;
      expect(isGarbledOrMojibakeText(germanResume)).toBe(false);

      const japaneseResume = `
        職務経歴: シニアソフトウェアエンジニア、クラウド基盤開発部。
        分散型マイクロサービスアーキテクチャの設計および構築に従事。KubernetesとGo言語を活用し、レイテンシを40%削減。
      `;
      expect(isGarbledOrMojibakeText(japaneseResume)).toBe(false);

      const chineseResume = `
        个人工作经历：资深全栈工程师，负责大规模高并发分布式系统架构设计。
        精通 Kubernetes、Docker、PostgreSQL 与 React 微前端框架开发，服务超过百万级活跃用户。
      `;
      expect(isGarbledOrMojibakeText(chineseResume)).toBe(false);

      const cyrillicResume = `
        Опыт работы: Ведущий инженер по инфраструктуре и облачным сервисам.
        Проектирование и развертывание высоконагруженных кластеров Kubernetes, настройка CI/CD пайплайнов.
      `;
      expect(isGarbledOrMojibakeText(cyrillicResume)).toBe(false);
    });

    it('does NOT reject short but completely valid candidate documents', () => {
      const shortValid = 'Jane Doe — Staff Site Reliability Engineer. Certified Kubernetes Administrator (CKA).';
      expect(isGarbledOrMojibakeText(shortValid)).toBe(false);
    });
  });

  describe('Representative PDF Extraction Scenarios', { timeout: 25000 }, () => {
    it('returns empty string gracefully for non-PDF random bytes', async () => {
      const randomBytes = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const res = await parsePdfBuffer(randomBytes);
      expect(res).toBe('');
    });

    it('Scenario 1 (Normal Text PDF): extracts readable text accurately', async () => {
      const minimalPdf =
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 712 Td (Candidate Resume Text 2026) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000195 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n289\n%%EOF';
      const buf = Buffer.from(minimalPdf);
      const res = await parsePdfBuffer(buf.buffer);
      expect(res).toContain('Candidate Resume Text 2026');
    });

    it('Scenario 2 (Multi-Page PDF): extracts and aggregates text across multiple pages', async () => {
      // 2-page valid PDF
      const twoPagePdf =
        '%PDF-1.4\n' +
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Count 2/Kids[3 0 R 5 0 R]>>endobj\n' +
        '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n' +
        '4 0 obj<</Length 42>>stream\nBT /F1 12 Tf 72 712 Td (Page 1: Systems Engineering) Tj ET\nendstream\nendobj\n' +
        '5 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 6 0 R>>endobj\n' +
        '6 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 712 Td (Page 2: Kubernetes Infrastructure) Tj ET\nendstream\nendobj\n' +
        'xref\n0 7\n0000000000 65535 f \n' +
        '0000000009 00000 n \n0000000052 00000 n \n0000000105 00000 n \n0000000199 00000 n \n0000000291 00000 n \n0000000385 00000 n \n' +
        'trailer<</Size 7/Root 1 0 R>>\nstartxref\n479\n%%EOF';

      const res = await parsePdfBuffer(Buffer.from(twoPagePdf).buffer);
      expect(res).toContain('Page 1: Systems Engineering');
      expect(res).toContain('Page 2: Kubernetes Infrastructure');
    });

    it('Scenario 3 (Short Valid Resume): preserves concise summary without truncation or false mojibake rejection', async () => {
      const shortPdf =
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 35>>stream\nBT /F1 12 Tf 72 712 Td (Alex: Principal SRE) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000195 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n280\n%%EOF';
      const res = await parsePdfBuffer(Buffer.from(shortPdf).buffer);
      expect(res).toContain('Alex: Principal SRE');
    });

    it('Scenario 4 (Scanned or Image-Only PDF): detects lack of text layer and triggers OCR fallback or graceful notice', async () => {
      // Scanned PDF with no text stream in content
      const emptyContentPdf =
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 0>>stream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000195 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n245\n%%EOF';

      const res = await parsePdfBuffer(Buffer.from(emptyContentPdf).buffer);
      // Either OCR extracts text (if binary available) or returns helpful guidance notice
      expect(typeof res).toBe('string');
      expect(res.length).toBeGreaterThan(0);
    });
  });

  describe('Native Platform OCR Capabilities & Resource Safeguards', () => {
    it('accurately reports platform OCR capabilities without claiming fake OS support', () => {
      const info = getOcrEngineInfo();
      expect(info).toBeDefined();
      expect(info.maxPages).toBe(10);
      expect(info.maxFileSizeMb).toBe(15);
      expect(info.supportsPdfDirectly).toBe(true);

      if (process.platform === 'darwin') {
        expect(info.platform).toBe('darwin');
        expect(info.engine).toBe('apple_vision');
        expect(info.available).toBe(true);
      } else {
        expect(info.engine).toBe('none');
        expect(info.available).toBe(false);
      }
    });

    it('rejects files exceeding the 15MB maximum file size limit', async () => {
      const largeBuffer = new Uint8Array(16 * 1024 * 1024);
      const res = await executeOcr(largeBuffer);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/exceeds OCR limit/i);
    });
  });
});
