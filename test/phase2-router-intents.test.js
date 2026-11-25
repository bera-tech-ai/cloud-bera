'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { detectIntent } = require('../Library/router')
const { semanticRoute } = require('../Library/lib/semanticRouter')
const referents = require('../Library/lib/referents')

// Regression tests for the 2026-11-24 TECH SPACE live failures:
//  - "Agent delete this" (quoted message) ran a bug scan instead of deleting.
//    detectIntent("delete this") fell through to the semantic fallback, which
//    matched the bug_finder example "debug this" on the single shared word
//    "this" (Jaccard 0.33 >= 0.30 threshold).
//  - "remove this" routed to group_kick; "delete that" fell through to chat.

test('bare delete requests route to delete_this, not bug_finder/kick/chat', () => {
    assert.equal(detectIntent('delete this'), 'delete_this')
    assert.equal(detectIntent('delete that'), 'delete_this')
    assert.equal(detectIntent('remove this'), 'delete_this')
    assert.equal(detectIntent('unsend this'), 'delete_this')
    assert.equal(detectIntent('delete the last message'), 'delete_this')
})

test('delete with the word message still routes to delete_msg', () => {
    assert.equal(detectIntent('delete this message'), 'delete_msg')
    assert.equal(detectIntent('delete the message'), 'delete_msg')
    assert.equal(detectIntent('delete that message'), 'delete_msg')
})

test('remove this person is still a kick, not a delete', () => {
    assert.equal(detectIntent('remove this person'), 'kick_user')
})

test('real bug-finding requests still route to bug_finder', () => {
    assert.equal(detectIntent('find bugs in this code'), 'bug_finder')
    assert.equal(detectIntent('debug this'), 'bug_finder')
    assert.equal(detectIntent('what is wrong with this code'), 'bug_finder')
})

test('bare "this" and "what do you see" fall through to chat', () => {
    assert.equal(detectIntent('this'), 'chat')
    assert.equal(detectIntent('what do you see'), 'chat')
})

test('semantic router ignores stopwords: "delete this" and "this" match nothing', () => {
    assert.equal(semanticRoute('delete this', 0.30), null)
    assert.equal(semanticRoute('this', 0.30), null)
    assert.equal(semanticRoute('what do you see', 0.30), null)
})

test('semantic router still matches real content-word requests', () => {
    assert.equal(semanticRoute('find bugs in this code', 0.30).intent, 'bug_finder')
    assert.equal(semanticRoute('what is the weather in nairobi', 0.30).intent, 'weather')
    assert.equal(semanticRoute('play a song', 0.30).intent, 'music')
})

test('nameForJid reverse-looks-up a learned pushName, null when unknown', () => {
    referents.learnName('254711111111@s.whatsapp.net', 'Lord Eagle')
    assert.equal(referents.nameForJid('254711111111@s.whatsapp.net'), 'Lord Eagle')
    assert.equal(referents.nameForJid('254700000000@s.whatsapp.net'), null)
})
