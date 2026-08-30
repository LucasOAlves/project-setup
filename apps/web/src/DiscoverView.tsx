import { OpportunitiesView } from "./OpportunitiesView";
import { TopicsView } from "./TopicsView";

const ALTERNATIVE_PROVIDERS = [
  {
    name: "The Guardian Open Platform",
    note: "Free, high-quality technology coverage.",
  },
  {
    name: "GNews.io",
    note: "Simple free tier, broad source coverage.",
  },
  {
    name: "Currents API",
    note: "Generous free tier, good for recent tech/business news.",
  },
  {
    name: "Mediastack",
    note: "Free tier with wide source coverage, slightly higher latency on the free plan.",
  },
];

export function DiscoverView({ onContinue }: { onContinue: () => void }) {
  return (
    <div>
      <p className="lede">
        Reacts to real, current events matched to your persona — a different job than the
        pre-approved 24-topic calendar in Content Plan. Use this when something just happened that
        you have a credible reason to comment on.
      </p>
      <div className="notice">
        Needs a news search API key to work. Set <code>NEWS_API_KEY</code> in your <code>.env</code>{" "}
        (see <code>.env.example</code>) — this app already integrates{" "}
        <a href="https://newsapi.org" target="_blank" rel="noreferrer">
          NewsAPI.org
        </a>{" "}
        (free developer tier, get a key at newsapi.org/register).
        <br />
        Want a different source? These are solid alternatives — each would need its own adapter
        behind the existing <code>NewsProvider</code> interface
        (<code>apps/api/src/modules/news/news-provider.ts</code>), same pattern as the current one:
        <ul>
          {ALTERNATIVE_PROVIDERS.map((provider) => (
            <li key={provider.name}>
              <strong>{provider.name}</strong> — {provider.note}
            </li>
          ))}
        </ul>
      </div>

      <TopicsView />
      <OpportunitiesView onContinue={onContinue} />
    </div>
  );
}
