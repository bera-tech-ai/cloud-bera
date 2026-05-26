'use strict'
/**
 * Media converter action library.
 * Uses fluent-ffmpeg + sharp for media transformations.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')

let ffmpeg
try { ffmpeg = require('fluent-ffmpeg') } catch { ffmpeg = null }

let sharp
try { sharp = require('sharp') } catch { sharp = null }

const tmpDir = os.tmpdir()

/**
 * Get a safe temp file path.
 */
const tmpFile = (ext) => path.join(tmpDir, `bera_conv_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)

/**
 * Convert audio/video buffer using ffmpeg.
 * @param {Buffer} inputBuf  Input media buffer
 * @param {string} inputExt  Input extension (mp4, mp3, ogg, webm, etc.)
 * @param {string} outputExt  Output extension (mp3, ogg, mp4, gif, etc.)
 * @param {object} opts  Optional ffmpeg options: { audioBitrate, videoBitrate, fps, size }
 * @returns {Promise<{ success: boolean, buffer?: Buffer, error?: string }>}
 */
const convertMedia = (inputBuf, inputExt, outputExt, opts = {}) => new Promise((resolve) => {
    if (!ffmpeg) return resolve({ success: false, error: 'ffmpeg/fluent-ffmpeg not installed' })

    const inFile  = tmpFile(inputExt.replace('.', ''))
    const outFile = tmpFile(outputExt.replace('.', ''))

    try { fs.writeFileSync(inFile, inputBuf) } catch (e) {
        return resolve({ success: false, error: `Could not write temp file: ${e.message}` })
    }

    const cmd = ffmpeg(inFile)

    if (opts.audioBitrate) cmd.audioBitrate(opts.audioBitrate)
    if (opts.videoBitrate) cmd.videoBitrate(opts.videoBitrate)
    if (opts.fps) cmd.fps(opts.fps)
    if (opts.size) cmd.size(opts.size)
    if (opts.noVideo || ['mp3', 'ogg', 'aac', 'flac', 'wav', 'm4a'].includes(outputExt)) cmd.noVideo()
    if (opts.noAudio) cmd.noAudio()
    if (outputExt === 'gif') { cmd.fps(opts.fps || 10).size(opts.size || '320x?').noAudio() }

    cmd.output(outFile)
        .on('end', () => {
            try {
                const buffer = fs.readFileSync(outFile)
                fs.unlinkSync(inFile)
                fs.unlinkSync(outFile)
                resolve({ success: true, buffer })
            } catch (e) { resolve({ success: false, error: e.message }) }
        })
        .on('error', (e) => {
            try { fs.unlinkSync(inFile) } catch {}
            try { fs.unlinkSync(outFile) } catch {}
            resolve({ success: false, error: e.message })
        })
        .run()
})

/**
 * Convert image buffer using sharp.
 * @param {Buffer} inputBuf  Input image buffer
 * @param {string} toFormat  'jpeg' | 'png' | 'webp' | 'avif' | 'gif'
 * @param {object} opts  { quality: 80, width, height, grayscale, rotate, blur }
 * @returns {Promise<{ success: boolean, buffer?: Buffer, error?: string }>}
 */
const convertImage = async (inputBuf, toFormat, opts = {}) => {
    if (!sharp) return { success: false, error: 'sharp not installed' }

    try {
        let img = sharp(inputBuf)
        if (opts.width || opts.height) img = img.resize(opts.width, opts.height, { fit: 'inside' })
        if (opts.grayscale) img = img.grayscale()
        if (opts.rotate) img = img.rotate(opts.rotate)
        if (opts.blur) img = img.blur(opts.blur)
        if (opts.flip) img = img.flip()
        if (opts.flop) img = img.flop()

        const fmt = toFormat.toLowerCase()
        const quality = opts.quality || 80
        if (fmt === 'jpeg' || fmt === 'jpg') img = img.jpeg({ quality })
        else if (fmt === 'png') img = img.png({ compressionLevel: 8 })
        else if (fmt === 'webp') img = img.webp({ quality })
        else if (fmt === 'avif') img = img.avif({ quality })

        const buffer = await img.toBuffer()
        return { success: true, buffer }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

/**
 * Get media info using ffprobe.
 * @param {Buffer} inputBuf
 * @param {string} ext
 * @returns {Promise<{ success: boolean, info?: object, error?: string }>}
 */
const getMediaInfo = (inputBuf, ext) => new Promise((resolve) => {
    if (!ffmpeg) return resolve({ success: false, error: 'ffmpeg not installed' })

    const inFile = tmpFile(ext.replace('.', ''))
    try { fs.writeFileSync(inFile, inputBuf) } catch (e) {
        return resolve({ success: false, error: e.message })
    }

    ffmpeg.ffprobe(inFile, (err, data) => {
        try { fs.unlinkSync(inFile) } catch {}
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true, info: data })
    })
})

module.exports = { convertMedia, convertImage, getMediaInfo }
