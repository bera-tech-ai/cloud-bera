'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { getInteractiveReply } = require('../Library/lib/interactive-replies')

test('extracts gifted-btns native-flow quick-reply command IDs', () => {
    const command = '.agent project approve case-123 deploy'
    const message = {
        interactiveResponseMessage: {
            nativeFlowResponseMessage: {
                paramsJson: JSON.stringify({ display_text: 'Approve GitHub + Deploy', id: command })
            }
        }
    }
    assert.equal(getInteractiveReply(message), command)
})

test('supports legacy buttons, template buttons, and list selection replies', () => {
    assert.equal(getInteractiveReply({ buttonsResponseMessage: { selectedButtonId: '.agent project approve case-1 github' } }), '.agent project approve case-1 github')
    assert.equal(getInteractiveReply({ templateButtonReplyMessage: { selectedId: '.agent project undo case-1' } }), '.agent project undo case-1')
    assert.equal(getInteractiveReply({ listResponseMessage: { singleSelectReply: { selectedRowId: '.agent project preview case-1' } } }), '.agent project preview case-1')
})

test('returns an empty string for malformed or unrelated messages', () => {
    assert.equal(getInteractiveReply(null), '')
    assert.equal(getInteractiveReply({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{broken' } } }), '')
    assert.equal(getInteractiveReply({ conversation: 'ordinary text' }), '')
})
