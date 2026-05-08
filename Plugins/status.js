// Bera AI — Auto Status View & Like Plugin
// Commands: .sv .sl .setsl .statusinfo

const handle = async (m, { conn, args, command, prefix, reply, isOwner } = {}) => {
    if (!global.db.data.settings) global.db.data.settings = {}
    const s = global.db.data.settings

    // Helper: get display string for emoji list
    const emojiDisplay = () => {
        const list = s.statusLikeEmojis
        if (Array.isArray(list) && list.length > 1) return list.join(' ')
        return s.statusLikeEmoji || '❤️'
    }

    const card = () => {
        const viewOn = s.autoStatusView || false
        const likeOn = s.autoStatusLike || false
        const vBar   = viewOn ? '▓▓▓▓▓▓▓▓▓▓' : '░░░░░░░░░░'
        const lBar   = likeOn ? '▓▓▓▓▓▓▓▓▓▓' : '░░░░░░░░░░'
        const emojis = emojiDisplay()
        const multi  = Array.isArray(s.statusLikeEmojis) && s.statusLikeEmojis.length > 1
        return (
            '╭══〘 *📊 STATUS SETTINGS* 〙═⊷\n' +
            '┃\n' +
            '┃  ' + (viewOn ? '🟢' : '🔴') + '  Auto View  [' + vBar + ']\n' +
            '┃  ' + (likeOn ? '🟢' : '🔴') + '  Auto Like  [' + lBar + ']\n' +
            '┃\n' +
            '┃ 👁️ Auto View: *' + (viewOn ? 'ON' : 'OFF') + '*\n' +
            '┃ ❤️  Auto Like: *' + (likeOn ? 'ON' : 'OFF') + '*\n' +
            '┃ 😍 React Emoji' + (multi ? 's (random)' : '') + ': *' + emojis + '*\n' +
            '┃\n' +
            '┃ *' + prefix + 'sv on/off*     — toggle auto view\n' +
            '┃ *' + prefix + 'sl on/off*     — toggle auto like\n' +
            '┃ *' + prefix + 'setsl 😂*      — set like emoji\n' +
            '┃ *' + prefix + 'setsl 😂 💮 🌴* — random from list\n' +
            '┃ *' + prefix + 'setsl reset*   — reset to ❤️\n' +
            '╰══════════════════⊷'
        )
    }

    // .sv / .statusview — toggle auto-view
    if (['sv', 'statusview', 'autoview'].includes(command)) {
        if (!isOwner) return reply('❌ Owner only.')
        const arg = (args[0] || '').toLowerCase()
        const cur = s.autoStatusView || false
        s.autoStatusView = arg === 'on' ? true : arg === 'off' ? false : !cur
        await global.db.write()
        return reply(card())
    }

    // .sl / .statuslike — toggle auto-like on/off only
    if (['sl', 'statuslike', 'autolike'].includes(command)) {
        if (!isOwner) return reply('❌ Owner only.')
        const arg = (args[0] || '').toLowerCase()
        if (arg === 'on')       { s.autoStatusLike = true }
        else if (arg === 'off') { s.autoStatusLike = false }
        else                    { s.autoStatusLike = !(s.autoStatusLike || false) }
        await global.db.write()
        return reply(card())
    }

    // .setsl — set react emoji(s)
    // Usage: .setsl 😂          → single emoji
    //        .setsl 😂 💮 🌴   → multiple (random pick)
    //        .setsl reset        → reset to ❤️
    if (['setsl', 'setslemoji', 'setstatusemoji', 'setemoji'].includes(command)) {
        if (!isOwner) return reply('❌ Owner only.')

        if (!args.length) {
            return reply(
                '❓ *Usage:*\n' +
                '*' + prefix + 'setsl 😂*         — single emoji\n' +
                '*' + prefix + 'setsl 😂 💮 🌴*  — random from list\n' +
                '*' + prefix + 'setsl reset*       — reset to ❤️\n\n' +
                'Current: *' + emojiDisplay() + '*'
            )
        }

        const first = (args[0] || '').toLowerCase()

        if (first === 'reset' || first === 'default') {
            delete s.statusLikeEmojis
            s.statusLikeEmoji = '❤️'
            await global.db.write()
            return reply(
                '✅ React emoji reset to *❤️*\n\n' + card()
            )
        }

        if (args.length === 1) {
            // Single emoji
            s.statusLikeEmoji  = args[0]
            delete s.statusLikeEmojis
            s.autoStatusLike   = true
            await global.db.write()
            return reply(
                '✅ React emoji set to *' + args[0] + '*\n\n' + card()
            )
        }

        // Multiple emojis — store as array, pick randomly on each status
        const emojiList = args.filter(e => e.trim())
        s.statusLikeEmojis = emojiList
        s.statusLikeEmoji  = emojiList[0]
        s.autoStatusLike   = true
        await global.db.write()
        return reply(
            '✅ Emoji list set: *' + emojiList.join(' ') + '*\n' +
            '_(Bot will pick one randomly for each status)_\n\n' +
            card()
        )
    }

    // .statusinfo — show current status settings
    if (['statusinfo', 'sstatus', 'statussettings'].includes(command)) {
        if (!isOwner) return reply('❌ Owner only.')
        return reply(card())
    }
}

handle.command = [
    'sv', 'statusview', 'autoview',
    'sl', 'statuslike', 'autolike',
    'setsl', 'setslemoji', 'setstatusemoji', 'setemoji',
    'statusinfo', 'sstatus', 'statussettings'
]
handle.tags = ['settings']
module.exports = handle
