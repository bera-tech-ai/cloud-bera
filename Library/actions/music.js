const axios = require('axios')

const GIFTED     = 'https://api.gifted.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'
const ENCODED_KEY = encodeURIComponent(GIFTED_KEY)

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

// ── API 1: Gifted play search (primary) ────────────────────────────────────────
const giftedPlay = async (query) => {
    const endpoints = [
        `${GIFTED}/api/download/ytmp3`,
        `${GIFTED}/api/download/dlmp3`,
    ]
    // First search for the video
    try {
        const searchRes = await axios.get(`${GIFTED}/api/search/yts`, {
            params: { query, apikey: ENCODED_KEY },
            timeout: 15000
        })
        const results = searchRes.data?.results
        const videos = Array.isArray(results) ? results.filter(i => i.type === 'video') : []
        if (!videos.length) return null
        const top = videos[0]
        const videoUrl = top?.url || (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : '') || toUrl(top?.link)
        if (!videoUrl) return null
        for (const ep of endpoints) {
            try {
                const dlRes = await axios.get(ep, {
                    params: { url: videoUrl, apikey: ENCODED_KEY },
                    timeout: 45000
                })
                const data = dlRes.data
                if (data?.status === false || data?.success === false) continue
                const audioUrl = toUrl(data?.result) || toUrl(data?.url) || toUrl(data?.audio) || toUrl(data?.download) || toUrl(data?.mp3)
                if (audioUrl) return {
                    success: true, audioUrl,
                    title: top?.title || data?.result?.title || data?.title || query,
                    channel: typeof top?.author?.name === 'string' ? top.author.name : '',
                    duration: top?.timestamp || top?.duration?.timestamp || '',
                    thumbnail: top?.thumbnail || top?.image || '',
                    source: 'gifted'
                }
            } catch { continue }
        }
    } catch {}
    return null
}

// ── API 2: ToxicAPIs (backup) ──────────────────────────────────────────────────
const toxicPlay = async (query) => {
    const APIS = [
        { url: 'https://apiz.xhclinton.me/api/play', params: { apikey: 'toxicapis', q: query } },
        { url: 'https://api.xhclinton.me/api/play',  params: { apikey: 'toxicapis', q: query } },
    ]
    for (const api of APIS) {
        try {
            const res = await axios.get(api.url, { params: api.params, timeout: 25000 })
            const d = res.data
            if (!d || d.status === false || d.success === false) continue
            const audioUrl = toUrl(d.download) || toUrl(d.audio) || toUrl(d.url) ||
                toUrl(d.result?.download) || toUrl(d.result?.url) || toUrl(d.result)
            if (!audioUrl) continue
            return {
                success: true, audioUrl,
                title: d.title || d.result?.title || query,
                channel: d.artist || d.author || d.result?.artist || '',
                duration: d.duration || d.result?.duration || '',
                thumbnail: d.thumbnail || d.result?.thumbnail || '',
                source: 'toxicapis'
            }
        } catch { continue }
    }
    return null
}

// ── API 3: Cobalt.tools (open-source, no key needed) ───────────────────────────
const cobaltDownload = async (videoUrl) => {
    try {
        const res = await axios.post('https://cobalt.tools/api/json', {
            url: videoUrl, vCodec: 'h264', vQuality: '720', aFormat: 'mp3', isAudioOnly: true
        }, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 })
        const url = res.data?.url
        if (url) return { success: true, url }
    } catch {}
    return null
}

// ── YouTube search (multi-source) ────────────────────────────────────────────
const searchYoutube = async (query) => {
    // Try Gifted search first
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
    } catch {}

    // Fallback: YouTube Data API via public search proxy
    try {
        const res = await axios.get(`https://yt.lemnoslife.com/noKey/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5`, {
            timeout: 10000
        })
        const items = res.data?.items
        if (Array.isArray(items) && items.length) {
            const mapped = items.map(it => ({
                type: 'video',
                title: it.snippet?.title,
                videoId: it.id?.videoId,
                url: `https://youtube.com/watch?v=${it.id?.videoId}`,
                thumbnail: it.snippet?.thumbnails?.default?.url || '',
                author: { name: it.snippet?.channelTitle || '' }
            })).filter(v => v.videoId)
            if (mapped.length) return { success: true, results: mapped }
        }
    } catch {}

    return { success: false, error: 'YouTube search failed on all sources' }
}

// ── YouTube Audio Download (multi-source) ────────────────────────────────────
const downloadAudio = async (videoUrl) => {
    const giftedEndpoints = [
        { path: '/api/download/ytmp3', param: 'url' },
        { path: '/api/download/dlmp3', param: 'url' },
    ]
    for (const ep of giftedEndpoints) {
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
    // Try cobalt as last resort
    const cobalt = await cobaltDownload(videoUrl)
    if (cobalt?.success) return { success: true, url: cobalt.url, title: '' }
    return { success: false, error: 'Audio download failed on all sources' }
}

// ── YouTube Video Download via Gifted ─────────────────────────────────────────
const downloadVideo = async (videoUrl) => {
    const endpoints = [
        { path: '/api/download/ytmp4', param: 'url' },
        { path: '/api/download/dlmp4', param: 'url' },
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
// Chain: Gifted search+dl → ToxicAPIs → cobalt
const searchAndDownload = async (query) => {
    // 1. Gifted: search + download in one chain
    const gifted = await giftedPlay(query)
    if (gifted?.success) return gifted

    // 2. ToxicAPIs direct search+download
    const toxic = await toxicPlay(query)
    if (toxic?.success) return toxic

    // 3. Manual YouTube search + audio download
    const ytSearch = await searchYoutube(query)
    if (!ytSearch.success) {
        return { success: false, error: 'No results found for that song. Try a different name.' }
    }

    const top = ytSearch.results[0]
    const videoUrl = top?.url || (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : '') || toUrl(top?.link)
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
    const videoUrl = top?.url || (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : '') || toUrl(top?.link)
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
