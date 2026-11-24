'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { assertAccepted, BAILEYS_ACCEPTED_MESSAGE, PIN_ACCEPTED_MESSAGE } = require('../Library/lib/truthful-status')

// Spec §23 acceptance-only wording (exact).
const SPEC_WORDING = 'Request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'
const SPEC_PIN_WORDING = 'Pin request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.'

test('exports the exact spec §23 acceptance wording', () => {
    assert.equal(BAILEYS_ACCEPTED_MESSAGE, SPEC_WORDING)
    assert.equal(PIN_ACCEPTED_MESSAGE, SPEC_PIN_WORDING)
})

test('accepted result returns the exact spec wording', () => {
    // Any truthy Baileys return (message object, key, true) is acceptance-only.
    assert.equal(assertAccepted({ key: { id: 'abc' } }, 'pin'), SPEC_WORDING)
    assert.equal(assertAccepted(true, 'edit'), SPEC_WORDING)
    assert.equal(assertAccepted('ok', 'delete'), SPEC_WORDING)
})

test('accepted pin returns the spec §8 pin wording when requested', () => {
    assert.equal(assertAccepted({ key: { id: 'abc' } }, 'pin', PIN_ACCEPTED_MESSAGE), SPEC_PIN_WORDING)
})

test('falsy result throws and never claims success', () => {
    for (const falsy of [null, undefined, false, 0, '']) {
        assert.throws(
            () => assertAccepted(falsy, 'pin'),
            (error) => {
                assert.match(error.message, /Baileys did not accept the pin/)
                assert.doesNotMatch(error.message, /accepted by Baileys\. Final/)
                return true
            }
        )
    }
})

test('a throw from the Baileys call is reported as failure, never success', async () => {
    // Mirrors the call-site pattern: send throws -> catch reports failure.
    const failingSend = async () => { throw new Error('connection reset') }
    let reported
    try {
        const sent = await failingSend()
        reported = assertAccepted(sent, 'reaction')
    } catch (error) {
        reported = `❌ Reaction failed: ${error.message}`
    }
    assert.match(reported, /Reaction failed: connection reset/)
    assert.doesNotMatch(reported, /accepted by Baileys/)
})

test('a falsy Baileys return is reported as failure, never success', async () => {
    const falsySend = async () => null
    let reported
    try {
        const sent = await falsySend()
        reported = assertAccepted(sent, 'delete')
    } catch (error) {
        reported = `❌ Could not delete: ${error.message}`
    }
    assert.match(reported, /Baileys did not accept the delete/)
    assert.doesNotMatch(reported, /accepted by Baileys/)
})
