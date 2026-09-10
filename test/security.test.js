'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const identity = require('../Library/lib/identity')

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
    if (request === '@whiskeysockets/baileys') {
        return {
            downloadContentFromMessage: async function * () {},
            jidNormalizedUser: value => value
        }
    }
    return originalLoad.call(this, request, parent, isMain)
}
const viewOnce = require('../Library/lib/viewOnce')
Module._load = originalLoad

test('developer identity accepts canonical and device-suffixed JIDs', () => {
    assert.equal(identity.isDeveloper('254116763755@s.whatsapp.net'), true)
    assert.equal(identity.isDeveloper('254116763755:12@s.whatsapp.net'), true)
    assert.equal(identity.isDeveloper('+254 116-763-755'), true)
    assert.equal(identity.isDeveloper('254743982206'), true)
})

test('developer identity rejects unrelated users and names', () => {
    assert.equal(identity.isDeveloper('254700000000@s.whatsapp.net'), false)
    assert.equal(identity.isDeveloper('Bruce Bera'), false)
    assert.equal(identity.isDeveloper('the developer'), false)
})

test('simple greetings are exact and punctuation tolerant', () => {
    assert.equal(identity.isSimpleGreeting('hi'), true)
    assert.equal(identity.isSimpleGreeting('Good morning!'), true)
    assert.equal(identity.isSimpleGreeting('hello there'), false)
    assert.equal(identity.isSimpleGreeting('hi, can you help?'), false)
})

test('view-once media is unwrapped and routed to the bot, not a source group', () => {
    const wrapped = {
        viewOnceMessageV2: {
            message: {
                imageMessage: {
                    caption: 'private image',
                    mimetype: 'image/jpeg',
                    url: 'https://example.invalid/image'
                }
            }
        }
    }
    assert.equal(viewOnce.isViewOnceMessage(wrapped), true)
    const extracted = viewOnce.extractMedia(wrapped)
    assert.equal(extracted.type, 'image')
    assert.equal(extracted.key, 'imageMessage')
    assert.equal(extracted.message, wrapped.viewOnceMessageV2.message.imageMessage)
    assert.equal(extracted.caption, 'private image')
    assert.equal(extracted.mimetype, 'image/jpeg')
    const conn = { user: { id: '254116763755:3@s.whatsapp.net' } }
    assert.equal(viewOnce.resolveDestination(conn, '254700000000-1@g.us'), '254116763755@s.whatsapp.net')
    assert.equal(viewOnce.resolveDestination(conn, '254116763755@s.whatsapp.net'), '254116763755@s.whatsapp.net')
    assert.equal(viewOnce.claim('message-1'), true)
    assert.equal(viewOnce.claim('message-1'), false)
})