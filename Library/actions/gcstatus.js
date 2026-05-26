// Library/actions/gcstatus.js
// Replicates gifted-baileys GiftedStatus class for @whiskeysockets/baileys
// Sends WhatsApp group stories (groupStatusMessageV2) to any group JID
// Works by calling conn.relayMessage directly — no gifted-baileys required

const crypto  = require('crypto')
const axios   = require('axios')

// Minimal generateMessageID compatible with baileys format
const generateMsgId = () =>
    'BAE5' + crypto.randomBytes(4).toString('hex').toUpperCase() +
             crypto.randomBytes(4).toString('hex').toUpperCase()

// Random background color for text statuses (like WA's color picker)
const COLORS = [
    0xFF1FA8484, // green
    0xFF2C4BFF,  // blue
    0xFFD14B00,  // orange
    0xFF6B2FBB,  // purple
    0xFF0074BB,  // sky blue
    0xFFE6264D,  // red
    0xFF00796B,  // teal
]
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

// Try importing generateWAMessageContent from baileys (@whiskeysockets/baileys fork)
let generateWAMessageContent
let generateWAMessageFromContent
try {
    const tb = require('@whiskeysockets/baileys')
    generateWAMessageContent   = tb.generateWAMessageContent
    generateWAMessageFromContent = tb.generateWAMessageFromContent
} catch {}
if (!generateWAMessageContent) {
    try {
        const tb = require('@whiskeysockets/baileys')
        generateWAMessageContent   = tb.generateWAMessageContent
        generateWAMessageFromContent = tb.generateWAMessageFromContent
    } catch {}
}

/**
 * sendGroupStatus(conn, groupJid, content)
 * Sends a WhatsApp group story/status post (like a personal status, but to a group)
 *
 * @param {object} conn        — the baileys socket (conn)
 * @param {string} groupJid    — group JID  (e.g. '12345@g.us')
 * @param {object} content     — message content object:
 *   { text: '...' }                  → colored text story
 *   { image: Buffer, caption: '...' } → image story
 *   { video: Buffer, caption: '...' } → video story
 *   { audio: Buffer }                 → audio story (PTT-style)
 * @returns {Promise}
 */
const sendGroupStatus = async (conn, groupJid, content = {}) => {
    if (!conn.relayMessage) throw new Error('conn.relayMessage is not available')
    if (!groupJid || !groupJid.endsWith('@g.us')) throw new Error('groupJid must be a group JID (ends with @g.us)')

    let innerMessage

    // ── TEXT STATUS ─────────────────────────────────────────────────────────
    if (content.text && !content.image && !content.video) {
        innerMessage = {
            extendedTextMessage: {
                text:            content.text,
                backgroundArgb:  content.backgroundArgb || randomColor(),
                font:            content.font    || 0,
                textArgb:        content.textArgb || 0xFFFFFFFF,
            }
        }
    }

    // ── IMAGE STATUS ─────────────────────────────────────────────────────────
    else if (content.image) {
        if (generateWAMessageContent) {
            try {
                const full = await generateWAMessageContent(
                    { image: content.image, caption: content.caption || '' },
                    { upload: conn.waUploadToServer }
                )
                innerMessage = full.message || full
            } catch {
                innerMessage = await buildImageMessageManual(conn, content)
            }
        } else {
            innerMessage = await buildImageMessageManual(conn, content)
        }
    }

    // ── VIDEO STATUS ─────────────────────────────────────────────────────────
    else if (content.video) {
        if (generateWAMessageContent) {
            try {
                const full = await generateWAMessageContent(
                    { video: content.video, caption: content.caption || '', gifPlayback: content.gifPlayback || false },
                    { upload: conn.waUploadToServer }
                )
                innerMessage = full.message || full
            } catch {
                innerMessage = await buildVideoMessageManual(conn, content)
            }
        } else {
            innerMessage = await buildVideoMessageManual(conn, content)
        }
    }

    else {
        throw new Error('content must have text, image, or video')
    }

    const msgId = generateMsgId()
    return await conn.relayMessage(groupJid, {
        groupStatusMessageV2: {
            message: innerMessage
        }
    }, { messageId: msgId })
}

/**
 * sendStatusToGroups(conn, content, groupJids)
 * Sends a status to personal status@broadcast AND notifies each group
 * (mirrors gifted-baileys sendStatusToGroups exactly)
 *
 * @param {object} conn        — baileys socket
 * @param {object} content     — same as sendGroupStatus content
 * @param {string[]} groupJids — array of group JIDs to notify
 */
const sendStatusToGroups = async (conn, content, groupJids = []) => {
    if (!conn.relayMessage) throw new Error('conn.relayMessage not available')

    // Collect all unique user JIDs from all target groups
    const allUsers = new Set()
    const myJid    = conn.user?.id
    if (myJid) allUsers.add(myJid.split(':')[0] + '@s.whatsapp.net')

    for (const gid of groupJids) {
        try {
            const meta = await conn.groupMetadata(gid)
            for (const p of meta.participants || []) {
                allUsers.add(p.id)
            }
        } catch {}
    }
    const statusJidList = Array.from(allUsers)

    // Build the message content
    let msgContent
    if (content.text && !content.image && !content.video) {
        msgContent = {
            extendedTextMessage: {
                text:           content.text,
                backgroundArgb: content.backgroundArgb || randomColor(),
                textArgb:       0xFFFFFFFF,
            }
        }
    } else if (content.image) {
        if (generateWAMessageContent) {
            const full = await generateWAMessageContent(
                { image: content.image, caption: content.caption || '' },
                { upload: conn.waUploadToServer }
            )
            msgContent = full.message || full
        } else {
            msgContent = await buildImageMessageManual(conn, content)
        }
    } else if (content.video) {
        if (generateWAMessageContent) {
            const full = await generateWAMessageContent(
                { video: content.video, caption: content.caption || '' },
                { upload: conn.waUploadToServer }
            )
            msgContent = full.message || full
        } else {
            msgContent = await buildVideoMessageManual(conn, content)
        }
    }

    // Step 1: Post to personal status@broadcast
    const sentMsg = await conn.relayMessage('status@broadcast', msgContent, {
        messageId:      generateMsgId(),
        statusJidList
    }).catch(() => null)

    if (!sentMsg) return null

    // Step 2: Notify each group with groupStatusMentionMessage
    for (const gid of groupJids) {
        try {
            await conn.relayMessage(gid, {
                groupStatusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key:  sentMsg.key || { id: generateMsgId() },
                            type: 25
                        }
                    }
                },
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32)
                }
            }, {
                messageId: generateMsgId(),
                additionalNodes: [{
                    tag:   'meta',
                    attrs: { is_group_status_mention: 'true' }
                }]
            })
            await new Promise(r => setTimeout(r, 1500))
        } catch (e) {
            // Log but don't throw — continue for next group
        }
    }

    return sentMsg
}

// ── Internal helpers ──────────────────────────────────────────────────────────
// For when generateWAMessageContent isn't available, we send via sendMessage
// to get the uploaded URL then build the message manually
const buildImageMessageManual = async (conn, content) => {
    // Send to own DM to get upload URL (hacky but reliable)
    const myJid = conn.user?.id
    if (!myJid) throw new Error('conn.user not available')
    const sent = await conn.sendMessage(myJid, {
        image:   content.image,
        caption: content.caption || ''
    })
    const imgMsg = sent?.message?.imageMessage
    if (!imgMsg) throw new Error('Image upload failed')
    return { imageMessage: imgMsg }
}

const buildVideoMessageManual = async (conn, content) => {
    const myJid = conn.user?.id
    if (!myJid) throw new Error('conn.user not available')
    const sent = await conn.sendMessage(myJid, {
        video:   content.video,
        caption: content.caption || ''
    })
    const vidMsg = sent?.message?.videoMessage
    if (!vidMsg) throw new Error('Video upload failed')
    return { videoMessage: vidMsg }
}

// ── Media download helper (for quoted messages) ────────────────────────────────
const downloadQuotedMedia = async (conn, m) => {
    const q = m.quoted
    if (!q) return null
    const mtype = q.mtype || Object.keys(q.message || {})[0]
    const msg   = q.msg   || q.message?.[mtype] || {}
    try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const buf = await downloadMediaMessage({ key: q.key, message: q.message }, 'buffer', {})
        return { buf, mtype }
    } catch {
        return null
    }
}

module.exports = { sendGroupStatus, sendStatusToGroups, downloadQuotedMedia, generateMsgId }
