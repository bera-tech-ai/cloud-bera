'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')

// Fake db before the module is used so persistence paths run in-memory.
global.db = { data: {}, write: async () => {} }
const referents = require('../Library/lib/referents')

// Regression tests for the name-directory ambiguity hole: learnName used
// to be first-writer-wins, so when two people share a WhatsApp display
// name, resolveName silently returned whoever happened to speak first
// after a restart — "send hello to babe" could land on the wrong person
// (spec §3: never silently send to an unintended person).

const A = '254711111111@s.whatsapp.net'
const B = '254722222222@s.whatsapp.net'
const C = '254733333333@s.whatsapp.net'

test('a name claimed by one person resolves to that person', () => {
    referents.learnName(C, 'Solo Name')
    assert.deepEqual(referents.resolveName('solo name'), { jid: C })
})

test('a pushName shared by two people is ambiguous, never first-writer', () => {
    referents.learnName(A, 'Shared Name')
    referents.learnName(B, 'Shared Name')
    const resolved = referents.resolveName('shared name')
    assert.equal(resolved.ambiguous, true)
    assert.deepEqual(resolved.candidates.map(c => c.jid).sort(), [A, B].sort())
})

test('the same person under a LID and a phone JID is one claimant', () => {
    referents.learnName(C, 'Dual Form')
    referents.learnName('254733333333@lid', 'Dual Form')
    assert.deepEqual(referents.resolveName('dual form'), { jid: C })
})

test('a taught alias overrides pushName ambiguity and always wins', () => {
    referents.learnName(A, 'Alias Target')
    referents.learnName(B, 'Alias Target')
    assert.equal(referents.resolveName('alias target').ambiguous, true)
    referents.rememberAlias('Alias Target', B)
    assert.deepEqual(referents.resolveName('alias target'), { jid: B })
})

test('a partial match on a shared name is ambiguous too', () => {
    referents.learnName(A, 'Mama Shared')
    referents.learnName(B, 'Mama Shared')
    const resolved = referents.resolveName('mama')
    assert.equal(resolved.ambiguous, true)
    assert.equal(resolved.candidates.length, 2)
})

test('learned pushNames persist into db.data.learnedNames (throttled)', async () => {
    referents.learnName(A, 'Persisted Person')
    await new Promise(r => setTimeout(r, 2300))
    const rows = global.db.data.learnedNames?.['persisted person']
    assert.ok(Array.isArray(rows))
    assert.equal(rows[0].jid, A)
})

test('nameForJid finds a second claimant of a shared name', () => {
    const D = '254744444444@s.whatsapp.net'
    const E = '254755555555@s.whatsapp.net'
    referents.learnName(D, 'Twins')
    referents.learnName(E, 'Twins')
    assert.equal(referents.nameForJid(E), 'Twins')
})
