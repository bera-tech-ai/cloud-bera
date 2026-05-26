const axios = require('axios')

const GIFTED     = 'https://api.giftedtech.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'
const ENCODED_KEY = encodeURIComponent(GIFTED_KEY)

const TOXIC_API  = 'https://apiz.xhclinton.me/api/play'
const TOXIC_KEY  = 'toxicapis'

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

// ── PRIMARY: ToxicAPIs play endpoint ─────────────────────────────────────────
const toxicPlay = async (query) => {
    try {
        const res = await axios.get(TOXIC_API, {
            params: { apikey: TOXIC_KEY, q: query },
            timeout: 30000
        })
        const d = res.data
        if (!d || d.status === false || d.success === false) return null

        const audioUrl = toUrl(d.download) || toUrl(d.audio) || toUrl(d.url) ||
            toUrl(d.result?.download) || toUrl(d.result?.url) || toUrl(d.result)

        if (!audioUrl) return null

        return {
            success: true,
            audioUrl,
            title:     d.title     || d.result?.title     || query,
            channel:   d.artist    || d.author            || d.result?.artist    || '',
            duration:  d.duration  || d.result?.duration  || '',
            thumbnail: d.thumbnail || d.result?.thumbnail || '',
            source:    'toxicapis'
        }
    } catch { return null }
}

// ── FALLBACK: YouTube Search via Gifted ───────────────────────────────────────
const searchYoutube = async (query) => {
    try {
        const res = await axios.get(`${GIFTED}/api/search/yts`, {
            params: { query, apikey: ENCODED_KEY },
            timeout: 15000
        })
        const results = res.data?.results
        if (Array.isArray(results) && results.length) {
            const videos = results.filter(item => item.type === 'video')
            if (videos.length) return { success: true, results: videos.slice(0, 5) }
        }
        return { success: false, error: 'No video results found' }
    } catch (e) {
        return { success: false, error: 'YouTube search failed' }
    }
}

// ── FALLBACK: YouTube Audio Download via Gifted ───────────────────────────────
const downloadAudio = async (videoUrl) => {
    const endpoints = [
        { path: '/api/download/dlmp3', param: 'url' },
        { path: '/api/download/ytmp3', param: 'url' },
    ]
    for (const ep of endpoints) {
        try {
            const res = await axios.get(`${GIFTED}${ep.path}`, {
                params: { [ep.param]: videoUrl, apikey: ENCODED_KEY },
                timeout: 45000
            })
            const data = res.data
            if (data?.status === false || data?.success === false) continue
            const audioUrl = toUrl(data?.result) || toUrl(data?.url) ||
                toUrl(data?.audio) || toUrl(data?.download) || toUrl(data?.mp3)
            if (audioUrl) return { success: true, url: audioUrl, title: data?.result?.title || data?.title || '' }
        } catch { continue }
    }
    return { success: false, error: 'Audio download failed' }
}

// ── YouTube Video Download via Gifted ─────────────────────────────────────────
const downloadVideo = async (videoUrl) => {
    const endpoints = [
        { path: '/api/download/dlmp4', param: 'url' },
        { path: '/api/download/ytmp4', param: 'url' },
    ]
    for (const ep of endpoints) {
        try {
            const res = await axios.get(`${GIFTED}${ep.path}`, {
                params: { [ep.param]: videoUrl, apikey: ENCODED_KEY },
                timeout: 60000
            })
            const data = res.data
            if (data?.status === false || data?.success === false) continue
            const videoUrl2 = toUrl(data?.result) || toUrl(data?.url) ||
                toUrl(data?.video) || toUrl(data?.download) || toUrl(data?.mp4)
            if (videoUrl2) return { success: true, url: videoUrl2, title: data?.result?.title || data?.title || '' }
        } catch { continue }
    }
    return { success: false, error: 'Video download failed' }
}

// ── MAIN: Search and Download Audio ──────────────────────────────────────────
// Primary: ToxicAPIs → Fallback: Gifted YouTube
const searchAndDownload = async (query) => {
    // 1. Try ToxicAPIs first (fastest, direct search+download)
    const toxic = await toxicPlay(query)
    if (toxic && toxic.success && toxic.audioUrl) return toxic

    // 2. Fallback: Gifted YouTube search + download
    const ytSearch = await searchYoutube(query)
    if (!ytSearch.success) {
        return { success: false, error: 'No results found for that song. Try a different name.' }
    }

    const top = ytSearch.results[0]
    const videoUrl = top?.url || toUrl(top?.link) ||
        (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : '')

    if (!videoUrl) return { success: false, error: 'Could not extract video URL' }

    const dl = await downloadAudio(videoUrl)
    if (!dl.success) return { success: false, error: `Could not download audio: ${dl.error}` }

    const thumbnail = top?.thumbnail || top?.image || toUrl(top?.thumbnails) || ''
    const duration  = top?.timestamp || top?.duration?.timestamp || ''
    const channel   = typeof top?.author?.name === 'string' ? top.author.name : ''

    return {
        success: true,
        audioUrl: dl.url,
        title: top?.title || dl.title || query,
        channel,
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
    const videoUrl = top?.url || toUrl(top?.link) ||
        (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : '')

    if (!videoUrl) return { success: false, error: 'Could not extract video URL' }

    const dl = await downloadVideo(videoUrl)
    if (!dl.success) return { success: false, error: dl.error }

    const thumbnail = top?.thumbnail || top?.image || toUrl(top?.thumbnails) || ''
    const duration  = top?.timestamp || top?.duration?.timestamp || ''
    const channel   = typeof top?.author?.name === 'string' ? top.author.name : ''

    return {
        success: true,
        videoUrl: dl.url,
        title: top?.title || dl.title || query,
        channel,
        duration,
        thumbnail,
        source: 'youtube'
    }
}

module.exports = {
    searchYoutube,
    downloadAudio,
    downloadVideo,
    searchAndDownload,
    searchAndDownloadVideo
}
