'use strict'

// ── Gifted API compatibility layer (spec §17) ─────────────────────────────────
// History: every provider here used to be a stub returning a TRUTHY
// `{ success: false, error }` object. Every caller checks truthiness
// (`if (!d)`, `if (!data?.length)`), so the stub was mistaken for real data
// and users got replies like "Weather — undefined" or "🎬 *undefined*
// (undefined)", and `result.rate.toFixed()` threw on the stub. The contract
// is now: a provider with no verified implementation returns `null` (the
// "not available" value every caller already handles), and the reason lives
// in UNAVAILABLE / unavailableReason().
//
// Providers re-implemented on verified no-key endpoints (each checked live
// 2026-11-24 from this environment): web search (DuckDuckGo Instant Answer
// via web-search.js, Brave/SearxNG when configured), Wikipedia, weather
// (wttr.in), crypto (CoinGecko), stocks (Yahoo Finance chart), currency
// (ExchangeRate-API), movies/TV (TVMaze), news (Google News RSS), IP lookup
// (ip-api.com), Bible (bible-api.com), dictionary (dictionaryapi.dev).
// Still unavailable (null): lyrics, Spotify, Twitter/X, Facebook, Shazam,
// image generation, background removal, QR reading, OCR (legacy provider),
// upscaling, transcripts, live scores, predictions, standings, football
// news, anime (Jikan was unreachable from here — see note on gtAnime),
// wallpapers, image search, SoundCloud/HearThis, chords, Play Store/APK
// search, Wattpad, NPM search, Wikimedia, WHOIS/DNS/HTTP/server checks.
// OCR and vision have their own honest paths: Tesseract.js (.ocr plugin)
// and Library/actions/vision.js (verified HTTP 500, provider auth broken).

const axios = require('axios')
const xcasper = require('./xcasper')
const { searchShow } = require('./movie')
const { webSearch } = require('./web-search')
const { analyzeImageFromUrl, VISION_UNAVAILABLE_MESSAGE } = require('./vision')
const advanced = require('./advanced')

const UNAVAILABLE = {
    'Legacy Gifted API': 'The legacy Gifted API is retired; no verified endpoint exists.',
    'Unverified free provider': 'No verified free provider is configured for this feature.',
    'Image generation': 'Image generation is disabled: no verified Xcasper image-generation endpoint is currently available.',
    Weather: 'Weather is unavailable.',
    Lyrics: 'Lyrics lookup is unavailable: no verified lyrics endpoint is configured.',
    Wikipedia: 'Wikipedia lookup is unavailable.',
    'Web search': 'Web search is unavailable.',
    Dictionary: 'Dictionary lookup is unavailable.',
    'Bible lookup': 'Bible lookup is unavailable.',
    'Wallpaper search': 'Wallpaper search is unavailable.',
    News: 'News lookup is unavailable.',
    'Audio identification': 'Audio identification is unavailable: no verified Shazam endpoint is configured.',
    'Spotify search': 'Spotify search is unavailable: no verified Spotify endpoint is configured.',
    'Twitter/X download': 'Twitter/X downloads are unavailable: no verified endpoint is configured.',
    'Facebook download': 'Facebook downloads are unavailable: no verified endpoint is configured.',
    'Spotify download': 'Spotify downloads are unavailable: no verified endpoint is configured.',
    'Background removal': 'Background removal is unavailable: no verified endpoint is configured.',
    'QR reading': 'QR reading is unavailable: no verified endpoint is configured.',
    OCR: 'OCR via the legacy provider is unavailable. Use the bundled Tesseract.js OCR (.ocr on a quoted image) instead.',
    'Image upscaling': 'Image upscaling is unavailable: no verified endpoint is configured.',
    Transcription: 'Transcription is unavailable: no verified speech-to-text endpoint is configured. Set OPENAI_API_KEY to enable Whisper transcription via .transcribe.',
    WHOIS: 'WHOIS lookup is unavailable: no verified endpoint is configured.',
    'Live scores': 'Live scores are unavailable: no verified endpoint is configured.',
    'Sports predictions': 'Sports predictions are unavailable: no verified endpoint is configured.',
    'League standings': 'League standings are unavailable: no verified endpoint is configured.',
    'Football news': 'Football news is unavailable: no verified endpoint is configured.',
    'Crypto prices': 'Crypto prices are unavailable.',
    'Movie lookup': 'Movie lookup is unavailable.',
    'Anime lookup': 'Anime lookup is unavailable: the anime catalogue endpoint (Jikan) could not be reached.',
    'IP lookup': 'IP lookup is unavailable.',
    'Stock lookup': 'Stock lookup is unavailable.',
    'Currency conversion': 'Currency conversion is unavailable.',
    'GitHub lookup': 'GitHub lookup is unavailable.',
    'DNS check': 'DNS lookup is unavailable: no verified endpoint is configured.',
    'HTTP headers': 'HTTP header lookup is unavailable: no verified endpoint is configured.',
    'Server check': 'Server checks are unavailable: no verified endpoint is configured.',
    'Binary encoding': 'Binary encoding is unavailable.',
    'Binary decoding': 'Binary decoding is unavailable.',
    'Base64 encoding': 'Base64 encoding is unavailable.',
    'Base64 decoding': 'Base64 decoding is unavailable.',
    'Fancy text': 'Fancy text is unavailable.',
    'Text-to-picture': 'Text-to-picture is unavailable.',
    'Emoji mixing': 'Emoji mixing is unavailable.',
    'Code encryption': 'Code encryption is unavailable.',
    'HTML obfuscation': 'HTML obfuscation is unavailable.',
    'Code image': 'Code images are unavailable.',
    'PDF generation': 'PDF generation is unavailable.',
    'Quote cards': 'Quote cards are unavailable.',
    'Canvas cards': 'Canvas cards are unavailable.',
    'Website download': 'Website download is unavailable.',
    'Image search': 'Image search is unavailable: no verified endpoint is configured.',
    'Sticker search': 'Sticker search is unavailable: no verified endpoint is configured.',
    'Spotify lyrics': 'Spotify lyrics are unavailable.',
    'Spotify playlist': 'Spotify playlists are unavailable.',
    'SoundCloud search': 'SoundCloud search is unavailable: no verified endpoint is configured.',
    'HearThis search': 'HearThis search is unavailable: no verified endpoint is configured.',
    'HearThis set': 'HearThis sets are unavailable.',
    'Chord search': 'Chord search is unavailable: no verified endpoint is configured.',
    Definitions: 'Definitions are unavailable.',
    'Wikimedia search': 'Wikimedia search is unavailable: no verified endpoint is configured.',
    'Play Store search': 'Play Store search is unavailable: no verified endpoint is configured.',
    'APK search': 'APK search is unavailable: no verified endpoint is configured.',
    'NPM search': 'NPM search is unavailable: no verified endpoint is configured.',
    'Wattpad search': 'Wattpad search is unavailable: no verified endpoint is configured.',
    'Intent classification': 'Intent classification is unavailable.'
}

const unavailableReason = feature => UNAVAILABLE[feature] || `${feature} is unavailable: no verified endpoint is configured.`
// A provider with no verified implementation returns null — the falsy value
// every caller already treats as "not available". Never return a truthy
// `{ success: false }` object: callers read fields off it as real data.
const unsupported = () => async () => null

const textResult = async result => result?.success ? result.text : null

const gtChat = async (q, systemPrompt = '') => textResult(await xcasper.chat([
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: String(q || '') }
]))
// Vision is explicitly unavailable (verified HTTP 500 / provider 401 — see
// Library/actions/vision.js). Returns the description text, or null.
const gtVision = async (imageUrl, prompt) => {
    const result = await analyzeImageFromUrl(imageUrl, prompt)
    return result?.success ? result.result : null
}
const gtYtSearch = async query => xcasper.youtubeSearch(query)
const gtYtMp3 = async url => xcasper.youtubeAudio(url)
const gtYtMp4 = async url => xcasper.youtubeVideo(url)
const gtTikTok = async url => xcasper.tiktok(url)
const gtInstagram = async url => xcasper.instagram(url)
const gtCreateQr = async text => xcasper.qr(text)
const gtScreenshot = async url => xcasper.screenshot(url)
const gtTikTokSearch = async query => xcasper.tiktokSearch(query)
const gtTranslate = async (text, to = 'en', from = 'auto') => textResult(await xcasper.chat([{ role: 'user', content: `Translate from ${from} to ${to}. Return only the translation.\n\n${text}` }]))

// ── Real no-key providers (verified live 2026-11-24) ─────────────────────────

const gtGoogle = async query => {
    const res = await webSearch(query)
    if (!res?.success || !res.results?.length) return null
    return res.results.map(r => ({ title: r.title, snippet: r.snippet, link: r.url, url: r.url }))
}

const gtWiki = async topic => {
    try {
        const res = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(topic || '').trim())}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'BeraBot/3.0' }, timeout: 12000, proxy: false
        })
        const d = res.data || {}
        if (!d.extract) return null
        return { title: d.title || topic, extract: d.extract, url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(topic).trim())}` }
    } catch { return null }
}

const gtWeather = async city => {
    const w = await advanced.weather(city)
    if (!w?.success) return null
    return {
        city: w.name, country: w.country, temp: w.temp_c, feels: w.feels,
        desc: w.desc, humidity: w.humidity, wind: w.wind, uv: w.uv, forecast: []
    }
}

const gtCrypto = async coins => {
    const list = (Array.isArray(coins) ? coins : [coins]).filter(Boolean)
    const out = []
    for (const coin of list.slice(0, 8)) {
        const d = await advanced.crypto_price(String(coin))
        if (!d?.success) continue
        out.push({
            name: d.name, symbol: d.symbol, current_price: d.price_usd,
            price_change_percentage_24h: Number(d.price_change_24h), market_cap: d.market_cap
        })
    }
    return out.length ? out : null
}

const gtStock = async symbol => {
    const d = await advanced.stockQuote(symbol)
    return d?.success ? d : null
}

const gtCurrency = async (amount, from, to) => {
    const d = await advanced.currency(amount, from, to)
    if (!d?.success) return null
    return { result: d.result, rate: Number(d.rate), from: d.from, to: d.to, amount: d.amount }
}

const gtMovie = async title => {
    const d = await searchShow(title)
    return d?.success ? d : null
}

const gtIpInfo = async ip => {
    const d = await advanced.ip_info(ip)
    return d?.success ? d : null
}

const gtNews = async topic => {
    const d = await advanced.news(topic)
    if (!d?.success || !d.articles?.length) return null
    return d.articles
}

const gtBible = async verse => {
    try {
        const res = await axios.get(`https://bible-api.com/${encodeURIComponent(String(verse || '').trim().replace(/\s+/g, '+'))}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'BeraBot/3.0' }, timeout: 12000, proxy: false
        })
        const d = res.data || {}
        const text = (d.verses || []).map(v => v.text).join(' ').trim() || d.text || ''
        if (!text) return null
        return { verse: d.reference || verse, data: text, text }
    } catch { return null }
}

const dictionaryLookup = async word => {
    try {
        const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(String(word || '').trim().split(/\s+/)[0])}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'BeraBot/3.0' }, timeout: 12000, proxy: false
        })
        const entry = Array.isArray(res.data) ? res.data[0] : null
        if (!entry) return null
        const meaning = (entry.meanings || [])[0] || {}
        return {
            word: entry.word || word,
            phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '',
            meaning: {
                partOfSpeech: meaning.partOfSpeech || '',
                definitions: (meaning.definitions || []).map(def => ({ definition: def.definition, example: def.example || '' }))
            },
            meanings: entry.meanings || []
        }
    } catch { return null }
}
const gtDictionary = dictionaryLookup
const gtDefine = dictionaryLookup

// ── Still unavailable: null + reason in UNAVAILABLE ──────────────────────────

const gt = unsupported('Legacy Gifted API')
const free = unsupported('Unverified free provider')
const gtImage = unsupported('Image generation')
const gtLyrics = unsupported('Lyrics')
const gtWallpaper = unsupported('Wallpaper search')
const gtShazam = unsupported('Audio identification')
const gtSpotifySearch = unsupported('Spotify search')
const gtTwitter = unsupported('Twitter/X download')
const gtFacebook = unsupported('Facebook download')
const gtSpotifyDl = unsupported('Spotify download')
const gtRemoveBg = unsupported('Background removal')
const gtReadQr = unsupported('QR reading')
const gtOcr = unsupported('OCR')
const gtUpscale = unsupported('Image upscaling')
const gtTranscript = unsupported('Transcription')
const gtWhois = unsupported('WHOIS')
const gtLiveScore = unsupported('Live scores')
const gtPredictions = unsupported('Sports predictions')
const gtStandings = unsupported('League standings')
const gtFootballNews = unsupported('Football news')
const gtAnime = unsupported('Anime lookup')
const gtGithub = unsupported('GitHub lookup')
const gtDnsCheck = unsupported('DNS check')
const gtHttpHeaders = unsupported('HTTP headers')
const gtServerCheck = unsupported('Server check')
const gtEncodeBinary = unsupported('Binary encoding')
const gtDecodeBinary = unsupported('Binary decoding')
const gtEncodeBase64 = unsupported('Base64 encoding')
const gtDecodeBase64 = unsupported('Base64 decoding')
const gtFancyText = unsupported('Fancy text')
const gtFancyTextV2 = unsupported('Fancy text')
const gtTtp = unsupported('Text-to-picture')
const gtEmojiMix = unsupported('Emoji mixing')
const gtEncryptCode = unsupported('Code encryption')
const gtEncryptCodeV2 = unsupported('Code encryption')
const gtEncryptCodeV3 = unsupported('Code encryption')
const gtHtmlObfuscate = unsupported('HTML obfuscation')
const gtCarbonCode = unsupported('Code image')
const gtToPdf = unsupported('PDF generation')
const gtQuoteCard = unsupported('Quote cards')
const gtCanvasCard = unsupported('Canvas cards')
const gtSsPhone = gtScreenshot
const gtSsTab = gtScreenshot
const gtSsPc = gtScreenshot
const gtWeb2Zip = unsupported('Website download')
const gtGoogleImages = unsupported('Image search')
const gtUnsplash = unsupported('Image search')
const gtStickerSearch = unsupported('Sticker search')
const gtLyricsV2 = unsupported('Lyrics')
const gtSpotifyLyrics = unsupported('Spotify lyrics')
const gtSpotifyPlaylist = unsupported('Spotify playlist')
const gtSoundCloud = unsupported('SoundCloud search')
const gtHearthis = unsupported('HearThis search')
const gtHearthisSet = unsupported('HearThis set')
const gtChord = unsupported('Chord search')
const gtWikimedia = unsupported('Wikimedia search')
const gtPlaystore = unsupported('Play Store search')
const gtHappyMod = unsupported('APK search')
const gtApkMirror = unsupported('APK search')
const gtNpmSearch = unsupported('NPM search')
const gtWattpad = unsupported('Wattpad search')
const gtIntent = unsupported('Intent classification')

const GT = ''
const KEY = ''
const GT_LEAGUES = {}

module.exports = {
    gt, free, gtChat, gtVision, gtImage, gtWeather, gtLyrics, gtWiki, gtGoogle, gtDictionary, gtBible, gtWallpaper,
    gtNews, gtShazam, gtSpotifySearch, gtYtSearch, gtYtMp3, gtYtMp4, gtTikTok, gtInstagram, gtTwitter, gtFacebook,
    gtSpotifyDl, gtRemoveBg, gtCreateQr, gtReadQr, gtScreenshot, gtOcr, gtUpscale, gtTranscript, gtWhois,
    gtLiveScore, gtPredictions, gtStandings, gtFootballNews, gtCrypto, gtTranslate, gtMovie, gtAnime, gtIpInfo,
    gtStock, gtCurrency, gtGithub, gtDnsCheck, gtHttpHeaders, gtServerCheck, gtEncodeBinary, gtDecodeBinary,
    gtEncodeBase64, gtDecodeBase64, gtFancyText, gtFancyTextV2, gtTtp, gtEmojiMix, gtEncryptCode, gtEncryptCodeV2,
    gtEncryptCodeV3, gtHtmlObfuscate, gtCarbonCode, gtToPdf, gtQuoteCard, gtCanvasCard, gtSsPhone, gtSsTab, gtSsPc,
    gtWeb2Zip, gtGoogleImages, gtUnsplash, gtTikTokSearch, gtStickerSearch, gtLyricsV2, gtSpotifyLyrics,
    gtSpotifyPlaylist, gtSoundCloud, gtHearthis, gtHearthisSet, gtChord, gtDefine, gtWikimedia, gtPlaystore,
    gtHappyMod, gtApkMirror, gtNpmSearch, gtWattpad, gtIntent, GT, KEY, GT_LEAGUES,
    UNAVAILABLE, unavailableReason, VISION_UNAVAILABLE_MESSAGE
}
