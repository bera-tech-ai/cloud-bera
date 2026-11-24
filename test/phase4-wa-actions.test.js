'use strict'

// Phase 4 §26 matrix — Baileys payloads and context resolution through
// Library/lib/wa-actions.js: quoted / mention / current-chat targets, LID,
// confirmation tokens (single-use, expiry, wrong owner, cancel), and
// accepted-vs-failure execution results. A function that merely returns
// without throwing is never treated as WhatsApp success here.

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    normalizeNumber,
    checkNumber,
    resolveTarget,
    stage,
    consume,
    cancel,
    execute,
    getAudit,
    _pending
} = require('../Library/lib/wa-actions')

const conn = {
    onWhatsApp: async jid => [{ exists: true, jid }],
    sendMessage: async () => ({ key: { id: 'sent-1' } }),
    copyNForward: async () => ({ key: { id: 'fwd-1' } })
}
const OWNER = '254116763755@s.whatsapp.net'
const QUOTED = '254711000001@s.whatsapp.net'
const MENTIONED = '254722000002@s.whatsapp.net'

const message = (overrides = {}) => ({
    chat: '254733000003@s.whatsapp.net',
    sender: OWNER,
    isGroup: false,
    quoted: { sender: QUOTED, key: { participant: QUOTED } },
    mentionedJid: [MENTIONED],
    message: { extendedTextMessage: { contextInfo: { mentionedJid: [MENTIONED] } } },
    ...overrides
})

test('target resolution: quoted, mention, current chat, number, owner', async () => {
    const m = message()
    assert.equal((await resolveTarget(conn, m, 'reply')).jid, QUOTED)
    assert.equal((await resolveTarget(conn, m, 'quoted')).jid, QUOTED)
    assert.equal((await resolveTarget(conn, m, 'tag')).jid, MENTIONED)
    assert.equal((await resolveTarget(conn, m, 'mention')).jid, MENTIONED)
    assert.equal((await resolveTarget(conn, m, 'this pm')).jid, m.chat)
    assert.equal((await resolveTarget(conn, m, 'me')).jid, OWNER)
    assert.equal((await resolveTarget(conn, m, '+254733000003')).jid, '254733000003@s.whatsapp.net')
    assert.equal((await resolveTarget(conn, m, '254733000003')).number, '254733000003')
})

test('target resolution rejects groups as current chat and unknown targets', async () => {
    const group = message({ chat: '120363000000000001@g.us', isGroup: true })
    await assert.rejects(resolveTarget(conn, group, 'this pm'), /not a private chat/)
    await assert.rejects(resolveTarget(conn, message(), 'nobody here'), /No valid WhatsApp recipient/)
    await assert.rejects(resolveTarget(conn, message(), '123'), /No valid WhatsApp recipient/)
})

test('target resolution accepts LID identities without an onWhatsApp check', async () => {
    const m = message()
    const result = await resolveTarget(conn, m, '123456@lid')
    assert.equal(result.jid, '123456@lid')
    assert.equal(result.number, '123456')
})

test('target resolution reports unregistered numbers instead of sending blindly', async () => {
    const dead = { ...conn, onWhatsApp: async jid => [{ exists: false, jid }] }
    await assert.rejects(resolveTarget(dead, message(), '+254799999999'), /not registered on WhatsApp/)
    const checked = await checkNumber(conn, '+254711000001')
    assert.equal(checked.exists, true)
    assert.equal(checked.jid, '254711000001@s.whatsapp.net')
    assert.throws(() => normalizeNumber('12'), /7–15 digits/)
})

test('confirmation tokens are single-use, owner-bound, cancellable and expiring', () => {
    _pending.clear()
    const token = stage(OWNER, { type: 'send', number: '254711000001', text: 'hi' })
    assert.match(token, /^[0-9A-F]{8}$/)
    assert.equal(consume('254722000002@s.whatsapp.net', token), null, 'wrong owner cannot consume')
    assert.equal(cancel('254722000002@s.whatsapp.net', token), false, 'wrong owner cannot cancel')
    assert.equal(cancel(OWNER, token), true)
    assert.equal(consume(OWNER, token), null, 'cancelled token is gone')

    const token2 = stage(OWNER, { type: 'send', number: '254711000001', text: 'hi' })
    assert.deepEqual(consume(OWNER, token2), { type: 'send', number: '254711000001', text: 'hi' })
    assert.equal(consume(OWNER, token2), null, 'a token works exactly once')
    assert.equal(consume(OWNER, 'NOPE1234'), null)

    // Expired tokens are pruned on next use.
    const token3 = stage(OWNER, { type: 'send', number: '254711000001', text: 'hi' })
    _pending.get(token3).expiresAt = Date.now() - 1000
    assert.equal(consume(OWNER, token3), null)
    assert.equal(_pending.has(token3), false)
    _pending.clear()
})

test('execute reports accepted results and never claims success on failure', async () => {
    const ok = await execute(conn, OWNER, { type: 'send', number: '254711000001', text: 'hello' })
    assert.equal(ok.ok, true)
    assert.equal(ok.jid, '254711000001@s.whatsapp.net')

    const notAccepted = await execute({ ...conn, sendMessage: async () => null }, OWNER, { type: 'send', number: '254711000001', text: 'hello' })
    assert.equal(notAccepted.ok, false)
    assert.match(notAccepted.error, /did not accept/)

    const threw = await execute({ ...conn, sendMessage: async () => { throw new Error('device offline') } }, OWNER, { type: 'send', number: '254711000001', text: 'hello' })
    assert.equal(threw.ok, false)
    assert.equal(threw.error, 'device offline')

    const unknown = await execute(conn, OWNER, { type: 'teleport', number: '254711000001' })
    assert.equal(unknown.ok, false)
    assert.match(unknown.error, /Unknown WhatsApp action/)

    const forwarded = await execute(conn, OWNER, { type: 'forward', jid: '254711000001@s.whatsapp.net', message: { key: { id: 'm1' } } })
    assert.equal(forwarded.ok, true)
    const audit = getAudit(OWNER)
    assert.ok(audit.length > 0)
    assert.equal(audit[audit.length - 1].ok, true)
    assert.ok(audit.some(entry => entry.ok === false), 'failures are recorded in the audit trail too')
})

test('execute validates media and story actions before sending', async () => {
    const badMedia = await execute(conn, OWNER, { type: 'sendMedia', jid: '254711000001@s.whatsapp.net', url: 'https://example.test/x.png', mediaType: 'gif' })
    assert.equal(badMedia.ok, false)
    const emptyStory = await execute(conn, OWNER, { type: 'story', text: '   ' })
    assert.equal(emptyStory.ok, false)
    assert.match(emptyStory.error, /cannot be empty/)
})
