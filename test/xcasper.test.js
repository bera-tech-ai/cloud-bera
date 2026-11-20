'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { textFrom } = require('../Library/actions/xcasper')

test('extracts PublicAI nested reply objects', () => {
    assert.equal(textFrom({ success: true, data: { reply: { reply: 'OK', model: 'publicai-chat' }, model: 'publicai-chat' } }), 'OK')
})

test('extracts DeepSeek and Gemini direct replies without returning query or reasoning', () => {
    assert.equal(textFrom({ data: { query: 'input', reasoning: 'private reasoning', reply: 'DeepSeek answer' } }), 'DeepSeek answer')
    assert.equal(textFrom({ data: { query: 'input', model: 'Google Gemini', reply: 'Gemini answer' } }), 'Gemini answer')
})

test('reassembles KeithAI character-indexed response objects', () => {
    assert.equal(textFrom({ data: { 0: 'O', 1: 'K' } }), 'OK')
})

test('extracts OpenAI-compatible choice content and ignores empty payloads', () => {
    assert.equal(textFrom({ choices: [{ message: { content: 'Choice answer' } }] }), 'Choice answer')
    assert.equal(textFrom({ success: true, data: { reply: '' } }), '')
})
