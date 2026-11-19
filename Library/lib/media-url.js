'use strict'

const URL_FIELDS = ['url', 'download_url', 'downloadUrl', 'audioUrl', 'videoUrl', 'link', 'src', 'path']
const CONTAINER_FIELDS = ['audio', 'video', 'media', 'data', 'result', 'file']

/**
 * Extract a usable string URL/path from downloader responses that may wrap the
 * media URL in nested objects (for example data.audio.downloadUrl).
 */
const findMediaUrl = (value, depth = 0, seen = new Set()) => {
    if (typeof value === 'string') return value.trim() || null
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return null
    seen.add(value)

    for (const key of URL_FIELDS) {
        const candidate = value[key]
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    for (const key of CONTAINER_FIELDS) {
        const found = findMediaUrl(value[key], depth + 1, seen)
        if (found) return found
    }
    return null
}

module.exports = { findMediaUrl }
