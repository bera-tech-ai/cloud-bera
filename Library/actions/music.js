'use strict'

const axios = require('axios')
const xcasper = require('./xcasper')
const { findMediaUrl } = require('../lib/media-url')

// Music backend, two providers:
//  1. ytv (ytv.xcasper.space) — PRIMARY since 2026-11-26. Its search is
//     rich and, crucially, its download endpoint streams the actual MP3
//     bytes back, so the bot sends a Buffer it already holds instead of
//     handing WhatsApp a third-party URL that may expire or refuse the
//     fetch (the old flow's flaky step — "found it" songs reported as
//     "not found" when the audio step glitched).
//  2. Xcasper apiz youtube endpoints — fallback for both steps.
const YTV_BASE = 'https://ytv.xcasper.space'

const videoUrl = item => item?.url || (item?.videoId ? `https://youtube.com/watch?v=${item.videoId}` : '')

const videoIdFrom = (input) => {
    const s = String(input || '')
    const m = s.match(/[?&]v=([\w-]{6,})/) || s.match(/youtu\.be\/([\w-]{6,})/) || s.match(/shorts\/([\w-]{6,})/)
    if (m) return m[1]
    return /^[\w-]{11}$/.test(s) ? s : ''
}

const searchYoutubeYtv = async (query) => {
    const { data } = await axios.get(`${YTV_BASE}/api/search`, { params: { q: query }, timeout: 25000 })
    if (!data?.success || !Array.isArray(data.results)) return null
    const vids = data.results
        .filter(r => r && r.id && (r.type === 'video' || !r.type))
        .slice(0, 6)
        .map(r => ({
            title: r.title || '',
            url: `https://youtube.com/watch?v=${r.id}`,
            videoId: r.id,
            thumbnail: r.thumbnail || '',
            duration: r.duration || '',
            author: { name: r.channel || '' }
        }))
    return vids.length ? vids : null
}

const searchYoutube = async (query) => {
    try {
        const ytv = await searchYoutubeYtv(query)
        if (ytv) return { success: true, results: ytv, source: 'ytv' }
    } catch { /* fall through to Xcasper */ }
    try {
        const results = await xcasper.youtubeSearch(query, 6)
        if (!Array.isArray(results) || !results.length) return { success: false, error: 'YouTube search returned no results.' }
        return { success: true, results, source: 'xcasper' }
    } catch (e) {
        return { success: false, error: `YouTube search failed: ${e.message}` }
    }
}

const downloadAudioYtv = async (url) => {
    const id = videoIdFrom(url)
    if (!id) return null
    const res = await axios.get(`${YTV_BASE}/api/download/${id}`, {
        params: { format: 'mp3', bitrate: 128 },
        responseType: 'arraybuffer',
        timeout: 90000,
        maxContentLength: 32 * 1024 * 1024
    })
    const buf = Buffer.from(res.data || [])
    const type = String(res.headers?.['content-type'] || '')
    if (buf.length < 10000 || !/audio|octet-stream/i.test(type)) return null
    return { success: true, audioBuffer: buf, url: '', audioUrl: '', title: '', thumbnail: '', source: 'ytv' }
}

const downloadAudio = async (url) => {
    try {
        const ytv = await downloadAudioYtv(url)
        if (ytv) return ytv
    } catch { /* fall through to Xcasper */ }
    try {
        const data = await xcasper.youtubeAudio(url)
        const result = data?.data || data
        const direct = findMediaUrl(result)
        return direct ? { success: true, url: direct, audioUrl: direct, title: result?.title || '', thumbnail: result?.thumbnail || '', source: 'xcasper' } : { success: false, error: 'No audio URL from either music provider.' }
    } catch (e) {
        return { success: false, error: `YouTube audio download failed: ${e.message}` }
    }
}

const downloadVideo = async (url) => {
    try {
        const data = await xcasper.youtubeVideo(url)
        const result = data?.data || data
        const direct = findMediaUrl(result)
        return direct ? { success: true, url: direct, title: result?.title || '' } : { success: false, error: 'Xcasper returned no video URL.' }
    } catch (e) {
        return { success: false, error: `Xcasper YouTube video download failed: ${e.message}` }
    }
}

const searchAndDownload = async (query) => {
    const search = await searchYoutube(query)
    if (!search.success) return { ...search, stage: 'search' }
    const top = search.results[0]
    const url = videoUrl(top)
    if (!url) return { success: false, stage: 'search', error: 'YouTube returned a result without a URL.' }
    // The download step is the flaky one (seen live 2026-11-26: the same
    // song failed twice, then worked) — one retry before giving up, and
    // the failure is tagged stage:'download' so callers never report a
    // download glitch as "track not found".
    let audio = await downloadAudio(url)
    if (!audio.success) audio = await downloadAudio(url)
    if (!audio.success) return { ...audio, stage: 'download' }
    return { ...audio, title: top.title || audio.title || query, thumbnail: top.thumbnail || audio.thumbnail || '', channel: top.author?.name || '', duration: top.duration || '', source: audio.source || search.source || 'auto' }
}

const searchAndDownloadVideo = async (query) => {
    const search = await searchYoutube(query)
    if (!search.success) return search
    const top = search.results[0]
    const url = videoUrl(top)
    if (!url) return { success: false, error: 'YouTube returned a result without a URL.' }
    const video = await downloadVideo(url)
    if (!video.success) return video
    return { ...video, videoUrl: video.url, title: top.title || video.title || query, channel: top.author?.name || '', thumbnail: top.thumbnail || '', source: 'xcasper' }
}

module.exports = { searchYoutube, downloadAudio, downloadVideo, searchAndDownload, searchAndDownloadVideo }
