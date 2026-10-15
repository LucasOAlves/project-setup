import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../app-error.js";
import type { ApplicationDetailsRow } from "./application-details-repository.js";
import { ApplicationDetailsService } from "./application-details-service.js";

function fakeRepo() {
  let row: ApplicationDetailsRow | null = null;
  return {
    saved: [] as unknown[],
    async get() {
      return row;
    },
    async save(input: Omit<ApplicationDetailsRow, "id" | "version" | "updatedAt">) {
      this.saved.push(input);
      row = {
        id: "w",
        ...input,
        version: (row?.version ?? 0) + 1,
        updatedAt: new Date("2026-10-14T12:00:00Z"),
      } as ApplicationDetailsRow;
      return row;
    },
  };
}

test("get returns null before anything is saved", async () => {
  assert.equal(await new ApplicationDetailsService(fakeRepo() as never).get(), null);
});

test("save fills defaults, normalizes the currency and bumps the version on each save", async () => {
  const repo = fakeRepo();
  const service = new ApplicationDetailsService(repo as never);

  const first = await service.save({
    contact: { email: "dev@example.com", country: "Brazil" },
    spokenLanguages: [{ language: "English", level: "FLUENT" }],
    salaryExpectation: { amount: 7000, currency: "usd", period: "MONTH" },
  });
  assert.equal(first.version, 1);
  assert.equal(first.contact.email, "dev@example.com");
  assert.equal(first.contact.phone, "");
  assert.deepEqual(first.education, []);
  assert.equal(first.requiresVisaSponsorship, null);
  assert.deepEqual(first.salaryExpectation, { amount: 7000, currency: "USD", period: "MONTH" });

  const second = await service.save({ noticePeriod: "30 days" });
  assert.equal(second.version, 2);
  assert.equal(second.noticePeriod, "30 days");
});

test("save rejects an invalid email or language level without storing anything", async () => {
  const repo = fakeRepo();
  const service = new ApplicationDetailsService(repo as never);
  for (const input of [
    { contact: { email: "not-an-email" } },
    { spokenLanguages: [{ language: "English", level: "GOOD" }] },
  ]) {
    await assert.rejects(service.save(input), (error: unknown) => error instanceof AppError && error.statusCode === 400);
  }
  assert.equal(repo.saved.length, 0);
});
