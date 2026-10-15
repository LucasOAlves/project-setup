import type { TextGenerationProvider, TextGenerationRequest, TextGenerationResult } from "../ai/text-generation-provider.js";
import type { WebSearchClient, WebSearchResult } from "../career/brave-search-client.js";
import type { UsageLedger } from "./usage-ledger.js";

type Ledger = Pick<UsageLedger, "guard" | "recordText" | "recordSearch">;

// Records every model call in the cost ledger, and refuses optional calls once the monthly
// budget is spent. A ledger write that fails never fails the call it describes.
export class MeteredTextProvider implements TextGenerationProvider {
  constructor(
    private readonly inner: TextGenerationProvider,
    private readonly provider: string,
    private readonly ledger: Ledger,
  ) {}

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    await this.ledger.guard(request.purpose);
    const result = await this.inner.generateText(request);
    await this.ledger
      .recordText({
        provider: this.provider,
        model: result.model,
        promptVersion: request.purpose,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      })
      .catch(() => undefined);
    return result;
  }
}

// Records each answered search query (Brave bills per request).
export class MeteredSearchClient implements WebSearchClient {
  constructor(
    private readonly inner: WebSearchClient,
    private readonly provider: string,
    private readonly ledger: Ledger,
  ) {}

  async search(query: string): Promise<WebSearchResult[]> {
    const results = await this.inner.search(query);
    await this.ledger.recordSearch({ provider: this.provider, purpose: "web-discovery", queries: 1 }).catch(() => undefined);
    return results;
  }
}
