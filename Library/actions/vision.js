'use strict'

// ── Image vision / analysis (spec §16) ───────────────────────────────────────
// Status verified live from this environment on 2026-11-24: the Xcasper vision
// endpoint POST https://apiz.xcasper.space/api/ai/vision returns HTTP 500
// ("Cloudflare Workers AI request failed (HTTP 401): Authentication error").
// The provider's own auth is broken, so no client-side fix can make vision
// work. Image analysis is therefore explicitly UNAVAILABLE — it is not
// attempted, and callers get an honest error with alternatives instead of a
// silent failure or a fake description.
//
// Alternatives that DO work today: OCR (read text from the image) via the
// bundled Tesseract.js engine (`.ocr`, Plugins/ttsocr.js), and sticker
// conversion. To re-test vision after the provider fixes its auth, set
// BERA_VISION_FORCE_ENABLE=1; the forced path still reports the real
// provider error instead of inventing a description.

const VISION_CHECKED_AT = '2026-11-24'
const VISION_UNAVAILABLE_MESSAGE =
    'Image analysis is currently unavailable: the vision provider returns HTTP 500 (its own authentication failed) — verified 2026-11-24. ' +
    'Alternative: use .ocr to read text from the image, or describe the image yourself and ask about that. ' +
    'Vision will be re-enabled once the provider fixes its authentication.'

const visionStatus = () => ({
    available: process.env.BERA_VISION_FORCE_ENABLE === '1',
    checkedAt: VISION_CHECKED_AT,
    provider: 'xcasper vision (/api/ai/vision)',
    error: 'HTTP 500 — Cloudflare Workers AI request failed (HTTP 401): Authentication error',
    message: VISION_UNAVAILABLE_MESSAGE
})

const analyzeImageFromBuffer = async (buffer, question = 'Describe this image in detail.') => {
    if (!buffer || !Buffer.isBuffer(buffer)) return { success: false, error: 'No image supplied.' }
    if (process.env.BERA_VISION_FORCE_ENABLE !== '1') {
        return { success: false, error: VISION_UNAVAILABLE_MESSAGE }
    }
    // Lazy: the gated path never touches the provider client.
    const xcasper = require('./xcasper')
    const result = await xcasper.vision(`data:image/jpeg;base64,${buffer.toString('base64')}`, question)
    return result.success ? { success: true, result: result.text } : { success: false, error: result.error }
}

const analyzeImageFromUrl = async (imageUrl, question = 'Describe this image in detail.') => {
    if (process.env.BERA_VISION_FORCE_ENABLE !== '1') {
        return { success: false, error: VISION_UNAVAILABLE_MESSAGE }
    }
    const xcasper = require('./xcasper')
    const result = await xcasper.vision(imageUrl, question)
    return result.success ? { success: true, result: result.text } : { success: false, error: result.error }
}

module.exports = { analyzeImageFromBuffer, analyzeImageFromUrl, visionStatus, VISION_UNAVAILABLE_MESSAGE, VISION_CHECKED_AT }
