'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const admin = require('../Commands/admin')
const { policyFor } = require('../Library/lib/permissions')

const invoke = async ({ isOwner = true, chat = '254700000001@s.whatsapp.net', isGroup = false } = {}) => {
    const replies = []
    const m = { isGroup, chat }
    await admin(m, {
        command: 'dbstatus',
        isOwner,
        chat,
        reply: async value => replies.push(String(value))
    })
    return replies.join('\n')
}

test('dbstatus is registered and restricted to the owner policy', () => {
    assert.ok(admin.command.includes('dbstatus'))
    assert.equal(policyFor('dbstatus').scope, 'owner')
})

test('dbstatus refuses non-owners and group chats before querying the database', async () => {
    const previous = global.db
    let queries = 0
    global.db = { ready: true, provider: 'postgresql', pool: { query: async () => { queries++; return { rows: [] } } } }
    try {
        const denied = await invoke({ isOwner: false })
        assert.match(denied, /owner only/i)
        const group = await invoke({ isOwner: true, chat: '123@g.us', isGroup: true })
        assert.match(group, /private chat/i)
        assert.equal(queries, 0)
    } finally {
        global.db = previous
    }
})

test('dbstatus reports PostgreSQL health and encrypted auth counts without exposing identifiers or payloads', async () => {
    const previousDb = global.db
    const previousSessionId = process.env.BERA_AUTH_SESSION_ID
    const statements = []
    process.env.BERA_AUTH_SESSION_ID = 'test-session'
    global.db = {
        ready: true,
        provider: 'postgresql',
        data: { sessions: { whatsapp: { status: 'connected', jid: '254700000001@s.whatsapp.net' } } },
        pool: {
            query: async (sql, params) => {
                const statement = String(sql).replace(/\s+/g, ' ').trim()
                statements.push({ statement, params })
                if (statement === 'SELECT 1 AS ok') return { rows: [{ ok: 1 }] }
                if (statement.includes("data #>> '{sessions,whatsapp,status}'")) return { rows: [{ session_status: 'connected' }] }
                if (statement.includes('COUNT(*) FILTER')) return { rows: [{ credential_records: 1, key_records: 4 }] }
                throw new Error('Unexpected SQL')
            }
        }
    }
    try {
        const output = await invoke()
        assert.match(output, /Provider: PostgreSQL/)
        assert.match(output, /Connection ping: ✅ OK/)
        assert.match(output, /WhatsApp session: connected/)
        assert.match(output, /Encrypted credentials: ✅ saved/)
        assert.match(output, /Encrypted Signal-key records: 4/)
        assert.doesNotMatch(output, /254700000001|test-session|payload|postgresql:\/\//i)
        assert.equal(statements[0].statement, 'SELECT 1 AS ok')
        const authQuery = statements.find(item => item.statement.includes('COUNT(*) FILTER'))
        assert.deepEqual(authQuery.params, ['test-session'])
        assert.doesNotMatch(authQuery.statement, /payload|auth_key/i)
    } finally {
        global.db = previousDb
        if (previousSessionId === undefined) delete process.env.BERA_AUTH_SESSION_ID
        else process.env.BERA_AUTH_SESSION_ID = previousSessionId
    }
})

test('dbstatus reports JSON fallback rather than claiming PostgreSQL auth persistence', async () => {
    const previous = global.db
    global.db = { ready: true, provider: 'json', data: { sessions: { whatsapp: { status: 'starting' } } } }
    try {
        const output = await invoke()
        assert.match(output, /JSON fallback/)
        assert.match(output, /PostgreSQL is not active/)
        assert.match(output, /file-backed; not stored in PostgreSQL/)
        assert.match(output, /WhatsApp session status: starting/)
    } finally {
        global.db = previous
    }
})

test('dbstatus masks PostgreSQL query errors and does not echo database details', async () => {
    const previous = global.db
    global.db = {
        ready: true,
        provider: 'postgresql',
        data: { sessions: { whatsapp: { status: 'disconnected' } } },
        write: async () => {},
        pool: { query: async () => { throw new Error('sensitive database connection details') } }
    }
    try {
        const output = await invoke()
        assert.match(output, /Connection ping: ❌ FAILED/)
        assert.match(output, /check the server logs/i)
        assert.doesNotMatch(output, /sensitive database connection details/)
    } finally {
        global.db = previous
    }
})
