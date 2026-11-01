import fs from 'fs';
import zlib from 'zlib';

/**
 * Generates a valid PDF with an embedded visual image layer of a candidate resume
 * overlaid with a Type 0 / CIDFont text layer having a deliberately corrupted ToUnicode mapping:
 * - Declares a genuine Type 0 font (/Subtype /Type0) referencing descendant /CIDFontType2
 *   with /Encoding /Identity-H and a deliberately corrupted ToUnicode CMap.
 * - Injects text operations into the reachable page content stream.
 * - Proves that PDF.js extracts corrupted text via the defective ToUnicode mapping, triggering
 *   isGarbledOrMojibakeText and falling back to native Apple Vision OCR.
 */
export function generateCidCorruptedPdf(outputPath: string, basePdfPath: string) {
  const baseBytes = fs.readFileSync(basePdfPath);
  let pdfStr = baseBytes.toString('binary');

  // Text content operator with 16-bit Identity-H CIDs
  const textOp = '\nBT /F_UNMAPPED 12 Tf 50 700 Td <000100020003000400050006000700080009000a000b000c000d000e000f> Tj ET\n';

  // Find stream in object 3, decompress, append text operator, and recompress
  const streamStart = pdfStr.indexOf('stream\n', pdfStr.indexOf('3 0 obj')) + 7;
  const streamEnd = pdfStr.indexOf('endstream', streamStart);
  const streamBytes = baseBytes.subarray(streamStart, streamEnd);
  const decompressed = zlib.inflateSync(streamBytes);
  const newStreamContent = Buffer.concat([decompressed, Buffer.from(textOp)]);
  const newCompressed = zlib.deflateSync(newStreamContent);

  const oldObj3 = pdfStr.slice(pdfStr.indexOf('3 0 obj'), pdfStr.indexOf('endobj', pdfStr.indexOf('3 0 obj')) + 6);
  const newObj3 = `3 0 obj\n<< /Filter /FlateDecode /Length ${newCompressed.length} >>\nstream\n${newCompressed.toString('binary')}\nendstream\nendobj`;
  pdfStr = pdfStr.replace(oldObj3, newObj3);

  // In Object 4 (/Resources): wire /Font << /F_UNMAPPED 901 0 R >>
  pdfStr = pdfStr.replace(
    '4 0 obj\n<< /ProcSet [ /PDF /ImageB /ImageC /ImageI ] /XObject << /Im1 5 0 R >> >>',
    '4 0 obj\n<< /ProcSet [ /PDF /ImageB /ImageC /ImageI /Text ] /XObject << /Im1 5 0 R >> /Font << /F_UNMAPPED 901 0 R >> >>'
  );

  // ToUnicode CMap mapping
  const toUnicodeContent = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Custom-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<0001> <0020>
endcodespacerange
15 beginbfchar
<0001> <0030>
<0002> <0030>
<0003> <0069>
<0004> <0030>
<0005> <0033>
<0006> <0030>
<0007> <0030>
<0008> <0030>
<0009> <0047>
<000a> <0030>
<000b> <0030>
<000c> <0030>
<000d> <0064>
<000e> <0030>
<000f> <0036>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  const injectedObjects = `
901 0 obj
<<
  /Type /Font
  /Subtype /Type0
  /BaseFont /CustomCIDFont-Identity-H
  /Encoding /Identity-H
  /DescendantFonts [ 903 0 R ]
  /ToUnicode 905 0 R
>>
endobj
903 0 obj
<<
  /Type /Font
  /Subtype /CIDFontType2
  /BaseFont /CustomCIDFont
  /CIDSystemInfo <<
    /Registry (Adobe)
    /Ordering (Identity)
    /Supplement 0
  >>
  /FontDescriptor 904 0 R
  /DW 1000
>>
endobj
904 0 obj
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
905 0 obj
<< /Length ${toUnicodeContent.length} >>
stream
${toUnicodeContent}
endstream
endobj
`;

  const xrefIdx = pdfStr.lastIndexOf('xref');
  pdfStr = pdfStr.slice(0, xrefIdx) + injectedObjects + pdfStr.slice(xrefIdx);

  fs.writeFileSync(outputPath, Buffer.from(pdfStr, 'binary'));
}



