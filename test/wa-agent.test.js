const assert = require('node:assert/strict')
const handle = require('../Plugins/waagent')

;(async () => {
    const sent = []
    const relayed = []
    const replies = []
    const conn = {
        onWhatsApp: async (jid) => [{ exists: true, jid }],
        groupFetchAllParticipating: async () => ({
            '123@g.us': { subject: 'Bera Test Group' },
        }),
        sendMessage: async (jid, content) => {
            sent.push({ jid, content })
            return { key: { id: 'test' } }
        },
        relayMessage: async (jid, content, options) => {
            relayed.push({ jid, content, options })
            return { key: { id: 'relay-test' } }
        },
    }
    const ctx = (overrides = {}) => ({
        conn,
        args: [],
        text: '',
        command: 'wact',
        reply: async value => replies.push(String(value)),
        isOwner: true,
        sender: '254116763755@s.whatsapp.net',
        ...overrides,
    })
    const confirm = async (preview) => {
        const token = preview.match(/confirm ([A-F0-9]{8})/)[1]
        await handle({}, ctx({ args: ['confirm', token], text: `confirm ${token}` }))
        return replies.pop()
    }

    await handle({}, ctx({ args: ['check', '254712345678'], text: 'check 254712345678' }))
    assert.match(replies.pop(), /registered on WhatsApp/)

    await handle({}, ctx({ args: ['send', '254712345678', '|', 'hello'], text: 'send 254712345678 | hello' }))
    let preview = replies.pop()
    assert.match(preview, /Confirmation preview/)
    assert.match(preview, /Africa\/Nairobi/, 'preview must show the Nairobi expiry time')
    assert.match(preview, /\.wact cancel [A-F0-9]{8}/, 'preview must show the cancellation instruction')
    assert.equal(sent.length, 0)
    assert.match(await confirm(preview), /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(sent[0].jid, '254712345678@s.whatsapp.net')
    assert.equal(sent[0].content.text, 'hello')

    await handle({ quoted: { sender: '254700000001@s.whatsapp.net' } }, ctx({
        args: ['send', 'reply', '|', 'reply hello'],
        text: 'send reply | reply hello',
    }))
    preview = replies.pop()
    assert.match(preview, /To: \+254700000001/)
    assert.match(await confirm(preview), /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(sent.at(-1).jid, '254700000001@s.whatsapp.net')

    await handle({ mentionedJid: ['254700000002@s.whatsapp.net'] }, ctx({
        args: ['send', 'tag', '|', 'tag hello'],
        text: 'send tag | tag hello',
    }))
    preview = replies.pop()
    assert.match(preview, /To: \+254700000002/)
    assert.match(await confirm(preview), /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(sent.at(-1).jid, '254700000002@s.whatsapp.net')

    await handle({ chat: '254700000003@s.whatsapp.net', isGroup: false }, ctx({
        args: ['send', 'this pm', '|', 'private hello'],
        text: 'send this pm | private hello',
    }))
    preview = replies.pop()
    assert.match(await confirm(preview), /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(sent.at(-1).jid, '254700000003@s.whatsapp.net')

    await handle({}, ctx({ args: ['story', 'Bera is online'], text: 'story Bera is online' }))
    const storyPreview = replies.pop()
    assert.match(await confirm(storyPreview), /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(sent.at(-1).jid, 'status@broadcast')
    assert.equal(sent.at(-1).content.text, 'Bera is online')

    await handle({ chat: '123@g.us', isGroup: true }, ctx({
        args: ['groupstory', 'Hello group'],
        text: 'groupstory Hello group',
    }))
    const groupPreview = replies.pop()
    assert.match(groupPreview, /Confirmation preview/)
    assert.match(await confirm(groupPreview), /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(relayed.at(-1).jid, '123@g.us')
    assert.equal(relayed.at(-1).content.groupStatusMessageV2.message.extendedTextMessage.text, 'Hello group')

    await handle({}, ctx({ command: 'wactgroups', args: [], text: '' }))
    assert.match(replies.pop(), /Bera Test Group/)

    console.log('wa agent tests passed')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
