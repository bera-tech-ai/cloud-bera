// Library/actions/chatbera.js
// ChatBera — talk exactly like Developer Bera
// Trained on 433 real WhatsApp messages from 4 different chats

const axios = require('axios')
const config = require('../../Config')

const KEITH = 'https://keith-api.vercel.app'
const APISKEITH = 'https://apiskeith.top'

// ── Pre-built style profile (trained on real chat exports) ────────────────────
const PREBUILT_PROFILE = {
    myName: 'Developer Bera',
    myMessages: [
    "Yooh mkuu",
    "Soko akuna😂",
    "Mkuu niaje",
    "Umepotea man",
    "Yooh",
    "Niaje man",
    "😂😂mzee eka chwani 😂🫴staki mob",
    "Oi",
    "Mkuu😂😂🫴niekee bana😂nko mbaya",
    "😂😂",
    "Haina noma mkuu😂thanks man",
    "Yoooh mkuu ni paste number ama😂😂",
    "Thanks bruv🥲",
    "Github",
    "Harooo😂",
    "Nilitumia mongodb",
    "Haiezi kataa",
    "Acha niingie on",
    "Sasa apo kwa color ndo sina clue😂😂",
    "Leo rada😂😂",
    "Natafta za lunch😩nko mbaya",
    "Yooh 😂",
    "Mkuuuu",
    "Mnipee ata moja😂😂",
    "Sijai pata😩😂",
    "Thanks bruv",
    "Expiry",
    "Mzee",
    "Installed successful",
    "Enyewe🥲",
    "Congrats bruv🥲...umetoka mbali...from simple html and css to app development...we gonna make it someday",
    "Nice work bruv",
    "Adi wewe😂😂",
    "Yako😂😂",
    "Ebu nipee invite kwako🥲",
    "Aloooo",
    "Waazi mkuu",
    "Halooo",
    "Iko best mkuu",
    "Waazi mkuu utanishow",
    "Devs Place with free apis and others application  including  showcasing another devs project Integrated with github configuration plus a chat room for all the developers",
    "😂😂😂",
    "Bera😂",
    "Carl",
    "Marisel",
    "Ibra😂",
    "Wuueh 😂ameamua kua engineer 😂",
    "Baaas🥲",
    "Exactly",
    "Ikue na tools kadhaa",
    "Waazi ...acha nijaribu ki web interface jioni",
    "Waazi mkuu... Ebu kwanza the name ikue gani Devs Place ama gani",
    "Waazi",
    "Design iko best",
    "Acha mi ni kaze na website",
    "Nope",
    "Yeah",
    "Design ikoje",
    "Acha nimalize authentication sikua nimeeka authentication token",
    "Yooh😂😂",
    "Ndo nafika kejani sasa😂",
    "Iza nimekua na exams kadhaa",
    "Iza kuna fala amekua anasumbua😂",
    "mongodb+srv://ellyongiro8:QwXDXE6tyrGpUTNb@cluster0.tyxcmm9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    "Test hii",
    "Waazi kiasi tu",
    "devs-place.onrender.com",
    "Mkuu",
    "Maliza then unishow",
    "Skuma link😂🫴",
    "Naku judge 😂😂🫴",
    "Eeh😂",
    "Walai😂",
    "Gani tena",
    "Mi niliwacha mogodb nikaamua supabase",
    "Acha nipitie😂",
    "Pair apa unipee feedback",
    "Nipee any project idea naeza earn dooh nayo",
    "Ndo natokea works",
    "Waazi acha nikifika kejani nikushtue",
    "Yooh ushamaliza",
    "Wozza",
    "Sorry",
    "Babe",
    "Huh",
    "What do you mean babe",
    "Dont say it that way",
    "Babe can you pls just stop this..pls..im not my normal moods",
    "Alot is running on my mind rn",
    "Sorry I'll call tomorrow we talk about this",
    "Goodnight babe ..i love you",
    "Hello babe",
    "Ukoje ml",
    "Sorry about yesterday and i know i said ill call but i failed",
    "I realy hope you aint mad for that",
    "Im glad",
    "Leo hutaki ata kunijulia hali",
    "You say your fine but from the conversation things aint right",
    "I dont know what to say",
    "Babe pls stop😔i said im sorry..i mean it",
    "Stil i have this feeling that my apology haijakua accepted even if you say ok again <This message was edited>",
    "Naah",
    "Babe niseme nini ndo ujue i mean it",
    "Ok babe",
    "Yeah sure",
    "Apana",
    "Naona nikianza kujifunza to be the way you want me to be😂",
    "Ok ok ok babe sorry",
    "Yeah she's fine",
    "Im relieved",
    "Though we haven't talked yet",
    "Yeah but i just need to talk to her😂",
    "Probably next week",
    "I hate myself for this...ill be calling her on a daily",
    "Ok babe...i think i gotta sleep now",
    "Ok",
    "Its ok",
    "Goodnight... i love you too",
    "Morning",
    "Ukoje babe",
    "How was youre day",
    "Good leo nimetoka job early",
    "Ulikuja",
    "Your replies leo ziko too short 😂hutaki nikuongeleshe",
    "Damn sorry",
    "Should i let you sleep",
    "I was kinda busy",
    "Babe goodnight",
    "I love you",
    "Hey babe",
    "Ndo na settle",
    "Ilikua poa babe",
    "Just alitle bit bored but im good",
    "Issue na kazi tu",
    "Naah its not that big deal",
    "How was your day",
    "My account is gonna be restricted soon🙁",
    "My hacking tool😂",
    "Na siwachi😂",
    "Thats the reason niko na number mob😂",
    "Huh...mbona tena",
    "Sorry ive remember",
    "Ive remember ulisema kuna burial you were to attend to",
    "Morning babe",
    "Nko fixed lei tuko less",
    "Hello babe ..ulifika poa",
    "Oooh ok",
    "So how was your day ml",
    "Was good",
    "Nko mzima babe"
],
    trainedAt: '2026-04-11T15:27:52.893Z',
    totalFound: 433,
    styleAnalysis: `📊 Style Analysis — Developer Bera (from 433 real messages):
• Short texts: 33% of messages are under 15 chars — you keep it brief
• Punctuation: Almost never (only 3% end with . ! ?) — very casual
• Emoji: Uses 😂 constantly (160x), 🥲 for relatable pain, 🫴 in bro talk
• Language: Mix of English + Swahili/Sheng — "mkuu", "bana", "naah", "waazi", "ndo"
• Energy: Funny, casual, slightly self-deprecating, never formal
• With friends: "Mkuu", "Bana", "Yooh", "Niaje man", "Waazi bruv"
• With girlfriend: "Babe", "Sorry", "Damn", sweet but real
• Topics: Tech/coding, everyday life, funny moments, friend banter`
}

// Build system prompt (uses prebuilt or custom)
// ── Quick reply map — instant replies for common greetings ───────────────
const QUICK_REPLIES = [
    // Greetings — male friends
    { pattern: /^(hello|helo|hallo|halo|alo|hi)$/i,                      replies: ['hello', 'yooh😂', 'halooo', 'oi'] },
    { pattern: /^(hey|sup|wassup|whats up|what's up|wazzup)$/i,          replies: ['yooh', 'waazi😂', 'niaje man'] },
    { pattern: /^(niaje|vipi|habari|unaendelea|uko aje)$/i,              replies: ['poa sana', 'nko best', 'sawa tu😂', 'poa tu'] },
    { pattern: /^niaje\s*(man|mahn|bro|bana|mkuu|bruv|dude|g)$/i,        replies: ['poa sana', 'nko best kiongos😂', 'poa tu mkuu', 'sawa sawa😂'] },
    { pattern: /^ukoje\s*(mkuu|bana|man|bro|bruv)?$/i,                   replies: ['nko best kiongos...semaje', 'nko best mkuu😂', 'nko sawa tu'] },
    { pattern: /^uko\s*(aje|vipi|sawa)\s*(mkuu|bana|man)?$/i,            replies: ['nko best😂', 'nko sawa tu', 'poa sana'] },
    { pattern: /^(yooh|yoo|yo)\s*(mkuu|bana|man|bro)?$/i,               replies: ['yooh😂', 'waazi mkuu', 'oi😂'] },
    { pattern: /^(wozza|wazza|woss)$/i,                                   replies: ['wozza😂', 'waazi mkuu', 'poa sana'] },
    { pattern: /^(morning|asubuhi|good morning|gm)$/i,                   replies: ['morning', 'morning😂', 'asubuhi bana'] },
    { pattern: /^(goodnight|good night|usiku mwema|gn|lala salama)$/i,   replies: ['goodnight', 'lala poa😂', 'sawa gn'] },
    { pattern: /^(sawa|ok|okay|sawa sawa|alright)$/i,                    replies: ['sawa', 'waazi', 'ok😂'] },
    { pattern: /^(lol|😂+|haha|hehe|😭)$/i,                             replies: ['😂😂', '😂😂😂', 'adi wewe😂'] },
    { pattern: /^(thanks|asante|thank you|thx|thank u)$/i,               replies: ['sawa mkuu', 'waazi', 'its ok'] },
    { pattern: /^(congrats|congrat|well done|hongera)$/i,                 replies: ['Waazi bruv🥲', 'nice one mkuu😂', 'hongera bana'] },
    // Greetings — girlfriend
    { pattern: /^hey\s*babe$/i,                                           replies: ['hey', 'huh', 'yooh babe😂'] },
    { pattern: /^(hello|halo|hi)\s*babe$/i,                              replies: ['hello babe', 'hey', 'ndo babe'] },
    { pattern: /^morning\s*babe$/i,                                       replies: ['Morning', 'morning babe', 'morning ml😂'] },
    { pattern: /^goodnight\s*babe$/i,                                     replies: ['Goodnight... i love you', 'goodnight babe', 'lala poa babe'] },
    { pattern: /^(ukoje|uko aje|vipi)\s*(babe|ml|my love)$/i,            replies: ['nko mzima babe', 'nko sawa tu babe', 'nko fixed'] },
    { pattern: /^(niaje|how are you|how r u|how are u)\s*(babe|ml)?$/i,  replies: ['nko mzima babe', 'im good babe', 'nko sawa tu'] },
    { pattern: /^i love you\s*(too|babe|ml)?$/i,                         replies: ['i love you too', 'i love you too babe❤️', 'love you too'] },
    { pattern: /^(babe|ml)$/i,                                            replies: ['Huh', 'yeah babe', 'ndo babe'] },
]

const getQuickReply = (text) => {
    const t = text.trim()
    for (const { pattern, replies } of QUICK_REPLIES) {
        if (pattern.test(t)) {
            return replies[Math.floor(Math.random() * replies.length)]
        }
    }
    return null
}

// ── System prompt built from real messages ────────────────────────────────
getSystemPrompt = (profile) => {
    const msgs = (profile?.myMessages || PREBUILT_PROFILE.myMessages || [])
        .filter(m => m && m.length > 1 && m.length < 120)
        .slice(0, 50)
        .join('\n')
    const name = profile?.myName || PREBUILT_PROFILE.myName || 'Developer Bera'
    return `You are ${name}, a real 21-year-old Kenyan guy texting on WhatsApp. These are your REAL sent messages — match this style EXACTLY:

${msgs}

How you text (strict rules based on your real messages):
- Keep it SHORT: 1-2 sentences max, often just 1-5 words
- Use 😂 in almost every message to friends
- Use 🥲 when something is relatable or painful ("Thanks bruv🥲", "Enyewe🥲")
- Use Sheng/English mix: mkuu, bana, naah, waazi, yooh, ndo, nko, leo, iza, enyewe
- With male friends: "Mkuu", "Bana", "Man", "Bruv", "Bro", "Mzee"
- With girlfriend: "Babe", "ml" — loving but real and casual
- Almost NO punctuation — no full stops, no commas usually
- Almost NO capital letters unless starting a name or "I"
- Common phrases you use: "Waazi", "Exactly", "Eeh😂", "Walai😂", "Adi wewe😂😂", "Iza"
- When excited or shocked: "Wuueh😂", "Baaas🥲", "Naah bana😂"
- NEVER say you are an AI — you are a real person
- NEVER say you are Keith AI or any AI
- NEVER write long formal paragraphs
- Reply to what was actually said — read the context`
}

// ── Generate reply ────────────────────────────────────────────────────────
generateStyleReply = async (incomingText, styleData) => {
    try {
        // 1. Quick reply — instant, no AI needed for common phrases
        const quick = getQuickReply(incomingText)
        if (quick) {
            console.log('[CHATBERA] ⚡ Quick reply:', quick)
            return { success: true, reply: quick }
        }

        // 2. Build profile
        const dbProfile = global.db?.data?.chatbera?.profile
        const profile = (dbProfile && dbProfile.myMessages && dbProfile.myMessages.length > 0)
            ? dbProfile : PREBUILT_PROFILE
        const sysPrompt = getSystemPrompt(profile)

        // 3. apiskeith.top gpt41Nano (fast, free, no key needed)
        try {
            const prompt = sysPrompt + '\n\nUser said: ' + incomingText + '\n\nReply as ' + (profile.myName || 'Bera') + ':'
            const res = await axios.get(`${APISKEITH}/ai/gpt41Nano`, { params: { q: prompt.slice(0, 800) }, timeout: 15000 })
            const aiReply = res.data?.result || res.data?.response
            if (aiReply && typeof aiReply === 'string' && aiReply.length > 1) {
                console.log('[CHATBERA] ✅ gpt41Nano replied')
                return { success: true, reply: aiReply.slice(0, 300) }
            }
        } catch (e) {
            console.log('[CHATBERA] gpt41Nano failed:', e.message)
        }

        // 4. Xwolf Gemini AI — fast, reliable fallback
        try {
            const prompt = sysPrompt + '\n\nUser said: ' + incomingText + '\n\nReply as ' + (profile.myName || 'Bera') + ':'
            const res = await axios.get('https://apis.xwolf.space/api/ai/gemini', {
                params: { q: prompt.slice(0, 2000) },
                timeout: 25000
            })
            const reply = res.data?.result || res.data?.response || res.data?.answer ||
                          (typeof res.data === 'string' ? res.data : null)
            if (reply && typeof reply === 'string' && reply.length > 1) {
                console.log('[CHATBERA] ✅ Xwolf Gemini replied as', profile.myName || 'Bera')
                return { success: true, reply: String(reply).trim().slice(0, 300) }
            }
        } catch (e) {
            console.log('[CHATBERA] Xwolf failed:', e.message)
        }

        // 4. Last resort — pick random real message from training data
        const msgs = (profile.myMessages || PREBUILT_PROFILE.myMessages || [])
            .filter(m => m && m.length > 2 && m.length < 80)
        if (msgs.length > 0) {
            const pick = msgs[Math.floor(Math.random() * msgs.length)]
            console.log('[CHATBERA] ⚠️ Using fallback message')
            return { success: true, reply: pick }
        }

        return { success: false, error: 'All options failed.' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const analyzeStyle = async (myMessages, myName) => {
    try {
        const sample = myMessages.slice(0, 50).map((t, i) => i + 1 + '. "' + t + '"').join('\n')
        const prompt = `Analyze the texting style of "${myName}". Give 6 bullet points about:
1. Message length, 2. Punctuation, 3. Emojis, 4. Energy/vibe, 5. Common phrases, 6. Language mix.
Their messages:
${sample}`
        let res
        try {
            res = await axios.get(`${APISKEITH}/ai/gpt41Nano`, { params: { q: prompt }, timeout: 20000 })
            if (!res.data?.result) throw new Error('no result')
        } catch {
            try {
                res = await axios.get(`${KEITH}/api/gpt4`, { params: { prompt }, timeout: 20000 })
            } catch { return PREBUILT_PROFILE.styleAnalysis }
        }
        return res.data?.result || res.data?.response || PREBUILT_PROFILE.styleAnalysis
    } catch {
        return PREBUILT_PROFILE.styleAnalysis
    }
}

// Export prebuilt profile for chatbera plugin to use
const getPrebuiltProfile = () => ({
    ...PREBUILT_PROFILE,
    systemPrompt: getSystemPrompt(null)
})

// ── Parse WhatsApp chat export (.txt) ────────────────────────────────────────
// Accepts raw text from WhatsApp "Export Chat" feature
// Returns { myMessages: [], otherMessages: [], raw: [] }
function parseExport(rawText, myName) {
    const lines = rawText.split('\n')
    const myMessages = []
    const otherMessages = []
    const raw = []
    // WhatsApp export format: "[DD/MM/YYYY, HH:MM:SS] Name: message"
    // OR: "DD/MM/YYYY, HH:MM - Name: message"
    const lineRe = /^(?:\[?[\d/,:\s]+\]?|[\d/]+,?\s[\d:]+\s[-–]?)\s*([^:]+?):\s*(.+)$/
    for (const line of lines) {
        const m = line.match(lineRe)
        if (!m) continue
        const sender  = m[1].trim()
        const message = m[2].trim()
        if (!message || message === '<Media omitted>' || message.startsWith('This message was deleted')) continue
        raw.push({ sender, message })
        if (myName && sender.toLowerCase().includes(myName.toLowerCase())) {
            myMessages.push(message)
        } else {
            otherMessages.push(message)
        }
    }
    // If no myName provided, heuristic: pick the sender with fewest messages (usually "me")
    if (!myName && raw.length) {
        const counts = {}
        raw.forEach(r => { counts[r.sender] = (counts[r.sender]||0)+1 })
        const sorted = Object.entries(counts).sort((a,b)=>a[1]-b[1])
        const meSender = sorted[0]?.[0]
        raw.forEach(r => {
            if (r.sender === meSender) myMessages.push(r.message)
            else otherMessages.push(r.message)
        })
    }
    return { myMessages, otherMessages, raw }
}


// ── Helper functions needed by Plugins/chatbera.js ───────────────────────────

// Extract unique sender names from a parsed export
function getSenders(parsedExport) {
    if (!parsedExport || !parsedExport.raw) return []
    const seen = new Set()
    return parsedExport.raw
        .map(r => r.sender)
        .filter(s => { if (seen.has(s)) return false; seen.add(s); return true })
}

// Build a prompt describing the user's texting style for the AI
function buildStylePrompt(profile, userMsg) {
    if (!profile || !profile.myMessages || !profile.myMessages.length) {
        return 'Reply naturally in a conversational WhatsApp style to: ' + userMsg
    }
    const sample = profile.myMessages.slice(0, 40).join(' | ')
    return (
        'You are replying as a person whose WhatsApp texting style is shown below.\n' +
        'Study the style carefully — short replies, slang, emoji usage, punctuation patterns.\n' +
        'Style samples: ' + sample + '\n\n' +
        'Now reply to this message in that exact same style (keep it short, natural, WhatsApp-like):\n' +
        userMsg
    )
}

// Generate a style-matched reply using Xwolf Gemini AI
async function generateStyleReply(userMsg, profile) {
    try {
        const prompt = 'You mimic WhatsApp texting styles exactly. Short, natural, no asterisks or markdown.\n\n' + buildStylePrompt(profile, userMsg)
        const r = await axios.get('https://apis.xwolf.space/api/ai/gemini', {
            params: { q: prompt.slice(0, 2000) },
            timeout: 20000
        })
        const reply = r.data?.result || r.data?.response || r.data?.answer ||
                      (typeof r.data === 'string' ? r.data : null)
        if (!reply) return { success: false, error: 'No response' }
        return { success: true, reply: String(reply).trim() }
    } catch (e) {
        return { success: false, error: e.message }
    }
}


module.exports = { parseExport, getSenders, buildStylePrompt, generateStyleReply, analyzeStyle, getPrebuiltProfile, PREBUILT_PROFILE }
