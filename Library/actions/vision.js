'use strict'

// ── Image vision / analysis (spec §16) ───────────────────────────────────────
// TRUE VISION is provided by Casper's Qwen endpoint, verified live from this
// environment on 2026-11-26 and re-verified 2026-11-27:
//   POST https://apiz.xcasper.space/api/ai/qwen
//   body { imageBase64: 'data:image/jpeg;base64,...', query: '<question>' }
//   → { success: true, data: { model: 'qwen/qwen3.8-27b', reply: '...' } }
// No API key, no cost. (The endpoint's own error hints "?query=" — the field
// belongs in the JSON body; the URL-param form is rejected, both verified.)
//
// The older /api/ai/vision endpoint stays dead (its own auth returns
// HTTP 500, verified 2026-11-24) and is only attempted when
// BERA_VISION_FORCE_ENABLE=1, as before.
//
// Behaviour:
// - Qwen is the default path. BERA_VISION_QWEN=0 disables it (kill switch),
//   restoring the previous unavailable behaviour.
// - If Qwen fails, callers get an honest error that names the failure and
//   points at the working alternative: OCR (.ocr) for reading text.
// - Nothing here ever invents a description.

const VISION_CHECKED_AT = '2026-11-27'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const VISION_UNAVAILABLE_MESSAGE =
    'Image analysis is unavailable right now: the vision provider (Casper Qwen) could not be reached or returned an error — verified working 2026-11-27, so this may be temporary. ' +
    'Alternative: use .ocr to read text from the image.'

const qwenEnabled = () => process.env.BERA_VISION_QWEN !== '0'

const visionStatus = () => ({
    available: qwenEnabled(),
    checkedAt: VISION_CHECKED_AT,
    provider: 'xcasper qwen (/api/ai/qwen, qwen/qwen3.8-27b)',
    message: qwenEnabled() ? 'Vision is available via Casper Qwen.' : VISION_UNAVAILABLE_MESSAGE
})

const qwenVision = async (buffer, question, mime = 'image/jpeg') => {
    const xcasper = require('./xcasper')
    const data = await xcasper.requestPost('/api/ai/qwen', {
        imageBase64: `data:${mime};base64,${buffer.toString('base64')}`,
        query: question
    }, 60000)
    if (data?.success === false) {
        return { success: false, error: `Qwen vision error: ${data?.error || 'unknown provider error'}` }
    }
    const reply = data?.data?.reply || data?.reply || xcasper.textFrom?.(data)
    return reply
        ? { success: true, result: String(reply).trim(), provider: 'qwen' }
        : { success: false, error: 'Qwen vision returned no text' }
}

const legacyVision = async (dataUriOrUrl, question) => {
    const xcasper = require('./xcasper')
    const result = await xcasper.vision(dataUriOrUrl, question)
    return result.success ? { success: true, result: result.text, provider: 'legacy-vision' } : { success: false, error: result.error }
}

const analyzeImageFromBuffer = async (buffer, question = 'Describe this image in detail.') => {
    if (!buffer || !Buffer.isBuffer(buffer)) return { success: false, error: 'No image supplied.' }
    if (buffer.length > MAX_IMAGE_BYTES) return { success: false, error: 'Image is too large to analyse (over 8 MB).' }

    if (qwenEnabled()) {
        try {
            const result = await qwenVision(buffer, question)
            if (result.success) return result
            console.error('[VISION] Qwen failed:', result.error)
        } catch (e) {
            console.error('[VISION] Qwen failed:', e.response?.status || e.message)
        }
    }

    if (process.env.BERA_VISION_FORCE_ENABLE === '1') {
        const legacy = await legacyVision(`data:image/jpeg;base64,${buffer.toString('base64')}`, question)
        if (legacy.success) return legacy
    }

    return { success: false, error: VISION_UNAVAILABLE_MESSAGE }
}

const analyzeImageFromUrl = async (imageUrl, question = 'Describe this image in detail.') => {
    if (!imageUrl) return { success: false, error: 'No image URL supplied.' }
    // Kill switch on and no legacy force-enable: don't download what we
    // would not analyse anyway.
    if (!qwenEnabled() && process.env.BERA_VISION_FORCE_ENABLE !== '1') {
        return { success: false, error: VISION_UNAVAILABLE_MESSAGE }
    }
    // Qwen takes base64, not URLs (the URL-based endpoint is the dead one),
    // so download the image ourselves and run the same Qwen call.
    try {
        const axios = require('axios')
        const res = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 20000,
            maxContentLength: MAX_IMAGE_BYTES,
            headers: { 'User-Agent': 'BeraAI/Vision/1.0' }
        })
        const buffer = Buffer.from(res.data)
        const mime = String(res.headers?.['content-type'] || 'image/jpeg').split(';')[0].trim()
        if (qwenEnabled()) {
            const result = await qwenVision(buffer, question, mime.startsWith('image/') ? mime : 'image/jpeg')
            if (result.success) return result
            console.error('[VISION] Qwen failed (url):', result.error)
        }
        return { success: false, error: VISION_UNAVAILABLE_MESSAGE }
    } catch (e) {
        if (process.env.BERA_VISION_FORCE_ENABLE === '1') {
            const legacy = await legacyVision(imageUrl, question)
            if (legacy.success) return legacy
        }
        return { success: false, error: `Could not fetch that image to analyse it (${e.message}). ` + VISION_UNAVAILABLE_MESSAGE }
    }
}

module.exports = { analyzeImageFromBuffer, analyzeImageFromUrl, visionStatus, VISION_UNAVAILABLE_MESSAGE, VISION_CHECKED_AT }
