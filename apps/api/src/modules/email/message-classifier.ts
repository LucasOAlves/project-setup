import { recruiterMessageClassificationSchema } from "@studio/shared";
import { parseJsonObject } from "../ai/parse-json.js";
import {
  buildRecruiterMessageUserPrompt,
  RECRUITER_MESSAGE_PROMPT_VERSION,
  RECRUITER_MESSAGE_SYSTEM_PROMPT,
} from "../ai/prompts/recruiter-message.v1.js";
import type { TextGenerationProvider } from "../ai/text-generation-provider.js";
import { classifyByRules, groundClassification, maskForModel, type ClassificationResult } from "./message-classification.js";

// Bounds what one classification costs. Grounding uses the same text the model saw.
const MAX_MESSAGE_TEXT = 8_000;

export type ClassificationOutcome = ClassificationResult & {
  // "RULES", the prompt version when a model answered, or "NONE" (no model, or it failed).
  classifiedBy: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

// Rules first for the ATS templates, then the text provider for the rest (Milestone 5,
// ticket 4). Only the masked subject and body go to the model, and its class stands only on
// a quote from that text. Any failure leaves the message UNCLEAR.
export class MessageClassifier {
  constructor(private readonly text: TextGenerationProvider | null) {}

  async classify(message: { subject: string; body: string }): Promise<ClassificationOutcome> {
    const subject = maskForModel(message.subject);
    const body = maskForModel(message.body);
    const none = { model: "", inputTokens: 0, outputTokens: 0 };

    const ruled = classifyByRules({ subject, body });
    if (ruled) return { ...ruled, classifiedBy: "RULES", ...none };
    if (!this.text) return { classification: "UNCLEAR", evidence: "", classifiedBy: "NONE", ...none };

    const messageText = `Subject: ${subject}\n\n${body}`.slice(0, MAX_MESSAGE_TEXT);
    try {
      const generated = await this.text.generateText({
        purpose: RECRUITER_MESSAGE_PROMPT_VERSION,
        system: RECRUITER_MESSAGE_SYSTEM_PROMPT,
        user: buildRecruiterMessageUserPrompt(messageText),
      });
      const usage = {
        model: generated.model,
        inputTokens: generated.usage?.inputTokens ?? 0,
        outputTokens: generated.usage?.outputTokens ?? 0,
      };
      const parsed = recruiterMessageClassificationSchema.safeParse(parseJsonObject(generated.text));
      if (!parsed.success) return { classification: "UNCLEAR", evidence: "", classifiedBy: RECRUITER_MESSAGE_PROMPT_VERSION, ...usage };
      return { ...groundClassification(parsed.data, messageText), classifiedBy: RECRUITER_MESSAGE_PROMPT_VERSION, ...usage };
    } catch {
      return { classification: "UNCLEAR", evidence: "", classifiedBy: "NONE", ...none };
    }
  }
}
