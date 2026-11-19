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
