'use strict'

// People memory commands (Library/actions/people-memory.js):
//   .memory            — what Bera AI remembers about YOU
//   .memory <number>   — owner only: what it remembers about that person
//   .memory wipe <number> — owner only: delete that person's facts
//   .forgetme          — delete everything stored about you
// Facts are learned automatically from ChatBera conversations (durable
// things a person states about themselves) and recalled into replies.

const pm = require('../Library/actions/people-memory')

const toJid = (raw) => {
    let digits = String(raw || '').replace(/\D/g, '')
    if (!digits) return null
    if (digits.startsWith('0')) digits = '254' + digits.slice(1)
    return digits + '@s.whatsapp.net'
}

const showFacts = async (reply, jid, altJid, whose) => {
    const facts = pm.getFacts(jid, altJid)
    if (!facts.length) return reply(`🧠 I don't have anything stored about ${whose} yet.`)
    const lines = facts.map(f => `• ${f.fact}${f.at ? ` _(learned ${f.at})_` : ''}`)
    return reply(`🧠 *What I remember about ${whose}:*\n${lines.join('\n')}`)
}

const handle = async (m, { conn, text, reply, command, sender, isOwner }) => {
    const altJid = m.key?.remoteJidAlt

    if (command === 'forgetme') {
        const removed = pm.forgetPerson(sender, altJid)
        return reply(removed
            ? '🧠 Done — I have deleted everything I remembered about you.'
            : '🧠 There was nothing stored about you to delete.')
    }

    if (command === 'memory') {
        const args = String(text || '').trim()
        if (/^wipe\s+/i.test(args)) {
            if (!isOwner) return reply('🔒 Only the owner can wipe someone else\'s memory.')
            const jid = toJid(args.replace(/^wipe\s+/i, ''))
            if (!jid) return reply('❓ Say it like this:\n*.memory wipe 0712345678*')
            const removed = pm.forgetPerson(jid)
            return reply(removed ? `🧠 Memory wiped for +${jid.split('@')[0]}.` : '🧠 Nothing was stored for that number.')
        }
        if (args) {
            if (!isOwner) return reply('🔒 You can only view your own memory — send *.memory* with nothing after it.')
            const jid = toJid(args)
            if (!jid) return reply('❓ Say it like this:\n*.memory 0712345678*')
            return showFacts(reply, jid, null, `+${jid.split('@')[0]}`)
        }
        return showFacts(reply, sender, altJid, 'you')
    }
}

handle.command = ['memory', 'forgetme']
handle.tags = ['memory']

module.exports = handle
