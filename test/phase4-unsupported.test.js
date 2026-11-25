'use strict'

// Phase 4 §26 matrix — one unsupported response format (spec §25) and the
// deleted-message / view-once recovery gate (default off, explicit opt-in).

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    unsupportedResponse,
    DELETED_RECOVERY,
    VIEWONCE_RECOVERY,
    CHANNEL_DISCOVERY,
    CHANNEL_POLLS,
    CHANNEL_SCHEDULED_POSTS,
    CHANNEL_REPORT_SPAM
} = require('../Library/lib/unsupported')
const { isDeletedRecoveryAllowed, isViewOnceRecoveryAllowed } = require('../Library/lib/recovery-gate')

const assertFourParts = response => {
    for (const field of ['what', 'why', 'alternative', 'retry']) {
        assert.ok(response[field] && response[field].trim(), `unsupported response needs ${field}`)
        assert.ok(response.text.includes(response[field].trim().slice(0, 20)), `text must contain ${field}`)
    }
    assert.match(response.text, /❌ Unsupported:/)
    assert.match(response.text, /\nWhy: /)
    assert.match(response.text, /\nAlternative: /)
    assert.match(response.text, /\nRetry: /)
    assert.match(response.card, /ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3\.0\.0/)
    assert.match(response.card, /UNSUPPORTED/)
}

test('unsupported responses always carry what / why / alternative / retry', () => {
    assertFourParts(unsupportedResponse({
        what: 'Editing messages WhatsApp does not permit.',
        why: 'WhatsApp only allows editing your own recent messages.',
        alternative: 'Delete the message and send a corrected one.',
        retry: 'Yes — retry with a message you sent recently.'
    }))
    assert.throws(() => unsupportedResponse({ what: 'x', why: 'y', alternative: 'z' }), /needs "retry"/)
})

test('each built-in unsupported answer states the limit honestly', () => {
    assertFourParts(DELETED_RECOVERY())
    assert.match(DELETED_RECOVERY().why, /cannot recover anything it never saw/i)
    assert.match(DELETED_RECOVERY().retry, /^No/i)

    assertFourParts(VIEWONCE_RECOVERY())
    assert.match(VIEWONCE_RECOVERY().why, /cannot fetch view-once media after it was opened/i)

    assertFourParts(CHANNEL_DISCOVERY())
    assert.match(CHANNEL_DISCOVERY().retry, /^Yes/i)

    assertFourParts(CHANNEL_POLLS())
    assert.match(CHANNEL_POLLS().why, /no channel poll API/i)

    assertFourParts(CHANNEL_SCHEDULED_POSTS())
    assertFourParts(CHANNEL_REPORT_SPAM())
    assert.match(CHANNEL_REPORT_SPAM().alternative, /inside WhatsApp/i)
})

test('deleted-message recovery is disabled by default and needs explicit opt-in', () => {
    assert.equal(isDeletedRecoveryAllowed({ env: {}, settings: {} }), false)
    assert.equal(isDeletedRecoveryAllowed({ env: {}, settings: undefined }), false)
    assert.equal(isDeletedRecoveryAllowed({ env: { BERA_ALLOW_DELETED_RECOVERY: '0' } }), false)
    assert.equal(isDeletedRecoveryAllowed({ env: { BERA_ALLOW_DELETED_RECOVERY: 'no' } }), false)
    assert.equal(isDeletedRecoveryAllowed({ env: { BERA_ALLOW_DELETED_RECOVERY: '1' } }), true)
    assert.equal(isDeletedRecoveryAllowed({ env: { BERA_ALLOW_DELETED_RECOVERY: 'true' } }), true)
    assert.equal(isDeletedRecoveryAllowed({ env: {}, settings: { allowDeletedRecovery: true } }), true)
    assert.equal(isDeletedRecoveryAllowed({ env: {}, settings: { allowDeletedRecovery: false } }), false)
})

test('view-once recovery is disabled by default and needs explicit opt-in', () => {
    assert.equal(isViewOnceRecoveryAllowed({ env: {}, settings: {} }), false)
    assert.equal(isViewOnceRecoveryAllowed({ env: { BERA_ALLOW_VIEWONCE_RECOVERY: 'yes' } }), true)
    assert.equal(isViewOnceRecoveryAllowed({ env: { BERA_ALLOW_VIEWONCE_RECOVERY: 'off' } }), false)
    assert.equal(isViewOnceRecoveryAllowed({ env: {}, settings: { allowViewOnceRecovery: true } }), true)
    // The two gates are independent: opting into one does not enable the other.
    assert.equal(isViewOnceRecoveryAllowed({ env: { BERA_ALLOW_DELETED_RECOVERY: '1' } }), false)
    assert.equal(isDeletedRecoveryAllowed({ env: { BERA_ALLOW_VIEWONCE_RECOVERY: '1' } }), false)
})
