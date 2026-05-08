const axios = require('axios')

const GT = 'https://api.giftedtech.co.ke'
const KEY = 'gifted'

const gt = (path, params = {}) =>
    axios.get(`${GT}${path}`, { params: { apikey: KEY, ...params }, timeout: 30000 })
        .then(r => r.data)
        .catch(e => ({ success: false, error: e.message }))

const react = (conn, m, emoji) =>
    conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const hasMedia = (msg) => msg && /image|video|audio/.test(msg.mimetype || '')

// ── Photo edit helper ─────────────────────────────────────────────────────────
// Resolves quoted image → URL, hits one of several Gifted endpoint variants,
// and sends back the resulting image. Returns true on success, false otherwise.
const resolveImageUrl = async (m, conn, args) => {
    let url = args[0]
    if (url && url.startsWith('http')) return url
    if (m.quoted && hasMedia(m.quoted)) {
        const buf = await conn.downloadMediaMessage(m.quoted).catch(() => null)
        if (buf) {
            // Many Gifted endpoints accept an https URL only — fall back to a
            // public uploader if the endpoint refuses base64. For now, return
            // base64 first; the caller will retry with upload if needed.
            return 'data:image/jpeg;base64,' + buf.toString('base64')
        }
    }
    return null
}

const photoEdit = async (m, conn, reply, args, prefix, cmd, label, paths, extraParams = {}) => {
    const imgUrl = await resolveImageUrl(m, conn, args)
    if (!imgUrl) return reply(`Usage: *${prefix}${cmd} <image URL>* or reply to an image.`)
    await react(conn, m, '🎨')
    let outUrl = null
    let lastErr = ''
    for (const path of paths) {
        const r = await gt(path, { url: imgUrl, ...extraParams })
        const candidate = r?.result?.url || r?.result || r?.url || r?.image ||
            r?.imageUrl || r?.data?.url || r?.data
        if (typeof candidate === 'string' && candidate.startsWith('http')) {
            outUrl = candidate
            break
        }
        lastErr = r?.error || r?.message || 'No URL in response'
    }
    if (!outUrl) {
        await react(conn, m, '❌')
        return reply(`❌ ${label} failed: ${lastErr || 'all endpoints unavailable'}`)
    }
    await react(conn, m, '✅')
    return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: `🎨 *${label}*` }, { quoted: m })
}

const fmtDuration = (s) => {
    if (!s) return ''
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
}

const handle = async (m, { conn, command, args, reply, prefix, text }) => {

    // ── YOUTUBE AUDIO ──────────────────────────────────────────────────────────
    if (command === 'ytmp3' || command === 'yta' || command === 'ytaudio') {
        const url = args[0]
        if (!url || !url.includes('youtu')) return reply(`Usage: *${prefix}ytmp3 <YouTube URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/download/ytmp3', { url })
        if (!r.success) {
            await react(conn, m, '❌')
            return reply(`❌ Download failed: ${r.error || 'Unknown error'}`)
        }
        const d = r.result
        const audioUrl = d?.download_url || d?.downloadUrl || d?.url || d?.audio || d?.link
        if (!audioUrl) {
            await react(conn, m, '❌')
            return reply(`❌ No audio URL in response.`)
        }
        await react(conn, m, '✅')
        await conn.sendMessage(m.chat, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${d.title || 'audio'}.mp3`
        }, { quoted: m })
        return reply(`🎵 *${d.title || 'Audio'}*\n${d.channel ? `👤 ${d.channel}\n` : ''}${d.duration ? `⏱ ${d.duration}` : ''}`)
    }

    // ── YOUTUBE VIDEO ──────────────────────────────────────────────────────────
    if (command === 'ytmp4' || command === 'ytv' || command === 'ytvideo') {
        const url = args[0]
        if (!url || !url.includes('youtu')) return reply(`Usage: *${prefix}ytmp4 <YouTube URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/download/ytmp4', { url, quality: '360p' })
        if (!r.success) {
            await react(conn, m, '❌')
            return reply(`❌ Download failed: ${r.error || 'Unknown error'}`)
        }
        const d = r.result
        const videoUrl = d?.download_url || d?.downloadUrl || d?.url || d?.video || d?.link
        if (!videoUrl) {
            await react(conn, m, '❌')
            return reply(`❌ No video URL in response.`)
        }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption: `🎬 *${d.title || 'Video'}*${d.channel ? `\n👤 ${d.channel}` : ''}${d.duration ? `\n⏱ ${d.duration}` : ''}`,
            fileName: `${d.title || 'video'}.mp4`
        }, { quoted: m })
    }

    // ── TIKTOK ────────────────────────────────────────────────────────────────
    if (command === 'tiktok' || command === 'tt' || command === 'tiktokdl') {
        const url = args[0]
        if (!url || !url.includes('tiktok')) return reply(`Usage: *${prefix}tiktok <TikTok URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/download/tiktok', { url })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ TikTok download failed: ${r.error || 'No result'}`)
        }
        const d = r.result
        const videoUrl = d?.video?.[0] || d?.nowm || d?.url || d?.download_url
        const audioUrl = d?.music
        if (!videoUrl && !audioUrl) {
            await react(conn, m, '❌')
            return reply(`❌ Could not extract media from this TikTok.`)
        }
        await react(conn, m, '✅')
        if (videoUrl) {
            return conn.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: `🎵 *${d.title || d.desc || 'TikTok Video'}*\n👤 @${d.author?.nickname || d.author || 'unknown'}`
            }, { quoted: m })
        }
        return conn.sendMessage(m.chat, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp4',
            fileName: 'tiktok_audio.mp3'
        }, { quoted: m })
    }

    // ── INSTAGRAM ─────────────────────────────────────────────────────────────
    if (command === 'igdl' || command === 'instagram' || command === 'insta') {
        const url = args[0]
        if (!url || !/instagram|instagr\.am/.test(url)) return reply(`Usage: *${prefix}igdl <Instagram URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/download/instadl', { url })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Instagram download failed: ${r.error || 'No result'}`)
        }
        const d = r.result
        const medias = d.media || d.medias || [d]
        const first = Array.isArray(medias) ? medias[0] : d
        const mediaUrl = first?.url || first?.download_url || first?.video || first?.image
        if (!mediaUrl) {
            await react(conn, m, '❌')
            return reply(`❌ Could not extract media from this post.`)
        }
        await react(conn, m, '✅')
        const caption = `📸 *${d.caption?.slice(0, 100) || 'Instagram Post'}*`
        if (/video/.test(first?.type || '') || first?.video) {
            return conn.sendMessage(m.chat, { video: { url: mediaUrl }, caption }, { quoted: m })
        }
        return conn.sendMessage(m.chat, { image: { url: mediaUrl }, caption }, { quoted: m })
    }

    // ── TWITTER/X ─────────────────────────────────────────────────────────────
    if (command === 'twitter' || command === 'xdl' || command === 'twdl') {
        const url = args[0]
        if (!url || !/(twitter|x\.com)/.test(url)) return reply(`Usage: *${prefix}twitter <Tweet URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/download/twitter', { url })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Twitter download failed: ${r.error || 'No result'}`)
        }
        const d = r.result
        const videoUrl = d?.video?.[0]?.url || d?.url || d?.media?.[0]?.url
        if (!videoUrl) {
            await react(conn, m, '❌')
            return reply(`❌ No video found in this tweet.`)
        }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption: `🐦 *${d.text?.slice(0, 120) || 'Twitter Video'}*`
        }, { quoted: m })
    }

    // ── SPOTIFY DOWNLOAD ──────────────────────────────────────────────────────
    if (command === 'spotifydl' || command === 'spdl') {
        const url = args[0]
        if (!url || !url.includes('spotify')) return reply(`Usage: *${prefix}spotifydl <Spotify Track URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/download/spotifydl', { url })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Spotify download failed: ${r.error || 'No result'}`)
        }
        const d = r.result
        const audioUrl = d?.download_url || d?.url || d?.audio
        if (!audioUrl) {
            await react(conn, m, '❌')
            return reply(`❌ No audio URL found.`)
        }
        await react(conn, m, '✅')
        await conn.sendMessage(m.chat, {
            audio: { url: audioUrl },
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${d.title || 'spotify'}.mp3`
        }, { quoted: m })
        return reply(`🎵 *${d.title || d.name || 'Track'}*${d.artist ? `\n👤 ${d.artist}` : ''}${d.duration ? `\n⏱ ${fmtDuration(d.duration)}` : ''}`)
    }

    // ── LYRICS ────────────────────────────────────────────────────────────────
    if (command === 'lyrics' || command === 'lyric') {
        if (!text) return reply(`Usage: *${prefix}lyrics <song name>*`)
        await react(conn, m, '🎵')
        const r = await gt('/api/search/lyrics', { query: text })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not find lyrics for: *${text}*\n_Try adding the artist name._`)
        }
        const d = r.result
        const lyr = d.lyrics || d.lyric || d.result
        if (!lyr) {
            await react(conn, m, '❌')
            return reply(`❌ Lyrics found but empty.`)
        }
        await react(conn, m, '✅')
        const header = `🎵 *${d.title || text}*${d.artist ? ` — ${d.artist}` : ''}\n${'─'.repeat(28)}\n\n`
        const body = lyr.slice(0, 3500)
        return reply(header + body + (lyr.length > 3500 ? '\n\n_...lyrics truncated_' : ''))
    }

    // ── DEFINE ────────────────────────────────────────────────────────────────
    if (command === 'define' || command === 'meaning') {
        if (!text) return reply(`Usage: *${prefix}define <word>*`)
        await react(conn, m, '📖')
        const r = await gt('/api/search/define', { term: text })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ No definition found for: *${text}*`)
        }
        const d = r.result
        await react(conn, m, '✅')
        return reply(`📖 *${d.term || text}*\n\n${d.definition || d.meaning || JSON.stringify(d).slice(0, 500)}`)
    }

    // ── DICTIONARY ────────────────────────────────────────────────────────────
    if (command === 'dict' || command === 'dictionary') {
        if (!text) return reply(`Usage: *${prefix}dict <word>*`)
        await react(conn, m, '📚')
        const r = await gt('/api/search/dictionary', { word: text })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ No dictionary entry for: *${text}*`)
        }
        const d = r.result
        await react(conn, m, '✅')
        const phonetic = d.phonetic ? `  /${d.phonetic}/` : ''
        const meanings = d.meanings || (d.meaning ? [d.meaning] : [])
        let out = `📚 *${d.word || text}*${phonetic}\n\n`
        if (Array.isArray(meanings)) {
            meanings.slice(0, 3).forEach(m => {
                const pos = m.partOfSpeech || m.pos || ''
                const defs = m.definitions || (m.definition ? [{ definition: m.definition }] : [])
                if (pos) out += `_${pos}_\n`
                defs.slice(0, 2).forEach((def, i) => {
                    out += `${i + 1}. ${def.definition || def}\n`
                    if (def.example) out += `   _"${def.example}"_\n`
                })
                out += '\n'
            })
        } else {
            out += JSON.stringify(meanings).slice(0, 400)
        }
        return reply(out.trim())
    }

    // ── GOOGLE SEARCH ─────────────────────────────────────────────────────────
    if (command === 'google' || command === 'search') {
        if (!text) return reply(`Usage: *${prefix}google <query>*`)
        await react(conn, m, '🔍')
        const r = await gt('/api/search/google', { query: text })
        if (!r.success || !r.results?.length) {
            await react(conn, m, '❌')
            return reply(`❌ No results for: *${text}*`)
        }
        await react(conn, m, '✅')
        const results = r.results.slice(0, 5)
        const lines = results.map((x, i) =>
            `*${i + 1}. ${x.title}*\n${x.snippet ? x.snippet.slice(0, 120) + '\n' : ''}🔗 ${x.link}`
        )
        return reply(`🔍 *Google: "${text}"*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── WIKIPEDIA ─────────────────────────────────────────────────────────────
    if (command === 'wiki' || command === 'wikipedia') {
        if (!text) return reply(`Usage: *${prefix}wiki <topic>*`)
        await react(conn, m, '🌐')
        const r = await gt('/api/search/wikimedia', { title: text })
        if (!r.success || !r.results) {
            await react(conn, m, '❌')
            return reply(`❌ No Wikipedia article found for: *${text}*`)
        }
        const d = r.results
        await react(conn, m, '✅')
        const extract = (d.extract || d.description || '').slice(0, 1200)
        const url = d.url || d.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(text)}`
        return reply(`🌐 *${d.title || text}*\n${'─'.repeat(28)}\n\n${extract}\n\n🔗 ${url}`)
    }

    // ── WEATHER ───────────────────────────────────────────────────────────────
    if (command === 'weather' || command === 'clima') {
        if (!text) return reply(`Usage: *${prefix}weather <city>*`)
        await react(conn, m, '🌤')
        const r = await gt('/api/search/weather', { city: text })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            const r2 = await gt('/api/search/weather', { location: text })
            if (!r2.success || !r2.result) {
                return reply(`❌ Couldn't fetch weather for: *${text}*`)
            }
            const w = r2.result
            await react(conn, m, '✅')
            return reply(formatWeather(w, text))
        }
        const w = r.result
        await react(conn, m, '✅')
        return reply(formatWeather(w, text))
    }

    // ── SHAZAM / MUSIC IDENTIFY ────────────────────────────────────────────────
    if (command === 'shazam' || command === 'identify') {
        const url = args[0]
        if (!url || !url.startsWith('http')) return reply(`Usage: *${prefix}shazam <audio/video URL>*`)
        await react(conn, m, '🎵')
        const r = await gt('/api/search/shazam', { url })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Couldn't identify music from that URL.`)
        }
        const d = r.result
        await react(conn, m, '✅')
        return reply(`🎵 *Identified!*\n\n*Title:* ${d.title || 'Unknown'}\n*Artist:* ${d.artist || d.subtitle || 'Unknown'}${d.album ? `\n*Album:* ${d.album}` : ''}${d.genre ? `\n*Genre:* ${d.genre}` : ''}`)
    }

    // ── SPOTIFY SEARCH ────────────────────────────────────────────────────────
    if (command === 'spotifysearch' || command === 'spsearch') {
        if (!text) return reply(`Usage: *${prefix}spotifysearch <song name>*`)
        await react(conn, m, '🎵')
        const r = await gt('/api/search/spotifysearch', { query: text })
        if (!r.success || !r.results?.length) {
            await react(conn, m, '❌')
            return reply(`❌ No Spotify results for: *${text}*`)
        }
        await react(conn, m, '✅')
        const tracks = r.results.slice(0, 5)
        const lines = tracks.map((t, i) =>
            `*${i + 1}. ${t.title || t.name}* — ${t.artist || t.artists}\n🔗 ${t.url || t.link || ''}`
        )
        return reply(`🎵 *Spotify: "${text}"*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── REMOVE BACKGROUND ─────────────────────────────────────────────────────
    if (command === 'removebg' || command === 'rmbg' || command === 'nobg') {
        let imgUrl = args[0]
        if (!imgUrl && m.quoted && hasMedia(m.quoted)) {
            await react(conn, m, '⏳')
            const buf = await conn.downloadMediaMessage(m.quoted).catch(() => null)
            if (buf) {
                const tmpUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
                imgUrl = tmpUrl
            }
        }
        if (!imgUrl) return reply(`Usage: *${prefix}removebg <image URL>* or reply to an image.`)
        await react(conn, m, '⏳')
        const r = await gt('/api/tools/removebgv2', { url: imgUrl })
        if (!r.success || (!r.result && !r.url)) {
            await react(conn, m, '❌')
            return reply(`❌ Background removal failed: ${r.error || 'No result'}`)
        }
        const outUrl = r.result || r.url
        await react(conn, m, '✅')
        if (outUrl.startsWith('http')) {
            return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: '✅ *Background removed!*' }, { quoted: m })
        }
        return conn.sendMessage(m.chat, { image: Buffer.from(outUrl.split(',')[1] || outUrl, 'base64'), caption: '✅ *Background removed!*' }, { quoted: m })
    }

    // ── CREATE QR CODE ────────────────────────────────────────────────────────
    if (command === 'createqr' || command === 'qr' || command === 'qrcode') {
        if (!text) return reply(`Usage: *${prefix}qr <text or URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/tools/createqr', { url: text })
        if (!r.success && !r.result) {
            const r2 = await gt('/api/tools/createqr', { text, q: text })
            if (!r2.success) {
                await react(conn, m, '❌')
                return reply(`❌ QR generation failed: ${r2.error || r.error}`)
            }
            const qrUrl = r2.result || r2.url || r2.image
            if (!qrUrl) {
                await react(conn, m, '❌')
                return reply(`❌ QR generation returned no image.`)
            }
            await react(conn, m, '✅')
            return conn.sendMessage(m.chat, { image: { url: qrUrl }, caption: `📱 QR Code for: _${text.slice(0, 60)}_` }, { quoted: m })
        }
        const qrUrl = r.result || r.url || r.image
        await react(conn, m, '✅')
        if (qrUrl.startsWith('http')) {
            return conn.sendMessage(m.chat, { image: { url: qrUrl }, caption: `📱 QR Code for: _${text.slice(0, 60)}_` }, { quoted: m })
        }
        return conn.sendMessage(m.chat, { image: Buffer.from(qrUrl.split(',')[1] || qrUrl, 'base64'), caption: `📱 QR Code for: _${text.slice(0, 60)}_` }, { quoted: m })
    }

    // ── READ QR CODE ──────────────────────────────────────────────────────────
    if (command === 'readqr' || command === 'scanqr') {
        let imgUrl = args[0]
        if (!imgUrl && m.quoted && hasMedia(m.quoted)) {
            imgUrl = `quoted_image`
        }
        if (!imgUrl) return reply(`Usage: *${prefix}readqr <image URL>* or reply to a QR code image.`)
        if (imgUrl === 'quoted_image') {
            await react(conn, m, '❌')
            return reply(`❌ Please provide an image URL: *${prefix}readqr <URL>*`)
        }
        await react(conn, m, '⏳')
        const r = await gt('/api/tools/readqr', { url: imgUrl })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not read QR code: ${r.error || 'No data'}`)
        }
        await react(conn, m, '✅')
        return reply(`📱 *QR Code Content:*\n\n${r.result}`)
    }

    // ── SCREENSHOT WEBSITE ────────────────────────────────────────────────────
    if (command === 'ssweb' || command === 'screenshot' || command === 'webss') {
        const url = args[0]
        if (!url || !url.startsWith('http')) return reply(`Usage: *${prefix}ssweb <URL>*\n_Example: ${prefix}ssweb https://google.com_`)
        await react(conn, m, '⏳')
        try {
            const r = await axios.get(`${GT}/api/tools/ssweb`, {
                params: { apikey: KEY, url },
                responseType: 'arraybuffer',
                timeout: 30000
            })
            await react(conn, m, '✅')
            return conn.sendMessage(m.chat, {
                image: Buffer.from(r.data),
                caption: `📸 *Screenshot of:*\n🔗 ${url}`
            }, { quoted: m })
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Screenshot failed: ${e.message}`)
        }
    }

    // ── OCR (Image to Text) ───────────────────────────────────────────────────
    if (command === 'ocr' || command === 'readtext' || command === 'img2txt') {
        let imgUrl = args[0]
        if (!imgUrl && m.quoted && hasMedia(m.quoted)) {
            await react(conn, m, '⏳')
            const buf = await conn.downloadMediaMessage(m.quoted).catch(() => null)
            if (buf) imgUrl = 'data:image/jpeg;base64,' + buf.toString('base64')
        }
        if (!imgUrl) return reply(`Usage: *${prefix}ocr <image URL>* or reply to an image.`)
        await react(conn, m, '⏳')
        const r = await gt('/api/tools/ocr', { url: imgUrl })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ OCR failed: ${r.error || 'No text found'}`)
        }
        await react(conn, m, '✅')
        return reply(`📝 *Text Extracted:*\n\n${r.result.slice(0, 2000)}`)
    }

    // ── IMAGE UPSCALER ────────────────────────────────────────────────────────
    if (command === 'upscale' || command === 'enhance' || command === 'hd') {
        let imgUrl = args[0]
        if (!imgUrl && m.quoted && hasMedia(m.quoted)) {
            await react(conn, m, '⏳')
            const buf = await conn.downloadMediaMessage(m.quoted).catch(() => null)
            if (buf) imgUrl = 'data:image/jpeg;base64,' + buf.toString('base64')
        }
        if (!imgUrl) return reply(`Usage: *${prefix}upscale <image URL>* or reply to an image.`)
        await react(conn, m, '⏳')
        const r = await gt('/api/tools/imageupscaler', { url: imgUrl, model: 'upscale' })
        if (!r.success || (!r.result && !r.url)) {
            await react(conn, m, '❌')
            return reply(`❌ Upscale failed: ${r.error || 'No result'}`)
        }
        const outUrl = r.result || r.url
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: '✨ *Image Enhanced!*' }, { quoted: m })
    }

    // ── PHOTO EDITING SUITE (all Gifted Tech endpoints) ───────────────────────
    if (command === 'cartoon' || command === 'cartoonify' || command === 'tooncartoon') {
        return photoEdit(m, conn, reply, args, prefix, 'cartoon', 'Cartoonified',
            ['/api/tools/imagecartoonifier', '/api/imageedit/cartoon', '/api/ai/cartoon'])
    }

    if (command === 'colorize' || command === 'colorizeimage' || command === 'colorise') {
        return photoEdit(m, conn, reply, args, prefix, 'colorize', 'Colorized',
            ['/api/tools/colorizeimage', '/api/imageedit/colorize', '/api/ai/colorize'])
    }

    if (command === 'blur' || command === 'blurimage') {
        return photoEdit(m, conn, reply, args, prefix, 'blur', 'Blurred',
            ['/api/imageedit/blur', '/api/tools/imageblur', '/api/imageedit/blurimage'])
    }

    if (command === 'sepia' || command === 'sepiafilter') {
        return photoEdit(m, conn, reply, args, prefix, 'sepia', 'Sepia Filter',
            ['/api/imageedit/sepia', '/api/tools/imagesepia'])
    }

    if (command === 'bw' || command === 'blackwhite' || command === 'bnw') {
        return photoEdit(m, conn, reply, args, prefix, 'bw', 'Black & White',
            ['/api/imageedit/blackwhite', '/api/imageedit/bw', '/api/tools/imageblackwhite'])
    }

    if (command === 'grayscale' || command === 'greyscale' || command === 'gray') {
        return photoEdit(m, conn, reply, args, prefix, 'grayscale', 'Grayscale',
            ['/api/imageedit/grayscale', '/api/imageedit/greyscale', '/api/tools/imagegrayscale'])
    }

    if (command === 'sharpen' || command === 'sharp') {
        return photoEdit(m, conn, reply, args, prefix, 'sharpen', 'Sharpened',
            ['/api/imageedit/sharpen', '/api/tools/imagesharpen'])
    }

    if (command === 'invert' || command === 'invertcolors' || command === 'negative') {
        return photoEdit(m, conn, reply, args, prefix, 'invert', 'Inverted Colors',
            ['/api/imageedit/invert', '/api/tools/imageinvert', '/api/imageedit/negative'])
    }

    if (command === 'sketch' || command === 'pencilsketch' || command === 'pencil') {
        return photoEdit(m, conn, reply, args, prefix, 'sketch', 'Pencil Sketch',
            ['/api/imageedit/sketch', '/api/tools/imagesketch', '/api/ai/pencilsketch'])
    }

    if (command === 'pixelate' || command === 'pixel' || command === 'pixelize') {
        return photoEdit(m, conn, reply, args, prefix, 'pixelate', 'Pixelated',
            ['/api/imageedit/pixelate', '/api/tools/imagepixelate'])
    }

    if (command === 'anime' || command === 'toanime' || command === 'animify') {
        return photoEdit(m, conn, reply, args, prefix, 'anime', 'Anime Style',
            ['/api/ai/img2anime', '/api/tools/imagetoanime', '/api/ai/animeify'])
    }

    if (command === 'img2img' || command === 'imgedit' || command === 'restyle') {
        const imgUrl = await resolveImageUrl(m, conn, args)
        if (!imgUrl) return reply(`Usage: reply to an image with *${prefix}img2img <prompt>*\nExample: reply with *${prefix}img2img make it look like a Studio Ghibli scene*`)
        if (!text || text.length < 3) return reply(`❌ Add a prompt. Example: *${prefix}img2img turn this into a watercolor painting*`)
        await react(conn, m, '🎨')
        const endpoints = ['/api/ai/img2img', '/api/ai/imageremix', '/api/tools/img2img']
        let outUrl = null, lastErr = ''
        for (const ep of endpoints) {
            const r = await gt(ep, { url: imgUrl, prompt: text })
            const candidate = r?.result?.url || r?.result || r?.url || r?.image
            if (typeof candidate === 'string' && candidate.startsWith('http')) { outUrl = candidate; break }
            lastErr = r?.error || r?.message || 'no result'
        }
        if (!outUrl) {
            await react(conn, m, '❌')
            return reply(`❌ Image-to-image failed: ${lastErr}`)
        }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: `🎨 *${text.slice(0, 80)}*` }, { quoted: m })
    }

    // ── AI IMAGE GENERATION (Gifted) ──────────────────────────────────────────
    if (command === 'imagine' || command === 'ai4k' || command === 'aigen' || command === 'flux') {
        if (!text) return reply(`Usage: *${prefix}imagine <description>*\n_Example: ${prefix}imagine a sunset over Nairobi_`)
        await react(conn, m, '🎨')
        const endpoints = ['/api/ai/fluximg', '/api/ai/deepimg', '/api/ai/txt2img', '/api/ai/magicstudio']
        let success = false
        for (const ep of endpoints) {
            const r = await gt(ep, { prompt: text })
            const imgUrl = r?.result || r?.url || r?.image || r?.imageUrl
            if (imgUrl && imgUrl.startsWith('http')) {
                await react(conn, m, '✅')
                await conn.sendMessage(m.chat, { image: { url: imgUrl }, caption: `🎨 *${text.slice(0, 80)}*` }, { quoted: m })
                success = true
                break
            }
        }
        if (!success) {
            await react(conn, m, '❌')
            return reply(`❌ Image generation failed. All providers unavailable.`)
        }
        return
    }

    // ── YOUTUBE TRANSCRIPT ────────────────────────────────────────────────────
    if (command === 'transcript' || command === 'ytscript' || command === 'captions') {
        const url = args[0]
        if (!url || !url.includes('youtu')) return reply(`Usage: *${prefix}transcript <YouTube URL>*`)
        await react(conn, m, '⏳')
        const r = await gt('/api/ai/transcript', { url })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not get transcript: ${r.error || 'No captions found'}`)
        }
        await react(conn, m, '✅')
        const txt = String(r.result).slice(0, 3000)
        return reply(`📝 *YouTube Transcript*\n${'─'.repeat(28)}\n\n${txt}${txt.length === 3000 ? '\n\n_...truncated_' : ''}`)
    }

    // ── FOOTBALL LIVE SCORES ──────────────────────────────────────────────────
    if (command === 'livescore' || command === 'live' || command === 'scores') {
        await react(conn, m, '⚽')
        const r = await gt('/api/football/livescore')
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not fetch live scores.`)
        }
        await react(conn, m, '✅')
        const matches = Array.isArray(r.result) ? r.result.slice(0, 10) : Object.values(r.result || {}).flat().slice(0, 10)
        if (!matches.length) return reply(`⚽ No live matches right now.`)
        const lines = matches.map(g => {
            const score = (g.score || g.result || `${g.homeScore || 0} - ${g.awayScore || 0}`).toString()
            const status = g.status || g.minute || g.time || ''
            return `⚽ *${g.homeTeam}* ${score} *${g.awayTeam}*${status ? ` _(${status})_` : ''}\n   ${g.league || g.competition || ''}`
        })
        return reply(`⚽ *Live Scores*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── FOOTBALL PREDICTIONS ──────────────────────────────────────────────────
    if (command === 'predictions' || command === 'predict' || command === 'tips') {
        await react(conn, m, '🔮')
        const r = await gt('/api/football/predictions')
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not fetch predictions.`)
        }
        await react(conn, m, '✅')
        const games = Array.isArray(r.result) ? r.result.slice(0, 8) : []
        if (!games.length) return reply(`🔮 No predictions available right now.`)
        const lines = games.map(g => {
            const p = g.predictions || {}
            const ft = p.fulltime || {}
            const best = ft.home > ft.away ? `${g.match?.split(' vs ')[0] || 'Home'} to win (${Math.round(ft.home)}%)` :
                         ft.away > ft.home ? `${g.match?.split(' vs ')[1] || 'Away'} to win (${Math.round(ft.away)}%)` :
                         `Draw (${Math.round(ft.draw || 33)}%)`
            return `🔮 *${g.match}*\n   📅 ${g.time?.split(' ')[0] || 'TBD'} · _${g.league}_\n   💡 ${best}`
        })
        return reply(`🔮 *Today's Predictions*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── LEAGUE STANDINGS ──────────────────────────────────────────────────────
    const leagueMap = {
        epl: { path: '/api/football/epl/standings', name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 EPL Standings' },
        laliga: { path: '/api/football/laliga/standings', name: '🇪🇸 La Liga Standings' },
        ucl: { path: '/api/football/ucl/standings', name: '🏆 UCL Standings' },
        bundesliga: { path: '/api/football/bundesliga/standings', name: '🇩🇪 Bundesliga Standings' },
        seriea: { path: '/api/football/seriea/standings', name: '🇮🇹 Serie A Standings' },
        ligue1: { path: '/api/football/ligue1/standings', name: '🇫🇷 Ligue 1 Standings' },
        euros: { path: '/api/football/euros/standings', name: '🇪🇺 Euros Standings' },
    }
    if (leagueMap[command]) {
        const { path, name } = leagueMap[command]
        await react(conn, m, '⚽')
        const r = await gt(path)
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not fetch standings.`)
        }
        await react(conn, m, '✅')
        const teams = Array.isArray(r.result) ? r.result.slice(0, 10) : (r.result?.standings || []).slice(0, 10)
        if (!teams.length) return reply(`⚽ No standings data available.`)
        const header = `*${name}* (Top 10)\n${'─'.repeat(30)}\n*# Team         Pts  W  D  L*\n`
        const rows = teams.map(t => {
            const pos = String(t.position || t.rank || t.pos || teams.indexOf(t) + 1).padStart(2)
            const name_ = (t.team || t.name || t.club || '?').padEnd(14).slice(0, 14)
            const pts = String(t.points || t.pts || 0).padStart(3)
            const w = String(t.won || t.w || 0).padStart(2)
            const d = String(t.draw || t.d || 0).padStart(2)
            const l = String(t.lost || t.l || 0).padStart(2)
            return `${pos} ${name_} ${pts} ${w} ${d} ${l}`
        })
        return reply('```\n' + header + rows.join('\n') + '\n```')
    }

    // ── FOOTBALL NEWS ─────────────────────────────────────────────────────────
    if (command === 'fnews' || command === 'footballnews') {
        await react(conn, m, '📰')
        const r = await gt('/api/football/news')
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not fetch football news.`)
        }
        await react(conn, m, '✅')
        const articles = Array.isArray(r.result) ? r.result.slice(0, 5) : []
        if (!articles.length) return reply(`📰 No news articles found.`)
        const lines = articles.map((a, i) =>
            `*${i + 1}. ${a.title || a.headline}*\n${a.summary || a.description || ''}\n🔗 ${a.url || a.link || ''}`
        )
        return reply(`📰 *Football News*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── BIBLE VERSE ────────────────────────────────────────────────────────────
    if (command === 'bible' || command === 'verse') {
        if (!text) return reply(`Usage: *${prefix}bible <verse>*\n_Example: ${prefix}bible John 3:16_`)
        await react(conn, m, '📖')
        const r = await gt('/api/search/bible', { verse: text })
        if (!r.success || !r.result) {
            await react(conn, m, '❌')
            return reply(`❌ Could not find verse: *${text}*`)
        }
        await react(conn, m, '✅')
        const d = r.result
        return reply(`📖 *${d.verse || text}*\n\n_${d.text || d.content || d.result}_\n\n${d.translation ? `📌 ${d.translation}` : ''}`)
    }

    // ── WALLPAPER ──────────────────────────────────────────────────────────────
    if (command === 'wallpaper' || command === 'wp' || command === 'wallp') {
        if (!text) return reply(`Usage: *${prefix}wallpaper <keyword>*`)
        await react(conn, m, '🖼')
        const r = await gt('/api/search/wallpaper', { query: text })
        if (!r.success || !r.results?.length) {
            await react(conn, m, '❌')
            return reply(`❌ No wallpapers found for: *${text}*`)
        }
        await react(conn, m, '✅')
        const img = r.results[Math.floor(Math.random() * Math.min(r.results.length, 5))]
        const imgUrl = img.url || img.imageUrl || img.image || img.full || img.src
        return conn.sendMessage(m.chat, { image: { url: imgUrl }, caption: `🖼 *${text}*` }, { quoted: m })
    }
}

const formatWeather = (w, query) => {
    if (!w || typeof w !== 'object') return `⛅ Weather for *${query}*:\n${JSON.stringify(w).slice(0, 200)}`
    const loc = w.location || w.city || w.name || query
    const temp = w.temperature || w.temp || w.current?.temp_c || w.main?.temp || '?'
    const desc = w.condition || w.description || w.weather?.[0]?.description || w.current?.condition?.text || ''
    const feels = w.feels_like || w.feelsLike || w.current?.feelslike_c || ''
    const humidity = w.humidity || w.current?.humidity || ''
    const wind = w.wind_speed || w.wind || w.current?.wind_kph || ''
    return `⛅ *Weather — ${loc}*\n${'─'.repeat(28)}\n🌡 Temperature: *${temp}°C*\n☁️ ${desc}${feels ? `\n🤔 Feels like: *${feels}°C*` : ''}${humidity ? `\n💧 Humidity: *${humidity}%*` : ''}${wind ? `\n💨 Wind: *${wind} km/h*` : ''}`
}

handle.command = [
    'ytmp3', 'yta', 'ytaudio', 'ytmp4', 'ytv', 'ytvideo',
    'tiktok', 'tt', 'tiktokdl',
    'igdl', 'instagram', 'insta',
    'twitter', 'xdl', 'twdl',
    'spotifydl', 'spdl',
    'lyrics', 'lyric',
    'define', 'meaning',
    'dict', 'dictionary',
    'google', 'search',
    'wiki', 'wikipedia',
    'weather', 'clima',
    'shazam', 'identify',
    'spotifysearch', 'spsearch',
    'removebg', 'rmbg', 'nobg',
    'createqr', 'qr', 'qrcode',
    'readqr', 'scanqr',
    'ssweb', 'screenshot', 'webss',
    'ocr', 'readtext', 'img2txt',
    'upscale', 'enhance', 'hd',
    'imagine', 'ai4k', 'aigen', 'flux',
    // Photo editing suite
    'cartoon', 'cartoonify', 'tooncartoon',
    'colorize', 'colorizeimage', 'colorise',
    'blur', 'blurimage',
    'sepia', 'sepiafilter',
    'bw', 'blackwhite', 'bnw',
    'grayscale', 'greyscale', 'gray',
    'sharpen', 'sharp',
    'invert', 'invertcolors', 'negative',
    'sketch', 'pencilsketch', 'pencil',
    'pixelate', 'pixel', 'pixelize',
    'anime', 'toanime', 'animify',
    'img2img', 'imgedit', 'restyle',
    'transcript', 'ytscript', 'captions',
    'livescore', 'live', 'scores',
    'predictions', 'predict', 'tips',
    'epl', 'laliga', 'ucl', 'bundesliga', 'seriea', 'ligue1', 'euros',
    'fnews', 'footballnews',
    'bible', 'verse',
    'wallpaper', 'wp', 'wallp',
]
handle.tags = ['media', 'search', 'sports', 'tools']

module.exports = handle
