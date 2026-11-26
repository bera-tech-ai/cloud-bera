'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseMemberSearch, parseSayInVoice, parseImageQuestion, parseVoiceMode } = require('../Library/actions/command-intent')

// Regression tests for the 2026-11-24 TECH SPACE live failures:
//  - "who is casper in this group" was answered by the LLM with "I can't
//    list members" even though the wa_group_members tool exists — the tool
//    is buried in a ~7.8k-token system prompt, so preDispatch now answers
//    member questions deterministically from the tool.
//  - "Agent what do you see" on a quoted image deflected to group/workspace
//    talk because the agent loop only receives text — the image never
//    reached any vision/OCR path.
//  - "say hello in voice" was answered in text because the model often
//    does not call the tts tool.

test('member search parses "who is X in this group"', () => {
    assert.deepEqual(parseMemberSearch('who is casper in this group'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('who is casper In this group'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('find nick in this group'), { name: 'nick' })
    assert.deepEqual(parseMemberSearch('is casper in this group'), { name: 'casper' })
})

test('member search parses bare "who is X" (group context checked by caller)', () => {
    assert.deepEqual(parseMemberSearch('who is babe'), { name: 'babe' })
    assert.deepEqual(parseMemberSearch('Agent who is casper'), { name: 'casper' })
})

test('voice mode parses "from now on use voice" and friends', () => {
    assert.deepEqual(parseVoiceMode('from now on use voice to communicate'), { on: true })
    assert.deepEqual(parseVoiceMode('Agent from now on use voice'), { on: true })
    assert.deepEqual(parseVoiceMode('talk to me in voice'), { on: true })
    assert.deepEqual(parseVoiceMode('answer in voice'), { on: true })
    assert.deepEqual(parseVoiceMode('use voice to communicate'), { on: true })
    assert.deepEqual(parseVoiceMode('switch to voice'), { on: true })
    assert.deepEqual(parseVoiceMode('can you talk in voice'), { on: true })
})

test('voice mode parses switching back to text', () => {
    assert.deepEqual(parseVoiceMode('use text again'), { on: false })
    assert.deepEqual(parseVoiceMode('stop using voice'), { on: false })
    assert.deepEqual(parseVoiceMode('switch back to text'), { on: false })
    assert.deepEqual(parseVoiceMode('turn voice off'), { on: false })
})

test('voice mode does not fire on one-off voice notes or other asks', () => {
    assert.equal(parseVoiceMode('say hello in voice'), null)
    assert.equal(parseVoiceMode('send a voice note saying hi'), null)
    assert.equal(parseVoiceMode('who is casper'), null)
    assert.equal(parseVoiceMode('what do you see'), null)
})

test('member search parses @username forms', () => {
    assert.deepEqual(parseMemberSearch('who is @casper in this group'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('who is @casper'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('find user @casper'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('find @casper in this group'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('search for username casper'), { name: 'casper' })
    assert.deepEqual(parseMemberSearch('Agent find @casper'), { name: 'casper' })
})

test('member list requests parse to { list: true }', () => {
    assert.deepEqual(parseMemberSearch('list members'), { list: true })
    assert.deepEqual(parseMemberSearch('list all group members'), { list: true })
    assert.deepEqual(parseMemberSearch('who is in this group'), { list: true })
    assert.deepEqual(parseMemberSearch('show me the members'), { list: true })
})

test('member search rejects nonsense names', () => {
    assert.equal(parseMemberSearch('who is everyone'), null)
    assert.equal(parseMemberSearch('who is the president of Kenya'), null)
    assert.equal(parseMemberSearch('what is the weather'), null)
})

test('say-in-voice parses the exact words to speak', () => {
    assert.deepEqual(parseSayInVoice('say hello in voice'), { text: 'hello' })
    assert.deepEqual(parseSayInVoice('say good morning babe in voice'), { text: 'good morning babe' })
    assert.deepEqual(parseSayInVoice('send a voice note saying hello there'), { text: 'hello there' })
    assert.deepEqual(parseSayInVoice('send me a voice note good morning'), { text: 'good morning' })
    assert.deepEqual(parseSayInVoice('tell me a joke out loud'), { text: 'a joke' })
    assert.deepEqual(parseSayInVoice('Agent say hello in voice'), { text: 'hello' })
})

test('say-in-voice rejects plain chat with no voice wording', () => {
    assert.equal(parseSayInVoice('say hello'), null)
    assert.equal(parseSayInVoice('say it in voice'), null)
    assert.equal(parseSayInVoice('speak french'), null)
    assert.equal(parseSayInVoice('what is the weather'), null)
})

// ── Batch D (2026-11-26): parser hijacks of general questions ────────────
test('batch D: member search rejects non-name targets', () => {
    assert.equal(parseMemberSearch('who is the president'), null)
    assert.equal(parseMemberSearch('who is online'), null)
    assert.equal(parseMemberSearch('who is admin'), null)
    assert.deepEqual(parseMemberSearch('who is casper'), { name: 'casper' })
})

test('batch D: voice mode needs an imperative about the bot\u2019s replies', () => {
    assert.equal(parseVoiceMode('talk about voice acting in kenya'), null)
    assert.deepEqual(parseVoiceMode('use voice'), { on: true })
    assert.deepEqual(parseVoiceMode('reply in voice'), { on: true })
})

test('batch D: say-in-voice only speaks literal text, never "tell me a joke in voice"', () => {
    assert.equal(parseSayInVoice('tell me a joke in voice'), null)
    assert.deepEqual(parseSayInVoice('say hello in voice'), { text: 'hello' })
    assert.deepEqual(parseSayInVoice('read this announcement aloud in voice'), { text: 'this announcement' })
})

test('image questions parse, including the Agent trigger', () => {
    assert.deepEqual(parseImageQuestion('what do you see'), { question: 'what do you see' })
    assert.deepEqual(parseImageQuestion('Agent what do you see'), { question: 'what do you see' })
    assert.deepEqual(parseImageQuestion('describe this image'), { question: 'describe this image' })
    assert.deepEqual(parseImageQuestion('what is in this picture'), { question: 'what is in this picture' })
    assert.deepEqual(parseImageQuestion('what does this image show'), { question: 'what does this image show' })
    assert.deepEqual(parseImageQuestion('read this image'), { question: 'read this image' })
})

test('image questions reject non-image questions', () => {
    assert.equal(parseImageQuestion('what is the weather'), null)
    assert.equal(parseImageQuestion('describe the project'), null)
    assert.equal(parseImageQuestion('what do you see in the future'), null)
})
