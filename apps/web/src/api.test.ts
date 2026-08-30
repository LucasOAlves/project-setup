import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySectionComments,
  changePostAngle,
  changePostTone,
  fetchPostHistory,
  generateAlternativeHook,
  generatePost,
} from "./api";

function mockFetchOnce(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPostHistory", () => {
  it("builds a query string only from the fields that were provided", async () => {
    const fetchMock = mockFetchOnce({ posts: [], total: 0, page: 1, pageSize: 10 });

    await fetchPostHistory({ page: 2, q: "migration", sortBy: "score", sortDir: "asc" });

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    const params = new URL(calledUrl, "http://localhost").searchParams;
    expect(params.get("page")).toBe("2");
    expect(params.get("q")).toBe("migration");
    expect(params.get("sortBy")).toBe("score");
    expect(params.get("sortDir")).toBe("asc");
    expect(params.has("pageSize")).toBe(false);
  });
});

describe("post edit actions", () => {
  it("generatePost sends an empty body when no opportunityId or provider is given", async () => {
    const fetchMock = mockFetchOnce({ post: {} });
    await generatePost();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("generatePost includes opportunityId in the body when given", async () => {
    const fetchMock = mockFetchOnce({ post: {} });
    await generatePost("opp-1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ opportunityId: "opp-1" });
  });

  it("generateAlternativeHook sends an empty body when no postId or provider is given", async () => {
    const fetchMock = mockFetchOnce({ post: {} });
    await generateAlternativeHook();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("changePostTone omits postId from the wire body when not given", async () => {
    const fetchMock = mockFetchOnce({ post: {} });
    await changePostTone("Direct");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ tone: "Direct" });
  });

  it("changePostAngle includes postId when editing a specific historical post", async () => {
    const fetchMock = mockFetchOnce({ post: {} });
    await changePostAngle("EDUCATIONAL", "post-42");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ angle: "EDUCATIONAL", postId: "post-42" });
  });

  it("applySectionComments includes postId when given", async () => {
    const fetchMock = mockFetchOnce({ post: {} });
    await applySectionComments([{ excerpt: "Old hook.", comment: "Less direct." }], "post-42");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      sectionComments: [{ excerpt: "Old hook.", comment: "Less direct." }],
      postId: "post-42",
    });
  });
});
