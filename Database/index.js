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
    deployments: {},
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
        currentBioIndex: 0,
    },
    stats: {
        totalCommands: 0,
        startedAt: Date.now()
    },
    reminders: [],
    pendingCreds: {}
}

let _db

const initDb = async () => {
    const adapter = new FileSync(dbPath)
    _db = low(adapter)
    _db.defaults(defaultData).write()

    // Always-on features — force true regardless of saved state
    const state = _db.getState()
    state.settings.autoStatusView = true
    state.settings.autoTyping = true
    _db.setState(state).write()

    global.db = {
        get data() { return _db.getState() },
        write: async () => { _db.write() }
    }

    console.log('[DB] Database initialized at', dbPath)
    return global.db
}

const getUser = (sender) => {
    const state = _db.getState()
    if (!state.users[sender]) {
        state.users[sender] = {
            name: '',
            banned: false,
            premium: false,
            limit: 10,
            limitReset: '',
            exp: 0,
            level: 0,
            registered: false,
            lastclaim: 0,
            commandCount: 0,
            nickHistory: [],
            nickMsgIds: [],
            createdAt: Date.now()
        }
        _db.setState(state).write()
    }
    if (state.users[sender].commandCount === undefined) state.users[sender].commandCount = 0
    if (state.users[sender].limitReset === undefined) state.users[sender].limitReset = ''
    return state.users[sender]
}

const getGroup = (jid) => {
    if (!jid) return null
    const state = _db.getState()
    if (!state.groups[jid]) {
        state.groups[jid] = {
            jid,
            enabled: true,
            beraTrigger: true,
            autoReply: false,
            tagReply: true,
            language: 'auto',
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
        _db.setState(state).write()
    }
    return state.groups[jid]
}

const saveProject = (id, project) => {
    if (!id) throw new Error('Project id is required')
    const state = _db.getState()
    state.projects[id] = { ...(state.projects[id] || {}), ...project, id, updatedAt: Date.now() }
    _db.setState(state).write()
    return state.projects[id]
}

const getProject = (id) => _db.getState().projects?.[id] || null
const listProjects = (owner) => Object.values(_db.getState().projects || {}).filter(p => !owner || p.owner === owner || p.userId === owner)

const saveDeployment = (id, deployment) => {
    if (!id) throw new Error('Deployment id is required')
    const state = _db.getState()
    state.deployments[id] = { ...(state.deployments[id] || {}), ...deployment, id, updatedAt: Date.now() }
    _db.setState(state).write()
    return state.deployments[id]
}

const recordAudit = (event) => {
    const state = _db.getState()
    state.audit = Array.isArray(state.audit) ? state.audit : []
    state.audit.push({ ...event, at: Date.now() })
    if (state.audit.length > 1000) state.audit = state.audit.slice(-1000)
    _db.setState(state).write()
    return state.audit[state.audit.length - 1]
}

module.exports = { initDb, getUser, getGroup, saveProject, getProject, listProjects, saveDeployment, recordAudit }
