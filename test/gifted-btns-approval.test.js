'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const path = require('path')

test('approval quick replies use gifted-btns native format with private-chat aimode', async () => {
    const btnsPath = require.resolve('../Library/actions/btns')
    const originalLoad = Module._load
    let sent

    Module._load = function (request, parent, isMain) {
        if (request === 'gifted-btns') {
            return {
                sendButtons: async (conn, jid, content) => { sent = { jid, content } }
            }
        }
        return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[btnsPath]

    try {
        const { sendBtn } = require('../Library/actions/btns')
        await sendBtn({}, 'owner@s.whatsapp.net', {
            title: 'Owner approval required',
            text: 'Review before publishing.',
            buttons: [{ id: '.agent project approve case-123 deploy', text: 'Approve GitHub + Deploy' }]
        })
    } finally {
        Module._load = originalLoad
        delete require.cache[btnsPath]
    }

    assert.equal(sent.jid, 'owner@s.whatsapp.net')
    assert.equal(sent.content.aimode, true)
    assert.equal(sent.content.buttons.length, 1)
    assert.equal(sent.content.buttons[0].name, 'quick_reply')
    assert.deepEqual(JSON.parse(sent.content.buttons[0].buttonParamsJson), {
        display_text: 'Approve GitHub + Deploy',
        id: '.agent project approve case-123 deploy'
    })
})
