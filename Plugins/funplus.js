// Plugins/funplus.js — Fun, Entertainment & Mini-Games
// Commands: meme, cat, dog, wyr, nhie, compliment, dadjoke, slots, rps,
//           roastme, complimentme, confession, eightball2, askbera,
//           numfact, catfact, dogfact, uselessfact, shower,
//           horoscope, bmi, age, zodiac

const axios = require('axios')

const handle = {}
handle.command = [
    'meme', 'randommeme', 'getmeme',
    'cat', 'catpic', 'kitty',
    'dog', 'dogpic', 'puppy', 'doggo',
    'wyr', 'wouldyourather',
    'nhie', 'neverhaveieve',
    'compliment', 'praise',
    'dadjoke', 'dj',
    'slots', 'slotmachine',
    'rps', 'rockpaperscissors',
    'roastme', 'roast2',
    'confession', 'confess',
    'eightball2', '8b',
    'askbera', 'beraoracle',
    'numfact', 'numberfact',
    'catfact', 'catfacts',
    'dogfact', 'dogfacts',
    'uselessfact', 'randomfact2', 'fact2',
    'shower', 'showerthought',
    'horoscope', 'star', 'zodiac',
    'bmi', 'bodymass',
    'age', 'birthday', 'howold',
    'howmany', 'count',
    'randomnum', 'randnum',
    'randomchoice', 'choose2', 'pick',
    'toss', 'cointoss',
    'spinwheel', 'wheel',
]
handle.tags = ['fun', 'games', 'entertainment']
handle.help = [
    'meme              — Random meme',
    'cat               — Random cat picture',
    'dog               — Random dog picture',
    'wyr               — Would You Rather question',
    'nhie              — Never Have I Ever',
    'compliment        — Random compliment',
    'dadjoke           — Classic dad joke',
    'slots             — Slot machine 🎰',
    'rps <r/p/s>       — Rock Paper Scissors vs bot',
    'roastme           — Get roasted by Bera',
    'confession        — Random anonymous confession',
    'numfact <number>  — Fact about a number',
    'catfact           — Random cat fact',
    'dogfact           — Random dog fact',
    'uselessfact       — Random useless fact',
    'shower            — Shower thought',
    'horoscope <sign>  — Daily horoscope',
    'bmi <kg> <cm>     — Calculate BMI',
    'age <YYYY-MM-DD>  — How old are you?',
    'randomnum <min> <max> — Random number',
    'randomchoice a,b,c   — Pick randomly from list',
    'spinwheel a,b,c,d    — Spin a wheel!',
]

// WYR questions
const WYR = [
    ['fly anywhere instantly','teleport to the future by 1 year'],
    ['be invisible for a day','be able to read minds for a day'],
    ['have unlimited money but no friends','have amazing friends but be broke'],
    ['know how you die','know when you die'],
    ['give up social media forever','give up Netflix/YouTube forever'],
    ['always be 10 minutes late','always be 20 minutes early'],
    ['speak every language','play every instrument'],
    ['have free Wi-Fi everywhere','have free food everywhere'],
    ['live 200 years at average quality of life','live 50 years at the best quality of life'],
    ['always have to whisper','always have to shout'],
    ['be able to fly but only 1 meter off the ground','be able to run at 100 km/h'],
    ['fight 1 horse-sized duck','fight 100 duck-sized horses'],
    ['wake up every day with a new random skill','keep one skill but master it completely'],
    ['never be cold','never be hot'],
    ['have a photographic memory','be able to learn any skill in 24 hours'],
]

// NHIE questions
const NHIE = [
    'Never have I ever... gone skydiving.',
    'Never have I ever... lied to get out of trouble.',
    'Never have I ever... stayed awake for 24+ hours.',
    'Never have I ever... eaten alone in a restaurant.',
    'Never have I ever... pretended to be sick to skip school/work.',
    'Never have I ever... Google-searched myself.',
    'Never have I ever... talked to myself out loud.',
    'Never have I ever... binge-watched a whole show in one day.',
    'Never have I ever... forgotten someone\'s name mid-conversation.',
    'Never have I ever... accidentally texted the wrong person.',
    'Never have I ever... stalked an ex on social media.',
    'Never have I ever... sung in the shower.',
    'Never have I ever... read someone\'s texts without them knowing.',
    'Never have I ever... pretended to laugh when I didn\'t find something funny.',
    'Never have I ever... paid for something with only coins.',
]

// Compliments
const COMPLIMENTS = [
    'You have the energy of a sunrise and the calm of sunset. ✨',
    'Your smile could light up a stadium. 😊',
    'You make the world a better place just by being in it.',
    'You\'re the kind of person everyone needs in their life. 💫',
    'Your passion is contagious — it inspires everyone around you.',
    'You have a rare gift: you actually listen when people talk. 🎁',
    'Everything you touch turns into something great.',
    'You\'re not just smart — you\'re wise. There\'s a difference. 🧠',
    'The world is genuinely a brighter place with you in it. 🌟',
    'You have excellent taste. In everything.',
]

// Dad jokes
const DADJOKES = [
    'Why don\'t eggs tell jokes? Because they\'d crack up! 🥚',
    'I\'m reading a book about anti-gravity. It\'s impossible to put down.',
    'Did you hear about the mathematician who\'s afraid of negative numbers? He\'ll stop at nothing to avoid them.',
    'Why can\'t you give Elsa a balloon? Because she\'ll let it go. ❄️',
    'I used to hate facial hair but then it grew on me.',
    'What do you call a fake noodle? An impasta! 🍝',
    'Why did the scarecrow win an award? Because he was outstanding in his field.',
    'I\'m on a seafood diet. I see food and I eat it. 🍔',
    'Why don\'t scientists trust atoms? Because they make up everything!',
    'What did the ocean say to the beach? Nothing, it just waved. 🌊',
    'I told my wife she was drawing her eyebrows too high. She looked surprised.',
    'What do you call a bear with no teeth? A gummy bear! 🐻',
    'Why can\'t a bicycle stand on its own? Because it\'s two-tired.',
    'What do you call cheese that isn\'t yours? Nacho cheese! 🧀',
    'Why did the math book look so sad? Because it had too many problems.',
]

// Slot symbols
const SLOT_SYMBOLS = ['🍒','💎','🍋','⭐','🔔','🍀','💰','7️⃣']
const SLOT_NAMES   = {'🍒':'Cherry','💎':'Diamond','🍋':'Lemon','⭐':'Star','🔔':'Bell','🍀':'Clover','💰':'Money Bag','7️⃣':'Lucky 7'}

// Shower thoughts
const SHOWER = [
    'If you\'re waiting for the waiter, doesn\'t that make you the waiter?',
    'The ocean is just a soup made of living things, salt, and trash.',
    'When you\'re born, you\'re the youngest you\'ll ever be.',
    'A "parking lot" should actually be called a "car cemetery".',
    'We never actually see our own faces — only reflections and photos.',
    'Every building you\'ve ever walked into, someone had to be the first person to enter.',
    'The first person to hear music through earbuds in public must have looked insane.',
    'Your skeleton has been inside someone else your entire life.',
    'If you Google "I am bored", Google knows you\'re bored.',
    'The word "bed" actually looks like a bed. 🛏️',
]

// Zodiac signs
const ZODIAC = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces']

handle.all = async (m, { conn, command, args, prefix, reply, sender } = {}) => {
    const chat = m.chat || m.key?.remoteJid
    const text = args.join(' ').trim()

    // ── MEME ─────────────────────────────────────────────────────────────────
    if (['meme','randommeme','getmeme'].includes(command)) {
        try {
            await reply('⏳ Fetching meme...')
            const subs = ['memes','dankmemes','me_irl','AdviceAnimals','funny']
            const sub  = subs[Math.floor(Math.random() * subs.length)]
            const res  = await axios.get('https://meme-api.com/gimme/' + sub, { timeout: 8000 })
            const data = res.data
            if (!data?.url) return reply('❌ No meme found. Try again!')
            await conn.sendMessage(chat, {
                image:   { url: data.url },
                caption: '😂 *' + (data.title || 'Random Meme') + '*\n\n' +
                         '👆 r/' + sub + ' • ⬆️ ' + (data.ups || 0) + ' upvotes'
            }, { quoted: m })
        } catch {
            return reply('❌ Meme fetch failed. Try again later.')
        }
        return
    }

    // ── CAT PIC ───────────────────────────────────────────────────────────────
    if (['cat','catpic','kitty'].includes(command)) {
        try {
            const res = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 6000 })
            const url = res.data?.[0]?.url
            if (!url) return reply('❌ No cat found 🙀')
            await conn.sendMessage(chat, { image: { url }, caption: '🐱 *Here\'s your cat!*\n\n_Meow~_' }, { quoted: m })
        } catch {
            return reply('❌ Could not fetch cat image 🙀')
        }
        return
    }

    // ── DOG PIC ───────────────────────────────────────────────────────────────
    if (['dog','dogpic','puppy','doggo'].includes(command)) {
        try {
            const res = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 6000 })
            const url = res.data?.message
            if (!url) return reply('❌ No dog found 🐶')
            await conn.sendMessage(chat, { image: { url }, caption: '🐶 *Woof! Here\'s your dog!*\n\n_Good boy!_' }, { quoted: m })
        } catch {
            return reply('❌ Could not fetch dog image 🐶')
        }
        return
    }

    // ── WYR — Would You Rather ────────────────────────────────────────────────
    if (['wyr','wouldyourather'].includes(command)) {
        const q = WYR[Math.floor(Math.random() * WYR.length)]
        return reply(
            '╭══〘 *🤔 Would You Rather?* 〙═⊷\n' +
            '┃\n' +
            '┃ *A)* ' + q[0] + '\n' +
            '┃         —— OR ——\n' +
            '┃ *B)* ' + q[1] + '\n' +
            '┃\n' +
            '┃ Reply *A* or *B*!\n' +
            '╰══════════════════⊷'
        )
    }

    // ── NHIE — Never Have I Ever ──────────────────────────────────────────────
    if (['nhie','neverhaveieve'].includes(command)) {
        const q = NHIE[Math.floor(Math.random() * NHIE.length)]
        return reply(
            '╭══〘 *🙋 Never Have I Ever* 〙═⊷\n' +
            '┃\n' +
            '┃ ' + q + '\n' +
            '┃\n' +
            '┃ 🖐️ If you HAVE, reply "I have!"\n' +
            '┃ ✌️ If you haven\'t, stay silent!\n' +
            '╰══════════════════⊷'
        )
    }

    // ── COMPLIMENT ────────────────────────────────────────────────────────────
    if (['compliment','praise'].includes(command)) {
        const c = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)]
        const target = m.mentionedJid?.[0] || sender
        await conn.sendMessage(chat, {
            text:     '💌 @' + target.split('@')[0] + ', ' + c,
            mentions: [target]
        })
        return
    }

    // ── DAD JOKE ─────────────────────────────────────────────────────────────
    if (['dadjoke','dj'].includes(command)) {
        try {
            const res = await axios.get('https://icanhazdadjoke.com/', {
                headers: { Accept: 'application/json' }, timeout: 5000
            })
            const joke = res.data?.joke || DADJOKES[Math.floor(Math.random() * DADJOKES.length)]
            return reply('😂 *Dad Joke:*\n\n' + joke)
        } catch {
            return reply('😂 *Dad Joke:*\n\n' + DADJOKES[Math.floor(Math.random() * DADJOKES.length)])
        }
    }

    // ── SLOTS 🎰 ──────────────────────────────────────────────────────────────
    if (['slots','slotmachine'].includes(command)) {
        await conn.sendMessage(chat, { react: { text: '🎰', key: m.key } }).catch(() => {})
        await new Promise(r => setTimeout(r, 1000))
        const reel = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]
        const s    = [reel(), reel(), reel()]
        const win  = s[0] === s[1] && s[1] === s[2]
        const two  = s[0] === s[1] || s[1] === s[2] || s[0] === s[2]
        let result, prize

        if (win) {
            result = '🎉 *JACKPOT!!!* 🎉'
            prize  = SLOT_NAMES[s[0]] === 'Lucky 7' ? 'MEGA WIN — 777!' : 'TRIPLE ' + (SLOT_NAMES[s[0]] || '').toUpperCase() + '!'
            await conn.sendMessage(chat, { react: { text: '🎊', key: m.key } }).catch(() => {})
        } else if (two) {
            result = '😏 *Almost!* Two in a row!'
            prize  = 'So close... try again!'
        } else {
            result = '😢 *No match.* Try again!'
            prize  = 'Better luck next time!'
        }

        return reply(
            '╭══〘 *🎰 Slot Machine* 〙═⊷\n' +
            '┃\n' +
            '┃ ┌─────────────────┐\n' +
            '┃ │  ' + s[0] + '  ' + s[1] + '  ' + s[2] + '  │\n' +
            '┃ └─────────────────┘\n' +
            '┃\n' +
            '┃ ' + result + '\n' +
            '┃ ' + prize + '\n' +
            '╰══════════════════⊷'
        )
    }

    // ── ROCK PAPER SCISSORS ───────────────────────────────────────────────────
    if (['rps','rockpaperscissors'].includes(command)) {
        const choices = { r: '🪨 Rock', p: '📄 Paper', s: '✂️ Scissors' }
        const wins    = { r: 's', p: 'r', s: 'p' }
        const choice  = args[0]?.toLowerCase()
        if (!choice || !choices[choice]) return reply('❌ Usage: ' + prefix + 'rps <r/p/s>\n\nOptions:\n*r* = Rock 🪨\n*p* = Paper 📄\n*s* = Scissors ✂️')

        const botPick = Object.keys(choices)[Math.floor(Math.random() * 3)]
        let verdict

        if (choice === botPick)         verdict = "🤝 *It's a tie!*"
        else if (wins[choice] === botPick) verdict = "🎉 *You win!*"
        else                            verdict = "🤖 *Bot wins!*"

        return reply(
            '╭══〘 *🪨📄✂️ Rock Paper Scissors* 〙═⊷\n' +
            '┃ You:   ' + choices[choice] + '\n' +
            '┃ Bot:   ' + choices[botPick] + '\n' +
            '┃\n' +
            '┃ ' + verdict + '\n' +
            '╰══════════════════⊷'
        )
    }

    // ── ROAST ME ─────────────────────────────────────────────────────────────
    if (['roastme','roast2'].includes(command)) {
        const target = m.mentionedJid?.[0] || sender
        const roasts = [
            'I\'d roast you, but my mom said I\'m not allowed to burn trash. 🗑️',
            'You\'re the human equivalent of a participation trophy. 🏆',
            'You\'re not stupid — you just have bad luck thinking.',
            'Your WiFi password is stronger than your personality.',
            'I\'d say you\'re funny but looks aren\'t everything.',
            'You have the charisma of a damp sock.',
            'If brains were petrol, you couldn\'t power a fly\'s scooter.',
        ]
        const roast = roasts[Math.floor(Math.random() * roasts.length)]
        await conn.sendMessage(chat, { text: '🔥 @' + target.split('@')[0] + ', ' + roast, mentions: [target] })
        return
    }

    // ── CATFACT ──────────────────────────────────────────────────────────────
    if (['catfact','catfacts'].includes(command)) {
        try {
            const res = await axios.get('https://catfact.ninja/fact', { timeout: 5000 })
            return reply('🐱 *Cat Fact:*\n\n' + res.data.fact)
        } catch {
            return reply('🐱 *Cat Fact:*\n\nCats can rotate their ears 180 degrees. 😮')
        }
    }

    // ── DOGFACT ──────────────────────────────────────────────────────────────
    if (['dogfact','dogfacts'].includes(command)) {
        try {
            const res = await axios.get('https://dogapi.dog/api/v2/facts', { timeout: 5000 })
            const fact = res.data?.data?.[0]?.attributes?.body || 'Dogs can understand up to 250 words and gestures.'
            return reply('🐶 *Dog Fact:*\n\n' + fact)
        } catch {
            return reply('🐶 *Dog Fact:*\n\nDogs can smell 40x better than humans. 👃')
        }
    }

    // ── USELESS FACT ─────────────────────────────────────────────────────────
    if (['uselessfact','randomfact2','fact2'].includes(command)) {
        try {
            const res = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random', { timeout: 5000 })
            return reply('🤓 *Useless Fact:*\n\n' + res.data.text)
        } catch {
            return reply('🤓 *Useless Fact:*\n\nHumans share 50% of their DNA with bananas. 🍌')
        }
    }

    // ── SHOWER THOUGHT ────────────────────────────────────────────────────────
    if (['shower','showerthought'].includes(command)) {
        return reply('🚿 *Shower Thought:*\n\n' + SHOWER[Math.floor(Math.random() * SHOWER.length)])
    }

    // ── NUMBER FACT ───────────────────────────────────────────────────────────
    if (['numfact','numberfact'].includes(command)) {
        const num = parseInt(args[0]) || Math.floor(Math.random() * 1000)
        try {
            const res = await axios.get('http://numbersapi.com/' + num + '/trivia', { timeout: 5000 })
            return reply('🔢 *Number Fact: ' + num + '*\n\n' + res.data)
        } catch {
            return reply('🔢 *' + num + '*\n\nIs an interesting number!')
        }
    }

    // ── HOROSCOPE ────────────────────────────────────────────────────────────
    if (['horoscope','star','zodiac'].includes(command)) {
        const sign = args[0]?.toLowerCase()
        if (!sign || !ZODIAC.includes(sign)) return reply('❌ Usage: ' + prefix + 'horoscope <sign>\n\nSigns: ' + ZODIAC.join(', '))
        const msgs = [
            'Today is an excellent day for new beginnings. Trust your instincts.',
            'Financial opportunities may arise. Keep your eyes open.',
            'A meaningful conversation with someone close will change your perspective.',
            'Take time for self-care today. Your energy needs recharging.',
            'An old friend may reach out. Reconnect with your roots.',
            'Your creativity is at its peak. Channel it into something amazing.',
        ]
        const emojis = { aries:'♈',taurus:'♉',gemini:'♊',cancer:'♋',leo:'♌',virgo:'♍',libra:'♎',scorpio:'♏',sagittarius:'♐',capricorn:'♑',aquarius:'♒',pisces:'♓' }
        const msg = msgs[Math.floor(Math.random() * msgs.length)]
        return reply(
            '╭══〘 *' + emojis[sign] + ' ' + sign.charAt(0).toUpperCase() + sign.slice(1) + ' Horoscope* 〙═⊷\n' +
            '┃\n' +
            '┃ ' + msg + '\n' +
            '┃\n' +
            '┃ 📅 Today: ' + new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}) + '\n' +
            '╰══════════════════⊷'
        )
    }

    // ── BMI CALCULATOR ────────────────────────────────────────────────────────
    if (['bmi','bodymass'].includes(command)) {
        const kg = parseFloat(args[0])
        const cm = parseFloat(args[1])
        if (isNaN(kg) || isNaN(cm)) return reply('❌ Usage: ' + prefix + 'bmi <weight kg> <height cm>\n\nExample: ' + prefix + 'bmi 70 175')
        const bmi = (kg / Math.pow(cm/100, 2)).toFixed(1)
        let cat = bmi < 18.5 ? '⚠️ Underweight' : bmi < 25 ? '✅ Normal' : bmi < 30 ? '⚠️ Overweight' : '🔴 Obese'
        return reply('╭══〘 *⚖️ BMI Calculator* 〙═⊷\n┃ Weight: ' + kg + ' kg\n┃ Height: ' + cm + ' cm\n┃\n┃ BMI: *' + bmi + '*\n┃ Status: *' + cat + '*\n╰══════════════════⊷')
    }

    // ── AGE CALCULATOR ────────────────────────────────────────────────────────
    if (['age','birthday','howold'].includes(command)) {
        if (!args[0]) return reply('❌ Usage: ' + prefix + 'age YYYY-MM-DD\n\nExample: ' + prefix + 'age 2000-01-15')
        const bd   = new Date(args[0])
        if (isNaN(bd)) return reply('❌ Invalid date. Format: YYYY-MM-DD')
        const now  = new Date()
        const diff = now - bd
        const yrs  = Math.floor(diff / (365.25 * 24 * 3600 * 1000))
        const days = Math.floor(diff / (24 * 3600 * 1000))
        const next = new Date(bd.setFullYear(now.getFullYear() + (new Date(bd.setFullYear(now.getFullYear())) < now ? 1 : 0)))
        const daysLeft = Math.ceil((next - now) / (24 * 3600 * 1000))
        return reply('╭══〘 *🎂 Age Calculator* 〙═⊷\n┃ Age: *' + yrs + ' years*\n┃ Days alive: *' + days.toLocaleString() + '*\n┃ Next birthday: *' + daysLeft + ' days*\n╰══════════════════⊷')
    }

    // ── RANDOM NUMBER ─────────────────────────────────────────────────────────
    if (['randomnum','randnum'].includes(command)) {
        const min = parseInt(args[0]) || 1
        const max = parseInt(args[1]) || 100
        if (min >= max) return reply('❌ Min must be less than max. Example: ' + prefix + 'randomnum 1 100')
        return reply('🎲 Random number between *' + min + '* and *' + max + '*:\n\n*' + (Math.floor(Math.random() * (max - min + 1)) + min) + '*')
    }

    // ── RANDOM CHOICE ─────────────────────────────────────────────────────────
    if (['randomchoice','choose2','pick'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + 'pick option1, option2, option3\n\nExample: ' + prefix + 'pick Pizza, Burger, Sushi')
        const opts = text.split(/[,|\/]/).map(o => o.trim()).filter(Boolean)
        if (opts.length < 2) return reply('❌ Provide at least 2 options, separated by commas.')
        const chosen = opts[Math.floor(Math.random() * opts.length)]
        return reply('╭══〘 *🎯 Random Choice* 〙═⊷\n┃ Options: ' + opts.join(' • ') + '\n┃\n┃ 🎉 Winner: *' + chosen + '*\n╰══════════════════⊷')
    }

    // ── SPIN WHEEL ────────────────────────────────────────────────────────────
    if (['spinwheel','wheel'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + 'spinwheel option1, option2, option3')
        const opts = text.split(/[,|\/]/).map(o => o.trim()).filter(Boolean)
        if (opts.length < 2) return reply('❌ Provide at least 2 options.')
        await conn.sendMessage(chat, { react: { text: '🎡', key: m.key } }).catch(() => {})
        await new Promise(r => setTimeout(r, 1500))
        const chosen = opts[Math.floor(Math.random() * opts.length)]
        const wheel  = opts.map((o,i) => (o === chosen ? '→ *' + o + '* ← 🎯' : '  ' + o)).join('\n┃ ')
        return reply('╭══〘 *🎡 Spin the Wheel!* 〙═⊷\n┃ ' + wheel + '\n┃\n┃ 🎉 *' + chosen + '* wins!\n╰══════════════════⊷')
    }

    // ── COIN TOSS ─────────────────────────────────────────────────────────────
    if (['toss','cointoss'].includes(command)) {
        const result = Math.random() < 0.5 ? '🪙 *Heads!*' : '🪙 *Tails!*'
        await conn.sendMessage(chat, { react: { text: '🪙', key: m.key } }).catch(() => {})
        await new Promise(r => setTimeout(r, 800))
        return reply('╭══〘 *🪙 Coin Toss* 〙═⊷\n┃\n┃ ' + result + '\n┃\n╰══════════════════⊷')
    }

    // ── CONFESSION ────────────────────────────────────────────────────────────
    if (['confession','confess'].includes(command)) {
        const confessions = [
            'I still use Internet Explorer sometimes. Don\'t judge me.',
            'I reply "lol" to messages I don\'t actually find funny.',
            'I\'ve been pronouncing "GIF" wrong for years.',
            'I still don\'t fully understand how taxes work.',
            'I\'ve cancelled plans and then watched Netflix alone. Worth it.',
            'I\'ve Googled symptoms and convinced myself I was dying.',
            'I pretend my phone is dead to avoid calling people.',
        ]
        return reply('🙈 *Anonymous Confession:*\n\n_"' + confessions[Math.floor(Math.random() * confessions.length)] + '"_')
    }
}

module.exports = handle
