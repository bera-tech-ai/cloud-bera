const axios = require('axios')

const GIFTED = 'https://api.giftedtech.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'

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
    if (/tiktok\.com|vm\.tiktok\.com/i.test(url)) return 'tiktok'
    if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram'
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter'
    if (/facebook\.com|fb\.com|fb\.watch|fb\.reel/i.test(url)) return 'facebook'
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
    return 'unknown'
}

const downloadTikTok = async (url) => {
    // Primary: Gifted API
    try {
        const r = await axios.get(`${GIFTED}/api/download/tiktok`, {
            params: { 
                apikey: GIFTED_KEY,
                url: url 
            },
            timeout: 20000
        })
        const d = r.data
        
        if (d?.success && d?.result) {
            const videoUrl = d.result.video
            
            if (videoUrl) {
                return {
                    success: true,
                    platform: 'TikTok',
                    title: d.result.title || '',
                    author: d.result.author?.name || '',
                    duration: d.result.duration || 0,
                    videoUrl: videoUrl,
                    audioUrl: d.result.music || '',
                    thumbnail: d.result.cover || ''
                }
            }
        }
    } catch (e) {
        console.error('Gifted TikTok failed, trying tikwm.com:', e.message)
    }
    
    // Fallback: tikwm.com API
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
        { url: `${GIFTED}/api/download/instagram`, params: { apikey: GIFTED_KEY, url: url } },
        { url: `${GIFTED}/api/download/igdl`, params: { apikey: GIFTED_KEY, url: url } },
    ]
    
    for (const ep of endpoints) {
        try {
            const r = await axios.get(ep.url, {
                params: ep.params,
                timeout: 15000
            })
            const d = r.data
            
            if (!d?.success && d?.status !== 200) continue
            
            // Handle Gifted API response format
            let videoUrl = null
            
            // Check different possible response structures
            if (d?.result?.url) {
                videoUrl = d.result.url
            } else if (d?.result?.video) {
                videoUrl = d.result.video
            } else if (d?.result && typeof d.result === 'string') {
                videoUrl = d.result
            } else if (d?.url) {
                videoUrl = d.url
            } else if (d?.video) {
                videoUrl = d.video
            }
            
            videoUrl = toUrl(videoUrl)
            if (videoUrl) {
                return { 
                    success: true, 
                    platform: 'Instagram', 
                    videoUrl, 
                    title: d?.result?.title || 'Instagram Video' 
                }
            }
        } catch {
            continue
        }
    }
    return { success: false, error: 'Instagram download unavailable. Try saving the video directly from Instagram.' }
}

const downloadTwitter = async (url) => {
    try {
        const r = await axios.get(`${GIFTED}/api/download/twitter`, {
            params: { 
                apikey: GIFTED_KEY,
                url: url 
            },
            timeout: 15000
        })
        const d = r.data
        
        if (!d?.success && d?.status !== 200) {
            return { success: false, error: 'Twitter download failed.' }
        }
        
        // Handle Gifted API response format with videoUrls array
        let videoUrl = null
        
        // Get the highest quality video (usually first in array or 720p)
        if (d?.result?.videoUrls && Array.isArray(d.result.videoUrls)) {
            // Find 720p or highest quality
            const bestQuality = d.result.videoUrls.find(v => v.quality === '720p') || 
                               d.result.videoUrls[0]
            videoUrl = bestQuality?.url
        }
        
        // Fallback to other response formats
        if (!videoUrl && d?.result?.video) {
            videoUrl = d.result.video
        } else if (!videoUrl && d?.result && typeof d.result === 'string') {
            videoUrl = d.result
        } else if (!videoUrl && d?.video) {
            videoUrl = d.video
        } else if (!videoUrl && d?.url) {
            videoUrl = d.url
        }
        
        videoUrl = toUrl(videoUrl)
        
        if (!videoUrl || videoUrl.includes('undefined')) {
            return { success: false, error: 'No video found in that tweet.' }
        }
        
        return { 
            success: true, 
            platform: 'Twitter/X', 
            videoUrl, 
            title: d?.result?.desc || d?.result?.title || 'Twitter Video',
            thumbnail: d?.result?.thumbnail || ''
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const downloadFacebook = async (url) => {
    try {
        const r = await axios.get(`${GIFTED}/api/download/facebookv2`, {
            params: { 
                apikey: GIFTED_KEY,
                url: url 
            },
            timeout: 15000
        })
        const d = r.data
        
        if (!d?.success && d?.status !== 200) {
            return { success: false, error: 'Facebook download failed.' }
        }
        
        // Handle Gifted API response format with links array
        let videoUrl = null
        
        if (d?.result?.links && Array.isArray(d.result.links)) {
            // Get the highest quality (usually first or 1920p)
            const bestQuality = d.result.links.find(v => v.quality === '1920p') ||
                               d.result.links.find(v => v.quality === '1280p') ||
                               d.result.links.find(v => v.quality === '960p') ||
                               d.result.links[0]
            videoUrl = bestQuality?.url
        }
        
        // Fallback to other response formats
        if (!videoUrl && d?.result?.hd) {
            videoUrl = d.result.hd
        } else if (!videoUrl && d?.result?.sd) {
            videoUrl = d.result.sd
        } else if (!videoUrl && d?.result && typeof d.result === 'string') {
            videoUrl = d.result
        } else if (!videoUrl && d?.video) {
            videoUrl = d.video
        } else if (!videoUrl && d?.url) {
            videoUrl = d.url
        }
        
        videoUrl = toUrl(videoUrl)
        
        if (!videoUrl) {
            return { success: false, error: 'No video found.' }
        }
        
        return { 
            success: true, 
            platform: 'Facebook', 
            videoUrl, 
            title: d?.result?.title || 'Facebook Video',
            thumbnail: d?.result?.thumbnail || '',
            duration: d?.result?.duration || '',
            uploader: d?.result?.uploader || '',
            views: d?.result?.view_count || 0
        }
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
