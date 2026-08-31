import PDFDocument from "pdfkit";
import type { ProfilePublic } from "@studio/shared";

export async function buildResumePdf(profile: ProfilePublic): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(20).text(profile.fullName || "Untitled profile");
  if (profile.headline) {
    doc.fontSize(12).fillColor("#444").text(profile.headline);
  }
  const role = [profile.currentJobTitle, profile.currentCompany].filter(Boolean).join(" · ");
  if (role) {
    doc.fontSize(11).fillColor("#444").text(role);
  }
  doc.fillColor("#000").moveDown();

  if (profile.about) {
    section(doc, "About");
    doc.fontSize(10).text(profile.about);
    doc.moveDown();
  }

  if (profile.experiences.length > 0) {
    section(doc, "Experience");
    for (const experience of profile.experiences) {
      const heading = [experience.role, experience.company].filter(Boolean).join(" — ");
      const dates = [experience.startPeriod, experience.endPeriod].filter(Boolean).join(" – ");
      if (heading) {
        doc.fontSize(12).text(heading, { continued: Boolean(dates) });
      }
      if (dates) {
        doc.fontSize(10).fillColor("#666").text(`  ${dates}`);
        doc.fillColor("#000");
      }
      if (experience.description) {
        doc.fontSize(10).text(experience.description);
      }
      if (experience.achievements) {
        doc.fontSize(10).text(`Achievements: ${experience.achievements}`);
      }
      if (experience.measurableOutcomes) {
        doc.fontSize(10).text(`Impact: ${experience.measurableOutcomes}`);
      }
      if (experience.technologies.length > 0) {
        doc.fontSize(10).fillColor("#666").text(experience.technologies.join(", "));
        doc.fillColor("#000");
      }
      doc.moveDown();
    }
  }

  if (profile.topSkills.length > 0) {
    section(doc, "Top skills");
    doc.fontSize(10).text(profile.topSkills.join(", "));
    doc.moveDown();
  }

  if (profile.technologies.length > 0) {
    section(doc, "Technologies");
    doc.fontSize(10).text(profile.technologies.join(", "));
    doc.moveDown();
  }

  if (profile.industries.length > 0) {
    section(doc, "Industries");
    doc.fontSize(10).text(profile.industries.join(", "));
  }

  doc.end();
  return done;
}

function section(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(14).text(title);
  doc.moveDown(0.25);
}
