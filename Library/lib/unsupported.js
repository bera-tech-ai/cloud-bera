'use strict'

// Phase 4 — one "unsupported" response format (spec §25).
//
// "When an operation is unavailable, explain: what is unsupported, why it
// is unsupported, what alternative is available, whether the user can retry
// with a different target or command."
//
// Before this module, unsupported-operation replies were ad hoc: some
// commands said "disabled", some failed silently, and the deleted-message /
// view-once tools actively implied the opposite — that any deleted message
// or view-once media could be recovered. Every unsupported path must now go
// through unsupportedResponse() so the user always gets the same four parts
// and the bot never claims an impossible capability.

const { formatBeraCard } = require('./bera-card')

// All four fields are required: callers must think about the alternative
// and the retry, not just the refusal.
const unsupportedResponse = ({ what, why, alternative, retry } = {}) => {
    for (const [name, value] of [['what', what], ['why', why], ['alternative', alternative], ['retry', retry]]) {
        if (!value || !String(value).trim()) throw new Error(`Unsupported response needs "${name}".`)
    }
    const text =
        `❌ Unsupported: ${String(what).trim()}\n` +
        `Why: ${String(why).trim()}\n` +
        `Alternative: ${String(alternative).trim()}\n` +
        `Retry: ${String(retry).trim()}`
    return { what, why, alternative, retry, text, card: formatBeraCard(text, { type: 'error', title: 'UNSUPPORTED', subtitle: 'WHATSAPP LIMIT' }) }
}

const DELETED_RECOVERY = () => unsupportedResponse({
    what: 'Recovering deleted WhatsApp messages.',
    why: 'WhatsApp does not offer a way to fetch a message after the sender deletes it. Bera can only show messages it already received and stored before they were deleted — it cannot recover anything it never saw, and it cannot fetch deleted content from WhatsApp.',
    alternative: 'Ask the sender to resend the message, or check the chat while the message is still there.',
    retry: 'No — retrying will not recover a deleted message. Use .deleted clear to drop the local log for this chat.'
})

const VIEWONCE_RECOVERY = () => unsupportedResponse({
    what: 'Opening or re-sending view-once media.',
    why: 'View-once media is designed to be seen once. Bera can only open view-once media it received itself while it was still viewable — it cannot fetch view-once media after it was opened, expired, or deleted, and it cannot recover media from a message it never received.',
    alternative: 'Ask the sender to send the photo or video again as a normal message.',
    retry: 'No — retrying will not bring back expired or already-opened view-once media.'
})

const CHANNEL_DISCOVERY = () => unsupportedResponse({
    what: 'Discovering or searching WhatsApp channels.',
    why: 'The installed Baileys runtime exposes no channel discovery or search API — channels can only be opened when their exact invite link or channel ID is already known.',
    alternative: 'Use .channel info <channel ID or invite link> for a channel you already know, or open the channel in WhatsApp and share its link.',
    retry: 'Yes — retry once you have the channel ID or invite link.'
})

const CHANNEL_POLLS = () => unsupportedResponse({
    what: 'Creating or voting in channel polls.',
    why: 'The installed Baileys runtime exposes no channel poll API, and a native poll sent to a channel has not been verified against WhatsApp.',
    alternative: 'Create the poll in a group with .poll, or post the question as a normal channel post with .channel post.',
    retry: 'No — this needs a Baileys version that adds channel polls. It is recorded as unsupported, not attempted.'
})

const CHANNEL_SCHEDULED_POSTS = () => unsupportedResponse({
    what: 'Scheduling a channel post.',
    why: 'The installed Baileys runtime exposes no scheduled channel-post API.',
    alternative: 'Post now with .channel post, or set a reminder with .remind and post when it fires.',
    retry: 'Yes — retry with .channel post when you are ready to post immediately.'
})

const CHANNEL_REPORT_SPAM = () => unsupportedResponse({
    what: 'Reporting or blocking a channel as spam.',
    why: 'The installed Baileys runtime exposes no report/spam API for channels.',
    alternative: 'Report or block the channel from inside WhatsApp (channel info → Report).',
    retry: 'No — this must be done in the WhatsApp app.'
})

module.exports = {
    unsupportedResponse,
    DELETED_RECOVERY,
    VIEWONCE_RECOVERY,
    CHANNEL_DISCOVERY,
    CHANNEL_POLLS,
    CHANNEL_SCHEDULED_POSTS,
    CHANNEL_REPORT_SPAM
}
