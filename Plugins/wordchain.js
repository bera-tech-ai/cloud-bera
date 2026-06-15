// Plugins/wordchain.js — Word Chain Game (ported from atassa gifted/games.js)
  // Commands: wcg, wcgjoin, wcgbegin, wcgend, wcgscores, wcgai, w
  const axios = require('axios')

  const wcgGames = new Map()

  const handle = async (m, ctx) => {
      const { conn, command, args, text, reply, prefix, isOwner, sender } = ctx
      const chat = m.chat || m.key?.remoteJid
      const p = prefix
      const senderNum = sender.split('@')[0]
      const game = wcgGames.get(chat)

      // ── START ──────────────────────────────────────────────────────────────────
      if (['wcg','wordchain','wcgstart'].includes(command)) {
          if (game) return reply('❌ A Word Chain game is already running! Use ' + p + 'wcgend to end it.')
          wcgGames.set(chat, { host: sender, players: new Map([[sender, { score: 0, words: [] }]]), started: false, lastWord: null, lastPlayer: null, round: 0 })
          return conn.sendMessage(chat, { text:
              '⛓️ *Word Chain Game Started!*\n\n' +
              '👤 Host: @' + senderNum + '\n' +
              '📋 Rules: Each word must start with the last letter of the previous word.\n\n' +
              'Others join with: *' + p + 'wcgjoin*\n' +
              'Host starts with: *' + p + 'wcgbegin*', mentions: [sender]
          }, { quoted: m })
      }

      // ── JOIN ───────────────────────────────────────────────────────────────────
      if (['wcgjoin','joinwcg','joinwordchain'].includes(command)) {
          if (!game) return reply('❌ No Word Chain game running. Start one with ' + p + 'wcg')
          if (game.started) return reply('❌ Game already started! Wait for next round.')
          if (game.players.has(sender)) return reply('❌ You already joined!')
          game.players.set(sender, { score: 0, words: [] })
          return conn.sendMessage(chat, {
              text: '✅ @' + senderNum + ' joined!\nPlayers: ' + game.players.size + '\nStart with: ' + p + 'wcgbegin',
              mentions: [sender]
          }, { quoted: m })
      }

      // ── BEGIN ──────────────────────────────────────────────────────────────────
      if (['wcgbegin','startwcg','wcggo'].includes(command)) {
          if (!game) return reply('❌ No game running.')
          if (game.host !== sender && !isOwner) return reply('❌ Only the host can start!')
          if (game.players.size < 2) return reply('❌ Need at least 2 players.')
          game.started = true
          game.round++
          const startWord = ['apple','orange','elephant','tiger','river','mountain','guitar','thunder','wizard','falcon'][Math.floor(Math.random()*10)]
          game.lastWord = startWord
          game.lastPlayer = null
          return reply('⛓️ *Game Started! Round ' + game.round + '*\n\n🔤 Start word: *' + startWord + '*\n\nNext word must start with: *' + startWord.slice(-1).toUpperCase() + '*\nUse: ' + p + 'w <word>')
      }

      // ── SUBMIT WORD ────────────────────────────────────────────────────────────
      if (command === 'w' || command === 'word' || command === 'wcgword') {
          if (!game) return reply('❌ No active Word Chain game.')
          if (!game.started) return reply('❌ Game hasn\'t started yet. Host uses ' + p + 'wcgbegin')
          const word = (text||'').trim().toLowerCase().replace(/[^a-z]/g,'')
          if (!word) return reply('❌ Usage: ' + p + 'w <word>')
          if (game.lastPlayer === sender) return reply('❌ Wait for another player to go first!')
          const lastLetter = (game.lastWord||'').slice(-1)
          if (word[0] !== lastLetter) return reply('❌ *' + word + '* must start with *' + lastLetter.toUpperCase() + '*')
          const allWords = [...game.players.values()].flatMap(p => p.words)
          if (allWords.includes(word)) return reply('❌ *' + word + '* was already used!')
          const player = game.players.get(sender)
          if (!player) return reply('❌ You are not in this game. Join next round with ' + p + 'wcg')
          player.words.push(word)
          player.score += word.length
          game.lastWord = word
          game.lastPlayer = sender
          return conn.sendMessage(chat, {
              text: '✅ @' + senderNum + ' played *' + word + '*! (+' + word.length + ')\n🔤 Next: starts with *' + word.slice(-1).toUpperCase() + '*',
              mentions: [sender]
          }, { quoted: m })
      }

      // ── SCORES ────────────────────────────────────────────────────────────────
      if (['wcgscores','wcgscore','wordchainscore'].includes(command)) {
          if (!game) return reply('❌ No active Word Chain game.')
          const board = [...game.players.entries()]
              .sort(([,a],[,b]) => b.score - a.score)
              .map(([jid, p], i) => (i===0?'🥇':'  '+(i+1)+'.') + ' @' + jid.split('@')[0] + ' — ' + p.score + ' pts (' + p.words.length + ' words)')
              .join('\n')
          return conn.sendMessage(chat, {
              text: '⛓️ *Word Chain Scoreboard*\n\n' + board,
              mentions: [...game.players.keys()]
          }, { quoted: m })
      }

      // ── END ────────────────────────────────────────────────────────────────────
      if (['wcgend','endwcg','wcgstop'].includes(command)) {
          if (!game) return reply('❌ No active Word Chain game.')
          if (game.host !== sender && !isOwner) return reply('❌ Only the host or owner can end the game.')
          const entries = [...game.players.entries()].sort(([,a],[,b]) => b.score - a.score)
          const winner = entries[0]
          const board = entries.map(([jid, p], i) => (i===0?'🏆':'  '+(i+1)+'.') + ' @' + jid.split('@')[0] + ' — ' + p.score + ' pts').join('\n')
          wcgGames.delete(chat)
          return conn.sendMessage(chat, {
              text: '⛓️ *Game Over!*\n\n🏆 Winner: @' + (winner?.[0]||'').split('@')[0] + '\n\n' + board,
              mentions: entries.map(([jid]) => jid)
          }, { quoted: m })
      }

      // ── vs AI ──────────────────────────────────────────────────────────────────
      if (['wcgai','wcgbot','wordchainai'].includes(command)) {
          const words = ['apple','parrot','tiger','rabbit','turtle','elephant','lion','north','honey','yak']
          const startWord = words[Math.floor(Math.random()*words.length)]
          const playerWord = (text||'').trim().toLowerCase().replace(/[^a-z]/g,'')
          if (!playerWord) return reply('⛓️ *Word Chain vs AI*\n\nI start with: *' + startWord + '*\nYour word must start with: *' + startWord.slice(-1).toUpperCase() + '*\nUsage: ' + p + 'wcgai <your word>')
          if (playerWord[0] !== startWord.slice(-1)) return reply('❌ Your word must start with: *' + startWord.slice(-1).toUpperCase() + '*')
          const aiLetter = playerWord.slice(-1)
          const aiWords = words.filter(w => w[0] === aiLetter && w !== playerWord)
          const aiWord = aiWords[Math.floor(Math.random()*aiWords.length)] || null
          if (!aiWord) return reply('🤖 I can\'t think of a word starting with *' + aiLetter.toUpperCase() + '*! You win this round! 🎉')
          return reply('⛓️ *Word Chain vs AI*\n\n🤖 I play: *' + startWord + '*\n👤 You played: *' + playerWord + '* (+' + playerWord.length + ')\n🤖 I reply: *' + aiWord + '*\nNext starts with: *' + aiWord.slice(-1).toUpperCase() + '*')
      }
  }

  handle.command = ['wcg','wordchain','wcgstart','wcgjoin','joinwcg','joinwordchain','wcgbegin','startwcg','wcggo','wcgend','endwcg','wcgstop','wcgscores','wcgscore','wordchainscore','wcgai','wcgbot','wordchainai','w','word','wcgword']
  handle.tags = ['games']
  handle.help = ['wcg — Start Word Chain Game','wcgjoin — Join the game','w <word> — Submit a word','wcgscores — View scoreboard','wcgend — End the game','wcgai <word> — Play vs AI']

  module.exports = handle
  