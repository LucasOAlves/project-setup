import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentContentHash, nextDocumentVersion } from "./document-versioning.js";

describe("documentContentHash", () => {
  it("is a sha256 hex digest", () => {
    assert.match(documentContentHash({ a: 1 }), /^[0-9a-f]{64}$/);
  });

  it("does not depend on key order, at any depth", () => {
    assert.equal(
      documentContentHash({ summary: "x", sections: [{ title: "A", items: ["1", "2"] }] }),
      documentContentHash({ sections: [{ items: ["1", "2"], title: "A" }], summary: "x" }),
    );
  });

  it("changes when any value or the order of a list changes", () => {
    const base = documentContentHash({ items: ["1", "2"], summary: "x" });
    assert.notEqual(documentContentHash({ items: ["2", "1"], summary: "x" }), base);
    assert.notEqual(documentContentHash({ items: ["1", "2"], summary: "y" }), base);
    assert.notEqual(documentContentHash({ items: ["1", "2"], summary: "x", extra: null }), base);
  });

  it("drops undefined fields like JSON does", () => {
    assert.equal(documentContentHash({ a: 1, b: undefined }), documentContentHash({ a: 1 }));
  });
});

describe("nextDocumentVersion", () => {
  it("starts at version 1", () => {
    assert.deepEqual(nextDocumentVersion(null, "h1"), { action: "CREATE", version: 1 });
  });

  it("adds a version when the content changed", () => {
    assert.deepEqual(nextDocumentVersion({ version: 3, contentHash: "h1" }, "h2"), { action: "CREATE", version: 4 });
  });

  it("keeps the latest version when the content is the same", () => {
    assert.deepEqual(nextDocumentVersion({ version: 3, contentHash: "h1" }, "h1"), { action: "UNCHANGED", version: 3 });
  });
});
