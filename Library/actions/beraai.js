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
    const load = os.loadavg ? os.loadavg() : os.loadavg()
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
const giftedImage = async (prompt, size) => {
    const IMG_ENDPOINTS = [
        `${GIFTED}/api/ai/fluximg`,
        `${GIFTED}/api/ai/txt2img`,
        `${GIFTED}/api/ai/deepimg`,
    ]
    for (const url of IMG_ENDPOINTS) {
        try {
            const r = await axios.get(url, {
                params: { apikey: GIFTED_KEY, prompt },
                timeout: 30000,
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

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Full Agent Mode (46 tools)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Gemini-compatible function-calling agent
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Bera AI — an intelligent WhatsApp assistant and autonomous agent built by Bera Tech.
You can execute real actions using tools. When the user asks you to DO or PERFORM something, output a JSON tool call. When chatting, respond in plain text.

CRITICAL RULES:
1. When performing an action → output ONLY valid JSON (no text before or after the JSON)
2. When chatting → respond in plain text
3. NEVER describe what you would do — actually DO it with a tool call
4. After seeing tool results → either call more tools or give a final plain text reply
5. You CAN kick users from groups, run shell commands, install packages, clone repos, deploy apps
6. For "kick @user" → use wa_kick tool with their number
7. For "run ls" or "ls -la" → use bash tool: {"tool":"bash","cmd":"ls -la"}
8. For "install express" → use install tool: {"tool":"install","packages":["express"],"path":"workspace/myapp"}
9. For "clone repo to workspace/cloud" → {"tool":"bash","cmd":"git clone <url> workspace/cloud"}
10. WORKSPACE is a real folder at workspace/ on this server. Files you create there persist.

TOOL CALL FORMAT:
Single: {"tool":"bash","cmd":"ls -la"}
Parallel: [{"tool":"search","q":"bitcoin price"},{"tool":"bash","cmd":"uptime"}]

AVAILABLE TOOLS:

SHELL:
{"tool":"bash","cmd":"any shell command","timeout":30000}
{"tool":"runcode","lang":"node","code":"console.log('hi')"}
{"tool":"install","packages":["express","dotenv"],"path":"workspace/myapp"}

FILES:
{"tool":"writefile","path":"workspace/app/index.js","content":"full file content here"}
{"tool":"readfile","path":"workspace/app/index.js"}
{"tool":"listfiles","path":"workspace/"}
{"tool":"mkdir","path":"workspace/myapp"}
{"tool":"deletefile","path":"workspace/old.js"}
{"tool":"zipfolder","path":"workspace/myapp","output":"workspace/myapp.zip"}

WEB:
{"tool":"search","q":"latest bitcoin price"}
{"tool":"scrape","url":"https://example.com"}
{"tool":"http","method":"GET","url":"https://api.example.com/data","headers":{},"body":null}
{"tool":"screenshot","url":"https://example.com"}

MEMORY:
{"tool":"remember","key":"server_ip","value":"45.67.89.12"}
{"tool":"recall","key":"server_ip"}
{"tool":"recall_all"}
{"tool":"forget","key":"server_ip"}

WHATSAPP GROUP MANAGEMENT:
{"tool":"wa_kick","number":"254712345678","group":"GROUP_JID"}
{"tool":"wa_promote","number":"254712345678","group":"GROUP_JID"}
{"tool":"wa_demote","number":"254712345678","group":"GROUP_JID"}
{"tool":"wa_send","number":"254712345678@s.whatsapp.net","message":"Hello!"}
{"tool":"wa_react","emoji":"👍"}

SYSTEM:
{"tool":"system"}

BERAHOST:
{"tool":"berahost","action":"list"}
{"tool":"berahost","action":"status","id":42}
{"tool":"berahost","action":"start","id":42}
{"tool":"berahost","action":"stop","id":42}
{"tool":"berahost","action":"logs","id":42}
{"tool":"berahost","action":"deploy","botId":2,"envVars":{"OWNER_NUMBER":"254712345678"}}
{"tool":"berahost","action":"coins"}
{"tool":"berahost","action":"bots"}

DEPLOY:
{"tool":"deploy_vercel","folder":"workspace/myapp","name":"my-app","token":"TOKEN"}
{"tool":"deploy_railway","folder":"workspace/myapp","name":"my-app"}

DATABASE:
{"tool":"db","action":"query","file":"workspace/data.sqlite","sql":"SELECT * FROM users"}
{"tool":"db","action":"exec","file":"workspace/data.sqlite","sql":"CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)"}

SCHEDULE:
{"tool":"cron","action":"add","id":"daily-weather","schedule":"0 9 * * *","task":"search weather Nairobi"}
{"tool":"cron","action":"list"}
{"tool":"cron","action":"cancel","id":"daily-weather"}

UTILITIES:
{"tool":"calc","expr":"2^10 + sqrt(144)"}
{"tool":"qrgen","text":"https://wa.me/254712345678"}
{"tool":"tts","text":"Hello this is Bera AI","lang":"en"}
{"tool":"currency","amount":100,"from":"USD","to":"KES"}
{"tool":"unit_convert","value":10,"from":"km","to":"mi"}

EXAMPLES OF CORRECT BEHAVIOR:
User: "ls" → {"tool":"bash","cmd":"ls -la workspace/"}
User: "run ls -la" → {"tool":"bash","cmd":"ls -la"}
User: "kick @user" → {"tool":"wa_kick","number":"254712345678","group":"GROUP_JID"}
User: "install express" → {"tool":"install","packages":["express"],"path":"workspace/myapp"}
User: "clone https://github.com/x/y to workspace/cloud" → {"tool":"bash","cmd":"git clone https://github.com/x/y workspace/cloud"}
User: "what is my server IP?" → {"tool":"recall","key":"server_ip"}
User: "deploy bera ai for 254712345678" → {"tool":"berahost","action":"deploy","botId":2,"envVars":{"OWNER_NUMBER":"254712345678"}}
User: "what is 2+2?" → Plain text: "2 + 2 = 4"
User: "how are you?" → Plain text: "I'm doing great! Ready to help with anything."
`

// ─────────────────────────────────────────────────────────────────────────────
// PARSE TOOL CALLS — extract JSON from any AI response
// ─────────────────────────────────────────────────────────────────────────────
const parseToolCalls = (text) => {
    if (!text) return null
    const t = text.trim()

    // Strip markdown code fences
    const stripped = t
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()

    // Try pure JSON array
    if (stripped.startsWith('[')) {
        try {
            const parsed = JSON.parse(stripped)
            if (Array.isArray(parsed) && parsed.length && parsed[0]?.tool) return parsed
        } catch {}
    }

    // Try pure JSON object
    if (stripped.startsWith('{')) {
        try {
            const parsed = JSON.parse(stripped)
            if (parsed?.tool) return [parsed]
        } catch {}
    }

    // Extract JSON embedded anywhere in text (Gemini adds explanations around JSON)
    const matches = []
    // Match balanced JSON objects and arrays
    const tryExtract = (src) => {
        for (let i = 0; i < src.length; i++) {
            if (src[i] !== '{' && src[i] !== '[') continue
            const open = src[i], close = open === '{' ? '}' : ']'
            let depth = 0, j = i
            for (; j < src.length; j++) {
                if (src[j] === open) depth++
                else if (src[j] === close) { depth--; if (depth === 0) break }
            }
            const chunk = src.slice(i, j + 1)
            try {
                const parsed = JSON.parse(chunk)
                if (Array.isArray(parsed)) {
                    const tools = parsed.filter(p => p?.tool)
                    if (tools.length) { tools.forEach(tc => matches.push(tc)); return }
                } else if (parsed?.tool) {
                    matches.push(parsed)
                    return
                }
            } catch {}
        }
    }
    tryExtract(t)
    return matches.length ? matches : null
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE TOOL CALL — actually runs tools
// ─────────────────────────────────────────────────────────────────────────────
const nodeFs = require('fs')
const nodeFsP = require('fs').promises
const nodePath = require('path')
const WS_ROOT = nodePath.resolve('./workspace')

const safeWsPath = (p) => {
    if (!p) return null
    const resolved = nodePath.resolve(p.startsWith('/') ? p : nodePath.join('./', p))
    // Allow any path (the agent has full access to the server)
    return resolved
}

const executeToolCall = async (tc, chatId, conn, m) => {
    const t = tc.tool

    // ── bash ──────────────────────────────────────────────────────────────────
    if (t === 'bash') {
        if (!tc.cmd) return 'ERROR: no cmd provided'
        const blocked = [/printenv\s*$/, /export\s+-p\s*$/, /cat\s+\.env\s*$/]
        if (blocked.some(p => p.test((tc.cmd||'').trim()))) return 'BLOCKED: sensitive command.'
        const r = await runBash(tc.cmd, tc.timeout || 30000)
        return r.output || 'done (no output)'
    }

    // ── runcode ───────────────────────────────────────────────────────────────
    if (t === 'runcode') {
        const lang = (tc.lang || 'node').toLowerCase()
        const code = tc.code || ''
        const tmpFile = `/tmp/beracode_${Date.now()}.${lang === 'python' ? 'py' : lang === 'bash' ? 'sh' : 'js'}`
        nodeFs.writeFileSync(tmpFile, code)
        const cmd = lang === 'python' ? `python3 "${tmpFile}"` : lang === 'bash' ? `bash "${tmpFile}"` : `node "${tmpFile}"`
        const r = await runBash(cmd, tc.timeout || 30000)
        try { nodeFs.unlinkSync(tmpFile) } catch {}
        return r.output || 'done (no output)'
    }

    // ── install ───────────────────────────────────────────────────────────────
    if (t === 'install') {
        const pkgs = Array.isArray(tc.packages) ? tc.packages.join(' ') : (tc.packages || '')
        const dir = tc.path || '.'
        const mgr = tc.manager || 'npm'
        if (!pkgs) return 'ERROR: no packages listed'
        const mkdirRes = await runBash(`mkdir -p "${dir}"`, 5000)
        const cmd = mgr === 'pip' ? `pip install ${pkgs}` : mgr === 'yarn' ? `cd "${dir}" && yarn add ${pkgs}` : `cd "${dir}" && npm install ${pkgs}`
        const r = await runBash(cmd, 120000)
        return r.output || 'installed'
    }

    // ── writefile ─────────────────────────────────────────────────────────────
    if (t === 'writefile') {
        const p = safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        nodeFs.mkdirSync(nodePath.dirname(p), { recursive: true })
        await nodeFsP.writeFile(p, tc.content || '', 'utf8')
        return `written: ${p} (${(tc.content||'').length} bytes)`
    }

    // ── readfile ──────────────────────────────────────────────────────────────
    if (t === 'readfile') {
        const p = safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        if (!nodeFs.existsSync(p)) return `not found: ${p}`
        return (await nodeFsP.readFile(p, 'utf8')).slice(0, 6000)
    }

    // ── listfiles ─────────────────────────────────────────────────────────────
    if (t === 'listfiles') {
        const p = safeWsPath(tc.path || 'workspace/')
        const r = await runBash(`ls -la "${p}" 2>&1 | head -50`, 5000)
        return r.output || 'empty'
    }

    // ── mkdir ─────────────────────────────────────────────────────────────────
    if (t === 'mkdir') {
        const p = safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        nodeFs.mkdirSync(p, { recursive: true })
        return `created: ${p}`
    }

    // ── deletefile ────────────────────────────────────────────────────────────
    if (t === 'deletefile') {
        const p = safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        if (!nodeFs.existsSync(p)) return `not found: ${p}`
        const stat = nodeFs.statSync(p)
        if (stat.isDirectory()) {
            await runBash(`rm -rf "${p}"`, 10000)
        } else {
            await nodeFsP.unlink(p)
        }
        return `deleted: ${p}`
    }

    // ── zipfolder ─────────────────────────────────────────────────────────────
    if (t === 'zipfolder') {
        const src = safeWsPath(tc.path)
        const out = safeWsPath(tc.output || (tc.path + '.zip'))
        const r = await runBash(`zip -r "${out}" "${src}" 2>&1`, 30000)
        return r.output || `zipped to ${out}`
    }

    // ── search ────────────────────────────────────────────────────────────────
    if (t === 'search') {
        const res = await webSearch(tc.q || tc.query || '')
        if (!res.success || !res.results?.length) return 'No results found'
        return res.results.map((r, i) => `${i+1}. ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n')
    }

    // ── scrape ────────────────────────────────────────────────────────────────
    if (t === 'scrape') {
        const r = await scrapeUrl(tc.url || '')
        return r.success ? r.text : `failed: ${r.error}`
    }

    // ── http ──────────────────────────────────────────────────────────────────
    if (t === 'http') {
        try {
            const cfg = {
                method: tc.method || 'GET',
                url: tc.url,
                headers: tc.headers || {},
                timeout: 20000,
                validateStatus: () => true
            }
            if (tc.body || tc.data) cfg.data = tc.body || tc.data
            if (tc.params) cfg.params = tc.params
            const axios2 = require('axios')
            const r = await axios2(cfg)
            const body = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : String(r.data)
            return `HTTP ${r.status}\n${body.slice(0, 3000)}`
        } catch (e) {
            return `HTTP error: ${e.message}`
        }
    }

    // ── screenshot ────────────────────────────────────────────────────────────
    if (t === 'screenshot') {
        try {
            const axios2 = require('axios')
            const r = await axios2.get(`${GIFTED}/api/search/screenshot`, {
                params: { url: tc.url, apikey: GIFTED_KEY },
                timeout: 25000
            })
            const img = r.data?.result?.url || r.data?.result || r.data?.url
            if (img && conn && m) {
                await conn.sendMessage(chatId, { image: { url: img }, caption: `📸 ${tc.url}` }, { quoted: m }).catch(()=>{})
                return `screenshot sent: ${img}`
            }
            return img ? `screenshot: ${img}` : 'screenshot failed'
        } catch (e) { return `screenshot failed: ${e.message}` }
    }

    // ── system ────────────────────────────────────────────────────────────────
    if (t === 'system') {
        const info = await richServerStats()
        return JSON.stringify(info, null, 2)
    }

    // ── memory: remember ──────────────────────────────────────────────────────
    if (t === 'remember') {
        if (!tc.key || !tc.value) return 'ERROR: need key and value'
        saveMemory(chatId, tc.key, String(tc.value))
        return `remembered: ${tc.key} = ${tc.value}`
    }

    // ── memory: recall ────────────────────────────────────────────────────────
    if (t === 'recall') {
        if (!tc.key) return JSON.stringify(getMemory(chatId))
        const val = getMemory(chatId)[tc.key]
        return val !== undefined ? `${tc.key}: ${val}` : `not found: ${tc.key}`
    }

    // ── memory: recall_all ────────────────────────────────────────────────────
    if (t === 'recall_all') {
        const mem = getMemory(chatId)
        const keys = Object.keys(mem)
        if (!keys.length) return 'Memory is empty'
        return keys.map(k => `${k}: ${mem[k]}`).join('\n')
    }

    // ── memory: forget ────────────────────────────────────────────────────────
    if (t === 'forget') {
        deleteMemory(chatId, tc.key)
        return `forgotten: ${tc.key || 'all memory'}`
    }

    // ── WhatsApp: wa_kick ─────────────────────────────────────────────────────
    if (t === 'wa_kick') {
        if (!conn || !m) return 'ERROR: no connection'
        const group = tc.group || chatId
        if (!group?.endsWith('@g.us')) return 'ERROR: must be used in a group'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        if (!num) return 'ERROR: no number provided'
        const jid = num.includes('@') ? tc.number : `${num}@s.whatsapp.net`
        try {
            await conn.groupParticipantsUpdate(group, [jid], 'remove')
            return `kicked: ${num}`
        } catch (e) { return `kick failed: ${e.message}` }
    }

    // ── WhatsApp: wa_promote ──────────────────────────────────────────────────
    if (t === 'wa_promote') {
        if (!conn || !m) return 'ERROR: no connection'
        const group = tc.group || chatId
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        const jid = `${num}@s.whatsapp.net`
        try {
            await conn.groupParticipantsUpdate(group, [jid], 'promote')
            return `promoted: ${num}`
        } catch (e) { return `promote failed: ${e.message}` }
    }

    // ── WhatsApp: wa_demote ───────────────────────────────────────────────────
    if (t === 'wa_demote') {
        if (!conn || !m) return 'ERROR: no connection'
        const group = tc.group || chatId
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        const jid = `${num}@s.whatsapp.net`
        try {
            await conn.groupParticipantsUpdate(group, [jid], 'demote')
            return `demoted: ${num}`
        } catch (e) { return `demote failed: ${e.message}` }
    }

    // ── WhatsApp: wa_send ─────────────────────────────────────────────────────
    if (t === 'wa_send') {
        if (!conn) return 'ERROR: no connection'
        const to = tc.number || chatId
        try {
            await conn.sendMessage(to, { text: tc.message || '' })
            return `sent to ${to}`
        } catch (e) { return `send failed: ${e.message}` }
    }

    // ── WhatsApp: wa_react ────────────────────────────────────────────────────
    if (t === 'wa_react') {
        if (!conn || !m) return 'ERROR: no connection'
        try {
            await conn.sendMessage(chatId, { react: { text: tc.emoji || '👍', key: m.key } })
            return `reacted: ${tc.emoji}`
        } catch (e) { return `react failed: ${e.message}` }
    }

    // ── berahost ──────────────────────────────────────────────────────────────
    if (t === 'berahost') {
        const bhLib = require('./berahost')
        const action = tc.action || 'list'
        try {
            switch (action) {
                case 'list': {
                    const deps = await bhLib.listDeployments()
                    return JSON.stringify(deps, null, 2).slice(0, 2000)
                }
                case 'status': {
                    const d = await bhLib.getDeployment(tc.id)
                    return JSON.stringify(d, null, 2).slice(0, 1500)
                }
                case 'start': { await bhLib.startDeployment(tc.id); return `started #${tc.id}` }
                case 'stop': { await bhLib.stopDeployment(tc.id); return `stopped #${tc.id}` }
                case 'logs': {
                    const logs = await bhLib.getLogs(tc.id)
                    return (Array.isArray(logs) ? logs : logs.logs || []).slice(-20).map(l => l.logLine).join('\n')
                }
                case 'deploy': {
                    const d = await bhLib.createDeployment(tc.botId, tc.envVars || {})
                    return `deployed: id=${d.id} status=${d.status}`
                }
                case 'coins': {
                    const c = await bhLib.getCoins()
                    return `coins: ${c.coins} | streak: ${c.streak} | canClaim: ${c.canClaimToday}`
                }
                case 'bots': {
                    const bots = await bhLib.getBots()
                    return bots.map(b => `[${b.id}] ${b.name} — needs: ${Object.keys(b.requiredVars||{}).join(', ')}`).join('\n')
                }
                default: return `unknown berahost action: ${action}`
            }
        } catch (e) { return `berahost error: ${e.message}` }
    }

    // ── deploy_vercel ─────────────────────────────────────────────────────────
    if (t === 'deploy_vercel') {
        const folder = tc.folder || 'workspace/'
        const token = tc.token || global.db?.data?.settings?.vercelToken || process.env.VERCEL_TOKEN || ''
        if (!token) return 'ERROR: Vercel token not set. Use .setvercel <token>'
        const r = await runBash(`cd "${folder}" && npx vercel --token "${token}" --yes 2>&1`, 120000)
        return r.output || 'deployment attempted'
    }

    // ── deploy_railway ────────────────────────────────────────────────────────
    if (t === 'deploy_railway') {
        const folder = tc.folder || 'workspace/'
        const r = await runBash(`cd "${folder}" && npx @railway/cli up 2>&1`, 120000)
        return r.output || 'deployment attempted'
    }

    // ── db ────────────────────────────────────────────────────────────────────
    if (t === 'db') {
        const file = safeWsPath(tc.file || 'workspace/data.sqlite')
        const sql = tc.sql || ''
        if (!sql) return 'ERROR: no SQL'
        const cmd = `node -e "
const db=require('better-sqlite3')('${file}');
try {
  const action='${tc.action||'query'}';
  if(action==='query'){const rows=db.prepare(${JSON.stringify(sql)}).all();console.log(JSON.stringify(rows,null,2))}
  else{db.prepare(${JSON.stringify(sql)}).run();console.log('done')}
  db.close()
} catch(e){console.error(e.message);db.close()}" 2>&1`
        const r = await runBash(cmd, 15000)
        return r.output || 'done'
    }

    // ── cron ──────────────────────────────────────────────────────────────────
    if (t === 'cron') {
        if (global._cronJobs === undefined) global._cronJobs = {}
        const action = tc.action || 'list'
        if (action === 'list') {
            const jobs = Object.entries(global._cronJobs || {})
            if (!jobs.length) return 'No cron jobs active'
            return jobs.map(([id, j]) => `#${id}: ${j.schedule} — ${j.task}`).join('\n')
        }
        if (action === 'add') {
            const id = tc.id || `cron_${Date.now()}`
            const schedule = tc.schedule
            const task = tc.task
            if (!schedule || !task) return 'ERROR: need schedule and task'
            // Store for display (actual execution requires node-cron)
            global._cronJobs[id] = { schedule, task, chat: chatId, createdAt: new Date().toISOString() }
            // Try to use node-cron if available
            try {
                const cron = require('node-cron')
                if (!cron.validate(schedule)) return `ERROR: invalid cron expression: ${schedule}`
                if (global._cronTasks === undefined) global._cronTasks = {}
                global._cronTasks[id] = cron.schedule(schedule, async () => {
                    try {
                        if (conn) await conn.sendMessage(chatId, { text: `⏰ *Cron [${id}]:* ${task}` })
                    } catch {}
                })
            } catch {}
            return `✅ Cron #${id} scheduled: "${schedule}" — ${task}`
        }
        if (action === 'cancel') {
            const id = tc.id
            if (!id) return 'ERROR: need id'
            try { if (global._cronTasks?.[id]) { global._cronTasks[id].stop(); delete global._cronTasks[id] } } catch {}
            delete global._cronJobs?.[id]
            return `cancelled cron: ${id}`
        }
        return 'unknown cron action'
    }

    // ── monitor ───────────────────────────────────────────────────────────────
    if (t === 'monitor') {
        if (!global._monitors) global._monitors = {}
        const action = tc.action || 'list'
        if (action === 'add') {
            const id = tc.id || tc.url
            const url = tc.url
            const interval = (tc.interval || 300) * 1000
            if (!url) return 'ERROR: need url'
            global._monitors[id] = { url, interval, chat: chatId, lastStatus: null }
            const check = async () => {
                try {
                    const axios2 = require('axios')
                    const r = await axios2.get(url, { timeout: 10000, validateStatus: () => true })
                    const up = r.status < 400
                    const prev = global._monitors[id]?.lastStatus
                    if (prev !== null && prev !== up && conn) {
                        await conn.sendMessage(chatId, { text: up ? `✅ *${url}* is back UP (${r.status})` : `🔴 *${url}* is DOWN (${r.status})` }).catch(()=>{})
                    }
                    if (global._monitors[id]) global._monitors[id].lastStatus = up
                } catch (e) {
                    if (global._monitors[id]?.lastStatus !== false && conn) {
                        await conn.sendMessage(chatId, { text: `🔴 *${url}* is DOWN — ${e.message}` }).catch(()=>{})
                    }
                    if (global._monitors[id]) global._monitors[id].lastStatus = false
                }
            }
            if (!global._monitorIntervals) global._monitorIntervals = {}
            check()
            global._monitorIntervals[id] = setInterval(check, interval)
            return `✅ Monitoring ${url} every ${tc.interval||300}s`
        }
        if (action === 'list') {
            const entries = Object.entries(global._monitors || {})
            if (!entries.length) return 'No monitors active'
            return entries.map(([id, m]) => `• ${id}: ${m.url} (${m.lastStatus === true ? '✅ up' : m.lastStatus === false ? '🔴 down' : '⏳ checking'})`).join('\n')
        }
        if (action === 'remove' || action === 'stop') {
            const id = tc.id || tc.url
            try { if (global._monitorIntervals?.[id]) { clearInterval(global._monitorIntervals[id]); delete global._monitorIntervals[id] } } catch {}
            delete global._monitors?.[id]
            return `stopped monitoring: ${id}`
        }
        return 'unknown monitor action'
    }

    // ── calc ──────────────────────────────────────────────────────────────────
    if (t === 'calc') {
        try {
            const expr = (tc.expr || '').replace(/[^0-9+\-*/.()^ ]/g, '').slice(0, 200)
            const fn = new Function('return ' + expr.replace(/\^/g, '**'))
            return String(fn())
        } catch (e) { return `calc error: ${e.message}` }
    }

    // ── currency ──────────────────────────────────────────────────────────────
    if (t === 'currency') {
        try {
            const axios2 = require('axios')
            const r = await axios2.get(`https://api.exchangerate.host/convert?from=${tc.from}&to=${tc.to}&amount=${tc.amount}`, { timeout: 10000 })
            const result = r.data?.result
            if (result) return `${tc.amount} ${tc.from} = ${result.toFixed(2)} ${tc.to}`
            return 'currency conversion failed'
        } catch (e) { return `currency error: ${e.message}` }
    }

    // ── unit_convert ──────────────────────────────────────────────────────────
    if (t === 'unit_convert') {
        const conversions = {
            'km_mi': 0.621371, 'mi_km': 1.60934, 'kg_lb': 2.20462, 'lb_kg': 0.453592,
            'c_f': v => v * 9/5 + 32, 'f_c': v => (v - 32) * 5/9,
            'm_ft': 3.28084, 'ft_m': 0.3048, 'l_gal': 0.264172, 'gal_l': 3.78541
        }
        const key = `${tc.from}_${tc.to}`.toLowerCase()
        const conv = conversions[key]
        if (!conv) return `unknown conversion: ${tc.from} to ${tc.to}`
        const result = typeof conv === 'function' ? conv(tc.value) : tc.value * conv
        return `${tc.value} ${tc.from} = ${result.toFixed(4)} ${tc.to}`
    }

    // ── qrgen ─────────────────────────────────────────────────────────────────
    if (t === 'qrgen') {
        try {
            const axios2 = require('axios')
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(tc.text || '')}`
            if (conn && m) {
                await conn.sendMessage(chatId, { image: { url }, caption: `🔲 QR: ${tc.text}` }, { quoted: m }).catch(()=>{})
                return 'QR code sent'
            }
            return `QR URL: ${url}`
        } catch (e) { return `qr error: ${e.message}` }
    }

    // ── tts ───────────────────────────────────────────────────────────────────
    if (t === 'tts') {
        try {
            const text = encodeURIComponent((tc.text || '').slice(0, 200))
            const lang = tc.lang || 'en'
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=${lang}&client=tw-ob`
            if (conn && m) {
                await conn.sendMessage(chatId, { audio: { url }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m }).catch(()=>{})
                return 'TTS audio sent'
            }
            return `TTS URL: ${url}`
        } catch (e) { return `tts error: ${e.message}` }
    }

    return `unknown tool: ${t}`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AGENT LOOP — fixed, actually executes tools
// ─────────────────────────────────────────────────────────────────────────────
const generateAdvancedReply = async (text, chat, conn, m, opts = {}) => {
    try {
        const pd = await preDispatch(text)
        if (pd && pd.reply) {
            pushHistory(chat, 'user', text)
            pushHistory(chat, 'assistant', pd.reply)
            return pd
        }
    } catch {}

    // Rate limit non-owners
    if (global.db?.data && !opts.isOwner) {
        const now = Date.now()
        const db = global.db.data
        if (!db.users) db.users = {}
        if (!db.users[chat]) db.users[chat] = {}
        const u = db.users[chat]
        u.agentCalls = (u.agentCalls || []).filter(ts => now - ts < 3600000)
        if (u.agentCalls.length >= 10) return { success: false, reply: '⏳ Rate limit: 10 tasks/hour.' }
        u.agentCalls.push(now)
        await global.db.write().catch(() => {})
    }

    pushHistory(chat, 'user', text)

    // Build context with memory + workspace
    const mem = getMemory(chat)
    const memStr = Object.keys(mem).length
        ? '\n\nUser Memory:\n' + Object.entries(mem).map(([k, v]) => `${k}: ${v}`).join('\n')
        : ''
    let wsCtx = ''
    try {
        const r = await runBash('ls workspace/ 2>/dev/null | head -20', 3000)
        if (r.output && r.output.trim()) wsCtx = '\n\nWorkspace files:\n' + r.output.trim()
    } catch {}

    // Extract mentioned participants if in group (for kick/promote tools)
    let mentionCtx = ''
    try {
        const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentioned.length) mentionCtx = '\n\nMentioned users: ' + mentioned.join(', ')
    } catch {}

    // Inject group JID context
    const groupCtx = (m?.isGroup && chat?.endsWith('@g.us')) ? `\n\nCurrent group JID: ${chat}` : ''

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT + memStr + wsCtx + mentionCtx + groupCtx },
        ...getHistory(chat).slice(-12)
    ]

    const loopCap = opts.maxLoops || 20
    let stepCount = 0
    let lastProgressMsg = null

    const sendProgress = async (toolName) => {
        stepCount++
        if (!conn || !m) return
        if (stepCount <= 3 || stepCount % 4 === 0) {
            try {
                const sent = await conn.sendMessage(chat, {
                    text: `⚙️ *Working...* (step ${stepCount})\n_Using: ${toolName}_`
                })
                lastProgressMsg = sent?.key
            } catch {}
        }
    }

    for (let loop = 0; loop < loopCap; loop++) {
        let aiReply
        try { aiReply = await callAI(messages, 60000) } catch {}
        if (!aiReply) aiReply = localFallback(text)

        // Try to parse tool calls from AI response
        const toolCalls = parseToolCalls(aiReply)

        if (!toolCalls || !toolCalls.length) {
            // No tool calls → return as plain text
            pushHistory(chat, 'assistant', aiReply)
            // Clean up any "working" progress message
            return { success: true, reply: aiReply }
        }

        // Execute all tool calls (parallel where possible but sequential for simplicity)
        messages.push({ role: 'assistant', content: aiReply })

        const toolResults = []
        for (const tc of toolCalls) {
            await sendProgress(tc.tool)
            try {
                const result = await executeToolCall(tc, chat, conn, m)
                toolResults.push({ tool: tc.tool, result: String(result).slice(0, 2000) })
            } catch (e) {
                toolResults.push({ tool: tc.tool, result: `ERROR: ${e.message}` })
            }
        }

        // Feed tool results back to AI
        const resultsText = toolResults.map(r =>
            `[Tool: ${r.tool}]\n${r.result}`
        ).join('\n\n---\n\n')

        messages.push({
            role: 'user',
            content: `Tool results:\n${resultsText}\n\nIf the task is complete, respond with your final answer in plain text. If you need to do more steps, output another JSON tool call.`
        })
    }

    return { success: false, reply: '⚠️ Task took too many steps. Try breaking it into smaller parts.' }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE REPLY (chatbot mode, no tools)
// ─────────────────────────────────────────────────────────────────────────────
const generateSimpleReply = async (text, chat) => {
    pushHistory(chat, 'user', text)
    const messages = [
        { role: 'system', content: 'You are Bera AI — a friendly, smart WhatsApp assistant built by Bera Tech. Answer helpfully and concisely.' },
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
    callPollinations
}
