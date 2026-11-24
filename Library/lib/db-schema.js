'use strict'

// Phase 4 — explicit PostgreSQL schema for tenant state (spec §20).
//
// Finding (Neon inspection, 2026-11-24): Database/index.js created its pool
// with only a connection string and used unqualified table names, so under
// the default search_path ("$user", public) the bot read/wrote
// public.bera_state — the legacy single-row table with no tenant_id — and
// looked for bera_session_leases in public, where that table does not exist.
// The tenant-isolated rows live in berahost.bera_state. Tenant isolation
// was therefore NOT in effect for application state on a default deployment,
// whatever BERA_TENANT_ID was set to.
//
// Fix: the schema is now explicit in two independent ways, so neither can
// silently drift back to the default path:
//   1. every table name in SQL is schema-qualified (qualified(schema, table))
//   2. the pool is opened with an explicit search_path for that schema
// The schema defaults to "berahost" — where the live tenant rows are — and
// can be overridden with BERA_DB_SCHEMA. A deployment that still keeps its
// state in the legacy public table must set BERA_DB_SCHEMA=public explicitly
// (see DATABASE.md for the one-time move to berahost).

const DEFAULT_SCHEMA = 'berahost'

const isValidSchemaName = value => /^[A-Za-z_][A-Za-z0-9_$]*$/.test(String(value || ''))

const resolveDbSchema = (env = process.env) => {
    const raw = String(env?.BERA_DB_SCHEMA || '').trim()
    if (!raw) return DEFAULT_SCHEMA
    if (!isValidSchemaName(raw)) {
        throw new Error('BERA_DB_SCHEMA must be a valid PostgreSQL schema name (letters, digits, underscore).')
    }
    return raw
}

const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`

const qualified = (schema, table) => `${quoteIdent(schema)}.${quoteIdent(table)}`

// Value for the pg Pool `options` setting so every connection in the pool
// starts with this search_path, even for queries that slip through without
// a qualified name.
const searchPathOption = schema => `-c search_path=${quoteIdent(schema)}`

module.exports = { DEFAULT_SCHEMA, isValidSchemaName, resolveDbSchema, quoteIdent, qualified, searchPathOption }
