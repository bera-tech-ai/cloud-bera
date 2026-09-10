const axios = require('axios')

const GT  = 'https://api.gifted.co.ke'
const KEY = process.env.GIFTED_API_KEY || ''

// ── Core Gifted requester ─────────────────────────────────────────────────────
const gt = (path, params = {}, opts = {}) =>
    axios.get(`${GT}${path}`, {
        params: { apikey: KEY, ...params },
        timeout: opts.timeout || 30000,
        responseType: opts.binary ? 'arraybuffer' : 'json'
    }).then(r => r.data).catch(e => ({ success: false, error: e.response?.data?.error || e.message }))

// ── Free API requester (no key needed) ───────────────────────────────────────
const free = (url, params = {}, opts = {}) =>
    axios.get(url, { params, timeout: opts.timeout || 15000 })
        .then(r => r.data)
        .catch(() => null)

// ═══════════════════════════════════════════════════════════════════════════════
//  AI
// ═══════════════════════════════════════════════════════════════════════════════

// Primary: Overchat/DeepSeek | Fallback: Gemini | Last: GPT4o
const gtChat = async (q, systemPrompt) => {
    const prompt = systemPrompt ? systemPrompt + '\n\n' + q : q
    for (const [ep, params] of [
        ['/api/ai/overchat', { q: prompt.slice(0, 1500), model: 'deepseek', apikey: 'gifted' }],
        ['/api/ai/gemini',   { q: prompt.slice(0, 2000) }],
        ['/api/ai/gpt4o',   { q: prompt.slice(0, 2000) }],
    ]) {
        try {
            const r = await axios.get(`${GT}${ep}`, { params: { apikey: KEY, ...params }, timeout: 15000 }).then(r => r.data)
            const result = r?.result
            if (result && typeof result === 'string' && result.trim().length > 1) return result.trim()
        } catch {}
    }
    return null
}

// Vision — describe image using AI
const gtVision = async (imageUrl, prompt = 'Describe this image in detail.') => {
    const r = await gt('/api/ai/overchat', { q: `${prompt} Image: ${imageUrl}`, model: 'deepseek', apikey: 'gifted' })
    return r?.result || null
}

// Image generation — tries multiple endpoints
const gtImage = async (prompt) => {
    for (const ep of ['/api/ai/fluximg', '/api/ai/deepimg', '/api/ai/txt2img', '/api/ai/magicstudio']) {
        const r = await gt(ep, { prompt })
        const url = r?.result?.url || r?.result || r?.url || r?.image
        if (url && String(url).startsWith('http')) return url
    }
    return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEARCH — using correct params + free fallbacks
// ═══════════════════════════════════════════════════════════════════════════════

// Weather — Gifted broken, use wttr.in (free, no key)
const gtWeather = async (location) => {
    try {
        const d = await free(`https://wttr.in/${encodeURIComponent(location)}`, { format: 'j1' })
        if (!d || !d.current_condition) return null
        const c = d.current_condition[0]
        const area = d.nearest_area?.[0]
        const city = area?.areaName?.[0]?.value || location
        const country = area?.country?.[0]?.value || ''
        const forecast = (d.weather || []).slice(0, 3).map(day => ({
            date: day.date,
            maxC: day.maxtempC,
            minC: day.mintempC,
            desc: day.hourly?.[4]?.weatherDesc?.[0]?.value || ''
        }))
        return {
            city, country,
            temp: c.temp_C,
            feels: c.FeelsLikeC,
            desc: c.weatherDesc?.[0]?.value || '',
            humidity: c.humidity,
            wind: c.windspeedKmph,
            uv: c.uvIndex,
            forecast
        }
    } catch { return null }
}

// Lyrics — use lyrics.ovh (free) with smart query parsing
const gtLyrics = async (query) => {
    // Try to split "Song by Artist" or "Artist - Song"
    let artist = '', title = query
    const byMatch = query.match(/^(.+?)\s+by\s+(.+)$/i)
    const dashMatch = query.match(/^(.+?)\s*[-–]\s*(.+)$/)
    if (byMatch) { title = byMatch[1].trim(); artist = byMatch[2].trim() }
    else if (dashMatch) { artist = dashMatch[1].trim(); title = dashMatch[2].trim() }

    // Try lyrics.ovh with artist/title
    if (artist) {
        const r = await free(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`)
        if (r?.lyrics) return { lyrics: r.lyrics, title, artist }
    }

    // Try searching Gifted lyrics endpoint (sometimes works with different params)
    const r = await gt('/api/search/lyrics', { query, title: title || query, artist: artist || '' })
    if (r?.result) return r.result

    // Fallback: lyrics.ovh with full query as title, empty artist
    const fallback = await free(`https://api.lyrics.ovh/v1//${encodeURIComponent(query)}`)
    if (fallback?.lyrics) return { lyrics: fallback.lyrics, title: query, artist: '' }

    return null
}

// Wikipedia — use Wikipedia REST API (Gifted returns 404)
const gtWiki = async (topic) => {
    const data = await free(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/ /g, '_'))}`)
    if (data?.extract) return { title: data.title, extract: data.extract, url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}` }
    // Fallback: search first
    const search = await free(`https://en.wikipedia.org/w/api.php`, { action: 'query', list: 'search', srsearch: topic, format: 'json', srlimit: 1 })
    const first = search?.query?.search?.[0]
    if (!first) return null
    const detail = await free(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(first.title.replace(/ /g, '_'))}`)
    if (detail?.extract) return { title: detail.title, extract: detail.extract, url: detail.content_urls?.desktop?.page || '' }
    return null
}

// Google search
const gtGoogle = (query) =>
    gt('/api/search/google', { query }).then(r => r.results || null)

// Dictionary — word= param (NOT query=)
const gtDictionary = (word) =>
    gt('/api/search/dictionary', { word }).then(r => r.result || null)

// Bible — verse= param
const gtBible = (verse) =>
    gt('/api/search/bible', { verse }).then(r => r.result || null)

// Wallpaper
const gtWallpaper = (query) =>
    gt('/api/search/wallpaper', { query }).then(r => r.results || null)

// News — use GNews (free tier)
const gtNews = async (topic = 'kenya') => {
    // gnews.io tokens expire frequently — use Gifted news API instead
    const r = await gt('/api/news/search', { q: topic, lang: 'en', max: 5 })
    if (r?.articles?.length) return r.articles
    // Fallback: use Gifted google search for news
    const gs = await gt('/api/search/google', { query: `${topic} news today` })
    return gs?.results || null
}

// Shazam — needs url param
const gtShazam = (url) =>
    gt('/api/search/shazam', { url }).then(r => r.result || null)

// Spotify search
const gtSpotifySearch = (query) =>
    gt('/api/search/spotifysearch', { query }).then(r => r.results || null)

// YouTube search — use lemnoslife (Gifted times out)
const gtYtSearch = async (query) => {
    try {
        const r = await axios.get(`https://yt.lemnoslife.com/noKey/search`, {
            params: { part: 'snippet', q: query, type: 'video', maxResults: 6 },
            timeout: 10000
        })
        return (r.data?.items || []).map(it => ({
            title: it.snippet?.title || 'Unknown',
            videoId: it.id?.videoId,
            channel: it.snippet?.channelTitle || '',
            url: `https://youtu.be/${it.id?.videoId}`
        })).filter(v => v.videoId)
    } catch { return null }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DOWNLOADS
// ═══════════════════════════════════════════════════════════════════════════════

const gtYtMp3 = (url) => gt('/api/download/ytmp3', { url }).then(r => r.result || null)
const gtYtMp4 = (url, quality = '360p') => gt('/api/download/ytmp4', { url, quality }).then(r => r.result || null)
const gtTikTok = (url) => gt('/api/download/tiktok', { url }).then(r => r.result || null)
const gtInstagram = (url) => gt('/api/download/instadl', { url }).then(r => r.result || null)
const gtTwitter = (url) => gt('/api/download/twitter', { url }).then(r => r.result || null)
const gtFacebook = (url) => gt('/api/download/facebook', { url }).then(r => r.result || null)
const gtSpotifyDl = (url) => gt('/api/download/spotifydl', { url }).then(r => r.result || null)

// ═══════════════════════════════════════════════════════════════════════════════
//  TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

// Remove BG — try multiple endpoints
const gtRemoveBg = async (url) => {
    for (const ep of ['/api/tools/removebgv2', '/api/tools/removebg']) {
        const r = await gt(ep, { url })
        const result = r?.result?.url || r?.result || r?.url || r?.image
        if (result && typeof result === 'string' && result.startsWith('http')) return result
    }
    // Fallback: remove.bg via photoroom API (free tier)
    return null
}

// QR create — use qrserver.com (Gifted QR endpoint requires different params)
const gtCreateQr = (text) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}`

// QR read
const gtReadQr = (url) =>
    gt('/api/tools/readqr', { url }).then(r => r.result || null)

// Screenshot website
const gtScreenshot = async (url) => {
    try {
        const r = await axios.get(`${GT}/api/tools/ssweb`, { params: { apikey: KEY, url }, responseType: 'arraybuffer', timeout: 30000 })
        return Buffer.from(r.data)
    } catch { return null }
}

// OCR
const gtOcr = (url) => gt('/api/tools/ocr', { url }).then(r => r.result || null)

// Upscale
const gtUpscale = (url) =>
    gt('/api/tools/imageupscaler', { url, model: 'upscale' }).then(r => r.result?.url || r.result || r.url || null)

// Transcript
const gtTranscript = (url) => gt('/api/ai/transcript', { url }).then(r => r.result || null)

// WHOIS
const gtWhois = (domain) => gt('/api/tools/whois', { domain }).then(r => r.result || null)

// ═══════════════════════════════════════════════════════════════════════════════
//  FOOTBALL
// ═══════════════════════════════════════════════════════════════════════════════

const gtLiveScore = () => gt('/api/football/livescore').then(r => r.result || null)
const gtPredictions = () => gt('/api/football/predictions').then(r => r.result || null)
const gtFootballNews = () => gt('/api/football/news').then(r => r.result || null)

const GT_LEAGUES = {
    epl: '/api/football/epl/standings',
    laliga: '/api/football/laliga/standings',
    ucl: '/api/football/ucl/standings',
    bundesliga: '/api/football/bundesliga/standings',
    seriea: '/api/football/seriea/standings',
    ligue1: '/api/football/ligue1/standings',
    euros: '/api/football/euros/standings',
}
const gtStandings = (league) =>
    gt(GT_LEAGUES[league] || GT_LEAGUES.epl).then(r => r.result || null)

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW — UNIQUE FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

// Crypto prices (CoinGecko free)
const COIN_IDS = {
    bitcoin: 'bitcoin', btc: 'bitcoin',
    ethereum: 'ethereum', eth: 'ethereum',
    bnb: 'binancecoin', solana: 'solana', sol: 'solana',
    xrp: 'ripple', cardano: 'cardano', ada: 'cardano',
    dogecoin: 'dogecoin', doge: 'dogecoin',
    tron: 'tron', trx: 'tron',
    usdt: 'tether', usdc: 'usd-coin',
    polygon: 'matic-network', matic: 'matic-network',
    litecoin: 'litecoin', ltc: 'litecoin',
}
const gtCrypto = async (coins = ['bitcoin', 'ethereum']) => {
    const ids = coins.map(c => COIN_IDS[c.toLowerCase()] || c.toLowerCase()).join(',')
    const r = await free('https://api.coingecko.com/api/v3/coins/markets', {
        vs_currency: 'usd', ids, order: 'market_cap_desc', per_page: 10, page: 1,
        sparkline: false, price_change_percentage: '24h'
    })
    return Array.isArray(r) ? r : null
}

// Translate text (MyMemory free)
const gtTranslate = async (text, to = 'sw', from = 'auto') => {
    const langpair = from === 'auto' ? `en|${to}` : `${from}|${to}`
    const r = await free('https://api.mymemory.translated.net/get', { q: text, langpair })
    return r?.responseData?.translatedText || null
}

// Movie info (OMDB free)
const gtMovie = async (title) => {
    const r = await free('http://www.omdbapi.com/', { t: title, apikey: 'trilogy', plot: 'short' })
    if (r?.Response === 'True') return r
    // Also try by search
    const search = await free('http://www.omdbapi.com/', { s: title, apikey: 'trilogy' })
    if (search?.Search?.[0]) {
        const first = search.Search[0]
        return free('http://www.omdbapi.com/', { i: first.imdbID, apikey: 'trilogy', plot: 'short' })
    }
    return null
}

// Anime search (Jikan — free MyAnimeList API)
const gtAnime = async (query) => {
    const r = await free('https://api.jikan.moe/v4/anime', { q: query, limit: 5, sfw: true })
    return r?.data || null
}

// IP info
const gtIpInfo = async (ip) => {
    const r = await free(`https://ip-api.com/json/${encodeURIComponent(ip)}`, {
        fields: 'status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query'
    })
    if (r?.status === 'success') return r
    return null
}

// Stock price (Yahoo Finance via query)
const gtStock = async (symbol) => {
    try {
        const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}`, {
            params: { interval: '1d', range: '1d' },
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        })
        const meta = r.data?.chart?.result?.[0]?.meta
        if (!meta) return null
        return {
            symbol: meta.symbol,
            name: meta.shortName || meta.symbol,
            price: meta.regularMarketPrice,
            prevClose: meta.previousClose,
            change: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2),
            currency: meta.currency,
            exchange: meta.exchangeName
        }
    } catch { return null }
}

// Currency conversion (ExchangeRate free)
const gtCurrency = async (amount, from = 'USD', to = 'KES') => {
    const r = await free(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`)
    if (r?.rates?.[to.toUpperCase()]) {
        const rate = r.rates[to.toUpperCase()]
        return { from, to, amount, rate, result: (amount * rate).toFixed(2) }
    }
    return null
}

// GitHub repo info
const gtGithub = async (repo) => {
    const r = await free(`https://api.github.com/repos/${repo}`, {}, { timeout: 10000 })
    if (r?.full_name) return r
    // Try as search
    const search = await free('https://api.github.com/search/repositories', { q: repo, per_page: 1 })
    return search?.items?.[0] || null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW — ALL WORKING GIFTED ENDPOINTS (v2)
// ═══════════════════════════════════════════════════════════════════════════════

// ── NETWORK TOOLS ─────────────────────────────────────────────────────────────
const gtDnsCheck   = (domain) => gt('/api/tools/dns-check',   { domain }).then(r => r.result || r || null)
const gtHttpHeaders= (url)    => gt('/api/tools/http-headers', { url    }).then(r => r.result || r || null)
const gtServerCheck= (url)    => gt('/api/tools/server-check', { url    }).then(r => r.result || r || null)

// ── ENCODE / DECODE ───────────────────────────────────────────────────────────
const gtEncodeBinary = (query) => gt('/api/tools/ebinary',  { query }).then(r => r.result || null)
const gtDecodeBinary = (query) => gt('/api/tools/dbinary',  { query }).then(r => r.result || null)
const gtEncodeBase64 = (query) => gt('/api/tools/ebase',    { query }).then(r => r.result || null)
const gtDecodeBase64 = (query) => gt('/api/tools/dbase',    { query }).then(r => r.result || null)

// ── TEXT EFFECTS ──────────────────────────────────────────────────────────────
const gtFancyText   = (text)  => gt('/api/tools/fancy',   { text }).then(r => r.result || null)
const gtFancyTextV2 = (text)  => gt('/api/tools/fancyv2', { text }).then(r => r.result || null)
const gtTtp         = (query) => gt('/api/tools/ttp',     { query }, { binary: true }).then(r => r || null)

// ── EMOJI MIX ─────────────────────────────────────────────────────────────────
const gtEmojiMix = async (emoji1, emoji2) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/emojimix`, {
            params: { apikey: KEY, emoji1, emoji2 },
            responseType: 'arraybuffer',
            timeout: 20000
        })
        return Buffer.from(r.data)
    } catch { return null }
}

// ── CODE TOOLS ────────────────────────────────────────────────────────────────
const gtEncryptCode    = (code) => gt('/api/tools/encrypt',       { code }).then(r => r.result || null)
const gtEncryptCodeV2  = (code) => gt('/api/tools/encryptv2',     { code }).then(r => r.result || null)
const gtEncryptCodeV3  = (code) => gt('/api/tools/encryptv3',     { code }).then(r => r.result || null)
const gtHtmlObfuscate  = (html) => gt('/api/tools/htmlobfuscate', { html }).then(r => r.result || null)
const gtCarbonCode = async (code) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/carbon`, {
            params: { apikey: KEY, code },
            responseType: 'arraybuffer',
            timeout: 30000
        })
        return Buffer.from(r.data)
    } catch { return null }
}

// ── DOCUMENT / IMAGE GENERATION ──────────────────────────────────────────────
const gtToPdf = async (query) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/topdf`, {
            params: { apikey: KEY, query },
            responseType: 'arraybuffer',
            timeout: 20000
        })
        return Buffer.from(r.data)
    } catch { return null }
}

const gtQuoteCard = async (text, name, avatar) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/quote`, {
            params: { apikey: KEY, text, name, avatar },
            responseType: 'arraybuffer',
            timeout: 20000
        })
        return Buffer.from(r.data)
    } catch { return null }
}

const gtCanvasCard = async (title, type, text, watermark) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/canvas`, {
            params: { apikey: KEY, title, type, text, watermark },
            responseType: 'arraybuffer',
            timeout: 20000
        })
        return Buffer.from(r.data)
    } catch { return null }
}

// ── SCREENSHOTS (extra viewports) ────────────────────────────────────────────
const gtSsPhone = async (url) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/ssphone`, { params: { apikey: KEY, url }, responseType: 'arraybuffer', timeout: 30000 })
        return Buffer.from(r.data)
    } catch { return null }
}
const gtSsTab = async (url) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/sstab`, { params: { apikey: KEY, url }, responseType: 'arraybuffer', timeout: 30000 })
        return Buffer.from(r.data)
    } catch { return null }
}
const gtSsPc = async (url) => {
    try {
        const r = await require('axios').get(`${GT}/api/tools/sspc`, { params: { apikey: KEY, url }, responseType: 'arraybuffer', timeout: 30000 })
        return Buffer.from(r.data)
    } catch { return null }
}

// ── WEB2ZIP ───────────────────────────────────────────────────────────────────
const gtWeb2Zip = (url) => gt('/api/tools/web2zip', { url }).then(r => r.result || r.url || r.download_url || null)

// ── IMAGE SEARCH ──────────────────────────────────────────────────────────────
const gtGoogleImages = (query) => gt('/api/search/googleimage', { query }).then(r => r.results || r.result || null)
const gtUnsplash     = (query) => gt('/api/search/unsplash',    { query }).then(r => r.results || r.result || null)

// ── CONTENT SEARCH ────────────────────────────────────────────────────────────
const gtTikTokSearch   = (query) => gt('/api/search/tiktoksearch',  { query  }).then(r => r.results || r.result || null)
const gtStickerSearch  = (query) => gt('/api/search/stickersearch', { query  }).then(r => r.results || r.result || null)
const gtLyricsV2       = (query) => gt('/api/search/lyricsv2',      { query  }).then(r => r.result || null)
const gtSpotifyLyrics  = (query) => gt('/api/search/spotifylyrics', { query  }).then(r => r.result || null)
const gtSpotifyPlaylist= (query) => gt('/api/search/spotifyplaylist',{ query  }).then(r => r.result || r.results || null)
const gtSoundCloud     = (query) => gt('/api/search/soundcloud',    { query  }).then(r => r.result || r.results || null)
const gtHearthis       = (query) => gt('/api/search/hearthis',      { query  }).then(r => r.result || r.results || null)
const gtHearthisSet    = (url)   => gt('/api/search/hearthisset',   { url    }).then(r => r.result || null)
const gtChord          = (query) => gt('/api/search/chord',         { query  }).then(r => r.result || null)

// ── KNOWLEDGE SEARCH ──────────────────────────────────────────────────────────
const gtDefine     = (term)  => gt('/api/search/define',    { term  }).then(r => r.result || null)
const gtWikimedia  = (title) => gt('/api/search/wikimedia', { title }).then(r => r.result || null)

// ── APP / PACKAGE SEARCH ──────────────────────────────────────────────────────
const gtPlaystore  = (query)       => gt('/api/search/playstore',  { query       }).then(r => r.result || r.results || null)
const gtHappyMod   = (query)       => gt('/api/search/happymod',   { query       }).then(r => r.result || r.results || null)
const gtApkMirror  = (query)       => gt('/api/search/apkmirror',  { query       }).then(r => r.result || r.results || null)
const gtNpmSearch  = (packagename) => gt('/api/search/npmsearch',  { packagename }).then(r => r.result || r.results || null)
const gtWattpad    = (query)       => gt('/api/search/wattpad',    { query       }).then(r => r.result || r.results || null)

// Intent classifier for agent
const ACTIONS_PROMPT = `You are an intent classifier for a WhatsApp AI bot called Bera AI.
Given the user message, respond ONLY with a valid JSON object (no markdown, no explanation).

Available actions and their param shapes:
  play_music       { query: "song name or artist" }
  yt_audio         { url: "youtube url" }
  yt_video         { url: "youtube url" }
  download_social  { url: "tiktok/instagram/twitter/fb/facebook url" }
  spotify_dl       { url: "spotify url" }
  lyrics           { query: "song title [by artist]" }
  weather          { location: "city or place" }
  define           { word: "word to define" }
  wikipedia        { topic: "topic to look up" }
  google_search    { query: "search query" }
  translate        { text: "text", to: "target language code e.g sw,fr,es,de,zh" }
  generate_image   { prompt: "image description" }
  show_menu        {}
  football_scores  {}
  football_predictions {}
  football_standings { league: "epl|laliga|ucl|bundesliga|seriea|ligue1" }
  football_news    {}
  create_qr        { content: "text or url for QR" }
  screenshot       { url: "https://..." }
  remove_bg        {}
  crypto           { coins: ["bitcoin","ethereum"] }
  stock            { symbol: "AAPL" }
  currency         { amount: 100, from: "USD", to: "KES" }
  movie            { title: "movie title" }
  anime            { query: "anime title" }
  ip_info          { ip: "ip address or domain" }
  whois            { domain: "domain.com" }
  news             { topic: "news topic" }
  github           { repo: "owner/repo or search term" }
  ocr              {}
  bible            { verse: "Book Chapter:Verse e.g John 3:16" }
  wallpaper        { query: "topic" }
  shazam           { url: "audio or video url" }
  yt_search        { query: "video or song name" }
  chat             {}

Rules:
- Greetings, questions, general convo → action: "chat"
- If user wants to do something the bot can handle → return that action
- Return exactly one JSON object, no markdown`

const gtIntent = async (msg) => {
    try {
        const r = await gt('/api/ai/overchat', { q: ACTIONS_PROMPT + '\n\nUser: ' + msg, model: 'deepseek', apikey: 'gifted' })
        const raw = r?.result?.replace(/```json|```/g, '').trim() || ''
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) return JSON.parse(match[0])
    } catch {}
    return { action: 'chat' }
}

module.exports = {
    gt, free,
    // AI
    gtChat, gtVision, gtImage,
    // Search (fixed)
    gtWeather, gtLyrics, gtWiki, gtGoogle, gtDictionary, gtBible, gtWallpaper,
    gtNews, gtShazam, gtSpotifySearch, gtYtSearch,
    // Downloads
    gtYtMp3, gtYtMp4, gtTikTok, gtInstagram, gtTwitter, gtFacebook, gtSpotifyDl,
    // Tools (fixed)
    gtRemoveBg, gtCreateQr, gtReadQr, gtScreenshot, gtOcr, gtUpscale,
    gtTranscript, gtWhois,
    // Football
    gtLiveScore, gtPredictions, gtStandings, gtFootballNews,
    // Unique features
    gtCrypto, gtTranslate, gtMovie, gtAnime, gtIpInfo, gtStock, gtCurrency, gtGithub,
    // NEW — Network Tools
    gtDnsCheck, gtHttpHeaders, gtServerCheck,
    // NEW — Encode/Decode
    gtEncodeBinary, gtDecodeBinary, gtEncodeBase64, gtDecodeBase64,
    // NEW — Text Effects
    gtFancyText, gtFancyTextV2, gtTtp,
    // NEW — Emoji / Code
    gtEmojiMix, gtEncryptCode, gtEncryptCodeV2, gtEncryptCodeV3, gtHtmlObfuscate, gtCarbonCode,
    // NEW — Document/Image gen
    gtToPdf, gtQuoteCard, gtCanvasCard,
    // NEW — Screenshots
    gtSsPhone, gtSsTab, gtSsPc,
    // NEW — Web
    gtWeb2Zip,
    // NEW — Image/Content Search
    gtGoogleImages, gtUnsplash, gtTikTokSearch, gtStickerSearch,
    // NEW — Music/Lyrics
    gtLyricsV2, gtSpotifyLyrics, gtSpotifyPlaylist, gtSoundCloud, gtHearthis, gtHearthisSet, gtChord,
    // NEW — Knowledge
    gtDefine, gtWikimedia,
    // NEW — App/Package Search
    gtPlaystore, gtHappyMod, gtApkMirror, gtNpmSearch, gtWattpad,
    // Agent
    gtIntent,
    // Constants
    GT, KEY, GT_LEAGUES
}
