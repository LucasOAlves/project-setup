import PDFDocument from "pdfkit";
import type { CoverLetterContent } from "@studio/shared";

export async function buildCoverLetterPdf(letter: CoverLetterContent): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 60, info: { Title: `${letter.header.fullName} — Cover letter`.trim() } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  if (letter.header.fullName) doc.fontSize(16).text(letter.header.fullName);
  if (letter.header.contactLine) doc.fontSize(10).fillColor("#333").text(letter.header.contactLine).fillColor("#000");
  doc.moveDown(1.5);
  doc.fontSize(11).text(letter.greeting);
  doc.moveDown();
  for (const paragraph of letter.paragraphs) {
    doc.fontSize(11).text(paragraph, { align: "left" });
    doc.moveDown();
  }
  doc.fontSize(11).text(letter.signOff);

  doc.end();
  return done;
}
