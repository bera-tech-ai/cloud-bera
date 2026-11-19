'use strict'

const xcasper = require('./xcasper')

const detectPlatform = url => {
    const value = String(url || '').toLowerCase()
    if (/tiktok\.com|vm\.tiktok\.com/.test(value)) return 'tiktok'
    if (/instagram\.com|instagr\.am/.test(value)) return 'instagram'
    if (/twitter\.com|x\.com/.test(value)) return 'twitter'
    if (/facebook\.com|fb\.com|fb\.watch|fb\.reel/.test(value)) return 'facebook'
    if (/youtube\.com|youtu\.be/.test(value)) return 'youtube'
    return 'unknown'
}

const unsupported = platform => ({ success: false, error: `${platform} downloading is disabled because no verified Xcasper endpoint is currently available.` })

const downloadTikTok = async url => {
    try {
        const data = await xcasper.tiktok(url)
        const result = data?.data || data
        const videoUrl = result?.video || result?.video_url || result?.download_url || result?.url || result?.play
        const audioUrl = result?.audio || result?.music || result?.music_info?.play
        if (!videoUrl && !audioUrl) return { success: false, error: 'Xcasper returned no TikTok media URL.' }
        return { success: true, platform: 'TikTok', videoUrl, audioUrl, title: result?.title || result?.desc || '', author: result?.author?.name || result?.author || '', thumbnail: result?.thumbnail || result?.cover || '' }
    } catch (e) {
        return { success: false, error: `Xcasper TikTok download failed: ${e.message}` }
    }
}

const downloadInstagram = async url => {
    try {
        const data = await xcasper.instagram(url)
        const result = data?.data || data
        const item = Array.isArray(result) ? result[0] : result
        const mediaUrl = item?.url || item?.download_url || item?.video || item?.image
        if (!mediaUrl) return { success: false, error: 'Xcasper returned no Instagram media URL.' }
        return { success: true, platform: 'Instagram', videoUrl: mediaUrl, url: mediaUrl, title: item?.title || '', thumbnail: item?.thumbnail || item?.cover || '' }
    } catch (e) {
        return { success: false, error: `Xcasper Instagram download failed: ${e.message}` }
    }
}

const downloadTwitter = async () => unsupported('Twitter/X')
const downloadFacebook = async () => unsupported('Facebook')

const download = async url => {
    const platform = detectPlatform(url)
    if (platform === 'tiktok') return downloadTikTok(url)
    if (platform === 'instagram') return downloadInstagram(url)
    if (platform === 'twitter') return downloadTwitter(url)
    if (platform === 'facebook') return downloadFacebook(url)
    return { success: false, error: 'Unsupported platform. Verified downloads currently support TikTok and Instagram.' }
}

module.exports = { download, downloadTikTok, downloadInstagram, downloadTwitter, detectPlatform }
