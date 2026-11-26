'use strict'

// Settings persistence: .setprefix/.setsetting/.getsetting/.resetsetting
// (Commands/admin.js) and the database mirrors for the file-based stores
// (agent-os, project-lifecycle, beraai agent memory, btnmode). The database
// is the global store: settings writes must land in global.db.data.settings
// with db.write() called, and store saves must mirror into global.db.data
// while loads prefer the DB copy and fall back to the file.

const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// agent-os reads its state-file path from the env at module load — point it
// at a temp file before requiring anything that pulls agent-os in.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-settings-persistence-'))
const agentStateFile = path.join(tmpRoot, 'agent_os.json')
process.env.BERA_AGENT_STATE_FILE = agentStateFile

const adminHandle = require('../Commands/admin')
const agentOs = require('../Library/actions/agent-os')
const lifecycle = require('../Library/actions/project-lifecycle')
const beraai = require('../Library/actions/beraai')
const btnmode = require('../Library/actions/btnmode')
const { getUserWorkspace } = require('../Library/lib/workspace')

const stubDb = (data = { settings: {} }) => {
    const db = { data, writes: 0 }
    db.write = async () => { db.writes++ }
    return db
}

const runAdmin = async (command, { args = [], text = '', isOwner = true } = {}) => {
    const replies = []
    const chat = '254700000000@s.whatsapp.net'
    const m = { chat, key: { remoteJid: chat } }
    await adminHandle(m, {
        conn: {}, text, args, command,
        prefix: '.', sender: chat, chat, isOwner,
        reply: async t => { replies.push(String(t)) },
        react: async () => {},
    })
    return replies.join('\n')
}

after(() => {
    delete global.db
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(getUserWorkspace('db-mirror-test'), { recursive: true, force: true }) } catch {}
})

// ── .setprefix ──────────────────────────────────────────────────────────────

test('setprefix saves settings.prefix and persists via db.write', async () => {
    global.db = stubDb()
    const out = await runAdmin('setprefix', { args: ['#'], text: '#' })
    assert.equal(global.db.data.settings.prefix, '#')
    assert.ok(global.db.writes >= 1, 'db.write must be called')
    assert.match(out, /#/)
})

test('setprefix is owner-only and validates length', async () => {
    global.db = stubDb()
    const denied = await runAdmin('setprefix', { args: ['!'], text: '!', isOwner: false })
    assert.match(denied, /Owner only/)
    assert.equal(global.db.data.settings.prefix, undefined)
    const tooLong = await runAdmin('setprefix', { args: ['abcd'], text: 'abcd' })
    assert.match(tooLong, /Usage/)
    assert.equal(global.db.data.settings.prefix, undefined)
})

// ── .setsetting / .getsetting / .resetsetting ───────────────────────────────

test('setsetting coerces booleans and numbers, then persists', async () => {
    global.db = stubDb()
    await runAdmin('setsetting', { args: ['autoread', 'on'], text: 'autoread on' })
    assert.equal(global.db.data.settings.autoread, true)
    await runAdmin('setsetting', { args: ['autobio', 'off'], text: 'autobio off' })
    assert.equal(global.db.data.settings.autobio, false)
    await runAdmin('setsetting', { args: ['maxitems', '42'], text: 'maxitems 42' })
    assert.equal(global.db.data.settings.maxitems, 42)
    await runAdmin('setsetting', { args: ['botname', 'Bera'], text: 'botname Bera' })
    assert.equal(global.db.data.settings.botname, 'Bera')
    assert.ok(global.db.writes >= 4)
})

test('getsetting masks secret-looking values', async () => {
    global.db = stubDb()
    await runAdmin('setsetting', { args: ['githubToken', 'ghp_secretvalue'], text: 'githubToken ghp_secretvalue' })
    const out = await runAdmin('getsetting', { args: ['githubToken'] })
    assert.ok(!out.includes('ghp_secretvalue'), 'full secret must not be echoed')
    assert.ok(out.includes('••••ue'), 'mask shows last 2 chars only')
    const missing = await runAdmin('getsetting', { args: ['nosuchkey'] })
    assert.match(missing, /not set/)
})

test('resetsetting deletes the key and persists', async () => {
    global.db = stubDb({ settings: { language: 'sw' } })
    const out = await runAdmin('resetsetting', { args: ['language'] })
    assert.match(out, /reset/)
    assert.ok(!('language' in global.db.data.settings))
    assert.ok(global.db.writes >= 1)
})

// ── agent-os DB mirror ──────────────────────────────────────────────────────

test('agent-os save mirrors state into global.db.data.agentOsState and the file', async () => {
    global.db = stubDb()
    const { record } = await agentOs.create({ userId: 'db-mirror-test', name: 'mirror-probe', projectId: 'mirror-probe-1' })
    assert.equal(record.id, 'mirror-probe-1')
    assert.equal(global.db.data.agentOsState.projects['mirror-probe-1'].name, 'mirror-probe')
    const fileState = JSON.parse(fs.readFileSync(agentStateFile, 'utf8'))
    assert.equal(fileState.projects['mirror-probe-1'].name, 'mirror-probe')
})

test('agent-os load prefers the DB copy over the file', async () => {
    global.db = stubDb()
    global.db.data.agentOsState = { projects: { 'db-only-1': { id: 'db-only-1', name: 'dbonly' } }, events: [] }
    assert.equal(agentOs.get('db-only-1')?.name, 'dbonly')
    // The file still holds mirror-probe-1, but the DB copy wins wholesale.
    assert.equal(agentOs.get('mirror-probe-1'), null)
})

test('agent-os falls back to the file when the DB copy is absent or db is missing', async () => {
    global.db = stubDb()
    assert.equal(agentOs.get('mirror-probe-1')?.name, 'mirror-probe')
    delete global.db
    assert.equal(agentOs.get('mirror-probe-1')?.name, 'mirror-probe')
    assert.equal(agentOs.get('never-existed'), null)
})

// ── project-lifecycle DB mirror (load side) ─────────────────────────────────

test('project-lifecycle load prefers the DB copy', () => {
    global.db = stubDb()
    global.db.data.projectLifecycleState = { projects: { 'lc-db-1': { id: 'lc-db-1', name: 'lcdb' } } }
    assert.equal(lifecycle.getProject('lc-db-1')?.name, 'lcdb')
    delete global.db.data.projectLifecycleState
    assert.equal(lifecycle.getProject('lc-db-1'), null)
})

// ── beraai agent memory DB mirror ───────────────────────────────────────────

const memFile = path.join(__dirname, '../Database/agent_memory.json')
const memFileBefore = fs.existsSync(memFile) ? fs.readFileSync(memFile, 'utf8') : null

test('beraai memory adopts the DB copy on first access', () => {
    global.db = stubDb()
    global.db.data.agentMemoryState = { 'db-chat-1': { note: 'from-db' } }
    assert.equal(beraai.getMemory('db-chat-1').note, 'from-db')
})

test('beraai memory saves mirror into global.db.data.agentMemoryState', () => {
    global.db = global.db && global.db.data ? global.db : stubDb()
    beraai.setMemory('test-chat-mirror', 'hello-db', 'greeting')
    assert.equal(global.db.data.agentMemoryState['test-chat-mirror'].greeting, 'hello-db')
    beraai.clearMemory('test-chat-mirror')
    assert.equal(global.db.data.agentMemoryState['test-chat-mirror'], undefined)
})

after(() => {
    // Leave the real agent_memory.json as we found it: if nothing else wrote
    // it during the test, restore the exact original bytes; otherwise just
    // strip the test chats from the current content.
    try {
        const nowRaw = fs.existsSync(memFile) ? fs.readFileSync(memFile, 'utf8') : null
        if (nowRaw === memFileBefore) return
        if (memFileBefore !== null && nowRaw !== null) {
            const cur = JSON.parse(nowRaw)
            delete cur['test-chat-mirror']
            delete cur['db-chat-1']
            const before = JSON.parse(memFileBefore)
            if (JSON.stringify(cur) === JSON.stringify(before)) fs.writeFileSync(memFile, memFileBefore)
            else fs.writeFileSync(memFile, JSON.stringify(cur, null, 2))
        }
    } catch {}
})

// ── btnmode DB persistence ──────────────────────────────────────────────────

test('btnmode hydrates from and persists to global.db settings', () => {
    global.db = stubDb({ settings: { btnMode: { global: true, perChat: {} } } })
    assert.equal(btnmode.getBtnMode(null), true)
    btnmode.setBtnMode('chat-xyz@g.us', false)
    assert.equal(global.db.data.settings.btnMode.perChat['chat-xyz@g.us'], false)
    assert.equal(btnmode.getBtnMode('chat-xyz@g.us'), false)
    btnmode.clearBtnMode('chat-xyz@g.us')
    assert.equal(global.db.data.settings.btnMode.perChat['chat-xyz@g.us'], undefined)
})
