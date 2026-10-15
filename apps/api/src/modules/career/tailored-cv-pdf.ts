import PDFDocument from "pdfkit";
import type { TailoredCvContent } from "@studio/shared";

// One column, real text, standard section names: what applicant tracking systems parse best.
export async function buildTailoredCvPdf(cv: TailoredCvContent): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50, info: { Title: `${cv.header.fullName} — CV`.trim() } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(20).text(cv.header.fullName || "Candidate");
  if (cv.header.headline) doc.fontSize(12).fillColor("#333").text(cv.header.headline);
  for (const line of [cv.header.contactLine, cv.header.links.join(" · ")]) {
    if (line) doc.fontSize(10).fillColor("#333").text(line);
  }
  doc.fillColor("#000").moveDown();

  if (cv.summary.length > 0) {
    section(doc, "Summary");
    doc.fontSize(10).text(cv.summary.join(" "));
    doc.moveDown();
  }

  const seen = new Set<string>();
  const skills = [...cv.topSkills, ...cv.technologies].filter((skill) => {
    const key = skill.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (skills.length > 0) {
    section(doc, "Skills");
    doc.fontSize(10).text(skills.join(", "));
    doc.moveDown();
  }

  if (cv.experiences.length > 0) {
    section(doc, "Experience");
    for (const experience of cv.experiences) {
      const heading = [experience.role, experience.company].filter(Boolean).join(", ");
      const dates = [experience.startPeriod, experience.endPeriod].filter(Boolean).join(" – ");
      doc.fontSize(11).text(heading || "Role");
      if (dates) doc.fontSize(10).fillColor("#555").text(dates).fillColor("#000");
      for (const highlight of experience.highlights) {
        doc.fontSize(10).text(`•  ${highlight}`, { indent: 8 });
      }
      doc.moveDown(0.6);
    }
  }

  for (const [title, items] of [
    ["Education", cv.education],
    ["Certifications", cv.certifications],
    ["Languages", cv.languages],
  ] as const) {
    if (items.length === 0) continue;
    section(doc, title);
    for (const item of items) doc.fontSize(10).text(item);
    doc.moveDown();
  }

  doc.end();
  return done;
}

function section(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(13).text(title.toUpperCase());
  doc.moveDown(0.25);
}
