'use strict'
// Phase 3 — Media, search, cards, identity (spec §§1, 16, 17, 21).
// Pure/offline tests only: no test here makes a network call or needs a
// WhatsApp session. Run with:
//   NODE_PATH=/tmp/phase3-test-deps/node_modules node --test test/phase3-media-cards.test.js
// (NODE_PATH supplies axios for the modules under test; the repo has no
// node_modules checked in. A full `npm ci` also works.)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
    VERSION, FOOTER, formatBeraCard, alreadyCarded,
    formatMovieCard, formatSearchCard, formatGroupInfoCard,
    formatActionResultCard, formatProgressCard, formatPermissionCard,
    paginateList, splitMessage, BAILEYS_ACCEPTED_LINE
} = require('../Library/lib/bera-card')
const { normalizeShow } = require('../Library/actions/movie')
const { analyzeImageFromBuffer, analyzeImageFromUrl, visionStatus, VISION_UNAVAILABLE_MESSAGE } = require('../Library/actions/vision')
const { generateImage, IMAGE_GENERATION_UNAVAILABLE } = require('../Library/actions/imagegen')
const { searchProviderStatus } = require('../Library/actions/web-search')
const { resolveLanguage } = require('../Library/actions/translate')
const { fetchTts } = require('../Library/actions/tts')
const config = require('../Config')
const pkg = require('../package.json')

// ── Cards (§21) ─────────────────────────────────────────────────────────────

test('all card types render with the single v3.0.0 footer', () => {
    for (const type of ['success', 'error', 'warning', 'confirmation', 'info', 'search', 'movie', 'group-info', 'action-result', 'progress', 'permission']) {
        const card = formatBeraCard('hello', { type, title: 'TEST' })
        assert.match(card, /⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3\.0\.0/, type)
        assert.match(card, /╭──────────────────────╮/, type)
    }
    assert.equal(VERSION, 'v3.0.0')
    assert.equal(FOOTER, '⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3.0.0')
})

test('movie card matches the spec §17 TVMaze example exactly', () => {
    // Live TVMaze payload shape for Kagurabachi (verified 2026-11-24).
    const show = normalizeShow({
        name: 'Kagurabachi', rating: { average: null }, status: 'In Development',
        genres: ['Action', 'Anime', 'Fantasy'], summary: null, premiered: null, language: null
    })
    const card = formatMovieCard(show)
    assert.match(card, /◉ 𝗞𝗔𝗚𝗨𝗥𝗔𝗕𝗔𝗖𝗛𝗜/)
    assert.match(card, /ᴛᴠᴍᴀᴢᴇ/)
    assert.match(card, /ʀᴀᴛɪɴɢ ⟶ 𝗡\/𝗔/)
    assert.match(card, /sᴛᴀᴛᴜs ⟶ ɪɴ ᴅᴇᴠᴇʟᴏᴘᴍᴇɴᴛ/)
    assert.match(card, /ɢᴇɴʀᴇs ⟶ ᴀᴄᴛɪᴏɴ, ᴀɴɪᴍᴇ, ꜰᴀɴᴛᴀsʏ/)
    assert.match(card, /No summary available\./)
    assert.match(card, /⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3\.0\.0/)
    // A movie card is already a card: never double-wrap it.
    assert.equal(formatBeraCard(card), card)
    assert.equal(alreadyCarded(card), true)
})

test('movie card uses the summary when one exists', () => {
    const card = formatMovieCard(normalizeShow({
        name: 'Inception', rating: { average: 8.8 }, status: 'Ended',
        genres: ['Drama'], summary: '<p>A thief steals secrets.</p>'
    }))
    assert.match(card, /𝟖\.𝟖/) // rating renders in bold-unicode digits, per the spec card style
    assert.match(card, /A thief steals secrets\./)
    assert.doesNotMatch(card, /<p>/)
})

test('search card numbers results and preserves URLs whole', () => {
    const card = formatSearchCard('nairobi weather', [
        { title: 'Nairobi forecast', snippet: 'Sunny, 24C', url: 'https://example.com/nairobi?x=1&y=2' },
        { title: 'Second', snippet: '', url: 'https://example.com/second' }
    ])
    assert.match(card, /1\. Nairobi forecast/)
    assert.match(card, /2\. Second/)
    assert.match(card, /https:\/\/example\.com\/nairobi\?x=1&y=2/)
    assert.match(card, /https:\/\/example\.com\/second/)
    assert.match(card, /🔎 ʀᴇsᴜʟᴛs/)
})

test('search card reports no results honestly', () => {
    const card = formatSearchCard('zzzqqq', [])
    assert.match(card, /No results found for: zzzqqq/)
})

test('group-info, progress and permission cards', () => {
    const group = formatGroupInfoCard({ name: 'Family', id: '123@g.us', participantCount: 12, admins: ['254700000001'], description: 'Our group' })
    assert.match(group, /Family/)
    assert.match(group, /Members: 12/)
    assert.match(group, /👥 ɢʀᴏᴜᴘ/)

    const progress = formatProgressCard({ title: 'DOWNLOAD', done: 2, total: 5, detail: 'Fetching part 3' })
    assert.match(progress, /Step 2 of 5/)
    assert.match(progress, /40%/)
    assert.match(progress, /Fetching part 3/)

    const userDenied = formatPermissionCard({ action: 'kick', who: 'user', reason: 'sender is not an admin' })
    assert.match(userDenied, /You do not have permission/)
    assert.match(userDenied, /sender is not an admin/)
    const botDenied = formatPermissionCard({ action: 'kick', who: 'bot', reason: 'bot is not an admin' })
    assert.match(botDenied, /Bera AI does not have the WhatsApp permission/)
    assert.match(botDenied, /must be a group admin/)
})

test('action-result card uses truthful Baileys-accepted wording, never device confirmation', () => {
    const card = formatActionResultCard({ action: 'pin message', target: 'quoted message', outcome: 'accepted' })
    assert.match(card, /Request accepted by Baileys\. Final device-side visibility depends on WhatsApp processing\./)
    assert.equal(BAILEYS_ACCEPTED_LINE, 'Request accepted by Baileys. Final device-side visibility depends on WhatsApp processing.')
    assert.doesNotMatch(card, /pinned successfully|message was pinned/i)
    const failed = formatActionResultCard({ action: 'pin message', outcome: 'failed', detail: 'Baileys did not accept the pin request.' })
    assert.match(failed, /Baileys did not accept/)
})

// ── Pagination + safe splitting (§21) ───────────────────────────────────────

test('paginateList pages long lists', () => {
    const page = paginateList(Array.from({ length: 25 }, (_, i) => `item ${i + 1}`), { page: 2, perPage: 10 })
    assert.deepEqual(page.items, Array.from({ length: 10 }, (_, i) => `item ${i + 11}`))
    assert.equal(page.totalPages, 3)
    assert.equal(page.hasNext, true)
    assert.equal(page.hasPrev, true)
    assert.equal(page.label, 'Page 2 of 3 (25 total)')
    const last = paginateList(Array.from({ length: 25 }, (_, i) => i), { page: 99, perPage: 10 })
    assert.equal(last.page, 3)
    assert.equal(last.items.length, 5)
})

test('splitMessage never exceeds the limit, keeps URLs whole and balances code fences', () => {
    const url = 'https://example.com/' + 'a'.repeat(100)
    const body = ['```js', 'const a = 1', '```', '', `see ${url} for details`, ...Array.from({ length: 60 }, (_, i) => `line ${i} with some filler text to grow the message`)].join('\n')
    const chunks = splitMessage(body, 1000)
    assert.ok(chunks.length > 1)
    for (const chunk of chunks) assert.ok(chunk.length <= 1000, `chunk too long: ${chunk.length}`)
    assert.equal(chunks.join('\n').includes(url), true)
    // Every chunk that contains a fence opener also closes it.
    for (const chunk of chunks) {
        const fences = (chunk.match(/```/g) || []).length
        assert.equal(fences % 2, 0, `unbalanced fence in chunk: ${chunk.slice(0, 80)}`)
    }
    assert.deepEqual(splitMessage('short'), ['short'])
    assert.deepEqual(splitMessage(''), [])
})

// ── Media / voice reliability (§16) ──────────────────────────────────────────

test('vision is available via Qwen; with the kill switch it is honestly unavailable, without a network call', async () => {
    // Since 2026-11-27 vision runs on Casper Qwen (see test/qwen-vision.test.js
    // for the stubbed provider behaviour). The old /api/ai/vision endpoint is
    // still dead; it is no longer the gate.
    const status = visionStatus()
    assert.equal(status.available, true)
    assert.match(status.provider, /qwen/i)
    process.env.BERA_VISION_QWEN = '0'
    try {
        assert.equal(visionStatus().available, false)
        const fromBuffer = await analyzeImageFromBuffer(Buffer.from('fake-image'))
        assert.equal(fromBuffer.success, false)
        assert.equal(fromBuffer.error, VISION_UNAVAILABLE_MESSAGE)
        assert.match(fromBuffer.error, /unavailable/i)
        assert.match(fromBuffer.error, /\.ocr/)
        const fromUrl = await analyzeImageFromUrl('https://example.com/x.jpg')
        assert.equal(fromUrl.success, false)
        assert.equal((await analyzeImageFromBuffer(null)).error, 'No image supplied.')
    } finally {
        delete process.env.BERA_VISION_QWEN
    }
})

test('image generation reports disabled, never a silent failure', async () => {
    const res = await generateImage('a dragon over Nairobi')
    assert.equal(res.success, false)
    assert.equal(res.error, IMAGE_GENERATION_UNAVAILABLE)
    assert.match(res.error, /disabled/)
})

test('TTS rejects empty and over-long text before any network call', async () => {
    await assert.rejects(() => fetchTts(''), /No text was provided/)
    await assert.rejects(() => fetchTts('x'.repeat(1201)), /too long/)
})

// ── Search providers (§17) ───────────────────────────────────────────────────

test('search provider status reports presence only, never key material', () => {
    // Sentinel "secrets": status must report presence without echoing values.
    process.env.BRAVE_SEARCH_API_KEY = 'sentinel-brave-key-0123456789abcdef'
    process.env.BERA_WEB_SEARCH_URL = 'https://sentinel-search.example.invalid'
    const status = searchProviderStatus()
    assert.equal(status.searxng, true)
    assert.equal(status.brave, true)
    assert.equal(typeof status.duckduckgo, 'string')
    const dumped = JSON.stringify(status)
    assert.doesNotMatch(dumped, /sentinel-brave-key/)
    assert.doesNotMatch(dumped, /sentinel-search/)
    delete process.env.BRAVE_SEARCH_API_KEY
    delete process.env.BERA_WEB_SEARCH_URL
})

test('unavailable gifted providers return null (falsy), with a reason string', async () => {
    const gifted = require('../Library/actions/giftedapi')
    for (const fn of ['gtLyrics', 'gtSpotifySearch', 'gtTwitter', 'gtFacebook', 'gtImage', 'gtOcr', 'gtTranscript', 'gtAnime', 'gtLiveScore', 'gtShazam', 'gtRemoveBg', 'gtUpscale', 'gtWhois']) {
        const result = await gifted[fn]('test')
        assert.equal(result, null, `${fn} must return null when unavailable`)
    }
    assert.match(gifted.unavailableReason('Lyrics'), /unavailable/i)
    assert.match(gifted.unavailableReason('Image generation'), /disabled/)
    assert.equal(gifted.VISION_UNAVAILABLE_MESSAGE, VISION_UNAVAILABLE_MESSAGE)
})

test('translate language resolution is pure', () => {
    assert.equal(resolveLanguage('sw'), 'Swahili')
    assert.equal(resolveLanguage('en'), 'English')
    assert.equal(resolveLanguage('xx'), 'xx')
})

// ── Identity (§1): one version, no provider names ───────────────────────────

test('one version string everywhere: 3.0.0', () => {
    assert.equal(config.version, '3.0.0')
    assert.equal(pkg.version, '3.0.0')
    assert.equal(VERSION, 'v3.0.0')
    assert.equal(config.botName, 'Bera AI')
})

test('prompts name no AI provider and carry version 3.0.0', () => {
    const { PERSONALITY, SHORT_PERSONA, cleanAnswer } = require('../Library/lib/bera')
    for (const prompt of [PERSONALITY, SHORT_PERSONA]) {
        assert.doesNotMatch(prompt, /Groq/i)
        assert.doesNotMatch(prompt, /DeepSeek/i)
        assert.doesNotMatch(prompt, /powered by/i)
        assert.match(prompt, /Bera AI v3\.0\.0/)
        assert.match(prompt, /Bera Tech/)
        assert.match(prompt, /Bruce Bera/)
    }
    assert.match(cleanAnswer("I'm Bera AI v4, powered by Groq AI."), /Bera AI/)
    assert.doesNotMatch(cleanAnswer("I'm Bera AI v4, powered by Groq AI."), /Groq/)
    const beraaiPrompt = fs.readFileSync(path.join(__dirname, '../Library/actions/beraai.js'), 'utf8')
    assert.doesNotMatch(beraaiPrompt, /powered by DeepSeek \+ Groq/)
})
