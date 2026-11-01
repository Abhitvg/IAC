import fs from 'fs';
import path from 'path';

/**
 * Generates a valid PDF with an embedded image layer of a candidate resume
 * overlaid with a corrupted text layer:
 * - Declares a genuine Type 0 / CIDFont structure (/Subtype /Type0 with descendant /CIDFontType2)
 *   with /Encoding /Identity-H lacking a valid /ToUnicode mapping table.
 * - Injects unmapped glyph character sequences and garbled mojibake tokens into the content stream.
 * 
 * In PDF.js, unmapped/corrupted text layers extract as garbled mojibake or unmapped character
 * codes, triggering isGarbledOrMojibakeText and falling back to native Apple Vision OCR.
 */
export function generateCidCorruptedPdf(outputPath: string, basePdfPath: string) {
  // Read the visual single-page scanned PDF that contains the image of the resume
  const baseBytes = fs.readFileSync(basePdfPath);
  let pdfStr = baseBytes.toString('binary');

  // Text content stream with unmapped CID character tokens and mojibake interleaving
  const textStreamContent = `BT\n/F_UNMAPPED 12 Tf\n50 700 Td\n(00i03000G000d060000000:000500000 00A01000B0 00C02000D0) Tj\nET\n`;
  const streamLength = textStreamContent.length;

  const fontObjNum = 901;
  const descendantCidObjNum = 903;
  const descriptorObjNum = 904;
  const streamObjNum = 902;

  // Genuine Type 0 font referencing descendant CIDFontType2 without a /ToUnicode CMap
  const injectedObjects = `
${fontObjNum} 0 obj
<<
  /Type /Font
  /Subtype /Type0
  /BaseFont /CustomCIDFont-Identity-H
  /Encoding /Identity-H
  /DescendantFonts [ ${descendantCidObjNum} 0 R ]
>>
endobj
${descendantCidObjNum} 0 obj
<<
  /Type /Font
  /Subtype /CIDFontType2
  /BaseFont /CustomCIDFont
  /CIDSystemInfo <<
    /Registry (Adobe)
    /Ordering (Identity)
    /Supplement 0
  >>
  /FontDescriptor ${descriptorObjNum} 0 R
  /DW 1000
>>
endobj
${descriptorObjNum} 0 obj
<<
  /Type /FontDescriptor
  /FontName /CustomCIDFont
  /Flags 4
  /FontBBox [-500 -300 1200 1000]
  /ItalicAngle 0
  /Ascent 800
  /Descent -200
  /CapHeight 700
  /StemV 80
>>
endobj
${streamObjNum} 0 obj
<< /Length ${streamLength} >>
stream
${textStreamContent}
endstream
endobj
`;

  // Find page object and add the stream to /Contents
  const contentsMatch = pdfStr.match(/\/Contents\s+(\d+\s+\d+\s+R)/);
  if (contentsMatch) {
    const existingContents = contentsMatch[1];
    pdfStr = pdfStr.replace(
      contentsMatch[0],
      `/Contents [${existingContents} ${streamObjNum} 0 R]`
    );
  }

  // Inject Type 0 font into /Resources /Font
  const fontMatch = pdfStr.match(/\/Font\s*<<[^>]*>>/);
  if (fontMatch) {
    pdfStr = pdfStr.replace(
      fontMatch[0],
      fontMatch[0].replace('>>', ` /F_UNMAPPED ${fontObjNum} 0 R >>`)
    );
  } else {
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


