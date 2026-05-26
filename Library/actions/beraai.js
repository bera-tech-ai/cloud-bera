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

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Full Agent Mode (46 tools)
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `╔══════════════════════════════════════════════════════════════╗
║ BERA AI — AGENT MODE                                        ║
║ Created by Bera Tech | All rights reserved                  ║
╚══════════════════════════════════════════════════════════════╝

You are BERA AI — the most advanced WhatsApp AI agent ever built. Created by Bera Tech.
You are powered by OpenAI GPT-4o. You run as a WhatsApp bot on @whiskeysockets/baileys.
NEVER deny being Bera AI. NEVER say you are ChatGPT or Claude directly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES — NEVER VIOLATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTE, DON'T DESCRIBE: When asked to DO something — DO IT with tools.
ALWAYS VERIFY: After creating or deploying — verify it worked.
PLAN FIRST: For 3+ step tasks, output your plan, then execute.
SEND PROGRESS: For 5+ tool calls, send "⚙️ [N/total] Step..."
NEVER HALF-DONE: Try 3 different approaches before giving up.
SECRETS SACRED: Never output API keys, tokens, passwords.
CONFIRM DESTRUCTIVE: Before deleting files, dropping databases — ask user.
COMPLETE FILES: When writing code, write the ENTIRE file. Never truncate.
PRODUCTION QUALITY: All code must handle errors, validate input, use env vars.
PARALLEL EXECUTION: Execute independent tasks in parallel as an array.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL CALL FORMAT: Output ONLY valid JSON:
Single tool: {"tool":"bash","cmd":"ls -la"}
Multiple parallel: [{"tool":"bash","cmd":"..."}, {"tool":"writefile","path":"...","content":"..."}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AVAILABLE TOOLS (46):

FILE: bash, writefile, readfile, mkdir, deletefile, listfiles, zipfolder, unzip
WEB: search, scrape, http, screenshot, webform
CODE: runcode, install, lint, codereview, apidocs, regex, jsonformat, csv2json, json2csv, yaml2json, json2yaml, xml2json
GIT: gitinit, gitdiff, gitlog, gitbranch, gitstatus, gitstash, gitpull, gitpush
DEPLOY: deploy_vercel, deploy_railway, deploy_netlify, deploy_render, deploy_fly, deploy_sky
SSH: ssh
DATABASE: db, db_migrate
MEMORY: remember, recall, recall_all, forget, forget_all
NOTES: note
CRON: cron
MONITOR: monitor, syswatch, netcheck, portcheck
WHATSAPP: wa_send, wa_send_image, wa_send_audio, wa_send_video, wa_send_file, wa_create_group, wa_get_groups, wa_react
MEDIA: tts, transcribe_audio, audio_info, video_info, video_download, video_trim, video_thumbnail, imagine_hd, ocr, qrgen, qrread, convert
MATH: calc, stats, unit_convert, currency, date_calc
NOTIFY: send_email, send_webhook, send_telegram, send_discord
PROJECT: project_analyze, project_deps, project_test, project_build, project_health, project_readme
DEVOPS: docker, k8s, terraform
ADVANCED: secret, tunnel, webhook, benchmark, logs, finetune, rag, playwright, mobile, web3, ml, pdf, excel
BERAHOST: berahost
SYSTEM: system

EXAMPLES:
{"tool":"bash","cmd":"ls -la workspace/"}
{"tool":"writefile","path":"workspace/app/server.js","content":"const express=require('express')..."}
{"tool":"http","method":"GET","url":"https://api.example.com/data"}
{"tool":"ssh","server":"myserver","cmd":"pm2 restart all"}
{"tool":"runcode","lang":"node","code":"console.log('hello')"}
{"tool":"install","packages":["express","dotenv"],"path":"workspace/myapp"}
{"tool":"deploy_vercel","folder":"workspace/myapp","name":"my-app"}
{"tool":"remember","key":"project","value":"Building REST API in Express"}
{"tool":"cron","action":"add","id":"daily","schedule":"0 9 * * *","task":"search weather Nairobi","chat":"CHAT_ID"}
{"tool":"monitor","action":"add","id":"mysite","url":"https://myapp.com","interval":300,"chat":"CHAT_ID"}
{"tool":"docker","action":"ps"}
{"tool":"berahost","action":"list"}
{"tool":"db","action":"query","file":"workspace/data.sqlite","sql":"SELECT * FROM users LIMIT 10"}
{"tool":"calc","expr":"(2^10 + sqrt(144)) * PI"}
{"tool":"pdf","action":"generate","html":"workspace/report.html","output":"workspace/report.pdf"}
{"tool":"imagine_hd","prompt":"A beautiful Nairobi skyline at sunset","size":"1024x1024"}

PATTERNS:
Build & Deploy: mkdir -> writefile -> install -> runcode -> gitinit -> deploy -> reply with URL
SSH Task: ssh (echo ok) -> ssh (actual cmd) -> reply
Code Review: readfile -> codereview -> reply
Schedule: cron add -> confirm
Parallel ops: [tool1, tool2, tool3] for independent tasks
`

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTOR — all 46 tools
// ─────────────────────────────────────────────────────────────────────────────
const nodePath = require('path')
const nodeFs = require('fs')
const nodeFsPromises = require('fs').promises
const axios = require('axios')

let mathjs
try { mathjs = require('mathjs') } catch { mathjs = null }
let nodeCron
try { nodeCron = require('node-cron') } catch { nodeCron = null }

const safeWsPath = (p) => {
    if (!p) return null
    const normalized = nodePath.normalize(p).replace(/^\/+/, '')
    const blocked = ['..', 'etc/', 'root/', 'home/', 'proc/', 'sys/', 'dev/', 'boot/']
    if (blocked.some(b => normalized.includes(b))) return null
    return normalized
}

const executeToolCall = async (toolCall, chatId, conn, m) => {
    const t = toolCall.tool

    // bash
    if (t === 'bash') {
        const block = [/printenv/i, /\benv\b(?!\s*=)/, /export\s+-p/, /cat\s+\.env/, /echo\s+\$[A-Z_]{4,}/]
        if (block.some(p => p.test(toolCall.cmd || ''))) return 'BLOCKED: sensitive command pattern.'
        const r = await runBash(toolCall.cmd || '', toolCall.timeout || 30000)
        return r.output || 'done'
    }

    // writefile
    if (t === 'writefile') {
        const sp = safeWsPath(toolCall.path)
        if (!sp) return 'ERROR: path not allowed'
        const dir = nodePath.dirname(sp)
        if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true })
        await nodeFsPromises.writeFile(sp, toolCall.content || '', 'utf8')
        return `written: ${sp} (${(toolCall.content||'').length} bytes)`
    }

    // readfile
    if (t === 'readfile') {
        const sp = safeWsPath(toolCall.path)
        if (!sp) return 'ERROR: path not allowed'
        if (!nodeFs.existsSync(sp)) return `not found: ${sp}`
        return (await nodeFsPromises.readFile(sp, 'utf8')).slice(0, 8000)
    }

    // mkdir
    if (t === 'mkdir') {
        const sp = safeWsPath(toolCall.path)
        if (!sp) return 'ERROR: path not allowed'
        nodeFs.mkdirSync(sp, { recursive: true })
        return `created: ${sp}`
    }

    // deletefile
    if (t === 'deletefile') {
        const sp = safeWsPath(toolCall.path)
        if (!sp) return 'ERROR: path not allowed'
        await nodeFsPromises.unlink(sp).catch(() => {})
        return `deleted: ${sp}`
    }

    // listfiles
    if (t === 'listfiles') {
        const sp = safeWsPath(toolCall.path || 'workspace/')
        if (!sp) return 'ERROR: path not allowed'
        const r = await runBash(`ls -la "${sp}" 2>&1`, 5000)
        return r.output || 'empty'
    }

    // zipfolder
    if (t === 'zipfolder') {
        const src = safeWsPath(toolCall.path)
        if (!src) return 'ERROR: path not allowed'
        const out = safeWsPath(toolCall.output || toolCall.path + '.zip')
        const r = await runBash(`zip -r "${out}" "${src}" 2>&1`, 30000)
        return r.output || `zipped to ${out}`
    }

    // unzip
    if (t === 'unzip') {
        const src = safeWsPath(toolCall.file)
        if (!src) return 'ERROR: path not allowed'
        const dest = safeWsPath(toolCall.dest || 'workspace/')
        const r = await runBash(`unzip -o "${src}" -d "${dest || 'workspace/'}" 2>&1`, 30000)
        return r.output || 'unzipped'
    }

    // search
    if (t === 'search') return await webSearch(toolCall.query || toolCall.q || '')

    // scrape
    if (t === 'scrape') return await scrapeUrl(toolCall.url || '')

    // http
    if (t === 'http') {
        try {
            const cfg = { method: toolCall.method || 'GET', url: toolCall.url, headers: toolCall.headers || {}, timeout: 20000 }
            if (toolCall.body || toolCall.data) cfg.data = toolCall.body || toolCall.data
            if (toolCall.params) cfg.params = toolCall.params
            const r = await axios(cfg)
            const body = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : String(r.data)
            return `Status: ${r.status}\n${body.slice(0, 3000)}`
        } catch (e) {
            return `HTTP ${e.response?.status || 'error'}: ${e.response?.statusText || e.message}\n${JSON.stringify(e.response?.data||{}).slice(0,400)}`
        }
    }

    // screenshot
    if (t === 'screenshot') {
        try {
            const puppeteer = require('puppeteer')
            const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] })
            const page = await browser.newPage()
            await page.setViewport({ width: toolCall.width || 1280, height: toolCall.height || 720 })
            await page.goto(toolCall.url, { waitUntil: 'networkidle2', timeout: 30000 })
            const outPath = `workspace/screenshot_${Date.now()}.png`
            nodeFs.mkdirSync('workspace', { recursive: true })
            await page.screenshot({ path: outPath, fullPage: !!toolCall.fullPage })
            await browser.close()
            if (conn && m) await conn.sendMessage(chatId, { image: { url: nodePath.resolve(outPath) }, caption: `📸 ${toolCall.url}` }, { quoted: m })
            return `screenshot: ${outPath}`
        } catch (e) {
            try {
                const r = await axios.get('https://api.giftedtech.co.ke/api/search/screenshot', { params: { url: toolCall.url, apikey: 'gifted' }, timeout: 25000 })
                const img = r.data?.result?.url || r.data?.result || r.data?.url
                if (img && conn && m) await conn.sendMessage(chatId, { image: { url: img }, caption: `📸 ${toolCall.url}` }, { quoted: m })
                return img ? `screenshot: ${img}` : `screenshot failed: ${e.message}`
            } catch { return `screenshot failed: ${e.message}` }
        }
    }

    // webform
    if (t === 'webform') {
        try {
            const puppeteer = require('puppeteer')
            const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
            const page = await browser.newPage()
            await page.goto(toolCall.url, { waitUntil: 'networkidle2', timeout: 30000 })
            const res = []
            for (const action of (toolCall.actions || [])) {
                if (action.type === 'fill') { await page.type(action.selector, action.value.startsWith('$') ? (process.env[action.value.slice(1)] || '') : action.value); res.push(`filled ${action.selector}`) }
                else if (action.type === 'click') { await page.click(action.selector); res.push(`clicked ${action.selector}`) }
                else if (action.type === 'wait') { await new Promise(r => setTimeout(r, action.ms || 1000)) }
                else if (action.type === 'screenshot') {
                    const sp = `workspace/webform_${Date.now()}.png`
                    await page.screenshot({ path: sp })
                    if (conn && m) await conn.sendMessage(chatId, { image: { url: nodePath.resolve(sp) }, caption: '📸 form state' }, { quoted: m })
                }
            }
            await browser.close()
            return res.join('\n')
        } catch (e) { return `webform error: ${e.message}` }
    }

    // ssh
    if (t === 'ssh') {
        const saved = global.db?.data?.settings?.sshServers || {}
        let host, user, port = 22
        if (toolCall.server && saved[toolCall.server]) {
            const s = saved[toolCall.server]; host = s.host; user = s.user; port = s.port || 22
        } else { host = toolCall.host; user = toolCall.user || 'root'; port = toolCall.port || 22 }
        if (!host) return 'ERROR: no SSH host. Save with .ssh save <name> user@host'
        const sshKey = process.env.SSH_PRIVATE_KEY || global.db?.data?.settings?.sshKey
        const keyFile = '/tmp/bera_ssh_key_' + Date.now()
        if (sshKey) await nodeFsPromises.writeFile(keyFile, sshKey, { mode: 0o600 })
        const keyArg = sshKey ? `-i ${keyFile}` : ''
        const safeCmd = (toolCall.cmd || '').replace(/"/g, '\\"')
        const r = await runBash(`ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${port} ${keyArg} ${user}@${host} "${safeCmd}"`, toolCall.timeout || 30000)
        if (sshKey) nodeFsPromises.unlink(keyFile).catch(() => {})
        return r.output || 'SSH done'
    }

    // runcode
    if (t === 'runcode') {
        const lang = (toolCall.lang || toolCall.language || 'node').toLowerCase()
        const code = toolCall.code || ''
        const tmp = `/tmp/bera_code_${Date.now()}`
        if (lang === 'node' || lang === 'javascript' || lang === 'js') {
            await nodeFsPromises.writeFile(`${tmp}.js`, code)
            return (await runBash(`node "${tmp}.js" 2>&1`, toolCall.timeout || 15000)).output || 'no output'
        }
        if (lang === 'python' || lang === 'py') {
            await nodeFsPromises.writeFile(`${tmp}.py`, code)
            return (await runBash(`python3 "${tmp}.py" 2>&1`, toolCall.timeout || 15000)).output || 'no output'
        }
        if (lang === 'bash' || lang === 'sh') return (await runBash(code, toolCall.timeout || 15000)).output || 'no output'
        if (lang === 'ruby' || lang === 'rb') {
            await nodeFsPromises.writeFile(`${tmp}.rb`, code)
            return (await runBash(`ruby "${tmp}.rb" 2>&1`, toolCall.timeout || 15000)).output || 'no output'
        }
        if (lang === 'php') {
            await nodeFsPromises.writeFile(`${tmp}.php`, code)
            return (await runBash(`php "${tmp}.php" 2>&1`, toolCall.timeout || 15000)).output || 'no output'
        }
        return `unsupported lang: ${lang}`
    }

    // install
    if (t === 'install') {
        const pkgs = Array.isArray(toolCall.packages) ? toolCall.packages.join(' ') : (toolCall.packages || '')
        const cwd = toolCall.path ? `cd "${safeWsPath(toolCall.path) || 'workspace'}" && ` : ''
        const mgr = toolCall.manager || 'npm'
        const r = await runBash(`${cwd}${mgr} install ${pkgs} 2>&1`, 120000)
        return r.output?.slice(-2000) || 'installed'
    }

    // lint
    if (t === 'lint') {
        const sp = safeWsPath(toolCall.file || toolCall.path)
        if (!sp) return 'ERROR: path required'
        const r = await runBash(`npx eslint "${sp}" --fix 2>&1 || npx prettier --write "${sp}" 2>&1`, 30000)
        return r.output || 'linting done'
    }

    // codereview
    if (t === 'codereview') {
        let code = toolCall.code || ''
        if (!code && toolCall.file) {
            const sp = safeWsPath(toolCall.file)
            if (sp && nodeFs.existsSync(sp)) code = await nodeFsPromises.readFile(sp, 'utf8')
        }
        const focus = toolCall.focus || 'all'
        const prompt = `You are a senior code reviewer. Review this ${toolCall.lang || 'code'} focusing on ${focus === 'all' ? 'bugs, security, performance, style' : focus}.\n\nFormat:\n🐛 *Bugs*:\n🔒 *Security*:\n⚡ *Performance*:\n🎨 *Style*:\n✅ *What is Good*:\n\nCode:\n\`\`\`\n${code.slice(0,6000)}\n\`\`\``
        return (await callAI([{role:'user',content:prompt}], 30000)) || 'review complete'
    }

    // apidocs
    if (t === 'apidocs') {
        const sp = safeWsPath(toolCall.folder)
        if (!sp) return 'ERROR: folder required'
        const filesR = await runBash(`find "${sp}" -name "*.js" -o -name "*.ts" -o -name "*.py" 2>/dev/null | head -20`, 10000)
        const files = (filesR.output||'').trim().split('\n').filter(Boolean)
        let routes = ''
        for (const f of files.slice(0,5)) {
            const c = await nodeFsPromises.readFile(f,'utf8').catch(()=>'')
            routes += `\n// ${f}\n${c.slice(0,1500)}\n`
        }
        const prompt = `Generate ${toolCall.format === 'openapi' ? 'OpenAPI 3.0 JSON' : 'Markdown API docs'} for:\n${routes.slice(0,5000)}`
        const docs = (await callAI([{role:'user',content:prompt}],30000)) || 'docs generated'
        const outPath = safeWsPath(toolCall.output || `${sp}/API.md`)
        if (outPath) await nodeFsPromises.writeFile(outPath, docs, 'utf8').catch(()=>{})
        return docs.slice(0,2000)
    }

    // regex
    if (t === 'regex') {
        try {
            const re = new RegExp(toolCall.pattern, toolCall.flags || '')
            const tests = toolCall.tests || []
            const results = tests.map(s => { const match = s.match(re); return `${match ? '✅' : '❌'} \`${s}\`${match?.[1] ? ` groups: ${JSON.stringify(match.slice(1))}` : ''}` })
            return `/${toolCall.pattern}/${toolCall.flags||''}\n\n${results.join('\n')}`
        } catch (e) { return `regex error: ${e.message}` }
    }

    // jsonformat
    if (t === 'jsonformat') {
        try {
            const obj = JSON.parse(toolCall.content || toolCall.json || '{}')
            return toolCall.minify ? JSON.stringify(obj) : JSON.stringify(obj, null, 2)
        } catch (e) { return `JSON error: ${e.message}` }
    }

    // csv2json
    if (t === 'csv2json') {
        const sp = safeWsPath(toolCall.file); if (!sp) return 'ERROR: file required'
        const lines = (await nodeFsPromises.readFile(sp,'utf8').catch(()=>'')).trim().split('\n')
        const headers = toolCall.headers !== false ? lines[0].split(',').map(h=>h.trim()) : null
        const data = (headers ? lines.slice(1) : lines).map(l => { const v = l.split(',').map(x=>x.trim()); return headers ? Object.fromEntries(headers.map((h,i)=>[h,v[i]])) : v })
        return JSON.stringify(data, null, 2)
    }

    // json2csv
    if (t === 'json2csv') {
        const sp = safeWsPath(toolCall.file); if (!sp) return 'ERROR: file required'
        const data = JSON.parse(await nodeFsPromises.readFile(sp,'utf8').catch(()=>'[]'))
        if (!Array.isArray(data) || !data.length) return 'ERROR: expected array'
        const headers = Object.keys(data[0])
        return [headers.join(','), ...data.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(','))].join('\n')
    }

    // yaml2json / json2yaml / xml2json
    if (t === 'yaml2json') { const sp=safeWsPath(toolCall.file); return sp ? (await runBash(`node -e "const y=require('js-yaml'),fs=require('fs');console.log(JSON.stringify(y.load(fs.readFileSync('${sp}','utf8')),null,2))"`,10000)).output||'failed' : 'ERROR: file required' }
    if (t === 'json2yaml') { const sp=safeWsPath(toolCall.file); return sp ? (await runBash(`node -e "const y=require('js-yaml'),fs=require('fs');console.log(y.dump(JSON.parse(fs.readFileSync('${sp}','utf8'))))"`,10000)).output||'failed' : 'ERROR: file required' }
    if (t === 'xml2json') { const sp=safeWsPath(toolCall.file); return sp ? (await runBash(`node -e "const xml2js=require('xml2js'),fs=require('fs');xml2js.parseString(fs.readFileSync('${sp}'),(_,r)=>console.log(JSON.stringify(r,null,2)))"`,10000)).output||'failed' : 'ERROR: file required' }

    // git tools
    const getGitPath = () => safeWsPath(toolCall.path || 'workspace/')
    if (t === 'gitinit') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git init && git add -A && git commit -m "${toolCall.message||'Initial commit'}" 2>&1`,30000)).output||'initialized' : 'ERROR: path' }
    if (t === 'gitstatus') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git status 2>&1`,10000)).output||'done' : 'ERROR: path' }
    if (t === 'gitdiff') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git diff ${toolCall.commit||''} 2>&1 | head -100`,10000)).output||'no diff' : 'ERROR: path' }
    if (t === 'gitlog') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git log --oneline -${toolCall.limit||10} 2>&1`,10000)).output||'no log' : 'ERROR: path' }
    if (t === 'gitbranch') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git branch ${toolCall.create ? '-b '+toolCall.create : ''} 2>&1`,10000)).output||'done' : 'ERROR: path' }
    if (t === 'gitstash') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git stash ${toolCall.action||'push'} 2>&1`,10000)).output||'stashed' : 'ERROR: path' }
    if (t === 'gitpull') { const sp=getGitPath(); return sp ? (await runBash(`cd "${sp}" && git pull 2>&1`,30000)).output||'pulled' : 'ERROR: path' }
    if (t === 'gitpush') {
        const sp = getGitPath(); if (!sp) return 'ERROR: path'
        const tok = toolCall.token || process.env.GIT_TOKEN || global.db?.data?.settings?.gitToken
        let remote = toolCall.remote || ''
        if (tok && remote.includes('github.com')) remote = remote.replace('https://', `https://${tok}@`)
        const r = await runBash(`cd "${sp}" && git add -A && git commit -m "${toolCall.message||'Bot commit'}" --allow-empty && git push ${remote} ${toolCall.branch||'HEAD'} 2>&1`,60000)
        return r.output || 'pushed'
    }

    // deploy helpers
    const deployRun = async (platform, folder, name, opts) => {
        const sp = safeWsPath(folder); if (!sp) return 'ERROR: folder not allowed'
        if (platform === 'vercel') {
            const tok = opts.token || process.env.VERCEL_TOKEN || global.db?.data?.settings?.vercelToken
            const r = await runBash(`cd "${sp}" && npx vercel --yes ${tok ? '--token '+tok : ''} --name "${name||nodePath.basename(sp)}" 2>&1`,120000)
            return r.output?.slice(-2000)||'deploy attempted'
        }
        if (platform === 'railway') {
            const tok = opts.token || process.env.RAILWAY_TOKEN || global.db?.data?.settings?.railwayToken
            if (tok) process.env.RAILWAY_TOKEN = tok
            return (await runBash(`cd "${sp}" && npx railway up 2>&1`,120000)).output?.slice(-2000)||'deploy attempted'
        }
        if (platform === 'netlify') {
            const tok = opts.token || process.env.NETLIFY_TOKEN
            return (await runBash(`cd "${sp}" && npx netlify deploy --dir . --prod ${tok ? '--auth '+tok : ''} 2>&1`,120000)).output?.slice(-2000)||'deploy attempted'
        }
        if (platform === 'fly') return (await runBash(`cd "${sp}" && flyctl deploy 2>&1`,120000)).output?.slice(-2000)||'deploy attempted'
        if (platform === 'render') return 'Render: push to GitHub and connect via render.com dashboard.'
        return `unsupported platform: ${platform}`
    }
    if (t === 'deploy_vercel') return deployRun('vercel', toolCall.folder, toolCall.name, toolCall)
    if (t === 'deploy_railway') return deployRun('railway', toolCall.folder, toolCall.name, toolCall)
    if (t === 'deploy_netlify') return deployRun('netlify', toolCall.folder, toolCall.name, toolCall)
    if (t === 'deploy_render') return deployRun('render', toolCall.folder, toolCall.name, toolCall)
    if (t === 'deploy_fly') return deployRun('fly', toolCall.folder, toolCall.name, toolCall)
    if (t === 'deploy_sky' || t === 'deploy') {
        if (toolCall.repoUrl) {
            const name = toolCall.name || 'bera-app'
            const r = await runBash(`cd workspace && git clone "${toolCall.repoUrl}" && cd "$(basename ${toolCall.repoUrl} .git)" && npm install 2>&1 | tail -5 && pm2 start . --name "${name}" 2>&1`,120000)
            return r.output?.slice(-2000)||'deploy attempted'
        }
        const sp = safeWsPath(toolCall.folder || 'workspace/'); if (!sp) return 'ERROR: folder required'
        return (await runBash(`cd "${sp}" && npm install 2>&1 | tail -3 && pm2 start . --name "${toolCall.name||'bera-app'}" 2>&1`,120000)).output?.slice(-2000)||'deployed'
    }

    // db
    if (t === 'db') {
        const dbFile = safeWsPath(toolCall.file || toolCall.db) || 'workspace/data.sqlite'
        const action = toolCall.action || 'query'
        if (action === 'query' || !toolCall.action) {
            const sql = (toolCall.sql||'').replace(/"/g,'\\"').replace(/'/g,"'")
            const r = await runBash(`node -e "const db=require('better-sqlite3')('${dbFile}');try{const r=db.prepare(\\"${sql}\\").all();console.log(JSON.stringify(r,null,2))}catch(e){console.log('ERROR:',e.message)}"`,15000)
            return r.output?.slice(0,3000)||'query done'
        }
        if (action === 'tables') {
            const r = await runBash(`node -e "const db=require('better-sqlite3')('${dbFile}');console.log(JSON.stringify(db.prepare(\\"SELECT name FROM sqlite_master WHERE type='table'\\").all(),null,2))"`,10000)
            return r.output||'tables retrieved'
        }
        return 'DB action not supported'
    }

    // db_migrate
    if (t === 'db_migrate') {
        const dbFile = safeWsPath(toolCall.file || 'workspace/data.sqlite')
        if (toolCall.action === 'create') {
            const migPath = `workspace/migrations/${Date.now()}_${toolCall.name||'migration'}.sql`
            nodeFs.mkdirSync('workspace/migrations', { recursive: true })
            await nodeFsPromises.writeFile(migPath, toolCall.sql || '-- Write your SQL here\n')
            return `migration created: ${migPath}`
        }
        if (toolCall.action === 'up') {
            const r = await runBash(`ls workspace/migrations/*.sql 2>/dev/null | sort | while read f; do echo "Running $f"; node -e "const db=require('better-sqlite3')('${dbFile}');try{db.exec(require('fs').readFileSync('$f','utf8'));console.log('OK')}catch(e){console.log('ERR:',e.message)}"; done`,30000)
            return r.output||'migrations applied'
        }
        return 'migration action done'
    }

    // cron
    if (t === 'cron') {
        const db = global.db?.data; if (!db) return 'ERROR: db not available'
        if (!db.settings) db.settings = {}
        if (!db.settings.agentCrons) db.settings.agentCrons = {}
        const crons = db.settings.agentCrons
        if (toolCall.action === 'add') {
            if (Object.keys(crons).length >= 20) return 'ERROR: max 20 crons'
            crons[toolCall.id] = { schedule: toolCall.schedule, task: toolCall.task, chat: toolCall.chat||chatId, active: true }
            await global.db.write().catch(()=>{})
            if (nodeCron && nodeCron.validate(toolCall.schedule)) {
                nodeCron.schedule(toolCall.schedule, async () => {
                    const { generateAdvancedReply } = require('./beraai')
                    const r = await generateAdvancedReply(crons[toolCall.id]?.task||'', chatId, conn, m, {})
                    if (conn) await conn.sendMessage(chatId, { text: `⏰ *Cron: ${toolCall.id}*\n${r?.reply||'done'}` }).catch(()=>{})
                }, { timezone: 'Africa/Nairobi' })
            }
            return `✅ cron *${toolCall.id}* scheduled: ${toolCall.schedule}\nTask: ${toolCall.task}`
        }
        if (toolCall.action === 'list') {
            if (!Object.keys(crons).length) return 'no cron jobs'
            return Object.entries(crons).map(([id,c]) => `⏰ *${id}*\n  ${c.schedule} — ${c.task}\n  ${c.active?'✅ active':'⏸ paused'}`).join('\n\n')
        }
        if (toolCall.action === 'remove') { delete crons[toolCall.id]; await global.db.write().catch(()=>{}); return `cron ${toolCall.id} removed` }
        if (toolCall.action === 'pause') { if (crons[toolCall.id]) crons[toolCall.id].active=false; await global.db.write().catch(()=>{}); return `paused: ${toolCall.id}` }
        if (toolCall.action === 'resume') { if (crons[toolCall.id]) crons[toolCall.id].active=true; await global.db.write().catch(()=>{}); return `resumed: ${toolCall.id}` }
        if (toolCall.action === 'run_now') {
            const c = crons[toolCall.id]; if (!c) return 'cron not found'
            const { generateAdvancedReply } = require('./beraai')
            const r = await generateAdvancedReply(c.task, chatId, conn, m, {})
            return r?.reply || 'done'
        }
        return 'unknown cron action'
    }

    // monitor
    if (t === 'monitor') {
        const db = global.db?.data; if (!db) return 'ERROR: db not available'
        if (!db.settings.monitors) db.settings.monitors = {}
        const mons = db.settings.monitors
        if (toolCall.action === 'add') {
            mons[toolCall.id] = { url: toolCall.url, interval: toolCall.interval||300, chat: toolCall.chat||chatId, status: 'unknown', history: [] }
            await global.db.write().catch(()=>{})
            const intv = setInterval(async () => {
                const mon = global.db?.data?.settings?.monitors?.[toolCall.id]; if (!mon) return clearInterval(intv)
                try {
                    const start = Date.now()
                    await axios.get(mon.url, { timeout: 10000 })
                    const ms = Date.now()-start, prev = mon.status
                    mon.status='up'; mon.lastCheck=new Date().toISOString(); mon.responseTime=ms
                    if (prev==='down'&&conn) await conn.sendMessage(mon.chat, { text: `✅ *${toolCall.id}* is back online! (${ms}ms)` }).catch(()=>{})
                    if (mon.history) mon.history = [...mon.history.slice(-9), { time: new Date().toISOString(), status:'up', ms }]
                } catch (e) {
                    const prev = mon.status; mon.status='down'; mon.lastCheck=new Date().toISOString()
                    if (prev!=='down'&&conn) await conn.sendMessage(mon.chat, { text: `🔴 *${toolCall.id}* is DOWN!\n${mon.url}\n${e.message}` }).catch(()=>{})
                    if (mon.history) mon.history = [...mon.history.slice(-9), { time: new Date().toISOString(), status:'down' }]
                }
                await global.db.write().catch(()=>{})
            }, (toolCall.interval||300)*1000)
            if (!global._monitorIntervals) global._monitorIntervals = {}
            global._monitorIntervals[toolCall.id] = intv
            return `✅ monitor *${toolCall.id}* started for ${toolCall.url}`
        }
        if (toolCall.action === 'list') {
            if (!Object.keys(mons).length) return 'no monitors'
            return Object.entries(mons).map(([id,mon]) => `${mon.status==='up'?'🟢':mon.status==='down'?'🔴':'⚪'} *${id}*\n  ${mon.url}\n  last: ${mon.lastCheck||'never'}`).join('\n\n')
        }
        if (toolCall.action === 'remove') {
            delete mons[toolCall.id]
            if (global._monitorIntervals?.[toolCall.id]) clearInterval(global._monitorIntervals[toolCall.id])
            await global.db.write().catch(()=>{})
            return `monitor ${toolCall.id} removed`
        }
        if (toolCall.action === 'check') {
            const mon = mons[toolCall.id]; if (!mon) return `no monitor: ${toolCall.id}`
            try { const s=Date.now(); await axios.get(mon.url,{timeout:10000}); return `✅ ${toolCall.id} UP (${Date.now()-s}ms)` } catch (e) { return `🔴 ${toolCall.id} DOWN: ${e.message}` }
        }
        if (toolCall.action === 'history') {
            const mon = mons[toolCall.id]; if (!mon) return `no monitor: ${toolCall.id}`
            return (mon.history||[]).map(h=>`${h.status==='up'?'🟢':'🔴'} ${h.time}${h.ms?` (${h.ms}ms)`:''}`).join('\n')||'no history'
        }
        return 'unknown monitor action'
    }

    // syswatch / netcheck / portcheck
    if (t === 'syswatch') {
        if (toolCall.action === 'start') {
            const intv = setInterval(async () => {
                const info = await systemInfo()
                if (conn) await conn.sendMessage(toolCall.chat||chatId, { text: `🖥️ *Syswatch*\n${info}` }).catch(()=>{})
            }, (toolCall.interval||60)*1000)
            if (global._syswatchInterval) clearInterval(global._syswatchInterval)
            global._syswatchInterval = intv
            return `✅ syswatch started (every ${toolCall.interval||60}s)`
        }
        if (toolCall.action === 'stop') { if (global._syswatchInterval) clearInterval(global._syswatchInterval); return '🛑 syswatch stopped' }
        return systemInfo()
    }
    if (t === 'netcheck') {
        const hosts = toolCall.hosts || ['8.8.8.8']
        const results = await Promise.all(hosts.map(async h => {
            const r = await runBash(`ping -c 1 -W ${toolCall.timeout||5} "${h}" 2>&1`,10000)
            return `${r.output?.includes('1 received')?'🟢':'🔴'} ${h}`
        }))
        return results.join('\n')
    }
    if (t === 'portcheck') {
        const results = await Promise.all((toolCall.ports||[80]).map(async p => {
            const r = await runBash(`nc -z -w3 "${toolCall.host}" ${p} 2>&1 && echo OPEN || echo CLOSED`,10000)
            return `${r.output?.includes('OPEN')?'🟢':'🔴'} ${toolCall.host}:${p}`
        }))
        return results.join('\n')
    }

    // remember / recall / forget
    if (t === 'remember') { saveMemory(chatId, toolCall.key, toolCall.value); return `✅ remembered: ${toolCall.key} = ${toolCall.value}` }
    if (t === 'recall') { const v=getMemory(chatId)[toolCall.key]; return v!==undefined ? `🧠 ${toolCall.key}: ${v}` : `no memory: ${toolCall.key}` }
    if (t === 'recall_all') { const m=getMemory(chatId); const k=Object.keys(m); return k.length ? '🧠 *Memories:*\n'+k.map(k=>`• *${k}*: ${m[k]}`).join('\n') : 'no memories saved' }
    if (t === 'forget') { deleteMemory(chatId, toolCall.key); return `deleted: ${toolCall.key}` }
    if (t === 'forget_all') { clearMemory(chatId); return 'all memories cleared' }

    // note
    if (t === 'note') {
        const db = global.db?.data
        if (!db.users) db.users = {}
        if (!db.users[chatId]) db.users[chatId] = {}
        if (!db.users[chatId].notes) db.users[chatId].notes = {}
        const notes = db.users[chatId].notes
        if (toolCall.action === 'save') { notes[toolCall.title]={content:toolCall.content,tags:toolCall.tags||[],saved:new Date().toISOString()}; await global.db.write().catch(()=>{}); return `✅ note saved: ${toolCall.title}` }
        if (toolCall.action === 'get') { const n=notes[toolCall.title]; return n ? `📝 *${toolCall.title}*\n${n.content}` : `no note: ${toolCall.title}` }
        if (toolCall.action === 'list') { const k=Object.keys(notes).filter(k=>!toolCall.tag||(notes[k].tags||[]).includes(toolCall.tag)); return k.length ? '📝 *Notes:*\n'+k.map(k=>`• ${k}`).join('\n') : 'no notes' }
        if (toolCall.action === 'search') { const q=(toolCall.query||'').toLowerCase(); const m=Object.entries(notes).filter(([k,v])=>k.toLowerCase().includes(q)||v.content.toLowerCase().includes(q)); return m.length ? m.map(([k,v])=>`📝 *${k}*\n${v.content.slice(0,200)}`).join('\n\n') : 'no matches' }
        if (toolCall.action === 'delete') { delete notes[toolCall.title]; await global.db.write().catch(()=>{}); return `deleted: ${toolCall.title}` }
        return 'unknown note action'
    }

    // calc / stats / unit_convert / currency / date_calc
    if (t === 'calc') {
        try {
            const result = mathjs ? mathjs.evaluate(toolCall.expr||'0') : eval(String(toolCall.expr||'0').replace(/[^0-9+\-*/.() ]/g,''))
            return `🧮 ${toolCall.expr} = *${result}*`
        } catch (e) { return `calc error: ${e.message}` }
    }
    if (t === 'stats') {
        try {
            const d = toolCall.data||[]; const ops = toolCall.ops||['mean']
            const res = ops.map(op => {
                if (!mathjs) return null
                if (op==='mean') return `Mean: ${mathjs.mean(d)}`
                if (op==='median') return `Median: ${mathjs.median(d)}`
                if (op==='std') return `Std: ${mathjs.std(d).toFixed(4)}`
                if (op==='min') return `Min: ${Math.min(...d)}`
                if (op==='max') return `Max: ${Math.max(...d)}`
                if (op==='sum') return `Sum: ${d.reduce((a,b)=>a+b,0)}`
                return null
            }).filter(Boolean)
            return `📊 Stats:\n${res.join('\n')}`
        } catch (e) { return `stats error: ${e.message}` }
    }
    if (t === 'unit_convert') {
        try {
            if (mathjs) { const r=mathjs.evaluate(`${toolCall.value} ${toolCall.from} to ${toolCall.to}`); return `📏 ${toolCall.value} ${toolCall.from} = *${r}*` }
            return `📏 unit conversion requires mathjs`
        } catch (e) { return `unit error: ${e.message}` }
    }
    if (t === 'currency') {
        try {
            const r = await axios.get(`https://open.er-api.com/v6/latest/${toolCall.from.toUpperCase()}`, { timeout: 10000 })
            const rate = r.data?.rates?.[toolCall.to.toUpperCase()]
            if (!rate) return `❌ rate not found: ${toolCall.to}`
            return `💱 ${toolCall.amount} ${toolCall.from.toUpperCase()} = *${(toolCall.amount*rate).toFixed(2)} ${toolCall.to.toUpperCase()}*`
        } catch (e) { return `currency error: ${e.message}` }
    }
    if (t === 'date_calc') {
        try {
            const d1=new Date(toolCall.date1), d2=toolCall.date2?new Date(toolCall.date2):new Date()
            const diffDays=Math.floor(Math.abs(d2-d1)/86400000)
            const ops=toolCall.ops||['diff_days']
            const res=ops.map(op=>{
                if(op==='diff_days') return `Days between: ${diffDays}`
                if(op.startsWith('add_days:')) return `Add ${op.split(':')[1]} days: ${new Date(d1.getTime()+parseInt(op.split(':')[1])*86400000).toDateString()}`
                if(op==='weekday') return `${toolCall.date1} is: ${d1.toLocaleString('en-US',{weekday:'long'})}`
                return null
            }).filter(Boolean)
            return `📅 ${res.join('\n')}`
        } catch (e) { return `date error: ${e.message}` }
    }

    // send_email / send_webhook / send_telegram / send_discord
    if (t === 'send_email') {
        const key = process.env.SENDGRID_API_KEY; if (!key) return '❌ set SENDGRID_API_KEY env var'
        try {
            await axios.post('https://api.sendgrid.com/v3/mail/send', { personalizations:[{to:[{email:toolCall.to}]}], from:{email:process.env.FROM_EMAIL||'noreply@bera.ai'}, subject:toolCall.subject||'Message from Bera', content:[{type:toolCall.html?'text/html':'text/plain',value:toolCall.body||''}] }, { headers:{Authorization:`Bearer ${key}`} })
            return `✅ email sent to ${toolCall.to}`
        } catch (e) { return `email error: ${e.response?.data?.errors?.[0]?.message||e.message}` }
    }
    if (t === 'send_webhook') {
        try { await axios.post(toolCall.url, toolCall.payload||{}, { headers:toolCall.headers||{} }); return `✅ webhook sent to ${toolCall.url}` } catch (e) { return `webhook error: ${e.message}` }
    }
    if (t === 'send_telegram') {
        const tok = toolCall.token||process.env.TELEGRAM_BOT_TOKEN; if (!tok) return '❌ no telegram token'
        try { await axios.post(`https://api.telegram.org/bot${tok}/sendMessage`, { chat_id: toolCall.chat_id, text: toolCall.text }); return '✅ telegram sent' } catch (e) { return `telegram error: ${e.message}` }
    }
    if (t === 'send_discord') {
        const wh = toolCall.webhook||process.env.DISCORD_WEBHOOK; if (!wh) return '❌ no discord webhook'
        try { const p={content:toolCall.content}; if (toolCall.embed) p.embeds=[toolCall.embed]; await axios.post(wh,p); return '✅ discord sent' } catch (e) { return `discord error: ${e.message}` }
    }

    // project tools
    if (t === 'project_deps') { const sp=safeWsPath(toolCall.folder); return sp ? (await runBash(`cat "${sp}/package.json" 2>/dev/null || cat "${sp}/requirements.txt" 2>/dev/null || echo "no deps file"`,10000)).output||'done' : 'ERROR: folder' }
    if (t === 'project_build') { const sp=safeWsPath(toolCall.folder); return sp ? (await runBash(`cd "${sp}" && ${toolCall.cmd||'npm run build'} 2>&1`,120000)).output?.slice(-3000)||'built' : 'ERROR: folder' }
    if (t === 'project_test') { const sp=safeWsPath(toolCall.folder); if (!sp) return 'ERROR: folder'; const fw=toolCall.framework||'auto'; const cmd=fw==='jest'?'npx jest':fw==='mocha'?'npx mocha':fw==='pytest'?'python3 -m pytest':fw==='vitest'?'npx vitest run':'npm test'; return (await runBash(`cd "${sp}" && ${cmd} 2>&1`,120000)).output?.slice(-3000)||'tested' }
    if (t === 'project_analyze' || t === 'project_health' || t === 'project_readme') {
        const sp = safeWsPath(toolCall.folder); if (!sp) return 'ERROR: folder'
        const fr = await runBash(`find "${sp}" -type f | head -20 | xargs wc -l 2>/dev/null | tail -3`,10000)
        const pr = await runBash(`cat "${sp}/package.json" 2>/dev/null | head -30`,5000)
        const prompt = `Analyze this project and provide ${t==='project_readme'?'a complete README.md':'a health report: tech stack, issues, recommendations'}.\n\nFiles:\n${fr.output}\nDeps:\n${pr.output?.slice(0,800)}`
        const result = (await callAI([{role:'user',content:prompt}],30000))||'analysis done'
        if (t==='project_readme') { const op=safeWsPath(toolCall.output||`${sp}/README.md`); if (op) await nodeFsPromises.writeFile(op,result,'utf8').catch(()=>{}) }
        return result.slice(0,3000)
    }

    // docker
    if (t === 'docker') {
        const a = toolCall.action||'ps'
        if (a==='ps') return (await runBash(`docker ps ${toolCall.all?'-a':''} --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1`,15000)).output||'no containers'
        if (a==='images') return (await runBash(`docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" 2>&1`,15000)).output||'no images'
        if (a==='build') { const sp=safeWsPath(toolCall.path); return sp ? (await runBash(`cd "${sp}" && docker build -t "${toolCall.tag||'bera-app:latest'}" . 2>&1`,300000)).output?.slice(-3000)||'built' : 'ERROR: path' }
        if (a==='run') {
            const ports = Object.entries(toolCall.ports||{}).map(([h,c])=>`-p ${h}:${c}`).join(' ')
            const envs = Object.entries(toolCall.env||{}).map(([k,v])=>`-e ${k}="${v}"`).join(' ')
            return (await runBash(`docker run -d ${ports} ${envs} ${toolCall.image} 2>&1`,30000)).output||'started'
        }
        if (a==='stop') return (await runBash(`docker stop "${toolCall.container}" 2>&1`,15000)).output||'stopped'
        if (a==='logs') return (await runBash(`docker logs --tail=${toolCall.lines||50} "${toolCall.container}" 2>&1`,15000)).output?.slice(-3000)||'no logs'
        if (a==='compose_up') { const sp=safeWsPath(toolCall.path); return sp ? (await runBash(`cd "${sp}" && docker-compose up -d ${(toolCall.services||[]).join(' ')} 2>&1`,120000)).output?.slice(-3000)||'started' : 'ERROR: path' }
        return 'unknown docker action'
    }

    // k8s
    if (t === 'k8s') {
        if (!process.env.KUBECONFIG_CONTENT) return '❌ set KUBECONFIG_CONTENT env var (base64 kubeconfig)'
        const a = toolCall.action
        if (a==='get_pods') return (await runBash(`kubectl get pods -n ${toolCall.namespace||'default'} 2>&1`,15000)).output||'no pods'
        if (a==='deploy') { const sp=safeWsPath(toolCall.yaml); return sp ? (await runBash(`kubectl apply -f "${sp}" 2>&1`,30000)).output||'deployed' : 'ERROR: yaml' }
        if (a==='scale') return (await runBash(`kubectl scale deployment ${toolCall.deployment} --replicas=${toolCall.replicas} 2>&1`,15000)).output||'scaled'
        return 'unknown k8s action'
    }

    // terraform
    if (t === 'terraform') {
        const sp = safeWsPath(toolCall.path); if (!sp) return 'ERROR: path'
        const a = toolCall.action||'plan'
        if (a==='init') return (await runBash(`cd "${sp}" && terraform init 2>&1`,120000)).output?.slice(-2000)||'init done'
        if (a==='plan') return (await runBash(`cd "${sp}" && terraform plan 2>&1`,120000)).output?.slice(-3000)||'plan done'
        if (a==='apply') { if (!toolCall.auto_approve) return '⚠️ set auto_approve:true to confirm'; return (await runBash(`cd "${sp}" && terraform apply -auto-approve 2>&1`,300000)).output?.slice(-3000)||'applied' }
        return 'unknown terraform action'
    }

    // secret
    if (t === 'secret') {
        const db = global.db?.data; if (!db.settings._secrets) db.settings._secrets = {}
        const crypto = require('crypto')
        const KEY = (process.env.SESSION_SECRET||'00000000000000000000000000000000').slice(0,32).padEnd(32,'0')
        const enc = (text) => { const iv=crypto.randomBytes(16), c=crypto.createCipheriv('aes-256-gcm',KEY,iv), e=Buffer.concat([c.update(text,'utf8'),c.final()]); return iv.toString('hex')+':'+e.toString('hex')+':'+c.getAuthTag().toString('hex') }
        const dec = (data) => { const [iv,e,tag]=data.split(':'), d=crypto.createDecipheriv('aes-256-gcm',KEY,Buffer.from(iv,'hex')); d.setAuthTag(Buffer.from(tag,'hex')); return Buffer.concat([d.update(Buffer.from(e,'hex')),d.final()]).toString('utf8') }
        const ns = `${toolCall.scope||'global'}_${chatId}`
        if (!db.settings._secrets[ns]) db.settings._secrets[ns] = {}
        if (toolCall.action==='set') { db.settings._secrets[ns][toolCall.key]=enc(String(toolCall.value)); await global.db.write().catch(()=>{}); return `✅ secret ${toolCall.key} stored` }
        if (toolCall.action==='get') { const e=db.settings._secrets[ns][toolCall.key]; return e ? `🔐 ${toolCall.key}: ${dec(e)}` : `not found: ${toolCall.key}` }
        if (toolCall.action==='list') { const k=Object.keys(db.settings._secrets[ns]||{}); return k.length ? `🔐 Secrets:\n${k.map(k=>`• ${k}`).join('\n')}` : 'no secrets' }
        return 'unknown secret action'
    }

    // tunnel / webhook
    if (t === 'tunnel') {
        if (toolCall.action==='start') {
            const port=toolCall.port||3000, sub=toolCall.subdomain?`--subdomain=${toolCall.subdomain}`:''
            const r = await runBash(`nohup npx localtunnel --port ${port} ${sub} > /tmp/lt_${port}.log 2>&1 & sleep 3 && cat /tmp/lt_${port}.log`,20000)
            const match = r.output?.match(/https:\/\/[^\s]+\.loca\.lt/)
            return match ? `🌐 Tunnel: ${match[0]}` : r.output||'tunnel started'
        }
        if (toolCall.action==='stop') { await runBash(`pkill -f localtunnel 2>/dev/null`,5000); return '🛑 tunnel stopped' }
        return (await runBash(`ps aux | grep localtunnel | grep -v grep`,5000)).output||'no tunnels'
    }
    if (t === 'webhook') {
        if (toolCall.action==='listen') {
            const db=global.db?.data; if (!db.settings._webhooks) db.settings._webhooks={}
            db.settings._webhooks[toolCall.path||'/webhook']={chat:toolCall.callback_chat||chatId}
            await global.db.write().catch(()=>{})
            return `✅ webhook listener: ${toolCall.path||'/webhook'}`
        }
        return 'webhook done'
    }

    // benchmark
    if (t === 'benchmark') {
        if (!toolCall.url) return 'provide url'
        const r = await runBash(`npx autocannon -c ${toolCall.concurrency||10} -d 5 "${toolCall.url}" 2>&1 | tail -20`,60000)
        return r.output||'benchmark done'
    }

    // logs
    if (t === 'logs') {
        const file = safeWsPath(toolCall.file); if (!file) return 'ERROR: file required'
        if (toolCall.action==='search') return (await runBash(`grep -i "${(toolCall.query||'error').replace(/"/g,'')}" "${file}" | tail -${toolCall.lines||50}`,10000)).output||'no matches'
        if (toolCall.action==='tail') return (await runBash(`tail -n ${toolCall.lines||50} "${file}"`,10000)).output||'no content'
        return 'unknown logs action'
    }

    // finetune
    if (t === 'finetune') {
        const key = process.env.OPENAI_API_KEY; if (!key) return '❌ OPENAI_API_KEY required'
        try {
            if (toolCall.action==='list') { const r=await axios.get('https://api.openai.com/v1/fine_tuning/jobs',{headers:{Authorization:`Bearer ${key}`}}); return (r.data?.data?.slice(0,5)||[]).map(j=>`${j.id}: ${j.status}`).join('\n')||'no jobs' }
            if (toolCall.action==='status') { const r=await axios.get(`https://api.openai.com/v1/fine_tuning/jobs/${toolCall.job_id}`,{headers:{Authorization:`Bearer ${key}`}}); return JSON.stringify(r.data,null,2).slice(0,1000) }
        } catch (e) { return `finetune error: ${e.message}` }
        return 'use action=list or action=status'
    }

    // rag
    if (t === 'rag') {
        const db = global.db?.data; if (!db.settings._rag) db.settings._rag = {}
        if (toolCall.action==='index') {
            const files = Array.isArray(toolCall.files)?toolCall.files:[toolCall.files]
            let docs = []
            for (const f of files) {
                const sp = safeWsPath(f); if (!sp) continue
                const r = await runBash(`find "${sp.replace('*','')}" -name "*.md" -o -name "*.txt" 2>/dev/null | head -20`,10000)
                const fl = r.output?.trim().split('\n').filter(Boolean)||[]
                for (const file of fl) { const c=await nodeFsPromises.readFile(file,'utf8').catch(()=>''); docs.push({file,content:c.slice(0,2000)}) }
            }
            const col = toolCall.collection||'default'
            db.settings._rag[col] = docs
            await global.db.write().catch(()=>{})
            return `✅ indexed ${docs.length} docs in collection: ${col}`
        }
        if (toolCall.action==='query') {
            const col = toolCall.collection||'default', docs=db.settings._rag[col]||[]
            if (!docs.length) return '❌ no docs indexed — use rag action=index first'
            const ctx = docs.slice(0,toolCall.top_k||5).map(d=>`[${d.file}]\n${d.content}`).join('\n---\n')
            return (await callAI([{role:'user',content:`Based on:\n\n${ctx}\n\nAnswer: ${toolCall.query}`}],30000))||'no answer'
        }
        return 'unknown rag action'
    }

    // playwright
    if (t === 'playwright') {
        if (toolCall.action==='screenshot') {
            try {
                const { chromium } = require('playwright')
                const browser = await chromium.launch({ args: ['--no-sandbox'] })
                const page = await browser.newPage()
                await page.goto(toolCall.url, { timeout: 30000 })
                const out = `workspace/pw_${Date.now()}.png`
                if (toolCall.selector) await page.locator(toolCall.selector).screenshot({ path: out })
                else await page.screenshot({ path: out })
                await browser.close()
                if (conn && m) await conn.sendMessage(chatId, { image:{ url: nodePath.resolve(out) }, caption:`📸 ${toolCall.url}` }, { quoted: m })
                return `screenshot: ${out}`
            } catch (e) { return `playwright error: ${e.message}` }
        }
        return 'playwright action not available'
    }

    // mobile
    if (t === 'mobile') { return 'Mobile device testing requires local simulator/emulator setup.' }

    // web3
    if (t === 'web3') {
        if (toolCall.action==='balance') {
            try {
                const rpcs = { ethereum:'https://eth.public-rpc.com', bsc:'https://bsc-dataseed.binance.org', polygon:'https://polygon-rpc.com' }
                const rpc = rpcs[toolCall.chain||'ethereum']||rpcs.ethereum
                const r = await axios.post(rpc, { jsonrpc:'2.0', method:'eth_getBalance', params:[toolCall.address,'latest'], id:1 })
                const eth = parseInt(r.data?.result||'0x0', 16) / 1e18
                return `💎 Balance: ${eth.toFixed(6)} ETH (${toolCall.chain||'ethereum'})\nAddress: ${toolCall.address}`
            } catch (e) { return `web3 error: ${e.message}` }
        }
        return 'web3 action not supported. Use action=balance'
    }

    // ml
    if (t === 'ml') {
        if (toolCall.action==='classify') {
            const r = await callAI([{role:'user',content:`Sentiment analysis. Return JSON {"label":"positive|negative|neutral","confidence":0.0-1.0,"explanation":""}.\n\nText: ${toolCall.text}`}],10000)
            return r||'classification failed'
        }
        if (toolCall.action==='transcribe') {
            const sp = safeWsPath(toolCall.audio); if (!sp) return 'ERROR: audio file'
            return transcribeAudio({ path: sp })
        }
        return `ml action ${toolCall.action} requires specialized setup`
    }

    // pdf
    if (t === 'pdf') {
        if (toolCall.action==='generate') {
            try {
                const puppeteer = require('puppeteer')
                const browser = await puppeteer.launch({ args:['--no-sandbox'] })
                const page = await browser.newPage()
                const htmlSrc = safeWsPath(toolCall.html)
                if (htmlSrc && nodeFs.existsSync(htmlSrc)) await page.setContent(await nodeFsPromises.readFile(htmlSrc,'utf8'))
                else if (typeof toolCall.html==='string' && toolCall.html.startsWith('http')) await page.goto(toolCall.html, { waitUntil:'networkidle2' })
                else await page.setContent(toolCall.html||'<h1>Empty</h1>')
                const out = safeWsPath(toolCall.output||'workspace/output.pdf')
                nodeFs.mkdirSync(nodePath.dirname(out||'workspace'), { recursive:true })
                await page.pdf({ path:out, format:'A4' })
                await browser.close()
                if (conn && m && out) await conn.sendMessage(chatId, { document:{ url:nodePath.resolve(out) }, fileName:nodePath.basename(out), mimetype:'application/pdf' }, { quoted:m })
                return `✅ PDF: ${out}`
            } catch (e) { return `pdf error: ${e.message}` }
        }
        if (toolCall.action==='extract_text') { const sp=safeWsPath(toolCall.file); return sp ? (await runBash(`pdftotext "${sp}" - 2>&1`,30000)).output?.slice(0,3000)||'failed' : 'ERROR: file' }
        if (toolCall.action==='merge') {
            const files=(toolCall.files||[]).map(f=>safeWsPath(f)).filter(Boolean), out=safeWsPath(toolCall.output||'workspace/merged.pdf')
            return (await runBash(`pdfunite ${files.join(' ')} "${out}" 2>&1`,30000)).output||`✅ merged: ${out}`
        }
        return 'unknown pdf action'
    }

    // excel
    if (t === 'excel') {
        if (toolCall.action==='create') {
            try {
                const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook()
                for (const [name,rows] of Object.entries(toolCall.sheets||{Sheet1:[['Name','Value']]})) { const ws=wb.addWorksheet(name); rows.forEach(r=>ws.addRow(r)) }
                const out = safeWsPath(toolCall.name||'workspace/output.xlsx')
                nodeFs.mkdirSync(nodePath.dirname(out||'workspace'), { recursive:true })
                await wb.xlsx.writeFile(out)
                if (conn && m && out) await conn.sendMessage(chatId, { document:{ url:nodePath.resolve(out) }, fileName:nodePath.basename(out), mimetype:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { quoted:m })
                return `✅ Excel: ${out}`
            } catch (e) { return `excel error: ${e.message}` }
        }
        if (toolCall.action==='read') {
            try {
                const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook()
                const sp = safeWsPath(toolCall.file); if (!sp) return 'ERROR: file'
                await wb.xlsx.readFile(sp)
                const ws = wb.getWorksheet(toolCall.sheet||1), rows=[]
                ws.eachRow(r=>rows.push(r.values.slice(1)))
                return JSON.stringify(rows,null,2).slice(0,3000)
            } catch (e) { return `excel read error: ${e.message}` }
        }
        return 'unknown excel action'
    }

    // audio tools
    if (t === 'tts') {
        const text = toolCall.text||'', voice = toolCall.voice||'alloy'
        const openaiKey = process.env.OPENAI_API_KEY
        if (openaiKey) {
            try {
                const r = await axios.post('https://api.openai.com/v1/audio/speech', { model:'tts-1', input:text, voice }, { headers:{Authorization:`Bearer ${openaiKey}`}, responseType:'arraybuffer', timeout:30000 })
                const tmp = `/tmp/bera_tts_${Date.now()}.mp3`
                await nodeFsPromises.writeFile(tmp, r.data)
                if (conn && m) await conn.sendMessage(chatId, { audio:{ url:tmp }, mimetype:'audio/mp4', ptt:false }, { quoted:m })
                return '✅ TTS sent'
            } catch {}
        }
        try {
            const r = await axios.get('https://api.giftedtech.co.ke/api/tools/tts', { params:{text,lang:toolCall.lang||'en',apikey:'gifted'}, timeout:15000 })
            const url = r.data?.result?.url||r.data?.result||r.data?.audio
            if (url && conn && m) { await conn.sendMessage(chatId, { audio:{url}, mimetype:'audio/mp4', ptt:false }, { quoted:m }); return '✅ TTS sent' }
        } catch {}
        return '❌ TTS failed'
    }
    if (t === 'transcribe_audio') {
        if (toolCall.source==='quoted' && m?.quoted && conn) {
            const buf = await conn.downloadMediaMessage(m.quoted).catch(()=>null)
            if (!buf) return '❌ no media'
            const tmp = `/tmp/bera_audio_${Date.now()}.ogg`
            await nodeFsPromises.writeFile(tmp, buf)
            return transcribeAudio({ path: tmp })
        }
        const sp = safeWsPath(toolCall.file); if (!sp) return 'ERROR: file'
        return transcribeAudio({ path: sp })
    }
    if (t === 'audio_info') {
        const sp = safeWsPath(toolCall.file); if (!sp) return 'ERROR: file'
        const r = await runBash(`ffprobe -v quiet -print_format json -show_format "${sp}" 2>&1`,10000)
        try { const info=JSON.parse(r.output||'{}'), fmt=info.format||{}; return `🎵 ${nodePath.basename(sp)}\nDuration: ${Math.floor(fmt.duration||0)}s\nBitrate: ${Math.floor((fmt.bit_rate||0)/1000)}kbps` } catch { return r.output||'failed' }
    }

    // video tools
    if (t === 'video_info') {
        try {
            const r = await axios.get('https://api.giftedtech.co.ke/api/search/ytsearch', { params:{query:toolCall.url,apikey:'gifted'}, timeout:15000 })
            const d = r.data?.result?.[0]||r.data?.result
            if (d) return `📹 *${d.title}*\n👤 ${d.channel||d.author}\n⏱ ${d.duration}\n🔗 ${d.url||toolCall.url}`
        } catch {}
        return `📹 ${toolCall.url}`
    }
    if (t === 'video_download') { return (await runBash(`yt-dlp -f "${toolCall.format||'best[height<=360]'}" "${toolCall.url}" -o "workspace/%(title)s.%(ext)s" 2>&1 | tail -5`,120000)).output||'download attempted' }
    if (t === 'video_trim') {
        const src=safeWsPath(toolCall.file), out=safeWsPath(toolCall.output||'workspace/trimmed.mp4'); if (!src||!out) return 'ERROR: file'
        return (await runBash(`ffmpeg -i "${src}" -ss "${toolCall.start||'00:00:00'}" -to "${toolCall.end||'00:00:30'}" -c copy "${out}" 2>&1`,60000)).output||`✅ trimmed: ${out}`
    }
    if (t === 'video_thumbnail') {
        const src=safeWsPath(toolCall.file), out=safeWsPath(toolCall.output||'workspace/thumb.jpg'); if (!src||!out) return 'ERROR: file'
        const r = await runBash(`ffmpeg -i "${src}" -ss "${toolCall.time||'00:00:05'}" -vframes 1 "${out}" 2>&1`,15000)
        if (conn && m && nodeFs.existsSync(out)) await conn.sendMessage(chatId, { image:{url:nodePath.resolve(out)}, caption:'🎬 Thumbnail' }, { quoted:m })
        return r.output||`✅ thumbnail: ${out}`
    }

    // imagine_hd
    if (t === 'imagine_hd') {
        const url = await giftedImage(toolCall.prompt||'beautiful image', toolCall.size||'1024x1024')
        if (url && conn && m) { await conn.sendMessage(chatId, { image:{url}, caption:`🎨 ${toolCall.prompt}` }, { quoted:m }); return '✅ image sent' }
        return url||'❌ image generation failed'
    }

    // ocr
    if (t === 'ocr') {
        if (m?.quoted && conn) {
            const buf = await conn.downloadMediaMessage(m.quoted).catch(()=>null); if (!buf) return '❌ no image'
            const tmp = `/tmp/bera_ocr_${Date.now()}.jpg`; await nodeFsPromises.writeFile(tmp, buf)
            return (await runBash(`tesseract "${tmp}" stdout 2>/dev/null`,15000)).output||'❌ no text found'
        }
        return '❌ reply to an image to use OCR'
    }

    // qrgen / qrread
    if (t === 'qrgen') {
        try {
            const QRCode = require('qrcode'), out = `workspace/qr_${Date.now()}.png`
            nodeFs.mkdirSync('workspace', { recursive:true })
            await QRCode.toFile(out, toolCall.data||toolCall.text||'https://bera.ai')
            if (conn && m) await conn.sendMessage(chatId, { image:{url:nodePath.resolve(out)}, caption:`📱 QR: ${toolCall.data||toolCall.text}` }, { quoted:m })
            return `✅ QR: ${out}`
        } catch (e) { return `qr error: ${e.message}` }
    }
    if (t === 'qrread') { return 'QR reading: use .readqr command with a quoted image' }

    // convert
    if (t === 'convert') {
        const src=safeWsPath(toolCall.file), fmt=toolCall.format||'mp3'; if (!src) return 'ERROR: file'
        const out = safeWsPath(toolCall.output||`workspace/converted_${Date.now()}.${fmt}`)
        return (await runBash(`ffmpeg -i "${src}" "${out}" 2>&1`,120000)).output||`✅ converted: ${out}`
    }

    // wa tools
    if (t === 'wa_send') {
        if (!toolCall.to||!toolCall.text) return 'ERROR: to and text required'
        if (toolCall.to !== chatId) return '⚠️ sending to other numbers needs explicit user confirmation'
        await conn.sendMessage(toolCall.to, { text: toolCall.text }); return `✅ sent to ${toolCall.to}`
    }
    if (t === 'wa_send_image') {
        if (!toolCall.to||!toolCall.url) return 'ERROR: to and url'
        await conn.sendMessage(toolCall.to, { image:{url:toolCall.url}, caption:toolCall.caption||'' }); return `✅ image sent`
    }
    if (t === 'wa_react') {
        if (!toolCall.emoji||!toolCall.jid||!toolCall.messageKey) return 'ERROR: emoji, jid, messageKey'
        await conn.sendMessage(toolCall.jid, { react:{ text:toolCall.emoji, key:{id:toolCall.messageKey,remoteJid:toolCall.jid} } }); return `✅ reacted ${toolCall.emoji}`
    }
    if (t === 'wa_get_groups') {
        const groups = await conn.groupFetchAllParticipating()
        return Object.values(groups).slice(0,10).map(g=>`${g.subject} (${g.id})`).join('\n')||'no groups'
    }
    if (t === 'wa_create_group') {
        const members = (toolCall.members||[]).map(n=>`${n.replace(/\D/g,'')}@s.whatsapp.net`)
        const r = await conn.groupCreate(toolCall.name||'New Group', members)
        return `✅ group created: ${r.id}`
    }

    // berahost tool
    if (t === 'berahost') {
        const key = global.db?.data?.settings?.bhApiKey; if (!key) return '❌ use .setbhkey <key> first'
        const action = toolCall.action||'list'
        try {
            const BH = 'https://bera-host-bot--berahost15.replit.app/api'
            const h = { 'x-api-key': key }
            let r
            if (action==='list') r = await axios.get(`${BH}/bots`, { headers:h, timeout:15000 })
            else if (['start','stop','restart'].includes(action)) r = await axios.post(`${BH}/bots/${toolCall.id}/${action}`, {}, { headers:h, timeout:15000 })
            else if (action==='logs') r = await axios.get(`${BH}/bots/${toolCall.id}/logs`, { headers:h, timeout:15000 })
            else if (action==='deploy') r = await axios.post(`${BH}/bots/deploy`, { repoUrl:toolCall.url||toolCall.repoUrl }, { headers:h, timeout:30000 })
            else if (action==='delete') r = await axios({ method:'DELETE', url:`${BH}/bots/${toolCall.id}`, headers:h, timeout:15000 })
            return JSON.stringify(r?.data||{}, null, 2).slice(0,2000)
        } catch (e) { return `berahost error: ${e.response?.data?.message||e.message}` }
    }

    // system
    if (t === 'system') { return systemInfo() }

    // reply (terminal)
    if (t === 'reply' || t === 'respond') { return { _isReply: true, text: toolCall.text||toolCall.message||'' } }

    return `tool "${t}" not implemented`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AGENT LOOP
// ─────────────────────────────────────────────────────────────────────────────
const generateAdvancedReply = async (text, chat, conn, m, opts = {}) => {
    try { const pd = await preDispatch(text); if (pd) { pushHistory(chat,'user',text); pushHistory(chat,'assistant',pd.reply); return pd } } catch {}

    // Rate limiting (non-owner)
    if (global.db?.data && !opts.isOwner) {
        const now = Date.now(), db = global.db.data
        if (!db.users) db.users = {}
        if (!db.users[chat]) db.users[chat] = {}
        const u = db.users[chat]
        u.agentCalls = (u.agentCalls||[]).filter(t => now-t < 3600000)
        if (u.agentCalls.length >= 10) return { success:false, reply:'⏳ Rate limit: 10 agent tasks/hour. Try later.' }
        u.agentCalls.push(now)
        await global.db.write().catch(()=>{})
    }

    pushHistory(chat, 'user', text)

    // Build context
    const mem = getMemory(chat)
    const memStr = Object.keys(mem).length ? '\n\n🧠 User Memory:\n'+Object.entries(mem).map(([k,v])=>`${k}: ${v}`).join('\n') : ''
    let wsCtx = ''
    try { const r=await runBash('ls -la workspace/ 2>/dev/null | head -20',3000); wsCtx='\n\n📁 Workspace:\n'+(r.output?.slice(0,400)||'empty') } catch {}

    const messages = [
        { role:'system', content: SYSTEM_PROMPT + memStr + wsCtx },
        ...getHistory(chat).slice(-14)
    ]

    const loopCap = opts.maxLoops || 25
    const toolCounts = {}, totalCalls = { n: 0 }
    let progCount = 0

    const sendProg = async (toolName) => {
        progCount++
        if (conn && m && (progCount <= 2 || progCount % 3 === 0)) {
            await conn.sendMessage(chat, { text:`⚙️ *Working...* (step ${progCount})\n_${toolName}_` }).catch(()=>{})
        }
    }

    for (let loop = 0; loop < loopCap; loop++) {
        let aiReply
        try { aiReply = await callAI(messages, 60000) } catch { aiReply = localFallback(text) }
        if (!aiReply) aiReply = localFallback(text)

        // Parse tool calls (array or single)
        const toolCalls = []
        const arrMatch = aiReply.match(/\[(\s*\{[\s\S]*?\}\s*,?\s*)+\]/)
        if (arrMatch) { try { const arr=JSON.parse(arrMatch[0]); if (Array.isArray(arr)) arr.forEach(tc=>toolCalls.push(tc)) } catch {} }
        if (!toolCalls.length) {
            const sm = aiReply.match(/\{[\s\S]*?"tool"[\s\S]*?\}/)
            if (sm) { try { toolCalls.push(JSON.parse(sm[0])) } catch {} }
        }

        // No tool call — pure text reply
        if (!toolCalls.length) {
            pushHistory(chat, 'assistant', aiReply)
            const db = global.db?.data
            if (db?.users?.[chat]) {
                if (!db.users[chat].agentLog) db.users[chat].agentLog = []
                db.users[chat].agentLog = [...db.users[chat].agentLog.slice(-19), { time:new Date().toISOString(), task:text.slice(0,80), reply:aiReply.slice(0,100) }]
                await global.db.write().catch(()=>{})
            }
            return { success:true, reply:aiReply }
        }

        // Anti-loop
        for (const tc of toolCalls) {
            const key = tc.tool + JSON.stringify(tc).slice(0,50)
            toolCounts[key] = (toolCounts[key]||0) + 1
            if (toolCounts[key] >= 3) {
                messages.push({ role:'user', content:`ANTI-LOOP: ${tc.tool} called 3x same args. Use a COMPLETELY DIFFERENT approach.` })
                toolCalls.length = 0; break
            }
        }
        totalCalls.n += toolCalls.length
        if (totalCalls.n > 40) { pushHistory(chat,'assistant','task exceeded 40 tool calls'); return { success:false, reply:'⚠️ Task too complex — exceeded 40 tool calls. Break it into smaller steps.' } }

        // Execute tools in parallel
        const results = await Promise.all(toolCalls.map(async tc => {
            await sendProg(tc.tool)
            const r = await executeToolCall(tc, chat, conn, m)
            if (r?._isReply) { pushHistory(chat,'assistant',r.text); return { _early: r.text } }
            return { tool: tc.tool, result: typeof r==='string' ? r : JSON.stringify(r) }
        }))

        const early = results.find(r => r?._early)
        if (early) return { success:true, reply:early._early }

        messages.push({ role:'assistant', content:aiReply })
        const summary = results.map(r=>`[${r.tool}]: ${r.result?.slice(0,800)||'done'}`).join('\n\n')
        messages.push({ role:'user', content:`Tool results:\n${summary}\n\nContinue. If all done, give final reply to user.` })
    }

    return { success:false, reply:'⚠️ Reached loop limit. Task too complex or repeated errors.' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple reply
// ─────────────────────────────────────────────────────────────────────────────
const generateSimpleReply = async (text, chat) => {
    pushHistory(chat, 'user', text)
    const messages = [{ role:'system', content:SYSTEM_PROMPT }, ...getHistory(chat).slice(-6)]
    try {
        const reply = await callAI(messages, 20000)
        if (reply && reply.length > 1) { pushHistory(chat,'assistant',reply); return { success:true, reply } }
        return { success:false, reply:'Bera AI is busy, try again.' }
    } catch (e) { return { success:false, reply:'AI error: '+e.message } }
}

const runShell = runBash

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    generateAdvancedReply,
    generateSimpleReply,
    validateAndFixCode,
    transcribeAudio,
    saveMemory,
    getMemory,
    setMemory,
    deleteMemory,
    clearHistory,
    clearMemory,
    webSearch,
    scrapeUrl,
    runShell,
    runBash,
    systemInfo,
    richServerStats,
    pm2List,
    pm2Logs,
    pm2Show,
    pm2Restart,
    pm2Stop,
    giftedImage,
    giftedTranscript,
    callAI,
    callGiftedTech,
    callXwolf,
    callPollinations,
    executeToolCall
}
