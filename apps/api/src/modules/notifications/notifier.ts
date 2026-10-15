import { applicationChangeText, budgetText, digestText, followUpText, recruiterMessageText } from "./notification-messages.js";
import type { NotificationRepository } from "./notification-repository.js";

type Repo = Pick<NotificationRepository, "claim" | "finish" | "applicationJob" | "highScoresSince">;
type Sender = { send(text: string): Promise<void> };
type FollowUps = () => Promise<Array<{ applicationId: string; job: { title: string; company: string }; followUp: { due: boolean; waitingDays: number } }>>;

export type ApplicationChange = { applicationId: string; from: string; to: string; actor: string; at: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

// Tells the user what needs them (Milestone 5, ticket 6). Off when Telegram is not set up.
// Each event is claimed by key before it is sent, so it goes out once. A failed send is
// recorded and never fails the work that caused it.
export class Notifier {
  constructor(
    private readonly sender: Sender | null,
    private readonly repo: Repo,
    private readonly settings: { appUrl: string; digestMinScore: number },
    private readonly now: () => Date = () => new Date(),
  ) {}

  get enabled(): boolean {
    return this.sender !== null;
  }

  // Changes made by the worker or the system: the user already knows about their own.
  async applicationChanged(change: ApplicationChange): Promise<void> {
    if (!this.sender || change.actor === "USER") return;
    const job = await this.repo.applicationJob(change.applicationId);
    if (!job) return;
    const text = applicationChangeText(change, job, this.settings.appUrl);
    if (text) await this.send(`application.${change.applicationId}.${change.to}.${change.at.getTime()}`, "APPLICATION", text);
  }

  async messageClassified(message: { id: string; applicationId: string | null; classification: string }): Promise<void> {
    if (!this.sender || !message.applicationId) return;
    const job = await this.repo.applicationJob(message.applicationId);
    if (!job) return;
    const text = recruiterMessageText(message.classification, job, this.settings.appUrl);
    if (text) await this.send(`message.${message.id}`, "MESSAGE", text);
  }

  async budgetCrossed(crossing: { state: "WARNING" | "REACHED"; spentUsd: number; budgetUsd: number }): Promise<void> {
    if (!this.sender) return;
    const month = this.now().toISOString().slice(0, 7);
    await this.send(`budget.${month}.${crossing.state}`, "BUDGET", budgetText(crossing.state, crossing.spentUsd, crossing.budgetUsd));
  }

  // The daily run: jobs scored at the digest threshold in the last day, and follow-ups due.
  async daily(followUps: FollowUps): Promise<{ digest: number; followUps: number }> {
    if (!this.sender) return { digest: 0, followUps: 0 };
    const now = this.now();
    const jobs = await this.repo.highScoresSince(new Date(now.getTime() - DAY_MS), this.settings.digestMinScore);
    const digest = digestText(jobs, this.settings.digestMinScore);
    if (digest) await this.send(`digest.${now.toISOString().slice(0, 10)}`, "DIGEST", digest);
    let sent = 0;
    for (const item of await followUps()) {
      if (!item.followUp.due) continue;
      if (await this.send(`follow-up.${item.applicationId}`, "FOLLOW_UP", followUpText(item.job, item.followUp.waitingDays, this.settings.appUrl))) sent += 1;
    }
    return { digest: digest ? jobs.length : 0, followUps: sent };
  }

  private async send(key: string, kind: string, text: string): Promise<boolean> {
    if (!this.sender) return false;
    try {
      if (!(await this.repo.claim(key, kind))) return false;
    } catch {
      return false;
    }
    try {
      await this.sender.send(text);
      await this.repo.finish(key, "SENT").catch(() => undefined);
      return true;
    } catch (error) {
      await this.repo.finish(key, "FAILED", error instanceof Error ? error.message : "Sending failed.").catch(() => undefined);
      return false;
    }
  }
}
