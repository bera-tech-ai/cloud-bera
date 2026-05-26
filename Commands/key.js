const { generateKey, registerKey, validateKey, revokeKey, extendKey, listKeys } = require('../Auth')
const moment = require('moment-timezone')

const handle = async (m, { conn, text, reply, prefix, command, isOwner }) => {

    if (command === 'genkey') {
        if (!isOwner) return reply(`⛔ Owner only command.`)
        if (!text) return reply(
            `╭══〘 *🔑 KEY GENERATOR* 〙═⊷\n` +
            `┃❍ Usage: ${prefix}genkey <number> <days>\n` +
            `┃❍ Example: ${prefix}genkey 628123456789 30\n` +
            `┃❍ Days is optional (default: 30)\n` +
            `╰══════════════════⊷`
        )
        const args = text.trim().split(/\s+/)
        const phoneNumber = args[0].replace(/[^0-9]/g, '')
        const days = parseInt(args[1]) || 30
        if (!phoneNumber) return reply(`❌ Invalid phone number.`)
        const { key } = generateKey(phoneNumber, days)
        await registerKey(key, phoneNumber, days)
        const expiry = moment(Date.now() + days * 86400000).format('DD MMM YYYY')
        return reply(
            `╭══〘 *🔑 KEY GENERATED* 〙═⊷\n` +
            `┃❍ *Key:* \`${key}\`\n` +
            `┃❍ *Number:* ${phoneNumber}\n` +
            `┃❍ *Duration:* ${days} days\n` +
            `┃❍ *Expires:* ${expiry}\n` +
            `┃\n` +
            `┃ Share this key with the user.\n` +
            `┃ They activate it with:\n` +
            `┃ ${prefix}activate ${key}\n` +
            `╰══════════════════⊷`
        )
    }

    if (command === 'activate') {
        if (!text) return reply(`❌ Please provide your key.\n\nUsage: ${prefix}activate <KEY>`)
        const key = text.trim().toUpperCase()
        const phoneNumber = (m.sender || '').split('@')[0].split(':')[0]
        const result = validateKey(key, phoneNumber)
        if (!result.valid) return reply(
            `╭══〘 *🔑 ACTIVATION FAILED* 〙═⊷\n` +
            `┃❍ ❌ ${result.reason}\n` +
            `┃❍ Contact the owner for a valid key.\n` +
            `╰══════════════════⊷`
        )
        const expiry = moment(result.expiry).format('DD MMM YYYY, HH:mm')
        return reply(
            `╭══〘 *🔑 ACTIVATED* 〙═⊷\n` +
            `┃❍ ✅ Your key is valid!\n` +
            `┃❍ *Expires:* ${expiry}\n` +
            `┃❍ You now have full access to *Bera Bot*.\n` +
            `╰══════════════════⊷`
        )
    }

    if (command === 'revokekey') {
        if (!isOwner) return reply(`⛔ Owner only command.`)
        if (!text) return reply(`❌ Usage: ${prefix}revokekey <KEY>`)
        const key = text.trim().toUpperCase()
        const success = await revokeKey(key)
        return reply(success ? `✅ Key \`${key}\` revoked.` : `❌ Key not found.`)
    }

    if (command === 'extendkey') {
        if (!isOwner) return reply(`⛔ Owner only command.`)
        const args = text?.trim().split(/\s+/) || []
        if (args.length < 2) return reply(`❌ Usage: ${prefix}extendkey <KEY> <days>`)
        const key = args[0].toUpperCase()
        const days = parseInt(args[1])
        if (isNaN(days)) return reply(`❌ Invalid number of days.`)
        const success = await extendKey(key, days)
        return reply(success ? `✅ Key \`${key}\` extended by ${days} days.` : `❌ Key not found.`)
    }

    if (command === 'listkeys') {
        if (!isOwner) return reply(`⛔ Owner only command.`)
        const keys = listKeys()
        if (keys.length === 0) return reply(`📭 No keys generated yet.\n\nUse ${prefix}genkey to create one.`)
        const lines = keys.map(k => {
            const status = !k.active ? '🔴 Revoked' : Date.now() > k.expiry ? '🟡 Expired' : '🟢 Active'
            const expDate = moment(k.expiry).format('DD/MM/YYYY')
            return `┃ \`${k.key}\`\n┃ 📱 ${k.phoneNumber} | ${status} | exp: ${expDate}`
        }).join('\n┃\n')
        return reply(
            `╭══〘 *🔑 KEY LIST* 〙═⊷\n` +
            `┃❍ Total: ${keys.length}\n` +
            `┃\n` +
            lines + '\n' +
            `╰══════════════════⊷`
        )
    }

    if (command === 'checkkey') {
        const phoneNumber = (m.sender || '').split('@')[0].split(':')[0]
        const allKeys = listKeys()
        const myKey = allKeys.find(k => k.phoneNumber === phoneNumber && k.active && Date.now() < k.expiry)
        if (!myKey) return reply(
            `╭══〘 *🔑 KEY STATUS* 〙═⊷\n` +
            `┃❍ ❌ No active key found for your number.\n` +
            `┃❍ Contact the bot owner to get a key.\n` +
            `╰══════════════════⊷`
        )
        const expiry = moment(myKey.expiry).format('DD MMM YYYY, HH:mm')
        return reply(
            `╭══〘 *🔑 KEY STATUS* 〙═⊷\n` +
            `┃❍ ✅ Key Active\n` +
            `┃❍ *Key:* \`${myKey.key}\`\n` +
            `┃❍ *Expires:* ${expiry}\n` +
            `╰══════════════════⊷`
        )
    }
}

handle.command = ['genkey', 'activate', 'revokekey', 'extendkey', 'listkeys', 'checkkey']
handle.tags = ['key']

module.exports = handle
