// Plugins/mediabtns.js — Media downloads with Audio/Video button UI
// .yt / .ytdl → [🎵 Audio] [🎬 Video]
// .tiktok2     → [🎵 Audio] [🎬 Video] [🚫 No Watermark] [🖼️ Thumb]
// .spotify2    → [🎵 Download] [📋 Copy] [🌐 Open]
// .ig2         → [🖼️ Photo] [🎬 Reel/Video]

const axios  = require('axios')
const { sendBtn, sendList } = require('../Library/actions/btns')
const { getBtnMode } = require('../Library/actions/btnmode')

const handle = {}
handle.command = [
    'play', 'music', 'playaudio', 'playvideo', 'playsong', 'song', 'findmusic',
    'yt', 'ytdl', 'ytdownload', 'youtube',
    'tiktok2', 'tt2', 'ttdl',
    'spotify2', 'spdl',
    'ig2', 'instadl', 'igdl',
    'fb2', 'fbdl',
    'twitter2', 'twdl',
    'mediainfo',
]
handle.tags  = ['download', 'media', 'music', 'video']
handle.help  = [
    'yt <url>       — YouTube: Audio or Video buttons',
    'tiktok2 <url>  — TikTok: Audio/Video/NoWM/Thumb',
    'spotify2 <url> — Spotify: Download + info buttons',
    'ig2 <url>      — Instagram: Photo/Reel buttons',
    'fb2 <url>      — Facebook: Video download buttons',
    'twitter2 <url> — Twitter/X: Video download buttons',
]

// Fetch YouTube info via noembed
const ytInfo = async (url) => {
    try {
        const res = await axios.get('https://noembed.com/embed?url=' + encodeURIComponent(url), { timeout: 8000 })
        return res.data
    } catch { return null }
}

// Format seconds to M:SS
const fmtDur = (s) => {
    if (!s) return '?:??'
    const m = Math.floor(s / 60)
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
}

handle.all = async (m, { conn, command, args, prefix, reply, sender } = {}) => {
    const chat = m.chat || m.key?.remoteJid
    const text  = args.join(' ').trim()
    const url  = args.find(a => a.startsWith('http')) || args[0]
    const useBtns = getBtnMode(chat)

    // ── YOUTUBE ──────────────────────────────────────────────────────────────
    if (['yt','ytdl','ytdownload','youtube'].includes(command)) {
        if (!url) return reply('❌ Usage: ' + prefix + 'yt <YouTube URL>\n\nExample:\n' + prefix + 'yt https://youtu.be/dQw4w9WgXcQ')

        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        // Fetch metadata
        const info = await ytInfo(url)
        const title    = info?.title || 'YouTube Video'
        const author   = info?.author_name || 'Unknown'
        const thumbUrl = info?.thumbnail_url

        const header = `╭══〘 *▶️ YouTube Downloader* 〙═⊷\n┃\n┃ 🎵 *${title}*\n┃ 👤 ${author}\n┃\n┃ Choose your format 👇\n╰══════════════════⊷`

        if (useBtns) {
            // Send thumbnail first if available
            if (thumbUrl) {
                await conn.sendMessage(chat, {
                    image:   { url: thumbUrl },
                    caption: `🎵 *${title}*\n👤 ${author}\n\n⬇️ Choose format below:`
                }, { quoted: m }).catch(() => {})
            }
            return sendBtn(conn, chat, m, header, [
                { id: 'yt_audio_' + encodeURIComponent(url), text: '🎵 Download Audio (MP3)' },
                { id: 'yt_video_' + encodeURIComponent(url), text: '🎬 Download Video (MP4)' },
                { id: 'yt_144_'  + encodeURIComponent(url), text: '📱 Video 144p (Small)' },
                { id: 'yt_360_'  + encodeURIComponent(url), text: '📺 Video 360p (Medium)' },
                { id: 'yt_720_'  + encodeURIComponent(url), text: '🖥️ Video 720p (HD)' },
            ])
        } else {
            return reply(header + '\n\n*Formats:*\n' + prefix + 'tomp3 ' + url + '\n' + prefix + 'ytv ' + url)
        }
    }

    // ── TIKTOK2 ───────────────────────────────────────────────────────────────
    if (['tiktok2','tt2','ttdl'].includes(command)) {
        if (!url) return reply('❌ Usage: ' + prefix + 'tiktok2 <TikTok URL>')
        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const header = `╭══〘 *🎵 TikTok Downloader* 〙═⊷\n┃ URL detected — Choose format:\n╰══════════════════⊷`

        if (useBtns) {
            return sendBtn(conn, chat, m, header, [
                { id: 'tt_audio_'  + encodeURIComponent(url), text: '🎵 Audio Only (MP3)' },
                { id: 'tt_video_'  + encodeURIComponent(url), text: '🎬 Video with Sound (MP4)' },
                { id: 'tt_nowm_'   + encodeURIComponent(url), text: '🚫 No Watermark Video' },
                { id: 'tt_thumb_'  + encodeURIComponent(url), text: '🖼️ Thumbnail Only' },
            ])
        } else {
            return reply(header + '\n\n*Options:*\n' + prefix + 'tiktok audio ' + url + '\n' + prefix + 'tiktok video ' + url + '\n' + prefix + 'tiktok nowatermark ' + url)
        }
    }

    // ── SPOTIFY2 ──────────────────────────────────────────────────────────────
    if (['spotify2','spdl'].includes(command)) {
        if (!url) return reply('❌ Usage: ' + prefix + 'spotify2 <Spotify URL>')
        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const header = `╭══〘 *🎵 Spotify Downloader* 〙═⊷\n┃ Link detected!\n┃ Processing track info...\n╰══════════════════⊷`

        if (useBtns) {
            return sendBtn(conn, chat, m, header, [
                { id: 'sp_dl_'   + encodeURIComponent(url), text: '🎵 Download MP3' },
                { id: 'sp_info_' + encodeURIComponent(url), text: '📋 Copy Track Info' },
                { id: 'sp_open_' + url, text: '🌐 Open on Spotify' },
            ])
        } else {
            return reply('🎵 *Spotify Download*\n' + prefix + 'spotify ' + url)
        }
    }

    // ── INSTAGRAM2 ────────────────────────────────────────────────────────────
    if (['ig2','instadl','igdl'].includes(command)) {
        if (!url) return reply('❌ Usage: ' + prefix + 'ig2 <Instagram URL>')
        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const header = `╭══〘 *📸 Instagram Downloader* 〙═⊷\n┃ Link detected — Choose type:\n╰══════════════════⊷`

        if (useBtns) {
            return sendBtn(conn, chat, m, header, [
                { id: 'ig_photo_' + encodeURIComponent(url), text: '🖼️ Download Photo' },
                { id: 'ig_reel_'  + encodeURIComponent(url), text: '🎬 Download Reel/Video' },
                { id: 'ig_story_' + encodeURIComponent(url), text: '📖 Download Story' },
            ])
        } else {
            return reply('📸 *Instagram Download*\n' + prefix + 'ig ' + url)
        }
    }

    // ── FACEBOOK2 ─────────────────────────────────────────────────────────────
    if (['fb2','fbdl'].includes(command)) {
        if (!url) return reply('❌ Usage: ' + prefix + 'fb2 <Facebook URL>')
        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const header = `╭══〘 *📘 Facebook Downloader* 〙═⊷\n┃ Link detected — Choose quality:\n╰══════════════════⊷`

        if (useBtns) {
            return sendBtn(conn, chat, m, header, [
                { id: 'fb_hd_'  + encodeURIComponent(url), text: '🎬 Download HD Video' },
                { id: 'fb_sd_'  + encodeURIComponent(url), text: '📱 Download SD Video' },
                { id: 'fb_mp3_' + encodeURIComponent(url), text: '🎵 Extract Audio (MP3)' },
            ])
        } else {
            return reply('📘 *Facebook Download*\n' + prefix + 'fb ' + url)
        }
    }

    // ── TWITTER2 ──────────────────────────────────────────────────────────────
    if (['twitter2','twdl'].includes(command)) {
        if (!url) return reply('❌ Usage: ' + prefix + 'twitter2 <Twitter/X URL>')
        await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const header = `╭══〘 *🐦 Twitter/X Downloader* 〙═⊷\n┃ Link detected — Choose quality:\n╰══════════════════⊷`

        if (useBtns) {
            return sendBtn(conn, chat, m, header, [
                { id: 'tw_hd_'  + encodeURIComponent(url), text: '🎬 Download HD Video' },
                { id: 'tw_sd_'  + encodeURIComponent(url), text: '📱 Download SD Video' },
                { id: 'tw_gif_' + encodeURIComponent(url), text: '🎞️ Download as GIF' },
                { id: 'tw_mp3_' + encodeURIComponent(url), text: '🎵 Extract Audio (MP3)' },
            ])
        } else {
            return reply('🐦 *Twitter Download*\n' + prefix + 'twitter ' + url)
        }
    }
    // ── .PLAY — Search → auto-download first result as MP3 (no buttons) ────────
    if (['play','music','playaudio','playvideo','playsong','song','findmusic'].includes(command)) {
        if (!text) return reply(
            '🎵 *Usage:* ' + prefix + 'play <song name or artist>\n\n' +
            '*Examples:*\n' +
            prefix + 'play Blinding Lights Weeknd\n' +
            prefix + 'play Burna Boy Last Last'
        )
        try {
            await conn.sendMessage(chat, { react: { text: '🔍', key: m.key } }).catch(() => {})
            const sr = await axios.get('https://apiskeith.top/search/yts?q=' + encodeURIComponent(text), { timeout: 10000 })
            const song = (sr.data?.result || [])[0]
            if (!song) return reply('❌ No results found for: *' + text + '*')
            const songUrl = song.url || ('https://youtu.be/' + song.id)
            const songTitle = song.title || text
            await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
            await reply('🎵 *' + songTitle + '*\n⏳ Downloading...')
            const { downloadAudio } = require('../Library/actions/music')
            const dl = await downloadAudio(songUrl)
            if (dl.success && (dl.url || dl.audioUrl)) {
                if (dl.thumbnail) {
                    await conn.sendMessage(chat, { image: { url: dl.thumbnail }, caption: '🎵 ' + songTitle }).catch(() => {})
                }
                await conn.sendMessage(chat, {
                    audio:    { url: dl.url || dl.audioUrl },
                    mimetype: 'audio/mpeg',
                    fileName: songTitle + '.mp3'
                }, { quoted: m })
                await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            } else {
                return reply('❌ Download failed. Try:\n*' + prefix + 'tomp3 ' + songUrl + '*')
            }
        } catch (e) {
            return reply('❌ Error: ' + e.message)
        }
    }

}

module.exports = handle