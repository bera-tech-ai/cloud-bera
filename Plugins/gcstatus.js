// Plugins/gcstatus.js — Send WhatsApp Group Status/Stories
// Uses Library/actions/gcstatus.js (GiftedStatus-equivalent for @whiskeysockets/baileys)
// Commands: .gcstatus, .groupstatus, .gstory, .statustogroup, .statustogroups, .gstatusall

const { sendGroupStatus, sendStatusToGroups, downloadQuotedMedia } = require('../Library/actions/gcstatus')
const axios = require('axios')

const handle = {}
handle.command = [
    'gcstatus', 'groupstatus', 'gstory', 'sendgroupstatus', 'groupstory',
    'statustogroup', 'statustogroups', 'gstatusall', 'sendstatustogroups',
    'gcstatustext', 'gcstatusimg', 'gcstatusvid',
    'gcstatuscolor', 'colorstatus',
    'groupstatusinfo'
]

handle.tags    = ['group', 'status', 'story', 'media']
handle.help    = [
    'gcstatus <text>         — Post text story to current group',
    'gcstatus (quote img)    — Post image story to current group',
    'gcstatus (quote video)  — Post video story to current group',
    'statustogroup <text>    — Post to personal status AND notify this group',
    'statustogroups <text>   — Post to personal status AND notify ALL groups',
    'gstatusall <text>       — Send group story to all your groups',
    'gcstatuscolor <color> <text> — Text story with specific background color',
    'groupstatusinfo         — How group status works',
]

// Supported background color names for .gcstatuscolor
const NAMED_COLORS = {
    green:   0xFF1FA8484,
    blue:    0xFF2C4BFF,
    orange:  0xFFD14B00,
    purple:  0xFF6B2FBB,
    sky:     0xFF0074BB,
    red:     0xFFE6264D,
    teal:    0xFF00796B,
    black:   0xFF000000,
    pink:    0xFFE91E8C,
    yellow:  0xFFFFB300,
    white:   0xFFFFFFFF,
}

handle.all = async (m, { conn, command, args, prefix, reply, isOwner, isAdmin, isGroup, sender } = {}) => {
    const chat  = m.chat || m.key?.remoteJid
    const p     = prefix
    const text  = args.join(' ').trim()
    const q     = m.quoted

    // ── .groupstatusinfo — explain the feature ──────────────────────────────
    if (command === 'groupstatusinfo') {
        return reply(
            '╭══〘 *📖 Group Status / Story* 〙═⊷\n' +
            '┃\n' +
            '┃ Group status = a story posted *inside a group*\n' +
            '┃ visible only to that group\'s members.\n' +
            '┃\n' +
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '┃ *Commands:*\n' +
            '┃\n' +
            '┃ ' + p + 'gcstatus <text>\n' +
            '┃   → Post a colored text story to current group\n' +
            '┃\n' +
            '┃ ' + p + 'gcstatus (quote image/video)\n' +
            '┃   → Post that media as a group story\n' +
            '┃\n' +
            '┃ ' + p + 'gcstatuscolor <color> <text>\n' +
            '┃   → Text story with specific color\n' +
            '┃   Colors: green blue orange purple sky\n' +
            '┃           red teal black pink yellow\n' +
            '┃\n' +
            '┃ ' + p + 'statustogroup <text>\n' +
            '┃   → Post to YOUR personal status +\n' +
            '┃     notify this group\'s members\n' +
            '┃\n' +
            '┃ ' + p + 'statustogroups <text>\n' +
            '┃   → Post to YOUR status + notify ALL groups\n' +
            '┃\n' +
            '┃ ' + p + 'gstatusall <text>\n' +
            '┃   → Send group story to every group the\n' +
            '┃     bot is in (owner only)\n' +
            '┃\n' +
            '┃ ⚠️ Group admin required to post group stories\n' +
            '╰══════════════════⊷'
        )
    }

    // ── .gcstatus / .groupstatus / .gstory ──────────────────────────────────
    if (['gcstatus', 'groupstatus', 'gstory', 'sendgroupstatus', 'groupstory', 'gcstatustext', 'gcstatusimg', 'gcstatusvid'].includes(command)) {
        if (!isGroup) return reply('❌ This command only works inside a group.')

        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        // ── Quoted image ────────────────────────────────────────────────────
        if (q && /image/.test(q.mimetype || '')) {
            try {
                const media = await downloadQuotedMedia(conn, m)
                if (!media?.buf) return reply('❌ Could not download the quoted image.')
                await sendGroupStatus(conn, chat, {
                    image:   media.buf,
                    caption: text || ''
                })
                await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                return reply('✅ Image story posted to this group!')
            } catch (e) {
                await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
                return reply('❌ Failed to post image story: ' + e.message)
            }
        }

        // ── Quoted video ────────────────────────────────────────────────────
        if (q && /video/.test(q.mimetype || '')) {
            try {
                const media = await downloadQuotedMedia(conn, m)
                if (!media?.buf) return reply('❌ Could not download the quoted video.')
                await sendGroupStatus(conn, chat, {
                    video:   media.buf,
                    caption: text || ''
                })
                await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                return reply('✅ Video story posted to this group!')
            } catch (e) {
                await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
                return reply('❌ Failed to post video story: ' + e.message)
            }
        }

        // ── Image URL in text ────────────────────────────────────────────────
        const urlMatch = text.match(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/i)
        if (urlMatch) {
            try {
                const url  = urlMatch[0]
                const cap  = text.replace(url, '').trim()
                const buf  = await axios.get(url, { responseType: 'arraybuffer' }).then(r => Buffer.from(r.data))
                await sendGroupStatus(conn, chat, { image: buf, caption: cap })
                await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                return reply('✅ Image story posted from URL to this group!')
            } catch (e) {
                return reply('❌ Could not load image from URL: ' + e.message)
            }
        }

        // ── Plain text ───────────────────────────────────────────────────────
        if (!text) return reply(
            '❌ Provide text or quote an image/video.\n\n' +
            'Examples:\n' +
            '*' + p + 'gcstatus Hello World!*\n' +
            '*' + p + 'gcstatus* (quote an image)\n' +
            '*' + p + 'gcstatuscolor purple Good morning!'
        )

        try {
            await sendGroupStatus(conn, chat, { text })
            await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return reply('✅ Text story posted to this group!')
        } catch (e) {
            await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply('❌ Failed: ' + e.message)
        }
    }

    // ── .gcstatuscolor <color> <text> ────────────────────────────────────────
    if (['gcstatuscolor', 'colorstatus'].includes(command)) {
        if (!isGroup) return reply('❌ Groups only.')
        const colorName = args[0]?.toLowerCase()
        const stText    = args.slice(1).join(' ').trim()
        const bgColor   = NAMED_COLORS[colorName]

        if (!colorName || !stText) {
            const colorList = Object.keys(NAMED_COLORS).join(', ')
            return reply(
                '❌ Usage: ' + p + 'gcstatuscolor <color> <text>\n\n' +
                '🎨 Available colors:\n' + colorList
            )
        }
        if (!bgColor) {
            return reply('❌ Unknown color: *' + colorName + '*\n\nAvailable: ' + Object.keys(NAMED_COLORS).join(', '))
        }

        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
        try {
            await sendGroupStatus(conn, chat, { text: stText, backgroundArgb: bgColor })
            await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return reply('✅ ' + colorName.charAt(0).toUpperCase() + colorName.slice(1) + ' story posted!')
        } catch (e) {
            await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply('❌ Failed: ' + e.message)
        }
    }

    // ── .statustogroup — post to personal status AND notify this group ────────
    if (['statustogroup', 'statustogroups', 'sendstatustogroups'].includes(command)) {
        if (command === 'statustogroup' && !isGroup) return reply('❌ Use this inside a group.')
        if (!isOwner) return reply('⛔ Owner only.')

        let targetGroups
        if (command === 'statustogroup') {
            targetGroups = [chat]
        } else {
            // All groups the bot is in
            try {
                const allChats = await conn.groupFetchAllParticipating()
                targetGroups   = Object.keys(allChats || {})
            } catch {
                targetGroups = isGroup ? [chat] : []
            }
        }

        if (!targetGroups.length) return reply('❌ No groups found.')

        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        let content
        if (q && /image/.test(q.mimetype || '')) {
            const media = await downloadQuotedMedia(conn, m)
            if (!media?.buf) return reply('❌ Could not download image.')
            content = { image: media.buf, caption: text || '' }
        } else if (q && /video/.test(q.mimetype || '')) {
            const media = await downloadQuotedMedia(conn, m)
            if (!media?.buf) return reply('❌ Could not download video.')
            content = { video: media.buf, caption: text || '' }
        } else if (text) {
            content = { text }
        } else {
            return reply('❌ Provide text or quote an image/video.')
        }

        try {
            await reply('⏳ Posting to personal status + notifying ' + targetGroups.length + ' group(s)...')
            await sendStatusToGroups(conn, content, targetGroups)
            await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return reply('✅ Status posted! Notified *' + targetGroups.length + '* group(s).')
        } catch (e) {
            await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply('❌ Failed: ' + e.message)
        }
    }

    // ── .gstatusall — send group story to ALL groups ──────────────────────────
    if (command === 'gstatusall') {
        if (!isOwner) return reply('⛔ Owner only.')
        if (!text && !q) return reply('❌ Provide text or quote media.')

        let allGroups
        try {
            const fetched = await conn.groupFetchAllParticipating()
            allGroups     = Object.keys(fetched || {})
        } catch {
            return reply('❌ Could not fetch group list.')
        }
        if (!allGroups.length) return reply('❌ Bot is not in any groups.')

        let content
        if (q && /image/.test(q.mimetype || '')) {
            const media = await downloadQuotedMedia(conn, m)
            if (!media?.buf) return reply('❌ Could not download image.')
            content = { image: media.buf, caption: text || '' }
        } else if (q && /video/.test(q.mimetype || '')) {
            const media = await downloadQuotedMedia(conn, m)
            if (!media?.buf) return reply('❌ Could not download video.')
            content = { video: media.buf, caption: text || '' }
        } else {
            content = { text }
        }

        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
        await reply('⏳ Sending group story to *' + allGroups.length + '* groups...')

        let success = 0, failed = 0
        for (const gid of allGroups) {
            try {
                await sendGroupStatus(conn, gid, content)
                success++
                await new Promise(r => setTimeout(r, 2000)) // 2s delay between groups
            } catch {
                failed++
            }
        }

        await conn.sendMessage(chat, { react: { text: success > 0 ? '✅' : '❌', key: m.key } }).catch(() => {})
        return reply(
            '╭══〘 *📊 Group Story Results* 〙═⊷\n' +
            '┃ ✅ Sent:   ' + success + ' groups\n' +
            '┃ ❌ Failed: ' + failed  + ' groups\n' +
            '┃ 📦 Total:  ' + allGroups.length + ' groups\n' +
            '╰══════════════════⊷'
        )
    }
}

module.exports = handle
