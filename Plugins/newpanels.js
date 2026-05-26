// Plugins/newpanels.js — Additional interactive button panels (atassa-style sendButtons)
// Commands: aipanel, mediapanel, converterPanel, gamepanel, funpanel, toolspanel,
//           profilepanel, texttoolspanel, statuspanel, grouppanel2, newcmds

const { sendButtons } = require('gifted-btns')

const handle = {}
handle.command = [
    'aipanel', 'aitools', 'aimenu',
    'mediapanel', 'dlpanel', 'downloadpanel',
    'converterpanel', 'convertmenu',
    'gamepanel', 'gamedashboard', 'playgames',
    'funpanel', 'funmenu', 'entertainment',
    'toolspanel', 'utilsmenu', 'utilities',
    'texttoolspanel', 'textmenu',
    'statuspanel', 'statusmenu',
    'grouppanel2', 'grouptools', 'grouputils',
    'newcmds', 'newcommands', 'whatsnew',
    'profilepanel', 'userpanel',
    'helpdesk', 'support',
    'allpanels', 'panellist',
    'ghpanel', 'githubpanel', 'githubmenu',
]
handle.tags = ['panel', 'menu', 'buttons', 'ui']
handle.help = [
    'aipanel      — AI tools interactive panel',
    'mediapanel   — Media download button panel',
    'gamepanel    — Games panel',
    'funpanel     — Fun commands panel',
    'toolspanel   — Utility tools panel',
    'allpanels    — List all available panels',
]

const p_ = global.prefix || '.'

handle.all = async (m, { conn, command, args, prefix, reply, isOwner, isAdmin, isGroup, sender } = {}) => {
    const chat = m.chat || m.key?.remoteJid
    const p    = prefix || p_

    const sb = (title, text, footer, buttons) =>
        sendButtons(conn, chat, { title, text, footer, buttons })

    // ── AI PANEL ─────────────────────────────────────────────────────────────
    if (['aipanel','aitools','aimenu'].includes(command)) {
        return reply(
            '╭══〘 *🧠 AI Tools* 〙═⊷\n' +
            '┃ Type the command + your text\n' +
            '┃\n' +
            '┃ ── ✍️ Writing ──\n' +
            '┃❍ ' + p + 'summarize <text>  — Summarize\n' +
            '┃❍ ' + p + 'explain <topic>   — Explain clearly\n' +
            '┃❍ ' + p + 'improve <text>    — Improve writing\n' +
            '┃❍ ' + p + 'proofread <text>  — Fix grammar\n' +
            '┃❍ ' + p + 'rewrite <text>    — Rephrase\n' +
            '┃❍ ' + p + 'formal <text>     — Make formal\n' +
            '┃❍ ' + p + 'casual <text>     — Make casual\n' +
            '┃❍ ' + p + 'eli5 <topic>      — Explain like I\'m 5\n' +
            '┃❍ ' + p + 'expand <text>     — Expand & elaborate\n' +
            '┃\n' +
            '┃ ── 📱 Social Media ──\n' +
            '┃❍ ' + p + 'tweet <topic>     — Write a tweet\n' +
            '┃❍ ' + p + 'caption2 <desc>   — IG caption\n' +
            '┃❍ ' + p + 'bioai <info>      — Write a bio\n' +
            '┃❍ ' + p + 'sloganai <brand>  — Generate slogans\n' +
            '┃\n' +
            '┃ ── 💻 Code & Dev ──\n' +
            '┃❍ ' + p + 'codegen <task>    — Generate code\n' +
            '┃❍ ' + p + 'debugcode <code>  — Find bugs\n' +
            '┃❍ ' + p + 'code2eng <code>   — Explain code\n' +
            '┃\n' +
            '┃ ── 📄 Documents ──\n' +
            '┃❍ ' + p + 'essay <topic>     — Essay outline\n' +
            '┃❍ ' + p + 'email <topic>     — Write email\n' +
            '┃❍ ' + p + 'cover <job>       — Cover letter\n' +
            '┃\n' +
            '┃ ── 🎭 Fun ──\n' +
            '┃❍ ' + p + 'roast <name>      — Savage roast\n' +
            '┃❍ ' + p + 'imagine <prompt>  — AI image\n' +
            '╰══════════════════⊷'
        )
    }

    // ── MEDIA DOWNLOAD PANEL ─────────────────────────────────────────────────
    if (['mediapanel','dlpanel','downloadpanel'].includes(command)) {
        return sb('📥 Media Download Panel',
            '╭══〘 *📥 Media Download Panel* 〙═⊷\n' +
            '┃ Download from any platform!\n' +
            '┃ Type the command + URL\n' +
            '╰══════════════════⊷',
            'Bera AI — Downloader', [
            { id: p + 'tiktok',    text: '🎵 TikTok Video' },
            { id: p + 'ig',        text: '📸 Instagram Post' },
            { id: p + 'ytv',       text: '▶️ YouTube Video' },
            { id: p + 'tomp3',     text: '🎵 YouTube MP3' },
            { id: p + 'twitter',   text: '🐦 Twitter/X Video' },
            { id: p + 'spotify',   text: '🎵 Spotify Track' },
            { id: p + 'fb',        text: '📘 Facebook Video' },
            { id: p + 'mediafire', text: '🔥 MediaFire File' },
            { id: p + 'gdrive',    text: '☁️ Google Drive' },
            { id: p + 'ssweb',     text: '📸 Screenshot URL' },
        ])
    }

    // ── CONVERTER PANEL ──────────────────────────────────────────────────────
    if (['converterpanel','convertmenu'].includes(command)) {
        return sb('🔄 Converter Panel',
            '╭══〘 *🔄 Converter Panel* 〙═⊷\n' +
            '┃ Convert media between formats\n' +
            '╰══════════════════⊷',
            'Bera AI — Converters', [
            { id: p + 'tomp3',     text: '🎵 Video → MP3' },
            { id: p + 'tomp4',     text: '🎥 Audio → MP4' },
            { id: p + 'sticker',   text: '🎭 Image → Sticker' },
            { id: p + 'unsticker', text: '🖼️ Sticker → Image' },
            { id: p + 'tourl',     text: '🔗 Media → URL' },
            { id: p + 'compress',  text: '📦 Compress File' },
        ])
    }

    // ── GAMES PANEL ──────────────────────────────────────────────────────────
    if (['gamepanel','gamedashboard','playgames'].includes(command)) {
        return sb('🎮 Games Panel',
            '╭══〘 *🎮 Games Panel* 〙═⊷\n' +
            '┃ Play fun games on WhatsApp!\n' +
            '╰══════════════════⊷',
            'Bera AI — Games', [
            { id: p + 'slots',   text: '🎰 Slot Machine' },
            { id: p + 'rps',     text: '✊ Rock Paper Scissors' },
            { id: p + 'trivia',  text: '🧠 Trivia Quiz' },
            { id: p + 'hangman', text: '🪓 Hangman' },
            { id: p + 'truth',   text: '💬 Truth or Dare' },
            { id: p + 'coinflip',text: '🪙 Coin Flip' },
        ])
    }

    // ── FUN PANEL ────────────────────────────────────────────────────────────
    if (['funpanel','funmenu','entertainment'].includes(command)) {
        return sb('😂 Fun Commands Panel',
            '╭══〘 *😂 Fun Commands Panel* 〙═⊷\n' +
            '┃ Entertainment & fun stuff\n' +
            '╰══════════════════⊷',
            'Bera AI — Fun', [
            { id: p + 'joke',    text: '😂 Random Joke' },
            { id: p + 'quote',   text: '💭 Inspirational Quote' },
            { id: p + 'meme',    text: '😎 Random Meme' },
            { id: p + 'fact',    text: '🧪 Random Fact' },
            { id: p + 'roast',   text: '🔥 Roast Someone' },
            { id: p + 'rate',    text: '⭐ Rate Yourself' },
        ])
    }

    // ── TOOLS PANEL ──────────────────────────────────────────────────────────
    if (['toolspanel','utilsmenu','utilities'].includes(command)) {
        return sb('🔧 Utility Tools Panel',
            '╭══〘 *🔧 Utility Tools Panel* 〙═⊷\n' +
            '┃ Useful everyday tools\n' +
            '╰══════════════════⊷',
            'Bera AI — Tools', [
            { id: p + 'calc2',   text: '🧮 Calculator' },
            { id: p + 'qr2',     text: '🔲 QR Generator' },
            { id: p + 'weather2',text: '🌤️ Weather' },
            { id: p + 'tr2',     text: '🌍 Translator' },
            { id: p + 'define2', text: '📖 Dictionary' },
            { id: p + 'search2', text: '🔍 Web Search' },
        ])
    }

    // ── TEXT TOOLS PANEL ─────────────────────────────────────────────────────
    if (['texttoolspanel','textmenu'].includes(command)) {
        return sb('📝 Text Tools Panel',
            '╭══〘 *📝 Text Tools Panel* 〙═⊷\n' +
            '┃ Manipulate & transform text\n' +
            '╰══════════════════⊷',
            'Bera AI — Text', [
            { id: p + 'fancy',    text: '✨ Fancy Text' },
            { id: p + 'reverse',  text: '🔄 Reverse Text' },
            { id: p + 'bold',     text: '𝗕 Bold Text' },
            { id: p + 'ascii',    text: '🔤 ASCII Art' },
            { id: p + 'small',    text: '🔡 Small Caps' },
            { id: p + 'encode64', text: '🔐 Base64 Encode' },
        ])
    }

    // ── STATUS PANEL ─────────────────────────────────────────────────────────
    if (['statuspanel','statusmenu'].includes(command)) {
        return sb('📸 Status & Story Panel',
            '╭══〘 *📸 Status & Story Panel* 〙═⊷\n' +
            '┃ Status viewing & management\n' +
            '╰══════════════════⊷',
            'Bera AI — Status', [
            { id: p + 'sv',           text: '👁️ Auto Status View ON' },
            { id: p + 'sl',           text: '❤️ Auto Status Like ON' },
            { id: p + 'gcstatus',     text: '📡 GC Status Broadcast' },
            { id: p + 'statustogroup',text: '📤 Status to Group' },
            { id: p + 'gstatusall',   text: '📢 All Groups Status' },
        ])
    }

    // ── GROUP TOOLS PANEL ────────────────────────────────────────────────────
    if (['grouppanel2','grouptools','grouputils'].includes(command)) {
        return sb('👥 Group Tools Panel',
            '╭══〘 *👥 Group Tools Panel* 〙═⊷\n' +
            '┃ Advanced group management\n' +
            '╰══════════════════⊷',
            'Bera AI — Group Tools', [
            { id: p + 'hidetag',   text: '🔕 Hidden Tag All' },
            { id: p + 'tagall',    text: '📢 Tag All Members' },
            { id: p + 'antilink on', text: '🔗 Anti-Link ON' },
            { id: p + 'antispam on', text: '🛡️ Anti-Spam ON' },
            { id: p + 'setwelcome', text: '👋 Set Welcome Msg' },
            { id: p + 'groupstats', text: '📊 Group Stats' },
        ])
    }

    // ── PROFILE PANEL ────────────────────────────────────────────────────────
    if (['profilepanel','userpanel'].includes(command)) {
        return sb('👤 Profile Tools Panel',
            '╭══〘 *👤 Profile Tools Panel* 〙═⊷\n' +
            '┃ User profile & account tools\n' +
            '╰══════════════════⊷',
            'Bera AI', [
            { id: p + 'profile2', text: '🖼️ Get Profile Picture' },
            { id: p + 'bio',      text: '📝 Get Bio' },
            { id: p + 'setbio',   text: '✏️ Set Bot Bio' },
            { id: p + 'autobio on',text: '🔄 Auto Bio Rotation' },
            { id: p + 'chjid',    text: '📢 Channel JID Info' },
        ])
    }

    // ── HELP DESK ────────────────────────────────────────────────────────────
    if (['helpdesk','support'].includes(command)) {
        return sb('🆘 Help & Support',
            '╭══〘 *🆘 Help & Support* 〙═⊷\n' +
            '┃ Get help with Bera AI\n' +
            '╰══════════════════⊷',
            'Bera AI — Support', [
            { id: p + 'menu',      text: '📋 Full Command Menu' },
            { id: p + 'allpanels', text: '🗂️ All Panels' },
            { id: p + 'botinfo',   text: '🤖 Bot Info' },
            { id: p + 'report hi', text: '📩 Report an Issue' },
            { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🌐 GitHub Repo', url: 'https://github.com/bera-tech-ai/bera-ai' }) },
        ])
    }

    // ── WHAT'S NEW ───────────────────────────────────────────────────────────
    if (['newcmds','newcommands','whatsnew'].includes(command)) {
        return sb('🆕 New Commands',
            '╭══〘 *🆕 Recently Added* 〙═⊷\n' +
            '┃ ── 🐙 GitHub Integration (NEW!) ──\n' +
            '┃ setghtoken, ghrepo, ghuser\n' +
            '┃ ghsearch, ghissue, ghgist\n' +
            '┃\n' +
            '┃ ── 🎵 Music Fix ──\n' +
            '┃ play — now auto-downloads first result\n' +
            '┃\n' +
            '┃ ── 🧠 AI Fixes ──\n' +
            '┃ Bera only responds when mentioned\n' +
            '┃ No more double AI responses\n' +
            '┃\n' +
            '┃ ── 🔄 Auto-Updater ──\n' +
            '┃ .update / .checkupdate commands\n' +
            '┃\n' +
            '┃ ── 🧠 AI Tools ──\n' +
            '┃ ask2, lyrics2, define2, tr2\n' +
            '┃ weather2, calc2, qr2, search2\n' +
            '┃\n' +
            '┃ ── 📥 Downloads ──\n' +
            '┃ play, ytv, tiktok2, ig, fb, twitter\n' +
            '┃\n' +
            '┃ Total: *100+ commands* 🚀\n' +
            '╰══════════════════⊷',
            'Bera AI', [
            { id: p + 'ghpanel',   text: '🐙 GitHub Panel' },
            { id: p + 'allpanels', text: '🗂️ Browse All Panels' },
            { id: p + 'menu',      text: '📋 Full Command List' },
        ])
    }

    // ── GITHUB PANEL ─────────────────────────────────────────────────────────
    if (['ghpanel','githubpanel','githubmenu'].includes(command)) {
        return sb('🐙 GitHub Panel',
            '╭══〘 *🐙 GitHub Integration* 〙═⊷\n' +
            '┃ Manage GitHub from WhatsApp\n' +
            '┃ Set token first: ' + p + 'setghtoken\n' +
            '╰══════════════════⊷',
            'Bera AI — GitHub', [
            { id: p + 'setghtoken',   text: '🔑 Set GitHub Token' },
            { id: p + 'ghrepo list',  text: '📦 List My Repos' },
            { id: p + 'ghrepo create',text: '➕ Create New Repo' },
            { id: p + 'ghsearch ',    text: '🔍 Search GitHub Repos' },
            { id: p + 'ghuser ',      text: '👤 GitHub User Profile' },
            { id: p + 'ghissue ',     text: '🐛 Create an Issue' },
            { id: p + 'ghgist ',      text: '📋 Create a Gist' },
        ])
    }

    // ── ALL PANELS LIST ──────────────────────────────────────────────────────
    if (['allpanels','panellist'].includes(command)) {
        return sb('🗂️ All Button Panels',
            '╭══〘 *🗂️ All Button Panels* 〙═⊷\n' +
            '┃ Interactive panels — tap to open:\n' +
            '╰══════════════════⊷',
            'Bera AI', [
            { id: p + 'groupmenu',     text: '👥 Group Control Panel' },
            { id: p + 'adminpanel',    text: '👑 Admin Panel' },
            { id: p + 'memberpanel',   text: '🧑 Member Panel' },
            { id: p + 'aipanel',       text: '🧠 AI Tools Panel' },
            { id: p + 'mediapanel',    text: '📥 Media Download Panel' },
            { id: p + 'gamepanel',     text: '🎮 Games Panel' },
            { id: p + 'funpanel',      text: '😂 Fun Commands Panel' },
            { id: p + 'toolspanel',    text: '🔧 Utility Tools Panel' },
            { id: p + 'texttoolspanel',text: '📝 Text Tools Panel' },
            { id: p + 'statuspanel',   text: '📸 Status Panel' },
            { id: p + 'grouppanel2',   text: '👥 Group Tools Panel' },
            { id: p + 'bhpanel',       text: '☁️ BeraHost Panel' },
            { id: p + 'profilepanel',  text: '👤 Profile Panel' },
            { id: p + 'settingspanel', text: '⚙️ Settings Panel' },
            { id: p + 'ghpanel',       text: '🐙 GitHub Panel' },
        ])
    }
}

module.exports = handle
