'use strict'

// Phase 4 §26 matrix — regression tests for the commands this phase touches:
// the view-once gate (.vv answers unsupported by default and sends nothing),
// the tenant plugin (owner-only, provision/status), and the channel plugin
// (owner-only, status/discover/post-preview/confirm).

const test = require('node:test')
const assert = require('node:assert/strict')
const { resetWriteHealth } = require('../Library/lib/db-health')

const OWNER = '254116763755@s.whatsapp.net'

test('regression: .vv answers unsupported by default and recovers nothing', async () => {
    // No opt-in env or setting in this test process: the gate is off.
    delete process.env.BERA_ALLOW_VIEWONCE_RECOVERY
    const vv = require('../Plugins/vv')
    const sent = []
    const replies = []
    const sock = { sendMessage: async (...args) => { sent.push(args); return { key: { id: 'x' } } } }
    const message = { key: { remoteJid: '254711000001@s.whatsapp.net', id: 'm1' }, quoted: { key: { id: 'q1' }, message: {} } }
    const ctx = {
        command: 'vv', jid: '254711000001@s.whatsapp.net', from: OWNER, sender: OWNER,
        reply: async text => { replies.push(text) }
    }
    await vv.run(sock, message, [], ctx)
    assert.equal(sent.length, 0, 'a gated .vv must not send or download anything')
    assert.equal(replies.length, 1)
    assert.match(replies[0], /Unsupported: Opening or re-sending view-once media/)
    assert.match(replies[0], /Alternative:/)
})

test('regression: .tenant is owner-only; status and provision work for the owner', async () => {
    resetWriteHealth()
    global.db = {
        tenantId: 'bot-841d09ae650aed44',
        tenantSource: 'env:BERA_TENANT_ID',
        dbSchema: 'berahost',
        provider: 'postgresql',
        data: { tenants: {}, settings: {} },
        write: async () => {}
    }
    const tenant = require('../Plugins/tenant')
    const replies = []
    const reply = async text => { replies.push(text) }
    const m = { key: { id: 'm1' } }

    await tenant(m, { args: ['status'], text: '.tenant status', reply, isOwner: false })
    assert.match(replies[0], /owner-only/)

    await tenant(m, { args: ['status'], text: '.tenant status', reply, isOwner: true })
    assert.match(replies[1], /bot-841d09ae650aed44/)
    assert.match(replies[1], /berahost/)
    assert.match(replies[1], /no failures recorded/)

    await tenant(m, { args: ['provision', '+254711000001'], text: '.tenant provision +254711000001', reply, isOwner: true })
    assert.match(replies[2], /ᴘʀᴏᴠɪsɪᴏɴᴇᴅ/, 'card subtitle is small-capped by the formatter')
    assert.match(replies[2], /bot-[0-9a-f]{16}/)
    assert.match(replies[2], /BERA_TENANT_ID=bot-/)
    const provisioned = Object.values(global.db.data.tenants)[0]
    assert.equal(provisioned.phone, '254711000001')
    assert.equal(provisioned.sessionId.startsWith('wa-'), true)

    await tenant(m, { args: ['provision', '+254711000001', '+254700000000'], text: '.tenant provision +254711000001 +254700000000', reply, isOwner: true })
    assert.match(replies[3], /ᴘʀᴏᴠɪsɪᴏɴᴇᴅ/)
    assert.equal(Object.values(global.db.data.tenants).length, 2)

    await tenant(m, { args: ['bogus'], text: '.tenant bogus', reply, isOwner: true })
    assert.match(replies[4], /Tenant Operations/)
})

test('regression: .channel is owner-only; status, discover and post-confirm flow', async () => {
    const channel = require('../Plugins/channel')
    const replies = []
    const reply = async text => { replies.push(text) }
    const m = { key: { id: 'm1' } }
    const bareConn = { sendMessage: async () => ({ key: { id: 's1' } }) }

    await channel(m, { args: ['status'], text: '.channel status', reply, isOwner: false, sender: '254722000002@s.whatsapp.net', conn: bareConn })
    assert.match(replies[0], /owner-only/)

    await channel(m, { args: ['status'], text: '.channel status', reply, isOwner: true, sender: OWNER, conn: bareConn })
    assert.match(replies[1], /Channel support: unavailable/)
    assert.match(replies[1], /Channel discovery — unsupported/)

    await channel(m, { args: ['discover'], text: '.channel discover', reply, isOwner: true, sender: OWNER, conn: bareConn })
    assert.match(replies[2], /Unsupported: Discovering or searching WhatsApp channels/)

    await channel(m, { args: ['poll'], text: '.channel poll', reply, isOwner: true, sender: OWNER, conn: bareConn })
    assert.match(replies[3], /Unsupported: Creating or voting in channel polls/)

    // Post previews with a token; nothing is sent until confirm.
    const sent = []
    const conn = { sendMessage: async (...args) => { sent.push(args); return { key: { id: 's1' } } } }
    await channel(m, { args: ['post', '120363000000000001', '|', 'Hello', 'channel'], text: '.channel post 120363000000000001 | Hello channel', reply, isOwner: true, sender: OWNER, conn })
    assert.match(replies[4], /Preview only — nothing was posted/)
    assert.equal(sent.length, 0)
    const token = replies[4].match(/Token: ([0-9A-F]{8})/)?.[1]
    assert.ok(token, 'preview must carry a confirmation token')

    await channel(m, { args: ['confirm', 'BADTOKEN'], text: '.channel confirm BADTOKEN', reply, isOwner: true, sender: OWNER, conn })
    assert.match(replies[5], /Unknown, expired, or already-used token/)
    assert.equal(sent.length, 0)

    await channel(m, { args: ['confirm', token], text: `.channel confirm ${token}`, reply, isOwner: true, sender: OWNER, conn })
    assert.equal(sent.length, 1, 'confirm sends exactly once')
    assert.equal(sent[0][0], '120363000000000001@newsletter')
    assert.match(replies[6], /accepted by Baileys/)

    await channel(m, { args: ['confirm', token], text: `.channel confirm ${token}`, reply, isOwner: true, sender: OWNER, conn })
    assert.match(replies[7], /Unknown, expired, or already-used token/, 'token is single-use')
    assert.equal(sent.length, 1)
})
