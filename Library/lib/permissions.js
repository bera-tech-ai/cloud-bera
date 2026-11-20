'use strict'

const { isAuthorized } = require('../../Auth')

const OWNER_ONLY = new Set([
    'dbstatus', 'eval', 'exec', 'shell', 'sh', 'update', 'updatenow', 'reload', 'hotreload',
    'resetdb', 'cleandb', 'broadcast', 'join', 'left', 'forward', 'tostatus',
    'genkey', 'revokekey', 'extendkey', 'listkeys', 'sudo', 'delsudo', 'resetsudo',
    'block', 'unblock', 'blocklist', 'resetlimit', 'listusers', 'mode', 'noprefix',
    'berahost', 'berahost_deploy', 'pterodactyl', 'pt', 'project_lifecycle',
    'deploy', 'deployweb', 'delete_deployment'
])

const GROUP_ADMIN_ONLY = new Set([
    'kick', 'add', 'promote', 'demote', 'mute', 'unmute', 'warn', 'clearwarn',
    'antilink', 'antispam', 'antipromote', 'antidemote', 'welcome', 'setwelcomemsg',
    'setgoodbye', 'del', 'disapp', 'revoke', 'resetlink', 'groupname', 'gcdesc',
    'gcpp', 'pinmsg', 'accept', 'reject', 'acceptall', 'rejectall', 'newgroup',
    'killgc', 'clonegroup', 'kickinactive', 'tagadmins'
])

const GROUP_ONLY = new Set([
    'kick', 'add', 'promote', 'demote', 'mute', 'unmute', 'tagall', 'hidetag',
    'everyone', 'tag', 'tagadmins', 'link', 'revoke', 'resetlink', 'groupname',
    'gcdesc', 'gcpp', 'getgcpp', 'listmembers', 'listadmins', 'groupinfo', 'ginfo',
    'warn', 'warnlist', 'clearwarn', 'poll', 'pinmsg', 'online', 'accept', 'reject',
    'acceptall', 'rejectall', 'listrequests', 'clonegroup', 'kickinactive'
])

const normalize = jid => String(jid || '').replace(/:\d+(?=@)/, '').toLowerCase()
const phone = jid => normalize(jid).split('@')[0]
const listHas = (list, jid) => {
    const n = normalize(jid), p = phone(jid)
    return (Array.isArray(list) ? list : []).some(x => normalize(x) === n || phone(x) === p)
}

const getAccessContext = async ({ conn, chat, sender, isOwner = false, authorized = true }) => {
    const isGroup = String(chat || '').endsWith('@g.us')
    const settings = global.db?.data?.settings || {}
    const group = global.db?.data?.groups?.[chat] || {}
    const sudo = listHas(settings.sudo, sender) || listHas(global.db?.data?.sudo, sender)
    let metadata = null
    let isSenderAdmin = false
    let isBotAdmin = false
    if (isGroup && conn?.groupMetadata) {
        try {
            metadata = await conn.groupMetadata(chat)
            const participants = metadata?.participants || []
            const find = jid => participants.find(p => normalize(p.id || p.jid) === normalize(jid))
            const senderParticipant = find(sender)
            const botParticipant = find(conn.user?.id)
            isSenderAdmin = Boolean(senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin' || senderParticipant?.isAdmin)
            isBotAdmin = Boolean(botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin' || botParticipant?.isAdmin)
        } catch {}
    }
    const role = isOwner ? 'owner' : sudo ? 'sudo' : isSenderAdmin ? 'group_admin' : 'member'
    return {
        authorized: Boolean(authorized), isOwner: Boolean(isOwner), isSudo: Boolean(sudo),
        isGroup, isSenderAdmin, isBotAdmin,
        // Compatibility: existing handlers use isAdmin to mean bot admin capability.
        isAdmin: isBotAdmin,
        role, groupSettings: group, metadata,
        canManageGroup: Boolean(isOwner || isSenderAdmin),
        canUseOwnerTools: Boolean(isOwner || sudo),
        canUseAgent: Boolean(authorized && (isOwner || sudo || !isGroup || group.agentEnabled !== false))
    }
}

const policyFor = command => {
    const c = String(command || '').toLowerCase().replace(/^[./!]+/, '')
    if (c.startsWith('pt') || c.startsWith('ptero') || c.startsWith('berahost') ||
        c.startsWith('github') || c.startsWith('gitpush') || c.startsWith('gitclone') ||
        c.startsWith('createrepo') || c.startsWith('deploy') || c.startsWith('skyhost') ||
        c.startsWith('codeexec') || c === 'run_code' || c === 'run' || c === 'coderun') {
        return { scope: 'owner', label: 'owner or sudo' }
    }
    if (OWNER_ONLY.has(c)) return { scope: 'owner', label: 'owner or sudo' }
    if (GROUP_ADMIN_ONLY.has(c)) return { scope: 'group_admin', label: 'group admins' }
    if (GROUP_ONLY.has(c)) return { scope: 'group', label: 'groups' }
    return { scope: 'public', label: 'members' }
}

const authorizeCommand = (command, access, options = {}) => {
    const policy = policyFor(command)
    if (!access.authorized) return { allowed: false, reason: 'This bot is in private mode or your account is not authorized.' , policy }
    if (policy.scope === 'owner' && !access.canUseOwnerTools) return { allowed: false, reason: 'Only the owner or an approved sudo user can use this command.', policy }
    if (policy.scope === 'group' && !access.isGroup) return { allowed: false, reason: 'This command is available in WhatsApp groups only.', policy }
    if (policy.scope === 'group_admin' && !access.isGroup) return { allowed: false, reason: 'This command is available in groups only.', policy }
    if (policy.scope === 'group_admin' && !access.canManageGroup) return { allowed: false, reason: 'Only a group admin or the bot owner can use this command.', policy }
    if (options.agent && !access.canUseAgent) return { allowed: false, reason: 'The AI agent is disabled for this group.', policy }
    return { allowed: true, policy }
}

module.exports = { OWNER_ONLY, GROUP_ADMIN_ONLY, GROUP_ONLY, normalize, phone, getAccessContext, policyFor, authorizeCommand }
