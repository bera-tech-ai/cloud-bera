// ChatBera per-chat activation: `.chatbera here` must set/clear
// db.data.chatbera.enabled[<chatJid>] — the map the Handler's ChatBera
// branch already checks (globalEnabled || enabled[chat]) — without
// touching the global switch. Runs the real plugin handler with a
// stubbed global.db and reply capture.
const test = require('node:test')
const assert = require('node:assert')

const handle = require('../Plugins/chatbera')

function freshDb() {
    global.db = {
        data: {
            chatbera: { globalEnabled: false, enabled: {}, profile: { myName: 'Bruce Bera', myMessages: ['hi'] } },
            settings: { mode: 'private' }
        },
        write: async () => {}
    }
    return global.db
}

async function run(args, { chat = '111@s.whatsapp.net', isOwner = true } = {}) {
    const replies = []
    const m = { chat, key: { remoteJid: chat }, isGroup: String(chat).endsWith('@g.us') }
    await handle(m, {
        conn: {},
        command: 'chatbera',
        args,
        prefix: '.',
        reply: (t) => { replies.push(String(t)); return Promise.resolve() },
        isOwner
    })
    return replies
}

test('here enables ChatBera for the current chat only', async () => {
    const db = freshDb()
    const replies = await run(['here'])
    assert.strictEqual(db.data.chatbera.enabled['111@s.whatsapp.net'], true)
    assert.strictEqual(db.data.chatbera.globalEnabled, false, 'global switch untouched')
    assert.ok(replies.join(' ').includes('THIS CHAT'), 'confirmation card sent')
})

test('here off removes only that chat', async () => {
    const db = freshDb()
    await run(['here'])
    await run(['here'], { chat: '222@s.whatsapp.net' })
    await run(['here', 'off'])
    assert.strictEqual(db.data.chatbera.enabled['111@s.whatsapp.net'], undefined)
    assert.strictEqual(db.data.chatbera.enabled['222@s.whatsapp.net'], true, 'other chat kept')
})

test('here <number> enables that person from anywhere; local 07… becomes 254…', async () => {
    const db = freshDb()
    await run(['here', '0712345678'], { chat: '254116763755@s.whatsapp.net' })
    assert.strictEqual(db.data.chatbera.enabled['254712345678@s.whatsapp.net'], true)
    await run(['here', '254798765432'], { chat: '254116763755@s.whatsapp.net' })
    assert.strictEqual(db.data.chatbera.enabled['254798765432@s.whatsapp.net'], true)
})

test('here with a bad number changes nothing and explains usage', async () => {
    const db = freshDb()
    const replies = await run(['here', 'abc'])
    assert.deepStrictEqual(db.data.chatbera.enabled, {})
    assert.ok(replies.join(' ').includes('Usage'))
})

test('per-chat commands are owner-only', async () => {
    const db = freshDb()
    const replies = await run(['here'], { isOwner: false })
    assert.deepStrictEqual(db.data.chatbera.enabled, {})
    assert.ok(replies.join(' ').includes('Owner only'))
})

test('status reports the per-chat count', async () => {
    freshDb()
    await run(['here'])
    await run(['here'], { chat: '222@s.whatsapp.net' })
    const replies = await run([])
    assert.ok(replies.join(' ').includes('Per-chat only: *2 chat(s)*'), replies.join(' '))
})

test('global on/off behaviour unchanged; off clears the per-chat map', async () => {
    const db = freshDb()
    await run(['here'])
    await run(['on'])
    assert.strictEqual(db.data.chatbera.globalEnabled, true)
    await run(['off'])
    assert.strictEqual(db.data.chatbera.globalEnabled, false)
    assert.deepStrictEqual(db.data.chatbera.enabled, {}, 'global off clears per-chat chats')
})
