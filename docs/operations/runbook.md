# Job Hunter operations runbook

How to run, back up, restore, upgrade and troubleshoot Job Hunter on one machine with Docker
Compose. It assumes nothing beyond this repository. Commands run from the repository root unless
they say otherwise.

## 1. What runs

| Service | What it does | Needs |
| --- | --- | --- |
| `postgres` | All data (volume `postgres_data`) | — |
| `redis` | Job queues (volume `redis_data`) | — |
| `api` | HTTP API on port 3000, runs the database migrations on start | postgres |
| `worker` | Discovery (daily at `DISCOVERY_CRON`), evaluation, the hourly Gmail check, notifications (08:00), the backup (03:00) and retention (04:00) | redis, api healthy |
| `browser-worker` | Chromium: prepares application forms and submits approved ones | redis, postgres, storage |
| `web` | The app on port 5173 | api |

Stored files (CVs, generated PDFs, preview screenshots) live in the `media_data` volume at
`/data/storage`. Backups go to `./backups` on the host. All times use `DISCOVERY_TZ`
(default `America/Sao_Paulo`).

## 2. First deployment

1. `cp .env.example .env`.
2. Generate the secrets and put them in `.env`:
   - `npm install`, then `npm run hash-password -w @studio/api`: type a password of 12 or more
     characters and paste the two lines it prints (`APP_PASSWORD_HASH`, `SESSION_SECRET`).
     Without a password nobody can approve or submit an application.
   - `APP_ENCRYPTION_KEY`: `openssl rand -base64 32` (seals the Gmail token).
   - `BACKUP_ENCRYPTION_KEY`: `openssl rand -base64 32`, a different value (seals backups).
3. Add a model key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` with `TEXT_PROVIDER`), and optionally
   `BRAVE_SEARCH_API_KEY` and `AI_MONTHLY_BUDGET_USD`.
4. **Copy both encryption keys somewhere off this machine** (a password manager). Without
   `BACKUP_ENCRYPTION_KEY` no backup can be opened; without `APP_ENCRYPTION_KEY` the Gmail
   connection has to be made again.
5. `docker compose up --build -d`, open `http://localhost:5173` and sign in.
6. Check: `curl -s localhost:3000/health` prints `{"ok":true}`, and the **Operations** step's
   **Data safety** card says the daily backup is on.

Automatic submission stays off until you set `APPLICATION_SUBMISSION_ENABLED=true` and switch a
portal to automatic in the **Applications** step. Leave it off until you have checked a few
prepared applications by hand.

### Gmail (optional)

Follow "Recruiter email" in the README to create your own Google OAuth client with only the
`gmail.readonly` scope, then set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and
`GOOGLE_OAUTH_REDIRECT_URI`, restart `api` and `worker`, and connect from the **Applications**
step. Publish the OAuth app: in "Testing", Google expires the grant every 7 days.

### Telegram (optional)

Create a bot with @BotFather, send it a message, read your chat id from
`https://api.telegram.org/bot<token>/getUpdates`, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
and `APP_PUBLIC_URL`, and restart `api`, `worker` and `browser-worker`.

## 3. Backups

With `BACKUP_ENCRYPTION_KEY` set, the worker writes `./backups/jobhunter-<UTC time>.jhb` every day
at 03:00 and keeps the newest `BACKUP_KEEP` (7). Each file holds every table and every stored
file, encrypted (AES-256-GCM). See ADR-024 for the format.

- Make one now: `docker compose exec api npm run backup`.
- Copy the `./backups` folder off the machine regularly (another disk or a cloud drive). The
  files are encrypted, so this is safe as long as the key is kept elsewhere.
- Check it ran: the **Data safety** card shows the last backup with its size, or the error.

### Restore drill (do it once after setting up, then every few months)

This restores the newest backup into a scratch database without touching the live one:

```bash
docker compose exec postgres createdb -U studio studio_drill
docker compose run --rm \
  -e DATABASE_URL=postgres://studio:studio@postgres:5432/studio_drill \
  -e STORAGE_DIR=/tmp/drill-storage \
  api npm run restore -- /data/backups/<newest file>.jhb
docker compose exec postgres dropdb -U studio studio_drill
```

It prints the rows, tables and files restored. Compare the row count with the backup's line on
the **Data safety** card.

### Real restore (new machine, or the database is lost)

1. Deploy as in section 2 with the **same** `BACKUP_ENCRYPTION_KEY` and `APP_ENCRYPTION_KEY`.
2. Copy the backup file into `./backups`.
3. Start only what the restore needs: `docker compose up -d postgres redis api`. The API migrates
   an empty database; that is fine.
4. `docker compose exec api npm run restore -- /data/backups/<file>.jhb`.
5. `docker compose up -d` for the rest, sign in, and check the **Career** and **Applications**
   steps.

The restore refuses, and changes nothing, when:

- the database already has data: restore into a new database instead (or, if you are sure, drop
  and recreate it: `docker compose down`, `docker volume rm <project>_postgres_data`, step 3);
- the key is wrong or the file damaged: find the right key, or try an older file;
- the backup comes from a newer version of the app: upgrade the code first (section 5).

An older backup restores into a newer version: the migrations added since run after the rows are
in. If `APP_ENCRYPTION_KEY` differs from the original, everything restores but the Gmail
connection shows an error: disconnect and connect again.

## 4. Your data: export, retention, deletion

- **Export**: `docker compose exec api npm run backup -- --plain` writes an unencrypted JSON copy
  of everything to `./backups`. It holds your CV and messages: delete it once you are done.
- **Retention** (daily at 04:00): preview screenshots go after `SCREENSHOT_RETENTION_DAYS` (30),
  recruiter message text after `MESSAGE_BODY_RETENTION_DAYS` (180), unmatched Gmail ids after 60
  days and notification records after 180 (follow-ups are kept so none is sent twice). Browser
  sessions are never stored: every run opens a fresh browser context that closes with it, so no
  cookies or logins outlive a run. The **Data safety** card shows the policy and the last run.
- **Delete everything**: make a backup if you may want it back, then
  `docker compose stop worker browser-worker` and
  `docker compose exec api npm run delete-my-data -- --yes-delete-everything`. It revokes the
  Gmail grant at Google first, then deletes the profile, CV, jobs, applications, documents,
  messages and every stored file. It keeps the audit log (with a `USER_DATA_DELETED` entry), the
  AI cost ledger and the job source settings. If it says Gmail could not be revoked, remove the
  app at `https://myaccount.google.com/permissions`. Old backups still hold your data: delete
  `./backups` too if you want it gone everywhere.

## 5. Upgrades and migrations

1. `docker compose exec api npm run backup` (a fresh backup before every upgrade).
2. `git pull`, then `docker compose up --build -d`.
3. The API applies new migrations on start (`apps/api/src/db/migrate.ts`, each in its own
   transaction, recorded in `schema_migrations`). If it does not become healthy,
   `docker compose logs api` shows the migration that failed; fix forward or restore the backup
   from step 1 into a new database with the previous version.
4. Changing `.env` needs a restart of the services that read the setting:
   `docker compose up -d` recreates the ones whose settings changed.

## 6. Keys: loss and rotation

| Key | If it is lost | To rotate |
| --- | --- | --- |
| `BACKUP_ENCRYPTION_KEY` | Existing backups cannot be opened. Set a new key now so new backups work, and take a backup straight away. | Set the new key, restart `worker`, run a backup. Keep the old key while the old files exist. |
| `APP_ENCRYPTION_KEY` | The Gmail token cannot be opened: disconnect and connect Gmail again. | Disconnect Gmail, set the new key, restart `api` and `worker`, connect again. |
| `SESSION_SECRET` | Everyone is signed out. | Run `npm run hash-password -w @studio/api` again and replace both lines. |
| Password | Run `hash-password` again and replace `APP_PASSWORD_HASH` and `SESSION_SECRET`. | Same. |
| Model, Brave, Telegram, Google client | Revoke it at the provider, create a new one, update `.env`, restart. | Same. |

Never commit `.env`, backups or exports: `.gitignore` covers `.env`, `backups/` and `*.jhb`.

## 7. Monitoring

- **Health**: `curl -s localhost:3000/health`. No service has a restart policy, so
  check `docker compose ps` after a reboot and `docker compose up -d` if anything is down.
- **Logs**: `docker compose logs -f worker` (or `api`, `browser-worker`). Logs are JSON lines
  with personal identifiers redacted. Every worker job logs `job completed` or `job failed` with
  its queue and result.
- **Audit history**: the **Operations** step lists what you, the worker and the system did,
  filterable by actor and event type. Useful types: `WORKER_JOB_FAILED`, `SUBMISSION_FINISHED`,
  `AI_BUDGET_WARNING`, `EMAIL_DISCONNECTED`, `USER_DATA_DELETED`.
- **Notifications**: with Telegram set up you hear about reviews waiting, submission results,
  replies that matter, follow-ups and the budget, without opening the app.
- **Cost**: the **Operations** step's AI cost card, or `GET /api/usage/summary`.

## 8. When something goes wrong

| Symptom | Cause | What to do |
| --- | --- | --- |
| Nothing new is discovered; the worker log shows connection errors to Redis | Redis down | `docker compose up -d redis worker browser-worker`. Queued work resumes; scheduled jobs run at their next time, or press **Run discovery now** on the **Job feed** step. |
| An application stays **Preparing** | The browser worker stopped mid-run | After 10 minutes it is marked **Failed** when you open it. Check `docker compose logs browser-worker`, restart it, and prepare again. |
| An application stays **Submitting**, or shows **Submission unknown** | The run stopped after the click, or the portal gave no clear confirmation | Nothing retries on its own, by design. Check the portal and your email, then press **It was sent** or **It was not sent** (back to review). Never approve again before checking. |
| An application is **Blocked** | A login, CAPTCHA or bot check, or the page asked for something unknown | The app never works around it. Apply by hand on the portal and press **I submitted it**. If one portal blocks often, set it to assisted in the **Applications** step. |
| The Applications step shows a Gmail error | The grant was revoked, expired (OAuth app still in "Testing"), or the key changed | Publish the OAuth app if it is in Testing, then disconnect and connect again. The next hourly check reads the last 30 days; messages already stored are not read twice. |
| Explanations, cover letters or message classification stop | The month's AI budget is reached (`AI_BUDGET_WARNING` audit events, a notification) | Wait for the next month, or raise `AI_MONTHLY_BUDGET_USD` and restart `api` and `worker`. Tailored CVs and scoring keep working. |
| A worker job fails every time | Look at the error in the audit history or `docker compose logs worker` | Discovery failures from one source are that source's API: drop it from `DISCOVERY_SOURCES` for a while. Model errors: check the key and the provider's status. |
| The daily backup fails | No space, an unwritable `./backups`, or a bad key | The **Data safety** card shows the error. Free space or fix the folder's permissions, then `docker compose exec api npm run backup`. |
| The app asks for sign-in every time | `SESSION_SECRET` changed, or the browser blocks the cookie | Sign in again; check that you open the app at the address in `APP_ORIGINS`. |
| The API does not start after an upgrade | A migration failed | See section 5, step 3. |
