import fs from 'fs';
import path from 'path';

/**
 * Generates a valid PDF with an embedded image layer of a candidate resume
 * overlaid with an unmapped CID font text layer (00i03000G0...) that extracts
 * as garbled mojibake in PDF.js, forcing fallback to native OCR.
 */
export function generateCidCorruptedPdf(outputPath: string, basePdfPath: string) {
  // Read the visual single-page scanned PDF that contains the image of the resume
  const baseBytes = fs.readFileSync(basePdfPath);
  let pdfStr = baseBytes.toString('binary');

  // Inject a text content stream with unmapped CID glyph bytes
  const textStreamContent = `BT\n/F_UNMAPPED 12 Tf\n50 700 Td\n(00i03000G000d060000000:000500000 00A01000B0 00C02000D0) Tj\nET\n`;
  const streamLength = textStreamContent.length;

  const fontObjNum = 901;
  const streamObjNum = 902;

  const injectedObjects = `
${fontObjNum} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
${streamObjNum} 0 obj
<< /Length ${streamLength} >>
stream
${textStreamContent}
endstream
endobj
`;

  // Find page object and add the stream and font to resources
  // Replace "/Contents 4 0 R" with "/Contents [4 0 R 902 0 R]" or inject into Resources
  // In PDFKit-generated PDF: "/Contents X 0 R"
  const contentsMatch = pdfStr.match(/\/Contents\s+(\d+\s+\d+\s+R)/);
  if (contentsMatch) {
    const existingContents = contentsMatch[1];
    pdfStr = pdfStr.replace(
      contentsMatch[0],
      `/Contents [${existingContents} ${streamObjNum} 0 R]`
    );
  }

  // Inject font into /Resources
  const fontMatch = pdfStr.match(/\/Font\s*<<[^>]*>>/);
  if (fontMatch) {
    pdfStr = pdfStr.replace(
      fontMatch[0],
      fontMatch[0].replace('>>', ` /F_UNMAPPED ${fontObjNum} 0 R >>`)
    );
  } else {
    // If no /Font in resources, inject into /Resources << ... >>
    const resMatch = pdfStr.match(/\/Resources\s*<<([^>]*)>>/);
    if (resMatch) {
      pdfStr = pdfStr.replace(
        resMatch[0],
        `/Resources << ${resMatch[1]} /Font << /F_UNMAPPED ${fontObjNum} 0 R >> >>`
      );
    }
  }

  // Append new objects before xref
  const xrefIndex = pdfStr.lastIndexOf('xref');
  if (xrefIndex !== -1) {
    pdfStr = pdfStr.slice(0, xrefIndex) + injectedObjects + pdfStr.slice(xrefIndex);
  } else {
    pdfStr = pdfStr + injectedObjects;
  }

  fs.writeFileSync(outputPath, Buffer.from(pdfStr, 'binary'));
}

