# Bera AI database persistence

Bera supports PostgreSQL through the `DATABASE_URL` environment variable. The repository never contains the connection string or database password.

## Configure deployment

Set these environment variables in BeraHost or the hosting provider's secret manager:

```dotenv
DATABASE_URL=postgresql://<USER>:<PASSWORD>@<HOST>/<DATABASE>?sslmode=require
BERA_SESSION_DIR=/persistent/bera-session
DB_POOL_MAX=5
```

`DATABASE_URL` is a secret because it contains database credentials. Do not place it in GitHub, screenshots, WhatsApp messages, or project files.

## What PostgreSQL stores

The bot stores the application state as a durable JSON document in the `bera_state` table. This includes:

- Users and user permissions.
- Group settings and trigger configuration.
- Projects and Agent OS sessions.
- Deployments and lifecycle records.
- Audit events.
- Bot settings and reminders.
- WhatsApp session metadata such as connection status, JID, session directory, and timestamps.

The actual Baileys authentication keys remain in `BERA_SESSION_DIR`. They are filesystem credentials and should be placed on a persistent private volume. PostgreSQL stores metadata about that session, not the private encryption keys.

## Startup behavior

On startup, Bera:

1. Initializes the local JSON cache.
2. Connects to PostgreSQL when `DATABASE_URL` exists.
3. Creates `bera_state` if it does not exist.
4. Loads the durable PostgreSQL state into the local cache.
5. Writes application changes to PostgreSQL and the local cache.
6. Falls back to `Database/db.json` if PostgreSQL is temporarily unavailable.

The fallback prevents a transient database outage from stopping the bot, while PostgreSQL remains the durable source whenever it is available.

## Neon compatibility

Neon connection strings using `sslmode=require` are supported. The PostgreSQL client uses TLS by default and a small connection pool. The password is never logged or written to application state.
