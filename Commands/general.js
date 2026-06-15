const config = require('../Config')
  const moment = require('moment-timezone')
  const { makeSticker } = require('../Library/actions/sticker')

  // ── Button mode helper (graceful if missing) ──────────────────────────────────
  let _getBtnMode = () => true
  try { _getBtnMode = require('../Library/actions/btnmode').getBtnMode } catch {}

  // ── sendButtons wrapper (graceful if missing) ─────────────────────────────────
  let _sendButtons = null
  try { _sendButtons = require('gifted-btns').sendButtons } catch {}

  const sb = async (conn, chat, opts) => {
      if (_sendButtons && _getBtnMode(chat)) {
          try { return await _sendButtons(conn, chat, opts) } catch {}
      }
      const lines = []
      if (opts.title) lines.push('*' + opts.title + '*')
      if (opts.text)  lines.push(opts.text)
      if (opts.buttons?.length) {
          lines.push('')
          opts.buttons.forEach((b, i) => {
              const label = b.text || b.label || (b.buttonParamsJson ? (() => { try { return JSON.parse(b.buttonParamsJson).display_text } catch { return 'Option ' + (i+1) } })() : 'Option ' + (i+1))
              lines.push('  [' + (i+1) + '] ' + label)
          })
      }
      if (opts.footer) lines.push('\n_' + opts.footer + '_')
      return conn.sendMessage(chat, { text: lines.join('\n') })
  }

  const handle = async (m, ctx) => {
      if (!ctx || typeof ctx !== 'object') return
      const { conn, command, args, text, reply, prefix, isOwner, isAdmin, sender } = ctx
      const chat = m.chat || m.key?.remoteJid
      const p = prefix
      const btnOn = _getBtnMode(chat)

      const formatUptime = (sec) => {
          const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600)
          const mn = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60)
          return d > 0 ? d + 'd ' + h + 'h ' + mn + 'm' : h > 0 ? h + 'h ' + mn + 'm ' + s + 's' : mn + 'm ' + s + 's'
      }

      // ── PING ──────────────────────────────────────────────────────────────────
      if (command === 'ping') {
          const start = Date.now()
          await reply('...')
          const ms = Date.now() - start
          return sb(conn, chat, {
              title: '⚡ Bera AI',
              text: '🏓 *Pong!* ' + ms + 'ms\n⏱️ Uptime: ' + formatUptime(process.uptime()),
              footer: config.botName + ' v' + config.version,
              buttons: [
                  { id: p + 'menu', text: '📋 Menu' },
                  { id: p + 'status', text: '📊 Status' },
              ]
          })
      }

      // ── UPTIME ────────────────────────────────────────────────────────────────
      if (command === 'uptime' || command === 'up') {
          return reply('⏱️ *Uptime:* ' + formatUptime(process.uptime()))
      }

      // ── STATUS DASHBOARD ──────────────────────────────────────────────────────
      if (['status', 'dashboard', 'botstat'].includes(command)) {
          await reply('⏳ Fetching status...')
          try {
              const { richServerStats } = require('../Library/actions/beraai')
              const sys = await richServerStats()
              const bhKey = global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY
              const gitKey = global.db?.data?.settings?.gitToken || process.env.GIT_TOKEN
              const users = Object.keys(global.db?.data?.users || {}).length
              const premiums = Object.values(global.db?.data?.users || {}).filter(u => u.premium).length
              const isPrivate = global.db?.data?.settings?.mode === 'private'
              const monitors = Object.keys(global._monitors || {}).length
              const crons = Object.keys(global._cronJobs || {}).length
              return reply(
                  '╭══〘 🤖 *BERA AI STATUS* 〙═⊷\n' +
                  '┃ ⏱️ Uptime: ' + sys.uptime + '\n' +
                  '┃ 🧠 RAM: ' + sys.memory.used + ' / ' + sys.memory.total + ' (' + sys.memory.pct + ')\n' +
                  '┃ 💾 Disk: ' + sys.disk.used + ' / ' + sys.disk.total + ' (' + sys.disk.pct + ')\n' +
                  '┃ 📈 Load: ' + sys.load + '\n┃\n' +
                  '┃ 👥 Users: ' + users + ' | Premium: ' + premiums + '\n' +
                  '┃ 🔒 Mode: ' + (isPrivate ? 'Private' : 'Public') + ' | Prefix: ' + p + '\n' +
                  '┃ 🔑 BeraHost: ' + (bhKey ? '✅' : '❌') + ' | GitHub: ' + (gitKey ? '✅' : '❌') + '\n' +
                  '┃ 👁️ Monitors: ' + monitors + ' | Crons: ' + crons + '\n' +
                  '╰══════════════════⊷'
              )
          } catch (e) { return reply('❌ Status error: ' + e.message) }
      }

      // ── INFO ──────────────────────────────────────────────────────────────────
      if (command === 'info') {
          return reply(
              '╭══〘 *🤖 BERA AI INFO* 〙═⊷\n' +
              '┃ 🤖 Bot: ' + config.botName + ' v' + config.version + '\n' +
              '┃ 👨\u200d💻 Dev: ' + config.developer + '\n' +
              '┃ 🔗 GitHub: ' + config.github + '\n' +
              '┃ ⚡ Prefix: ' + p + '\n' +
              '┃ ⏱️ Uptime: ' + formatUptime(process.uptime()) + '\n' +
              '╰══════════════════⊷'
          )
      }

      // ══════════════════════════════════════════════════════════════════════════
      //  MAIN MENU — atassa-style: bot image + caption + category buttons
      // ══════════════════════════════════════════════════════════════════════════
      if (['menu', 'help', 'start', 'commands', 'men', 'menus', 'mainmenu'].includes(command)) {
          const now    = moment().tz('Africa/Nairobi')
          const time   = now.format('hh:mm:ss A')
          const date   = now.format('dddd, DD MMM YYYY')
          const uptime = formatUptime(process.uptime())
          const pushName  = m.pushName || 'User'
          const isPrivate = global.db?.data?.settings?.mode === 'private'

          const caption =
              '*🦄 Uᴘᴛɪᴍᴇ :* ' + uptime + '\n' +
              '*🍁 Dᴀᴛᴇ Tᴏᴅᴀʏ:* ' + date + '\n' +
              '*🎗 Tɪᴍᴇ Nᴏᴡ:* ' + time + '\n\n' +
              '➮Fᴏᴜɴᴅᴇʀ - Bera Tech\n' +
              '➮Usᴇʀ - ' + pushName + '\n' +
              '➮Mᴏᴅᴇ - ' + (isPrivate ? '🔒 Private' : '🌐 Public') + '\n' +
              '➮Pʀᴇꜰɪx - ' + p + '\n\n' +
              '╭──❰ *BERA AI MENU* ❱\n' +
              '│🏮 ' + p + 'aimenu       — 🧠 AI & Agent\n' +
              '│🏮 ' + p + 'dlmenu       — 📥 Downloads\n' +
              '│🏮 ' + p + 'searchmenu   — 🔍 Search\n' +
              '│🏮 ' + p + 'groupmenu    — 👥 Groups\n' +
              '│🏮 ' + p + 'toolsmenu    — 🛠️ Tools\n' +
              '│🏮 ' + p + 'gamesmenu    — 🎮 Games\n' +
              '│🏮 ' + p + 'convertmenu  — 🔄 Converter\n' +
              '│🏮 ' + p + 'musicmenu    — 🎵 Music & Media\n' +
              '│🏮 ' + p + 'sportsmenu   — ⚽ Sports & Finance\n' +
              '│🏮 ' + p + 'deploymenu   — 🚀 Deploy (BeraHost)\n' +
              '│🏮 ' + p + 'devmenu      — 💻 Dev Tools\n' +
              '│🏮 ' + p + 'ptmenu       — 🦕 Pterodactyl\n' +
              '│🏮 ' + p + 'keymenu      — 🔑 Key System\n' +
              '│🏮 ' + p + 'religionmenu — ⛪ Bible & Religion\n' +
              '│🏮 ' + p + 'tempmailmenu — ✉️ Temp Mail\n' +
              '│🏮 ' + p + 'settingsmenu — ⚙️ Settings\n' +
              (isOwner ? '│🏮 ' + p + 'ownermenu    — 👑 Owner/Admin\n' : '') +
              '│🏮 ' + p + 'list         — 📋 All Commands\n' +
              '╰─────────────⦁'

          const botPic = config.botImage || './assets/bera-ai-profile.png'
          const fs = require('fs')
          try {
              if (fs.existsSync(botPic)) {
                  await conn.sendMessage(chat, {
                      image: { url: botPic },
                      caption,
                      contextInfo: { mentionedJid: [sender] }
                  }, { quoted: m })
              } else {
                  await reply(caption)
              }
          } catch { await reply(caption) }

          if (btnOn && _sendButtons) {
              try {
                  await _sendButtons(conn, chat, {
                      title: '🤖 ' + config.botName,
                      text: 'Tap a category to see its commands:',
                      footer: config.botName + ' v' + config.version,
                      buttons: [
                          { id: p + 'aimenu',     text: '🧠 AI & Agent' },
                          { id: p + 'dlmenu',     text: '📥 Downloads' },
                          { id: p + 'searchmenu', text: '🔍 Search' },
                          { id: p + 'groupmenu',  text: '👥 Groups' },
                          { id: p + 'toolsmenu',  text: '🛠️ Tools' },
                          { id: p + 'gamesmenu',  text: '🎮 Games' },
                      ]
                  })
                  await _sendButtons(conn, chat, {
                      title: '🤖 More Categories',
                      text: 'More Bera AI categories:',
                      footer: config.botName + ' v' + config.version,
                      buttons: [
                          { id: p + 'convertmenu',  text: '🔄 Converter' },
                          { id: p + 'musicmenu',    text: '🎵 Music & Media' },
                          { id: p + 'sportsmenu',   text: '⚽ Sports' },
                          { id: p + 'deploymenu',   text: '🚀 Deploy' },
                          { id: p + 'devmenu',      text: '💻 Dev Tools' },
                          { id: p + 'settingsmenu', text: '⚙️ Settings' },
                      ]
                  })
              } catch {}
          }
          return
      }

      // ══════════════════════════════════════════════════════════════════════════
      //  LIST — full command dump, atassa style
      // ══════════════════════════════════════════════════════════════════════════
      if (['list', 'listmenu', 'listmen', 'cmds', 'allcmds'].includes(command)) {
          const sections = [
              { title: '🧠 AI & AGENT', cmds: [
                  [p+'bera <msg>','Chat with Bera AI'],[p+'agent <task>','Autonomous agent (140 tools)'],
                  [p+'imagine <desc>','Generate AI image'],[p+'see / vision','Analyze an image'],
                  [p+'tts <text>','Text to speech'],[p+'summarize <text>','Summarize text'],
                  [p+'explain <topic>','Explain clearly'],[p+'improve <text>','Improve writing'],
                  [p+'proofread <text>','Fix grammar'],[p+'rewrite <text>','Rephrase'],
                  [p+'formal / casual','Change tone'],[p+'eli5 <topic>',"Explain like I'm 5"],
                  [p+'tweet <topic>','Write tweet'],[p+'caption2 <desc>','IG caption'],
                  [p+'essay <topic>','Write essay'],[p+'debugcode <code>','Debug code'],
                  [p+'eng2code <desc>','Generate code'],[p+'code2eng <code>','Explain code'],
                  [p+'berareset','Clear AI history'],[p+'chatbot on/off','Auto AI replies'],
                  [p+'gpt / gemini','Direct AI models'],[p+'gpt4 / gpt4o','GPT-4 / GPT-4o'],
                  [p+'venice','Venice AI'],[p+'giftedai','Gifted AI'],
              ]},
              { title: '📥 DOWNLOADS', cmds: [
                  [p+'play <song>','Download song (MP3)'],[p+'video <url>','YouTube MP4'],
                  [p+'tiktok <url>','Download TikTok'],[p+'ig / insta <url>','Instagram'],
                  [p+'fb <url>','Facebook video'],[p+'twitter <url>','Twitter/X video'],
                  [p+'sendaudio <url>','Any audio URL'],[p+'sendvideo <url>','Any video URL'],
                  [p+'gitclone <url>','GitHub repo as ZIP'],[p+'snack <url>','Snack Video'],
                  [p+'dl <url>','Auto-detect & download'],[p+'spotifydl <url>','Spotify track'],
              ]},
              { title: '🔍 SEARCH', cmds: [
                  [p+'google <q>','Google search'],[p+'yts <q>','YouTube search'],
                  [p+'lyrics <song>','Song lyrics'],[p+'shazam','Identify music (quote audio)'],
                  [p+'weather <city>','Weather info'],[p+'wiki <topic>','Wikipedia'],
                  [p+'npm <package>','NPM package info'],[p+'ggleimage <q>','Google Images'],
                  [p+'unsplash <q>','Unsplash photos'],[p+'wallpapers <q>','HD Wallpapers'],
                  [p+'wattpad <q>','Wattpad stories'],[p+'spotifysearch <q>','Spotify search'],
                  [p+'happymod <app>','HappyMod APK'],[p+'apkmirror <app>','APK Mirror'],
                  [p+'stickersearch <q>','Sticker search'],[p+'movie <title>','Movie info'],
                  [p+'anime <title>','Anime info'],
              ]},
              { title: '👥 GROUPS', cmds: [
                  [p+'kick @user','Remove member'],[p+'add <number>','Add member'],
                  [p+'promote @user','Make admin'],[p+'demote @user','Remove admin'],
                  [p+'mute / unmute','Lock / unlock group'],[p+'tagall <msg>','Tag all members'],
                  [p+'hidetag <msg>','Silent tag all'],[p+'tagadmins <msg>','Tag all admins'],
                  [p+'link / revoke','Invite link / reset'],[p+'groupname <name>','Change group name'],
                  [p+'gcdesc <text>','Change group desc'],[p+'gcpp / getgcpp','Set / get group pic'],
                  [p+'antilink on/off','Block links'],[p+'antispam on/off','Anti spam'],
                  [p+'welcome on/off','Welcome message'],[p+'warn @user','Warn member'],
                  [p+'del','Delete quoted message'],[p+'disapp on/off','Disappearing messages'],
                  [p+'listmembers','List all members'],[p+'listadmins','List all admins'],
                  [p+'newgroup <name>','Create new group'],[p+'killgc','Terminate group'],
                  [p+'everyone / tag','Tag all with message'],[p+'vcf','Export members as VCF'],
                  [p+'accept / reject','Handle join requests'],[p+'online','List online members'],
              ]},
              { title: '🛠️ TOOLS', cmds: [
                  [p+'fetch <url>','Fetch URL content'],[p+'ssweb <url>','Screenshot website'],
                  [p+'ssphone / sstab','Mobile / tablet screenshot'],[p+'createqr <text>','Generate QR code'],
                  [p+'readqr','Read QR code (quote image)'],[p+'define <word>','Word definition'],
                  [p+'fancy <text>','Fancy Unicode text'],[p+'ttp <text>','Text to image sticker'],
                  [p+'ebinary / debinary','Encode / decode binary'],[p+'ebase / dbase','Encode / decode Base64'],
                  [p+'emojimix <e1> <e2>','Mix two emojis'],[p+'createpdf','Create PDF'],
                  [p+'photoeditor','AI photo editor'],[p+'remini','Enhance photo with AI'],
                  [p+'domaincheck <url>','Domain WHOIS info'],[p+'web2zip <url>','Website as ZIP'],
                  [p+'rename','Rename a document'],[p+'shortener','URL shortener list'],
                  [p+'password','Generate strong password'],[p+'shorten <url>','Shorten URL'],
                  [p+'wacheck <num>','Check if on WhatsApp'],[p+'http <url>','HTTP request tester'],
                  [p+'jwtgen <payload>','Generate JWT'],[p+'hash <text>','Hash text'],
              ]},
              { title: '🎮 GAMES', cmds: [
                  [p+'games','Show all games'],[p+'tictactoe','Start TicTacToe'],
                  [p+'tttai','TicTacToe vs AI'],[p+'wcg','Word Chain Game'],
                  [p+'wcgai','Word Chain vs AI'],[p+'dice','Dice game'],
                  [p+'diceai','Dice vs AI'],[p+'trivia','Trivia quiz'],
              ]},
              { title: '🔄 CONVERTER', cmds: [
                  [p+'sticker / st','Image / video to sticker'],[p+'toimg','Sticker to image'],
                  [p+'toaudio / tomp3','Video to audio'],[p+'toptt / tovoice','Audio to voice note'],
                  [p+'tovideo','Audio to video'],[p+'tl / tr <lang>','Translate text'],
                  [p+'ocr','Extract text from image'],[p+'upscale','Upscale image with AI'],
                  [p+'removebg','Remove image background'],
              ]},
              { title: '🎵 MUSIC & MEDIA', cmds: [
                  [p+'play <song>','Download & send MP3'],[p+'video <url>','YouTube MP4'],
                  [p+'spotifydl <url>','Download Spotify'],[p+'chord <song>','Guitar chords'],
                  [p+'soundcloud <q>','SoundCloud search'],[p+'spotifylyrics <q>','Spotify lyrics'],
                  [p+'transcribe','Transcribe audio'],[p+'tts <text>','Text to speech'],
              ]},
              { title: '⚽ SPORTS & FINANCE', cmds: [
                  [p+'livescore','Live football scores'],[p+'standings <league>','League table'],
                  [p+'topscorers','Top goal scorers'],[p+'upcoming','Upcoming matches / fixtures'],
                  [p+'surebet','Betting tips & odds'],[p+'sportnews','Football news'],
                  [p+'gamehistory <id>','Match events history'],
                  [p+'agent bitcoin price','Crypto price (live)'],[p+'agent AAPL stock','Stock price'],
                  [p+'agent 100 USD KES','Currency converter'],[p+'agent news AI','Latest headlines'],
              ]},
              { title: '🚀 DEPLOY (BERAHOST)', cmds: [
                  [p+'bh','BeraHost dashboard'],[p+'deploy beraai <num>','Deploy Bera AI bot'],
                  [p+'bh bots','Available bot templates'],[p+'bh status <id>','Bot status'],
                  [p+'bh logs <id>','Bot logs'],[p+'bh start/stop <id>','Start / stop bot'],
                  [p+'bh restart <id>','Restart bot'],[p+'bh env <id> K=V','Set env variable'],
                  [p+'bh delete <id>','Delete deployment'],[p+'bh coins','View coins balance'],
                  [p+'bh claim','Claim daily coins'],[p+'bh pay <kes> <num>','M-Pesa payment'],
                  [p+'setbhkey <key>','Save BeraHost API key'],[p+'sky deploy <repo>','SkyHost deploy'],
                  [p+'sky projects','List SkyHost projects'],
              ]},
              { title: '💻 DEV TOOLS', cmds: [
                  [p+'bash / $ <cmd>','Run shell command'],[p+'eval / js <code>','Eval JavaScript'],
                  [p+'agent <task>','Autonomous dev agent'],[p+'gitclone <url>','Clone repo to workspace'],
                  [p+'setghtoken <tok>','Save GitHub token'],[p+'workspace list','List workspace files'],
                  [p+'ssh <host>','SSH into server'],[p+'sshexec <cmd>','Run SSH command'],
                  [p+'vercel','Vercel deployments'],[p+'setvercel <tok>','Save Vercel token'],
                  [p+'monitor add <url>','Monitor a URL'],[p+'cron add <expr>','Add cron job'],
                  [p+'codescan','Scan code for bugs'],[p+'replit <task>','Replit-style dev env'],
              ]},
              { title: '🦕 PTERODACTYL', cmds: [
                  [p+'ptlist / servers','List servers'],[p+'ptstatus <id>','Server status'],
                  [p+'ptstart <id>','Start server'],[p+'ptstop <id>','Stop server'],
                  [p+'ptrestart <id>','Restart server'],[p+'ptkill <id>','Kill server'],
                  [p+'ptcmd <id> <cmd>','Run console command'],[p+'ptfiles <id>','List server files'],
                  [p+'ptread <id> <file>','Read a file'],[p+'ptwrite <id>','Write a file'],
                  [p+'ptcreate','Create new server'],[p+'ptusers <id>','Server users'],
                  [p+'ptnodes','Panel nodes'],[p+'pthelp','Full Pterodactyl help'],
              ]},
              { title: '🔑 KEY SYSTEM', cmds: [
                  [p+'activate <KEY>','Activate your key'],[p+'checkkey','Check key status'],
                  ...(isOwner ? [
                      [p+'genkey <num> <days>','Generate key (owner)'],
                      [p+'revokekey <KEY>','Revoke a key'],
                      [p+'extendkey <KEY> <d>','Extend key duration'],
                      [p+'listkeys','List all keys'],
                  ] : [])
              ]},
              { title: '⛪ RELIGION', cmds: [
                  [p+'bible <ref>','Bible verse (e.g. John 3:16)'],[p+'verse <ref>','Same as bible'],
                  [p+'agent quran <ref>','Quran verse via AI'],
              ]},
              { title: '✉️ TEMP MAIL', cmds: [
                  [p+'tempmail','Generate temp email'],[p+'inbox','Check temp mail inbox'],
                  [p+'readmail <n>','Read email by number'],[p+'delmail','Delete temp email'],
                  [p+'tempmailhelp','All temp mail commands'],
              ]},
              { title: '⚙️ SETTINGS', cmds: [
                  [p+'mode public/private','Bot access mode'],[p+'btnmode on/off','Toggle buttons'],
                  [p+'setprefix <char>','Change bot prefix'],[p+'autoreply on/off','Auto reply'],
                  [p+'autoread on/off','Auto read'],[p+'autoreact on/off','Auto react'],
                  [p+'autobio on/off','Auto bio rotation'],[p+'setchatbot on/off','Chatbot AI mode'],
                  [p+'settimezone <tz>','Set timezone'],[p+'setbotname <name>','Set bot name'],
                  [p+'settings','View all settings'],
              ]},
          ]
          if (isOwner) sections.push({ title: '👑 OWNER / ADMIN', cmds: [
              [p+'broadcast <msg>','Broadcast to all users'],[p+'backup','Backup DB + session'],
              [p+'ban / unban @user','Ban / unban user'],[p+'sudo @user','Add sudo user'],
              [p+'delsudo @user','Remove sudo user'],[p+'block / unblock','Block / unblock number'],
              [p+'stats','Bot statistics'],[p+'update','Check for bot updates'],
              [p+'join / left','Join / leave group'],[p+'forward <jid>','Forward message'],
              [p+'resetdb','Reset entire database'],[p+'resetsudo','Clear all sudo users'],
          ]})

          const listText = sections.map(sec => {
              const cmdLines = sec.cmds.map(([cmd, desc]) => '┃❍ *' + cmd + '* — ' + desc).join('\n')
              return '╭══〘 ' + sec.title + ' 〙═⊷\n' + cmdLines + '\n╰══════════════════⊷'
          }).join('\n\n')
          return reply(listText)
      }

      // ══════════════════════════════════════════════════════════════════════════
      //  CATEGORY SUBMENUS
      // ══════════════════════════════════════════════════════════════════════════
      const subMenus = {
          aimenu:       { title: '🧠 AI & AGENT', cmds: [[p+'bera <msg>','Chat with Bera AI'],[p+'agent <task>','Autonomous agent'],[p+'imagine <desc>','Generate image'],[p+'see','Analyze image (quote)'],[p+'tts <text>','Text to speech'],[p+'summarize','Summarize text'],[p+'explain','Explain topic'],[p+'improve','Improve writing'],[p+'rewrite','Rephrase text'],[p+'eli5','Explain like I am 5'],[p+'tweet','Write tweet'],[p+'essay','Write essay'],[p+'debugcode','Debug code'],[p+'eng2code','Generate code'],[p+'berareset','Clear history'],[p+'chatbot on/off','Auto AI replies'],[p+'gpt / gemini','Direct AI models']] },
          dlmenu:       { title: '📥 DOWNLOADS', cmds: [[p+'play <song>','Song MP3'],[p+'video <url>','YouTube MP4'],[p+'tiktok <url>','TikTok'],[p+'ig <url>','Instagram'],[p+'fb <url>','Facebook'],[p+'twitter <url>','Twitter/X'],[p+'sendaudio <url>','Any audio URL'],[p+'sendvideo <url>','Any video URL'],[p+'gitclone <url>','GitHub repo ZIP'],[p+'snack <url>','Snack Video'],[p+'dl <url>','Auto detect'],[p+'spotifydl <url>','Spotify']] },
          searchmenu:   { title: '🔍 SEARCH', cmds: [[p+'google <q>','Google'],[p+'yts <q>','YouTube search'],[p+'lyrics <song>','Lyrics'],[p+'shazam','ID music (quote audio)'],[p+'weather <city>','Weather'],[p+'wiki <q>','Wikipedia'],[p+'npm <pkg>','NPM package'],[p+'ggleimage <q>','Google images'],[p+'unsplash <q>','Unsplash'],[p+'wallpapers <q>','Wallpapers'],[p+'wattpad <q>','Wattpad'],[p+'movie <title>','Movie info'],[p+'anime <title>','Anime info'],[p+'stickersearch <q>','Stickers']] },
          groupmenu:    { title: '👥 GROUPS', cmds: [[p+'kick @user','Remove member'],[p+'add <num>','Add member'],[p+'promote @user','Make admin'],[p+'demote @user','Remove admin'],[p+'mute / unmute','Lock/unlock'],[p+'tagall <msg>','Tag all'],[p+'hidetag <msg>','Silent tag'],[p+'tagadmins','Tag admins'],[p+'link / revoke','Invite link'],[p+'antilink on/off','Block links'],[p+'welcome on/off','Welcome msg'],[p+'warn @user','Warn user'],[p+'del','Delete msg'],[p+'listmembers','Member list'],[p+'everyone <msg>','Tag everyone'],[p+'vcf','Export as VCF']] },
          toolsmenu:    { title: '🛠️ TOOLS', cmds: [[p+'fetch <url>','Fetch URL'],[p+'ssweb <url>','Screenshot web'],[p+'createqr <text>','Make QR'],[p+'readqr','Scan QR (quote)'],[p+'define <word>','Definition'],[p+'fancy <text>','Fancy text'],[p+'ttp <text>','Text to sticker'],[p+'ebinary <text>','To binary'],[p+'ebase <text>','To base64'],[p+'emojimix <e1> <e2>','Emoji mix'],[p+'remini','Enhance photo'],[p+'photoeditor','AI photo edit'],[p+'domaincheck <url>','WHOIS'],[p+'wacheck <num>','Check WA'],[p+'password','Gen password'],[p+'shorten <url>','Shorten URL']] },
          gamesmenu:    { title: '🎮 GAMES', cmds: [[p+'tictactoe','TicTacToe (2 players)'],[p+'tttai','TicTacToe vs AI'],[p+'wcg','Word Chain Game'],[p+'wcgai','Word Chain vs AI'],[p+'dice','Dice game'],[p+'diceai','Dice vs AI'],[p+'trivia','Trivia quiz'],[p+'games','All games list']] },
          convertmenu:  { title: '🔄 CONVERTER', cmds: [[p+'sticker','Image/video to sticker'],[p+'toimg','Sticker to image'],[p+'toaudio','Video to audio'],[p+'toptt','Audio to voice note'],[p+'tovideo','Audio to video'],[p+'tl / tr <lang>','Translate'],[p+'ocr','Extract text from image'],[p+'upscale','Upscale image'],[p+'removebg','Remove background']] },
          musicmenu:    { title: '🎵 MUSIC & MEDIA', cmds: [[p+'play <song>','Download song MP3'],[p+'video <url>','YouTube MP4'],[p+'spotifydl <url>','Spotify download'],[p+'chord <song>','Guitar chords'],[p+'soundcloud <q>','SoundCloud'],[p+'spotifylyrics','Spotify lyrics'],[p+'transcribe','Transcribe audio'],[p+'tts <text>','Text to speech']] },
          sportsmenu:   { title: '⚽ SPORTS & FINANCE', cmds: [[p+'livescore','Live scores'],[p+'standings <league>','League table'],[p+'topscorers','Top scorers'],[p+'upcoming','Fixtures'],[p+'surebet','Betting tips'],[p+'sportnews','Football news'],[p+'gamehistory <id>','Match events'],[p+'agent bitcoin price','Crypto price'],[p+'agent AAPL stock','Stock price'],[p+'agent 100 USD KES','Currency']] },
          deploymenu:   { title: '🚀 DEPLOY', cmds: [[p+'bh','BeraHost dashboard'],[p+'deploy beraai <num>','Deploy bot'],[p+'bh bots','Bot templates'],[p+'bh status <id>','Bot status'],[p+'bh logs <id>','Bot logs'],[p+'bh start/stop <id>','Control bot'],[p+'bh coins','Coins balance'],[p+'bh claim','Claim coins'],[p+'bh pay <kes> <num>','M-Pesa payment'],[p+'setbhkey <key>','Set API key'],[p+'sky deploy <repo>','SkyHost deploy'],[p+'sky projects','SkyHost list']] },
          devmenu:      { title: '💻 DEV TOOLS', cmds: [[p+'bash / $ <cmd>','Shell command'],[p+'eval / js <code>','Run JS'],[p+'agent <task>','Dev agent'],[p+'gitclone <url>','Clone repo'],[p+'setghtoken <tok>','GitHub token'],[p+'workspace list','Workspace'],[p+'ssh <host>','SSH connect'],[p+'sshexec <cmd>','SSH command'],[p+'monitor add <url>','URL monitor'],[p+'cron add <expr>','Schedule task'],[p+'replit <task>','Replit-style env']] },
          ptmenu:       { title: '🦕 PTERODACTYL', cmds: [[p+'ptlist','List servers'],[p+'ptstatus <id>','Status'],[p+'ptstart <id>','Start'],[p+'ptstop <id>','Stop'],[p+'ptrestart <id>','Restart'],[p+'ptcmd <id> <cmd>','Console cmd'],[p+'ptfiles <id>','List files'],[p+'ptread <id> <f>','Read file'],[p+'ptcreate','Create server'],[p+'ptnodes','Panel nodes']] },
          keymenu:      { title: '🔑 KEY SYSTEM', cmds: [[p+'activate <KEY>','Activate key'],[p+'checkkey','Check my key'],...(isOwner?[[p+'genkey <num> <days>','Generate key'],[p+'revokekey <KEY>','Revoke key'],[p+'extendkey <KEY> <d>','Extend key'],[p+'listkeys','All keys']]:[]) ] },
          religionmenu: { title: '⛪ RELIGION', cmds: [[p+'bible <ref>','Bible verse (e.g. John 3:16)'],[p+'verse <ref>','Same as bible'],[p+'agent quran <ref>','Quran verse']] },
          tempmailmenu: { title: '✉️ TEMP MAIL', cmds: [[p+'tempmail','Generate temp email'],[p+'inbox','Check inbox'],[p+'readmail <n>','Read email'],[p+'delmail','Delete email'],[p+'tempmailhelp','All commands']] },
          settingsmenu: { title: '⚙️ SETTINGS', cmds: [[p+'mode public/private','Access mode'],[p+'btnmode on/off','Toggle buttons'],[p+'setprefix <char>','Change prefix'],[p+'autoreply on/off','Auto reply'],[p+'autoread on/off','Auto read'],[p+'autoreact on/off','Auto react'],[p+'autobio on/off','Auto bio'],[p+'setchatbot on/off','Chatbot'],[p+'settimezone <tz>','Timezone'],[p+'settings','View all settings']] },
          ownermenu:    { title: '👑 OWNER / ADMIN', cmds: isOwner ? [[p+'broadcast <msg>','Broadcast'],[p+'backup','Backup DB'],[p+'ban / unban @user','Ban user'],[p+'sudo @user','Add sudo'],[p+'delsudo @user','Remove sudo'],[p+'block / unblock','Block user'],[p+'stats','Bot stats'],[p+'update','Check updates'],[p+'join <link>','Join group'],[p+'left','Leave group'],[p+'resetdb','Reset database'],[p+'resetsudo','Clear sudo']] : [] },
      }

      const subCmd = Object.keys(subMenus).find(k => command === k)
      if (subCmd) {
          const { title, cmds } = subMenus[subCmd]
          if (!cmds.length) return reply('⛔ Owner only section.')
          const lines = cmds.map(([cmd, desc]) => '┃❍ *' + cmd + '* — ' + desc).join('\n')
          const menuText = '╭══〘 ' + title + ' 〙═⊷\n' + lines + '\n╰══════════════════⊷'
          if (btnOn && _sendButtons) {
              try {
                  return await _sendButtons(conn, chat, {
                      title,
                      text: menuText,
                      footer: config.botName + ' v' + config.version,
                      buttons: [
                          { id: p + 'menu', text: '🏠 Main Menu' },
                          { id: p + 'list', text: '📋 Full List' },
                      ]
                  })
              } catch {}
          }
          return reply(menuText)
      }

      // ── STICKER ───────────────────────────────────────────────────────────────
      if (['sticker', 's', 'st', 'take'].includes(command)) {
          const quoted = m.quoted || m
          const mime = quoted?.mimetype || ''
          if (!mime.includes('image') && !mime.includes('video') && !mime.includes('webp'))
              return reply('❌ Please quote or attach an image, video, or GIF.')
          await conn.sendMessage(chat, { react: { text: '⚙️', key: m.key } }).catch(() => {})
          try {
              const media = await conn.downloadMediaMessage(quoted)
              const sticker = await makeSticker(media, mime, { packname: config.botName, author: config.developer })
              await conn.sendMessage(chat, { sticker }, { quoted: m })
              await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
          } catch (e) {
              await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
              return reply('❌ Sticker failed: ' + e.message)
          }
      }
  }

  handle.commands = [
      'ping', 'uptime', 'up', 'status', 'dashboard', 'botstat', 'info',
      'menu', 'help', 'start', 'commands', 'men', 'menus', 'mainmenu',
      'list', 'listmenu', 'listmen', 'cmds', 'allcmds',
      'aimenu', 'dlmenu', 'searchmenu', 'groupmenu', 'toolsmenu', 'gamesmenu',
      'convertmenu', 'musicmenu', 'sportsmenu', 'deploymenu', 'devmenu',
      'ptmenu', 'keymenu', 'religionmenu', 'tempmailmenu', 'settingsmenu', 'ownermenu',
      'sticker', 's', 'st', 'take',
  ]

  module.exports = handle
  