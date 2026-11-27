'use strict'

// ── People memory ────────────────────────────────────────────────────────────
// Bera AI already had a per-CHAT key/value memory the agent could write
// with tools (beraai.js MEMORY → db.data.agentMemoryState), but nothing
// ever learned automatically from ordinary conversation, and people had
// no way to see or delete what was stored. This module adds the missing
// loop for Bera AI's conversations — the Handler wires it for
// ChatBera, and generateAdvancedReply wires it for the agent:
//
//   LEARN  after a ChatBera reply is sent, the person's message is run
//          through a strict extraction call: only durable facts the
//          person states about THEMSELVES (name, home area, work,
//          business, preferences, important dates). Facts are stored
//          with the date learned, in db.data.peopleMemory[<person JID>].
//   RECALL the stored facts are injected into the reply prompt
//          ("Facts I remember about this person:") so replies can use
//          them naturally.
//   INSPECT / FORGET  .memory shows a person their own facts (the owner
//          can view/wipe anyone's); .forgetme deletes the sender's.
//
// Rules that keep this trustworthy:
// - Facts only, each one traceable to something the person actually
//   said — the extractor is told to return [] rather than guess.
// - Keyed by PERSON (sender JID), not by chat, so it follows them
//   across PMs and groups; the alternate JID form (LID vs phone) is
//   checked on read so the same person is not split in two.
// - Caps: 25 facts per person, 160 chars per fact, 3 new per message.
// - Kill switch: BERA_PEOPLE_MEMORY=0 disables learning and recall.

const MAX_FACTS = 25
const MAX_FACT_LEN = 160
const MAX_NEW_PER_MESSAGE = 3

const enabled = () => process.env.BERA_PEOPLE_MEMORY !== '0'

const store = () => {
    const data = global.db?.data
    if (!data) return null
    if (!data.peopleMemory || typeof data.peopleMemory !== 'object') data.peopleMemory = {}
    return data.peopleMemory
}

const persist = () => {
    try { Promise.resolve(global.db?.write?.()).catch(() => {}) } catch {}
}

const candidateKeys = (jid, altJid) => [...new Set([jid, altJid].filter(Boolean).map(String))]

const getFacts = (jid, altJid) => {
    const s = store()
    if (!s) return []
    const seen = new Set()
    const out = []
    for (const key of candidateKeys(jid, altJid)) {
        for (const entry of Array.isArray(s[key]) ? s[key] : []) {
            const norm = String(entry?.fact || '').trim().toLowerCase()
            if (norm && !seen.has(norm)) { seen.add(norm); out.push(entry) }
        }
    }
    return out
}

const addFacts = (jid, facts, altJid, at = new Date().toISOString().slice(0, 10)) => {
    const s = store()
    if (!s || !jid) return 0
    // Write to the candidate key that already holds this person, if any,
    // so their facts stay in one place.
    const key = candidateKeys(jid, altJid).find(k => Array.isArray(s[k]) && s[k].length) || String(jid)
    if (!Array.isArray(s[key])) s[key] = []
    const existing = new Set(s[key].map(e => String(e?.fact || '').trim().toLowerCase()))
    let added = 0
    for (const fact of facts) {
        const clean = String(fact || '').trim().slice(0, MAX_FACT_LEN)
        if (!clean || existing.has(clean.toLowerCase())) continue
        s[key].push({ fact: clean, at })
        existing.add(clean.toLowerCase())
        added++
    }
    while (s[key].length > MAX_FACTS) s[key].shift()
    if (added) persist()
    return added
}

const forgetPerson = (jid, altJid) => {
    const s = store()
    if (!s) return false
    let removed = false
    for (const key of candidateKeys(jid, altJid)) {
        if (s[key]) { delete s[key]; removed = true }
    }
    if (removed) persist()
    return removed
}

const formatForPrompt = (jid, altJid) => {
    if (!enabled()) return ''
    const facts = getFacts(jid, altJid)
    if (!facts.length) return ''
    return '\n\nFacts I remember about this person:\n' + facts.map(f => '- ' + f.fact).join('\n')
}

// ── Extraction ───────────────────────────────────────────────────────────────

const EXTRACTION_INSTRUCTIONS = [
    'You extract durable facts a person states about THEMSELVES from one WhatsApp message.',
    'Return ONLY a JSON array of short fact strings, like ["Lives in Westlands", "Runs a barber shop called Kings Kutz"].',
    'Rules: facts about the SENDER only, never about other people; only durable facts (their name, home area, work or business, family basics, strong preferences, important dates); NOT moods, questions, requests, jokes, opinions, or one-off events; skip anything already listed in the existing facts; maximum 3 facts; if there is nothing durable, return [].',
    'No explanations, no markdown — the JSON array only.'
].join(' ')

const parseExtraction = (raw) => {
    const text = String(raw || '')
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end <= start) return []
    let parsed
    try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return [] }
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    const out = []
    for (const item of parsed) {
        if (typeof item !== 'string') continue
        const clean = item.trim().replace(/^[-•*]\s*/, '').replace(/\s+/g, ' ')
        if (clean.length < 4 || clean.length > MAX_FACT_LEN) continue
        const norm = clean.toLowerCase()
        if (seen.has(norm)) continue
        seen.add(norm)
        out.push(clean)
        if (out.length >= MAX_NEW_PER_MESSAGE) break
    }
    return out
}

// Cheap pre-filter: only messages that look like first-person statements
// are worth an extraction call. Most chat ("ok", "😂", "send it") never
// reaches the AI; statements of fact about oneself almost always carry
// one of these markers in English or Kiswahili.
const looksLikeSelfStatement = (text) => /\b(i am|i'm|my|mine|i live|i work|i run|i own|i study|i come from|i moved|i got|i have|i had|i started|i opened|i joined|i left|i bought|i sold|i became|i graduated|call me|my name|mimi|ninaitwa|naitwa|yangu|langu|kwetu|ninaishi|nafanya kazi|nime|nili)\b/i.test(String(text || ''))

const learnFromMessage = async ({ jid, altJid, text, callAI, stripTrigger = false } = {}) => {
    if (!enabled() || !jid || !text) return { learned: 0 }
    let clean = String(text).trim()
    // Agent-path callers pass stripTrigger: an agent message legitimately
    // starts with the "Agent," trigger and may still carry facts after it
    // ("Agent, my shop is in Westlands — build me a site").
    if (stripTrigger) clean = clean.replace(/^(agent|bera)\b[:,]?\s*/i, '')
    if (clean.length < 12) return { learned: 0 }
    if (!looksLikeSelfStatement(clean)) return { learned: 0 }
    // Commands addressed to the bot ("Agent, ..." / "Bera, ...") are
    // instructions, not conversation — never learn from them.
    if (/^(agent|bera)\b/i.test(clean)) return { learned: 0 }
    if (!store()) return { learned: 0 }

    const ai = callAI || (async (messages) => require('./beraai').callAI(messages, 15000))
    const existing = getFacts(jid, altJid).map(f => f.fact)
    let raw
    try {
        raw = await ai([
            { role: 'system', content: EXTRACTION_INSTRUCTIONS },
            { role: 'user', content: `Existing facts: ${JSON.stringify(existing)}\nMessage from the person: ${JSON.stringify(clean)}` }
        ])
    } catch {
        return { learned: 0 }
    }
    const facts = parseExtraction(typeof raw === 'string' ? raw : raw?.reply)
    if (!facts.length) return { learned: 0 }
    return { learned: addFacts(jid, facts, altJid) }
}

module.exports = {
    enabled,
    getFacts,
    addFacts,
    forgetPerson,
    formatForPrompt,
    parseExtraction,
    learnFromMessage,
    looksLikeSelfStatement,
    EXTRACTION_INSTRUCTIONS,
    MAX_FACTS
}
