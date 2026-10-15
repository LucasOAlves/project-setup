import {
  applicationDetailsInputSchema,
  applicationDetailsPublicSchema,
  type ApplicationDetailsPublic,
} from "@studio/shared";
import { validationError } from "../../app-error.js";
import type { ApplicationDetailsRepository, ApplicationDetailsRow } from "./application-details-repository.js";

// Application details (Milestone 2): validate and store. Never passed to a text provider.
export class ApplicationDetailsService {
  constructor(private readonly repo: Pick<ApplicationDetailsRepository, "get" | "save">) {}

  async get(): Promise<ApplicationDetailsPublic | null> {
    const row = await this.repo.get();
    return row ? toPublic(row) : null;
  }

  async save(raw: unknown): Promise<ApplicationDetailsPublic> {
    const parsed = applicationDetailsInputSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw validationError(parsed.error.issues[0]?.message ?? "The application details are invalid.");
    }
    return toPublic(await this.repo.save(parsed.data));
  }
}

// Rows are written only through the input schema; parsing on the way out fills defaults for
// any field added later.
function toPublic(row: ApplicationDetailsRow): ApplicationDetailsPublic {
  return applicationDetailsPublicSchema.parse({
    contact: row.contact,
    education: row.education,
    certifications: row.certifications,
    spokenLanguages: row.spokenLanguages,
    workAuthorization: row.workAuthorization,
    requiresVisaSponsorship: row.requiresVisaSponsorship,
    noticePeriod: row.noticePeriod,
    timeZone: row.timeZone,
    salaryExpectation: row.salaryExpectation,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}
