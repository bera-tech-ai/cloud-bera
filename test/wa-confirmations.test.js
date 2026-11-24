const assert = require('node:assert/strict')
const waActions = require('../Library/lib/wa-actions')

// Persistent, universal confirmation tokens (spec §4, audit Phase 1 item 5):
// single-use, expired, wrong-owner, cancelled, and a persistence round-trip
// that simulates a restart by reloading tokens from stored DB state.
;(async () => {
    const owner = '254116763755@s.whatsapp.net'
    const other = '254700000001@s.whatsapp.net'
    const reset = () => waActions._pending.clear()

    // ── Single-use: the second consume fails ─────────────────────────────
    reset()
    const token = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'hello' })
    assert.match(token, /^[A-F0-9]{8}$/)
    const first = waActions.consume(owner, token)
    assert.equal(first?.text, 'hello')
    assert.equal(waActions.consume(owner, token), null, 'second consume must fail: token is single-use')

    // ── Expired token rejected ───────────────────────────────────────────
    reset()
    const expiredToken = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'late' })
    waActions._pending.get(expiredToken).expiresAt = Date.now() - 1000
    assert.equal(waActions.consume(owner, expiredToken), null, 'expired token must be rejected')
    assert.equal(waActions.getPending(expiredToken), null, 'expired token must not be readable')

    // ── Wrong-owner consume / cancel rejected ────────────────────────────
    reset()
    const ownedToken = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'mine' })
    assert.equal(waActions.consume(other, ownedToken), null, 'another owner must not consume the token')
    assert.equal(waActions.cancel(other, ownedToken), false, 'another owner must not cancel the token')
    assert.equal(waActions.consume(owner, ownedToken)?.text, 'mine', 'rightful owner can still consume after a wrong-owner attempt')

    // ── Cancelled token unusable ─────────────────────────────────────────
    reset()
    const cancelledToken = waActions.stage(owner, { type: 'story', text: 'never post this' })
    assert.equal(waActions.cancel(owner, cancelledToken), true)
    assert.equal(waActions.consume(owner, cancelledToken), null, 'cancelled token must be unusable')
    assert.equal(waActions.cancel(owner, cancelledToken), false, 'cancelling twice must fail')

    // ── Preview always shows expiry (Nairobi) and cancellation ─────────
    reset()
    const previewToken = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'preview me' })
    const preview = waActions.formatPreview({ type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'preview me' }, previewToken)
    assert.match(preview, /Africa\/Nairobi/, 'preview must show the Nairobi expiry time')
    assert.match(preview, new RegExp(`\\.wact confirm ${previewToken}`), 'preview must show the confirm instruction')
    assert.match(preview, new RegExp(`\\.wact cancel ${previewToken}`), 'preview must show the cancel instruction')
    assert.match(preview, /\+254712345678/, 'preview must show the destination')
    assert.match(preview, /preview me/, 'preview must show the exact message')

    // ── Multi-recipient: one token per destination, never expanded ──────
    reset()
    assert.throws(
        () => waActions.stage(owner, { type: 'send', text: 'blast', destinations: ['254712345678@s.whatsapp.net', '254700000001@s.whatsapp.net'] }),
        /stageMany/,
        'staging several destinations at once must refuse instead of silently expanding'
    )
    const staged = waActions.stageMany(owner, [
        { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'to one' },
        { type: 'send', jid: '254700000001@s.whatsapp.net', number: '254700000001', text: 'to two' },
    ])
    assert.equal(staged.length, 2, 'one token per destination')
    assert.notEqual(staged[0].token, staged[1].token)
    const multiPreview = waActions.formatPreviewMany(staged)
    assert.match(multiPreview, /254712345678/, 'multi preview lists the first destination')
    assert.match(multiPreview, /254700000001/, 'multi preview lists the second destination')
    assert.match(multiPreview, new RegExp(staged[0].token), 'multi preview shows the first token')
    assert.match(multiPreview, new RegExp(staged[1].token), 'multi preview shows the second token')
    assert.equal(waActions.consume(owner, staged[0].token)?.text, 'to one')
    assert.equal(waActions.consume(owner, staged[0].token), null, 'each destination token is single-use')
    assert.equal(waActions.consume(owner, staged[1].token)?.text, 'to two')

    // ── Confirmed execution goes through consume ─────────────────────────
    reset()
    const sent = []
    const conn = {
        onWhatsApp: async (jid) => [{ exists: true, jid }],
        sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'test' } } },
    }
    const bad = await waActions.executeConfirmed(conn, owner, 'DEADBEEF')
    assert.equal(bad.ok, false, 'an invalid token must not execute')
    assert.equal(sent.length, 0, 'nothing may be sent for an invalid token')
    const goodToken = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'confirmed' })
    const good = await waActions.executeConfirmed(conn, owner, goodToken)
    assert.equal(good.ok, true)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].content.text, 'confirmed')
    const replay = await waActions.executeConfirmed(conn, owner, goodToken)
    assert.equal(replay.ok, false, 'a consumed token must not execute twice')
    assert.equal(sent.length, 1)

    // ── Persistence round-trip: survive a simulated restart ─────────────
    reset()
    const storedWrites = []
    global.db = {
        data: { pendingConfirmations: [] },
        write: async () => { storedWrites.push(JSON.parse(JSON.stringify(global.db.data.pendingConfirmations))) },
    }
    try {
        const persistToken = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'survive restart' })
        assert.equal(global.db.data.pendingConfirmations.length, 1, 'staging must write the token to the DB')
        assert.equal(global.db.data.pendingConfirmations[0].token, persistToken)
        assert.equal(global.db.data.pendingConfirmations[0].owner, owner)
        assert.equal(global.db.data.pendingConfirmations[0].action.text, 'survive restart')

        // Simulate a restart: drop the in-memory cache, reload from the DB.
        waActions._pending.clear()
        assert.equal(waActions.consume(owner, persistToken), null, 'token must be gone from memory after the simulated restart')
        const restored = waActions.loadPendingFromDb()
        assert.equal(restored, 1, 'one token must be restored from stored state')
        assert.equal(waActions.consume(owner, persistToken)?.text, 'survive restart', 'restored token must still be valid for its owner')
        assert.equal(waActions.consume(owner, persistToken), null, 'restored token stays single-use')

        // Expired entries are pruned on load and never come back.
        const staleToken = waActions.stage(owner, { type: 'send', jid: '254712345678@s.whatsapp.net', number: '254712345678', text: 'stale' })
        waActions._pending.get(staleToken).expiresAt = Date.now() - 1000
        waActions.persistPending()
        assert.equal(global.db.data.pendingConfirmations.length, 1, 'expired entry must still be in the stored list before reload')
        waActions._pending.clear()
        assert.equal(waActions.loadPendingFromDb(), 0, 'expired entries must be pruned on load')
        assert.equal(global.db.data.pendingConfirmations.length, 0, 'pruned entries must be written back to the DB')
        assert.equal(waActions.consume(owner, staleToken), null)
    } finally {
        delete global.db
    }
    reset()

    console.log('wa confirmations tests passed')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
