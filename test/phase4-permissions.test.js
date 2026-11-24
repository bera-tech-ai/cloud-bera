'use strict'

// Phase 4 §26 matrix — permissions: owner / sudo / group-admin / bot-admin /
// non-admin rejection, private vs group chat, LID and alternate identities,
// and the Phase 4 owner-only commands (tenant, channel).

const test = require('node:test')
const assert = require('node:assert/strict')
const { getAccessContext, authorizeCommand, policyFor, identityMatches } = require('../Library/lib/permissions')

const OWNER = '254116763755@s.whatsapp.net'
const SUDO = '254700000001@s.whatsapp.net'
const ADMIN = '254711000001@s.whatsapp.net'
const MEMBER = '254722000002@s.whatsapp.net'
const BOT = '254733000003@s.whatsapp.net'
const GROUP = '120363000000000001@g.us'
const PRIVATE = '254722000002@s.whatsapp.net'

const groupConn = (admins = [ADMIN], botAdmin = true) => ({
    user: { id: BOT },
    groupMetadata: async () => ({
        participants: [
            { id: ADMIN, admin: 'admin' },
            { id: MEMBER },
            { id: BOT, admin: botAdmin ? 'admin' : null }
        ]
    })
})

const setupDb = (sudo = [SUDO]) => {
    global.db = { data: { settings: { sudo }, groups: {} } }
}

test('owner bypasses group-admin checks but the bot-admin requirement still applies', async () => {
    setupDb()
    const ctx = await getAccessContext({ conn: groupConn([ADMIN], false), chat: GROUP, sender: OWNER, isOwner: true })
    assert.equal(ctx.role, 'owner')
    assert.equal(ctx.canManageGroup, true)
    assert.equal(ctx.isBotAdmin, false, 'owner does not magically make the bot an admin')
    assert.equal(ctx.isAdmin, false)
})

test('sudo users can use owner tools but are not group admins by themselves', async () => {
    setupDb()
    const ctx = await getAccessContext({ conn: groupConn(), chat: GROUP, sender: SUDO, isOwner: false })
    assert.equal(ctx.role, 'sudo')
    assert.equal(ctx.canUseOwnerTools, true)
    assert.equal(ctx.isSenderAdmin, false)
    assert.equal(authorizeCommand('tenant', ctx).allowed, true)
    assert.equal(authorizeCommand('channel', ctx).allowed, true)
})

test('group admin is recognised; non-admin member is rejected for group-admin commands', async () => {
    setupDb()
    const adminCtx = await getAccessContext({ conn: groupConn(), chat: GROUP, sender: ADMIN })
    assert.equal(adminCtx.role, 'group_admin')
    assert.equal(adminCtx.isSenderAdmin, true)
    assert.equal(adminCtx.isBotAdmin, true)
    assert.equal(authorizeCommand('kick', adminCtx).allowed, true)
    assert.equal(authorizeCommand('pinmsg', adminCtx).allowed, true)

    const memberCtx = await getAccessContext({ conn: groupConn(), chat: GROUP, sender: MEMBER })
    assert.equal(memberCtx.role, 'member')
    assert.equal(authorizeCommand('kick', memberCtx).allowed, false)
    assert.match(authorizeCommand('kick', memberCtx).reason, /group admin or the bot owner/)
    assert.equal(authorizeCommand('tenant', memberCtx).allowed, false)
    assert.match(authorizeCommand('tenant', memberCtx).reason, /owner or an approved sudo/)
})

test('group-only commands are rejected in private chats; owner tools work in private', async () => {
    setupDb()
    const privateCtx = await getAccessContext({ conn: {}, chat: PRIVATE, sender: MEMBER })
    assert.equal(privateCtx.isGroup, false)
    assert.equal(authorizeCommand('kick', privateCtx).allowed, false)
    assert.match(authorizeCommand('kick', privateCtx).reason, /groups only/)
    assert.equal(authorizeCommand('tenant', privateCtx).allowed, false, 'tenant is owner-only even in private chat')

    const ownerPrivate = await getAccessContext({ conn: {}, chat: PRIVATE, sender: OWNER, isOwner: true })
    assert.equal(authorizeCommand('tenant', ownerPrivate).allowed, true)
    assert.equal(authorizeCommand('channel', ownerPrivate).allowed, true)
})

test('unauthorized (private-mode / banned) users are rejected before any policy', async () => {
    setupDb()
    const ctx = await getAccessContext({ conn: groupConn(), chat: GROUP, sender: MEMBER, authorized: false })
    assert.equal(authorizeCommand('kick', ctx).allowed, false)
    assert.match(authorizeCommand('kick', ctx).reason, /not authorized/)
    assert.equal(authorizeCommand('tenant', ctx).allowed, false)
})

test('LID and alternate identities match the same person', () => {
    // A participant listed by LID still matches the sender's JID identity.
    assert.equal(identityMatches({ id: '123456@lid', participantAlt: ADMIN }, ADMIN), true)
    assert.equal(identityMatches({ id: ADMIN, remoteJidAlt: '123456@lid' }, '123456@lid'), true)
    // Device-suffixed JIDs match the bare number.
    assert.equal(identityMatches('254711000001:12@s.whatsapp.net', ADMIN), true)
    assert.equal(identityMatches(MEMBER, ADMIN), false)
})

test('group-admin checks work through LID participantAlt identities', async () => {
    setupDb()
    const lidConn = {
        user: { id: BOT, lid: '999999@lid' },
        groupMetadata: async () => ({
            participants: [
                { id: '111111@lid', participantAlt: ADMIN, admin: 'admin' },
                { id: MEMBER },
                { id: BOT, admin: 'admin' }
            ]
        })
    }
    const ctx = await getAccessContext({ conn: lidConn, chat: GROUP, sender: ADMIN })
    assert.equal(ctx.isSenderAdmin, true)
    assert.equal(ctx.isBotAdmin, true)
})

test('Phase 4 commands are owner-scoped; group-admin commands keep their scope', () => {
    assert.equal(policyFor('tenant').scope, 'owner')
    assert.equal(policyFor('tenants').scope, 'owner')
    assert.equal(policyFor('channel').scope, 'owner')
    assert.equal(policyFor('channels').scope, 'owner')
    assert.equal(policyFor('kick').scope, 'group_admin')
    assert.equal(policyFor('tagall').scope, 'group')
    assert.equal(policyFor('menu').scope, 'public')
    assert.equal(policyFor('.tenant').scope, 'owner', 'leading dots are stripped before policy lookup')
})
