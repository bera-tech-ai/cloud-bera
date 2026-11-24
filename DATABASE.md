# Bera AI database persistence

Bera supports PostgreSQL through the `DATABASE_URL` environment variable. The repository never contains the connection string or database password.

## Configure deployment

Set these environment variables in BeraHost or the hosting provider's secret manager:

```dotenv
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<HOST>/<DATABASE>?sslmode=require
BERA_SESSION_ENCRYPTION_KEY=<strong-random-secret>
BERA_AUTH_SESSION_ID=whatsapp
BERA_SESSION_DIR=/persistent/bera-session
DB_POOL_MAX=5
```

`DATABASE_URL` is a secret because it contains database credentials. Do not place it in GitHub, screenshots, WhatsApp messages, or project files.
Generate the encryption key with `openssl rand -base64 32`, then save it in the hosting provider's secret/environment-variable settings. Never commit this key. PostgreSQL-backed WhatsApp authentication refuses to start without it.

## What PostgreSQL stores

The bot stores the application state as a durable JSON document in the `bera_state` table. This includes:

- Users and user permissions.
- Group settings and trigger configuration.
- Projects and Agent OS sessions.
- Deployments and lifecycle records.
- Audit events.
- Bot settings and reminders.
- WhatsApp session metadata such as connection status, JID, session directory, and timestamps.
- Encrypted Baileys credentials and Signal Protocol keys in the `bera_whatsapp_auth` table.

Baileys credentials and Signal keys are encrypted by the bot with AES-256-GCM before they are written to PostgreSQL. The encryption key is derived from `BERA_SESSION_ENCRYPTION_KEY`; PostgreSQL alone is not sufficient to decrypt the session. The bot also keeps a local auth-state copy in `BERA_SESSION_DIR` for recovery when the application falls back to its JSON database. Keep that directory private and on a persistent volume. On the first PostgreSQL-backed startup, existing filesystem credentials and Signal keys are reused and copied into PostgreSQL as Baileys accesses them, so an already-linked device should not need to be paired again.

## Startup behavior

On startup, Bera:

1. Initializes the local JSON cache.
2. Connects to PostgreSQL when `DATABASE_URL` exists.
3. Creates `bera_state` if it does not exist.
4. Loads the durable PostgreSQL state into the local cache.
5. Writes application changes to PostgreSQL and the local cache.
6. Uses encrypted PostgreSQL auth records for Baileys credentials and Signal keys when PostgreSQL is available.
7. Falls back to `Database/db.json` and the local Baileys auth files if PostgreSQL cannot be reached during initialization.

The fallback prevents a transient database outage from stopping the bot. When PostgreSQL is active, authentication key updates are written to PostgreSQL and mirrored to the local auth folder. Configure one bot process per WhatsApp session; multiple live sockets sharing the same credentials can cause Signal-key conflicts.

## Configure Neon

Add the Neon connection string as the hosting provider's `DATABASE_URL` secret. Keep Neon’s TLS options in the connection URL. Add the separately generated `BERA_SESSION_ENCRYPTION_KEY` as another secret. Do not paste either value into source code, `.env` files tracked by Git, or a commit. If the connection string has been shared in chat or committed, rotate its Neon password and update the hosting secret.

## Neon compatibility

Neon connection strings using `sslmode=require` are supported. The PostgreSQL client uses TLS by default and a small connection pool. The password is never logged or written to application state.

## Phase 4 — explicit schema, tenant scale, backup/restore, write alarm

### The search_path finding (Neon inspection, 2026-11-24)

The bot used to create its pool with only a connection string and use
unqualified table names. Under the default search_path (`"$user"`, public)
it therefore read/wrote `public.bera_state` — the legacy single-row table
with no `tenant_id` — and looked for `bera_session_leases` in `public`,
where that table does not exist. The tenant-isolated rows live in
`berahost.bera_state`. Tenant isolation was **not in effect** for
application state on a default deployment, whatever `BERA_TENANT_ID` was
set to. Which schema the live deployment actually used depended on its
effective search_path (e.g. set by BeraHost via `PGOPTIONS`).

The fix, in `Database/index.js` and `Library/lib/postgres-auth-state.js`,
is explicit in two independent ways:

1. Every table name in SQL is schema-qualified (`"berahost"."bera_state"`,
   `"berahost"."bera_session_leases"`, `"berahost"."bera_whatsapp_auth"`).
2. The pool opens with an explicit `search_path` for the same schema.

The schema defaults to `berahost` — where the live tenant rows are — and
is overridable with `BERA_DB_SCHEMA`. A deployment that still keeps state
in the legacy `public` table must set `BERA_DB_SCHEMA=public` explicitly.

**One-time move from `public` to `berahost`** (run once, then restart with
the default schema). This copies the legacy row into the tenant table; it
does not delete the legacy row:

```sql
INSERT INTO berahost.bera_state (tenant_id, data, updated_at)
SELECT 'bot-<your-tenant-id>', data, updated_at
FROM public.bera_state WHERE id = 1
ON CONFLICT (tenant_id) DO NOTHING;
```

### Tenant allocation — no manual env var per customer

- Tenant IDs are auto-generated as `bot-<16 hex>` (same shape as the live
  tenant IDs). Precedence: `BERA_TENANT_ID` → `BERA_AUTH_SESSION_ID`
  (backwards-compatible) → marker file `Database/.tenant-id` from a
  previous auto-generation → generate once and persist the marker, so a
  restart never orphans state. The literal tenant `'default'` is gone.
- Each WhatsApp number gets a deterministic session ID derived from
  tenant + phone number (`Library/lib/tenant.js`); sessions for different
  numbers are never shared. Session leases (`bera_session_leases`) still
  prevent duplicate live sessions, and a lost lease still stops the bot
  before a WhatsApp 440 conflict.
- Storage paths derive from the tenant ID (`sessions/<tenant>/`,
  `backups/<tenant>/`). Provision a customer from WhatsApp (owner-only):
  `.tenant provision [phone] [owner-phone]`, `.tenant status`,
  `.tenant list`. Start a bot for a provisioned tenant with
  `BERA_TENANT_ID=<tenant id>`.

### Backup and restore

`.tenant backup` writes a JSON backup of the current tenant's state to
`backups/<tenant>/bera_state-<tenant>-<timestamp>.json`. Backup files
contain tenant state — keep them private, never send them over WhatsApp,
never commit them.

Tested restore procedure (see `test/phase4-backup.test.js`):

1. Copy the backup JSON to the target host.
2. Dry run: `node scripts/tenant-restore.js <backup-file.json>` — validates
   format, version and tenant, and prints what would be restored.
3. Apply: `node scripts/tenant-restore.js <backup-file.json> --apply` —
   writes the state into `<schema>.bera_state` for the backup's tenant.
   A tenant mismatch or tampered file refuses the restore.
4. Copy any session files listed by the script into
   `sessions/<tenant>/`, then restart the bot with
   `BERA_TENANT_ID=<tenant id>`.

### Failed-write alarm

A failed PostgreSQL write used to be only a `console.error` while the
write promise still resolved — the caller could not tell, and the local
JSON cache silently diverged from the database. The Neon inspection found
323 bot-log lines mentioning postgres / `[DB]` / write-failed. Writes now
record success/failure in `Library/lib/db-health.js`; check
`.tenant health` or `global.db.writeHealth`. While writes are failing the
alarm reads `DATABASE WRITE ALARM: N consecutive failed write(s)` — do
not restart the bot until writes recover, or the newer local state will
be lost.
