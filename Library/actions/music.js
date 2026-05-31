'use strict'
const axios = require('axios')
const { exec, execSync } = require('child_process')
const fs = require('fs')

const GIFTED        = 'https://api.gifted.co.ke'
const GIFTED_KEY    = '_0u5aff45,_0l1876s8qc'
const GIFTED_SEARCH = 'gifted'
const SILVATECH     = 'https://api.silvatech.co.ke'

// ── URL extractor ─────────────────────────────────────────────────────────────
const toUrl = (v) => {
    if (typeof v === 'string' && v.startsWith('http')) return v
    if (v && typeof v === 'object') {
        for (const k of ['download','url','link','src','uri','mp3','audio','hqDefault','high','medium','default','stream','file']) {
            const inner = v[k]
            if (typeof inner === 'string' && inner.startsWith('http')) return inner
        }
        if (Array.isArray(v) && v.length) return toUrl(v[0])
    }
    return ''
}

// ── YouTube video ID extractor ────────────────────────────────────────────────
const getVideoId = (url) => {
    const m = (url || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
}

// ── YouTube search ─────────────────────────────────────────────────────────────
const searchYoutube = async (query) => {
    // 1a. Gifted YTS with search key
    try {
        const res = await axios.get(`${GIFTED}/api/search/yts`, {
            params: { query, apikey: GIFTED_SEARCH }, timeout: 12000
        })
        const results = res.data?.results || res.data?.data || res.data?.videos
        if (Array.isArray(results) && results.length) {
            const videos = results.filter(item => item.videoId || item.id || item.url)
            if (videos.length) return { success: true, results: videos.slice(0, 5) }
        }
    } catch {}

    // 1b. Gifted YTS with alternate key
    try {
        const res = await axios.get(`${GIFTED}/api/search/yts`, {
            params: { query, apikey: GIFTED_KEY }, timeout: 12000
        })
        const results = res.data?.results || res.data?.data || res.data?.videos
        if (Array.isArray(results) && results.length) {
            const videos = results.filter(item => item.videoId || item.id || item.url)
            if (videos.length) return { success: true, results: videos.slice(0, 5) }
        }
    } catch {}

    // 2. yt.lemnoslife.com (free, no key)
    try {
        const res = await axios.get(
            `https://yt.lemnoslife.com/noKey/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5`,
            { timeout: 10000 }
        )
        const items = res.data?.items
        if (Array.isArray(items) && items.length) {
            const mapped = items.map(it => ({
                type: 'video',
                title: it.snippet?.title,
                videoId: it.id?.videoId,
                url: `https://youtube.com/watch?v=${it.id?.videoId}`,
                thumbnail: it.snippet?.thumbnails?.medium?.url || '',
                author: { name: it.snippet?.channelTitle || '' }
            })).filter(v => v.videoId)
            if (mapped.length) return { success: true, results: mapped }
        }
    } catch {}

    // 3. Invidious search
    const INVIDIOUS = [
        'https://invidious.snopyta.org',
        'https://invidious.tiekoetter.com',
        'https://vid.puffyan.us',
    ]
    for (const inv of INVIDIOUS) {
        try {
            const res = await axios.get(`${inv}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, { timeout: 8000 })
            const items = Array.isArray(res.data) ? res.data.slice(0, 5) : []
            if (items.length) {
                return {
                    success: true,
                    results: items.map(v => ({
                        type: 'video',
                        title: v.title,
                        videoId: v.videoId,
                        url: `https://youtube.com/watch?v=${v.videoId}`,
                        thumbnail: v.videoThumbnails?.[0]?.url || '',
                        author: { name: v.author || '' },
                        duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds/60)}:${String(v.lengthSeconds%60).padStart(2,'0')}` : ''
                    }))
                }
            }
        } catch {}
    }

    return { success: false, error: 'YouTube search failed on all sources' }
}

// ── yt-dlp shell download (most reliable) ─────────────────────────────────────
const downloadViaYtdlp = async (videoUrl, audioOnly = true) => {
    const hasYtdlp = (() => {
        try { execSync('which yt-dlp 2>/dev/null', { timeout: 3000 }); return true } catch { return false }
    })()
    if (!hasYtdlp) return null

    const outFile = `/tmp/bera_yt_${Date.now()}.%(ext)s`
    const cmd = audioOnly
        ? `yt-dlp -x --audio-format mp3 --audio-quality 5 -o "${outFile}" --no-playlist --quiet --no-warnings "${videoUrl}" 2>&1`
        : `yt-dlp -f 'bestvideo[height<=480]+bestaudio/best[height<=480]' --merge-output-format mp4 -o "${outFile}" --no-playlist --quiet --no-warnings "${videoUrl}" 2>&1`

    return new Promise(resolve => {
        exec(cmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            try {
                const ext = audioOnly ? 'mp3' : 'mp4'
                const realFile = outFile.replace('%(ext)s', ext)
                if (fs.existsSync(realFile)) {
                    const buffer = fs.readFileSync(realFile)
                    fs.unlinkSync(realFile)
                    resolve({ success: true, buffer, title: '', ext })
                } else {
                    const dir = '/tmp'
                    const base = outFile.split('/').pop().replace('%(ext)s', '')
                    const match = fs.readdirSync(dir).find(f => f.startsWith(base))
                    if (match) {
                        const fullPath = `/tmp/${match}`
                        const buffer = fs.readFileSync(fullPath)
                        fs.unlinkSync(fullPath)
                        resolve({ success: true, buffer, title: '', ext: match.split('.').pop() })
                    } else {
                        resolve(null)
                    }
                }
            } catch { resolve(null) }
        })
    })
}

// ── Cobalt.tools v7+ public instances ─────────────────────────────────────────
const downloadViaCobalt = async (videoUrl) => {
    const COBALT_INSTANCES = [
        'https://cobalt.api.timelessnesses.me',
        'https://cobalt.api.lostluma.dev',
        'https://cobalt.api.itsrius.dev',
        'https://cobalt.api.bludda.de',
        'https://cobalt.api.nico.ninja',
        'https://co.wuk.sh',
    ]
    for (const instance of COBALT_INSTANCES) {
        try {
            const res = await axios.post(instance,
                { url: videoUrl, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' },
                {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 25000
                }
            )
            const url = res.data?.url
            if (url?.startsWith('http')) return { success: true, url, title: '' }
        } catch {}
    }
    return null
}

// ── Gifted primary download chain ─────────────────────────────────────────────
const downloadAudioGifted = async (videoUrl) => {
    // ytmp3 confirmed working — returns result.download_url
    const endpoints = [
        `/api/download/ytmp3`,
        `/api/download/savetubemp3`,
        `/api/download/yt`,
        `/api/download/ytdl`,
    ]
    for (const ep of endpoints) {
        try {
            const res = await axios.get(`${GIFTED}${ep}`, {
                params: { url: videoUrl, apikey: GIFTED_KEY, quality: '128kbps' },
                timeout: 45000
            })
            const data = res.data
            if (data?.status === false || data?.success === false) continue
            // /api/download/ytmp3 returns result.download_url
            const result = data?.result
            const audioUrl =
                (result && typeof result === 'object' ? result.download_url || result.downloadUrl || toUrl(result) : null) ||
                (typeof result === 'string' && result.startsWith('http') ? result : null) ||
                toUrl(data?.url) || toUrl(data?.audio) ||
                toUrl(data?.download) || toUrl(data?.mp3) || toUrl(data?.link)
            if (audioUrl) {
                const title = (result && typeof result === 'object' ? result.title : null) || data?.title || ''
                return { success: true, url: audioUrl, title }
            }
        } catch {}
    }
    return null
}

// ── Silvatech fallback ─────────────────────────────────────────────────────────
const downloadAudioSilvatech = async (videoUrl) => {
    try {
        const res = await axios.get(`${SILVATECH}/download/ytmp3`, {
            params: { url: videoUrl }, timeout: 30000
        })
        const data = res.data
        const audioUrl = toUrl(data?.download) || toUrl(data?.url) || toUrl(data?.audio) ||
                         toUrl(data?.result) || toUrl(data?.mp3)
        if (audioUrl) return { success: true, url: audioUrl, title: data?.title || '' }
    } catch {}
    return null
}

// ── Ocean Saver (free, no key) ────────────────────────────────────────────────
const downloadViaOceanSaver = async (videoUrl) => {
    try {
        const res = await axios.get(
            `https://p.oceansaver.in/ajax/download.php?copyright=0&format=mp3&url=${encodeURIComponent(videoUrl)}`,
            { timeout: 30000 }
        )
        const data = res.data
        if (data?.success !== 1) return null
        const progressUrl = data?.progress_url
        if (!progressUrl) return null
        // Poll for download URL
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 3000))
            try {
                const prog = await axios.get(progressUrl, { timeout: 10000 })
                if (prog.data?.download_url) {
                    return { success: true, url: prog.data.download_url, title: data?.title || '' }
                }
            } catch {}
        }
    } catch {}
    return null
}

// ── ZYnk API (reliable free MP3 downloader) ───────────────────────────────────
const downloadViaZynk = async (videoUrl) => {
    const videoId = getVideoId(videoUrl)
    if (!videoId) return null
    try {
        const res = await axios.get(
            `https://api.fabdl.com/youtube/get?url=${encodeURIComponent(videoUrl)}`,
            { timeout: 25000 }
        )
        const data = res.data?.result
        if (!data?.id) return null
        const dt = await axios.get(
            `https://api.fabdl.com/youtube/mp3/${data.id}`,
            { timeout: 25000 }
        )
        const dlUrl = dt.data?.result?.download_url
        if (dlUrl?.startsWith('http')) return { success: true, url: dlUrl, title: data.title || '' }
    } catch {}
    return null
}

// ── ToxicAPIs direct search+play ──────────────────────────────────────────────
const toxicPlay = async (query) => {
    const APIS = [
        `https://apiz.xhclinton.me/api/play?apikey=toxicapis&q=${encodeURIComponent(query)}`,
        `https://api.xhclinton.me/api/play?apikey=toxicapis&q=${encodeURIComponent(query)}`,
        `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(query)}`,
    ]
    for (const url of APIS) {
        try {
            const res = await axios.get(url, { timeout: 25000 })
            const d = res.data
            if (!d || d.status === false || d.success === false) continue
            const audioUrl = toUrl(d.download) || toUrl(d.audio) || toUrl(d.url) ||
                toUrl(d.result?.download) || toUrl(d.result?.url) || toUrl(d.result)
            if (audioUrl) {
                return {
                    success: true, audioUrl,
                    title: d.title || d.result?.title || query,
                    channel: d.artist || d.author || d.result?.artist || '',
                    duration: d.duration || d.result?.duration || '',
                    thumbnail: d.thumbnail || d.result?.thumbnail || '',
                    source: 'toxicapis'
                }
            }
        } catch {}
    }
    return null
}

// ── JioSaavn search (alternative free audio source) ──────────────────────────
const downloadViaJioSaavn = async (query) => {
    try {
        const search = await axios.get(
            `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&limit=1`,
            { timeout: 12000 }
        )
        const song = search.data?.data?.results?.[0]
        if (!song) return null
        const dlUrl = song.downloadUrl?.find(d => d.quality === '320kbps' || d.quality === '160kbps')?.url ||
                      song.downloadUrl?.[song.downloadUrl.length - 1]?.url
        if (!dlUrl) return null
        return {
            success: true,
            audioUrl: dlUrl,
            title: song.name || query,
            channel: song.artists?.primary?.[0]?.name || '',
            duration: song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : '',
            thumbnail: song.image?.find(i => i.quality === '500x500')?.url || song.image?.[0]?.url || '',
            source: 'jiosaavn'
        }
    } catch {}
    return null
}

// ── y2mate.com ─────────────────────────────────────────────────────────────────
const downloadViaY2mate = async (videoUrl) => {
    try {
        const r1 = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax',
            `k_query=${encodeURIComponent(videoUrl)}&k_page=home&hl=en&q_auto=0`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }
        )
        const vid = r1.data?.vid
        const mp3Links = r1.data?.links?.mp3 || {}
        const firstKey = Object.values(mp3Links)[0]?.k
        if (!vid || !firstKey) return null

        const r2 = await axios.post('https://www.y2mate.com/mates/convertV2/index',
            `vid=${vid}&k=${encodeURIComponent(firstKey)}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }
        )
        const dlUrl = r2.data?.dlink
        if (dlUrl?.startsWith('http')) return { success: true, url: dlUrl, title: '' }
    } catch {}
    return null
}

// ── MAIN: Search and Download Audio ──────────────────────────────────────────
// Returns: { success, audioUrl?, audioBuffer?, title, channel, duration, thumbnail }
const searchAndDownload = async (query) => {
    // 1. Try JioSaavn first for music queries (fast, high quality, no YT needed)
    const saavn = await downloadViaJioSaavn(query)
    if (saavn?.success) return saavn

    // 2. Search YouTube for the video
    const ytSearch = await searchYoutube(query)
    const top = ytSearch.success ? ytSearch.results[0] : null
    const videoUrl = top?.url || (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : null) || toUrl(top?.link)

    if (videoUrl) {
        const meta = {
            title: top?.title || query,
            channel: typeof top?.author?.name === 'string' ? top.author.name : '',
            duration: top?.timestamp || top?.duration?.timestamp || '',
            thumbnail: top?.thumbnail || top?.image || '',
        }

        // 2a. yt-dlp shell (most reliable if available)
        const ytdlp = await downloadViaYtdlp(videoUrl, true)
        if (ytdlp?.success) {
            return { success: true, audioBuffer: ytdlp.buffer, ...meta, source: 'ytdlp' }
        }

        // 2b. Gifted savetubemp3 / ytmp3
        const gifted = await downloadAudioGifted(videoUrl)
        if (gifted?.success) {
            return { success: true, audioUrl: gifted.url, ...meta, title: meta.title || gifted.title, source: 'gifted' }
        }

        // 2c. Zynk/FabDL
        const zynk = await downloadViaZynk(videoUrl)
        if (zynk?.success) {
            return { success: true, audioUrl: zynk.url, ...meta, title: meta.title || zynk.title, source: 'zynk' }
        }

        // 2d. Silvatech
        const silva = await downloadAudioSilvatech(videoUrl)
        if (silva?.success) {
            return { success: true, audioUrl: silva.url, ...meta, title: meta.title || silva.title, source: 'silvatech' }
        }

        // 2e. Cobalt v7 (multiple instances)
        const cobalt = await downloadViaCobalt(videoUrl)
        if (cobalt?.success) {
            return { success: true, audioUrl: cobalt.url, ...meta, source: 'cobalt' }
        }

        // 2f. y2mate
        const y2 = await downloadViaY2mate(videoUrl)
        if (y2?.success) {
            return { success: true, audioUrl: y2.url, ...meta, source: 'y2mate' }
        }

        // 2g. Ocean Saver
        const ocean = await downloadViaOceanSaver(videoUrl)
        if (ocean?.success) {
            return { success: true, audioUrl: ocean.url, ...meta, title: meta.title || ocean.title, source: 'oceansaver' }
        }
    }

    // 3. ToxicAPIs direct query (search+download in one shot)
    const toxic = await toxicPlay(query)
    if (toxic?.success) return toxic

    // 4. yt-dlp direct search (last resort)
    const ytdlpSearch = await downloadViaYtdlp(`ytsearch1:${query}`, true)
    if (ytdlpSearch?.success) {
        return {
            success: true, audioBuffer: ytdlpSearch.buffer,
            title: query, channel: '', duration: '', thumbnail: '', source: 'ytdlp-search'
        }
    }

    return { success: false, error: 'Could not download that song. Try a different name or artist.' }
}

// ── YouTube Video Download ─────────────────────────────────────────────────────
const downloadVideo = async (videoUrl) => {
    // 1. yt-dlp (best if available)
    const ytdlp = await downloadViaYtdlp(videoUrl, false)
    if (ytdlp?.success) return ytdlp

    // 2. Gifted ytmp4
    for (const ep of ['/api/download/ytmp4', '/api/download/dlmp4']) {
        try {
            const res = await axios.get(`${GIFTED}${ep}`, {
                params: { url: videoUrl, apikey: GIFTED_KEY }, timeout: 60000
            })
            const data = res.data
            if (data?.status === false || data?.success === false) continue
            const url = toUrl(data?.result) || toUrl(data?.url) || toUrl(data?.video) ||
                        toUrl(data?.download) || toUrl(data?.mp4)
            if (url) return { success: true, url, title: data?.result?.title || data?.title || '' }
        } catch {}
    }

    // 3. Cobalt v7 video
    const COBALT_INSTANCES = [
        'https://cobalt.api.timelessnesses.me',
        'https://cobalt.api.lostluma.dev',
    ]
    for (const instance of COBALT_INSTANCES) {
        try {
            const res = await axios.post(instance,
                { url: videoUrl, downloadMode: 'auto', videoQuality: '720', audioFormat: 'mp3' },
                { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 }
            )
            const url = res.data?.url
            if (url?.startsWith('http')) return { success: true, url, title: '' }
        } catch {}
    }

    return { success: false, error: 'Video download failed' }
}

// ── Search + download video ────────────────────────────────────────────────────
const searchAndDownloadVideo = async (query) => {
    const ytSearch = await searchYoutube(query)
    if (!ytSearch.success) return { success: false, error: ytSearch.error }

    const top = ytSearch.results[0]
    const videoUrl = top?.url || (top?.videoId ? `https://youtube.com/watch?v=${top.videoId}` : '')
    if (!videoUrl) return { success: false, error: 'Could not extract video URL' }

    const dl = await downloadVideo(videoUrl)
    if (!dl.success) return { success: false, error: dl.error }

    return {
        success: true,
        videoUrl: dl.url,
        videoBuffer: dl.buffer,
        title: top?.title || dl.title || query,
        channel: typeof top?.author?.name === 'string' ? top.author.name : '',
        duration: top?.timestamp || top?.duration?.timestamp || '',
        thumbnail: top?.thumbnail || top?.image || '',
        source: dl.source || 'youtube'
    }
}

module.exports = {
    searchYoutube,
    downloadAudio: downloadAudioGifted,
    downloadVideo,
    searchAndDownload,
    searchAndDownloadVideo,
    downloadViaYtdlp
}
