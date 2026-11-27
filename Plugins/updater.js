/**
 * Bera AI — Updater commands (owner only)
 * Thin adapter over Library/actions/self-update.js:
 *   .checkupdate — is a newer commit on GitHub main?
 *   .update      — download + apply it, then restart
 *   .restart     — restart the bot (systemd brings it back)
 * The agent reaches the same core via "agent, update yourself" /
 * "agent, restart" (bot_update / bot_restart in agent-dispatch).
 */

const { checkUpdate, applyUpdate, restartBot } = require('../Library/actions/self-update')

const handle = async (m, { conn, reply, command, isOwner, chat }) => {
    const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})

    if (!isOwner) {
        await react('❌')
        return reply('❌ Owner only command!')
    }

    if (command === 'restart' || command === 'reboot') {
        await react('🔁')
        await reply('🔁 *Restarting Bera AI...*\n\nI will be back in a few seconds.')
        restartBot(1500)
        return
    }

    if (command === 'checkupdate' || command === 'updatecheck') {
        await react('🔍')
        const check = await checkUpdate()
        if (!check.ok) {
            await react('❌')
            return reply('❌ Could not check for updates: ' + check.error)
        }
        const date = check.date ? new Date(check.date).toLocaleString() : '—'
        if (!check.updateAvailable) {
            await react('✅')
            return reply('✅ *Bera AI is already on the latest version!*\n\n🔖 *Commit:* `' + check.latest.slice(0, 7) + '`\n📅 *Date:* ' + date + '\n💬 *Msg:* ' + check.message)
        }
        await react('🆕')
        return reply(
            '🆕 *Update Available!*\n\n' +
            '👤 *Author:* ' + check.author + '\n' +
            '📅 *Date:* ' + date + '\n' +
            '💬 *Message:* ' + check.message + '\n' +
            '🔖 *Hash:* `' + check.latest.slice(0, 7) + '`' +
            (check.dirtyCount ? `\n\n⚠️ ${check.dirtyCount} local file(s) differ from git — updating will overwrite them.` : '') +
            '\n\nType *.update* to install it now.'
        )
    }

    if (command === 'update' || command === 'updatenow' || command === 'updt' || command === 'sync') {
        await react('🔍')
        await reply('🔍 Checking for updates...')
        const result = await applyUpdate({ notify: (text) => reply(text) })
        if (!result.ok) {
            await react('❌')
            return reply('❌ Update failed: ' + result.error + '\n\nPlease redeploy manually from GitHub.')
        }
        if (!result.updateAvailable) {
            await react('✅')
            return reply('✅ Already on the latest version! No update needed.')
        }
        await react('✅')
        await reply('✅ *Update Complete!*\n\n🔖 Now on: `' + result.latest.slice(0, 7) + '`' +
            (result.npm === true ? '\n📦 Dependencies installed.' : '') +
            (result.npm === false ? '\n⚠️ Dependency install failed — check npm before relying on new code.' : '') +
            '\n\n🔁 Bot is restarting...')
        restartBot(2000)
    }
}

handle.command = ['update', 'updatenow', 'updt', 'sync', 'checkupdate', 'updatecheck', 'restart', 'reboot']
handle.tags    = ['owner', 'system']
handle.help    = ['update — Update bot to latest GitHub version', 'checkupdate — Check if update is available', 'restart — Restart the bot']

module.exports = handle
