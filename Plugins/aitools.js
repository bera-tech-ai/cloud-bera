// Plugins/aitools.js — AI-powered text processing tools
// Commands: summarize, explain, improve, proofread, bullet, outline,
//           translate2, compare, define2, synonym, antonym,
//           eli5, rewrite, formal, casual, tweet, caption2,
//           essay, cover, email, reply2, code2eng, eng2code, debugcode,
//           sentiment, keyword, complete, expand

const axios = require('axios')
const { sendButtons } = require('gifted-btns')
const { getBtnMode } = require('../Library/actions/btnmode')

const handle = {}
handle.command = [
    'summarize', 'summary', 'tldr',
    'explain', 'explainit',
    'improve', 'enhance', 'bettertext',
    'proofread', 'grammar', 'spellcheck',
    'bullet', 'bulletpoints', 'listify',
    'outline', 'structure',
    'eli5', 'simplify',
    'rewrite', 'rephrase', 'paraphrase',
    'formal', 'formalize', 'professional',
    'casual', 'informaltext', 'friendlytext',
    'tweet', 'tweetit', 'totweet',
    'caption2', 'writecaption',
    'essay', 'writeessay',
    'cover', 'coverletter',
    'email', 'writeemail',
    'code2eng', 'codeexplain', 'whatdoesthisdo',
    'eng2code', 'writecodeinjs', 'codewrite',
    'debugcode', 'fixcode', 'whatsthebug',
    'sentiment', 'mood', 'tone',
    'keyword', 'keywords', 'keyphrase',
    'complete', 'autocomplete', 'continue',
    'expand', 'elaborate',
    'synonym', 'syn',
    'antonym', 'ant',
    'acronym',
    'nameai', 'namegenerator',
    'sloganai', 'slogangenerator',
    'bioai', 'writebio',
    'roasttext', 'comedyroast',
]
handle.tags = ['ai', 'writing', 'text', 'tools']
handle.help = [
    'summarize <text/url>  — Summarize content',
    'explain <topic>       — Explain something clearly',
    'improve <text>        — Improve writing quality',
    'proofread <text>      — Fix grammar & spelling',
    'bullet <text>         — Convert to bullet points',
    'eli5 <topic>          — Explain Like I\'m 5',
    'rewrite <text>        — Rephrase the text',
    'formal <text>         — Make text formal/professional',
    'casual <text>         — Make text casual/friendly',
    'tweet <text>          — Write a Twitter/X post',
    'caption2 <desc>       — Write an Instagram caption',
    'essay <topic>         — Write an essay outline',
    'cover <job>           — Write a cover letter',
    'email <topic>         — Write a professional email',
    'code2eng <code>       — Explain code in English',
    'eng2code <desc>       — Write JavaScript code',
    'debugcode <code>      — Find bugs in code',
    'sentiment <text>      — Analyze text sentiment/mood',
    'keyword <text>        — Extract keywords',
    'complete <text>       — Autocomplete the text',
    'expand <text>         — Expand and elaborate text',
    'synonym <word>        — Find synonyms',
    'antonym <word>        — Find antonyms',
    'acronym <letters>     — Generate acronym meaning',
    'nameai <desc>         — Generate brand/app names',
    'sloganai <brand>      — Generate slogans',
    'bioai <info>          — Write a bio',
]

// Chat with Bera's AI using the ChatBera system (fallback to built-in logic)
const askAI = async (prompt) => {
    const APISKEITH = 'https://apiskeith.top'
    const AI_ENDPOINTS = [
        { url: `${APISKEITH}/ai/gpt41Nano`, param: 'q' },
        { url: `${APISKEITH}/ai/gpt`,       param: 'q' },
        { url: 'https://bk9.fun/ai/gpt',    param: 'q' },
    ]

    // Try apiskeith endpoints first (free, no key needed)
    for (const ep of AI_ENDPOINTS) {
        try {
            const res = await axios.get(ep.url, { params: { [ep.param]: prompt.slice(0, 500) }, timeout: 15000 })
            const result = res.data?.result || res.data?.answer || res.data?.response || res.data?.reply
            if (typeof result === 'string' && result.length > 5) return result.slice(0, 1200)
        } catch {}
    }

    // Fallback: try pollinations AI GET (free, anonymous, no model param needed)
    try {
        const encoded = encodeURIComponent(prompt)
        const res = await axios.get('https://text.pollinations.ai/' + encoded, { timeout: 10000 })
        const txt = typeof res.data === 'string' ? res.data.trim() : ''
        const isErr = txt.startsWith('{') && (txt.includes('"error"') || txt.includes('"status"'))
        if (txt && txt.length > 10 && !isErr) return txt.slice(0, 1000)
    } catch {}

    return null
}

const EMOJI_MAP = {
    summarize: '📋', explain: '🧠', improve: '✨', proofread: '📝',
    bullet: '•', eli5: '👶', rewrite: '🔄', formal: '👔',
    casual: '😊', tweet: '🐦', caption2: '📸', essay: '📄',
    cover: '💼', email: '📧', code2eng: '💻', eng2code: '⌨️',
    debugcode: '🐛', sentiment: '😊', keyword: '🔑', complete: '✅',
    expand: '📖', synonym: '💬', antonym: '🔄', acronym: '🔤',
    nameai: '🏷️', sloganai: '📢', bioai: '👤',
}

const LANG_DETECT = (desc) => {
    const d = desc.toLowerCase()
    if (/\bpython\b|\.py\b|flask|django|fastapi|pandas|numpy/.test(d)) return 'python'
    if (/\btypescript\b|\.ts\b|\btype\s+safe/.test(d)) return 'typescript'
    if (/\bbash\b|shell\s+script|\.sh\b/.test(d)) return 'bash'
    if (/\bhtml\b|css\b|webpage|landing\s+page|frontend/.test(d)) return 'html'
    if (/\breact\b|next\.?js\b|component/.test(d)) return 'javascript (React)'
    if (/\bsql\b|database\s+query|mysql|postgres|sqlite/.test(d)) return 'sql'
    if (/\bjava\b(?!script)/.test(d)) return 'java'
    if (/\bgo\b|\bgolang\b/.test(d)) return 'go'
    if (/\brust\b/.test(d)) return 'rust'
    if (/\bc\+\+|cpp/.test(d)) return 'cpp'
    return 'javascript'
}

const PROMPTS = {
    summarize:   t => `Summarize the following in 3-5 clear, well-structured sentences. Focus on the key points only:\n\n${t}`,
    explain:     t => `Explain the following clearly and precisely. Use examples if helpful:\n\n${t}`,
    improve:     t => `Improve the following text. Make it clearer, more engaging, better structured, and more impactful. Return ONLY the improved text without commentary:\n\n${t}`,
    proofread:   t => `Proofread the following text. Fix ALL grammar, spelling, punctuation, and style errors. Return ONLY the corrected text:\n\n${t}`,
    bullet:      t => `Convert the following into a clear, well-organized bulleted list. Group related items if needed:\n\n${t}`,
    outline:     t => `Create a detailed, structured outline for the following topic. Include main sections and subsections:\n\n${t}`,
    eli5:        t => `Explain the following in the simplest possible terms, as if explaining to a 5-year-old. Use simple words and a relatable analogy:\n\n${t}`,
    rewrite:     t => `Completely rephrase the following text while keeping the exact same meaning. Use different words and sentence structures:\n\n${t}`,
    formal:      t => `Rewrite the following in a formal, professional tone suitable for business or academic use. Return ONLY the rewritten text:\n\n${t}`,
    casual:      t => `Rewrite the following in a casual, friendly, conversational tone. Sound natural and approachable. Return ONLY the rewritten text:\n\n${t}`,
    tweet:       t => `Write an engaging Twitter/X post about: ${t}\nRequirements: compelling hook, conversational tone, 2-3 relevant hashtags, strictly under 280 characters.`,
    caption2:    t => `Write a captivating Instagram caption for: ${t}\nInclude an engaging opening line, value/story in the middle, clear call-to-action, and 5-8 relevant hashtags at the end.`,
    essay:       t => `Write a comprehensive, well-structured essay on: ${t}\n\nInclude:\n- Strong introduction with thesis\n- 3 developed body paragraphs with evidence\n- Conclusion that reinforces the thesis\n- Smooth transitions between sections`,
    cover:       t => `Write a compelling 3-paragraph cover letter for a ${t} position.\n\nParagraph 1: Hook + why you want this role\nParagraph 2: Your top 2-3 relevant skills with specific examples\nParagraph 3: Call to action + closing`,
    email:       t => `Write a clear, professional email about:\n\n${t}\n\nInclude: appropriate subject line, greeting, concise body, and professional closing.`,

    code2eng: t => `You are a senior software engineer. Analyze and explain the following code comprehensively:\n\n\`\`\`\n${t}\n\`\`\`\n\nProvide:\n1. **What it does** (1-2 sentence summary)\n2. **How it works** (step-by-step walkthrough)\n3. **Key concepts used** (data structures, algorithms, patterns)\n4. **Potential issues** (edge cases, performance, security)\n5. **Improvements** (better ways to write it if any)`,

    eng2code: (t) => {
        const lang = LANG_DETECT(t)
        return `You are a senior ${lang} developer. Write complete, production-ready ${lang} code for the following task:\n\n${t}\n\nRequirements:\n- ALL imports/requires at the top\n- Proper error handling (try/catch)\n- Input validation\n- Clear variable names\n- Brief comments for complex logic\n- Working example usage at the bottom\n- NO placeholder code — everything must be fully implemented\n\nReturn ONLY the code in a markdown code block with the correct language tag.`
    },

    debugcode: t => `You are an expert debugger and code reviewer. Analyze this code for ALL issues:\n\n\`\`\`\n${t}\n\`\`\`\n\nProvide:\n1. **Bugs Found** — list each bug with line reference and exact description\n2. **Root Cause** — why each bug occurs\n3. **Fixed Code** — the complete corrected version in a code block\n4. **What Changed** — clear explanation of every fix\n5. **Prevention** — how to avoid these bugs in the future\n\nIf no bugs found, say so clearly and suggest optimizations instead.`,

    sentiment:   t => `Analyze the emotional tone and sentiment of the following text:\n\n${t}\n\nReturn:\n• **Overall Sentiment**: Positive / Negative / Neutral / Mixed\n• **Dominant Emotion**: (joy, anger, fear, sadness, surprise, disgust, etc.)\n• **Confidence**: X%\n• **Tone**: (formal, casual, sarcastic, urgent, etc.)\n• **Key Indicators**: the specific words/phrases that drove this analysis`,
    keyword:     t => `Extract the most important keywords and key phrases from this text. Rank by relevance:\n\n${t}\n\nFormat as numbered list with each keyword/phrase and a brief note on why it's significant.`,
    complete:    t => `Continue and complete the following text naturally. Match the tone, style, and context exactly:\n\n${t}`,
    expand:      t => `Expand the following into a detailed, comprehensive version. Add context, examples, data points, and elaboration:\n\n${t}`,
    synonym:     t => `Provide 10 synonyms for: "${t}"\n\nFor each: word — brief context note (when to use it). Group by formality level.`,
    antonym:     t => `Provide 8 antonyms for: "${t}"\n\nFor each: antonym — brief context note. Note any nuances in meaning.`,
    acronym:     t => `Create 3 creative, memorable acronym meanings for the letters: ${t.toUpperCase()}\n\nMake each one thematic — professional, fun, and inspirational versions.`,
    nameai:      t => `Generate 10 creative, memorable brand/product names for: ${t}\n\nFor each name:\n- The name\n- 1-sentence tagline\n- Why it works (briefly)\n\nMix short/punchy names with more descriptive ones.`,
    sloganai:    t => `Generate 8 powerful, punchy slogans for: ${t}\n\nMix different styles: emotional appeal, benefit-focused, action-driven, humorous, bold statement.`,
    bioai:       t => `Write 3 versions of a professional bio based on this info:\n\n${t}\n\n1. **Short** (Twitter/LinkedIn headline — 1 sentence)\n2. **Medium** (3 sentences — for website About page)\n3. **Full** (2 paragraphs — professional profile)`,
    roasttext:   t => `Write a sharp, witty, good-natured comedy roast of: ${t}\n\nKeep it clever and funny — NOT mean-spirited or offensive. Include 3-4 punchy roast lines.`,
}

handle.all = async (m, { conn, command, args, prefix, reply } = {}) => {
    const chat = m.chat || m.key?.remoteJid
    const text = args.join(' ').trim()

    // Get the message to process (quoted or args)
    let input = text
    if (!input && m.quoted) {
        input = m.quoted.text || m.quoted.body || ''
    }

    // Map aliases to base commands
    const aliasMap = {
        summary: 'summarize', tldr: 'summarize',
        explainit: 'explain',
        enhance: 'improve', bettertext: 'improve',
        grammar: 'proofread', spellcheck: 'proofread',
        bulletpoints: 'bullet', listify: 'bullet',
        structure: 'outline',
        simplify: 'eli5',
        rephrase: 'rewrite', paraphrase: 'rewrite',
        formalize: 'formal', professional: 'formal',
        informaltext: 'casual', friendlytext: 'casual',
        tweetit: 'tweet', totweet: 'tweet',
        writecaption: 'caption2',
        writeessay: 'essay',
        coverletter: 'cover',
        writeemail: 'email',
        codeexplain: 'code2eng', whatdoesthisdo: 'code2eng',
        writecodeinjs: 'eng2code', codewrite: 'eng2code',
        fixcode: 'debugcode', whatsthebug: 'debugcode',
        mood: 'sentiment', tone: 'sentiment',
        keywords: 'keyword', keyphrase: 'keyword',
        autocomplete: 'complete', continue: 'complete',
        elaborate: 'expand',
        syn: 'synonym',
        ant: 'antonym',
        namegenerator: 'nameai',
        slogangenerator: 'sloganai',
        writebio: 'bioai',
        comedyroast: 'roasttext',
    }

    const cmd = aliasMap[command] || command

    if (!PROMPTS[cmd]) return // not our command

    if (!input) {
        const cmdNames = {
            summarize: 'text or URL', explain: 'a topic', improve: 'text',
            proofread: 'text', bullet: 'text', eli5: 'a topic',
            rewrite: 'text', formal: 'text', casual: 'text',
            tweet: 'a topic', caption2: 'a description', essay: 'a topic',
            cover: 'a job title', email: 'a topic', code2eng: 'your code',
            eng2code: 'what to code', debugcode: 'code to debug',
            sentiment: 'text', keyword: 'text', complete: 'text to continue',
            expand: 'text', synonym: 'a word', antonym: 'a word',
            acronym: 'letters', nameai: 'what to name', sloganai: 'a brand',
            bioai: 'your info', roasttext: 'who to roast'
        }
        return reply('❌ Provide ' + (cmdNames[cmd] || 'text') + '.\n\nUsage: ' + prefix + command + ' <' + (cmdNames[cmd] || 'text') + '>\n\nOr quote a message and run ' + prefix + command)
    }

    if (input.length > 3000) return reply('❌ Text too long. Max 3000 characters.')

    await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
    await reply('⏳ Processing with AI...')

    const prompt = PROMPTS[cmd](input)
    const result = await askAI(prompt)

    if (!result) {
        await conn.sendMessage(chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        return reply('❌ AI is unavailable right now. Try again later or check if an API key is configured.')
    }

    const emoji = EMOJI_MAP[cmd] || '🤖'
    const title = cmd.charAt(0).toUpperCase() + cmd.slice(1)

    await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    const body = '╭══〘 *' + emoji + ' ' + title + '* 〙═⊷\n┃\n' +
        result.split('\n').map(l => '┃ ' + l).join('\n') +
        '\n╰══════════════════⊷'

    if (getBtnMode(chat)) {
        return sendButtons(conn, chat, {
            title:   emoji + ' ' + title,
            text:    body,
            footer:  'Bera AI',
            buttons: [
                { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Result', copy_code: result.slice(0, 2000) }) },
            ]
        })
    }

    return reply(body)
}

module.exports = handle
