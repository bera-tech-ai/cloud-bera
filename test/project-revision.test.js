'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseProjectRevision } = require('../Library/actions/project-build')
const { validateRevisionEdits } = require('../Library/actions/agent-os')

const projects = [
    { id: 'p1', name: 'tembea-safaris' },
    { id: 'p2', name: 'swahili-bites' },
    { id: 'p3', name: 'pesa-track' }
]

test('revision parser matches a full project name', () => {
    const parsed = parseProjectRevision('Agent, change the prices on Tembea Safaris to Kenyan shillings', projects)
    assert.equal(parsed.project.id, 'p1')
})

test('revision parser matches a unique first word of the project name', () => {
    const parsed = parseProjectRevision('add a WhatsApp button to tembea', projects)
    assert.equal(parsed.project.id, 'p1')
    const swahili = parseProjectRevision('update the swahili bites menu prices', projects)
    assert.equal(swahili.project.id, 'p2')
})

test('revision parser ignores build requests and chatter', () => {
    assert.equal(parseProjectRevision('build a website called Tembea Safaris and deploy it', projects), null)
    assert.equal(parseProjectRevision('build me a todo app', projects), null)
    assert.equal(parseProjectRevision('tell me about tembea safaris', projects), null)
    assert.equal(parseProjectRevision('change the weather in Nairobi', projects), null)
})

test('revision parser refuses an ambiguous first-word match', () => {
    const ambiguous = [
        { id: 'a', name: 'tembea-safaris' },
        { id: 'b', name: 'tembea-tours' }
    ]
    assert.equal(parseProjectRevision('update tembea', ambiguous), null)
    const exact = parseProjectRevision('update tembea tours', ambiguous)
    assert.equal(exact.project.id, 'b')
})

test('validateRevisionEdits accepts an exact-once edit', () => {
    const contents = { 'index.html': '<p>Price: $1,200</p>' }
    const edits = [{ file: 'index.html', find: '$1,200', replace: 'KSh 155,000' }]
    assert.equal(validateRevisionEdits(contents, edits), null)
})

test('validateRevisionEdits rejects missing, repeated, and unknown targets', () => {
    const contents = { 'index.html': '<p>$5 and $5</p>' }
    assert.match(validateRevisionEdits(contents, [{ file: 'index.html', find: '$9', replace: 'x' }]), /found 0 times/)
    assert.match(validateRevisionEdits(contents, [{ file: 'index.html', find: '$5', replace: 'x' }]), /found 2 times/)
    assert.match(validateRevisionEdits(contents, [{ file: 'app.js', find: '$5', replace: 'x' }]), /unknown file/)
    assert.match(validateRevisionEdits(contents, []), /did not produce/)
    assert.match(validateRevisionEdits(contents, [{ file: 'index.html', replace: 'x' }]), /malformed/)
})
