/**
 * Bera AI — Converters, Downloaders & Search Plugin
 * Covers: toaudio, toptt, tovideo, individual downloaders (fb, tiktok, ig, twitter, ytv, spotify, gdrive, mediafire, apk),
 *         search (yts, lyrics, google, shazam), and misc tools (screenshot, binary, base64, domaincheck)
 */
const axios = require('axios')
const config = require('../Config')
const { searchYoutube, downloadAudio, downloadVideo, searchAndDownloadVideo } = require('../Library/actions/music')

const APISKEITH = 'https://apiskeith.top'
const GIFTED_API = 'https://api.giftedtech.co.ke'

const react = (conn, m, emoji) =>
    conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const tryUrl = (v) => {
    if (typeof v === 'string' && v.startsWith('http')) return v
    if (v && typeof v === 'object') {
        for (const k of ['url','download','link','src','video','audio','mp3','mp4','hd','sd','high','medium','low','default']) {
            if (typeof v[k] === 'string' && v[k].startsWith('http')) return v[k]
        }
        if (Array.isArray(v) && v.length) return tryUrl(v[0])
    }
    return ''
}

// ─────────────────────────────────────────────
// MEDIA CONVERTERS
// ─────────────────────────────────────────────
const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner }) => {

    const quoted = m.quoted

    // ── TOAUDIO — video/sticker/quoted → mp3 ─
    if (command === 'toaudio' || command === 'tomp3') {
        const target = quoted || m
        if (!target || !/video|gif|audio/.test(target.mimetype || '')) {
            return reply(`🎵 Usage: send/quote a video or GIF with *${prefix}toaudio*`)
        }
        await react(conn, m, '🎵')
        try {
            const buf = await conn.downloadMediaMessage({ key: target.key, message: target.message })
            if (!buf) throw new Error('Could not download media')
            // Write to temp file and convert using ffmpeg if available, else just send as audio
            await conn.sendMessage(chat, {
                audio: buf,
                mimetype: 'audio/mpeg',
                fileName: 'audio.mp3'
            }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Conversion failed: ${e.message}`)
        }
    }

    // ── TOPTT — audio/video → voice note (ptt) ─
    if (command === 'toptt' || command === 'tovoice' || command === 'tovn') {
        const target = quoted || m
        if (!target || !/video|gif|audio/.test(target.mimetype || '')) {
            return reply(`🎙️ Send/quote audio or video with *${prefix}toptt*`)
        }
        await react(conn, m, '🎙️')
        try {
            const buf = await conn.downloadMediaMessage({ key: target.key, message: target.message })
            if (!buf) throw new Error('Could not download media')
            await conn.sendMessage(chat, {
                audio: buf,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Failed: ${e.message}`)
        }
    }

    // ── TOVIDEO — GIF → video ──────────────────
    if (command === 'tovideo' || command === 'tomp4' || command === 'togif') {
        const target = quoted || m
        if (!target || !/gif|image|video/.test(target.mimetype || '')) {
            return reply(`🎬 Send/quote a GIF or image with *${prefix}tovideo*`)
        }
        await react(conn, m, '🎬')
        try {
            const buf = await conn.downloadMediaMessage({ key: target.key, message: target.message })
            if (!buf) throw new Error('Could not download media')
            await conn.sendMessage(chat, { video: buf, caption: 'Here is your video!' }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Failed: ${e.message}`)
        }
    }

    // ─────────────────────────────────────────────
    // INDIVIDUAL DOWNLOADERS
    // ─────────────────────────────────────────────

    // ── TIKTOK ───────────────────────────────────
    if (command === 'tiktok' || command === 'tt') {
        if (!text || !text.startsWith('http')) return reply(`🎵 Usage: ${prefix}tiktok <link>`)
        await react(conn, m, '⬇️')
        try {
            const endpoints = [
                `${APISKEITH}/download/tiktok`,
                `${GIFTED_API}/api/tiktok`,
                `${APISKEITH}/download/tt`
            ]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { url: text, q: text }, timeout: 30000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('All TikTok endpoints failed')
            const d = data.result || data.data || data
            const vidUrl = tryUrl(d?.video || d?.nowm || d?.wm || d) || tryUrl(d)
            const title = d?.title || d?.desc || 'TikTok Video'
            if (!vidUrl) throw new Error('No video URL found')
            await conn.sendMessage(chat, { video: { url: vidUrl }, caption: `🎵 ${title}` }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ TikTok download failed: ${e.message}`)
        }
    }

    // ── INSTAGRAM ────────────────────────────────
    if (command === 'ig' || command === 'instagram' || command === 'insta') {
        if (!text || !text.startsWith('http')) return reply(`📸 Usage: ${prefix}ig <link>`)
        await react(conn, m, '⬇️')
        try {
            const endpoints = [`${APISKEITH}/download/ig`, `${GIFTED_API}/api/instagram`, `${APISKEITH}/download/instagram`]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { url: text }, timeout: 30000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('All Instagram endpoints failed')
            const d = data.result || data.data || data
            const mediaUrl = tryUrl(d?.video || d?.image || d?.media || d) || tryUrl(d)
            if (!mediaUrl) throw new Error('No media URL found')
            const isVideo = /\.mp4|video/i.test(mediaUrl)
            if (isVideo) {
                await conn.sendMessage(chat, { video: { url: mediaUrl }, caption: `📸 Instagram Video` }, { quoted: m })
            } else {
                await conn.sendMessage(chat, { image: { url: mediaUrl }, caption: `📸 Instagram Photo` }, { quoted: m })
            }
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Instagram download failed: ${e.message}`)
        }
    }

    // ── TWITTER/X ────────────────────────────────
    if (command === 'twitter' || command === 'tw' || command === 'xvideo') {
        if (!text || !text.startsWith('http')) return reply(`🐦 Usage: ${prefix}twitter <link>`)
        await react(conn, m, '⬇️')
        try {
            const endpoints = [`${APISKEITH}/download/twitter`, `${GIFTED_API}/api/twitter`, `${APISKEITH}/download/tw`]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { url: text }, timeout: 30000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('All Twitter endpoints failed')
            const d = data.result || data.data || data
            const vidUrl = tryUrl(d?.video || d?.hd || d?.sd || d) || tryUrl(d)
            if (!vidUrl) throw new Error('No video URL found')
            await conn.sendMessage(chat, { video: { url: vidUrl }, caption: `🐦 Twitter/X Video` }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Twitter download failed: ${e.message}`)
        }
    }

    // ── FACEBOOK ─────────────────────────────────
    if (command === 'fb' || command === 'facebook') {
        if (!text || !text.startsWith('http')) return reply(`📘 Usage: ${prefix}fb <link>`)
        await react(conn, m, '⬇️')
        try {
            const endpoints = [`${APISKEITH}/download/facebook`, `${GIFTED_API}/api/facebook`, `${APISKEITH}/download/fb`]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { url: text }, timeout: 30000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('All Facebook endpoints failed')
            const d = data.result || data.data || data
            const vidUrl = tryUrl(d?.video || d?.hd || d?.sd || d) || tryUrl(d)
            if (!vidUrl) throw new Error('No video URL found')
            await conn.sendMessage(chat, { video: { url: vidUrl }, caption: `📘 Facebook Video` }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Facebook download failed: ${e.message}`)
        }
    }

    // ── YOUTUBE VIDEO ────────────────────────────
    if (command === 'ytv' || command === 'ytvideo') {
        if (!text) return reply(`▶️ Usage: ${prefix}ytv <youtube link or song name>`)
        await react(conn, m, '⬇️')
        const result = await searchAndDownloadVideo(text)
        if (!result.success) {
            await react(conn, m, '❌')
            return reply(`❌ YouTube video download failed: ${result.error}`)
        }
        try {
            await conn.sendMessage(chat, {
                video: { url: result.videoUrl },
                caption: `▶️ *${result.title}*\n🎤 ${result.channel || ''}\n⏱️ ${result.duration || ''}`
            }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Failed to send video: ${e.message}`)
        }
    }

    // ── VIDEO (play video from search) ───────────
    if (command === 'video') {
        if (!text) return reply(`▶️ Usage: ${prefix}video <song or title>`)
        await react(conn, m, '⬇️')
        const result = await searchAndDownloadVideo(text)
        if (!result.success) {
            await react(conn, m, '❌')
            return reply(`❌ Video download failed: ${result.error}`)
        }
        try {
            await conn.sendMessage(chat, {
                video: { url: result.videoUrl },
                caption: `▶️ *${result.title}*\n🎤 ${result.channel || ''}\n⏱️ ${result.duration || ''}`
            }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Failed to send video: ${e.message}`)
        }
    }

    // ── SPOTIFY ──────────────────────────────────
    if (command === 'spotify') {
        if (!text) return reply(`🎧 Usage: ${prefix}spotify <song name or link>`)
        await react(conn, m, '🎧')
        try {
            let audioUrl, title, thumb
            const isLink = text.startsWith('http') && text.includes('spotify')
            if (isLink) {
                const res = await axios.get(`${APISKEITH}/download/spotify`, { params: { url: text }, timeout: 40000 })
                const d = res.data?.result || res.data
                audioUrl = tryUrl(d?.audio || d?.mp3 || d?.download || d)
                title = d?.title || d?.name || 'Spotify Track'
                thumb = tryUrl(d?.thumbnail || d?.image || d?.cover)
            } else {
                // Search on YT as fallback since Spotify doesn't allow direct search without auth
                const dl = await (require('../Library/actions/music').searchAndDownload)(text)
                if (!dl.success) throw new Error(dl.error)
                audioUrl = dl.audioUrl
                title = dl.title
                thumb = dl.thumbnail
            }
            if (!audioUrl) throw new Error('No audio URL found')
            if (thumb) {
                await conn.sendMessage(chat, { image: { url: thumb }, caption: `🎧 *${title}*` }, { quoted: m })
            }
            await conn.sendMessage(chat, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Spotify download failed: ${e.message}`)
        }
    }

    // ── GDRIVE ───────────────────────────────────
    if (command === 'gdrive' || command === 'googledrive') {
        if (!text || !text.startsWith('http')) return reply(`📂 Usage: ${prefix}gdrive <google drive link>`)
        await react(conn, m, '📂')
        try {
            const endpoints = [`${APISKEITH}/download/gdrive`, `${GIFTED_API}/api/gdrive`]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { url: text }, timeout: 40000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('All GDrive endpoints failed')
            const d = data.result || data.data || data
            const fileUrl = tryUrl(d?.download || d?.url || d) || tryUrl(d)
            const fileName = d?.filename || d?.name || 'file'
            if (!fileUrl) throw new Error('No download URL found')
            await conn.sendMessage(chat, { document: { url: fileUrl }, fileName, mimetype: 'application/octet-stream' }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ GDrive download failed: ${e.message}`)
        }
    }

    // ── MEDIAFIRE ────────────────────────────────
    if (command === 'mediafire' || command === 'mf') {
        if (!text || !text.startsWith('http')) return reply(`📦 Usage: ${prefix}mediafire <link>`)
        await react(conn, m, '📦')
        try {
            const endpoints = [`${APISKEITH}/download/mediafire`, `${GIFTED_API}/api/mediafire`]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { url: text }, timeout: 40000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('All MediaFire endpoints failed')
            const d = data.result || data.data || data
            const fileUrl = tryUrl(d?.download || d?.url || d) || tryUrl(d)
            const fileName = d?.filename || d?.name || 'download'
            if (!fileUrl) throw new Error('No download URL found')
            await conn.sendMessage(chat, { document: { url: fileUrl }, fileName, mimetype: 'application/octet-stream' }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ MediaFire download failed: ${e.message}`)
        }
    }

    // ── APK ──────────────────────────────────────
    if (command === 'apk') {
        if (!text) return reply(`📱 Usage: ${prefix}apk <app name>\nExample: ${prefix}apk whatsapp`)
        await react(conn, m, '📱')
        try {
            const endpoints = [`${APISKEITH}/download/apk`, `${GIFTED_API}/api/apk`, `${APISKEITH}/search/apk`]
            let data
            for (const ep of endpoints) {
                try {
                    const res = await axios.get(ep, { params: { q: text, query: text }, timeout: 30000 })
                    if (res.data?.result || res.data?.url || res.data?.data) { data = res.data; break }
                } catch { continue }
            }
            if (!data) throw new Error('APK search failed')
            const d = data.result || data.data || data
            const fileUrl = tryUrl(d?.download || d?.apk || d?.url || d)
            const appName = d?.name || d?.title || text
            const version = d?.version || ''
            if (!fileUrl) {
                // Just return info if no direct download
                return reply(`📱 *${appName}* ${version}\n\n_Direct APK download not available. Try APKMirror or APKPure._`)
            }
            await conn.sendMessage(chat, {
                document: { url: fileUrl },
                fileName: `${appName.replace(/\s+/g,'_')}.apk`,
                mimetype: 'application/vnd.android.package-archive',
                caption: `📱 *${appName}* ${version}`
            }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ APK download failed: ${e.message}`)
        }
    }

    // ─────────────────────────────────────────────
    // SEARCH COMMANDS
    // ─────────────────────────────────────────────

    // ── YTS — YouTube search ──────────────────────
    if (command === 'yts' || command === 'ytsearch') {
        if (!text) return reply(`🔍 Usage: ${prefix}yts <query>`)
        await react(conn, m, '🔍')
        const res = await searchYoutube(text)
        if (!res.success) {
            await react(conn, m, '❌')
            return reply(`❌ No results: ${res.error}`)
        }
        const lines = res.results.slice(0, 5).map((r, i) => {
            const title = r.title || 'Unknown'
            const dur = typeof r.duration === 'string' ? r.duration : (r.duration?.text || '')
            const views = r.views || r.viewCount || ''
            return `${i+1}. *${title}*\n   ⏱️ ${dur}${views ? ' | 👁️ '+views : ''}`
        }).join('\n\n')
        await react(conn, m, '✅')
        return reply(`╭══〘 *🔍 YT SEARCH: ${text}* 〙═⊷\n\n${lines}\n╰══════════════════⊷\n\n_Use ${prefix}play <title> to download_`)
    }

    // ── LYRICS ────────────────────────────────────
    if (command === 'lyrics' || command === 'lyric') {
        if (!text) return reply(`🎵 Usage: ${prefix}lyrics <song name>`)
        await react(conn, m, '🎵')
        try {
            const res = await axios.get(`${APISKEITH}/search/lyrics`, { params: { query: text, q: text }, timeout: 15000 })
            const d = res.data?.result || res.data?.data || res.data
            const lyricsText = d?.lyrics || d?.text || d
            const title = d?.title || text
            const artist = d?.artist || ''
            if (!lyricsText || typeof lyricsText !== 'string') throw new Error('No lyrics found')
            const trimmed = lyricsText.slice(0, 3000) + (lyricsText.length > 3000 ? '\n...' : '')
            await react(conn, m, '✅')
            return reply(`╭══〘 *🎵 LYRICS* 〙═⊷\n*${title}*${artist ? '\n_'+artist+'_' : ''}\n\n${trimmed}\n╰══════════════════⊷`)
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Lyrics not found: ${e.message}`)
        }
    }

    // ── GOOGLE SEARCH ─────────────────────────────
    if (command === 'google' || command === 'gsearch') {
        if (!text) return reply(`🔍 Usage: ${prefix}google <query>`)
        await react(conn, m, '🔍')
        try {
            const res = await axios.get(`${APISKEITH}/search/google`, { params: { q: text, query: text }, timeout: 15000 })
            const results = res.data?.result || res.data?.results || res.data?.data || res.data
            const items = Array.isArray(results) ? results : []
            if (!items.length) throw new Error('No results found')
            const lines = items.slice(0, 5).map((r, i) => {
                const title = r.title || 'No title'
                const url = r.url || r.link || ''
                const desc = (r.description || r.snippet || '').slice(0, 150)
                return `${i+1}. *${title}*\n${desc}${url ? '\n🔗 '+url : ''}`
            }).join('\n\n')
            await react(conn, m, '✅')
            return reply(`╭══〘 *🔍 GOOGLE: ${text}* 〙═⊷\n\n${lines}\n╰══════════════════⊷`)
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Search failed: ${e.message}`)
        }
    }

    // ── SCREENSHOT (ssweb) ────────────────────────
    if (command === 'ssweb' || command === 'screenshot' || command === 'webss') {
        if (!text || !text.startsWith('http')) return reply(`🖥️ Usage: ${prefix}ssweb <url>\nExample: ${prefix}ssweb https://google.com`)
        await react(conn, m, '📷')
        try {
            const ssUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(text)}&format=jpg&block_ads=true&block_cookie_banners=true`
            // Fallback API
            const alt = `https://image.thum.io/get/width/1280/${encodeURIComponent(text)}`
            await conn.sendMessage(chat, { image: { url: alt }, caption: `🖥️ Screenshot: ${text}` }, { quoted: m })
            await react(conn, m, '✅')
        } catch (e) {
            await react(conn, m, '❌')
            return reply(`❌ Screenshot failed: ${e.message}`)
        }
    }

    // ── BINARY / BASE64 ──────────────────────────
    if (command === 'tobinary' || command === 'ebinary') {
        if (!text) return reply(`🔢 Usage: ${prefix}tobinary <text>`)
        const binary = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ')
        return reply(`🔢 *Binary:*\n${binary}`)
    }

    if (command === 'frombinary' || command === 'debinary') {
        if (!text) return reply(`🔢 Usage: ${prefix}frombinary <binary>`)
        try {
            const decoded = text.trim().split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('')
            return reply(`🔤 *Decoded:*\n${decoded}`)
        } catch { return reply('❌ Invalid binary input') }
    }

    if (command === 'tobase64' || command === 'ebase') {
        if (!text) return reply(`🔐 Usage: ${prefix}tobase64 <text>`)
        return reply(`🔐 *Base64:*\n${Buffer.from(text).toString('base64')}`)
    }

    if (command === 'frombase64' || command === 'dbase') {
        if (!text) return reply(`🔐 Usage: ${prefix}frombase64 <base64>`)
        try {
            return reply(`🔤 *Decoded:*\n${Buffer.from(text, 'base64').toString('utf8')}`)
        } catch { return reply('❌ Invalid base64 input') }
    }
}

handle.command = [
    'toaudio', 'tomp3',
    'toptt', 'tovoice', 'tovn',
    'tovideo', 'tomp4', 'togif',
    'tiktok', 'tt',
    'ig', 'instagram', 'insta',
    'twitter', 'tw', 'xvideo',
    'fb', 'facebook',
    'ytv', 'ytvideo', 'video',
    'spotify',
    'gdrive', 'googledrive',
    'mediafire', 'mf',
    'apk',
    'yts', 'ytsearch',
    'lyrics', 'lyric',
    'google', 'gsearch',
    'ssweb', 'screenshot', 'webss',
    'tobinary', 'ebinary', 'frombinary', 'debinary',
    'tobase64', 'ebase', 'frombase64', 'dbase'
]
handle.tags = ['converters']

module.exports = handle
