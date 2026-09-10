const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const path = require('path')
const fs = require('fs')
const { normalizeJid } = require('../Library/lib/identity')

const dbDir = path.resolve('./Database')
const dbPath = path.join(dbDir, 'db.json')

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const defaultData = {
    users: {},
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
    const key = normalizeJid(sender) || String(sender || '')
    if (!state.users[key]) {
        state.users[key] = {
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
    if (state.users[key].commandCount === undefined) state.users[key].commandCount = 0
    if (state.users[key].limitReset === undefined) state.users[key].limitReset = ''
    return state.users[key]
}

module.exports = { initDb, getUser }
