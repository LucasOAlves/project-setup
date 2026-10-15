import type postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = [
    "0001_profile.sql",
    "0002_persona.sql",
    "0003_research.sql",
    "0004_opportunities.sql",
    "0005_posts.sql",
    "0006_content_plan.sql",
    "0007_post_tracking.sql",
    "0008_source_scoping.sql",
    "0009_generated_images.sql",
    "0010_custom_topics.sql",
    "0011_opportunity_selected_at.sql",
    "0012_content_plan_upload.sql",
    "0013_career_foundation.sql",
    "0014_career_networking.sql",
    "0015_job_status_events.sql",
    "0016_job_hunter_foundation.sql",
    "0017_remotive_himalayas_sources.sql",
    "0018_job_normalized_data.sql",
    "0019_job_feedback.sql",
    "0020_workable_smartrecruiters_sources.sql",
    "0021_company_watches.sql",
    "0022_brave_web_search_source.sql",
    "0023_weworkremotely_source.sql",
    "0024_talent_platform_profiles.sql",
    "0025_application_details.sql",
    "0026_application_documents.sql",
    "0027_applications.sql",
    "0028_application_form_snapshot.sql",
    "0029_saved_form_answers.sql",
    "0030_application_preview.sql",
    "0031_application_agreed.sql",
    "0032_approvals.sql",
    "0033_portal_application_modes.sql",
    "0034_executions.sql",
    "0035_applied_from_submissions.sql",
    "0036_email_accounts.sql",
    "0037_recruiter_messages.sql",
    "0038_recruiter_message_classified_by.sql",
  ];

  for (const file of files) {
    const applied = await sql<{ id: string }[]>`
      SELECT id FROM schema_migrations WHERE id = ${file}
    `;
    if (applied.length > 0) {
      continue;
    }

    const contents = await readFile(path.join(migrationsDir, file), "utf8");
    const statements = contents
      .split(";")
      .map((statement) =>
        statement
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim(),
      )
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    await sql`INSERT INTO schema_migrations (id) VALUES (${file})`;
  }
}
