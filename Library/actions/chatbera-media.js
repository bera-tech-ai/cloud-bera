'use strict'

// ChatBera media understanding (Bera, 2026-11-27): when ChatBera is on
// and someone sends an image, a sticker, or a GIF, ChatBera should
// reply to it — not stay silent (a bare image has no text, so the
// ChatBera branch never fired) and not answer only the caption words
// while ignoring the picture.
//
// This module turns an incoming media message into a short factual
// description via the bot's existing Qwen vision
// (Library/actions/vision.js). The Handler then feeds ChatBera a
// composed turn — "[Sent a sticker — it shows: ...]" plus any real
// caption — so the persona replies to what the media actually is.
//
// Scope: imageMessage, stickerMessage, and videoMessage with
// gifPlayback (WhatsApp GIFs). View-once media is deliberately NOT
// read — it was sent to disappear. Plain videos and documents are
// out of scope. Any failure (download, conversion, vision) returns
// null and ChatBera falls back to today's behaviour: reply to the
// caption if there is one, stay silent if there isn't.
// Kill switch: BERA_CHATBERA_VISION=0.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024

const mediaKindOf = (m) => {
    if (!m || typeof m !== 'object') return null
    switch (m.mtype) {
        case 'imageMessage': return 'image'
        case 'stickerMessage': return 'sticker'
        case 'videoMessage': return m.msg?.gifPlayback ? 'gif' : null
        default: return null
    }
}

const QUESTIONS = {
    image: 'Describe what this image shows, briefly and factually: the main subject, any visible text, and the mood if it is obvious. Two sentences at most.',
    sticker: 'Describe this sticker in one or two sentences: what it depicts and what emotion or reaction it expresses.',
    gif: 'This is a frame from a GIF. In one or two sentences, describe what it shows and what reaction or moment it likely expresses.'
}

const KIND_LABEL = { image: 'an image', sticker: 'a sticker', gif: 'a GIF' }
const KIND_WHAT = { image: 'what it shows', sticker: 'it shows', gif: 'a frame from it shows' }

const composeMediaTurnText = ({ kind, description, caption }) => {
    const label = KIND_LABEL[kind] || 'an image'
    const what = KIND_WHAT[kind] || 'what it shows'
    let turn = `[Sent ${label} — ${what}: ${String(description || '').trim()}]`
    const cap = String(caption || '').trim()
    if (cap) turn += `\n${cap}`
    return turn
}

// One frame out of a GIF's mp4, via the host's ffmpeg (spawn, never
// execFile — the same rule the TTS subprocesses follow). Tries a
// mid-GIF timestamp first, then the first frame for very short GIFs.
const extractGifFrame = (mp4Buffer) => new Promise((resolve) => {
    let dir
    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-gif-'))
        const inFile = path.join(dir, 'in.mp4')
        const outFile = path.join(dir, 'frame.jpg')
        fs.writeFileSync(inFile, mp4Buffer)
        const attempt = (ss, isRetry) => {
            const child = spawn('ffmpeg', ['-y', '-ss', String(ss), '-i', inFile, '-frames:v', '1', '-q:v', '3', outFile], { stdio: 'ignore' })
            const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 15000)
            timer.unref?.()
            child.on('error', () => { clearTimeout(timer); cleanup(null) })
            child.on('close', () => {
                clearTimeout(timer)
                let buf = null
                try { buf = fs.readFileSync(outFile) } catch {}
                if (buf && buf.length) return cleanup(buf)
                if (!isRetry) return attempt(0, true)
                cleanup(null)
            })
        }
        const cleanup = (buf) => {
            try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
            resolve(buf)
        }
        attempt(0.5, false)
    } catch { resolve(null) }
})

// Normalise any still image to a JPEG the vision endpoint accepts:
// stickers are webp (animated ones contribute their first frame),
// and oversized images are shrunk under the vision cap.
const toJpeg = async (buffer, { always = false } = {}) => {
    if (!always && buffer.length <= 8 * 1024 * 1024) return buffer
    const sharp = require('sharp')
    return sharp(buffer, { animated: false })
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()
}

const describeChatMedia = async (conn, m) => {
    const kind = mediaKindOf(m)
    if (!kind) return null
    if (process.env.BERA_CHATBERA_VISION === '0') return null
    try {
        const buffer = await conn.downloadMediaMessage({ key: m.key, message: m.message })
        if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return null
        if (buffer.length > MAX_DOWNLOAD_BYTES) {
            console.log(`[CHATBERA MEDIA] ${kind} too large (${buffer.length} bytes) — skipped`)
            return null
        }
        let imageBuffer = buffer
        if (kind === 'gif') {
            imageBuffer = await extractGifFrame(buffer)
            if (!imageBuffer) { console.log('[CHATBERA MEDIA] gif frame extraction failed'); return null }
        } else if (kind === 'sticker') {
            imageBuffer = await toJpeg(buffer, { always: true })
        } else if (String(m.mimetype || '').includes('webp') || buffer.length > 8 * 1024 * 1024) {
            imageBuffer = await toJpeg(buffer, { always: true })
        }
        const { analyzeImageFromBuffer } = require('./vision')
        const result = await analyzeImageFromBuffer(imageBuffer, QUESTIONS[kind])
        if (!result?.success || !result.result) {
            console.log(`[CHATBERA MEDIA] vision failed for ${kind}:`, result?.error || 'empty result')
            return null
        }
        return { kind, description: String(result.result).trim() }
    } catch (e) {
        console.log('[CHATBERA MEDIA] failed:', e.message)
        return null
    }
}

module.exports = { mediaKindOf, composeMediaTurnText, describeChatMedia, QUESTIONS }
