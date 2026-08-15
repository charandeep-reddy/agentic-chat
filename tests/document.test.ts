import { describe, expect, it } from "vitest";
import { DocumentExtractionError, extractPdfText, formatDocumentBlock, truncateExtractedText } from "@/lib/document";

/**
 * Hand-built minimal single-page PDF containing the text "Hello World", so
 * `extractPdfText` can be exercised against a real PDF without a binary
 * fixture checked into the repo. The xref offsets are exact, which is what
 * lets pdf.js parse it without falling back to its recovery scanner.
 */
function samplePdfBytes(text: string): Uint8Array {
  const stream = `BT /F1 24 Tf 10 100 Td (${text}) Tj ET`;
  const objs = [
    `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n`,
    `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n`,
    `3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>endobj\n`,
    `4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n`,
    `5 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;

  return latin1Bytes(pdf);
}

/**
 * Two-page PDF: page 1 has plain text, page 2 paints a 1x1 image and no
 * text at all — the shape `hasUncapturedImages` exists to catch.
 */
function pdfWithImagePage(pageOneText: string): Uint8Array {
  const textStream = `BT /F1 12 Tf 10 100 Td (${pageOneText}) Tj ET`;
  const imageStream = "q 100 0 0 100 10 10 cm /Im1 Do Q";
  const rawRGB = "ff0000";

  const objs = [
    `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n`,
    `2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n`,
    `3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/MediaBox[0 0 200 200]/Contents 6 0 R>>endobj\n`,
    `4 0 obj<</Type/Page/Parent 2 0 R/Resources<</XObject<</Im1 8 0 R>>>>/MediaBox[0 0 200 200]/Contents 7 0 R>>endobj\n`,
    `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n`,
    `6 0 obj<</Length ${textStream.length}>>stream\n${textStream}\nendstream\nendobj\n`,
    `7 0 obj<</Length ${imageStream.length}>>stream\n${imageStream}\nendstream\nendobj\n`,
    `8 0 obj<</Type/XObject/Subtype/Image/Width 1/Height 1/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/ASCIIHexDecode/Length ${
      rawRGB.length + 1
    }>>stream\n${rawRGB}>\nendstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  let xref = "xref\n0 9\n0000000000 65535 f \n";
  for (let i = 1; i <= 8; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer<</Size 9/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return latin1Bytes(pdf);
}

function latin1Bytes(pdf: string): Uint8Array {
  const out = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) out[i] = pdf.charCodeAt(i);
  return out;
}

describe("truncateExtractedText", () => {
  it("returns the text unchanged when under the limit", () => {
    expect(truncateExtractedText("hello", 10)).toEqual({ text: "hello", truncated: false });
  });

  it("cuts at the limit and flags truncation", () => {
    expect(truncateExtractedText("abcdefghij", 5)).toEqual({ text: "abcde", truncated: true });
  });
});

describe("extractPdfText", () => {
  it("extracts text and page count from a real PDF", async () => {
    const result = await extractPdfText(samplePdfBytes("Hello World"));
    expect(result.pageCount).toBe(1);
    expect(result.text).toBe("Hello World");
    expect(result.truncated).toBe(false);
    expect(result.hasUncapturedImages).toBe(false);
  });

  it("flags a page that paints an image without much text of its own", async () => {
    const result = await extractPdfText(pdfWithImagePage("A short caption on page one."));
    expect(result.pageCount).toBe(2);
    expect(result.hasUncapturedImages).toBe(true);
  });

  it("rejects bytes that are not a valid PDF", async () => {
    await expect(extractPdfText(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(DocumentExtractionError);
  });
});

describe("formatDocumentBlock", () => {
  it("wraps the text in plain-text markers with a page count", () => {
    const block = formatDocumentBlock("report.pdf", {
      pageCount: 3,
      text: "body text",
      truncated: false,
      hasUncapturedImages: false,
    });
    expect(block).toBe(["[Attached file: report.pdf — 3 pages]", "body text", "[End of report.pdf]"].join("\n"));
  });

  it("uses singular 'page' for a one-page document and notes truncation", () => {
    const block = formatDocumentBlock("a.pdf", {
      pageCount: 1,
      text: "x",
      truncated: true,
      hasUncapturedImages: false,
    });
    expect(block).toContain("1 page, truncated");
  });

  it("notes when a page likely has an image or chart not captured as text", () => {
    const block = formatDocumentBlock("scan.pdf", {
      pageCount: 2,
      text: "sparse text",
      truncated: false,
      hasUncapturedImages: true,
    });
    expect(block).toContain("also contains images, charts, or scanned pages");
  });
});
