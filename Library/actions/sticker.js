const sharp = require('sharp')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const makeSticker = async (buffer, mimetype = 'image/jpeg', packName = 'Bera AI', authorName = 'Bera Tech') => {
    try {
        let webpBuffer

        if (mimetype.includes('webp')) {
            webpBuffer = buffer
        } else if (mimetype.includes('image')) {
            webpBuffer = await sharp(buffer)
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 80 })
                .toBuffer()
        } else if (mimetype.includes('video') || mimetype.includes('gif')) {
            webpBuffer = await videoToWebp(buffer)
        } else {
            return { success: false, error: 'Unsupported media type for sticker.' }
        }

        if (!webpBuffer) return { success: false, error: 'Failed to convert to sticker format.' }
        return { success: true, buffer: webpBuffer }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const videoToWebp = (buffer) => {
    return new Promise((resolve) => {
        const tmpIn = path.join(os.tmpdir(), `nick_sticker_in_${Date.now()}.mp4`)
        const tmpOut = path.join(os.tmpdir(), `nick_sticker_out_${Date.now()}.webp`)
        fs.writeFileSync(tmpIn, buffer)
        exec(
            `ffmpeg -i "${tmpIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0,fps=15" -vcodec libwebp -lossless 0 -compression_level 6 -q:v 50 -loop 0 -preset default -an -vsync 0 -t 6 "${tmpOut}" -y`,
            { timeout: 30000 },
            (err) => {
                fs.unlink(tmpIn, () => {})
                if (err || !fs.existsSync(tmpOut)) { resolve(null); return }
                const out = fs.readFileSync(tmpOut)
                fs.unlink(tmpOut, () => {})
                resolve(out)
            }
        )
    })
}

module.exports = { makeSticker }
