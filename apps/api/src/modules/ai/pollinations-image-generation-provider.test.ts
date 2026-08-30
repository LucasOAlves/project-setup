import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../app-error.ts";
import { PollinationsImageGenerationProvider } from "./pollinations-image-generation-provider.ts";

test("returns the fetched bytes and mime type on success", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const fetchImpl = (async (url: string | URL) => {
    assert.ok(String(url).startsWith("https://image.pollinations.ai/prompt/"));
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => bytes.buffer,
    } as Response;
  }) as typeof fetch;

  const provider = new PollinationsImageGenerationProvider(fetchImpl);
  const result = await provider.generateImage({ prompt: "a blue circle" });

  assert.equal(result.mimeType, "image/jpeg");
  assert.deepEqual([...result.bytes], [1, 2, 3, 4]);
  assert.equal(result.model, "pollinations/flux");
});

test("maps a rate-limited response to a retryable error", async () => {
  const fetchImpl = (async () =>
    ({ ok: false, status: 429, headers: new Headers() }) as Response) as typeof fetch;
  const provider = new PollinationsImageGenerationProvider(fetchImpl);

  await assert.rejects(
    () => provider.generateImage({ prompt: "a blue circle" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 503,
  );
});

test("maps a network failure to a provider-unavailable error", async () => {
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  const provider = new PollinationsImageGenerationProvider(fetchImpl);

  await assert.rejects(
    () => provider.generateImage({ prompt: "a blue circle" }),
    (error: unknown) => error instanceof AppError && error.code === "PROVIDER_UNAVAILABLE",
  );
});
