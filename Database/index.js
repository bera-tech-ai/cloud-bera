'use strict'

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const path = require('path')
const fs = require('fs')

const dbDir = path.resolve('./Database')
const dbPath = path.join(dbDir, 'db.json')
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

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

const mergeDefaults = (base, value) => {
    if (Array.isArray(base)) return Array.isArray(value) ? value : base
    if (base && typeof base === 'object') {
        const result = { ...base }
        for (const [key, val] of Object.entries(value || {})) result[key] = key in result ? mergeDefaults(result[key], val) : val
        return result
    }
    return value === undefined ? base : value
}

const persistPostgres = () => {
    if (!_pool || !_db) return Promise.resolve()
    const snapshot = JSON.stringify(_db.getState())
    _persistQueue = _persistQueue.then(() => _pool.query(
        `INSERT INTO bera_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [snapshot]
    )).catch(error => console.error('[DB] PostgreSQL write failed:', error.message))
    return _persistQueue
}

const writeState = () => {
    _db.write()
    return persistPostgres()
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
            connectionTimeoutMillis: 15000,
            ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
        })
        await _pool.query(`
            CREATE TABLE IF NOT EXISTS bera_state (
                id INTEGER PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `)
        const result = await _pool.query('SELECT data FROM bera_state WHERE id = 1')
        if (result.rows[0]?.data) _db.setState(mergeDefaults(defaultData, result.rows[0].data)).write()
        await persistPostgres()
        _provider = 'postgresql'
        console.log('[DB] PostgreSQL persistence enabled')
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
        get ready() { return Boolean(_db) },
        get pool() { return _pool }
    }
    console.log('[DB] Database initialized using', _provider, _provider === 'json' ? `at ${dbPath}` : 'with local JSON cache')
    return global.db
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
        state.groups[jid] = { jid, enabled: true, beraTrigger: true, autoReply: false, tagReply: true, language: 'auto', createdAt: Date.now(), updatedAt: Date.now() }
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

module.exports = { initDb, closeDb, getUser, getGroup, saveProject, getProject, listProjects, saveDeployment, saveSession, getSession, recordAudit }
