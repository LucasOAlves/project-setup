# ADR-024 — Application-level encrypted backups instead of pg_dump

## Status

Accepted (Milestone 6, tickets 1 and 2). Picked as the default in the Milestone 6 plan, which
Lucas approved on 2026-10-15.

## Context

The spec asks to "encrypt backups and provide local export/deletion". The app's data lives in two
places: the Postgres tables (profile, jobs, applications, messages, audit history) and the storage
directory (the CV, generated PDFs, preview screenshots). A backup that holds only one of them
restores into a broken app: rows that point to missing files, or files no row points to. The
setup is a single user on one machine with Docker Compose, and the API container has no Postgres
client tools.

## Options considered

1. **pg_dump plus a tar of the storage directory, encrypted with age or gpg.** The standard tool,
   and it carries the full schema. But it needs the Postgres client in the image at the same
   major version as the server, two files to keep in step, and an external encryption tool and
   key format.
2. **Application-level archive.** The app reads every table as JSON inside one read-only,
   repeatable-read snapshot, adds the stored files, gzips the lot and seals it with AES-256-GCM
   under `BACKUP_ENCRYPTION_KEY`, in one file. Restore runs the app's own migrations up to the
   backup's schema, inserts the rows in foreign-key order in one transaction, then migrates the
   rest of the way. No extra tools, one file, and the same key format as `APP_ENCRYPTION_KEY`.
3. **Volume snapshots** (copy the Docker volumes). Simplest, but not encrypted, not consistent
   while Postgres runs, and tied to one Postgres version.

## Decision

Option 2. `backup-archive.ts` (pure, tested first) defines the format: `JHB1`, a 12-byte IV, the
16-byte GCM tag, then the sealed gzip of the JSON payload, with the header as associated data. It
also orders tables for restore and refuses an archive whose migrations this version does not
know ("made by a newer version, upgrade first"). `backup-service.ts` makes and restores the
payload, `backup-runner.ts` writes the file (mode 600) and prunes old ones. `npm run backup` and
`npm run restore -- <file>` run it by hand, and the worker writes one every day at 03:00 when
`BACKUP_DIR` and `BACKUP_ENCRYPTION_KEY` are set, keeping the newest `BACKUP_KEEP` (7).

Restore only goes into an empty database (a new one, or one the app has just migrated, whose only
rows are the default job sources, which the backup's rows replace). It never merges into live
data. A wrong key or a damaged file is refused before anything is written.

## Consequences

- One file holds everything needed to bring the app back, and restoring needs only the app.
- The Gmail refresh token stays sealed under `APP_ENCRYPTION_KEY` inside the backup. Restoring
  on a machine with a different `APP_ENCRYPTION_KEY` keeps the rows but the mailbox has to be
  connected again. The runbook says to keep both keys.
- The whole backup is built in memory. That is fine for one user's data (a few MB with the CV and
  screenshots), and would need streaming before it holds thousands of screenshots.
- Postgres objects outside the migrations (none today) would not be carried, because the schema
  comes from the migrations, not from the backup.
- A backup made by a newer version cannot be restored by an older one. An older backup restores
  into a newer version, and columns added since take their defaults.

## Tradeoffs

The app owns a file format and a restore path that pg_dump would have provided, so both are
tested: the archive format and ordering by unit tests, and the round trip by restoring a backup
of the dev database into a new database and comparing every table row by row.
