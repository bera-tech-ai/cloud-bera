'use strict'

const crypto = require('crypto')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const path = require('path')
const fs = require('fs')
const { resolveDbSchema, qualified, quoteIdent } = require('../Library/lib/db-schema')
const { recordWriteSuccess, recordWriteFailure, getWriteHealth } = require('../Library/lib/db-health')
const { resolveTenantId } = require('../Library/lib/tenant')

const dbDir = path.resolve('./Database')
const dbPath = path.join(dbDir, 'db.json')
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

// Phase 4 — explicit PostgreSQL schema (spec §20). See Library/lib/db-schema.js:
// the old code set no search_path and used unqualified table names, so under
// the default path it read/wrote public.bera_state (legacy, no tenant_id)
// while the tenant-isolated rows live in berahost.bera_state. Every table
// below is schema-qualified through q(), and the pool also opens with an
// explicit search_path for the same schema.
const dbSchema = resolveDbSchema()
const q = table => qualified(dbSchema, table)
const beraStateTable = q('bera_state')
const sessionLeasesTable = q('bera_session_leases')

// Phase 4 — tenant allocation (spec §20). No manual env var per customer:
// an explicit BERA_TENANT_ID still wins, BERA_AUTH_SESSION_ID is the
// backwards-compatible fallback, otherwise the ID from a previous
// auto-generation is re-used from the marker file, and only a fresh install
// generates one (persisted once, so restarts never orphan state).
const tenantMarkerPath = path.join(dbDir, '.tenant-id')
const tenantResolution = resolveTenantId({
    readMarker: () => fs.existsSync(tenantMarkerPath) ? fs.readFileSync(tenantMarkerPath, 'utf8') : '',
    writeMarker: value => fs.writeFileSync(tenantMarkerPath, `${value}\n`, 'utf8')
})
const tenantId = tenantResolution.tenantId
if (tenantResolution.generated) {
    console.log(`[DB] No tenant configured — generated tenant ${tenantId} (saved to ${tenantMarkerPath}). Set BERA_TENANT_ID to pin it.`)
}

const defaultData = {
    users: {},
    groups: {},
    projects: {},
    projectSupport: { projects: {}, cases: {}, activeByUser: {}, activeByChat: {} },
    deployments: {},
    chatbera: { globalEnabled: false, enabled: {}, groupEnabled: false, languagePreferences: {}, voiceReplies: {} },
    audit: [],
    keys: {},
    settings: {
        autoread: false,
        autobio: false,
        autoStatusView: true,
        autoTyping: true,
        noPrefix: false,
        welcome: false,
        prefix: '',
        autoReplies: {},
        schedules: [],
        bios: [],
        currentBioIndex: 0
    },
    stats: { totalCommands: 0, startedAt: Date.now() },
    reminders: [],
    pendingCreds: {},
    sessions: {}
}

let _db
let _pool = null
let _provider = 'json'
let _persistQueue = Promise.resolve()
const leaseOwnerId = String(process.env.BERA_INSTANCE_ID || `${process.pid}-${crypto.randomUUID()}`)
const leaseTtlSeconds = Math.max(30, Number(process.env.BERA_SESSION_LEASE_TTL || 90))

const mergeDefaults = (base, value) => {
    if (Array.isArray(base)) return Array.isArray(value) ? value : base
    if (base && typeof base === 'object') {
        const result = { ...base }
        for (const [key, val] of Object.entries(value || {})) result[key] = key in result ? mergeDefaults(result[key], val) : val
        return result
    }
    return value === undefined ? base : value
}

const ensureSessionLeaseTable = async () => {
    if (!_pool) return false
    await _pool.query(`
        CREATE TABLE IF NOT EXISTS ${sessionLeasesTable} (
            session_id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `)
    return true
}

const acquireSessionLease = async (sessionId) => {
    if (!_pool) return { acquired: true, ownerId: leaseOwnerId, provider: 'local' }
    const sid = String(sessionId || tenantId).trim() || tenantId
    await ensureSessionLeaseTable()
    const result = await _pool.query(
        `INSERT INTO ${sessionLeasesTable} (session_id, owner_id, acquired_at, heartbeat_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (session_id) DO UPDATE
         SET owner_id = EXCLUDED.owner_id,
             acquired_at = CASE
                 WHEN ${sessionLeasesTable}.owner_id = EXCLUDED.owner_id
                   OR ${sessionLeasesTable}.heartbeat_at < NOW() - ($3 * INTERVAL '1 second')
                 THEN NOW() ELSE ${sessionLeasesTable}.acquired_at END,
             heartbeat_at = CASE
                 WHEN ${sessionLeasesTable}.owner_id = EXCLUDED.owner_id
                   OR ${sessionLeasesTable}.heartbeat_at < NOW() - ($3 * INTERVAL '1 second')
                 THEN NOW() ELSE ${sessionLeasesTable}.heartbeat_at END
         WHERE ${sessionLeasesTable}.owner_id = EXCLUDED.owner_id
            OR ${sessionLeasesTable}.heartbeat_at < NOW() - ($3 * INTERVAL '1 second')
         RETURNING owner_id, heartbeat_at`,
        [sid, leaseOwnerId, leaseTtlSeconds]
    )
    const row = result.rows[0]
    return {
        acquired: Boolean(row && row.owner_id === leaseOwnerId),
        ownerId: row?.owner_id || null,
        sessionId: sid,
        ttlSeconds: leaseTtlSeconds,
        provider: 'postgresql'
    }
}

const heartbeatSessionLease = async (sessionId) => {
    if (!_pool) return true
    const sid = String(sessionId || tenantId).trim() || tenantId
    await ensureSessionLeaseTable()
    const result = await _pool.query(
        `UPDATE ${sessionLeasesTable} SET heartbeat_at = NOW()
         WHERE session_id = $1 AND owner_id = $2 RETURNING session_id`,
        [sid, leaseOwnerId]
    )
    if (result.rowCount === 1) return true

    // The table may have been recreated or the lease may have been cleared by
    // an administrator. Reacquire this process's lease rather than killing a
    // healthy bot and making it appear offline.
    const reacquired = await acquireSessionLease(sid)
    return reacquired.acquired
}

const releaseSessionLease = async (sessionId) => {
    if (!_pool) return
    const sid = String(sessionId || tenantId).trim() || tenantId
    await _pool.query(
        `DELETE FROM ${sessionLeasesTable} WHERE session_id = $1 AND owner_id = $2`,
        [sid, leaseOwnerId]
    )
}

const persistPostgres = () => {
    if (!_pool || !_db) return Promise.resolve()
    const snapshot = JSON.stringify(_db.getState())
    // Phase 4 — a failed write must not silently discard state (spec §20).
    // The promise still resolves (callers must not crash the bot on a
    // transient outage), but the failure is now recorded in the write-health
    // alarm (Library/lib/db-health.js) instead of only being console-logged:
    // check getWriteHealth() / global.db.writeHealth before trusting that
    // PostgreSQL holds the latest state.
    _persistQueue = _persistQueue.then(async () => {
        await _pool.query(
            `INSERT INTO ${beraStateTable} (tenant_id, data, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (tenant_id)
             DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [tenantId, snapshot]
        )
        recordWriteSuccess()
    }).catch(error => {
        const health = recordWriteFailure(error)
        console.error(`[DB] PostgreSQL write failed (${health.consecutiveFailures} consecutive):`, error.message)
    })
    return _persistQueue
}

const migrateStateTable = async () => {
    // Phase 4: the schema is created explicitly first — a fresh database has
    // no berahost schema, and the old code relied on the default search_path.
    await _pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(dbSchema)}`)
    await _pool.query(`
        CREATE TABLE IF NOT EXISTS ${beraStateTable} (
            tenant_id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `)

    const columns = await _pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'bera_state'
    `, [dbSchema])
    const names = new Set(columns.rows.map(row => row.column_name))

    // Migrate the original or partially migrated schema:
    //   id INTEGER PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ
    // The existing global row is assigned to the current tenant so its data is
    // preserved. The advisory lock prevents two bot processes from changing
    // this shared table at the same time.
    const client = await _pool.connect()
    try {
        await client.query('BEGIN')
        await client.query("SELECT pg_advisory_xact_lock(hashtext('bera_state_tenant_migration'))")

        const lockedColumns = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'bera_state'
        `, [dbSchema])
        const lockedNames = new Set(lockedColumns.rows.map(row => row.column_name))
        const hasId = lockedNames.has('id')
        const hasTenantId = lockedNames.has('tenant_id')

        if (hasId && !hasTenantId) {
            await client.query(`ALTER TABLE ${beraStateTable} ADD COLUMN tenant_id TEXT`)
        }

        if (hasId || hasTenantId) {
            await client.query(
                `UPDATE ${beraStateTable} SET tenant_id = $1 WHERE tenant_id IS NULL`,
                [tenantId]
            )
            await client.query(`ALTER TABLE ${beraStateTable} ALTER COLUMN tenant_id SET NOT NULL`)

            // Keep the legacy id column for compatibility with old tooling,
            // but make it nullable because new tenant rows do not use it.
            if (hasId) await client.query(`ALTER TABLE ${beraStateTable} ALTER COLUMN id DROP NOT NULL`)

            // Drop whichever primary-key constraint the old table used, then
            // make tenant_id the sole identity for application state. The
            // constraint is looked up by schema + table name (a DO block
            // cannot take query parameters, and 'bera_state'::regclass
            // would resolve through search_path instead of explicitly).
            const pk = await client.query(`
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = $1 AND t.relname = 'bera_state' AND c.contype = 'p'
            `, [dbSchema])
            if (pk.rows[0]) {
                await client.query(`ALTER TABLE ${beraStateTable} DROP CONSTRAINT ${quoteIdent(pk.rows[0].conname)}`)
            }
            await client.query(`ALTER TABLE ${beraStateTable} ADD CONSTRAINT bera_state_pkey PRIMARY KEY (tenant_id)`)
        }

        await client.query('COMMIT')
        if (hasId || hasTenantId) console.log(`[DB] Ensured bera_state tenant schema for: ${tenantId}`)
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
    } finally {
        client.release()
    }
}

const initPostgres = async () => {
    if (!process.env.DATABASE_URL) return false
    let Pool
    try { ({ Pool } = require('pg')) } catch (error) {
        console.error('[DB] DATABASE_URL is set but pg is unavailable:', error.message)
        return false
    }
    try {
        _pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: Number(process.env.DB_POOL_MAX || 5),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 30000,
            // NOTE (2026-11-25): do NOT pass search_path as a Pool `options`
            // startup parameter — the Neon pooler rejects it outright
            // ("unsupported startup parameter in options: search_path"),
            // which made every boot fall back to JSON storage. Tenant
            // isolation does not need it: every table name in this file is
            // schema-qualified via qualified()/beraStateTable, so no query
            // can silently resolve to public.bera_state.
            ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
        })

        await migrateStateTable()
        const result = await _pool.query(
            `SELECT data FROM ${beraStateTable} WHERE tenant_id = $1`,
            [tenantId]
        )
        if (result.rows[0]?.data) _db.setState(mergeDefaults(defaultData, result.rows[0].data)).write()
        await persistPostgres()
        _provider = 'postgresql'
        console.log(`[DB] PostgreSQL persistence enabled for tenant: ${tenantId} (schema: ${dbSchema})`)
        return true
    } catch (error) {
        console.error('[DB] PostgreSQL unavailable; using JSON fallback:', error.message)
        try { await _pool?.end() } catch {}
        _pool = null
        return false
    }
}

const initDb = async () => {
    const adapter = new FileSync(dbPath)
    _db = low(adapter)
    _db.defaults(defaultData).write()
    const state = _db.getState()
    state.settings.autoStatusView = true
    state.settings.autoTyping = true
    _db.setState(state).write()
    await initPostgres()

    global.db = {
        get data() { return _db.getState() },
        write: () => writeState(),
        get provider() { return _provider },
        get tenantId() { return tenantId },
        get tenantSource() { return tenantResolution.source },
        get dbSchema() { return dbSchema },
        get writeHealth() { return getWriteHealth() },
        get ready() { return Boolean(_db) },
        get pool() { return _pool }
    }
    console.log('[DB] Database initialized using', _provider, _provider === 'json' ? `at ${dbPath}` : `with tenant ${tenantId} and local JSON cache`)
    return global.db
}

const writeState = () => {
    _db.write()
    return persistPostgres()
}

const getUser = sender => {
    const state = _db.getState()
    if (!state.users[sender]) {
        state.users[sender] = { name: '', banned: false, premium: false, limit: 10, limitReset: '', exp: 0, level: 0, registered: false, lastclaim: 0, commandCount: 0, nickHistory: [], nickMsgIds: [], createdAt: Date.now() }
        writeState()
    }
    if (state.users[sender].commandCount === undefined) state.users[sender].commandCount = 0
    if (state.users[sender].limitReset === undefined) state.users[sender].limitReset = ''
    return state.users[sender]
}

const getGroup = jid => {
    if (!jid) return null
    const state = _db.getState()
    if (!state.groups[jid]) {
        state.groups[jid] = { jid, enabled: true, beraTrigger: true, autoReply: false, tagReply: true, language: 'en', createdAt: Date.now(), updatedAt: Date.now() }
        writeState()
    }
    return state.groups[jid]
}

const saveProject = (id, project) => {
    if (!id) throw new Error('Project id is required')
    const state = _db.getState()
    state.projects[id] = { ...(state.projects[id] || {}), ...project, id, updatedAt: Date.now() }
    writeState()
    return state.projects[id]
}
const getProject = id => _db.getState().projects?.[id] || null
const listProjects = owner => Object.values(_db.getState().projects || {}).filter(p => !owner || p.owner === owner || p.userId === owner)

const saveDeployment = (id, deployment) => {
    if (!id) throw new Error('Deployment id is required')
    const state = _db.getState()
    state.deployments[id] = { ...(state.deployments[id] || {}), ...deployment, id, updatedAt: Date.now() }
    writeState()
    return state.deployments[id]
}

const saveSession = (id, session) => {
    if (!id) throw new Error('Session id is required')
    const state = _db.getState()
    state.sessions[id] = { ...(state.sessions[id] || {}), ...session, id, updatedAt: Date.now() }
    writeState()
    return state.sessions[id]
}
const getSession = id => _db.getState().sessions?.[id] || null

const recordAudit = event => {
    const state = _db.getState()
    state.audit = Array.isArray(state.audit) ? state.audit : []
    state.audit.push({ ...event, at: Date.now() })
    if (state.audit.length > 1000) state.audit = state.audit.slice(-1000)
    writeState()
    return state.audit[state.audit.length - 1]
}

const closeDb = async () => { try { await _pool?.end() } finally { _pool = null } }

module.exports = {
    initDb,
    closeDb,
    acquireSessionLease,
    heartbeatSessionLease,
    releaseSessionLease,
    getUser,
    getGroup,
    saveProject,
    getProject,
    listProjects,
    saveDeployment,
    saveSession,
    getSession,
    recordAudit,
    // Phase 4: explicit schema + failed-write alarm (spec §20).
    get dbSchema() { return dbSchema },
    get tenantId() { return tenantId },
    get tenantSource() { return tenantResolution.source },
    getWriteHealth
}
