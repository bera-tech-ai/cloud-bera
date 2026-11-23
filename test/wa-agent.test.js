const assert = require('node:assert/strict')
const handle = require('../Plugins/waagent')

;(async () => {
    const sent = []
    const replies = []
    const conn = {
        onWhatsApp: async () => [{ exists: true, jid: '254712345678@s.whatsapp.net' }],
        groupFetchAllParticipating: async () => ({
            '123@g.us': { subject: 'Bera Test Group' },
        }),
        sendMessage: async (jid, content) => {
            sent.push({ jid, content })
            return { key: { id: 'test' } }
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

    await handle({}, ctx({ args: ['check', '254712345678'], text: 'check 254712345678' }))
    assert.match(replies.pop(), /registered on WhatsApp/)

    await handle({}, ctx({ args: ['send', '254712345678', '|', 'hello'], text: 'send 254712345678 | hello' }))
    const preview = replies.pop()
    assert.match(preview, /Message preview/)
    assert.equal(sent.length, 0)
    const token = preview.match(/confirm ([A-F0-9]{8})/)[1]

    await handle({}, ctx({ args: ['confirm', token], text: `confirm ${token}` }))
    assert.match(replies.pop(), /Message sent/)
    assert.equal(sent[0].jid, '254712345678@s.whatsapp.net')
    assert.equal(sent[0].content.text, 'hello')

    await handle({}, ctx({ args: ['story', 'Bera is online'], text: 'story Bera is online' }))
    const storyPreview = replies.pop()
    const storyToken = storyPreview.match(/confirm ([A-F0-9]{8})/)[1]
    await handle({}, ctx({ args: ['confirm', storyToken], text: `confirm ${storyToken}` }))
    assert.match(replies.pop(), /story posted/)
    assert.equal(sent[1].jid, 'status@broadcast')
    assert.equal(sent[1].content.text, 'Bera is online')

    await handle({}, ctx({ command: 'wactgroups', args: [], text: '' }))
    assert.match(replies.pop(), /Bera Test Group/)

    console.log('wa agent tests passed')
})().catch(error => {
    console.error(error)
    process.exitCode = 1
})
