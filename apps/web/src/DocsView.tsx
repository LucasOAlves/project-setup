const SECTIONS = [
  { id: "doc-overview", label: "System overview" },
  { id: "doc-modules", label: "Backend modules" },
  { id: "doc-providers", label: "Provider isolation" },
  { id: "doc-paths", label: "Three topic paths" },
  { id: "doc-pipeline", label: "AI pipeline" },
  { id: "doc-models", label: "AI models" },
  { id: "doc-data", label: "Data model" },
  { id: "doc-frontend", label: "Frontend" },
  { id: "doc-decisions", label: "Decisions" },
  { id: "doc-stack", label: "Tech stack" },
  { id: "doc-appendix", label: "Full ADR text" },
] as const;

function DocSection({
  index,
  id,
  title,
  children,
}: {
  index: string;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="doc-section" id={id}>
      <h3>
        <span className="doc-index">{index}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Node({
  children,
  hint,
  variant,
}: {
  children: React.ReactNode;
  hint?: string;
  variant?: "accent" | "forest";
}) {
  return (
    <div className={variant ? `diagram-node ${variant}` : "diagram-node"}>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Arrow({ vertical }: { vertical?: boolean }) {
  return <span className="diagram-arrow">{vertical ? "↓" : "→"}</span>;
}

function FurtherReading({ links }: { links: Array<{ label: string; href: string }> }) {
  return (
    <div className="further-reading">
      <div className="label">Further reading</div>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            {link.href.startsWith("http") ? (
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ) : link.href.startsWith("#") ? (
              <a href={link.href}>{link.label}</a>
            ) : (
              <span title={link.href}>{link.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocsView({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <p className="eyebrow">Technical reference</p>
      <h2>How this app is built</h2>
      <p className="lede">
        Architecture, backend, frontend, AI models, and every technical decision
        behind LinkedIn Content Studio — generated from the actual state of the
        repository, not a plan written before the code existed.
      </p>

      <div className="actions" style={{ marginBottom: 8 }}>
        <button className="btn ghost" type="button" onClick={onClose}>
          Back to app
        </button>
        <div />
      </div>

      <nav className="docs-toc" aria-label="Documentation sections">
        {SECTIONS.map((section, i) => (
          <a key={section.id} href={`#${section.id}`}>
            {String(i + 1).padStart(2, "0")} {section.label}
          </a>
        ))}
      </nav>

      <DocSection index="01" id="doc-overview" title="System overview">
        <p>
          A modular monolith in a Turborepo, not microservices. AI, persistence,
          and news adapters live <em>inside</em> <code>apps/api</code> — only{" "}
          <code>apps/web</code> and <code>apps/api</code> share types, through{" "}
          <code>packages/shared</code>.
        </p>
        <div className="diagram-frame">
          <div className="diagram-flow">
            <Node hint="React 19 + Vite">apps/web</Node>
            <Arrow />
            <Node hint="Fastify 5">apps/api</Node>
            <Arrow />
            <div className="diagram-col">
              <Node hint="Drizzle ORM">PostgreSQL</Node>
              <Node hint="OpenAI · Anthropic">Text AI</Node>
              <Node hint="OpenAI · Pollinations">Image AI</Node>
              <Node hint="NewsAPI.org">News</Node>
            </div>
          </div>
          <p className="diagram-caption">
            Both apps trust the same Zod contracts from <code>packages/shared</code>.
            Request flow: HTTP request → schema validation → controller → use
            case → repository or provider → validated response. Controllers stay
            thin; domain rules never live in routes or React components.
          </p>
        </div>
        <h4>Two ways to run it locally</h4>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Path</th>
                <th>What runs</th>
                <th>Used when</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Docker Compose</td>
                <td>web, api, postgres as containers</td>
                <td>Original design (ADR-001)</td>
              </tr>
              <tr>
                <td>Native Postgres</td>
                <td><code>npm run dev</code>, Postgres as a local service</td>
                <td>Most of this project's actual development, after Docker Desktop's WSL layer broke</td>
              </tr>
            </tbody>
          </table>
        </div>
        <FurtherReading
          links={[
            { label: "Turborepo docs", href: "https://turbo.build/repo/docs" },
            { label: "Fastify docs", href: "https://fastify.dev/docs/latest/" },
            { label: "ADR-001 — modular monolith", href: "#adr-001" },
          ]}
        />
      </DocSection>

      <DocSection index="02" id="doc-modules" title="Backend modules">
        <p>
          Every folder under <code>apps/api/src/modules/</code> owns one thing.
          Modules call each other's use cases but never import a vendor SDK type
          or a filesystem path from outside their own boundary.
        </p>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Owns</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>profile</code></td><td>Profile, experiences, writing samples, photo metadata</td></tr>
              <tr><td><code>persona</code></td><td>Persona generation, authority-model persistence</td></tr>
              <tr><td><code>news</code></td><td>NewsProvider calls, article normalization, persistence</td></tr>
              <tr><td><code>relevance</code></td><td>Deterministic filters + semantic relevance scoring</td></tr>
              <tr><td><code>opportunities</code></td><td>Content opportunities, source-scoped selection (ADR-009), rejection</td></tr>
              <tr><td><code>content-plan</code></td><td>24-topic editorial calendar as deterministic synthetic opportunities (ADR-006)</td></tr>
              <tr><td><code>custom-topics</code></td><td>User-authored topics, same synthetic-opportunity pattern</td></tr>
              <tr><td><code>posts</code></td><td>Story strategy, draft, reviews, scores, regeneration, publish tracking</td></tr>
              <tr><td><code>images</code></td><td>Creative brief, prompt, generation, association with a post</td></tr>
              <tr><td><code>uploads</code></td><td>Photo validation and storage identifiers</td></tr>
              <tr><td><code>ai</code></td><td>Prompt templates, structured-output validation, provider clients</td></tr>
            </tbody>
          </table>
        </div>
        <FurtherReading
          links={[
            { label: "Architecture Decision Records (adr.github.io)", href: "https://adr.github.io/" },
            { label: "Bounded Context — Martin Fowler", href: "https://martinfowler.com/bliki/BoundedContext.html" },
          ]}
        />
      </DocSection>

      <DocSection index="03" id="doc-providers" title="Provider isolation">
        <p>
          Every volatile external capability is an interface. Domain code
          depends on the interface, never the SDK (ADR-002) — which paid off
          twice this session, once for text (ADR-007) and once for images
          (ADR-008), without touching a prompt, schema, or route either time.
        </p>
        <div className="diagram-frame">
          <div className="diagram-col">
            <div className="diagram-flow">
              <Node variant="accent" hint="TEXT_PROVIDER env">TextGenerationProvider</Node>
              <Arrow />
              <Node hint="default · gpt-4.1">OpenAI</Node>
              <Node hint="claude-opus-5 · ADR-007">Anthropic</Node>
            </div>
            <div className="diagram-flow">
              <Node variant="accent" hint="IMAGE_PROVIDER env">ImageGenerationProvider</Node>
              <Arrow />
              <Node hint="default · gpt-image-1">OpenAI</Node>
              <Node hint="no key · flux · ADR-008">Pollinations</Node>
            </div>
            <div className="diagram-flow">
              <Node variant="forest">NewsProvider</Node>
              <Arrow />
              <Node hint="NewsAPI.org · ADR-004">NewsApiNewsProvider</Node>
            </div>
            <div className="diagram-flow">
              <Node variant="forest">StorageProvider</Node>
              <Arrow />
              <Node hint="server-generated ids">LocalStorageProvider</Node>
            </div>
          </div>
          <p className="diagram-caption">
            No <code>OpenAIService</code> god object — text and image generation
            stayed separate capabilities even when both happened to use OpenAI.
          </p>
        </div>
        <div className="notice">
          Real tradeoff, not a footnote: Claude models in current use reject the{" "}
          <code>temperature</code> parameter and are more verbose than GPT-4.1,
          which broke schema max-lengths in two prompts until they got explicit
          character-count hints. The interface boundary held — the prompt layer
          absorbed the vendor difference, exactly where ADR-002 intended.
        </div>
        <FurtherReading
          links={[
            { label: "Adapter pattern — refactoring.guru", href: "https://refactoring.guru/design-patterns/adapter" },
            { label: "Anthropic Messages API", href: "https://docs.anthropic.com/en/api/messages" },
            { label: "OpenAI API reference", href: "https://platform.openai.com/docs/api-reference" },
            { label: "ADR-002", href: "#adr-002" },
            { label: "ADR-007", href: "#adr-007" },
            { label: "ADR-008", href: "#adr-008" },
          ]}
        />
      </DocSection>

      <DocSection index="04" id="doc-paths" title="Three topic paths">
        <p>
          Discover News is the only path where the model evaluates and scores
          candidates. Content Plan and Custom Topics are pre-vetted input, so
          both skip AI evaluation and build the opportunity deterministically.
        </p>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Path</th><th>Input</th><th>AI evaluation?</th><th>Angle</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Discover News</td>
                <td>Live NewsAPI results, filtered + ranked</td>
                <td><span className="doc-tag ai">AI</span></td>
                <td>Model-suggested</td>
              </tr>
              <tr>
                <td>Content Plan</td>
                <td>24-topic calendar from the publishing plan</td>
                <td><span className="doc-tag det">Deterministic</span></td>
                <td>Mapped from the brief's format</td>
              </tr>
              <tr>
                <td>Custom Topics</td>
                <td>Title, hook, key points typed by the user</td>
                <td><span className="doc-tag det">Deterministic</span></td>
                <td>Picked directly by the user</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="notice">
          The bug this exposed (ADR-009): until fixed, "Write post" resolved the
          selected opportunity via a lookup hardcoded to Discover's source.
          Selecting a Content Plan or Custom topic updated its own row correctly
          — but generation silently used whichever opportunity Discover had last
          selected instead. A plausible, wrong post, not an error — which is why
          it survived until live testing caught it.
        </div>
        <FurtherReading
          links={[
            { label: "ADR-006 — synthetic opportunities", href: "#adr-006" },
            { label: "ADR-009 — source-scoped selection", href: "#adr-009" },
            { label: "PostgreSQL — ORDER BY & NULLS LAST", href: "https://www.postgresql.org/docs/current/queries-order.html" },
          ]}
        />
      </DocSection>

      <DocSection index="05" id="doc-pipeline" title="AI pipeline">
        <p>
          A sequence of use cases, not one job. The frontend walks the user
          through each stage; the API persists durable results after every
          success, so a failed image step never regenerates the post (ADR-005).
        </p>
        <div className="diagram-frame">
          <div className="diagram-col">
            <div className="diagram-flow">
              <Node>Profile</Node><Arrow /><Node>Persona</Node><Arrow />
              <Node>Opportunity (3 paths)</Node><Arrow /><Node variant="accent">Story strategy</Node>
            </div>
            <div className="diagram-flow">
              <Node variant="accent">Draft</Node><Arrow />
              <Node variant="accent">Writing / fact / SEO review</Node><Arrow />
              <Node variant="accent">Score</Node><Arrow />
              <Node variant="accent">Image brief</Node><Arrow />
              <Node variant="accent">Image</Node>
            </div>
          </div>
        </div>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead><tr><th>Stage</th><th>Kind</th><th>Why</th></tr></thead>
            <tbody>
              <tr>
                <td>Recency / source-quality / keyword filters</td>
                <td><span className="doc-tag det">Deterministic</span></td>
                <td>Cheap, cuts bad candidates before a model call</td>
              </tr>
              <tr>
                <td>Relevance scoring of survivors</td>
                <td><span className="doc-tag ai">AI</span></td>
                <td>Semantic judgment a filter can't approximate</td>
              </tr>
              <tr>
                <td>Rejection with no source URL / no evidence</td>
                <td><span className="doc-tag det">Deterministic</span></td>
                <td>A hard rule always wins over a high model score</td>
              </tr>
              <tr>
                <td>Story strategy, draft, editorial review, grounding, SEO</td>
                <td><span className="doc-tag ai">AI</span></td>
                <td>Generation and judgment are the product</td>
              </tr>
              <tr>
                <td>Structured-output validation</td>
                <td><span className="doc-tag det">Deterministic</span></td>
                <td>Invalid model output is a provider failure, never stored</td>
              </tr>
              <tr>
                <td>Image creative brief, prompt, and pixels</td>
                <td><span className="doc-tag ai">AI</span></td>
                <td>Translating a post into a visual concept</td>
              </tr>
            </tbody>
          </table>
        </div>
        <FurtherReading
          links={[
            { label: "Anthropic — prompt engineering", href: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" },
            { label: "OpenAI — structured outputs", href: "https://platform.openai.com/docs/guides/structured-outputs" },
            { label: "ADR-005 — user-paced generation", href: "#adr-005" },
          ]}
        />
      </DocSection>

      <DocSection index="06" id="doc-models" title="AI models in use">
        <p>
          Set in <code>apps/api/src/env.ts</code>. Nothing downstream needs to
          know which vendor answered.
        </p>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Capability</th><th>Env switch</th><th>Options</th><th>Default model</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Text generation</td>
                <td><code>TEXT_PROVIDER</code></td>
                <td>openai · anthropic</td>
                <td><code>gpt-4.1</code> or <code>claude-opus-5</code></td>
              </tr>
              <tr>
                <td>Image generation</td>
                <td><code>IMAGE_PROVIDER</code></td>
                <td>openai · pollinations</td>
                <td><code>gpt-image-1</code> or Pollinations' <code>flux</code> (no key)</td>
              </tr>
              <tr>
                <td>News search</td>
                <td>—</td>
                <td>NewsAPI.org only</td>
                <td>Requires <code>NEWS_API_KEY</code> (free tier)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="notice">
          Pollinations has no reference-photo / image-to-image support. OpenAI's{" "}
          <code>images.edit()</code> can incorporate uploaded reference photos;
          Pollinations generates from the text prompt alone. See ADR-008.
        </div>
        <FurtherReading
          links={[
            { label: "Anthropic — model overview", href: "https://docs.anthropic.com/en/docs/about-claude/models" },
            { label: "OpenAI — model overview", href: "https://platform.openai.com/docs/models" },
            { label: "NewsAPI.org docs", href: "https://newsapi.org/docs" },
          ]}
        />
      </DocSection>

      <DocSection index="07" id="doc-data" title="Data model">
        <p>
          <code>generated_posts</code> and <code>generated_images</code> never
          update in place — every generate/edit/retry is a new row, so
          regeneration can never silently erase a publishable result. Status
          rows (<code>content_plan_topics</code>, <code>custom_topics</code>)
          are the opposite: mutable, because a topic's lifecycle is not history
          to preserve.
        </p>
        <div className="diagram-frame">
          <div className="diagram-col">
            <div className="diagram-flow">
              <Node hint="experiences, photos, writing samples">profiles</Node>
              <Arrow /><Node>professional_personas</Node><Arrow />
              <Node hint="source: discover|content_plan|custom">research_runs</Node>
            </div>
            <div className="diagram-flow">
              <Node hint="source, selected_at (ADR-009)">opportunity_sets</Node>
              <Arrow /><Node>content_opportunities</Node><Arrow />
              <Node variant="accent" hint="insert-only">generated_posts</Node><Arrow />
              <Node variant="accent" hint="insert-only">generated_images</Node>
            </div>
            <div className="diagram-flow">
              <Node variant="forest" hint="mutable status">content_plan_topics</Node>
              <Node variant="forest" hint="mutable status">custom_topics</Node>
            </div>
          </div>
          <p className="diagram-caption">
            Simplified — full schema in <code>apps/api/src/db/schema.ts</code>.
          </p>
        </div>
        <FurtherReading
          links={[
            { label: "Drizzle ORM docs", href: "https://orm.drizzle.team/docs/overview" },
            { label: "PostgreSQL docs", href: "https://www.postgresql.org/docs/" },
            { label: "Mermaid — ER diagram syntax", href: "https://mermaid.js.org/syntax/entityRelationshipDiagram.html" },
          ]}
        />
      </DocSection>

      <DocSection index="08" id="doc-frontend" title="Frontend architecture">
        <p>
          <code>App.tsx</code> holds a single <code>StepId</code> union and
          renders one view component per step — no client-side router. The
          whole product is one URL; navigation is a state transition, matching
          the single-workspace, no-auth model (ADR-003).
        </p>
        <div className="diagram-frame">
          <div className="diagram-flow">
            <Node>Welcome → Identity → … → Photos → Persona</Node>
            <Arrow />
            <div className="diagram-col">
              <Node>Content plan</Node>
              <Node>My topics</Node>
              <Node>Discover news</Node>
            </div>
            <Arrow />
            <Node variant="accent">Post</Node>
            <Arrow />
            <Node>History</Node>
          </div>
        </div>
        <ul>
          <li>
            <strong>Single fetch boundary</strong> — every request goes through{" "}
            <code>api.ts</code>: typed functions, one <code>parseError()</code>
            helper, no component calls <code>fetch()</code> directly.
          </li>
          <li>
            <strong>Shared contracts</strong> — Zod schemas in{" "}
            <code>packages/shared</code> are the single source of truth for both
            the API's validation and the frontend's types.
          </li>
          <li>
            <strong>Explicit ID threading beats guessing</strong> — editing a
            historical post threads <code>postId</code>/<code>opportunityId</code>{" "}
            explicitly, rather than trusting "the latest post" server-side.
          </li>
        </ul>
        <FurtherReading
          links={[
            { label: "React docs", href: "https://react.dev/" },
            { label: "Vite docs", href: "https://vitejs.dev/" },
            { label: "Zod docs", href: "https://zod.dev/" },
            { label: "Vitest docs", href: "https://vitest.dev/" },
          ]}
        />
      </DocSection>

      <DocSection index="09" id="doc-decisions" title="Technical decisions">
        <p>
          Full text for each ADR lives in <code>docs/decisions/</code> — Status,
          Context, Options considered, Decision, Consequences, Tradeoffs.
        </p>
        <div className="adr-mini-grid">
          {[
            { id: "ADR-001", title: "Modular monolith in a Turborepo", note: "One deployable per app, shared types via packages/shared.", file: "ADR-001-modular-monolith-turborepo.md" },
            { id: "ADR-002", title: "Provider isolation", note: "Text, image, news, storage are interfaces. No vendor SDK type crosses into domain code.", file: "ADR-002-provider-isolation.md" },
            { id: "ADR-003", title: "Unauthenticated single workspace", note: "Profile is the aggregate root. No User table, no login.", file: "ADR-003-unauthenticated-workspace.md" },
            { id: "ADR-004", title: "NewsAPI.org as NewsProvider", note: "Real search over curated RSS or LLM-invented news.", file: "ADR-004-newsapi-provider.md" },
            { id: "ADR-005", title: "User-paced generation", note: "No background job queue — each AI stage is its own HTTP call.", file: "ADR-005-user-paced-generation.md" },
            { id: "ADR-006", title: "Content Plan as synthetic opportunities", note: "Pre-vetted topics skip AI evaluation. Pattern reused by Custom Topics.", file: "ADR-006-content-plan-seed.md" },
            { id: "ADR-007", title: "Anthropic as a second text provider", note: "Cost-driven swap; surfaced no-temperature, streaming, verbosity quirks.", file: "ADR-007-anthropic-text-provider.md" },
            { id: "ADR-008", title: "Pollinations as a free image provider", note: "No-key image generation, at the cost of no reference-photo support.", file: "ADR-008-pollinations-image-provider.md" },
            { id: "ADR-009", title: "Source-scoped selection", note: "Fixes a real bug: current selection resolved across all three paths.", file: "ADR-009-source-scoped-selection.md" },
          ].map((adr) => (
            <div className="adr-mini" key={adr.id}>
              <span className="id">{adr.id}</span>
              <h4>{adr.title}</h4>
              <p>{adr.note}</p>
              <a href={`#adr-${adr.id.slice(-3)}`}>Read the full ADR →</a>
            </div>
          ))}
        </div>
        <FurtherReading
          links={[{ label: "Architecture Decision Records (adr.github.io)", href: "https://adr.github.io/" }]}
        />
      </DocSection>

      <DocSection index="10" id="doc-stack" title="Tech stack">
        <p>Versions confirmed from each workspace's <code>package.json</code>.</p>
        <div className="tech-stack-grid">
          {[
            { role: "Frontend", name: "react", ver: "^19.1.0" },
            { role: "Build tool", name: "vite", ver: "^6.3.5" },
            { role: "Test runner (web)", name: "vitest", ver: "^4.1.11" },
            { role: "Language", name: "typescript", ver: "^5.8.3" },
            { role: "API server", name: "fastify", ver: "^5.3.3" },
            { role: "ORM", name: "drizzle-orm", ver: "^0.44.2" },
            { role: "Postgres driver", name: "postgres", ver: "^3.4.7" },
            { role: "Validation", name: "zod", ver: "^3.24.4" },
            { role: "Text AI (default)", name: "openai", ver: "^5.23.2" },
            { role: "Text AI (alt)", name: "@anthropic-ai/sdk", ver: "^0.122.0" },
            { role: "Monorepo", name: "turbo", ver: "^2.5.4" },
            { role: "Test runner (api)", name: "node:test via tsx", ver: "^4.19.4" },
          ].map((item) => (
            <div className="tech-item" key={item.name}>
              <div className="role">{item.role}</div>
              <div className="name">{item.name}</div>
              <div className="ver">{item.ver}</div>
            </div>
          ))}
        </div>
        <FurtherReading
          links={[
            { label: "TypeScript docs", href: "https://www.typescriptlang.org/docs/" },
            { label: "Node.js — node:test docs", href: "https://nodejs.org/api/test.html" },
            { label: "Turborepo docs", href: "https://turbo.build/repo/docs" },
          ]}
        />
      </DocSection>

      <DocSection index="11" id="doc-appendix" title="Full ADR text">
        <p>
          Every "Read the full ADR" link above jumps here — no file server
          needed. Full Status / Context / Options / Decision / Consequences /
          Tradeoffs for all nine.
        </p>

        <article className="adr-full" id="adr-001">
          <span className="id">ADR-001</span>
          <h4 className="adr-title">Modular monolith in Turborepo with Docker Compose</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The MVP needs a React frontend, a Fastify API, PostgreSQL, and a reproducible local environment. Microservices, Kubernetes, and extra infrastructure would make the demo look sophisticated and finish late.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Separate repositories for web and API</li>
            <li>Microservices per domain module</li>
            <li>Modular monolith in one Turborepo, Compose for local runtime</li>
            <li>Frontend-only app calling OpenAI directly</li>
          </ol>
          <h5>Decision</h5>
          <p>Use a Turborepo modular monolith: <code>apps/web</code>, <code>apps/api</code>, <code>packages/shared</code>, <code>packages/config</code>. Run web, api, and postgres with Docker Compose. Do not extract <code>ai</code> or <code>database</code> packages until a second consumer exists. Do not put OpenAI keys in the frontend.</p>
          <h5>Consequences</h5>
          <ul>
            <li>One deployable API, clear module folders</li>
            <li>Shared types without sharing implementations</li>
            <li>Compose is the documented developer path</li>
            <li>Future extraction of a provider package is possible but not prepaid</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>Turborepo adds some workspace ceremony. That cost is lower than splitting services or duplicating types.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-002">
          <span className="id">ADR-002</span>
          <h4 className="adr-title">Provider isolation for OpenAI, news, and storage</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The MVP uses OpenAI for text and images, a third-party news API, and local disk for media. Coupling use cases to SDKs would make domain tests require live APIs.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Direct SDK calls from routes and use cases</li>
            <li>One <code>OpenAIService</code> for all AI plus ad-hoc fetch for news</li>
            <li>Narrow interfaces: <code>TextGenerationProvider</code>, <code>ImageGenerationProvider</code>, <code>NewsProvider</code>, <code>StorageProvider</code></li>
          </ol>
          <h5>Decision</h5>
          <p>Isolate volatile boundaries only. Text and image generation are separate interfaces even though both are OpenAI in the MVP. Application models never accept OpenAI, NewsAPI, or filesystem types. Automated tests use deterministic fakes.</p>
          <h5>Consequences</h5>
          <ul>
            <li>Use cases can be tested without network</li>
            <li>Replacing NewsAPI or moving storage to object storage does not rewrite domain rules</li>
            <li>Slightly more types at the start</li>
          </ul>
          <h5>Update — second TextGenerationProvider adapter</h5>
          <p><code>AnthropicTextGenerationProvider</code> was added alongside <code>OpenAITextGenerationProvider</code>, selected at startup via <code>TEXT_PROVIDER=openai|anthropic</code>. Persona, opportunity, and post generation code did not change — only provider construction and the env schema did.</p>
          <h5>Tradeoffs</h5>
          <p>Four interfaces is enough. Generating interfaces for Postgres or Fastify would be theater.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-003">
          <span className="id">ADR-003</span>
          <h4 className="adr-title">Unauthenticated single-workspace MVP</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The product journey starts at a professional profile. The prompt never required login, teams, or multi-tenant isolation.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Full signup/login before profile</li>
            <li>Magic-link or OAuth with a User table</li>
            <li><code>Profile</code> is the aggregate root in a local workspace, no auth</li>
          </ol>
          <h5>Decision</h5>
          <p>Ship without user accounts. The local deployment holds one working profile/workspace. Security still applies to uploads, prompts, keys, and validation.</p>
          <h5>Consequences</h5>
          <ul>
            <li>Slice 1 can show product value immediately</li>
            <li>A later User/Auth ADR will be required before any shared or hosted multi-user deployment</li>
            <li>No personal data access-control model exists yet; the demo is trusted-local</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>This is unacceptable for a public multi-user service. It is acceptable for this MVP demo.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-004">
          <span className="id">ADR-004</span>
          <h4 className="adr-title">NewsAPI.org as the concrete NewsProvider</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The product must discover recent technology events without fabricating them and without coupling domain logic to a vendor.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Curated RSS only from official engineering blogs</li>
            <li>LLM-invented "news" (rejected: factual integrity)</li>
            <li>Tavily/Exa/Firecrawl semantic web search</li>
            <li>NewsAPI.org search with recency and preferred domains</li>
            <li>Scrape Google News (rejected: brittle, legally noisy)</li>
          </ol>
          <h5>Decision</h5>
          <p>Use <code>NewsProvider.searchNews(topics, dateRange)</code> and implement <code>NewsApiNewsProvider</code>. Rank and reject in the relevance module, not in the adapter.</p>
          <h5>Consequences</h5>
          <ul>
            <li>Local demo needs <code>NEWS_API_KEY</code></li>
            <li>Free NewsAPI terms are development-oriented; production would need a license change</li>
            <li>Quality still depends on relevance rejection, because aggregators are noisy</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>RSS would be cleaner and poorer at matching arbitrary personas. Semantic search tools may return better pages later; the interface allows replacement without domain rewrite.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-005">
          <span className="id">ADR-005</span>
          <h4 className="adr-title">User-paced generation instead of a background pipeline</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>Persona, research, opportunities, post reviews, and image generation can exceed a comfortable single HTTP timeout. A hidden 90-second job would remove the product's trust surfaces.</p>
          <h5>Options considered</h5>
          <ol>
            <li>One API call that runs the full pipeline</li>
            <li>Redis/queue/worker with job polling</li>
            <li>User-paced HTTP use cases; frontend walks the journey; durable state in Postgres</li>
          </ol>
          <h5>Decision</h5>
          <p>Each stage is an explicit use case. The UI shows intermediate results. Image generation retries against an existing post. No job platform in the MVP.</p>
          <h5>Consequences</h5>
          <ul>
            <li>Latency is visible and recoverable per stage</li>
            <li>Why This Post? and angle selection stay first-class</li>
            <li>The client is an orchestrator of user decisions, not of domain rules</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>More round trips. That is desirable here. A worker can be introduced later if a stage must run unattended.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-006">
          <span className="id">ADR-006</span>
          <h4 className="adr-title">Content Plan topics as deterministic synthetic opportunities</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The user supplied a fixed 12-week, 24-post editorial calendar with pre-approved briefs — already vetted outside the app. Running them back through AI opportunity evaluation would add variance and cost without adding value.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Extend the schema with a nullable <code>articleId</code> and a new <code>topicId</code> reference</li>
            <li>Build a fully separate post-generation pipeline for plan topics</li>
            <li>Represent each selected topic as a synthetic <code>news_articles</code> row plus a deterministic <code>OpportunityPayload</code>, with no AI call</li>
          </ol>
          <h5>Decision</h5>
          <p>Option 3. <code>ContentPlanService.selectTopic()</code> inserts one synthetic article, builds the payload directly from the brief, and marks it selected via the existing <code>OpportunityService.select()</code>. <code>PostService.generate()</code> needs no changes.</p>
          <h5>Consequences</h5>
          <ul>
            <li>No schema change to the existing opportunity tables</li>
            <li>Selecting a plan topic creates its own research run and opportunity set, tagged <code>source: "content_plan"</code> — does not replace Discover's own state (ADR-009)</li>
            <li>Only the 24 approved topics (T01-T24) are imported</li>
            <li>Only editorial status is tracked — no LinkedIn analytics API is available</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>A schema extension would be more explicit but duplicates code paths for no behavioral gain.</p>
          <h5>Related</h5>
          <p>Custom Topics reuses this exact pattern verbatim, <code>source: "custom"</code> — no new ADR needed for it. See ADR-009 for the scoping fix this pattern's second and third users made necessary.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-007">
          <span className="id">ADR-007</span>
          <h4 className="adr-title">Anthropic as a second TextGenerationProvider</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The OpenAI account used for local development ran out of credits, blocking every AI-dependent step. The provider interface already existed specifically so a vendor could be swapped without touching domain code.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Wait on OpenAI credits / fund the same account</li>
            <li>Add <code>AnthropicTextGenerationProvider</code> behind the existing interface</li>
            <li>Replace OpenAI outright</li>
          </ol>
          <h5>Decision</h5>
          <p>Add <code>AnthropicTextGenerationProvider</code>, selectable via <code>TEXT_PROVIDER=openai|anthropic</code>, defaulting to <code>openai</code>. No prompt, schema, or use case changed.</p>
          <h5>Consequences</h5>
          <ul>
            <li>Current Claude models reject the <code>temperature</code> parameter — the adapter omits it entirely</li>
            <li>Claude's structured JSON responses were truncated at 8,000 tokens non-streaming — the adapter streams with <code>max_tokens: 16000</code> instead</li>
            <li>Claude is more verbose than GPT-4.1, which broke schema max-lengths until explicit character-count hints were added to the prompts</li>
            <li>No cost/quality A/B was run; the switch was availability-driven, not benchmarked</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>Keeping both providers alive means two vendor SDKs and two sets of quirks to remember, versus the single-point-of-failure ADR-002 was written to avoid.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-008">
          <span className="id">ADR-008</span>
          <h4 className="adr-title">Pollinations.ai as a free ImageGenerationProvider</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>The same unfunded OpenAI account also blocked image generation. Anthropic has no image API at all.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Fund the OpenAI account and stay single-provider</li>
            <li>Google AI Studio (Imagen) — free tier, still needs an API key</li>
            <li>Hugging Face Inference API — free tier, unpredictable limits/latency</li>
            <li>Pollinations.ai — fully free, no API key, direct HTTP GET</li>
          </ol>
          <h5>Decision</h5>
          <p>Add <code>PollinationsImageGenerationProvider</code>, selectable via <code>IMAGE_PROVIDER=openai|pollinations</code>. The adapter calls a plain GET and reads raw JPEG bytes — no auth, no client library.</p>
          <h5>Consequences</h5>
          <ul>
            <li><code>IMAGE_PROVIDER=pollinations</code> needs no API key at all</li>
            <li>No reference-photo / image-to-image support — Pollinations generates from the text prompt alone</li>
            <li>No SLA, no documented rate limits, no uptime guarantee — acceptable for a demo, not production</li>
            <li>No response metadata — the adapter normalizes both providers into the same internal model</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>A paid, authenticated provider would offer more predictability at the cost of needing another API key. Pollinations trades predictability for zero setup friction.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>

        <article className="adr-full" id="adr-009">
          <span className="id">ADR-009</span>
          <h4 className="adr-title">Source-scoped "latest selection" instead of one global pointer</h4>
          <span className="status">Accepted</span>
          <h5>Context</h5>
          <p>Discover News, then Content Plan, then Custom Topics each added a way to reach a content opportunity. <code>OpportunityService.getSelected()</code> — what <code>PostService</code> calls when writing with no explicit <code>opportunityId</code> — still called <code>getLatest()</code> with no argument, defaulting to <code>"discover"</code>. Selecting a Content Plan or Custom topic updated its own row correctly, but "Write post" kept resolving Discover's selection instead — silently writing about the wrong topic.</p>
          <h5>Options considered</h5>
          <ol>
            <li>Have the frontend pass an explicit <code>opportunityId</code> through every hand-off</li>
            <li>Track "the one true current selection" as its own concept, independent of source</li>
            <li>Keep <code>getSelected()</code> hardcoded and special-case the other call sites</li>
          </ol>
          <h5>Decision</h5>
          <p>Add <code>opportunity_sets.selected_at</code>, stamped on every selection. Add <code>getMostRecentlySelected()</code>: the set with a non-null selection, ordered by <code>selected_at DESC NULLS LAST</code>, across all sources. <code>getSelected()</code> now calls this instead of the source-hardcoded <code>getLatest()</code>.</p>
          <p>Postgres orders <code>NULL</code> <strong>first</strong> in a plain <code>ORDER BY x DESC</code>, not last — the first version of this fix used a plain <code>desc()</code> and still returned a stale row ahead of a genuinely recent selection. The working query uses a raw SQL fragment with an explicit <code>DESC NULLS LAST</code>, since drizzle-orm 0.44 has no <code>nullsLast()</code> chain on <code>desc()</code>.</p>
          <h5>Consequences</h5>
          <ul>
            <li>Every "select a topic" action across all three paths now converges on one correct, source-agnostic notion of "what should Write Post use"</li>
            <li>Rows created before this migration have <code>selected_at IS NULL</code> and sort behind any real selection</li>
            <li>Explicit ID-threading (option 1) was rejected because it would have multiplied a UI-state concern to solve what was fundamentally a backend query bug</li>
          </ul>
          <h5>Tradeoffs</h5>
          <p>Explicit ID-threading is more predictable at the cost of every frontend "select" flow needing to carry and hand off an ID. The chosen approach keeps the frontend simple by making the backend's notion of "current selection" actually correct.</p>
          <a className="back-to-index" href="#doc-decisions">← Back to decisions index</a>
        </article>
      </DocSection>

      <div className="actions">
        <button className="btn ghost" type="button" onClick={onClose}>
          Back to app
        </button>
        <div />
      </div>
    </div>
  );
}
