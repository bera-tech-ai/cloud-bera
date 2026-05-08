// Plugins/buttons.js — Interactive button-powered commands (atassa-style sendButtons)
const { sendButtons } = require('gifted-btns')
const { getBtnMode }  = require('../Library/actions/btnmode')

const handle = {}
handle.command = ['groupmenu', 'gctrl', 'grouppanel',
                  'memberpanel', 'memberctrl', 'minfo',
                  'adminpanel', 'ctrlpanel', 'controlpanel',
                  'vote', 'quickvote', 'poll2',
                  'bhpanel', 'berahostpanel', 'bhmenu',
                  'quickhelp', 'qhelp', 'helpmenu',
                  'botinfo', 'berainfo',
                  'searchbtn', 'qsearch',
                  'settingspanel', 'settingsmenu', 'settings',
                  'togglepanel', 'togglemenu',
                  'deploylist', 'deplist', 'mybotslist']

handle.tags    = ['buttons', 'interactive', 'panel', 'group', 'fun', 'tools']
handle.help    = ['groupmenu', 'vote <Q;A;B>', 'bhpanel', 'quickhelp', 'botinfo']

handle.all = async (m, { conn, command, args, prefix, reply, isOwner, isAdmin, isGroup, sender } = {}) => {
    const chat = m.chat || m.key?.remoteJid
    const p    = prefix
    const cfg  = global.db?.data?.settings || {}

    // ── .groupmenu / .gctrl ───────────────────────────────────────────────────
    if (['groupmenu', 'gctrl', 'grouppanel'].includes(command)) {
        if (!isGroup) return reply('❌ This command is for groups only.')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const name     = meta.subject || 'This Group'
        const members  = (meta.participants || []).length
        const admins   = (meta.participants || []).filter(p2 => p2.admin).length
        const announce = meta.announce ? '🔒 Locked' : '🔓 Open'
        const ephemeral= meta.ephemeralDuration ? meta.ephemeralDuration / 86400 + 'd' : 'Off'

        return sendButtons(conn, chat, {
            title:  '👥 ' + name,
            text:   '📊 *Members:* ' + members + '  |  👑 *Admins:* ' + admins + '\n'
                  + '🔒 *Chat:* ' + announce + '  |  ⏳ *Disappear:* ' + ephemeral + '\n\n'
                  + 'Tap a button to manage the group:',
            footer: 'Bera AI — Group Manager',
            buttons: [
                { id: p + 'mute',       text: '🔒 Lock Chat' },
                { id: p + 'unmute',     text: '🔓 Unlock Chat' },
                { id: p + 'groupinfo',  text: '📊 Group Info' },
                { id: p + 'admins',     text: '👑 List Admins' },
                { id: p + 'members',    text: '👥 All Members' },
                { id: p + 'link',       text: '🔗 Group Link' },
            ]
        })
    }

    // ── .memberpanel @user ────────────────────────────────────────────────────
    else if (['memberpanel', 'memberctrl', 'minfo'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')
        const mentioned = m.mentionedJid?.[0] || m.quoted?.sender
        if (!mentioned) return reply('❌ Tag a member: ' + p + 'memberpanel @user')
        let meta = {}
        try { meta = await conn.groupMetadata(chat) } catch {}
        const part = (meta.participants || []).find(x => x.id === mentioned)
        const role = part?.admin === 'superadmin' ? '👑 Super Admin' : part?.admin ? '🛡️ Admin' : '👤 Member'
        const numDisplay = '+' + mentioned.split('@')[0]

        return sendButtons(conn, chat, {
            title:  '👤 Member Panel',
            text:   '👤 *User:* ' + numDisplay + '\n🏅 *Role:* ' + role + '\n\nChoose an action:',
            footer: 'Bera AI — Member Control',
            buttons: [
                { id: 'promote_' + mentioned,  text: '⬆️ Promote to Admin' },
                { id: 'demote_'  + mentioned,  text: '⬇️ Demote from Admin' },
                { id: 'kick_'    + mentioned,  text: '⛔ Kick Member' },
                { id: 'warn_'    + mentioned,  text: '⚠️ Warn Member' },
                { id: 'mute1h_'  + mentioned,  text: '🔕 Mute 1 Hour' },
            ]
        })
    }

    // ── .adminpanel ───────────────────────────────────────────────────────────
    else if (['adminpanel', 'ctrlpanel', 'controlpanel'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        if (!isAdmin && !isOwner) return reply('⛔ Admin only.')

        return sendButtons(conn, chat, {
            title:  '👑 Admin Control Panel',
            text:   'Manage group settings and moderation:',
            footer: 'Bera AI — Admin Tools',
            buttons: [
                { id: p + 'antilink on',  text: '🔗 Anti-Link ON' },
                { id: p + 'antilink off', text: '🔗 Anti-Link OFF' },
                { id: p + 'antispam on',  text: '🛡️ Anti-Spam ON' },
                { id: p + 'antidelete on',text: '👁️ Anti-Delete ON' },
                { id: p + 'tagall',       text: '📢 Tag All Members' },
                { id: p + 'groupinfo',    text: '📊 Group Info' },
            ]
        })
    }

    // ── .vote Q;A;B ──────────────────────────────────────────────────────────
    else if (['vote', 'quickvote', 'poll2'].includes(command)) {
        const input = args.join(' ')
        const parts = input.split(';').map(s => s.trim()).filter(Boolean)
        if (parts.length < 3) return reply('❌ Usage: ' + p + 'vote Question;Option A;Option B')
        const [question, ...options] = parts
        const ts   = Date.now()
        const body = '🗳️ *Poll:* ' + question + '\n\nTap your choice:'

        return sendButtons(conn, chat, {
            title:  '🗳️ Quick Vote',
            text:   body,
            footer: 'Bera AI — Polls',
            buttons: options.slice(0, 5).map((opt, i) => ({
                id:   'vote_' + ts + '_' + i,
                text: opt
            }))
        })
    }

    // ── .bhpanel — BeraHost quick panel ──────────────────────────────────────
    else if (['bhpanel', 'berahostpanel', 'bhmenu'].includes(command)) {
        return sendButtons(conn, chat, {
            title:  '☁️ BeraHost Panel',
            text:   '🤖 Deploy & manage WhatsApp bots on BeraHost\n\nChoose an action:',
            footer: 'BeraHost — Bot Hosting by Bera AI',
            buttons: [
                { id: p + 'deploy',      text: '🚀 Deploy New Bot' },
                { id: p + 'deploylist',  text: '📋 My Deployments' },
                { id: p + 'bhstatus',    text: '🟢 Check Status' },
                { id: p + 'bhhelp',      text: '❓ BeraHost Help' },
                { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 BeraHost Website', url: 'https://berahost.tech' }) },
            ]
        })
    }

    // ── .quickhelp ────────────────────────────────────────────────────────────
    else if (['quickhelp', 'qhelp', 'helpmenu'].includes(command)) {
        return sendButtons(conn, chat, {
            title:  '❓ Quick Help',
            text:   'Tap a category to see commands:',
            footer: 'Bera AI — Help Center',
            buttons: [
                { id: p + 'aipanel',      text: '🧠 AI Commands' },
                { id: p + 'mediapanel',   text: '📥 Downloader' },
                { id: p + 'groupmenu',    text: '👥 Group Tools' },
                { id: p + 'funpanel',     text: '😂 Fun Commands' },
                { id: p + 'toolspanel',   text: '🔧 Utilities' },
                { id: p + 'allpanels',    text: '📂 All Panels' },
            ]
        })
    }

    // ── .botinfo / .berainfo ──────────────────────────────────────────────────
    else if (['botinfo', 'berainfo'].includes(command)) {
        const uptime = process.uptime()
        const d = Math.floor(uptime / 86400), h = Math.floor((uptime % 86400) / 3600),
              mn = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60)
        const uptimeStr = d + 'd ' + h + 'h ' + mn + 'm ' + s + 's'

        return sendButtons(conn, chat, {
            title:  '🤖 Bera AI Info',
            text:   '⏱️ *Uptime:* ' + uptimeStr + '\n'
                  + '🔑 *Prefix:* ' + p + '\n'
                  + '🌐 *Mode:* ' + (cfg.mode || 'Public') + '\n'
                  + '📦 *Version:* 2.0.0\n\nPowered by Bera Tech AI',
            footer: 'Bera AI — WhatsApp Bot',
            buttons: [
                { id: p + 'ping',    text: '⚡ Ping Bot' },
                { id: p + 'menu',    text: '📋 Full Menu' },
                { id: p + 'allpanels',text: '🗂️ All Panels' },
            ]
        })
    }

    // ── .settingspanel — full toggle panel (single_select list) ──────────────
    else if (['settingspanel', 'settingsmenu', 'settings'].includes(command)) {
        const on  = v => v ? '✅' : '❌'
        const rows = [
            { id: p + 'ai',          title: '🤖 ChatBera AI',        description: 'Currently: ' + on(cfg.chatberaEnabled) },
            { id: p + 'chatbot',     title: '💬 Chatbot Mode',       description: 'Currently: ' + on(cfg.chatbot) },
            { id: p + 'sv',          title: '👁️ Auto Status View',  description: 'Currently: ' + on(cfg.autoStatusView) },
            { id: p + 'sl',          title: '❤️ Auto Status Like',  description: 'Currently: ' + on(cfg.autoStatusLike) },
            { id: p + 'autotyping',  title: '⌨️ Auto Typing',       description: 'Currently: ' + on(cfg.autotyping) },
            { id: p + 'noprefix',    title: '🔑 No-Prefix Mode',    description: 'Currently: ' + on(cfg.noprefix) },
            { id: p + 'mode',        title: '🌐 Bot Mode',          description: 'Currently: ' + (cfg.mode || 'public') },
        ]
        return sendButtons(conn, chat, {
            title:  '⚙️ Bot Settings',
            text:   'Select a setting to toggle it:',
            footer: 'Bera AI Settings',
            buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({ title: '⚙️ Choose Setting', sections: [{ title: 'Bot Settings', rows }] })
            }]
        })
    }

    // ── .deploylist — list my deployments ────────────────────────────────────
    else if (['deploylist', 'deplist', 'mybotslist'].includes(command)) {
        let rows = []
        try {
            const bh = require('../Library/actions/berahost')
            const r  = await bh.listDeployments()
            if (r.success && r.deployments?.length) {
                rows = r.deployments.map(d => ({
                    id:          p + 'depinfo ' + d.id,
                    title:       '🤖 ' + (d.name || d.botType || d.id),
                    description: 'Status: ' + (d.status || 'unknown') + ' | ' + (d.id || '')
                }))
            }
        } catch {}
        if (!rows.length) return reply('❌ No deployments found. Use ' + p + 'deploy to create one.')

        return sendButtons(conn, chat, {
            title:  '🤖 My Deployments',
            text:   'Select a deployment to view its details:',
            footer: 'BeraHost — Bot Hosting',
            buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({ title: '🤖 Select Bot', sections: [{ title: 'Active Bots', rows }] })
            }]
        })
    }
}

module.exports = handle
