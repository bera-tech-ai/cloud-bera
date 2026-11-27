'use strict'

// Library/lib/agent-dispatch.js — Spec §2 / §3 (Phase 2).
//
// One dispatcher for `.agent <task>` and natural-language routing, with
// identical tools, permissions and confirmation behaviour for both paths.
// Callers pass `path` ('.agent' | 'natural') purely for logging; the
// handling is the same. Returns true when the intent was handled (callers
// fall through to the generic agent/chat path when it returns false).
//
// Confirmation note: staged send/forward actions still use the in-memory
// stage() on main. On rebase onto PR #2, move staging to the persistent
// token store there — the stage/consume interface is unchanged.

const waActions = require('./wa-actions')
const referents = require('./referents')
const { PIN_ACCEPTED_MESSAGE, BAILEYS_ACCEPTED_MESSAGE, groupPermissionFailure, interpretBaileysError } = require('./baileys-errors')

const HANDLED_INTENTS = new Set([
    'react_msg', 'remove_reaction', 'pin_msg', 'unpin_msg', 'edit_msg',
    'delete_msg', 'delete_this', 'poll_create', 'group_poll',
    'forward_msg', 'send_pm', 'remember_name', 'bot_update', 'bot_restart',
])

const CLOSE_FRIENDS_RE = /\b(close[- ]?friends?|close friends|restricted (audience|status)|only (my )?close friends)\b/i
const isCloseFriendsRequest = (text) => CLOSE_FRIENDS_RE.test(String(text || ''))

const CLOSE_FRIENDS_UNSUPPORTED = waActions.CLOSE_FRIENDS_UNSUPPORTED

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|❤️|❤/u
const emojiFor = (text) => {
    const words = String(text || '').toLowerCase()
    if (/\b(remove|clear|take off|delete)\b.{0,20}\b(reaction|react)\b/.test(words) || /\bremove (my )?reaction\b/.test(words)) return ''
    if (String(text || '').includes('❤️')) return '❤️'
    const match = String(text || '').match(EMOJI_RE)
    if (match) return match[0]
    if (/\bheart|love\b/.test(words)) return '❤️'
    if (/\b(like|thumbs[- ]?up|thumbs up)\b/.test(words)) return '👍'
    if (/\b(laugh|laughing|haha|funny)\b/.test(words)) return '😂'
    if (/\b(sad|cry|crying)\b/.test(words)) return '😢'
    if (/\b(wow|surpris|amazing)\b/.test(words)) return '😮'
    if (/\b(thank|pray|please)\b/.test(words)) return '🙏'
    return '👍'
}

const parseDuration = (text) => {
    const match = String(text || '').match(/(\d+)\s*(day|days|d)\b/i)
    if (match) return Math.min(30, Math.max(1, Number(match[1]))) * 86400
    if (/30d/.test(text)) return 2592000
    if (/7d|week/.test(text)) return 604800
    if (/1d|day/.test(text)) return 86400
    return 604800
}

// "Q, A, B" / "Q | A | B" / "Q? A | B" -> { question, options }
const parsePoll = (text) => {
    const raw = String(text || '')
        .replace(/\b(create|make|start|run)\s+(a\s+)?(poll|vote|survey)\s*:?\s*/i, '')
        .replace(/^\s*(poll|vote|survey)\s*:?\s*/i, '')
        .trim()
    const parts = raw.split(/[|]/).map(s => s.trim()).filter(Boolean)
    let question
    let options
    if (parts.length >= 2) {
        // "Best day? Friday | Saturday" — the first option may follow the
        // question mark inside the first |-separated segment.
        const qm = parts[0].match(/^(.+\?)\s+(.+)$/)
        if (qm) { question = qm[1]; options = [qm[2], ...parts.slice(1)] }
        else { question = parts[0]; options = parts.slice(1) }
    } else {
        const split = raw.split(/,\s+(?=[A-Z0-9])|;\s*/).map(s => s.trim()).filter(Boolean)
        question = (split[0] || '').replace(/\?$/, '')
        options = split.slice(1)
    }
    return { question: (question || '').trim(), options: (options || []).map(o => o.replace(/[?.]$/, '').trim()).filter(Boolean) }
}

const parseTargets = (text, m) => {
    const specs = []
    const numbers = [...String(text || '').matchAll(/\b(\d{7,15})\b/g)].map(m2 => m2[1])
    for (const n of numbers) specs.push(n)
    if (/\b(tag|tagged|mention|mentioned)\b/i.test(text)) specs.push('tag')
    if (/\b(this\s+(pm|chat)|current\s+(pm|chat)|private chat)\b/i.test(text)) specs.push('this pm')
    if (/\b(him|her|them|that person)\b/i.test(text)) specs.push('him')
    if (/\breply|quoted|replied\b/i.test(text)) specs.push('reply')
    // Named recipient: "forward this to babe" / "send hello to mum".
    // Keywords that are not names are excluded; resolution happens in
    // wa-actions.resolveTarget via the referents name directory.
    const nameMatch = String(text || '').match(/\bto\s+([A-Za-z][A-Za-z' -]{1,30})/i)
    if (nameMatch) {
        const name = nameMatch[1].trim().replace(/\s+(please|now|for me|asap)$/i, '').trim()
        const lowerName = name.toLowerCase()
        const nonNames = new Set(['reply', 'quoted', 'replied', 'tag', 'tagged', 'mention', 'mentioned', 'him', 'her', 'them', 'this pm', 'current pm', 'private chat', 'me', 'myself', 'owner', 'the group', 'this group', 'everyone', 'all', 'my phone', 'my number'])
        if (name && !nonNames.has(lowerName) && !/^\d+$/.test(name)) specs.push(`name:${name}`)
    }
    return [...new Set(specs)]
}

const log = (path, intent, extra = '') => {
    try { console.log(`[agent-dispatch] path=${path} intent=${intent}${extra ? ` ${extra}` : ''}`) } catch {}
}

// ctx: { conn, sender, isOwner, access, chat, m, intent, text, reply, react, path }
// access: getAccessContext() result (isSenderAdmin/isBotAdmin/isGroup).
const dispatch = async (ctx) => {
    const { conn, sender, isOwner, access, chat, m, intent, text = '' } = ctx || {}
    const reply = ctx.reply || (async () => {})
    const react = ctx.react || (async () => {})
    const path = ctx.path || 'natural'
    if (!HANDLED_INTENTS.has(intent)) return false
    log(path, intent)

    const groupFailure = (actionLabel) => reply(groupPermissionFailure(access, actionLabel))

    try {
        // ── React / remove reaction (§7) ───────────────────────────────
        if (intent === 'react_msg' || intent === 'remove_reaction') {
            const key = m?.quoted?.key || referents.resolveMessageKey(chat, 'last message', m?.key, m).key || m?.key
            if (!key) { await reply('❓ Quote the message to react to, or react to the last message.'); return true }
            const emoji = intent === 'remove_reaction' ? '' : emojiFor(text)
            const result = await waActions.execute(conn, sender, { type: 'react', chat, key, emoji })
            if (!result.ok) { await reply(`❌ Reaction failed: ${result.error}`); return true }
            await reply(emoji ? `✅ Reaction request accepted by Baileys: ${emoji}` : '✅ Reaction removed. Request accepted by Baileys.')
            return true
        }

        // ── Pin / unpin (§8) ───────────────────────────────────────────
        if (intent === 'pin_msg' || intent === 'unpin_msg') {
            const isUnpin = intent === 'unpin_msg'
            if (m?.isGroup && access && (!access.isBotAdmin || (!access.isSenderAdmin && !isOwner))) {
                await groupFailure(isUnpin ? 'unpin this message' : 'pin this message')
                return true
            }
            const key = m?.quoted?.key || referents.resolveMessageKey(chat, 'last message', m?.key, m).key || m?.key
            if (!key) { await reply('❓ Quote the message to pin or unpin.'); return true }
            const result = await waActions.execute(conn, sender, {
                type: isUnpin ? 'unpin' : 'pin', chat, key,
                ...(isUnpin ? {} : { time: parseDuration(text) }),
            })
            if (!result.ok) { await reply(`❌ Failed to ${isUnpin ? 'unpin' : 'pin'}: ${interpretBaileysError(result.error, { access, actionLabel: isUnpin ? 'unpin this message' : 'pin this message' })}`); return true }
            await reply(isUnpin ? '✅ Unpinned successfully as requested.' : PIN_ACCEPTED_MESSAGE)
            return true
        }

        // ── Edit (§9, bot-authored only) ───────────────────────────────
        if (intent === 'edit_msg') {
            const target = m?.quoted
            const key = target?.key || referents.resolveMessageKey(chat, 'the message i just sent', m?.key, m).key
            const replacement = String(text || '')
                .replace(/^\s*(edit|change|correct|update)\b/i, '')
                .replace(/^\s*(this|that|my|the)\s*(last\s+)?(message|text|msg)?\s*(to|:)?\s*/i, '')
                .trim()
            if (!key) { await reply('❓ Quote the bot message to edit, or say "edit the message I just sent".'); return true }
            if (!replacement) { await reply('❓ Provide the replacement text.'); return true }
            const result = await waActions.execute(conn, sender, { type: 'edit', chat, key, text: replacement })
            if (!result.ok) { await reply(`❌ Edit failed: ${result.error}`); return true }
            await reply(`✅ ${BAILEYS_ACCEPTED_MESSAGE}`)
            return true
        }

        // ── Delete (§10, user-vs-bot wording) ──────────────────────────
        if (intent === 'delete_msg' || intent === 'delete_this') {
            const key = m?.quoted?.key || referents.resolveMessageKey(chat, 'last message', m?.key, m).key
            if (!key) { await reply('❓ Quote the message to delete.'); return true }
            const isOwn = Boolean(key.fromMe)
            if (!isOwn && m?.isGroup && access && (!access.isBotAdmin || (!access.isSenderAdmin && !isOwner))) {
                await groupFailure('delete this message')
                return true
            }
            if (!isOwn && !m?.isGroup) {
                await reply('❌ I can delete my own message, or a group admin can authorize deletion of another message.')
                return true
            }
            const result = await waActions.execute(conn, sender, { type: 'delete', chat, key })
            if (!result.ok) { await reply(`❌ Could not delete: ${interpretBaileysError(result.error, { access, actionLabel: 'delete this message' })}`); return true }
            await react('🗑️')
            return true
        }

        // ── Poll (§11, native, acceptance-checked) ─────────────────────
        if (intent === 'poll_create' || intent === 'group_poll') {
            const { question, options } = parsePoll(text)
            if (!question || options.length < 2) {
                await reply('❓ Format: *create a poll: Best day? Friday | Saturday | Sunday*\nNeed a question and at least 2 options (max 12).')
                return true
            }
            const result = await waActions.execute(conn, sender, { type: 'poll', chat, question, options })
            if (!result.ok) { await reply(`❌ Poll failed: ${result.error}`); return true }
            await reply(`✅ Poll request accepted by Baileys: *${question}*`)
            return true
        }

        // ── Remember a name ("remember babe is 254712345678") ─────────────
        // Teaches the bot a contact-name alias, since it cannot read the
        // user's phone contacts. Stored in db.data.nameAliases when available.
        if (intent === 'remember_name') {
            const match = String(text || '').match(/\bremember\s+([A-Za-z][A-Za-z' -]{1,30})\s+(?:is|=|as)\s+\+?(\d{7,15})\b/i)
            if (!match) { await reply('❓ Say it like this:\\n*remember babe is 254712345678*'); return true }
            const [, name, number] = match
            try {
                const target = await waActions.resolveTarget(conn, m, number, { allowSpecial: true })
                referents.rememberAlias(name.trim(), target.jid)
                await reply(`✅ I'll remember *${name.trim()}* as +${target.number}. You can now say "forward this to ${name.trim()}" or "send hello to ${name.trim()}".`)
            } catch (error) {
                await reply(`❌ Could not save that: ${error.message}`)
            }
            return true
        }

        // ── Forward (§12, immediate — no confirmation) ─────────────────────
        // Owner decision 2026-11-24 (live test): forwarding runs straight
        // away on the message the user replied to, with a short confirmation
        // reply afterwards. This deliberately bypasses the stage() + token
        // flow that `send` still uses — a forward is the user's own quoted
        // message going to a named recipient, and the owner found the
        // preview/token step annoying. Ambiguity/unknown recipients still
        // error out in resolveTarget above, so nothing is ever sent blind.
        if (intent === 'forward_msg') {
            const qMsg = m?.quoted?.message ? m.quoted : null
            if (!qMsg) { await reply('❓ Quote the message you want me to forward, then say:\n*forward this to 254712345678*'); return true }
            const specs = parseTargets(text, m)
            if (!specs.length) { await reply('❓ Specify a number, tag, or current private chat to forward to.'); return true }
            const targets = []
            const labels = []
            for (const spec of specs) {
                try {
                    const target = await waActions.resolveTarget(conn, m, spec, { allowSpecial: true })
                    targets.push(target)
                    labels.push(spec.startsWith('name:') ? spec.slice(5) : `+${target.number}`)
                } catch (error) {
                    await reply(`❌ Failed: ${error.message}`)
                    return true
                }
            }
            try {
                const result = targets.length === 1
                    ? await waActions.execute(conn, sender, { type: 'forward', jid: targets[0].jid, message: m.quoted })
                    : await waActions.execute(conn, sender, { type: 'forward', destinations: targets.map(t => t.jid), message: m.quoted })
                if (result && result.ok === false) { await reply(`❌ Failed to forward: ${result.error || 'Baileys did not accept the forward.'}`); return true }
            } catch (error) {
                await reply(`❌ Failed to forward: ${error.message}`)
                return true
            }
            await reply(`✅ Forwarded to ${labels.join(', ')} successfully.`)
            return true
        }

        // ── Send (§4, confirmation-gated preview) ──────────────────────
        if (intent === 'send_pm') {
            if (isCloseFriendsRequest(text)) { await reply(`❌ ${CLOSE_FRIENDS_UNSUPPORTED}`); return true }
            const specs = parseTargets(text, m)
            const targetSpec = specs[0] || null
            let msg = String(text || '')
                .replace(/\b(send|message|text|tell|forward)\b/gi, '')
                .replace(/\+?\d{7,15}/g, '')
                .replace(/\b(to|him|her|them|that person|reply|quoted|tagged|this pm|current pm|private chat)\b/gi, '')
                .replace(/^["'](.+)["']$/, '$1').trim()
            if (!targetSpec) { await reply('❓ Specify a number, tag, reply, or current private chat.'); return true }
            if (!msg) { await reply('❓ What message should I send?\nExample: *send "hello brother" to 254712345678*'); return true }
            try {
                const target = await waActions.resolveTarget(conn, m, targetSpec, { allowSpecial: true })
                const token = waActions.stage(sender, { type: 'send', jid: target.jid, number: target.number, text: msg })
                // The preview carries native Yes/No buttons; a tap runs
                // the same token path as typing ".wact confirm <token>".
                const previewText = `⏳ Preview only — nothing was sent.\nTarget: ${target.jid}\nMessage: ${msg}\nToken: ${token}\nReply: .wact confirm ${token} within 2 minutes to send it.`
                try {
                    const { sendBtn } = require('../actions/btns')
                    await sendBtn(conn, chat, { text: previewText, footer: 'Bera AI', buttons: waActions.confirmationButtons(token) })
                } catch { await reply(previewText) }
            } catch (error) {
                await react('❌')
                await reply(`❌ Failed to send: ${error.message}`)
            }
            return true
        }

        if (intent === 'bot_restart' || intent === 'bot_update') {
            // Owner-only: the bot updates/restarts itself for nobody else.
            if (!isOwner) { await reply('⛔ Updating or restarting the bot is owner-only.'); return true }
            const { applyUpdate, restartBot } = require('../actions/self-update')
            if (intent === 'bot_restart') {
                await reply('🔁 Restarting Bera AI… I will be back in a few seconds.')
                restartBot(1500)
                return true
            }
            const result = await applyUpdate({ notify: (text) => reply(text) })
            if (!result.ok) { await reply(`❌ Update failed: ${result.error}`); return true }
            if (!result.updateAvailable) { await reply('✅ Bera AI is already on the latest version.'); return true }
            await reply(`✅ *Update complete* — now on \`${String(result.latest).slice(0, 7)}\`.` +
                (result.npm === false ? '\n⚠️ Dependency install failed — check npm before relying on new code.' : '') +
                '\n\n🔁 Restarting…')
            restartBot(2000)
            return true
        }
    } catch (error) {
        await reply(`❌ ${interpretBaileysError(error, { access, actionLabel: intent })}`)
        return true
    }
    return false
}

module.exports = {
    HANDLED_INTENTS,
    dispatch,
    parsePoll,
    parseDuration,
    parseTargets,
    emojiFor,
    isCloseFriendsRequest,
    CLOSE_FRIENDS_UNSUPPORTED,
}
