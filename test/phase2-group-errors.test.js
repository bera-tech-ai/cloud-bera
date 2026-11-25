'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const {
    BAILEYS_ACCEPTED_MESSAGE, PIN_ACCEPTED_MESSAGE, assertAccepted,
    statusCodeOf, interpretBaileysError, groupPermissionFailure,
} = require('../Library/lib/baileys-errors')

test('acceptance wording is the spec wording, verbatim', () => {
    assert.equal(BAILEYS_ACCEPTED_MESSAGE, 'Request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.')
    assert.equal(PIN_ACCEPTED_MESSAGE, '✅ Pinned successfully as requested.')
})

test('assertAccepted throws on a falsy Baileys result and returns the wording otherwise', () => {
    assert.throws(() => assertAccepted(null, 'pin request'), /Baileys did not accept the pin request/)
    assert.equal(assertAccepted({ key: { id: 'x' } }, 'pin request'), BAILEYS_ACCEPTED_MESSAGE)
})

test('status codes are read from Boom, direct, and data shapes', () => {
    assert.equal(statusCodeOf({ output: { statusCode: 403 } }), 403)
    assert.equal(statusCodeOf({ statusCode: 404 }), 404)
    assert.equal(statusCodeOf({ data: { statusCode: 429 } }), 429)
    assert.equal(statusCodeOf(new Error('boom')), null)
    assert.equal(statusCodeOf({ code: '403' }), 403)
})

test('Baileys errors are interpreted instead of returned raw', () => {
    assert.match(interpretBaileysError({ output: { statusCode: 404 } }, { actionLabel: 'delete this message' }), /could not find the target/i)
    assert.match(interpretBaileysError({ statusCode: 429 }, {}), /rate-limited/i)
    assert.match(interpretBaileysError(new Error('message too old to delete'), {}), /too old/i)
})

test('group permission failures distinguish user-lacks from bot-lacks', () => {
    const base = { isGroup: true, isOwner: false }
    assert.match(
        groupPermissionFailure({ ...base, isSenderAdmin: false, isBotAdmin: false }, 'pin this message'),
        /you are not a group admin, and Bera is not a group admin/,
    )
    assert.match(
        groupPermissionFailure({ ...base, isSenderAdmin: false, isBotAdmin: true }, 'pin this message'),
        /you are not a group admin\. Only a group admin/,
    )
    assert.match(
        groupPermissionFailure({ ...base, isSenderAdmin: true, isBotAdmin: false }, 'pin this message'),
        /Bera is not a group admin/,
    )
    assert.match(groupPermissionFailure({ isGroup: false }, 'pin this message'), /only available in a group/)
    // A 403 with access context prefers the §13 wording over the raw code.
    assert.match(
        interpretBaileysError({ statusCode: 403 }, { access: { ...base, isSenderAdmin: true, isBotAdmin: false }, actionLabel: 'pin this message' }),
        /Bera is not a group admin/,
    )
})
