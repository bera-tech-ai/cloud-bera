const axios = require('axios')

const toUrl = (v) => {
    if (typeof v === 'string' && v.startsWith('http')) return v
    if (Array.isArray(v) && v.length) return toUrl(v[0])
    if (v && typeof v === 'object') {
        const inner = v.url || v.play || v.download || v.video || v.src || v.link
        if (typeof inner === 'string' && inner.startsWith('http')) return inner
        if (Array.isArray(inner)) return toUrl(inner[0])
    }
    return ''
}

const detectPlatform = (url) => {
    if (/tiktok\.com/i.test(url)) return 'tiktok'
    if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram'
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter'
    if (/facebook\.com|fb\.com|fb\.watch/i.test(url)) return 'facebook'
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
    return 'unknown'
}

const downloadTikTok = async (url) => {
    try {
        const r = await axios.get('https://www.tikwm.com/api/', {
            params: { url, hd: 1 },
            timeout: 20000
        })
        const d = r.data
        if (d.code !== 0 || !d.data) return { success: false, error: 'Could not fetch TikTok video.' }
        const item = d.data
        const videoUrl = item.hdplay || item.play
        if (!videoUrl) return { success: false, error: 'No video URL in response.' }
        return {
            success: true,
            platform: 'TikTok',
            title: item.title || '',
            author: item.author?.nickname || '',
            duration: item.duration || 0,
            videoUrl,
            audioUrl: item.music || '',
            thumbnail: item.cover || ''
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const downloadInstagram = async (url) => {
    const endpoints = [
        { base: 'https://apiskeith.top', path: '/download/igdl', param: 'url' },
        { base: 'https://apiskeith.top', path: '/download/ig2', param: 'url' },
    ]
    for (const ep of endpoints) {
        try {
            const r = await axios.get(`${ep.base}${ep.path}`, {
                params: { [ep.param]: url },
                timeout: 15000
            })
            const d = r.data
            if (!d?.status && !d?.success) continue
            const videoUrl = toUrl(d?.result) || toUrl(d?.data)
            if (!videoUrl) continue
            return { success: true, platform: 'Instagram', videoUrl, title: d?.result?.title || 'Instagram Video' }
        } catch { continue }
    }
    return { success: false, error: 'Instagram download unavailable. Try saving the video directly from Instagram.' }
}

const downloadTwitter = async (url) => {
    try {
        const r = await axios.get('https://apiskeith.top/download/twitter', {
            params: { url },
            timeout: 15000
        })
        const d = r.data
        if (!d?.status && !d?.success) return { success: false, error: 'Twitter download failed.' }
        const videoUrl = toUrl(d?.result?.video) || toUrl(d?.result) || toUrl(d?.data)
        if (!videoUrl || videoUrl.includes('undefined')) return { success: false, error: 'No video found in that tweet.' }
        return { success: true, platform: 'Twitter/X', videoUrl, title: d?.result?.desc || 'Twitter Video' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const downloadFacebook = async (url) => {
    try {
        const r = await axios.get('https://apiskeith.top/download/fbdl', {
            params: { url },
            timeout: 15000
        })
        const d = r.data
        if (!d?.status && !d?.success) return { success: false, error: 'Facebook download failed.' }
        const videoUrl = toUrl(d?.result?.hd) || toUrl(d?.result?.sd) || toUrl(d?.result)
        if (!videoUrl) return { success: false, error: 'No video found.' }
        return { success: true, platform: 'Facebook', videoUrl, title: d?.result?.title || 'Facebook Video' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const download = async (url) => {
    const platform = detectPlatform(url)
    if (platform === 'tiktok') return downloadTikTok(url)
    if (platform === 'instagram') return downloadInstagram(url)
    if (platform === 'twitter') return downloadTwitter(url)
    if (platform === 'facebook') return downloadFacebook(url)
    return { success: false, error: `Unsupported platform. Supported: TikTok, Instagram, Twitter/X, Facebook` }
}

module.exports = { download, downloadTikTok, downloadInstagram, downloadTwitter, detectPlatform }
