import { PDFParse } from "pdf-parse";
import { AppError, validationError } from "../../app-error.js";

export async function extractPdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) {
      throw validationError("The PDF has no extractable text.");
    }
    return text;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw validationError("The PDF could not be read.");
  } finally {
    await parser.destroy();
  }
}
