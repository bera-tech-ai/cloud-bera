'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')
const pterodactyl = require('../Commands/pterodactyl')
const github = require('../Plugins/github')

const fakeContext = (command, text, args, overrides = {}) => {
    const replies = []
    const reactions = []
    const ctx = {
        conn: { sendMessage: async (_chat, payload) => reactions.push(payload) },
        args, command, text, prefix: '.', isOwner: true, chat: '254700000001@s.whatsapp.net',
        reply: async value => replies.push(String(value)),
        ...overrides
    }
    return { m: { key: { id: 'test' }, isGroup: false }, ctx, replies, reactions }
}

test('`.setbhkey` saves a valid key via the persisted database and never echoes it', async () => {
    const previous = global.db
    let writes = 0
    global.db = { data: { settings: {} }, write: async () => { writes++ } }
    const secret = 'bh_private_example'
    const { m, ctx, replies } = fakeContext('setbhkey', secret, [secret])
    try {
        await pterodactyl(m, ctx)
        assert.equal(global.db.data.settings.bhApiKey, secret)
        assert.equal(writes, 1)
        assert.match(replies[0], /saved/i)
        assert.doesNotMatch(replies.join('\n'), /bh_private_example/)
    } finally { global.db = previous }
})

test('BeraHost key save refuses non-owner and group-chat attempts', async () => {
    const previous = global.db
    global.db = { data: { settings: {} }, write: async () => {} }
    try {
        const secret = 'bh_private_example'
        const notOwner = fakeContext('setbhkey', secret, [secret], { isOwner: false })
        await pterodactyl(notOwner.m, notOwner.ctx)
        assert.equal(global.db.data.settings.bhApiKey, undefined)
        assert.match(notOwner.replies[0], /owner only/i)
        const group = fakeContext('setbhkey', secret, [secret], { chat: '123@g.us' })
        await pterodactyl(group.m, group.ctx)
        assert.equal(global.db.data.settings.bhApiKey, undefined)
        assert.match(group.replies[0], /private chat/i)
    } finally { global.db = previous }
})

test('BeraHost key write failure does not falsely claim success or lose a previous key', async () => {
    const previous = global.db
    global.db = { data: { settings: { bhApiKey: 'bh_existing' } }, write: async () => { throw new Error('storage offline') } }
    const { m, ctx, replies } = fakeContext('setbhkey', 'bh_replacement', ['bh_replacement'])
    try {
        await pterodactyl(m, ctx)
        assert.equal(global.db.data.settings.bhApiKey, 'bh_existing')
        assert.match(replies[0], /could not persist/i)
        assert.doesNotMatch(replies.join('\n'), /bh_replacement/)
    } finally { global.db = previous }
})

test('`.setghkey` is registered and validates then persists the GitHub token without exposing it', async () => {
    assert.ok(github.command.includes('setghkey'))
    const previous = global.db
    const previousAdapter = axios.defaults.adapter
    let writes = 0
    global.db = { data: { settings: {} }, write: async () => { writes++ } }
    axios.defaults.adapter = async config => ({
        data: { login: 'test-user', name: 'Test User', public_repos: 1, followers: 2 },
        status: 200, statusText: 'OK', headers: {}, config
    })
    const secret = 'ghp_private_example'
    const { m, ctx, replies } = fakeContext('setghkey', secret, [secret])
    try {
        await github(m, ctx)
        assert.equal(global.db.data.settings.githubToken, secret)
        assert.equal(writes, 1)
        assert.match(replies[0], /token saved/i)
        assert.doesNotMatch(replies.join('\n'), /ghp_private_example/)
    } finally {
        axios.defaults.adapter = previousAdapter
        global.db = previous
    }
})

test('GitHub key command refuses group chats before making validation requests', async () => {
    const previous = global.db
    global.db = { data: { settings: {} }, write: async () => {} }
    const { m, ctx, replies } = fakeContext('setghkey', 'ghp_private_example', ['ghp_private_example'], { chat: '123@g.us' })
    m.isGroup = true
    try {
        await github(m, ctx)
        assert.equal(global.db.data.settings.githubToken, undefined)
        assert.match(replies[0], /private chat/i)
    } finally { global.db = previous }
})
