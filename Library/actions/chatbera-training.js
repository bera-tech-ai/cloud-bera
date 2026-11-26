'use strict'

// ChatBera training-data hygiene + style sample selection (pure helpers).
//
// The trained corpus lives in db.data.chatbera.profile.myMessages (with a
// prebuilt copy in Library/actions/chatbera.js). These helpers keep that
// corpus clean (no credentials, no links, no export artifacts, no dupes,
// no content-free junk), describe it honestly (style stats over the WHOLE
// corpus — both the friend/dev register and the girlfriend register, not
// just the first 40 samples the old analysis used), and pick the few-shot
// samples for ChatBera prompts with register diversity.

// ── Guards ───────────────────────────────────────────────────────────────────
// Credential-shaped: connection strings, scheme URLs with embedded
// user:password@, or key/secret assignments. Checked FIRST, before the
// plain-URL guard, so a credential is always counted as a credential.
const CREDENTIAL_RE = /mongodb(?:\+srv)?:\/\/|[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@|(?:api[_ -]?key|access[_ -]?token|password|passwd|secret)\s*[:=]\s*\S+/i
const URL_RE = /[a-z][a-z0-9+.-]*:\/\/|www\.|\b[\w-]+\.(?:com|net|org|io|dev|app|co|me|xyz|site|online)\b/i
const isCredentialShaped = s => CREDENTIAL_RE.test(String(s || ''))
const isUrlShaped = s => URL_RE.test(String(s || ''))

// WhatsApp export artifacts that leak into trained samples.
const ARTIFACT_RE = /<This message was edited>|<Media omitted>|<Audio omitted>|<Video omitted>|<Image omitted>|<Document omitted>|This message was deleted|You deleted this message/gi
const stripExportArtifacts = s => String(s || '').replace(ARTIFACT_RE, '').replace(/\s{2,}/g, ' ').trim()

// Content-free junk: bare chat-partner names and single tokens that carry
// no style at all. Genuinely characteristic shorties ('Yooh', 'Oi', 'Mzee',
// 'Waazi', 'Baaas🥲'…) are NOT junk and are kept.
const JUNK_SAMPLES = new Set(['github', 'expiry', 'carl', 'marisel', 'test hii'])

// Sheng / Swahili markers that give a sample its distinctive style.
const SHENG_MARKERS = [
    'mkuu', 'niaje', 'waazi', 'bana', 'ndo', 'nko', 'rada', 'noma', 'poa',
    'mzee', 'bruv', 'iza', 'enyewe', 'walai', 'wozza', 'kejani', 'fala',
    'dooh', 'mbogi', 'buda', 'manze', 'sijai', 'umepotea', 'akuna', 'mbaya',
    'kadhaa', 'utanishow', 'niekee', 'chwani', 'staki', 'nikifika', 'nikushtue'
]
const SWAHILI_FUNCTION = new Set(['na', 'ya', 'kwa', 'ni', 'za', 'wa', 'kama', 'yako', 'wako', 'nini', 'hii', 'hiyo', 'wangu', 'yangu', 'sana', 'tu', 'katika', 'kwamba'])
const STYLE_EMOJIS = ['😂', '🥲', '🫴', '😩', '😔', '🙁', '❤️', '😭']

const wordsOf = s => String(s || '').toLowerCase().split(/[^a-zà-ÿ']+/i).filter(Boolean)
const shengMarkerCount = s => {
    const words = new Set(wordsOf(s))
    return SHENG_MARKERS.reduce((n, m) => n + (words.has(m) ? 1 : 0), 0)
}
const styleEmojiCount = s => {
    const str = String(s || '')
    return STYLE_EMOJIS.reduce((n, e) => n + (str.split(e).length - 1), 0)
}
// Distinctiveness: Sheng markers + style emojis. 0 = plain sample.
const styleScore = s => shengMarkerCount(s) * 2 + styleEmojiCount(s)

// ── Cleaning ─────────────────────────────────────────────────────────────────
const normalizeSampleKey = s => String(s || '')
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

// Clean a raw sample list. Returns kept samples (original order) and drop
// counts per category. Credential-shaped entries are counted, never kept
// and never returned.
const cleanTrainingSamples = (messages) => {
    const kept = []
    const dropped = { credential: 0, url: 0, junk: 0, exactDupes: 0, nearDupes: 0, empty: 0 }
    let artifactsStripped = 0
    const seenExact = new Set()
    const seenKeys = new Set()
    for (const raw of Array.isArray(messages) ? messages : []) {
        const original = String(raw || '').trim()
        const s = stripExportArtifacts(original)
        if (s !== original) artifactsStripped++
        if (!s) { dropped.empty++; continue }
        if (isCredentialShaped(s)) { dropped.credential++; continue }
        if (isUrlShaped(s)) { dropped.url++; continue }
        if (JUNK_SAMPLES.has(s.toLowerCase())) { dropped.junk++; continue }
        if (seenExact.has(s)) { dropped.exactDupes++; continue }
        const key = normalizeSampleKey(s)
        if (key && seenKeys.has(key)) { dropped.nearDupes++; continue }
        seenExact.add(s)
        if (key) seenKeys.add(key)
        kept.push(s)
    }
    return { kept, dropped, artifactsStripped }
}

// ── Registers ────────────────────────────────────────────────────────────────
// The corpus has two voices: friend/dev banter (Sheng-heavy, 😂-heavy) and
// the girlfriend register (English-dominant, longer, 'babe'/'ml'), plus the
// occasional formal/formal-ish pitch. Selection and stats must cover both.
const registerOf = s => {
    const str = String(s || '')
    if (/\b(babe|ml)\b/i.test(str) || /i love you/i.test(str) || /good\s?night[^.]*\b(babe|ml)\b/i.test(str)) return 'partner'
    const words = wordsOf(str)
    const plainLongEnglish = str.length >= 100 && words.length >= 16 &&
        styleEmojiCount(str) === 0 && shengMarkerCount(str) === 0 &&
        !words.some(w => SWAHILI_FUNCTION.has(w))
    if (plainLongEnglish) return 'formal'
    return 'friend'
}
// Corpus-level classification: the trained corpus is ordered — friend/dev
// banter first, girlfriend register second — and many girlfriend samples
// carry no 'babe'/'ml' token ('Sorry', 'Im glad', 'Was good'). So when a
// sample has NO friend markers (no Sheng, no 😂/🫴) and sits in the second
// half of the corpus, it belongs to the partner register. Marker-based
// classification always wins over this positional fallback.
const classifyCorpus = (samples) => {
    const mid = Math.floor(samples.length / 2)
    return samples.map((s, i) => {
        const r = registerOf(s)
        if (r !== 'friend') return r
        const hasFriendMarkers = shengMarkerCount(s) > 0 || s.includes('😂') || s.includes('🫴')
        if (!hasFriendMarkers && i >= mid) return 'partner'
        return 'friend'
    })
}

// ── Sample selection ─────────────────────────────────────────────────────────
// Deterministic: clean → group by register → proportional quotas (every
// non-empty register gets at least 1) → inside a register, interleave
// oldest/freshest and prefer distinctive samples while keeping some plain
// ones → return in original corpus order.
const _interleaveOldNew = (arr) => {
    const out = []
    let i = 0, j = arr.length - 1
    while (i <= j) {
        out.push(arr[i])
        if (j !== i) out.push(arr[j])
        i++; j--
    }
    return out
}
const _pickFromRegister = (samples, quota) => {
    if (quota <= 0 || !samples.length) return []
    if (samples.length <= quota) return [...samples]
    const interleaved = _interleaveOldNew(samples)
    const distinctive = interleaved.filter(s => styleScore(s) > 0)
    const plain = interleaved.filter(s => styleScore(s) === 0)
    const distinctQuota = Math.min(distinctive.length, Math.ceil(quota * 0.75))
    const picked = distinctive.slice(0, distinctQuota)
    const rest = [...distinctive.slice(distinctQuota), ...plain]
    for (const s of rest) {
        if (picked.length >= quota) break
        picked.push(s)
    }
    return picked
}
const selectStyleSamples = (messages, limit = 40) => {
    const { kept } = cleanTrainingSamples(messages)
    const lim = Math.max(0, Math.floor(limit) || 0)
    if (kept.length <= lim) return kept
    const byRegister = { friend: [], partner: [], formal: [] }
    classifyCorpus(kept).forEach((r, i) => byRegister[r].push(kept[i]))
    const registers = Object.keys(byRegister).filter(r => byRegister[r].length)
    // Proportional quotas, min 1 per register, then fix rounding on the
    // largest register so the total is exactly lim.
    const quotas = {}
    let assigned = 0
    for (const r of registers) {
        quotas[r] = Math.max(1, Math.round(lim * byRegister[r].length / kept.length))
        assigned += quotas[r]
    }
    const largest = registers.reduce((a, b) => byRegister[a].length >= byRegister[b].length ? a : b)
    quotas[largest] += lim - assigned
    const picked = new Set()
    for (const r of registers) for (const s of _pickFromRegister(byRegister[r], quotas[r])) picked.add(s)
    // Top up (quota rounding / register smaller than quota) in corpus order.
    if (picked.size < lim) for (const s of kept) { if (picked.size >= lim) break; picked.add(s) }
    return kept.filter(s => picked.has(s)).slice(0, lim)
}

// ── Style stats ──────────────────────────────────────────────────────────────
const _emojiCounts = (samples) => {
    const counts = {}
    for (const s of samples) {
        for (const m of String(s).match(/\p{Extended_Pictographic}/gu) || []) counts[m] = (counts[m] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
}
const _summarise = (samples) => {
    const total = samples.length
    if (!total) return { total: 0, under15Pct: 0, endPunctPct: 0, avgLen: 0, shengPct: 0, topEmojis: [], topMarkers: [] }
    const under15 = samples.filter(s => s.length < 15).length
    const endPunct = samples.filter(s => /[.!?]$/.test(s.trim())).length
    const avgLen = Math.round(samples.reduce((n, s) => n + s.length, 0) / total)
    const markerCounts = {}
    let shengHits = 0
    for (const s of samples) {
        const words = new Set(wordsOf(s))
        let hit = false
        for (const m of SHENG_MARKERS) if (words.has(m)) { markerCounts[m] = (markerCounts[m] || 0) + 1; hit = true }
        if (hit) shengHits++
    }
    return {
        total,
        under15Pct: Math.round(under15 / total * 100),
        endPunctPct: Math.round(endPunct / total * 100),
        avgLen,
        shengPct: Math.round(shengHits / total * 100),
        topEmojis: _emojiCounts(samples).slice(0, 5).map(([emoji, count]) => ({ emoji, count })),
        topMarkers: Object.entries(markerCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([marker, count]) => ({ marker, count }))
    }
}
const computeStyleStats = (messages) => {
    const { kept } = cleanTrainingSamples(messages)
    const byRegister = { friend: [], partner: [], formal: [] }
    classifyCorpus(kept).forEach((r, i) => byRegister[r].push(kept[i]))
    return {
        overall: _summarise(kept),
        friend: _summarise(byRegister.friend),
        partner: _summarise(byRegister.partner),
        formal: _summarise(byRegister.formal),
        registerCounts: { friend: byRegister.friend.length, partner: byRegister.partner.length, formal: byRegister.formal.length }
    }
}

// Human-readable analysis in the same format style as the original
// (📊 header + • bullets) — but computed over the whole cleaned corpus and
// explicit about BOTH registers.
const formatStyleAnalysis = (profile, stats) => {
    const name = profile?.myFullName || profile?.myName || 'Bruce Bera'
    const o = stats.overall, f = stats.friend, p = stats.partner
    const emojiStr = o.topEmojis.map(e => `${e.emoji} (${e.count}x)`).join(', ')
    const markerStr = o.topMarkers.map(m => `"${m.marker}"`).join(', ')
    const lines = [
        `📊 Style Analysis — ${name} (from ${o.total} real messages, full corpus — both registers):`,
        `• Short texts: ${o.under15Pct}% of messages are under 15 chars — he keeps it brief (average ${o.avgLen} chars)`,
        `• Punctuation: Almost never (only ${o.endPunctPct}% end with . ! ?) — very casual`,
        `• Emoji: ${emojiStr || 'hardly any'} — 😂 is the default reaction, 🥲 for relatable pain, 🫴 in bro talk`,
        `• Language: Mix of English + Swahili/Sheng — ${o.shengPct}% of messages carry Sheng markers; most common: ${markerStr}`,
        `• Two registers, both his: friend/dev banter (${f.total} samples — Sheng-heavy, 😂-heavy, very short: ${f.under15Pct}% under 15 chars, "mkuu"/"bana"/"bruv", tech and everyday banter) vs girlfriend (${p.total} samples — English-dominant, longer and softer: only ${p.under15Pct}% under 15 chars, "babe"/"ml", apologies, goodnight + "i love you" rituals, Sheng when emotional)`,
        `• Energy: Funny, casual, slightly self-deprecating, never formal`,
        `• Topics: Tech/coding, everyday life, funny moments, friend banter`
    ]
    if (stats.formal.total) lines.push(`• Plus ${stats.formal.total} formal sample(s) — full-sentence English (project pitch mode) when he needs to be serious`)
    return lines.join('\n')
}

module.exports = {
    CREDENTIAL_RE,
    URL_RE,
    isCredentialShaped,
    isUrlShaped,
    stripExportArtifacts,
    normalizeSampleKey,
    cleanTrainingSamples,
    registerOf,
    classifyCorpus,
    styleScore,
    selectStyleSamples,
    computeStyleStats,
    formatStyleAnalysis,
    SHENG_MARKERS
}
