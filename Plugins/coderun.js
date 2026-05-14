'use strict'
/**
 * Code Runner Plugin — execute JS, Python, Bash snippets.
 * Commands: .run, .jsrun, .pyrun, .bashrun, .runcode
 */
const { runCode, formatRunResult, extractCode, detectLang } = require('../Library/actions/coderunner')

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner }) => {

    // ── .run [lang] <code> or quote code ─────────────────────────────────────
    if (command === 'run' || command === 'runcode' || command === 'execute') {
        if (!isOwner) return reply(`⛔ Owner only — code execution is restricted.`)

        const raw = (m.quoted?.text || m.quoted?.body || '') + (text ? '\n' + text : '')
        if (!raw.trim()) return reply(
            `❌ *Usage:* ${prefix}run [language] <code>\n\n` +
            `Supported languages: \`js\`, \`python\`, \`bash\`\n\n` +
            `*Examples:*\n` +
            `• ${prefix}run js console.log("Hello")\n` +
            `• ${prefix}run python print("Hello")\n` +
            `• Quote a code block then type ${prefix}run`
        )

        const parts = raw.trim().split(/\n/)
        let lang = 'js'
        let code = raw.trim()

        // Check if first word is a language specifier
        const firstWord = (text || '').trim().split(/\s+/)[0]?.toLowerCase()
        if (['js', 'javascript', 'node', 'python', 'py', 'bash', 'sh', 'shell'].includes(firstWord)) {
            lang = firstWord
            code = raw.replace(firstWord, '').trim()
        } else {
            lang = detectLang(raw)
        }
        code = extractCode(code) || code

        if (!code.trim()) return reply(`❌ No code found to execute.`)

        await conn.sendMessage(chat, { react: { text: '⚡', key: m.key } }).catch(() => {})
        const res = await runCode(code, lang, 15000)
        await conn.sendMessage(chat, { react: { text: res.success ? '✅' : '❌', key: m.key } }).catch(() => {})

        return reply(formatRunResult(res))
    }

    // ── .jsrun <code> ─────────────────────────────────────────────────────────
    if (command === 'jsrun') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const code = m.quoted?.text || text
        if (!code?.trim()) return reply(`❌ Usage: ${prefix}jsrun <code>\nOr quote a code block.`)
        await conn.sendMessage(chat, { react: { text: '⚡', key: m.key } }).catch(() => {})
        const res = await runCode(extractCode(code) || code, 'js', 15000)
        await conn.sendMessage(chat, { react: { text: res.success ? '✅' : '❌', key: m.key } }).catch(() => {})
        return reply(formatRunResult(res))
    }

    // ── .pyrun <code> ─────────────────────────────────────────────────────────
    if (command === 'pyrun') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const code = m.quoted?.text || text
        if (!code?.trim()) return reply(`❌ Usage: ${prefix}pyrun <code>\nOr quote a code block.`)
        await conn.sendMessage(chat, { react: { text: '🐍', key: m.key } }).catch(() => {})
        const res = await runCode(extractCode(code) || code, 'python', 20000)
        await conn.sendMessage(chat, { react: { text: res.success ? '✅' : '❌', key: m.key } }).catch(() => {})
        return reply(formatRunResult(res))
    }

    // ── .bashrun <cmd> ────────────────────────────────────────────────────────
    if (command === 'bashrun') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const code = m.quoted?.text || text
        if (!code?.trim()) return reply(`❌ Usage: ${prefix}bashrun <script or command>`)
        await conn.sendMessage(chat, { react: { text: '💻', key: m.key } }).catch(() => {})
        const res = await runCode(code, 'bash', 15000)
        await conn.sendMessage(chat, { react: { text: res.success ? '✅' : '❌', key: m.key } }).catch(() => {})
        return reply(formatRunResult(res))
    }

    // ── .review <code> — AI code review ──────────────────────────────────────
    if (command === 'review' || command === 'codereview') {
        const raw = m.quoted?.text || m.quoted?.body || text
        if (!raw?.trim()) return reply(`❌ Usage: ${prefix}review <code>\nOr quote a code message.`)
        const { generateAdvancedReply } = require('../Library/actions/beraai')
        await conn.sendMessage(chat, { react: { text: '🔍', key: m.key } }).catch(() => {})
        const prompt = `Perform a thorough senior-level code review of the following code. Identify bugs, security issues, performance problems, and style violations. Suggest specific improvements with code examples where needed.\n\nCode:\n\`\`\`\n${raw.slice(0, 3000)}\n\`\`\``
        const result = await generateAdvancedReply(prompt, chat, conn, m)
        await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        return reply(result.reply || '❌ Review failed.')
    }
}

handle.command = ['run', 'runcode', 'execute', 'jsrun', 'pyrun', 'bashrun', 'review', 'codereview']
handle.tags = ['developer']
module.exports = handle
