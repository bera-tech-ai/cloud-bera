'use strict'

const xcasper = require('./xcasper')
const { findMediaUrl } = require('../lib/media-url')

const videoUrl = item => item?.url || (item?.videoId ? `https://youtube.com/watch?v=${item.videoId}` : '')

const searchYoutube = async (query) => {
    try {
        const results = await xcasper.youtubeSearch(query, 6)
        if (!Array.isArray(results) || !results.length) return { success: false, error: 'Xcasper YouTube search returned no results.' }
        return { success: true, results }
    } catch (e) {
        return { success: false, error: `Xcasper YouTube search failed: ${e.message}` }
    }
}

const downloadAudio = async (url) => {
    try {
        const data = await xcasper.youtubeAudio(url)
        const result = data?.data || data
        const direct = findMediaUrl(result)
        return direct ? { success: true, url: direct, audioUrl: direct, title: result?.title || '', thumbnail: result?.thumbnail || '' } : { success: false, error: 'Xcasper returned no audio URL.' }
    } catch (e) {
        return { success: false, error: `Xcasper YouTube audio download failed: ${e.message}` }
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
    if (!search.success) return search
    const top = search.results[0]
    const url = videoUrl(top)
    if (!url) return { success: false, error: 'Xcasper returned a YouTube result without a URL.' }
    const audio = await downloadAudio(url)
    if (!audio.success) return audio
    return { ...audio, title: top.title || audio.title || query, thumbnail: top.thumbnail || audio.thumbnail || '', channel: top.author?.name || '', source: 'xcasper' }
}

const searchAndDownloadVideo = async (query) => {
    const search = await searchYoutube(query)
    if (!search.success) return search
    const top = search.results[0]
    const url = videoUrl(top)
    if (!url) return { success: false, error: 'Xcasper returned a YouTube result without a URL.' }
    const video = await downloadVideo(url)
    if (!video.success) return video
    return { ...video, videoUrl: video.url, title: top.title || video.title || query, channel: top.author?.name || '', thumbnail: top.thumbnail || '', source: 'xcasper' }
}

module.exports = { searchYoutube, downloadAudio, downloadVideo, searchAndDownload, searchAndDownloadVideo }
