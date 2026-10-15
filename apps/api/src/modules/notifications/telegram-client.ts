// Sends plain-text messages through a Telegram bot (Milestone 5). Errors name the HTTP status
// only: the bot token is part of the URL and must never reach a log.
export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(text: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error("Telegram could not be reached.");
    }
    if (!response.ok) throw new Error(`Telegram answered HTTP ${response.status}.`);
  }
}
