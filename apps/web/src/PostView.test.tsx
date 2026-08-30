import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostPublic } from "@studio/shared";
import { PostView } from "./PostView";
import * as api from "./api";

vi.mock("./api", () => ({
  fetchPost: vi.fn(),
  fetchPostById: vi.fn(),
  fetchOpportunities: vi.fn(),
  fetchSelectedOpportunities: vi.fn(),
  fetchPostImage: vi.fn().mockResolvedValue(null),
  generatePost: vi.fn(),
  generateAlternativeHook: vi.fn(),
  generateImage: vi.fn(),
  changePostTone: vi.fn(),
  changePostAngle: vi.fn(),
  rewritePostSection: vi.fn(),
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchPostImage).mockResolvedValue(null);
});

describe("PostView loading a historical draft", () => {
  it("fetches by id and skips the opportunity-staleness check when editingPostId is set", async () => {
    const historical = buildPost({ id: "post-old", opportunityId: "opp-old", body: "Old body" });
    vi.mocked(api.fetchPostById).mockResolvedValue(historical);
    // If the staleness path ran, it would call these instead — they must stay untouched.
    vi.mocked(api.fetchPost).mockResolvedValue(buildPost({ id: "post-latest" }));
    vi.mocked(api.fetchSelectedOpportunities).mockResolvedValue({
      id: "set-1",
      createdAt: new Date().toISOString(),
      promptVersion: "v1",
      model: "fake",
      emptyReason: null,
      selectedOpportunityId: "some-other-opportunity",
      opportunities: [],
    });

    render(<PostView editingPostId="post-old" onExitEditing={() => {}} />);

    await waitFor(() => expect(screen.getByText("Old body")).toBeInTheDocument());
    expect(api.fetchPostById).toHaveBeenCalledWith("post-old");
    expect(api.fetchPost).not.toHaveBeenCalled();
    expect(api.fetchSelectedOpportunities).not.toHaveBeenCalled();
    expect(screen.queryByText(/different angle is selected/i)).not.toBeInTheDocument();
  });
});

describe("PostView normal (non-editing) load", () => {
  it("renders the post when its opportunity matches the currently selected one", async () => {
    const current = buildPost({ opportunityId: "opp-selected", body: "Current body" });
    vi.mocked(api.fetchPost).mockResolvedValue(current);
    vi.mocked(api.fetchSelectedOpportunities).mockResolvedValue({
      id: "set-1",
      createdAt: new Date().toISOString(),
      promptVersion: "v1",
      model: "fake",
      emptyReason: null,
      selectedOpportunityId: "opp-selected",
      opportunities: [],
    });

    render(<PostView editingPostId={null} onExitEditing={() => {}} />);

    await waitFor(() => expect(screen.getByText("Current body")).toBeInTheDocument());
  });

  it("shows the stale notice instead of the post when the opportunity no longer matches", async () => {
    const outdated = buildPost({ opportunityId: "opp-old", body: "Outdated body" });
    vi.mocked(api.fetchPost).mockResolvedValue(outdated);
    vi.mocked(api.fetchSelectedOpportunities).mockResolvedValue({
      id: "set-1",
      createdAt: new Date().toISOString(),
      promptVersion: "v1",
      model: "fake",
      emptyReason: null,
      selectedOpportunityId: "opp-new",
      opportunities: [],
    });

    render(<PostView editingPostId={null} onExitEditing={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/different angle is selected/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Outdated body")).not.toBeInTheDocument();
  });
});

describe("PostView edit chaining", () => {
  it("targets the newly created revision on the second edit, not the original historical id", async () => {
    const historical = buildPost({ id: "post-old", body: "Old body" });
    const revised = buildPost({ id: "post-new", body: "New body" });
    vi.mocked(api.fetchPostById).mockResolvedValue(historical);
    vi.mocked(api.generateAlternativeHook).mockResolvedValue(revised);

    render(<PostView editingPostId="post-old" onExitEditing={() => {}} />);
    await waitFor(() => expect(screen.getByText("Old body")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /alternative hook/i }));
    await waitFor(() => expect(screen.getByText("New body")).toBeInTheDocument());
    expect(api.generateAlternativeHook).toHaveBeenNthCalledWith(1, "post-old", undefined);

    await user.click(screen.getByRole("button", { name: /alternative hook/i }));
    await waitFor(() => expect(api.generateAlternativeHook).toHaveBeenCalledTimes(2));
    expect(api.generateAlternativeHook).toHaveBeenNthCalledWith(2, "post-new", undefined);
  });
});
