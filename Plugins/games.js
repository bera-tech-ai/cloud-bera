// Plugins/games.js — Games plugin for Bera AI
const config = require('../Config')

// ── In-memory game stores ───────────────────────────────────────────────────
const diceGames = new Map()   // chatId → { players: Map<jid,score>, status, bet }
const tttGames  = new Map()   // chatId → { board, players:[jid,jid], turn, symbols }
const triviaQ   = new Map()   // chatId → { question, answer, timer }

// ── Dice Game Helpers ────────────────────────────────────────────────────────
const rollDice = () => Math.floor(Math.random() * 6) + 1
const diceEmoji = n => ['⚀','⚁','⚂','⚃','⚄','⚅'][n - 1]

// ── TicTacToe Helpers ────────────────────────────────────────────────────────
const tttBoard = () => [' ',' ',' ',' ',' ',' ',' ',' ',' ']
const renderBoard = (b) =>
    `\`\`\`\n ${b[0]} │ ${b[1]} │ ${b[2]}\n───┼───┼───\n ${b[3]} │ ${b[4]} │ ${b[5]}\n───┼───┼───\n ${b[6]} │ ${b[7]} │ ${b[8]}\n\`\`\``

const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
const checkWin = (b, sym) => winCombos.some(([a,c,d]) => b[a]===sym && b[c]===sym && b[d]===sym)
const checkDraw = (b) => b.every(c => c !== ' ')

// ── Fun Random Data ──────────────────────────────────────────────────────────
const JOKES = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    "Why do cows wear bells? Because their horns don't work!",
    "What do you call a fake noodle? An impasta!",
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "What's a computer's favorite snack? Microchips!",
    "Why don't eggs tell jokes? They'd crack each other up!",
    "What do you call a dinosaur that crashes their car? Tyrannosaurus wrecks!",
    "I asked the librarian if they had books on paranoia. She whispered: 'They're right behind you!'",
    "Why can't you give Elsa a balloon? Because she'll let it go!",
]
const FACTS = [
    "Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs and it was still edible!",
    "A day on Venus is longer than a year on Venus.",
    "The average person walks about 100,000 miles in their lifetime.",
    "Bananas are technically berries, but strawberries are not.",
    "Octopuses have three hearts and blue blood.",
    "A group of flamingos is called a flamboyance.",
    "The human brain uses about 20% of the body's total energy.",
    "Water can boil and freeze at the same time — it's called the triple point.",
    "The Eiffel Tower can be 15 cm taller in the summer due to thermal expansion.",
    "There are more trees on Earth than stars in the Milky Way.",
]
const QUOTES = [
    '"The only way to do great work is to love what you do." — Steve Jobs',
    '"In the middle of difficulty lies opportunity." — Albert Einstein',
    '"It does not matter how slowly you go as long as you do not stop." — Confucius',
    '"Life is what happens when you\'re busy making other plans." — John Lennon',
    '"The future belongs to those who believe in the beauty of their dreams." — Eleanor Roosevelt',
    '"Success is not final, failure is not fatal: it is the courage to continue that counts." — Winston Churchill',
    '"The only impossible journey is the one you never begin." — Tony Robbins',
    '"Believe you can and you\'re halfway there." — Theodore Roosevelt',
]
const TRUTHS = [
    'What is your most embarrassing moment?',
    'Have you ever lied to your parents? What about?',
    'What is your biggest fear?',
    'Have you ever had a crush on a friend? Who?',
    'What is the worst thing you have ever done?',
    'Do you have any secrets you have never told anyone?',
    'What is something you are ashamed of?',
    'Have you ever cheated on a test or game?',
    'What is the most childish thing you still do?',
    'What is your biggest insecurity?',
]
const DARES = [
    'Do 20 push-ups right now.',
    'Text the last person you called and say "I love your laugh".',
    'Post an embarrassing photo on your status for 10 minutes.',
    'Speak in an accent for the next 3 minutes.',
    'Sing the chorus of your favorite song out loud.',
    'Change your profile picture to a funny face for 1 hour.',
    'Do your best impression of the person to your left.',
    'Say the alphabet backwards.',
    'Tell a joke that no one laughs at.',
    'Send a voice note to a random contact saying "beep boop I am a robot".',
]
const TRIVIA = [
    { q: 'What is the capital of France?', a: 'paris' },
    { q: 'How many continents are there?', a: '7' },
    { q: 'What is 15 × 15?', a: '225' },
    { q: 'Which planet is closest to the sun?', a: 'mercury' },
    { q: 'What is the chemical symbol for water?', a: 'h2o' },
    { q: 'Who wrote Romeo and Juliet?', a: 'shakespeare' },
    { q: 'How many sides does a hexagon have?', a: '6' },
    { q: 'What is the largest ocean on Earth?', a: 'pacific' },
    { q: 'In what year did World War 2 end?', a: '1945' },
    { q: 'What is the boiling point of water in Celsius?', a: '100' },
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {
    const react = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})
    const senderName = m.pushName || sender.split('@')[0]
    const senderNum = sender.split('@')[0]

    // ── MENU ────────────────────────────────────────────────────────────
    if (command === 'games') {
        return reply(
            `╭══〘 *🎮 BERA AI GAMES* 〙═⊷\n` +
            `┃\n` +
            `┃ *🎲 Dice Game (Group)*\n` +
            `┃❍ ${prefix}dice — Start a dice game\n` +
            `┃❍ ${prefix}dicejoin — Join current game\n` +
            `┃❍ ${prefix}diceroll — Roll your dice\n` +
            `┃❍ ${prefix}diceend — End the game\n` +
            `┃❍ ${prefix}diceai — Play dice vs Bera AI\n` +
            `┃\n` +
            `┃ *⭕ TicTacToe (Group)*\n` +
            `┃❍ ${prefix}ttt @user — Challenge someone\n` +
            `┃❍ ${prefix}tttplay <1-9> — Place your mark\n` +
            `┃❍ ${prefix}tttend — End the game\n` +
            `┃\n` +
            `┃ *🎯 Quick Games*\n` +
            `┃❍ ${prefix}joke — Random joke\n` +
            `┃❍ ${prefix}fact — Random fact\n` +
            `┃❍ ${prefix}quote — Motivational quote\n` +
            `┃❍ ${prefix}8ball <question> — Magic 8 ball\n` +
            `┃❍ ${prefix}coinflip — Flip a coin\n` +
            `┃❍ ${prefix}roll — Roll a single dice\n` +
            `┃❍ ${prefix}truth — Truth question\n` +
            `┃❍ ${prefix}dare — Dare challenge\n` +
            `┃❍ ${prefix}ship @user — Love meter\n` +
            `┃❍ ${prefix}trivia — Trivia question\n` +
            `┃❍ ${prefix}answer <ans> — Answer trivia\n` +
            `┃\n` +
            `╰══════════════════⊷`
        )
    }

    // ── JOKE ────────────────────────────────────────────────────────────
    if (command === 'joke') {
        return reply(`😂 *Joke:*\n\n${pick(JOKES)}`)
    }

    // ── FACT ────────────────────────────────────────────────────────────
    if (command === 'fact') {
        return reply(`🤯 *Random Fact:*\n\n${pick(FACTS)}`)
    }

    // ── QUOTE ───────────────────────────────────────────────────────────
    if (command === 'quote') {
        return reply(`✨ *Quote of the Moment:*\n\n${pick(QUOTES)}`)
    }

    // ── 8 BALL ──────────────────────────────────────────────────────────
    if (command === '8ball') {
        if (!text) return reply(`❌ Usage: ${prefix}8ball <your question>`)
        const answers = [
            '✅ It is certain.', '✅ Without a doubt.', '✅ Yes, definitely!', '✅ You may rely on it.',
            '✅ As I see it, yes.', '🤔 Reply hazy, try again.', '🤔 Ask again later.',
            '🤔 Better not tell you now.', '❌ Don\'t count on it.', '❌ Very doubtful.',
            '❌ My sources say no.', '❌ Outlook not so good.', '❌ Most likely not.'
        ]
        return reply(`🎱 *8 Ball*\n\n❓ ${text}\n\n${pick(answers)}`)
    }

    // ── COIN FLIP ────────────────────────────────────────────────────────
    if (['coinflip', 'coin', 'flipcoin'].includes(command)) {
        const result = Math.random() < 0.5 ? '🪙 *HEADS*' : '🪙 *TAILS*'
        return reply(`🪙 Flipping coin...\n\nResult: ${result}`)
    }

    // ── ROLL (single dice) ───────────────────────────────────────────────
    if (['roll', 'rolldice', 'rolladice'].includes(command)) {
        const n = rollDice()
        return reply(`🎲 You rolled: *${n}* ${diceEmoji(n)}`)
    }

    // ── TRUTH ───────────────────────────────────────────────────────────
    if (command === 'truth') {
        return reply(`🔮 *Truth for ${senderName}:*\n\n${pick(TRUTHS)}`)
    }

    // ── DARE ────────────────────────────────────────────────────────────
    if (command === 'dare') {
        return reply(`🔥 *Dare for ${senderName}:*\n\n${pick(DARES)}`)
    }

    // ── SHIP ────────────────────────────────────────────────────────────
    if (['ship', 'lovemeter', 'crush'].includes(command)) {
        const target = m.msg?.contextInfo?.mentionedJid?.[0]
        const targetName = target ? `@${target.split('@')[0]}` : (text || 'their crush')
        const pct = Math.floor(Math.random() * 101)
        const bar = '❤️'.repeat(Math.floor(pct / 10)) + '🖤'.repeat(10 - Math.floor(pct / 10))
        const label = pct >= 80 ? '💘 Soulmates!' : pct >= 60 ? '💕 Strong connection!' : pct >= 40 ? '💛 Good potential.' : pct >= 20 ? '💙 Friends for now.' : '💔 Maybe not.'
        return reply(`💘 *Love Meter*\n\n@${senderNum} + ${targetName}\n\n${bar}\n*${pct}%* — ${label}`)
    }

    // ── TRIVIA ──────────────────────────────────────────────────────────
    if (command === 'trivia') {
        const q = pick(TRIVIA)
        triviaQ.set(chat, { answer: q.a, timer: setTimeout(() => {
            triviaQ.delete(chat)
            conn.sendMessage(chat, { text: `⏰ Time's up! The answer was: *${q.a}*` }).catch(() => {})
        }, 30000) })
        return reply(`🎯 *TRIVIA*\n\n${q.q}\n\n⏱️ You have 30 seconds! Use: ${prefix}answer <your answer>`)
    }

    // ── ANSWER TRIVIA ────────────────────────────────────────────────────
    if (command === 'answer') {
        const q = triviaQ.get(chat)
        if (!q) return reply(`❌ No active trivia question. Use ${prefix}trivia to start one.`)
        if (!text) return reply(`❌ Usage: ${prefix}answer <your answer>`)
        clearTimeout(q.timer)
        triviaQ.delete(chat)
        const correct = text.trim().toLowerCase() === q.answer.toLowerCase()
        return reply(correct
            ? `🎉 *Correct!* Well done @${senderNum}! The answer was *${q.answer}*.`
            : `❌ *Wrong!* The correct answer was: *${q.answer}*`)
    }

    // ── DICE GAME START ──────────────────────────────────────────────────
    if (command === 'dice') {
        const existing = diceGames.get(chat)
        if (existing?.status === 'active') return reply(`❌ A dice game is already running! Use ${prefix}diceroll to roll or ${prefix}diceend to end it.`)
        const game = { players: new Map(), status: 'joining', host: sender, round: 0, maxRounds: 3 }
        game.players.set(sender, { name: senderName, scores: [], total: 0 })
        diceGames.set(chat, game)
        return reply(
            `🎲 *Dice Game Started!*\n\n` +
            `Host: @${senderNum}\n` +
            `Players: 1 (need at least 2)\n\n` +
            `Others join with: ${prefix}dicejoin\n` +
            `Host starts with: ${prefix}diceroll`
        )
    }

    // ── DICE JOIN ────────────────────────────────────────────────────────
    if (command === 'dicejoin') {
        const game = diceGames.get(chat)
        if (!game) return reply(`❌ No dice game running. Start one with ${prefix}dice`)
        if (game.status !== 'joining') return reply(`❌ Game already started! Wait for next round.`)
        if (game.players.has(sender)) return reply(`❌ You already joined!`)
        game.players.set(sender, { name: senderName, scores: [], total: 0 })
        return reply(`✅ @${senderNum} joined the game!\nPlayers: ${game.players.size}\nStart rolling with: ${prefix}diceroll`)
    }

    // ── DICE ROLL ────────────────────────────────────────────────────────
    if (['diceroll', 'roll-dice'].includes(command)) {
        const game = diceGames.get(chat)
        if (!game) return reply(`❌ No dice game running. Start one with ${prefix}dice`)
        if (!game.players.has(sender)) return reply(`❌ You're not in this game! Join with ${prefix}dicejoin`)
        if (game.players.size < 2) return reply(`❌ Need at least 2 players! Wait for others to join with ${prefix}dicejoin`)

        game.status = 'active'
        const player = game.players.get(sender)
        const n1 = rollDice(), n2 = rollDice()
        const total = n1 + n2
        player.scores.push(total)
        player.total += total

        let msg = `🎲 @${senderNum} rolled:\n${diceEmoji(n1)} ${diceEmoji(n2)} = *${total}*`

        // Check if all players have rolled this round
        const allRolled = [...game.players.values()].every(p => p.scores.length === player.scores.length)
        if (allRolled) {
            game.round++
            const leaderboard = [...game.players.entries()]
                .sort(([,a],[,b]) => b.total - a.total)
                .map(([jid, p], i) => `${i+1}. @${jid.split('@')[0]} — *${p.total} pts*`)
                .join('\n')

            if (game.round >= game.maxRounds) {
                const winner = [...game.players.entries()].sort(([,a],[,b]) => b.total - a.total)[0]
                diceGames.delete(chat)
                msg += `\n\n🏆 *GAME OVER!*\nWinner: @${winner[0].split('@')[0]} with *${winner[1].total} pts*!\n\n*Final Scores:*\n${leaderboard}`
            } else {
                msg += `\n\n📊 *Round ${game.round}/${game.maxRounds} complete!*\n${leaderboard}`
            }
        }

        return conn.sendMessage(chat, {
            text: msg,
            mentions: [...game.players.keys()]
        }, { quoted: m })
    }

    // ── DICE vs AI ───────────────────────────────────────────────────────
    if (command === 'diceai') {
        const p1 = rollDice(), p2 = rollDice()
        const a1 = rollDice(), a2 = rollDice()
        const pTotal = p1 + p2
        const aTotal = a1 + a2
        const win = pTotal > aTotal ? '🎉 *You win!*' : pTotal < aTotal ? '🤖 *Bera AI wins!*' : '🤝 *It\'s a tie!*'
        return reply(
            `🎲 *Dice vs Bera AI*\n\n` +
            `👤 You: ${diceEmoji(p1)} ${diceEmoji(p2)} = *${pTotal}*\n` +
            `🤖 Bera AI: ${diceEmoji(a1)} ${diceEmoji(a2)} = *${aTotal}*\n\n` +
            `${win}`
        )
    }

    // ── DICE END ─────────────────────────────────────────────────────────
    if (command === 'diceend') {
        const game = diceGames.get(chat)
        if (!game) return reply(`❌ No dice game running.`)
        if (game.host !== sender && !isOwner) return reply(`⛔ Only the game host or owner can end the game.`)
        diceGames.delete(chat)
        return reply(`🎲 Dice game ended.`)
    }

    // ── TIC TAC TOE ──────────────────────────────────────────────────────
    if (['ttt', 'tictactoe'].includes(command)) {
        if (tttGames.has(chat)) return reply(`❌ A TicTacToe game is already running! Use ${prefix}tttend to end it.`)
        const target = m.msg?.contextInfo?.mentionedJid?.[0]
        if (!target) return reply(`❌ Mention someone to challenge!\nUsage: ${prefix}ttt @user`)
        if (target === sender) return reply(`❌ You can't play against yourself!`)
        const game = { board: tttBoard(), players: [sender, target], turn: 0, symbols: { [sender]: '❌', [target]: '⭕' } }
        tttGames.set(chat, game)
        return conn.sendMessage(chat, {
            text:
                `🎮 *TicTacToe!*\n\n` +
                `❌ @${sender.split('@')[0]} vs ⭕ @${target.split('@')[0]}\n\n` +
                `${renderBoard(game.board)}\n\n` +
                `It's @${sender.split('@')[0]}'s turn (❌)!\n` +
                `Use: ${prefix}tttplay <1-9>`,
            mentions: [sender, target]
        }, { quoted: m })
    }

    // ── TTT PLAY ─────────────────────────────────────────────────────────
    if (['tttplay', 'tttp', 'tplay'].includes(command)) {
        const game = tttGames.get(chat)
        if (!game) return reply(`❌ No TicTacToe game running. Start one with ${prefix}ttt @user`)
        const currentPlayer = game.players[game.turn % 2]
        if (sender !== currentPlayer) return reply(`⛔ It's not your turn!`)
        const pos = parseInt(text?.trim()) - 1
        if (isNaN(pos) || pos < 0 || pos > 8) return reply(`❌ Choose a position 1-9`)
        if (game.board[pos] !== ' ') return reply(`❌ That position is already taken!`)

        game.board[pos] = game.symbols[sender]
        const sym = game.symbols[sender]

        if (checkWin(game.board, sym)) {
            tttGames.delete(chat)
            return conn.sendMessage(chat, {
                text: `${renderBoard(game.board)}\n\n🏆 @${sender.split('@')[0]} wins! Congratulations! 🎉`,
                mentions: game.players
            }, { quoted: m })
        }
        if (checkDraw(game.board)) {
            tttGames.delete(chat)
            return conn.sendMessage(chat, {
                text: `${renderBoard(game.board)}\n\n🤝 It's a draw! Good game!`,
                mentions: game.players
            }, { quoted: m })
        }

        game.turn++
        const next = game.players[game.turn % 2]
        return conn.sendMessage(chat, {
            text: `${renderBoard(game.board)}\n\nNow it's @${next.split('@')[0]}'s turn (${game.symbols[next]})!\nUse: ${prefix}tttplay <1-9>`,
            mentions: game.players
        }, { quoted: m })
    }

    // ── TTT END ──────────────────────────────────────────────────────────
    if (command === 'tttend') {
        const game = tttGames.get(chat)
        if (!game) return reply(`❌ No TicTacToe game running.`)
        if (!game.players.includes(sender) && !isOwner) return reply(`⛔ Only players or owner can end the game.`)
        tttGames.delete(chat)
        return reply(`🎮 TicTacToe game ended.`)
    }
}

handle.command = [
    'games',
    // Jokes/facts
    'joke', 'fact', 'quote',
    // Quick games
    '8ball', 'coinflip', 'coin', 'flipcoin',
    'roll', 'rolldice', 'rolladice',
    'truth', 'dare',
    'ship', 'lovemeter', 'crush',
    'trivia', 'answer',
    // Dice game
    'dice', 'dicejoin', 'diceroll', 'roll-dice', 'diceai', 'diceend',
    // TicTacToe
    'ttt', 'tictactoe', 'tttplay', 'tttp', 'tplay', 'tttend',
]
handle.tags = ['games']

module.exports = handle
