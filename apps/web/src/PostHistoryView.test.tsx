import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHistoryPublic, PostPublic } from "@studio/shared";
import { PostHistoryView } from "./PostHistoryView";
import * as api from "./api";

vi.mock("./api", () => ({
  fetchPostHistory: vi.fn(),
  updatePostTracking: vi.fn(),
}));

function buildPost(overrides: Partial<PostPublic> = {}): PostPublic {
  return {
    id: "post-1",
    createdAt: new Date().toISOString(),
    promptVersion: "post.v1",
    model: "fake",
    tone: "Direct",
    angle: "EDUCATIONAL",
    opportunityId: "opp-1",
    sourceTitle: "Some topic",
    sourceUrl: "https://example.com",
    hook: "Hook",
    body: "Body text",
    storyStrategy: {
      structure: "s",
      hookApproach: "h",
      narrativeArc: "n",
      evidenceToUse: ["e"],
      claimsToAvoid: [],
      takeaway: "t",
    },
    writingReview: { summary: "s", revisedSections: [], remainingRisks: [] },
    factReview: { summary: "s", claims: [], unsupportedClaims: [] },
    seoReview: { summary: "s", keywordsUsed: [], stuffingRisk: "low" },
    quality: { score: 80, explanation: "e", strengths: [], improvements: [] },
    status: "DRAFT",
    publishedAt: null,
    outcome: null,
    outcomeNotes: null,
    ...overrides,
  };
}

function buildHistory(overrides: Partial<PostHistoryPublic> = {}): PostHistoryPublic {
  return { posts: [buildPost()], total: 1, page: 1, pageSize: 10, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PostHistoryView pagination", () => {
  it("resets to page 1 when the sort option changes", async () => {
    vi.mocked(api.fetchPostHistory).mockResolvedValue(
      buildHistory({ total: 25, posts: [buildPost()] }),
    );
    render(<PostHistoryView onEdit={() => {}} />);
    await waitFor(() => expect(api.fetchPostHistory).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(api.fetchPostHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText(/sort/i), "2");
    await waitFor(() =>
      expect(api.fetchPostHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, sortBy: "score", sortDir: "desc" }),
      ),
    );
  });

  it("resets to page 1 when a new search is applied", async () => {
    vi.mocked(api.fetchPostHistory).mockResolvedValue(
      buildHistory({ total: 25, posts: [buildPost()] }),
    );
    render(<PostHistoryView onEdit={() => {}} />);
    await waitFor(() => expect(api.fetchPostHistory).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(api.fetchPostHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );

    await user.type(screen.getByPlaceholderText(/search hook and body/i), "migration");
    await user.click(screen.getByRole("button", { name: /apply search/i }));
    await waitFor(() =>
      expect(api.fetchPostHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, q: "migration" }),
      ),
    );
  });
});

describe("PostHistoryView editing", () => {
  it("calls onEdit with the clicked post's id", async () => {
    vi.mocked(api.fetchPostHistory).mockResolvedValue(
      buildHistory({ posts: [buildPost({ id: "post-abc" })] }),
    );
    const onEdit = vi.fn();
    render(<PostHistoryView onEdit={onEdit} />);
    await waitFor(() => expect(screen.getByText("Some topic")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit this post/i }));
    expect(onEdit).toHaveBeenCalledWith("post-abc");
  });
});
