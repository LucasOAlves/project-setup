import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@studio/shared";
import { AppError } from "../../app-error.ts";
import { normalizeSmartRecruitersPosting, SmartRecruitersJobProvider } from "./smartrecruiters-job-provider.ts";

test("normalizeSmartRecruitersPosting maps the job ad sections and builds the public URL", () => {
  const posting = normalizeSmartRecruitersPosting(
    {
      id: "744000012345678",
      name: "Senior Software Engineer",
      releasedDate: "2026-10-02T10:00:00.000Z",
      company: { name: "Acme Inc", identifier: "AcmeInc" },
      location: { city: "São Paulo", country: "br", remote: true },
      typeOfEmployment: { id: "permanent", label: "Full-time" },
      jobAd: {
        sections: {
          jobDescription: { title: "Job Description", text: "<p>Build services in TypeScript.</p>" },
          qualifications: { title: "Qualifications", text: "<ul><li>5+ years</li></ul>" },
        },
      },
    },
    "AcmeInc",
  );

  assert.equal(posting?.url, "https://jobs.smartrecruiters.com/AcmeInc/744000012345678");
  assert.equal(posting?.location, "Remote (São Paulo, br)");
  assert.equal(posting?.description, "Build services in TypeScript.\n\n5+ years");
  assert.equal(posting?.companyNameFromSource, "Acme Inc");
  assert.equal(posting?.postedAt?.toISOString(), "2026-10-02T10:00:00.000Z");
  assert.equal(posting?.employmentType, "Full-time");
});

test("listJobs fetches each posting's detail and keeps a posting whose detail fails", async () => {
  const requests: string[] = [];
  const provider = new SmartRecruitersJobProvider(async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/postings?limit=100")) {
      return new Response(
        JSON.stringify({
          content: [
            { id: "1", name: "Engineer", releasedDate: "2026-10-01T00:00:00Z", typeOfEmployment: { label: "Full-time" } },
            { id: "2", name: "Designer" },
          ],
        }),
      );
    }
    if (url.endsWith("/postings/1")) {
      return new Response(
        JSON.stringify({ id: "1", name: "Engineer", jobAd: { sections: { jobDescription: { text: "Do things." } } } }),
      );
    }
    return new Response("boom", { status: 500 });
  });

  const postings = await provider.listJobs("AcmeInc");

  assert.equal(requests[0], "https://api.smartrecruiters.com/v1/companies/AcmeInc/postings?limit=100");
  assert.equal(postings.length, 2);
  assert.equal(postings[0]?.description, "Do things.");
  assert.equal(postings[0]?.employmentType, "Full-time");
  assert.equal(postings[0]?.postedAt?.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(postings[1]?.description, "");
});

test("listJobs returns nothing for an empty company and maps a failed list to provider-unavailable", async () => {
  const empty = new SmartRecruitersJobProvider(async () => new Response(JSON.stringify({ content: [] })));
  assert.deepEqual(await empty.listJobs("Nobody"), []);

  const down = new SmartRecruitersJobProvider(async () => new Response("down", { status: 503 }));
  await assert.rejects(
    () => down.listJobs("AcmeInc"),
    (error: unknown) => error instanceof AppError && error.code === ERROR_CODES.PROVIDER_UNAVAILABLE,
  );
});
