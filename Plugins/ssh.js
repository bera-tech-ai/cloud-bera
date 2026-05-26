'use strict'
/**
 * SSH Plugin — manage SSH server connections and run remote commands.
 * Commands: .sshconnect, .sshexec, .sshprofile, .sshclose
 */
const { sshExec, formatSshResult, saveProfile, getProfile, deleteProfile } = require('../Library/actions/ssh')

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner }) => {

    // ── .sshprofile host user pass [port] — save an SSH profile ──────────────
    if (command === 'sshprofile') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(
            `❌ Usage: ${prefix}sshprofile <host> <user> <password> [port]\n` +
            `Example: ${prefix}sshprofile 192.168.1.10 root mypassword 22`
        )
        const parts = text.trim().split(/\s+/)
        if (parts.length < 3) return reply(`❌ Need at least: host, username, password`)
        const [host, username, password, port] = parts
        saveProfile(chat, { host, username, password, port: parseInt(port) || 22 })
        return reply(
            `✅ *SSH Profile saved for this chat*\n` +
            `🖥️ Host: \`${host}:${port || 22}\`\n` +
            `👤 User: \`${username}\`\n` +
            `🔑 Auth: password\n\n` +
            `_Now use ${prefix}sshexec <command> to run remote commands._`
        )
    }

    // ── .sshexec <command> — run a command on the saved SSH server ────────────
    if (command === 'sshexec' || command === 'sshrun') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}sshexec <shell command>`)
        const profile = getProfile(chat)
        if (!profile) return reply(
            `❌ No SSH profile for this chat.\nSet one first with ${prefix}sshprofile <host> <user> <pass>`
        )

        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const res = await sshExec(profile, text.trim())
        const formatted = formatSshResult(res)
        await conn.sendMessage(chat, { react: { text: res.success ? '✅' : '❌', key: m.key } }).catch(() => {})
        return reply(
            `╭══〘 *🖥️ SSH EXEC* 〙═⊷\n` +
            `┃ Host: \`${profile.host}:${profile.port}\`\n` +
            `┃ CMD:  \`${text.slice(0, 60)}\`\n` +
            `┃\n` +
            formatted + '\n' +
            `╰══════════════════⊷`
        )
    }

    // ── .sshclose — remove the SSH profile for this chat ─────────────────────
    if (command === 'sshclose' || command === 'sshdisconnect') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const profile = getProfile(chat)
        if (!profile) return reply(`❌ No SSH profile found for this chat.`)
        deleteProfile(chat)
        return reply(`✅ SSH profile cleared for this chat.`)
    }

    // ── .sshinfo — show current SSH profile ──────────────────────────────────
    if (command === 'sshinfo') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const profile = getProfile(chat)
        if (!profile) return reply(`❌ No SSH profile set. Use ${prefix}sshprofile first.`)
        return reply(
            `╭══〘 *🖥️ SSH PROFILE* 〙═⊷\n` +
            `┃ Host: \`${profile.host}:${profile.port}\`\n` +
            `┃ User: \`${profile.username}\`\n` +
            `┃ Auth: ${profile.privateKey ? '🔑 Private Key' : '🔒 Password'}\n` +
            `╰══════════════════⊷`
        )
    }
}

handle.command = ['sshprofile', 'sshexec', 'sshrun', 'sshclose', 'sshdisconnect', 'sshinfo']
handle.tags = ['developer']
module.exports = handle
