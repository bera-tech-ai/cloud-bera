const axios = require('axios')
const {
    gt, free,
    gtWeather, gtLyrics, gtWiki, gtGoogle, gtDictionary, gtBible, gtWallpaper,
    gtNews, gtShazam, gtSpotifySearch, gtYtSearch,
    gtYtMp3, gtYtMp4, gtTikTok, gtInstagram, gtTwitter, gtFacebook, gtSpotifyDl,
    gtRemoveBg, gtCreateQr, gtReadQr, gtScreenshot, gtOcr, gtUpscale,
    gtTranscript, gtWhois, gtImage, gtChat, gtVision,
    gtLiveScore, gtPredictions, gtStandings, gtFootballNews,
    gtCrypto, gtTranslate, gtMovie, gtAnime, gtIpInfo, gtStock, gtCurrency, gtGithub,
    GT, KEY
} = require('../Library/actions/giftedapi')

const react = (conn, m, emoji) =>
    conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => {})

const hasMedia = (msg) => msg && /image|video|audio/.test(msg?.mimetype || '')

const fmtDuration = (s) => {
    if (!s) return ''
    const m = Math.floor(+s / 60), sec = +s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
}

// Download quoted/attached image → URL (sends to Gifted-compatible upload or uses buffer)
const resolveImageUrl = async (m, conn, args) => {
    if (args[0]?.startsWith('http')) return args[0]
    const target = m.quoted || m
    if (!hasMedia(target)) return null
    const buf = await conn.downloadMediaMessage(target).catch(() => null)
    if (!buf) return null
    // Upload to a public host so Gifted tools accept it
    try {
        const FormData = require('form-data')
        const form = new FormData()
        form.append('file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' })
        const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, { headers: form.getHeaders(), timeout: 20000 })
        const url = res.data?.data?.url?.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
        if (url) return url
    } catch {}
    return 'data:image/jpeg;base64,' + buf.toString('base64')
}

const handle = async (m, { conn, command, args, reply, prefix, text }) => {

    // ── YOUTUBE AUDIO ──────────────────────────────────────────────────────────
    if (['ytmp3','yta','ytaudio'].includes(command)) {
        const url = args[0]
        if (!url || !url.includes('youtu')) return reply(`Usage: *${prefix}ytmp3 <YouTube URL>*`)
        await react(conn, m, '⏳')
        const d = await gtYtMp3(url)
        if (!d) { await react(conn, m, '❌'); return reply('❌ YT audio download failed.') }
        const audioUrl = d?.download_url || d?.downloadUrl || d?.url || d?.audio || d?.link
        if (!audioUrl) { await react(conn, m, '❌'); return reply('❌ No audio URL in response.') }
        await react(conn, m, '✅')
        await conn.sendMessage(m.chat, { audio: { url: audioUrl }, mimetype: 'audio/mp4', ptt: false, fileName: `${d.title || 'audio'}.mp3` }, { quoted: m })
        return reply(`🎵 *${d.title || 'Audio'}*${d.channel ? `\n👤 ${d.channel}` : ''}${d.duration ? `\n⏱ ${d.duration}` : ''}`)
    }

    // ── YOUTUBE VIDEO ──────────────────────────────────────────────────────────
    if (['ytmp4','ytv','ytvideo'].includes(command)) {
        const url = args[0]
        if (!url || !url.includes('youtu')) return reply(`Usage: *${prefix}ytmp4 <YouTube URL>*`)
        await react(conn, m, '⏳')
        const d = await gtYtMp4(url, '360p')
        if (!d) { await react(conn, m, '❌'); return reply('❌ YT video download failed.') }
        const videoUrl = d?.download_url || d?.downloadUrl || d?.url || d?.video || d?.link
        if (!videoUrl) { await react(conn, m, '❌'); return reply('❌ No video URL in response.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { video: { url: videoUrl }, caption: `🎬 *${d.title || 'Video'}*${d.channel ? `\n👤 ${d.channel}` : ''}${d.duration ? `\n⏱ ${d.duration}` : ''}`, fileName: `${d.title || 'video'}.mp4` }, { quoted: m })
    }

    // ── TIKTOK ────────────────────────────────────────────────────────────────
    if (['tiktok','tt','tiktokdl'].includes(command)) {
        const url = args[0]
        if (!url || !url.includes('tiktok')) return reply(`Usage: *${prefix}tiktok <TikTok URL>*`)
        await react(conn, m, '⏳')
        const d = await gtTikTok(url)
        if (!d) { await react(conn, m, '❌'); return reply('❌ TikTok download failed.') }
        const videoUrl = d?.video?.[0] || d?.nowm || d?.url || d?.download_url
        const audioUrl = d?.music
        if (!videoUrl && !audioUrl) { await react(conn, m, '❌'); return reply('❌ Could not extract media.') }
        await react(conn, m, '✅')
        if (videoUrl) return conn.sendMessage(m.chat, { video: { url: videoUrl }, caption: `🎵 *${d.title || d.desc || 'TikTok'}*\n👤 @${d.author?.nickname || d.author || 'unknown'}` }, { quoted: m })
        return conn.sendMessage(m.chat, { audio: { url: audioUrl }, mimetype: 'audio/mp4', fileName: 'tiktok.mp3' }, { quoted: m })
    }

    // ── INSTAGRAM ─────────────────────────────────────────────────────────────
    if (['igdl','instagram','insta'].includes(command)) {
        const url = args[0]
        if (!url || !/instagram|instagr\.am/.test(url)) return reply(`Usage: *${prefix}igdl <Instagram URL>*`)
        await react(conn, m, '⏳')
        const d = await gtInstagram(url)
        if (!d) { await react(conn, m, '❌'); return reply('❌ Instagram download failed.') }
        const medias = d.media || d.medias || [d]
        const first = Array.isArray(medias) ? medias[0] : d
        const mediaUrl = first?.url || first?.download_url || first?.video || first?.image
        if (!mediaUrl) { await react(conn, m, '❌'); return reply('❌ Could not extract media.') }
        await react(conn, m, '✅')
        const caption = `📸 *${d.caption?.slice(0, 100) || 'Instagram Post'}*`
        if (/video/.test(first?.type || '') || first?.video)
            return conn.sendMessage(m.chat, { video: { url: mediaUrl }, caption }, { quoted: m })
        return conn.sendMessage(m.chat, { image: { url: mediaUrl }, caption }, { quoted: m })
    }

    // ── TWITTER/X ─────────────────────────────────────────────────────────────
    if (['twitter','xdl','twdl'].includes(command)) {
        const url = args[0]
        if (!url || !/(twitter|x\.com)/.test(url)) return reply(`Usage: *${prefix}twitter <Tweet URL>*`)
        await react(conn, m, '⏳')
        const d = await gtTwitter(url)
        if (!d) { await react(conn, m, '❌'); return reply('❌ Twitter download failed.') }
        const videoUrl = d?.video?.[0]?.url || d?.url || d?.media?.[0]?.url
        if (!videoUrl) { await react(conn, m, '❌'); return reply('❌ No video found in this tweet.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { video: { url: videoUrl }, caption: `🐦 *${d.text?.slice(0, 120) || 'Twitter Video'}*` }, { quoted: m })
    }

    // ── FACEBOOK VIDEO ────────────────────────────────────────────────────────
    if (['fbdl','facebook','fb'].includes(command)) {
        const url = args[0]
        if (!url || !/facebook|fb\.watch/.test(url)) return reply(`Usage: *${prefix}fbdl <Facebook video URL>*`)
        await react(conn, m, '⏳')
        const d = await gtFacebook(url)
        if (!d) { await react(conn, m, '❌'); return reply('❌ Facebook download failed.') }
        const videoUrl = d?.hd || d?.sd || d?.url || d?.download_url || (Array.isArray(d?.video) ? d.video[0] : null)
        if (!videoUrl) { await react(conn, m, '❌'); return reply('❌ No video URL found.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { video: { url: videoUrl }, caption: `📘 *${d.title || 'Facebook Video'}*` }, { quoted: m })
    }

    // ── SPOTIFY DOWNLOAD ──────────────────────────────────────────────────────
    if (['spotifydl','spdl'].includes(command)) {
        const url = args[0]
        if (!url || !url.includes('spotify')) return reply(`Usage: *${prefix}spotifydl <Spotify Track URL>*`)
        await react(conn, m, '⏳')
        const d = await gtSpotifyDl(url)
        if (!d) { await react(conn, m, '❌'); return reply('❌ Spotify download failed.') }
        const audioUrl = d?.download_url || d?.url || d?.audio
        if (!audioUrl) { await react(conn, m, '❌'); return reply('❌ No audio URL found.') }
        await react(conn, m, '✅')
        await conn.sendMessage(m.chat, { audio: { url: audioUrl }, mimetype: 'audio/mp4', ptt: false, fileName: `${d.title || 'spotify'}.mp3` }, { quoted: m })
        return reply(`🎵 *${d.title || d.name || 'Track'}*${d.artist ? `\n👤 ${d.artist}` : ''}${d.duration ? `\n⏱ ${fmtDuration(d.duration)}` : ''}`)
    }

    // ── LYRICS ────────────────────────────────────────────────────────────────
    if (['lyrics','lyric'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}lyrics <song> [by artist]*\n_Example: ${prefix}lyrics Bohemian Rhapsody by Queen_`)
        await react(conn, m, '🎵')
        const d = await gtLyrics(text)
        if (!d?.lyrics) { await react(conn, m, '❌'); return reply(`❌ No lyrics found for: *${text}*\n_Try: ${prefix}lyrics Song Title by Artist_`) }
        await react(conn, m, '✅')
        const header = `🎵 *${d.title || text}*${d.artist ? ` — ${d.artist}` : ''}\n${'─'.repeat(28)}\n\n`
        const body = d.lyrics.slice(0, 3500)
        return reply(header + body + (d.lyrics.length > 3500 ? '\n\n_...lyrics truncated_' : ''))
    }

    // ── DEFINE / DICTIONARY ───────────────────────────────────────────────────
    if (['define','meaning','dict','dictionary'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}define <word>*`)
        await react(conn, m, '📖')
        const d = await gtDictionary(text.trim().split(' ')[0])
        if (!d) { await react(conn, m, '❌'); return reply(`❌ No definition found for: *${text}*`) }
        await react(conn, m, '✅')
        const phonetic = d.phonetic ? `  /${d.phonetic}/` : ''
        const meanings = d.meaning ? [d.meaning] : (d.meanings || [])
        let out = `📖 *${d.word || text}*${phonetic}\n\n`
        if (d.meaning && typeof d.meaning === 'object') {
            const pos = d.meaning.partOfSpeech || ''
            const defs = d.meaning.definitions || (d.meaning.def ? [{ definition: d.meaning.def }] : [])
            if (pos) out += `_${pos}_\n`
            defs.slice(0, 3).forEach((def, i) => {
                out += `${i + 1}. ${def.definition || def}\n`
                if (def.example) out += `   _"${def.example}"_\n`
            })
        } else out += JSON.stringify(d).slice(0, 400)
        return reply(out.trim())
    }

    // ── GOOGLE SEARCH ─────────────────────────────────────────────────────────
    if (['google','search'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}google <query>*`)
        await react(conn, m, '🔍')
        const results = await gtGoogle(text)
        if (!results?.length) { await react(conn, m, '❌'); return reply(`❌ No results for: *${text}*`) }
        await react(conn, m, '✅')
        const lines = results.slice(0, 5).map((x, i) =>
            `*${i + 1}. ${x.title}*\n${x.snippet ? x.snippet.slice(0, 120) + '\n' : ''}🔗 ${x.link}`)
        return reply(`🔍 *Google: "${text}"*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── WIKIPEDIA ─────────────────────────────────────────────────────────────
    if (['wiki','wikipedia'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}wiki <topic>*`)
        await react(conn, m, '🌐')
        const d = await gtWiki(text)
        if (!d) { await react(conn, m, '❌'); return reply(`❌ No Wikipedia article found for: *${text}*`) }
        await react(conn, m, '✅')
        const extract = (d.extract || '').slice(0, 1200)
        return reply(`🌐 *${d.title}*\n${'─'.repeat(28)}\n\n${extract}\n\n🔗 ${d.url}`)
    }

    // ── WEATHER (FIXED — uses wttr.in) ────────────────────────────────────────
    if (['weather','clima','hali'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}weather <city>*\n_Example: ${prefix}weather Nairobi_`)
        await react(conn, m, '🌤')
        const w = await gtWeather(text)
        if (!w) { await react(conn, m, '❌'); return reply(`❌ Couldn't fetch weather for: *${text}*`) }
        await react(conn, m, '✅')
        const trend = w.forecast?.length ? '\n\n📅 *3-Day Forecast:*\n' + w.forecast.map(f =>
            `  ${f.date}: ${f.desc} 🔺${f.maxC}° 🔻${f.minC}°`
        ).join('\n') : ''
        return reply(
            `⛅ *Weather — ${w.city}${w.country ? ', ' + w.country : ''}*\n${'─'.repeat(30)}\n` +
            `🌡 Temperature: *${w.temp}°C* (Feels ${w.feels}°C)\n` +
            `☁️ ${w.desc}\n` +
            `💧 Humidity: *${w.humidity}%*\n` +
            `💨 Wind: *${w.wind} km/h*\n` +
            `☀️ UV Index: *${w.uv}*` + trend
        )
    }

    // ── TRANSLATE (NEW) ───────────────────────────────────────────────────────
    if (['translate','tr','trans'].includes(command)) {
        if (!text) return reply(
            `Usage: *${prefix}translate [to:<lang>] <text>*\n` +
            `_Example: ${prefix}translate to:sw Hello how are you_\n` +
            `_Langs: sw=Swahili, fr=French, es=Spanish, de=German, ar=Arabic, zh=Chinese_`
        )
        await react(conn, m, '🌍')
        let to = 'sw', phrase = text
        const match = text.match(/^to:(\w+)\s+(.+)$/is)
        if (match) { to = match[1].toLowerCase(); phrase = match[2] }
        const result = await gtTranslate(phrase, to)
        if (!result) { await react(conn, m, '❌'); return reply(`❌ Translation failed.`) }
        await react(conn, m, '✅')
        return reply(`🌍 *Translation → ${to.toUpperCase()}*\n\n_Original:_\n${phrase}\n\n_Translated:_\n*${result}*`)
    }

    // ── CRYPTO PRICES (NEW) ───────────────────────────────────────────────────
    if (['crypto','coin','btc','eth','doge','bitcoin'].includes(command)) {
        await react(conn, m, '📊')
        const coins = text?.toLowerCase().split(/\s+/).filter(Boolean) || ['bitcoin', 'ethereum']
        const data = await gtCrypto(coins.length > 0 ? coins : ['bitcoin', 'ethereum', 'solana', 'dogecoin'])
        if (!data?.length) { await react(conn, m, '❌'); return reply(`❌ Could not fetch crypto prices.`) }
        await react(conn, m, '✅')
        const lines = data.slice(0, 8).map(c => {
            const change = c.price_change_percentage_24h?.toFixed(2)
            const arrow = change > 0 ? '📈' : '📉'
            return `${arrow} *${c.name}* (${c.symbol?.toUpperCase()})\n   💵 $${c.current_price?.toLocaleString()} | ${change > 0 ? '+' : ''}${change}% 24h\n   Market Cap: $${(c.market_cap / 1e9).toFixed(2)}B`
        })
        return reply(`💹 *LIVE CRYPTO PRICES*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}\n\n_Powered by CoinGecko_`)
    }

    // ── STOCK PRICE (NEW) ─────────────────────────────────────────────────────
    if (['stock','shares','equity'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}stock <symbol>*\n_Example: ${prefix}stock AAPL_\n_Example: ${prefix}stock TSLA_`)
        await react(conn, m, '📈')
        const d = await gtStock(text.trim())
        if (!d) { await react(conn, m, '❌'); return reply(`❌ Could not fetch stock: *${text.toUpperCase()}*\n_Make sure you're using the correct ticker symbol_`) }
        await react(conn, m, '✅')
        const arrow = +d.change >= 0 ? '📈' : '📉'
        return reply(
            `${arrow} *${d.name}* (${d.symbol})\n${'─'.repeat(28)}\n` +
            `💵 Price: *${d.currency} ${d.price?.toFixed(2)}*\n` +
            `📊 Change: *${d.change > 0 ? '+' : ''}${d.change}%*\n` +
            `📋 Prev Close: ${d.prevClose?.toFixed(2)}\n` +
            `🏛️ Exchange: ${d.exchange}\n\n_Data: Yahoo Finance_`
        )
    }

    // ── CURRENCY CONVERTER (NEW) ──────────────────────────────────────────────
    if (['convert','currency','forex','exchange'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}convert <amount> <FROM> to <TO>*\n_Example: ${prefix}convert 100 USD to KES_\n_Example: ${prefix}convert 5000 KES to USD_`)
        await react(conn, m, '💱')
        const match = text.match(/(\d+\.?\d*)\s+([a-z]+)\s+(?:to\s+)?([a-z]+)/i)
        if (!match) return reply(`❌ Format: *${prefix}convert 100 USD to KES*`)
        const [, amount, from, to] = match
        const result = await gtCurrency(+amount, from, to)
        if (!result) { await react(conn, m, '❌'); return reply(`❌ Conversion failed. Check currency codes.`) }
        await react(conn, m, '✅')
        return reply(
            `💱 *Currency Conversion*\n${'─'.repeat(28)}\n` +
            `*${amount} ${from.toUpperCase()}* = *${result.result} ${to.toUpperCase()}*\n` +
            `📊 Rate: 1 ${from.toUpperCase()} = ${result.rate.toFixed(4)} ${to.toUpperCase()}\n\n_Powered by ExchangeRate-API_`
        )
    }

    // ── MOVIE INFO (NEW) ──────────────────────────────────────────────────────
    if (['movie','film','imdb'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}movie <title>*\n_Example: ${prefix}movie Inception_`)
        await react(conn, m, '🎬')
        const d = await gtMovie(text)
        if (!d || d.Response === 'False') { await react(conn, m, '❌'); return reply(`❌ Movie not found: *${text}*`) }
        await react(conn, m, '✅')
        let out = `🎬 *${d.Title}* (${d.Year})\n${'─'.repeat(28)}\n`
        if (d.Genre) out += `🎭 Genre: ${d.Genre}\n`
        if (d.Director) out += `🎥 Director: ${d.Director}\n`
        if (d.Actors) out += `👥 Cast: ${d.Actors}\n`
        if (d.Runtime) out += `⏱ Runtime: ${d.Runtime}\n`
        if (d.imdbRating) out += `⭐ IMDB: *${d.imdbRating}/10* (${d.imdbVotes} votes)\n`
        if (d.Rated) out += `🔞 Rating: ${d.Rated}\n`
        if (d.Language) out += `🌐 Language: ${d.Language}\n`
        if (d.Plot) out += `\n📝 *Plot:*\n${d.Plot}`
        if (d.Poster && d.Poster !== 'N/A') {
            await conn.sendMessage(m.chat, { image: { url: d.Poster }, caption: out }, { quoted: m })
        } else return reply(out)
        return
    }

    // ── ANIME SEARCH (NEW) ────────────────────────────────────────────────────
    if (['anime','animesearch'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}anime <name>*\n_Example: ${prefix}anime Naruto_`)
        await react(conn, m, '🎌')
        const data = await gtAnime(text)
        if (!data?.length) { await react(conn, m, '❌'); return reply(`❌ No anime found: *${text}*`) }
        await react(conn, m, '✅')
        const top = data[0]
        let out = `🎌 *${top.title}*`
        if (top.title_english && top.title_english !== top.title) out += ` (${top.title_english})`
        out += `\n${'─'.repeat(28)}\n`
        if (top.type) out += `📺 Type: ${top.type}\n`
        if (top.episodes) out += `📺 Episodes: ${top.episodes}\n`
        if (top.status) out += `📡 Status: ${top.status}\n`
        if (top.score) out += `⭐ Score: *${top.score}/10*\n`
        if (top.rating) out += `🔞 Rating: ${top.rating}\n`
        if (top.genres?.length) out += `🎭 Genres: ${top.genres.map(g => g.name).join(', ')}\n`
        if (top.aired?.string) out += `📅 Aired: ${top.aired.string}\n`
        if (top.synopsis) out += `\n📝 *Synopsis:*\n${top.synopsis.slice(0, 400)}${top.synopsis.length > 400 ? '...' : ''}`
        if (top.images?.jpg?.image_url) {
            await conn.sendMessage(m.chat, { image: { url: top.images.jpg.image_url }, caption: out }, { quoted: m })
        } else return reply(out)
        return
    }

    // ── IP INFO (NEW) ─────────────────────────────────────────────────────────
    if (['ip','ipinfo','iplookup'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}ip <IP address>*\n_Example: ${prefix}ip 8.8.8.8_`)
        await react(conn, m, '🌐')
        const d = await gtIpInfo(text.trim())
        if (!d) { await react(conn, m, '❌'); return reply(`❌ Could not look up IP: *${text}*`) }
        await react(conn, m, '✅')
        return reply(
            `🌐 *IP Lookup: ${d.query}*\n${'─'.repeat(28)}\n` +
            `🏳️ Country: ${d.country} (${d.countryCode})\n` +
            `🏙️ City: ${d.city}, ${d.regionName}\n` +
            `📍 Coords: ${d.lat}, ${d.lon}\n` +
            `⏰ Timezone: ${d.timezone}\n` +
            `🏢 ISP: ${d.isp}\n` +
            `🏛️ Org: ${d.org}`
        )
    }

    // ── WHOIS (NEW) ───────────────────────────────────────────────────────────
    if (['whois','domaininfo'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}whois <domain>*\n_Example: ${prefix}whois google.com_`)
        await react(conn, m, '🔍')
        const d = await gt('/api/tools/whois', { domain: text.trim() })
        const result = d?.result
        if (!result) { await react(conn, m, '❌'); return reply(`❌ WHOIS lookup failed for: *${text}*`) }
        await react(conn, m, '✅')
        const info = typeof result === 'string' ? result.slice(0, 800) : JSON.stringify(result, null, 2).slice(0, 800)
        return reply(`🔍 *WHOIS: ${text}*\n${'─'.repeat(28)}\n\`\`\`\n${info}\n\`\`\``)
    }

    // ── NEWS (NEW) ────────────────────────────────────────────────────────────
    if (['news','headlines','breaking'].includes(command)) {
        const topic = text || 'Kenya'
        await react(conn, m, '📰')
        const articles = await gtNews(topic)
        if (!articles?.length) { await react(conn, m, '❌'); return reply(`❌ No news found for: *${topic}*`) }
        await react(conn, m, '✅')
        const lines = articles.slice(0, 5).map((a, i) =>
            `*${i + 1}. ${a.title || a.headline}*\n${a.description ? a.description.slice(0, 100) + '\n' : ''}${a.publishedAt ? `⏰ ${new Date(a.publishedAt).toLocaleDateString()}\n` : ''}🔗 ${a.url || a.link || ''}`
        )
        return reply(`📰 *News: "${topic}"*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── GITHUB REPO (NEW) ─────────────────────────────────────────────────────
    if (['github','repo','ghrepo'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}github <owner/repo>*\n_Example: ${prefix}github microsoft/vscode_`)
        await react(conn, m, '🐙')
        const d = await gtGithub(text.trim())
        if (!d) { await react(conn, m, '❌'); return reply(`❌ GitHub repo not found: *${text}*`) }
        await react(conn, m, '✅')
        return reply(
            `🐙 *${d.full_name}*\n${'─'.repeat(28)}\n` +
            `📝 ${d.description || 'No description'}\n\n` +
            `⭐ Stars: ${d.stargazers_count?.toLocaleString()}\n` +
            `🍴 Forks: ${d.forks_count?.toLocaleString()}\n` +
            `👁️ Watchers: ${d.subscribers_count || d.watchers_count}\n` +
            `🐛 Issues: ${d.open_issues_count}\n` +
            `📦 Language: ${d.language || 'N/A'}\n` +
            `📅 Updated: ${new Date(d.updated_at).toLocaleDateString()}\n` +
            `🔗 ${d.html_url}${d.homepage ? `\n🌐 ${d.homepage}` : ''}`
        )
    }

    // ── SHAZAM / MUSIC IDENTIFY ────────────────────────────────────────────────
    if (['shazam','identify'].includes(command)) {
        const url = args[0]
        if (!url?.startsWith('http')) return reply(`Usage: *${prefix}shazam <audio/video URL>*`)
        await react(conn, m, '🎵')
        const d = await gtShazam(url)
        if (!d) { await react(conn, m, '❌'); return reply(`❌ Couldn't identify music from that URL.`) }
        await react(conn, m, '✅')
        return reply(`🎵 *Identified!*\n\n*Title:* ${d.title || 'Unknown'}\n*Artist:* ${d.artist || d.subtitle || 'Unknown'}${d.album ? `\n*Album:* ${d.album}` : ''}${d.genre ? `\n*Genre:* ${d.genre}` : ''}`)
    }

    // ── YOUTUBE SEARCH ────────────────────────────────────────────────────────
    if (['yts','ytsearch','yousearch'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}yts <video or song name>*`)
        await react(conn, m, '🔍')
        const results = await gtYtSearch(text)
        if (!results?.length) { await react(conn, m, '❌'); return reply(`❌ No YouTube results for: *${text}*`) }
        await react(conn, m, '✅')
        const lines = results.map((v, i) =>
            `*${i + 1}.* ${v.title}${v.channel ? `\n   👤 ${v.channel}` : ''}\n   🔗 ${v.url}`
        )
        return reply(`🎬 *YouTube: "${text}"*\n${'─'.repeat(30)}\n\n${lines.join('\n\n')}\n\n💡 _Use *${prefix}ytmp3 <url>* or *${prefix}ytmp4 <url>* to download_`)
    }

    // ── SPOTIFY SEARCH ────────────────────────────────────────────────────────
    if (['spotifysearch','spsearch','spfind'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}spsearch <song or artist>*`)
        await react(conn, m, '🎵')
        const results = await gtSpotifySearch(text)
        if (!results?.length) { await react(conn, m, '❌'); return reply(`❌ No Spotify results for: *${text}*`) }
        await react(conn, m, '✅')
        const lines = results.slice(0, 5).map((t, i) =>
            `*${i + 1}.* ${t.name || t.title}${t.artist ? ` — ${t.artist}` : ''}${t.duration ? ` ⏱ ${fmtDuration(t.duration)}` : ''}${t.url ? `\n   🔗 ${t.url}` : ''}`
        )
        return reply(`🎵 *Spotify: "${text}"*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── AI IMAGE GENERATE ─────────────────────────────────────────────────────
    if (['imagine','gen','aigen','flux','ai4k'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}imagine <prompt>*\n_Example: ${prefix}imagine a cyberpunk city at night_`)
        await react(conn, m, '🎨')
        const imgUrl = await gtImage(text)
        if (!imgUrl) { await react(conn, m, '❌'); return reply('❌ Image generation failed. Try a different prompt.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: { url: imgUrl }, caption: `🎨 *${text}*` }, { quoted: m })
    }

    // ── AI VISION / SEE IMAGE ─────────────────────────────────────────────────
    if (['see','vision','describe','airead'].includes(command)) {
        const target = m.quoted || m
        if (!hasMedia(target)) return reply(`Reply to an image with *${prefix}see* or use *${prefix}see <image URL>*`)
        await react(conn, m, '👁')
        let imageUrl = args[0]
        if (!imageUrl?.startsWith('http')) {
            const buf = await conn.downloadMediaMessage(target).catch(() => null)
            if (!buf) return reply('❌ Could not download the image.')
            imageUrl = 'data:image/jpeg;base64,' + buf.toString('base64')
        }
        const description = await gtVision(imageUrl, text || 'Describe this image in detail. What do you see?')
        if (!description) { await react(conn, m, '❌'); return reply('❌ Could not analyze image.') }
        await react(conn, m, '✅')
        return reply(`👁️ *Image Analysis*\n${'─'.repeat(28)}\n\n${description}`)
    }

    // ── REMOVE BG ─────────────────────────────────────────────────────────────
    if (['removebg','rmbg','nobg'].includes(command)) {
        const imgUrl = await resolveImageUrl(m, conn, args)
        if (!imgUrl) return reply(`Usage: *${prefix}removebg <image URL>* or reply to an image`)
        await react(conn, m, '✂️')
        const outUrl = await gtRemoveBg(imgUrl)
        if (!outUrl) { await react(conn, m, '❌'); return reply('❌ Remove background failed. Try uploading to a public URL first.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: '✅ *Background removed!*' }, { quoted: m })
    }

    // ── QR CODE CREATE (FIXED — uses qrserver.com) ────────────────────────────
    if (['createqr','qr','qrcode'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}qr <text or URL>*`)
        await react(conn, m, '📱')
        const qrUrl = gtCreateQr(text)
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: { url: qrUrl }, caption: `📱 *QR Code*\n${text.slice(0, 100)}` }, { quoted: m })
    }

    // ── QR CODE READ ──────────────────────────────────────────────────────────
    if (['readqr','scanqr'].includes(command)) {
        const imgUrl = await resolveImageUrl(m, conn, args)
        if (!imgUrl) return reply(`Usage: *${prefix}readqr <image URL>* or reply to a QR image`)
        await react(conn, m, '📷')
        const result = await gtReadQr(imgUrl)
        if (!result) { await react(conn, m, '❌'); return reply('❌ Could not read QR code.') }
        await react(conn, m, '✅')
        return reply(`📷 *QR Content:*\n${result}`)
    }

    // ── SCREENSHOT WEBSITE ────────────────────────────────────────────────────
    if (['ssweb','screenshot','webss'].includes(command)) {
        const url = args[0]
        if (!url?.startsWith('http')) return reply(`Usage: *${prefix}screenshot <URL>*`)
        await react(conn, m, '📸')
        const buf = await gtScreenshot(url)
        if (!buf) { await react(conn, m, '❌'); return reply('❌ Screenshot failed.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: buf, caption: `📸 *${url}*` }, { quoted: m })
    }

    // ── OCR / READ TEXT ───────────────────────────────────────────────────────
    if (['ocr','readtext','img2txt'].includes(command)) {
        const imgUrl = await resolveImageUrl(m, conn, args)
        if (!imgUrl) return reply(`Usage: *${prefix}ocr* (reply to image) or *${prefix}ocr <image URL>*`)
        await react(conn, m, '📄')
        const result = await gtOcr(imgUrl)
        if (!result) { await react(conn, m, '❌'); return reply('❌ Could not extract text from image.') }
        await react(conn, m, '✅')
        return reply(`📄 *Text from Image:*\n\n${result}`)
    }

    // ── UPSCALE / ENHANCE ─────────────────────────────────────────────────────
    if (['upscale','enhance','hd'].includes(command)) {
        const imgUrl = await resolveImageUrl(m, conn, args)
        if (!imgUrl) return reply(`Usage: *${prefix}upscale* (reply to image) or *${prefix}upscale <URL>*`)
        await react(conn, m, '🔍')
        const outUrl = await gtUpscale(imgUrl)
        if (!outUrl) { await react(conn, m, '❌'); return reply('❌ Upscale failed.') }
        await react(conn, m, '✅')
        return conn.sendMessage(m.chat, { image: { url: outUrl }, caption: '🔍 *Image Enhanced!*' }, { quoted: m })
    }

    // ── TRANSCRIPT ────────────────────────────────────────────────────────────
    if (['transcript','ytscript','captions'].includes(command)) {
        const url = args[0]
        if (!url?.includes('youtu')) return reply(`Usage: *${prefix}transcript <YouTube URL>*`)
        await react(conn, m, '📝')
        const result = await gtTranscript(url)
        if (!result) { await react(conn, m, '❌'); return reply('❌ No transcript found for this video.') }
        await react(conn, m, '✅')
        const body = typeof result === 'string' ? result.slice(0, 3500) : JSON.stringify(result).slice(0, 3500)
        return reply(`📝 *YouTube Transcript*\n${'─'.repeat(28)}\n\n${body}${body.length >= 3500 ? '\n\n_...truncated_' : ''}`)
    }

    // ── LIVE SCORES ───────────────────────────────────────────────────────────
    if (['livescore','live','scores'].includes(command)) {
        await react(conn, m, '⚽')
        const data = await gtLiveScore()
        if (!data) { await react(conn, m, '❌'); return reply('❌ No live scores right now.') }
        await react(conn, m, '✅')
        const matches = Array.isArray(data) ? data.slice(0, 10) : (data.matches || data.events || []).slice(0, 10)
        if (!matches.length) return reply('⚽ No live matches right now. Try again during match hours.')
        const lines = matches.map(mat => {
            const home = mat.homeTeam || mat.home || mat.team1 || '?'
            const away = mat.awayTeam || mat.away || mat.team2 || '?'
            const score = mat.score || mat.result || (mat.homeScore !== undefined ? `${mat.homeScore} - ${mat.awayScore}` : 'vs')
            const time = mat.minute ? ` [${mat.minute}']` : (mat.status || '')
            return `⚽ *${home}* ${score} *${away}*${time}`
        })
        return reply(`⚽ *Live Scores*\n${'─'.repeat(28)}\n\n${lines.join('\n')}`)
    }

    // ── PREDICTIONS ───────────────────────────────────────────────────────────
    if (['predictions','predict','tips','betika'].includes(command)) {
        await react(conn, m, '🎯')
        const data = await gtPredictions()
        if (!data) { await react(conn, m, '❌'); return reply('❌ No predictions available today.') }
        await react(conn, m, '✅')
        const tips = Array.isArray(data) ? data.slice(0, 8) : []
        if (!tips.length) return reply('🎯 No predictions available at this time.')
        const lines = tips.map((t, i) => {
            const home = t.homeTeam || t.home || '?'
            const away = t.awayTeam || t.away || '?'
            const pick = t.prediction || t.tip || t.pick || '?'
            const odds = t.odds ? ` | Odds: ${t.odds}` : ''
            return `${i + 1}. *${home} vs ${away}*\n   🎯 Pick: *${pick}*${odds}`
        })
        return reply(`🎯 *Today's Predictions*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}\n\n_⚠️ Bet responsibly. For entertainment only._`)
    }

    // ── LEAGUE STANDINGS ──────────────────────────────────────────────────────
    const leagueMap = {
        epl: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 EPL', laliga: '🇪🇸 La Liga', ucl: '🏆 UCL',
        bundesliga: '🇩🇪 Bundesliga', seriea: '🇮🇹 Serie A',
        ligue1: '🇫🇷 Ligue 1', euros: '🇪🇺 Euros'
    }
    if (leagueMap[command]) {
        await react(conn, m, '⚽')
        const teams = await gtStandings(command)
        if (!teams) { await react(conn, m, '❌'); return reply('❌ Could not fetch standings.') }
        await react(conn, m, '✅')
        const list = Array.isArray(teams) ? teams.slice(0, 10) : []
        if (!list.length) return reply('⚽ No standings data available.')
        const header = `*${leagueMap[command]} Standings* (Top 10)\n${'─'.repeat(30)}\n*Pos Team           Pts  W  D  L*\n`
        const rows = list.map(t => {
            const pos = String(t.position || t.rank || t.pos || list.indexOf(t) + 1).padStart(3)
            const name_ = (t.team || t.name || t.club || '?').padEnd(15).slice(0, 15)
            const pts = String(t.points || t.pts || 0).padStart(4)
            const w = String(t.won || t.w || 0).padStart(3)
            const d = String(t.draw || t.d || 0).padStart(3)
            const l = String(t.lost || t.l || 0).padStart(3)
            return `${pos} ${name_}${pts}${w}${d}${l}`
        })
        return reply('```\n' + header + rows.join('\n') + '\n```')
    }

    // ── FOOTBALL NEWS ─────────────────────────────────────────────────────────
    if (['fnews','footballnews'].includes(command)) {
        await react(conn, m, '📰')
        const articles = await gtFootballNews()
        if (!articles) { await react(conn, m, '❌'); return reply('❌ Could not fetch football news.') }
        await react(conn, m, '✅')
        const list = Array.isArray(articles) ? articles.slice(0, 5) : []
        if (!list.length) return reply('📰 No football news right now.')
        const lines = list.map((a, i) =>
            `*${i + 1}. ${a.title || a.headline}*\n${a.summary || a.description || ''}\n🔗 ${a.url || a.link || ''}`
        )
        return reply(`📰 *Football News*\n${'─'.repeat(28)}\n\n${lines.join('\n\n')}`)
    }

    // ── BIBLE VERSE ────────────────────────────────────────────────────────────
    if (['bible','verse'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}bible <verse>*\n_Example: ${prefix}bible John 3:16_`)
        await react(conn, m, '📖')
        const d = await gtBible(text)
        if (!d) { await react(conn, m, '❌'); return reply(`❌ Could not find verse: *${text}*`) }
        await react(conn, m, '✅')
        const content = d.data || d.text || d.content || d.result || JSON.stringify(d)
        return reply(`📖 *${d.verse || text}*\n\n_${content}_`)
    }

    // ── WALLPAPER ──────────────────────────────────────────────────────────────
    if (['wallpaper','wp','wallp'].includes(command)) {
        if (!text) return reply(`Usage: *${prefix}wallpaper <keyword>*`)
        await react(conn, m, '🖼')
        const results = await gtWallpaper(text)
        if (!results?.length) { await react(conn, m, '❌'); return reply(`❌ No wallpapers found for: *${text}*`) }
        await react(conn, m, '✅')
        const img = results[Math.floor(Math.random() * Math.min(results.length, 5))]
        const imgUrl = img.url || img.imageUrl || img.image || img.full || img.src
        return conn.sendMessage(m.chat, { image: { url: imgUrl }, caption: `🖼 *${text}*` }, { quoted: m })
    }
}

handle.command = [
    // Media downloads
    'ytmp3','yta','ytaudio','ytmp4','ytv','ytvideo',
    'tiktok','tt','tiktokdl',
    'igdl','instagram','insta',
    'twitter','xdl','twdl',
    'fbdl','facebook','fb',
    'spotifydl','spdl',
    // Search & info
    'lyrics','lyric',
    'define','meaning','dict','dictionary',
    'google','search',
    'wiki','wikipedia',
    'weather','clima','hali',
    'shazam','identify',
    'spotifysearch','spsearch','spfind',
    'yts','ytsearch','yousearch',
    'bible','verse',
    'wallpaper','wp','wallp',
    // NEW commands
    'translate','tr','trans',
    'crypto','coin','btc','eth','doge','bitcoin',
    'stock','shares','equity',
    'convert','currency','forex','exchange',
    'movie','film','imdb',
    'anime','animesearch',
    'ip','ipinfo','iplookup',
    'whois','domaininfo',
    'news','headlines','breaking',
    'github','repo','ghrepo',
    // AI & Image tools
    'imagine','gen','aigen','flux','ai4k',
    'see','vision','describe','airead',
    'removebg','rmbg','nobg',
    'createqr','qr','qrcode',
    'readqr','scanqr',
    'ssweb','screenshot','webss',
    'ocr','readtext','img2txt',
    'upscale','enhance','hd',
    'transcript','ytscript','captions',
    // Football
    'livescore','live','scores',
    'predictions','predict','tips','betika',
    'epl','laliga','ucl','bundesliga','seriea','ligue1','euros',
    'fnews','footballnews',
]
handle.tags = ['media', 'search', 'sports', 'tools', 'info', 'ai']

module.exports = handle
