// Library/actions/beraai.js
// Bera AI — Advanced AI Engine with Tool Calling
// Tools: bash, web search, web scrape, system info, bot command execution, memory
// Created by Developer Bera

'use strict'
const axios = require('axios')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

const GIFTED = 'https://api.giftedtech.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'
const XWOLF = 'https://apis.xwolf.space'

// ── Memory store (per-chat, persists in process memory) ──────────────────────
const MEMORY = {}
const remember = (chat, key, val) => {
    if (!MEMORY[chat]) MEMORY[chat] = {}
    if (val !== undefined) MEMORY[chat][key] = val
    return MEMORY[chat][key]
}
const getMemory = (chat) => MEMORY[chat] || {}

// ── Shell executor ────────────────────────────────────────────────────────────
const runBash = (cmd, timeoutMs) => new Promise(resolve => {
    exec(cmd, { timeout: timeoutMs || 12000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        const out = (stdout || '').trim()
        const err2 = (stderr || '').trim()
        resolve({ success: !err, output: (out + (err2 ? '\nSTDERR: ' + err2 : '')).slice(0, 2000) || (err ? err.message : 'done') })
    })
})

// ── Web search (Gifted API only) ─────────────────────────────────────────────
const webSearch = async (query) => {
    try {
        const r = await axios.get(`${GIFTED}/api/search/web`, {
            params: { q: query, apikey: GIFTED_KEY },
            timeout: 12000
        })
        const results = r.data?.results || []
        if (Array.isArray(results) && results.length) {
            return { success: true, results: results.slice(0, 4).map(x => ({ 
                title: x.title || x.name || '', 
                snippet: x.description || x.snippet || x.content || '', 
                url: x.url || x.link || '' 
            })) }
        }
    } catch {}
    return { success: false, results: [] }
}

// ── Web scraper ───────────────────────────────────────────────────────────────
const scrapeUrl = async (url) => {
    try {
        const r = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeraAI/1.0)' }, maxContentLength: 500000 })
        const html = String(r.data || '')
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ').trim().slice(0, 3000)
        return { success: true, text, url }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ── System info ───────────────────────────────────────────────────────────────
const systemInfo = async () => {
    const [ram, disk, cpu, uptime, node] = await Promise.all([
        runBash("free -m | awk 'NR==2{printf \"%s/%s MB (%.0f%%)\", $3,$2,$3*100/$2}'"),
        runBash("df -h / | awk 'NR==2{print $3\"/\"$2\" (\"$5\" used)\"}'"),
        runBash("top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4\"%\"}'"),
        runBash('uptime -p'),
        runBash('node --version'),
    ])
    return { ram: ram.output, disk: disk.output, cpu: cpu.output, uptime: uptime.output, node: node.output }
}

// ── Multi-model AI caller with automatic fallback ─────────────────────────────
const AI_MODELS = ['openai', 'mistral', 'deepseek', 'llama', 'unity', 'phi', 'bidder', 'mireille']
let _modelIdx = 0

const isPollinationsError = (text) => {
    if (!text) return true
    const t = text.trim()
    if (t.startsWith('{') && t.includes('"error"')) return true
    if (t.startsWith('{') && t.includes('"status"') && t.includes('404')) return true
    return false
}

const parseAiText = (raw) => {
    if (!raw || typeof raw !== 'string') return null
    const t = raw.trim()
    if (t.startsWith('{') && t.includes('"content"')) {
        try {
            const obj = JSON.parse(t)
            if (obj.content && typeof obj.content === 'string' && obj.content.length > 1) {
                return obj.content.trim()
            }
        } catch {}
    }
    return t
}

const callPollinationsModel = (messages, model, timeoutMs) => {
    const body = JSON.stringify({ model, messages, seed: Math.floor(Math.random() * 99999) })
    return new Promise((resolve, reject) => {
        const req = require('https').request({
            hostname: 'text.pollinations.ai', path: '/', method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Mozilla/5.0 (compatible; BeraAI/3.0)',
                'Referer': 'https://bera-ai.app',
                'Origin':  'https://bera-ai.app'
            }
        }, res => {
            let d = ''; res.on('data', c => d += c)
            res.on('end', () => {
                if (res.statusCode === 429) return resolve('RATELIMIT')
                if (res.statusCode >= 500) return resolve('ERROR')
                if (res.statusCode === 404 || res.statusCode === 400) return resolve('ERROR')
                const raw = d.trim()
                if (isPollinationsError(raw)) return resolve('ERROR')
                const clean = parseAiText(raw)
                if (!clean || clean.length < 2) return resolve('ERROR')
                resolve(clean)
            })
        })
        req.on('error', reject)
        req.setTimeout(timeoutMs || 30000, () => { req.destroy(); reject(new Error('AI timeout')) })
        req.write(body); req.end()
    })
}

// ── Gifted Tech API ───────────────────────────────────────────────────────────
const callGiftedTech = async (userText, historyMessages, timeoutMs, systemPrompt) => {
    const histCtx = (historyMessages || [])
        .filter(m => m.role !== 'system')
        .slice(-4)
        .map(m => (m.role === 'user' ? 'User' : 'Bera AI') + ': ' + String(m.content || '').slice(0, 200))
        .join('\n')

    const identity = systemPrompt && systemPrompt.length > 100
        ? systemPrompt.slice(0, 6000)
        : 'You are Bera AI, a smart WhatsApp assistant built by Bera Tech. Always say your name is Bera AI.'
    const userPart = String(userText || '').slice(0, 800)
    const q = histCtx
        ? identity + '\n\nConversation:\n' + histCtx + '\nUser: ' + userPart + '\nBera AI:'
        : identity + '\n\nUser: ' + userPart + '\nBera AI:'

    const GT_CHAT_ENDPOINTS = [
        `${GIFTED}/api/ai/gemini`,
        `${GIFTED}/api/ai/gpt`,
        `${GIFTED}/api/ai/ai`,
        `${GIFTED}/api/ai/chatgpt`,
    ]

    const isBadGTResponse = (t) => {
        if (!t) return true
        const lc = t.trim().toLowerCase()
        if (lc.includes('<!doctype')) return true
        if (/^(❌|✗|×)\s*(no results found|no result)/i.test(t.trim())) return true
        if (t.trim().length < 3) return true
        return false
    }

    for (const url of GT_CHAT_ENDPOINTS) {
        try {
            const r = await axios.get(url, { params: { apikey: GIFTED_KEY, q }, timeout: timeoutMs || 10000 })
            if (typeof r.data === 'string' && r.data.includes('<!DOCTYPE')) continue
            const text = r.data?.result || r.data?.reply || r.data?.response || r.data?.message ||
                         r.data?.text || (typeof r.data === 'string' ? r.data : null)
            const clean = text && parseAiText(text)
            if (clean && !isBadGTResponse(clean)) return clean.trim()
        } catch {}
    }
    return null
}

// ── Xwolf Gemini AI (fallback) ───────────────────────────────────────────────
const callXwolf = async (userText, timeoutMs, systemPrompt) => {
    const identity = systemPrompt && systemPrompt.length > 100
        ? systemPrompt.slice(0, 4000)
        : 'You are Bera AI — a smart WhatsApp assistant built by Bera Tech.'
    const q = identity + '\n\nUser: ' + (userText || '').slice(0, 600) + '\nBera AI:'
    try {
        const r = await axios.get(`${XWOLF}/api/ai/gemini`, { params: { q }, timeout: timeoutMs || 10000 })
        const text = r.data?.result || r.data?.response || r.data?.answer || (typeof r.data === 'string' ? r.data : null)
        const clean = text && parseAiText(text)
        if (clean && clean.length > 1) return clean.trim()
    } catch {}
    return null
}

// ── Pollinations rotation ─────────────────────────────────────────────────────
const callPollinations = async (messages, timeoutMs) => {
    for (let i = 0; i < AI_MODELS.length; i++) {
        const model = AI_MODELS[(_modelIdx + i) % AI_MODELS.length]
        try {
            const reply = await callPollinationsModel(messages, model, Math.min(timeoutMs, 25000))
            if (reply && reply !== 'RATELIMIT' && reply !== 'ERROR' && reply.length > 1) {
                _modelIdx = (_modelIdx + i + 1) % AI_MODELS.length
                return reply
            }
        } catch {}
    }
    return null
}

// ── Local fallback ───────────────────────────────────────────────────────────
const localFallback = (userText) => {
    const t = (userText || '').trim().toLowerCase()
    if (/^(hi|hello|hey|sup|yo|wassup|hola|habari|mambo|niaje)/i.test(t))
        return "Hey! I'm Bera AI — I'm here and ready. What do you need?"
    if (/\b(who are you|what are you|your name|who made you)/i.test(t))
        return "I'm *Bera AI* — your intelligent WhatsApp assistant, built by Bera Tech."
    if (/\b(how are you|how r u|are you okay)/i.test(t))
        return "I'm running great, thanks for asking! Ready to work."
    if (/\b(what can you do|help|commands|capabilities)/i.test(t))
        return "I can: run shell commands, manage PM2, write code, search the web, and much more."
    return "I'm here! My AI connection is a little slow right now. Try again in a few seconds."
}

// ── One attempt through ALL providers ────────────────────────────────────────
const _tryAllProviders = async (messages, lastUser, historyMsgs, systemContent, timeoutMs) => {
    if (lastUser) {
        const gt = await callGiftedTech(lastUser, historyMsgs, Math.min(timeoutMs, 10000), systemContent)
        if (gt) return gt
    }
    if (lastUser) {
        const xw = await callXwolf(lastUser, Math.min(timeoutMs, 10000), systemContent)
        if (xw) return xw
    }
    const poll = await callPollinations(messages, Math.min(timeoutMs, 25000))
    if (poll) return poll
    return null
}

// ── Main AI caller ───────────────────────────────────────────────────────────
const callAI = async (messages, timeoutMs) => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const historyMsgs = messages.filter(m => m.role !== 'system')
    const systemContent = messages.find(m => m.role === 'system')?.content || ''
    const t = timeoutMs || 30000

    const r1 = await _tryAllProviders(messages, lastUser, historyMsgs, systemContent, t)
    if (r1) return r1

    await new Promise(r => setTimeout(r, 2000))
    const r2 = await _tryAllProviders(messages, lastUser, historyMsgs, systemContent, t)
    if (r2) return r2

    await new Promise(r => setTimeout(r, 4000))
    const r3 = await _tryAllProviders(messages, lastUser, historyMsgs, systemContent, t)
    if (r3) return r3

    return localFallback(lastUser)
}

// ── Conversation history ──────────────────────────────────────────────────────
const HISTORY = {}
const pushHistory = (chat, role, content) => {
    if (!HISTORY[chat]) HISTORY[chat] = []
    HISTORY[chat].push({ role, content })
    if (HISTORY[chat].length > 20) HISTORY[chat] = HISTORY[chat].slice(-20)
}
const getHistory = (chat) => HISTORY[chat] || []
const clearHistory = (chat) => { delete HISTORY[chat] }
const clearMemory = (chat) => { delete MEMORY[chat] }
const saveMemory = (chat, key, value) => remember(chat, key, value)
const setMemory = (chat, value, key) => {
    if (!MEMORY[chat]) MEMORY[chat] = {}
    const k = key || `note_${Object.keys(MEMORY[chat]).length + 1}`
    MEMORY[chat][k] = String(value).slice(0, 300)
}
const deleteMemory = (chat, key) => {
    if (!MEMORY[chat]) return
    if (key) {
        const allKeys = Object.keys(MEMORY[chat])
        const numIdx = parseInt(key) - 1
        if (!isNaN(numIdx) && allKeys[numIdx]) {
            delete MEMORY[chat][allKeys[numIdx]]
        } else {
            delete MEMORY[chat][key]
        }
    } else {
        delete MEMORY[chat]
    }
}

// ── PM2 process management ───────────────────────────────────────────────────
const pm2List = async () => runBash("pm2 list --no-color 2>/dev/null || echo 'PM2_NOT_FOUND'")
const pm2Logs = async (name, lines = 15) => {
    const safe = (name || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!safe) return { success: false, output: 'Invalid process name' }
    return runBash(`pm2 logs ${safe} --lines ${lines} --nostream --no-color 2>&1 | tail -${lines}`)
}
const pm2Show = async (name) => {
    const safe = (name || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!safe) return { success: false, output: 'Invalid process name' }
    return runBash(`pm2 show ${safe} --no-color 2>/dev/null`)
}
const pm2Restart = async (name) => {
    const safe = (name || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!safe) return { success: false, output: 'Invalid process name' }
    return runBash(`pm2 restart ${safe} 2>&1`)
}
const pm2Stop = async (name) => {
    const safe = (name || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!safe) return { success: false, output: 'Invalid process name' }
    return runBash(`pm2 stop ${safe} 2>&1`)
}

// ── Rich server stats ────────────────────────────────────────────────────────
const richServerStats = async () => {
    const os = require('os')
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const load = os.loadaverage ? os.loadaverage() : os.loadavg()
    const upSecs = os.uptime()
    const days = Math.floor(upSecs / 86400)
    const hrs = Math.floor((upSecs % 86400) / 3600)
    const mins = Math.floor((upSecs % 3600) / 60)
    const uptimeStr = `${days}d ${hrs}h ${mins}m`
    const toGi = n => (n / 1073741824).toFixed(1)
    const toMi = n => (n / 1048576).toFixed(0)

    const [disk, pm2raw] = await Promise.all([
        runBash("df -h / | awk 'NR==2{print $2, $3, $4, $5}'"),
        runBash("pm2 jlist 2>/dev/null || echo '[]'")
    ])

    let pm2Processes = []
    try {
        const parsed = JSON.parse(pm2raw.output)
        if (Array.isArray(parsed)) {
            pm2Processes = parsed.map(p => ({
                name: p.name,
                status: p.pm2_env?.status || '?',
                restarts: p.pm2_env?.restart_time || 0,
                memory: toMi(p.monit?.memory || 0) + ' MB',
                cpu: (p.monit?.cpu || 0) + '%',
                uptime: p.pm2_env?.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 60000) + 'm' : '?'
            }))
        }
    } catch {}

    const diskParts = (disk.output || '').split(/\s+/)

    return {
        memory: {
            total: toGi(totalMem) + ' GiB',
            used: toGi(usedMem) + ' GiB',
            free: toGi(freeMem) + ' GiB',
            pct: Math.round(usedMem * 100 / totalMem) + '%'
        },
        disk: {
            total: diskParts[0] || '?',
            used: diskParts[1] || '?',
            free: diskParts[2] || '?',
            pct: diskParts[3] || '?'
        },
        load: load.map(l => l.toFixed(2)).join(', '),
        uptime: uptimeStr,
        cpus: os.cpus().length,
        pm2: pm2Processes
    }
}

// ── Gifted Tech image generation ─────────────────────────────────────────────
const giftedImage = async (prompt, timeoutMs) => {
    const IMG_ENDPOINTS = [
        `${GIFTED}/api/ai/fluximg`,
        `${GIFTED}/api/ai/txt2img`,
        `${GIFTED}/api/ai/deepimg`,
    ]
    for (const url of IMG_ENDPOINTS) {
        try {
            const r = await axios.get(url, {
                params: { apikey: GIFTED_KEY, prompt },
                timeout: timeoutMs || 30000,
                responseType: 'json'
            })
            let imgUrl = null
            if (r.data?.result?.url) imgUrl = r.data.result.url
            else if (typeof r.data?.result === 'string' && r.data.result.startsWith('http')) imgUrl = r.data.result
            else if (r.data?.url) imgUrl = r.data.url
            if (imgUrl && imgUrl.startsWith('http')) return imgUrl
        } catch {}
    }
    return null
}

// ── Gifted Tech YouTube transcript ───────────────────────────────────────────
const giftedTranscript = async (videoUrl, timeoutMs) => {
    try {
        const r = await axios.get(`${GIFTED}/api/ai/transcript`, {
            params: { apikey: GIFTED_KEY, url: videoUrl },
            timeout: timeoutMs || 20000
        })
        return r.data?.result || r.data?.transcript || null
    } catch { return null }
}

// ── Voice / audio transcription ──────────────────────────────────────────────
const transcribeAudio = async (audioBuffer) => {
    if (!audioBuffer || audioBuffer.length < 100) return { success: false, error: 'Empty audio buffer' }
    try {
        const b64 = audioBuffer.toString('base64').slice(0, 5000)
        const res = await axios.post('https://text.pollinations.ai/', {
            model: 'openai',
            messages: [
                { role: 'system', content: 'You are a voice transcription assistant. Transcribe the speech content. If you cannot process audio, say "UNABLE_TO_TRANSCRIBE".' },
                { role: 'user', content: `Transcribe this audio (base64 starts with): ${b64}...` }
            ]
        }, { timeout: 15000 })
        const text = typeof res.data === 'string' ? res.data : ''
        if (text && !text.includes('UNABLE_TO_TRANSCRIBE') && text.length > 2) {
            return { success: true, text: text.trim() }
        }
    } catch {}
    return { success: false, error: 'Transcription service unavailable' }
}

// ── Code validation & auto-fix ───────────────────────────────────────────────
const { writeFileSync, unlinkSync, existsSync } = require('fs')
const { execSync } = require('child_process')
const os = require('os')

const LANG_CHECKERS = {
    javascript: (file) => { try { execSync(`node --check "${file}"`, { timeout: 8000 }); return null } catch (e) { return e.stderr?.toString().trim() || e.message } },
    js: (file) => LANG_CHECKERS.javascript(file),
    typescript: (file) => { try { execSync(`npx --yes tsc --noEmit --allowJs "${file}"`, { timeout: 15000 }); return null } catch (e) { return e.stderr?.toString().trim().slice(0, 500) || e.message } },
    ts: (file) => LANG_CHECKERS.typescript(file),
    python: (file) => { try { execSync(`python3 -m py_compile "${file}"`, { timeout: 8000 }); return null } catch (e) { return e.stderr?.toString().trim() || e.message } },
    py: (file) => LANG_CHECKERS.python(file),
    bash: (file) => { try { execSync(`bash -n "${file}"`, { timeout: 5000 }); return null } catch (e) { return e.stderr?.toString().trim() || e.message } },
    sh: (file) => LANG_CHECKERS.bash(file),
}

const EXT_MAP = { javascript: '.js', js: '.js', typescript: '.ts', ts: '.ts', python: '.py', py: '.py', bash: '.sh', sh: '.sh' }

const extractCodeBlocks = (text) => {
    const blocks = []
    const regex = /```(\w+)?\n?([\s\S]*?)```/g
    let m
    while ((m = regex.exec(text)) !== null) {
        const lang = (m[1] || 'text').toLowerCase()
        const code = m[2].trim()
        if (code.length > 10) blocks.push({ lang, code })
    }
    return blocks
}

const validateAndFixCode = async (aiResponse, taskDescription = '') => {
    const blocks = extractCodeBlocks(aiResponse)
    if (!blocks.length) return { response: aiResponse, fixed: false, errors: [] }

    const errors = []
    let response = aiResponse
    let anyFixed = false

    for (const block of blocks) {
        const checker = LANG_CHECKERS[block.lang]
        if (!checker) continue

        const ext = EXT_MAP[block.lang] || '.txt'
        const tmpFile = path.join(os.tmpdir(), `bera_validate_${Date.now()}${ext}`)

        let currentCode = block.code
        let lastError = null

        for (let attempt = 0; attempt < 3; attempt++) {
            try { writeFileSync(tmpFile, currentCode, 'utf8') } catch { break }
            const syntaxError = checker(tmpFile)
            try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
            if (!syntaxError) {
                if (attempt > 0) {
                    response = response.replace(block.code, currentCode)
                    anyFixed = true
                }
                lastError = null
                break
            }
            lastError = syntaxError
            if (attempt === 2) break
            try {
                const fixPrompt = [
                    { role: 'system', content: 'You are an expert programmer. Fix the syntax error. Return ONLY the corrected code inside a markdown code block.' },
                    { role: 'user', content: `This ${block.lang} code has a syntax error:\n\n\`\`\`${block.lang}\n${currentCode}\n\`\`\`\n\nError: ${syntaxError}\n\nFix it.` }
                ]
                const fixed = await callAI(fixPrompt, 20000)
                const fixedBlocks = extractCodeBlocks(fixed)
                if (fixedBlocks.length) currentCode = fixedBlocks[0].code
                else {
                    const codeMatch = fixed.match(/```[\w]*\n?([\s\S]+?)```/)
                    if (codeMatch) currentCode = codeMatch[1].trim()
                }
            } catch { break }
        }
        if (lastError) errors.push({ lang: block.lang, error: lastError })
    }
    return { response, fixed: anyFixed, errors }
}

// ── Pre-dispatch for tool intents ───────────────────────────────────────────
const preDispatch = async (text) => {
    const t = text.trim()
    const lc = t.toLowerCase()

    // Ping command
    const PING_RX = /^ping\s+([\w.\-]+)$/i
    const mPing = t.match(PING_RX)
    if (mPing) {
        const host = mPing[1].replace(/[^a-zA-Z0-9.\-]/g, '')
        const r = await runBash(`ping -c 4 -W 3 ${host} 2>&1`)
        return { success: true, reply: `🏓 *Ping ${host}*\n\`\`\`\n${r.output.slice(0, 500)}\n\`\`\`` }
    }

    // Shell commands
    const RUN_RX = /^(?:run|execute|exec|bash|shell|terminal)\s+(.+)/i
    const mRun = t.match(RUN_RX)
    if (mRun) {
        const cmd = mRun[1].trim()
        const SECRET_RX = /\b(printenv|cat\s+\.env|echo\s+\$[A-Z_]+TOKEN)/i
        if (SECRET_RX.test(cmd)) return { success: false, reply: '🔒 Command blocked — could expose secrets.' }
        const r = await runBash(cmd, 15000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }

    // PM2 shortcuts
    const PM2_RX = /^pm2\s+(.+)/i
    const mPm2 = t.match(PM2_RX)
    if (mPm2) {
        const safe = mPm2[1].replace(/[;&|`$<>]/g, '').slice(0, 100)
        const r = await runBash(`pm2 ${safe} --no-color 2>&1`, 15000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }

    // NPM install commands (with package)
    const NPM_RX = /^npm\s+(install|i|add|ci)\s+(.+)/i
    const mNpm = t.match(NPM_RX)
    if (mNpm) {
        const cmd = `npm ${mNpm[1]} ${mNpm[2]}`
        const r = await runBash(cmd, 60000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }
    
    // NPM install without package name (just npm install)
    const NPM_INSTALL_RX = /^npm\s+(install|i)$/i
    if (NPM_INSTALL_RX.test(t)) {
        const r = await runBash('npm install', 60000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }

    return null
}

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Bera AI — a smart WhatsApp assistant. You have access to the following tools. When you need to use a tool, output ONLY a single JSON line. Never explain before calling a tool — just output the JSON.

Available tools:
{"tool":"bash","cmd":"shell command here"}
{"tool":"install","manager":"npm","packages":["pkg1","pkg2"],"folder":"","dev":false}
{"tool":"install","manager":"pip","packages":["requests"],"folder":""}
{"tool":"install","manager":"yarn","packages":["pkg1"],"folder":""}
{"tool":"search","query":"search terms here"}
{"tool":"scrape","url":"https://example.com"}
{"tool":"system"}
{"tool":"reply","text":"your answer here"}

Rules:
- To install or update any npm/pip/yarn package, ALWAYS use the install tool. Never use bash for package installs.
- To answer a question without a tool, use reply.
- To run a shell command, use bash.
- To look something up on the web, use search.
- Keep responses short and helpful. Use English by default.`

// ── Generate advanced reply with tool loop ───────────────────────────────────
const generateAdvancedReply = async (text, chat, conn, m, opts = {}) => {
    try {
        const pd = await preDispatch(text)
        if (pd) {
            pushHistory(chat, 'user', text)
            pushHistory(chat, 'assistant', pd.reply)
            return pd
        }
    } catch {}

    pushHistory(chat, 'user', text)

    const mem = getMemory(chat)
    const memStr = Object.keys(mem).length ? '\nMemory: ' + JSON.stringify(mem) : ''

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT + memStr },
        ...getHistory(chat).slice(-6)
    ]

    for (let loop = 0; loop < 4; loop++) {
        let aiReply
        try {
            aiReply = await callAI(messages, 30000)
        } catch (e) {
            const lastUserMsg = messages.slice().reverse().find(msg => msg.role === 'user')?.content || text
            aiReply = localFallback(lastUserMsg)
        }

        if (!aiReply) {
            const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user')?.content || text
            aiReply = localFallback(lastUserMsg)
        }

        // Parse for tool call
        const jsonMatch = aiReply.match(/\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"([^}]+)\}/)
        if (!jsonMatch) {
            pushHistory(chat, 'assistant', aiReply)
            return { success: true, reply: aiReply }
        }

        // Execute tool
        let toolResult = ''
        try {
            const toolCall = JSON.parse(aiReply.match(/\{[\s\S]*\}/)[0])

            if (toolCall.tool === 'reply') {
                pushHistory(chat, 'assistant', toolCall.text || aiReply)
                return { success: true, reply: toolCall.text || aiReply }
            }

            if (toolCall.tool === 'bash') {
                const r = await runBash(toolCall.cmd, 30000)
                toolResult = r.output || 'Command completed.'

            } else if (toolCall.tool === 'install') {
                const manager = (toolCall.manager || 'npm').toLowerCase()
                const pkgs = Array.isArray(toolCall.packages)
                    ? toolCall.packages.map(p => String(p).replace(/[;&|`$<>]/g, '').trim()).filter(Boolean)
                    : []
                if (!pkgs.length) {
                    toolResult = 'Error: no packages specified.'
                } else {
                    const folder = toolCall.folder ? String(toolCall.folder).replace(/[^a-zA-Z0-9_.\-\/]/g, '') : ''
                    const cwd = folder ? `cd workspace/${folder} && ` : ''
                    let cmd
                    if (manager === 'npm') {
                        const flag = toolCall.dev ? ' --save-dev' : ''
                        cmd = `${cwd}npm install${flag} ${pkgs.join(' ')} 2>&1 || npm install --legacy-peer-deps${flag} ${pkgs.join(' ')} 2>&1`
                    } else if (manager === 'yarn') {
                        const flag = toolCall.dev ? ' --dev' : ''
                        cmd = `${cwd}yarn add${flag} ${pkgs.join(' ')} 2>&1`
                    } else if (manager === 'pip' || manager === 'pip3') {
                        cmd = `${cwd}pip3 install ${pkgs.join(' ')} 2>&1`
                    } else {
                        cmd = `${cwd}${manager} install ${pkgs.join(' ')} 2>&1`
                    }
                    const r = await runBash(cmd, 90000)
                    toolResult = r.output || 'Install completed.'
                }

            } else if (toolCall.tool === 'search') {
                const sr = await webSearch(String(toolCall.query || ''))
                if (sr.success && sr.results.length) {
                    toolResult = sr.results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n')
                } else {
                    toolResult = 'No results found.'
                }

            } else if (toolCall.tool === 'scrape') {
                const sc = await scrapeUrl(String(toolCall.url || ''))
                toolResult = sc.success ? sc.text : ('Scrape failed: ' + sc.error)

            } else if (toolCall.tool === 'system') {
                const info = await systemInfo()
                toolResult = `RAM: ${info.ram} | Disk: ${info.disk} | CPU: ${info.cpu} | Uptime: ${info.uptime} | Node: ${info.node}`

            } else {
                toolResult = `Tool "${toolCall.tool}" is not supported.`
            }
        } catch (e) {
            toolResult = `Error: ${e.message}`
        }

        messages.push({ role: 'assistant', content: aiReply })
        messages.push({ role: 'user', content: 'Tool result: ' + toolResult + '\n\nNow respond to the user.' })
    }

    return { success: false, reply: 'Could not complete the request.' }
}

// ── Simple conversational reply ──────────────────────────────────────────────
const generateSimpleReply = async (text, chat) => {
    pushHistory(chat, 'user', text)
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...getHistory(chat).slice(-6)
    ]
    try {
        const reply = await callAI(messages, 20000)
        if (reply && reply.length > 1) {
            pushHistory(chat, 'assistant', reply)
            return { success: true, reply }
        }
        return { success: false, reply: 'Bera AI is busy, try again.' }
    } catch (e) {
        return { success: false, reply: 'AI error: ' + e.message }
    }
}

// ── Run shell command (alias) ────────────────────────────────────────────────
const runShell = runBash

// ── EXPORTS ───────────────────────────────────────────────────────────────────
module.exports = {
    // Main AI functions
    generateAdvancedReply,
    generateSimpleReply,
    validateAndFixCode,
    transcribeAudio,
    
    // Memory management
    saveMemory,
    getMemory,
    setMemory,
    deleteMemory,
    clearHistory,
    clearMemory,
    
    // Search & scrape
    webSearch,
    scrapeUrl,
    
    // System & PM2
    runShell,
    runBash,
    systemInfo,
    richServerStats,
    pm2List,
    pm2Logs,
    pm2Show,
    pm2Restart,
    pm2Stop,
    
    // Image & transcript
    giftedImage,
    giftedTranscript,
    
    // Internal (for backward compatibility)
    callAI,
    callGiftedTech,
    callXwolf,
    callPollinations
    }
