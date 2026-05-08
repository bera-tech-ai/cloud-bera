const axios = require('axios')

const APISKEITH = 'https://apiskeith.top'
const GIFTED    = 'https://api.giftedtech.co.ke'
const GIFTED_KEY = 'gifted'

// ── URL extractor ─────────────────────────────────────────────────────────────
const toUrl = (v) => {
    if (typeof v === 'string' && v.startsWith('http')) return v
    if (v && typeof v === 'object') {
        const inner = v.download || v.url || v.link || v.src || v.uri || v.mp3 ||
            v.hqDefault || v.high || v.medium || v.default
        if (typeof inner === 'string' && inner.startsWith('http')) return inner
        if (Array.isArray(v) && v.length) return toUrl(v[0])
    }
    return ''
}

// ── SoundCloud Search ─────────────────────────────────────────────────────────
const searchSoundCloud = async (query) => {
    try {
        const res = await axios.get(`${APISKEITH}/search/soundcloud`, {
            params: { q: query, query },
            timeout: 20000
        })
        const outer = res.data?.result
        // Response is { result: { result: [...] } }
        const arr = Array.isArray(outer) ? outer
            : (Array.isArray(outer?.result) ? outer.result
            : (Array.isArray(res.data?.results) ? res.data.results : []))
        if (arr.length) {
            return { success: true, results: arr.slice(0, 5) }
        }
    } catch {}
    return { success: false, error: 'SoundCloud search failed' }
}

// ── SoundCloud Download ───────────────────────────────────────────────────────
const downloadSoundCloud = async (scUrl) => {
    try {
        const res = await axios.get(`${APISKEITH}/download/soundcloud`, {
            params: { url: scUrl },
            timeout: 30000
        })
        const d = res.data
        if (!d?.success) return { success: false, error: d?.message || 'SoundCloud download failed' }
        // Pick first non-chunked MP3 media
        const medias = d.data?.medias || []
        const best = medias.find(m => !m.chunked && m.audioAvailable && m.extension === 'mp3') ||
                     medias.find(m => !m.chunked && m.audioAvailable) ||
                     medias[0]
        const audioUrl = best?.url
        if (!audioUrl || !audioUrl.startsWith('http')) return { success: false, error: 'No audio URL found' }
        return {
            success: true,
            url: audioUrl,
            title: d.data?.title || '',
            thumbnail: d.data?.thumbnail || '',
            duration: d.data?.duration || '',
            artist: d.data?.artist || ''
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ── YouTube Search ────────────────────────────────────────────────────────────
const searchYoutube = async (query) => {
    const endpoints = [
        `${APISKEITH}/search/yts`,
        `${APISKEITH}/search/youtube`,
    ]
    for (const ep of endpoints) {
        try {
            const res = await axios.get(ep, { params: { q: query, query }, timeout: 15000 })
            const results = res.data?.result || res.data?.results || res.data?.data || res.data
            if (Array.isArray(results) && results.length > 0) {
                return { success: true, results: results.slice(0, 5) }
            }
        } catch { continue }
    }
    return { success: false, error: 'YouTube search failed' }
}

// ── YouTube Audio Download (GIFTED → KEITH only) ──────────────────────────────
const downloadAudio = async (videoUrl) => {
    const endpoints = [
        // ── PRIMARY: Gifted Tech ─────────────────────────────────────────────
        { base: GIFTED,    path: '/api/download/dlmp3',  param: 'url', auth: true },
        { base: GIFTED,    path: '/api/download/ytmp3',  param: 'url', auth: true },
        // ── FALLBACK: Keith ──────────────────────────────────────────────────
        { base: APISKEITH, path: '/download/ytmp3',      param: 'url' },
        { base: APISKEITH, path: '/download/dlmp3',      param: 'url' },
        { base: APISKEITH, path: '/download/mp3',        param: 'url' },
        { base: APISKEITH, path: '/download/ytdl',       param: 'url' },
    ]
    for (const ep of endpoints) {
        try {
            const params = { [ep.param]: videoUrl }
            if (ep.auth) params.apikey = GIFTED_KEY
            const res = await axios.get(`${ep.base}${ep.path}`, { params, timeout: 45000 })
            const data = res.data
            if (data?.status === false || data?.success === false) continue
            const audioUrl = toUrl(data?.result) || toUrl(data?.url) ||
                toUrl(data?.audio) || toUrl(data?.download) || toUrl(data?.mp3)
            if (audioUrl) {
                return { success: true, url: audioUrl, audioUrl, title: data?.result?.title || data?.title || '' }
            }
        } catch { continue }
    }
    return { success: false, error: 'All audio download endpoints failed' }
}

// ── YouTube Video Download (GIFTED → KEITH only) ──────────────────────────────
const downloadVideo = async (videoUrl) => {
    const endpoints = [
        // ── PRIMARY: Gifted Tech ─────────────────────────────────────────────
        { base: GIFTED,    path: '/api/download/dlmp4',  param: 'url', auth: true },
        { base: GIFTED,    path: '/api/download/ytmp4',  param: 'url', auth: true },
        // ── FALLBACK: Keith ──────────────────────────────────────────────────
        { base: APISKEITH, path: '/download/ytmp4',      param: 'url' },
        { base: APISKEITH, path: '/download/dlmp4',      param: 'url' },
        { base: APISKEITH, path: '/download/ytdl',       param: 'url' },
    ]
    for (const ep of endpoints) {
        try {
            const params = { [ep.param]: videoUrl }
            if (ep.auth) params.apikey = GIFTED_KEY
            const res = await axios.get(`${ep.base}${ep.path}`, { params, timeout: 60000 })
            const data = res.data
            if (data?.status === false || data?.success === false) continue
            const videoUrl2 = toUrl(data?.result) || toUrl(data?.url) ||
                toUrl(data?.video) || toUrl(data?.download) || toUrl(data?.mp4)
            if (videoUrl2) {
                return { success: true, url: videoUrl2, title: data?.result?.title || data?.title || '' }
            }
        } catch { continue }
    }
    return { success: false, error: 'All video download endpoints failed' }
}

// ── MAIN: Search and Download Audio (SoundCloud-first) ────────────────────────
const searchAndDownload = async (query) => {
    // ─ Step 1: Try SoundCloud search + download ─────────────────────────────
    const scSearch = await searchSoundCloud(query)
    if (scSearch.success && scSearch.results.length > 0) {
        const top = scSearch.results[0]
        const scUrl = top.url || top.permalink_url || top.link
        if (scUrl) {
            const dl = await downloadSoundCloud(scUrl)
            if (dl.success) {
                return {
                    success: true,
                    audioUrl: dl.url,
                    title: top.title || dl.title || query,
                    channel: top.artist || top.user?.username || 'SoundCloud',
                    duration: top.timestamp || top.duration || dl.duration || '',
                    thumbnail: top.thumb || top.thumbnail || dl.thumbnail || '',
                    source: 'soundcloud'
                }
            }
        }
    }

    // ─ Step 2: Fallback — YouTube search + Ostyado download ─────────────────
    const ytSearch = await searchYoutube(query)
    if (!ytSearch.success) {
        return { success: false, error: 'No results found for that song. Try a different name.' }
    }

    const top = ytSearch.results[0]
    const videoUrl = toUrl(top?.url) || toUrl(top?.link) ||
        (top?.id ? `https://youtube.com/watch?v=${top.id}` : '')

    if (!videoUrl) return { success: false, error: 'Could not extract video URL' }

    const dl = await downloadAudio(videoUrl)
    if (!dl.success) return { success: false, error: `Could not download audio: ${dl.error}` }

    const thumbnail = toUrl(top?.thumbnail) || toUrl(top?.image) || toUrl(top?.thumbnails) || ''
    const duration = typeof top?.duration === 'string' ? top.duration
        : (typeof top?.duration?.text === 'string' ? top.duration.text : '')
    const channel = top?.author?.name || top?.channel?.name ||
        (typeof top?.channel === 'string' ? top.channel : '') || top?.channelTitle || ''

    return {
        success: true,
        audioUrl: dl.url,
        title: top?.title || dl.title || query,
        channel: typeof channel === 'string' ? channel : '',
        duration,
        thumbnail,
        source: 'youtube'
    }
}

// ── MAIN: Search and Download Video ──────────────────────────────────────────
const searchAndDownloadVideo = async (query) => {
    const ytSearch = await searchYoutube(query)
    if (!ytSearch.success) return { success: false, error: ytSearch.error }

    const top = ytSearch.results[0]
    const videoUrl = toUrl(top?.url) || toUrl(top?.link) ||
        (top?.id ? `https://youtube.com/watch?v=${top.id}` : '')

    if (!videoUrl) return { success: false, error: 'Could not extract video URL' }

    const dl = await downloadVideo(videoUrl)
    if (!dl.success) return { success: false, error: dl.error }

    const thumbnail = toUrl(top?.thumbnail) || toUrl(top?.image) || toUrl(top?.thumbnails) || ''
    const duration = typeof top?.duration === 'string' ? top.duration
        : (typeof top?.duration?.text === 'string' ? top.duration.text : '')
    const channel = top?.author?.name || top?.channel?.name ||
        (typeof top?.channel === 'string' ? top.channel : '') || top?.channelTitle || ''

    return {
        success: true,
        videoUrl: dl.url,
        title: top?.title || dl.title || query,
        channel: typeof channel === 'string' ? channel : '',
        duration,
        thumbnail,
        source: 'youtube'
    }
}

module.exports = {
    searchSoundCloud, downloadSoundCloud,
    searchYoutube, downloadAudio, downloadVideo,
    searchAndDownload, searchAndDownloadVideo
}
