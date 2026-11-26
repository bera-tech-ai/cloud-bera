'use strict'

// ChatBera training polish (2026-11-26, Bera: "Train it well"):
//  - cleanTrainingSamples keeps the corpus honest: credential/URL-shaped
//    entries are hard drops, WhatsApp export artifacts are stripped, exact
//    and near dupes collapse, content-free junk goes — while genuinely
//    characteristic shorties stay.
//  - selectStyleSamples is stratified across BOTH registers of his style
//    (friend/dev banter + girlfriend register + formal pitch), interleaving
//    oldest-trained with freshest-learned, deterministic.
//  - computeStyleStats/formatStyleAnalysis describe the WHOLE corpus.
// All fixtures are synthetic — never the real trained profile contents.

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    cleanTrainingSamples, selectStyleSamples, computeStyleStats,
    formatStyleAnalysis, registerOf, classifyCorpus, stripExportArtifacts, isCredentialShaped
} = require('../Library/actions/chatbera-training')

// ── Cleaning ─────────────────────────────────────────────────────────────────

test('cleanTrainingSamples: credential-shaped entries are dropped and counted, never kept', () => {
    const { kept, dropped } = cleanTrainingSamples([
        'Niaje mkuu',
        'mongodb+srv://fakeuser:fakepass@cluster0.example.invalid/db',
        'postgres://user:pass@db.example.invalid:5432/app',
        'my api_key = abcdef123456',
        'Poa sana'
    ])
    assert.equal(dropped.credential, 3)
    assert.deepEqual(kept, ['Niaje mkuu', 'Poa sana'])
    assert.ok(!kept.join(' ').includes('fakeuser'))
})

test('cleanTrainingSamples: URL-shaped entries are dropped separately from credentials', () => {
    const { kept, dropped } = cleanTrainingSamples([
        'check example-app.onrender.com',
        'see https://example.invalid/page',
        'Waazi mkuu'
    ])
    assert.equal(dropped.url, 2)
    assert.equal(dropped.credential, 0)
    assert.deepEqual(kept, ['Waazi mkuu'])
})

test('cleanTrainingSamples: export artifacts are stripped, not kept as text', () => {
    assert.equal(stripExportArtifacts('I said im sorry <This message was edited>'), 'I said im sorry')
    const { kept, artifactsStripped } = cleanTrainingSamples(['Habari yako <This message was edited>', '<Media omitted>'])
    assert.deepEqual(kept, ['Habari yako'])
    assert.equal(artifactsStripped, 2)
})

test('cleanTrainingSamples: junk tokens and bare names go, characteristic shorties stay', () => {
    const { kept, dropped } = cleanTrainingSamples([
        'Github', 'Expiry', 'Carl', 'Marisel', 'Test hii',
        'Yooh', 'Oi', 'Mzee', 'Waazi', 'Baaas🥲', 'Enyewe🥲'
    ])
    assert.equal(dropped.junk, 5)
    assert.deepEqual(kept, ['Yooh', 'Oi', 'Mzee', 'Waazi', 'Baaas🥲', 'Enyewe🥲'])
})

test('cleanTrainingSamples: exact and near dupes collapse to the first occurrence', () => {
    const { kept, dropped } = cleanTrainingSamples([
        'Yooh', 'Yooh', 'Yooh 😂', 'Thanks bruv🥲', 'Thanks bruv', 'Niaje man'
    ])
    assert.equal(dropped.exactDupes, 1)
    assert.equal(dropped.nearDupes, 2)
    assert.deepEqual(kept, ['Yooh', 'Thanks bruv🥲', 'Niaje man'])
})

test('isCredentialShaped: plain style text is not flagged', () => {
    assert.equal(isCredentialShaped('Nilitumia mongodb'), false)
    assert.equal(isCredentialShaped('password ni siri sana'), false)
    assert.equal(isCredentialShaped('mongodb+srv://u:p@h/db'), true)
})

// ── Registers ────────────────────────────────────────────────────────────────

test('registerOf: partner, formal and friend registers are recognised', () => {
    assert.equal(registerOf('Ukoje babe'), 'partner')
    assert.equal(registerOf('So how was your day ml'), 'partner')
    assert.equal(registerOf('Goodnight babe ..i love you'), 'partner')
    assert.equal(registerOf('Yooh mkuu'), 'friend')
    assert.equal(registerOf('Niaje man, leo rada😂😂'), 'friend')
    assert.equal(registerOf('Our platform brings together independent developers from many regions, offering project showcasing, repository integration and a shared discussion space for the whole community'), 'formal')
})

test('classifyCorpus: unmarked second-half samples fall back to the partner register', () => {
    const corpus = [
        'niaje mkuu', 'waazi bana', 'leo rada 😂', 'design iko best',
        'sorry about that', 'im glad', 'was good', 'morning, how was your day'
    ]
    const regs = classifyCorpus(corpus)
    assert.deepEqual(regs.slice(0, 4), ['friend', 'friend', 'friend', 'friend'])
    assert.deepEqual(regs.slice(4), ['partner', 'partner', 'partner', 'partner'])
    // Marker-based classification always wins over position.
    assert.equal(classifyCorpus(['x y z', 'niaje mkuu'])[1], 'friend')
})

// ── Selection ────────────────────────────────────────────────────────────────

const FRIEND = Array.from({ length: 30 }, (_, i) => `niaje mkuu sample ${i} 😂`)
const PARTNER = Array.from({ length: 30 }, (_, i) => `how was your day babe, sample ${i} was fine`)
const FORMAL = ['Our platform brings together independent developers from many regions, offering project showcasing, repository integration and a shared discussion space for the whole community today']
const CORPUS = [...FRIEND, ...FORMAL, ...PARTNER]

test('selectStyleSamples: draws from both registers, not just the front of the list', () => {
    const picked = selectStyleSamples(CORPUS, 30)
    assert.equal(picked.length, 30)
    assert.ok(picked.some(s => s.includes('babe')), 'partner register represented')
    assert.ok(picked.some(s => s.includes('mkuu')), 'friend register represented')
    assert.ok(picked.some(s => s.startsWith('Our platform')), 'formal sample represented')
})

test('selectStyleSamples: includes freshest samples, not only the oldest', () => {
    const picked = selectStyleSamples(CORPUS, 30)
    assert.ok(picked.some(s => s.includes('sample 29')), 'freshest friend sample picked')
    assert.ok(picked.some(s => s.includes('sample 0')), 'oldest friend sample picked')
})

test('selectStyleSamples: deterministic and respects the limit', () => {
    const a = selectStyleSamples(CORPUS, 40)
    const b = selectStyleSamples(CORPUS, 40)
    assert.deepEqual(a, b)
    assert.equal(a.length, 40)
    assert.deepEqual(selectStyleSamples(CORPUS, 0), [])
    assert.equal(selectStyleSamples(['Yooh', 'Oi'], 40).length, 2)
})

test('selectStyleSamples: credential-shaped samples can never be selected', () => {
    const dirty = ['mongodb+srv://u:p@h/db', ...CORPUS]
    const picked = selectStyleSamples(dirty, 40)
    assert.ok(!picked.some(s => s.includes('mongodb')))
})

// ── Stats + analysis ─────────────────────────────────────────────────────────

test('computeStyleStats + formatStyleAnalysis: whole corpus, both registers named', () => {
    const stats = computeStyleStats(CORPUS)
    assert.equal(stats.overall.total, CORPUS.length)
    assert.equal(stats.registerCounts.friend, 30)
    assert.equal(stats.registerCounts.partner, 30)
    assert.equal(stats.registerCounts.formal, 1)
    assert.equal(stats.friend.shengPct, 100)
    assert.equal(stats.partner.shengPct, 0)
    const text = formatStyleAnalysis({ myName: 'Bruce Bera', myFullName: 'Bruce Bera' }, stats)
    assert.match(text, /Style Analysis/)
    assert.match(text, /friend\/dev banter/)
    assert.match(text, /girlfriend/)
    assert.match(text, /both registers/)
})

test('computeStyleStats: percentages are computed from the given samples', () => {
    const stats = computeStyleStats(['hi', 'yo', 'a much longer message here', 'another long one here ok'])
    assert.equal(stats.overall.total, 4)
    assert.equal(stats.overall.under15Pct, 50)
    assert.equal(stats.overall.endPunctPct, 0)
    const punct = computeStyleStats(['Habari.', 'Poa sana'])
    assert.equal(punct.overall.endPunctPct, 50)
})
