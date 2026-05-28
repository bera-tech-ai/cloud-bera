// Library/actions/beraai.js
// Bera AI — Advanced AI Engine with Tool Calling
// Tools: bash, web search, web scrape, system info, bot command execution, memory
// Created by Developer Bera

'use strict'
const axios = require('axios')
const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

const GIFTED = 'https://api.gifted.co.ke'
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
const AI_MODELS = ['mistral', 'deepseek', 'llama', 'unity', 'phi', 'bidder', 'mireille', 'openai']
let _modelIdx = 0

const isPollinationsError = (text) => {
    if (!text) return true
    const t = text.trim()
    if (t.startsWith('{') && t.includes('"error"')) return true
    if (t.startsWith('{') && t.includes('"status"') && t.includes('404')) return true
    // Detect OpenAI-style assistant message objects with no usable plain text
    if (t.startsWith('{') && t.includes('"role"')) {
        try {
            const obj = JSON.parse(t)
            if (obj.role === 'assistant') {
                if (!obj.content || obj.content === '') return true
                if (Array.isArray(obj.tool_calls)) return true
            }
        } catch {}
    }
    return false
}

const parseAiText = (raw) => {
    if (!raw || typeof raw !== 'string') return null
    const t = raw.trim()
    if (t.startsWith('{')) {
        try {
            const obj = JSON.parse(t)
            // Standard content field
            if (obj.content && typeof obj.content === 'string' && obj.content.length > 1) {
                return obj.content.trim()
            }
            // OpenAI-style with reasoning but no content — extract reasoning as response
            if (obj.role === 'assistant' && obj.reasoning && typeof obj.reasoning === 'string' && obj.reasoning.length > 10) {
                const lines = obj.reasoning.split('\n').filter(l => l.trim().length > 0)
                return lines.slice(-3).join(' ').trim().slice(0, 800)
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
    // Try Pollinations first — free, no key required, fastest
    const poll = await callPollinations(messages, Math.min(timeoutMs, 20000))
    if (poll) return poll
    // Then Xwolf as backup
    if (lastUser) {
        const xw = await callXwolf(lastUser, Math.min(timeoutMs, 8000), systemContent)
        if (xw) return xw
    }
    // Try Gifted last — key may be expired but worth one attempt
    if (lastUser) {
        const gt = await callGiftedTech(lastUser, historyMsgs, Math.min(timeoutMs, 8000), systemContent)
        if (gt) return gt
    }
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
// SYSTEM PROMPT — Gemini-compatible, 55-tool autonomous agent
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Bera AI — the most powerful WhatsApp autonomous agent, built by Bera Tech.
You execute real actions using tools. NEVER describe what you would do — ALWAYS do it with a tool call.

OUTPUT RULES:
1. Performing an action → output ONLY valid JSON (no text before or after)
2. Chatting / answering questions → respond in plain text
3. After tool results → either call more tools or give a final plain text summary
4. You can chain multiple tool calls to complete complex tasks

TOOL CALL FORMAT:
Single:   {"tool":"bash","cmd":"ls -la"}
Parallel: [{"tool":"crypto","coins":["bitcoin","ethereum"]},{"tool":"stock","symbols":["AAPL","TSLA"]}]

══════════════════════════════════════════════
SHELL & CODE
══════════════════════════════════════════════
{"tool":"bash","cmd":"any shell command","cwd":"workspace/myapp","timeout":30000}
{"tool":"multi_bash","steps":["npm install","npm run build","pm2 restart all"],"cwd":"workspace/myapp"}
{"tool":"runcode","lang":"node","code":"console.log('hello')"}
{"tool":"runcode","lang":"python","code":"print('hello')"}
{"tool":"runcode","lang":"bash","code":"echo hello && date"}
{"tool":"install","packages":["express","dotenv","axios"],"path":"workspace/myapp","manager":"npm"}
{"tool":"install","packages":["requests","flask"],"manager":"pip"}

══════════════════════════════════════════════
FILES & WORKSPACE
══════════════════════════════════════════════
{"tool":"writefile","path":"workspace/app/index.js","content":"full file content"}
{"tool":"readfile","path":"workspace/app/index.js"}
{"tool":"listfiles","path":"workspace/"}
{"tool":"mkdir","path":"workspace/myapp"}
{"tool":"deletefile","path":"workspace/old.js"}
{"tool":"zipfolder","path":"workspace/myapp","output":"workspace/myapp.zip"}
{"tool":"pastebin","content":"your code here","title":"myfile.js"} → returns public URL

══════════════════════════════════════════════
API FETCHING & HTTP (STAR FEATURE)
══════════════════════════════════════════════
{"tool":"api","method":"GET","url":"https://api.example.com/status"}
{"tool":"api","method":"POST","url":"https://api.example.com/create","body":{"name":"test"},"headers":{"Content-Type":"application/json"}}
{"tool":"api","method":"GET","url":"https://protected.api.com/data","bearer":"mytoken123"}
{"tool":"api","method":"GET","url":"https://api.example.com","apikey":"myapikey","params":{"limit":10}}
{"tool":"ping_url","url":"https://api.example.com"} → check if URL is up + response time
{"tool":"check_url","url":"https://mysite.com"}

══════════════════════════════════════════════
WEB SCRAPING (like Replit agent)
══════════════════════════════════════════════
{"tool":"read_page","url":"https://example.com"} → full readable text content from any page
{"tool":"scrape","url":"https://example.com"} → alias for read_page
{"tool":"screenshot","url":"https://example.com"} → visual screenshot

══════════════════════════════════════════════
SEARCH & INFORMATION
══════════════════════════════════════════════
{"tool":"search","q":"bitcoin price today"}
{"tool":"news","query":"AI technology 2025"}
{"tool":"weather","city":"Nairobi"}
{"tool":"crypto","coins":["bitcoin","ethereum","solana","dogecoin"]}
{"tool":"stock","symbols":["AAPL","TSLA","GOOGL","AMZN","MSFT"]}
{"tool":"ip_info","ip":"8.8.8.8"} → geolocation, ISP, country
{"tool":"dns","domain":"example.com","type":"A"} → DNS lookup (types: A, AAAA, MX, TXT, CNAME)
{"tool":"whois","domain":"example.com"}
{"tool":"port_scan","host":"example.com","ports":"22,80,443,3000,8080"}

══════════════════════════════════════════════
COMMUNICATION
══════════════════════════════════════════════
{"tool":"email","to":"user@gmail.com","subject":"Hello from Bera AI","body":"Your message","html":false}
{"tool":"tts","text":"Hello! This is Bera AI speaking","lang":"en"} → sends voice note
{"tool":"translate_text","text":"Hola mundo","from":"es","to":"en"}
{"tool":"wa_send","number":"254712345678@s.whatsapp.net","message":"Hello!"}
{"tool":"wa_react","emoji":"👍"}

══════════════════════════════════════════════
IMAGE & MEDIA GENERATION
══════════════════════════════════════════════
{"tool":"image_gen","prompt":"a futuristic Nairobi city at night","width":1024,"height":1024}
{"tool":"image_gen","prompt":"portrait of a lion","provider":"sdxl","width":768,"height":768}
{"tool":"image_gen","prompt":"anime girl","provider":"anime"} → anime style model
{"tool":"qrgen","text":"https://wa.me/254712345678"}
{"tool":"barcode","text":"1234567890","type":"qr"}
{"tool":"barcode","text":"PRODUCT-001","type":"code128"}
{"tool":"send_media","url":"https://example.com/img.jpg","caption":"Check this out","type":"image"}

══════════════════════════════════════════════
WHATSAPP GROUP MANAGEMENT
══════════════════════════════════════════════
{"tool":"wa_kick","number":"254712345678","group":"GROUP_JID"}
{"tool":"wa_promote","number":"254712345678","group":"GROUP_JID"}
{"tool":"wa_demote","number":"254712345678","group":"GROUP_JID"}

══════════════════════════════════════════════
MEMORY & NOTES
══════════════════════════════════════════════
{"tool":"remember","key":"server_ip","value":"45.67.89.12"}
{"tool":"recall","key":"server_ip"}
{"tool":"recall_all"}
{"tool":"forget","key":"server_ip"}
{"tool":"note","action":"add","title":"Meeting Notes","content":"Discussed X, Y, Z"}
{"tool":"note","action":"list"}
{"tool":"note","action":"get","title":"Meeting Notes"}
{"tool":"note","action":"delete","title":"Meeting Notes"}

══════════════════════════════════════════════
GITHUB
══════════════════════════════════════════════
{"tool":"github","action":"list_repos","user":"username"}
{"tool":"github","action":"get_file","repo":"user/repo","path":"README.md"}
{"tool":"github","action":"create_file","repo":"user/repo","path":"src/index.js","content":"code","message":"feat: add file"}
{"tool":"github","action":"get_issues","repo":"user/repo"}
{"tool":"github","action":"list_branches","repo":"user/repo"}
{"tool":"github","action":"clone","repo":"user/repo","dest":"workspace/myapp"}

══════════════════════════════════════════════
BERAHOST DEPLOYMENTS
══════════════════════════════════════════════
{"tool":"berahost","action":"list"} → list all your bot deployments
{"tool":"berahost","action":"status","id":42}
{"tool":"berahost","action":"start","id":42}
{"tool":"berahost","action":"stop","id":42}
{"tool":"berahost","action":"logs","id":42}
{"tool":"berahost","action":"deploy","botId":2,"envVars":{"OWNER_NUMBER":"254712345678","SESSION":"Gifted~xxxx"}}
{"tool":"berahost","action":"coins"}
{"tool":"berahost","action":"bots"} → available bot templates

══════════════════════════════════════════════
DEPLOY & HOSTING
══════════════════════════════════════════════
{"tool":"deploy_vercel","folder":"workspace/myapp","name":"my-app"}
{"tool":"deploy_railway","folder":"workspace/myapp","name":"my-app"}

══════════════════════════════════════════════
SCHEDULING & MONITORING
══════════════════════════════════════════════
{"tool":"cron","action":"add","id":"daily-report","schedule":"0 9 * * *","task":"check server status"}
{"tool":"cron","action":"list"}
{"tool":"cron","action":"cancel","id":"daily-report"}
{"tool":"monitor","action":"add","id":"myapi","url":"https://api.example.com","interval":300}
{"tool":"monitor","action":"list"}
{"tool":"monitor","action":"remove","id":"myapi"}

══════════════════════════════════════════════
DATABASE & SYSTEM
══════════════════════════════════════════════
{"tool":"db","action":"query","file":"workspace/data.sqlite","sql":"SELECT * FROM users"}
{"tool":"db","action":"exec","file":"workspace/data.sqlite","sql":"CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)"}
{"tool":"system"} → RAM, CPU, disk, uptime
{"tool":"status_dashboard"} → full bot status report

══════════════════════════════════════════════
UTILITIES
══════════════════════════════════════════════
{"tool":"calc","expr":"2^32 / 1024 + sqrt(144)"}
{"tool":"currency","amount":100,"from":"USD","to":"KES"}
{"tool":"unit_convert","value":10,"from":"km","to":"mi"}

══════════════════════════════════════════════
REAL-WORLD EXAMPLES
══════════════════════════════════════════════
User: "fetch https://api.example.com and show status" → {"tool":"api","method":"GET","url":"https://api.example.com"}
User: "what's the bitcoin price?" → {"tool":"crypto","coins":["bitcoin"]}
User: "scrape https://news.site.com" → {"tool":"read_page","url":"https://news.site.com"}
User: "send email to john@gmail.com saying hello" → {"tool":"email","to":"john@gmail.com","subject":"Hello","body":"Hello from Bera AI!"}
User: "generate an image of a lion" → {"tool":"image_gen","prompt":"majestic lion in savanna"}
User: "say hello in voice" → {"tool":"tts","text":"Hello! I am Bera AI, the most powerful WhatsApp agent!"}
User: "check if my API is up" → {"tool":"ping_url","url":"https://myapi.com"}
User: "ls workspace" → {"tool":"bash","cmd":"ls -la workspace/"}
User: "kick @user" → {"tool":"wa_kick","number":"254712345678","group":"GROUP_JID"}
User: "what's AAPL stock?" → {"tool":"stock","symbols":["AAPL"]}
User: "weather in Nairobi" → {"tool":"weather","city":"Nairobi"}
User: "translate 'hello world' to Swahili" → {"tool":"translate_text","text":"hello world","from":"en","to":"sw"}
User: "deploy bera ai for 254712345678 with session Gifted~abc" → {"tool":"berahost","action":"deploy","botId":2,"envVars":{"OWNER_NUMBER":"254712345678","SESSION":"Gifted~abc"}}
User: "clone bera-tech-ai/cloud-bera to workspace" → {"tool":"github","action":"clone","repo":"bera-tech-ai/cloud-bera","dest":"workspace/cloud-bera"}
User: "install express in workspace/myapp then create a basic server" → [{"tool":"install","packages":["express"],"path":"workspace/myapp"},{"tool":"writefile","path":"workspace/myapp/index.js","content":"const express=require('express');const app=express();app.get('/',(_,r)=>r.json({status:'ok'}));app.listen(3000,()=>console.log('up'))"}]
User: "what 2+2?" → Plain text: "2 + 2 = 4"
`

// ─────────────────────────────────────────────────────────────────────────────
// PARSE TOOL CALLS — handles Gemini's habit of wrapping JSON in text
// ─────────────────────────────────────────────────────────────────────────────
const parseToolCalls = (text) => {
    if (!text) return null
    const t = text.trim()

    // Strip markdown code fences
    const stripped = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    // Try pure JSON array or object first
    for (const src of [stripped, t]) {
        if (src.startsWith('[')) {
            try { const p = JSON.parse(src); if (Array.isArray(p) && p.length && p[0]?.tool) return p } catch {}
        }
        if (src.startsWith('{')) {
            try { const p = JSON.parse(src); if (p?.tool) return [p] } catch {}
        }
    }

    // Extract JSON embedded anywhere in text
    const matches = []
    const tryExtract = (src) => {
        for (let i = 0; i < src.length; i++) {
            if (src[i] !== '{' && src[i] !== '[') continue
            const open = src[i], close = open === '{' ? '}' : ']'
            let depth = 0, j = i
            for (; j < src.length; j++) {
                if (src[j] === open) depth++
                else if (src[j] === close) { if (--depth === 0) break }
            }
            const chunk = src.slice(i, j + 1)
            try {
                const parsed = JSON.parse(chunk)
                if (Array.isArray(parsed)) {
                    const tools = parsed.filter(p => p?.tool)
                    if (tools.length) { tools.forEach(tc => matches.push(tc)); return }
                } else if (parsed?.tool) { matches.push(parsed); return }
            } catch {}
        }
    }
    tryExtract(t)
    return matches.length ? matches : null
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE TOOL CALL — 55 tools implemented
// ─────────────────────────────────────────────────────────────────────────────
const _nodeFsSync = require('fs')
const _nodeFsPromises = require('fs').promises
const _nodePath = require('path')

const _safeWsPath = (p) => {
    if (!p) return null
    return _nodePath.resolve(p.startsWith('/') ? p : _nodePath.join('./', p))
}

const executeToolCall = async (tc, chatId, conn, m) => {
    const t = tc.tool
    const axios2 = require('axios')

    // ── bash ──────────────────────────────────────────────────────────────────
    if (t === 'bash') {
        if (!tc.cmd) return 'ERROR: no cmd'
        const blocked = [/printenv\s*$/, /cat\s+\.env\s*$/, /export\s+-p\s*$/]
        if (blocked.some(re => re.test((tc.cmd||'').trim()))) return 'BLOCKED: command refused'
        const cwd = tc.cwd ? `cd "${tc.cwd}" && ` : ''
        const r = await runBash(cwd + tc.cmd, tc.timeout || 60000)
        return (r.output || 'done (no output)').slice(0, 4000)
    }

    // ── multi_bash — run steps in sequence ───────────────────────────────────
    if (t === 'multi_bash') {
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.cmd || '']
        const results = []
        for (const cmd of steps.slice(0, 20)) {
            const cwd = tc.cwd ? `cd "${tc.cwd}" && ` : ''
            const r = await runBash(cwd + cmd, tc.timeout || 60000)
            results.push(`$ ${cmd}\n${(r.output || 'done').slice(0, 800)}`)
        }
        return results.join('\n\n---\n\n')
    }

    // ── runcode ───────────────────────────────────────────────────────────────
    if (t === 'runcode') {
        const lang = (tc.lang || 'node').toLowerCase()
        const ext = lang === 'python' ? 'py' : lang === 'bash' ? 'sh' : 'js'
        const tmpFile = `/tmp/beracode_${Date.now()}.${ext}`
        _nodeFsSync.writeFileSync(tmpFile, tc.code || '')
        const cmd = lang === 'python' ? `python3 "${tmpFile}"` : lang === 'bash' ? `bash "${tmpFile}"` : `node "${tmpFile}"`
        const r = await runBash(cmd, tc.timeout || 30000)
        try { _nodeFsSync.unlinkSync(tmpFile) } catch {}
        return (r.output || 'done (no output)').slice(0, 4000)
    }

    // ── install ───────────────────────────────────────────────────────────────
    if (t === 'install') {
        const pkgs = Array.isArray(tc.packages) ? tc.packages.join(' ') : (tc.packages || '')
        if (!pkgs) return 'ERROR: no packages listed'
        const dir = tc.path || '.'
        await runBash(`mkdir -p "${dir}"`, 5000)
        const mgr = tc.manager || 'npm'
        const cmds = {
            npm: `cd "${dir}" && npm install ${pkgs}`,
            yarn: `cd "${dir}" && yarn add ${pkgs}`,
            pip: `pip install ${pkgs}`,
            pip3: `pip3 install ${pkgs}`
        }
        const r = await runBash(cmds[mgr] || cmds.npm, 120000)
        return (r.output || 'installed').slice(0, 2000)
    }

    // ── writefile ─────────────────────────────────────────────────────────────
    if (t === 'writefile') {
        const p = _safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        _nodeFsSync.mkdirSync(_nodePath.dirname(p), { recursive: true })
        await _nodeFsPromises.writeFile(p, tc.content || '', 'utf8')
        return `written: ${p} (${(tc.content||'').length} bytes)`
    }

    // ── readfile ──────────────────────────────────────────────────────────────
    if (t === 'readfile') {
        const p = _safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        if (!_nodeFsSync.existsSync(p)) return `not found: ${p}`
        const content = await _nodeFsPromises.readFile(p, 'utf8')
        return content.slice(0, 6000)
    }

    // ── listfiles ─────────────────────────────────────────────────────────────
    if (t === 'listfiles') {
        const p = _safeWsPath(tc.path || 'workspace/')
        const r = await runBash(`ls -la "${p}" 2>&1 | head -60`, 5000)
        return r.output || 'empty'
    }

    // ── mkdir ─────────────────────────────────────────────────────────────────
    if (t === 'mkdir') {
        const p = _safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        _nodeFsSync.mkdirSync(p, { recursive: true })
        return `created: ${p}`
    }

    // ── deletefile ────────────────────────────────────────────────────────────
    if (t === 'deletefile') {
        const p = _safeWsPath(tc.path)
        if (!p || !_nodeFsSync.existsSync(p)) return `not found: ${tc.path}`
        const stat = _nodeFsSync.statSync(p)
        if (stat.isDirectory()) await runBash(`rm -rf "${p}"`, 10000)
        else await _nodeFsPromises.unlink(p)
        return `deleted: ${p}`
    }

    // ── zipfolder ─────────────────────────────────────────────────────────────
    if (t === 'zipfolder') {
        const src = _safeWsPath(tc.path)
        const out = _safeWsPath(tc.output || (tc.path + '.zip'))
        const r = await runBash(`zip -r "${out}" "${src}" 2>&1`, 60000)
        return r.output || `zipped to ${out}`
    }

    // ── pastebin — paste.rs / ix.io fallback ─────────────────────────────────
    if (t === 'pastebin' || t === 'paste') {
        const content = tc.content || tc.code || tc.text || ''
        try {
            const r = await axios2.post('https://paste.rs', content, {
                headers: { 'Content-Type': 'text/plain' }, timeout: 12000
            })
            return `📋 Paste URL: ${r.data.trim()}`
        } catch {
            try {
                const r = await axios2.post('https://hastebin.skyra.pw/documents', content, {
                    headers: { 'Content-Type': 'text/plain' }, timeout: 12000
                })
                return `📋 Paste URL: https://hastebin.skyra.pw/${r.data.key}`
            } catch (e2) { return `paste failed: ${e2.message}` }
        }
    }

    // ── api / fetch_api — LIVE API FETCHING ───────────────────────────────────
    if (t === 'api' || t === 'fetch_api' || t === 'fetch' || t === 'http') {
        const method = (tc.method || 'GET').toUpperCase()
        const url = tc.url || tc.endpoint
        if (!url) return 'ERROR: no URL provided'
        const headers = Object.assign({}, tc.headers || {})
        // Auth shortcuts
        if (tc.bearer || tc.token) headers['Authorization'] = `Bearer ${tc.bearer || tc.token}`
        if (tc.apikey) headers['x-api-key'] = tc.apikey
        if (tc.basic) headers['Authorization'] = `Basic ${Buffer.from(tc.basic).toString('base64')}`
        if (!headers['User-Agent']) headers['User-Agent'] = 'BeraAI/2.0 (+https://bera.tech)'
        const cfg = { method, url, headers, timeout: tc.timeout || 20000, validateStatus: () => true }
        if (tc.params || tc.query) cfg.params = tc.params || tc.query
        if (tc.body || tc.data) cfg.data = tc.body || tc.data
        try {
            const r = await axios2(cfg)
            const body = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : String(r.data)
            const status = `HTTP ${r.status} ${r.statusText || ''}`
            const truncated = body.slice(0, 4000)
            return `${status}\n\n${truncated}${body.length > 4000 ? '\n\n[...truncated]' : ''}`
        } catch (e) { return `HTTP error: ${e.message}` }
    }

    // ── read_page / scrape — like Replit agent ────────────────────────────────
    if (t === 'read_page' || t === 'scrape_page' || t === 'scrape') {
        const url = tc.url || ''
        if (!url) return 'ERROR: no URL'
        // Try Jina AI reader first (excellent for JS-rendered pages)
        try {
            const r = await axios2.get(`https://r.jina.ai/${url}`, {
                headers: {
                    'Accept': 'text/markdown',
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
                    'X-Return-Format': 'markdown',
                    'X-No-Cache': 'true'
                },
                timeout: 30000
            })
            if (r.status === 200 && r.data?.length > 50) {
                return `🌐 *${url}*\n\n${r.data.slice(0, 6000)}${r.data.length > 6000 ? '\n\n[...truncated]' : ''}`
            }
        } catch {}
        // Fallback: direct fetch + smart HTML strip
        try {
            const r = await axios2.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 20000
            })
            let html = String(r.data || '')
            // Strip non-content
            html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
                .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
                .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
                .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
                // Preserve structure
                .replace(/<h[1-6][^>]*>/gi, '\n## ')
                .replace(/<\/h[1-6]>/gi, '\n')
                .replace(/<p[^>]*>/gi, '\n')
                .replace(/<li[^>]*>/gi, '\n• ')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, ' ')
                // Decode entities
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                .replace(/\s{3,}/g, '\n\n').trim()
            return `🌐 *${url}*\n\n${html.slice(0, 6000)}${html.length > 6000 ? '\n\n[...truncated]' : ''}`
        } catch (e) { return `scrape failed: ${e.message}` }
    }

    // ── screenshot ────────────────────────────────────────────────────────────
    if (t === 'screenshot') {
        const sUrl = tc.url || ''
        try {
            // Try GiftedTech screenshot
            const r = await axios2.get(`https://api.giftedtech.web.id/api/search/screenshot`, {
                params: { url: sUrl, apikey: 'gifted' }, timeout: 30000, validateStatus: () => true
            })
            const img = r.data?.result?.url || r.data?.url || r.data?.result
            if (img && conn && m) {
                await conn.sendMessage(chatId, { image: { url: img }, caption: `📸 ${sUrl}` }, { quoted: m }).catch(() => {})
                return `screenshot sent`
            }
        } catch {}
        // Fallback: thum.io
        const thumbUrl = `https://image.thum.io/get/width/1200/crop/900/${encodeURIComponent(sUrl)}`
        if (conn && m) {
            await conn.sendMessage(chatId, { image: { url: thumbUrl }, caption: `📸 ${sUrl}` }, { quoted: m }).catch(() => {})
            return `screenshot sent via thum.io`
        }
        return thumbUrl
    }

    // ── search ────────────────────────────────────────────────────────────────
    if (t === 'search') {
        const res = await webSearch(tc.q || tc.query || '')
        if (!res.success || !res.results?.length) return 'No results found'
        return res.results.slice(0, 5).map((r, i) => `${i+1}. *${r.title}*\n${r.snippet}\n${r.url}`).join('\n\n')
    }

    // ── news ──────────────────────────────────────────────────────────────────
    if (t === 'news') {
        const q = tc.query || tc.topic || tc.q || 'technology news'
        // Use GNews API (free tier available)
        try {
            const r = await axios2.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=5&apikey=bbbc5ec9e33cb9cda571f61a1ba8cf0f`, {
                timeout: 10000, validateStatus: () => true
            })
            if (r.data?.articles?.length) {
                return r.data.articles.map(a => `📰 *${a.title}*\n${a.description || ''}\n${a.url}\n_${a.source?.name} — ${new Date(a.publishedAt).toLocaleDateString()}_`).join('\n\n')
            }
        } catch {}
        // Fallback to web search
        const res = await webSearch(q)
        return res.success ? res.results.slice(0, 5).map(r => `📰 *${r.title}*\n${r.snippet}`).join('\n\n') : 'news unavailable'
    }

    // ── weather ───────────────────────────────────────────────────────────────
    if (t === 'weather') {
        const city = tc.city || tc.location || ''
        try {
            const r = await axios2.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
                headers: { 'User-Agent': 'curl/7.68' }, timeout: 12000
            })
            const w = r.data.current_condition?.[0]
            const area = r.data.nearest_area?.[0]
            const forecast = r.data.weather?.slice(0, 3).map(d => `  📅 ${d.date}: ${d.mintempC}°-${d.maxtempC}°C ${d.hourly?.[4]?.weatherDesc?.[0]?.value || ''}`).join('\n')
            return `🌤️ *Weather: ${area?.areaName?.[0]?.value || city}*\n` +
                `🌡️ Temp: ${w?.temp_C}°C (feels ${w?.FeelsLikeC}°C)\n` +
                `💧 Humidity: ${w?.humidity}%\n` +
                `💨 Wind: ${w?.windspeedKmph}km/h ${w?.winddir16Point}\n` +
                `☁️ ${w?.weatherDesc?.[0]?.value}\n\n` +
                `*3-Day Forecast:*\n${forecast || 'N/A'}`
        } catch (e) { return `weather error: ${e.message}` }
    }

    // ── crypto ────────────────────────────────────────────────────────────────
    if (t === 'crypto') {
        const coins = Array.isArray(tc.coins) ? tc.coins.join(',') : (tc.coin || tc.coins || 'bitcoin,ethereum,solana,dogecoin')
        try {
            const r = await axios2.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coins}&vs_currencies=usd,kes&include_24hr_change=true&include_market_cap=true`, { timeout: 12000 })
            return Object.entries(r.data).map(([coin, d]) => {
                const chg = d.usd_24h_change?.toFixed(2)
                const arrow = chg >= 0 ? '📈' : '📉'
                const mktcap = d.usd_market_cap ? ` | MCap: $${(d.usd_market_cap/1e9).toFixed(2)}B` : ''
                return `*${coin.toUpperCase()}*\n💵 $${d.usd?.toLocaleString()} ${arrow} ${chg}%\n🇰🇪 KES ${d.kes?.toLocaleString()}${mktcap}`
            }).join('\n\n')
        } catch (e) { return `crypto error: ${e.message}` }
    }

    // ── stock ─────────────────────────────────────────────────────────────────
    if (t === 'stock') {
        const symbols = Array.isArray(tc.symbols) ? tc.symbols : [(tc.symbol || tc.symbols || 'AAPL')]
        const results = []
        for (const sym of symbols.slice(0, 8)) {
            try {
                const r = await axios2.get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
                })
                const meta = r.data.chart?.result?.[0]?.meta
                if (meta) {
                    const chg = ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2)
                    const arrow = chg >= 0 ? '📈' : '📉'
                    results.push(`*${sym}* ${arrow}\n💵 $${meta.regularMarketPrice} (${chg}%)\nPrev: $${meta.previousClose} | Vol: ${(meta.regularMarketVolume/1e6).toFixed(1)}M`)
                } else results.push(`${sym}: no data`)
            } catch { results.push(`${sym}: error`) }
        }
        return results.join('\n\n')
    }

    // ── ip_info ───────────────────────────────────────────────────────────────
    if (t === 'ip_info') {
        const ip = tc.ip || ''
        try {
            const r = await axios2.get(`https://ipinfo.io/${ip}/json`, { timeout: 10000 })
            const d = r.data
            return `🌍 *IP: ${d.ip}*\n📍 ${d.city}, ${d.region}, ${d.country}\n🏢 ISP: ${d.org}\n🕐 Timezone: ${d.timezone}\n📍 Coords: ${d.loc}`
        } catch (e) { return `ip_info error: ${e.message}` }
    }

    // ── dns ───────────────────────────────────────────────────────────────────
    if (t === 'dns') {
        const domain = tc.domain || tc.host || ''
        const type = tc.type || 'A'
        try {
            const r = await axios2.get(`https://dns.google/resolve?name=${domain}&type=${type}`, { timeout: 10000 })
            const answers = r.data.Answer || r.data.Authority || []
            if (!answers.length) return `no ${type} records for ${domain}`
            return `*DNS ${type} for ${domain}:*\n${answers.map(a => `• ${a.data} (TTL: ${a.TTL}s)`).join('\n')}`
        } catch (e) { return `dns error: ${e.message}` }
    }

    // ── whois ─────────────────────────────────────────────────────────────────
    if (t === 'whois') {
        const domain = tc.domain || ''
        const r = await runBash(`whois ${domain} 2>&1 | head -40`, 15000)
        return r.output || 'whois failed'
    }

    // ── ping_url / check_url ──────────────────────────────────────────────────
    if (t === 'ping_url' || t === 'check_url') {
        const url = tc.url || ''
        if (!url) return 'ERROR: no URL'
        const start = Date.now()
        try {
            const r = await axios2.get(url, { timeout: 12000, validateStatus: () => true, maxRedirects: 5, headers: { 'User-Agent': 'BeraAI/2.0' } })
            const ms = Date.now() - start
            const statusEmoji = r.status < 300 ? '✅' : r.status < 500 ? '⚠️' : '❌'
            return `${statusEmoji} *${url}*\nStatus: ${r.status}\nLatency: ${ms}ms\nType: ${r.headers['content-type']?.split(';')[0] || 'unknown'}\nSize: ${r.headers['content-length'] || '?'} bytes`
        } catch (e) {
            return `❌ *${url}*\nDown — ${e.message}`
        }
    }

    // ── port_scan ─────────────────────────────────────────────────────────────
    if (t === 'port_scan') {
        const host = tc.host || ''
        const ports = Array.isArray(tc.ports) ? tc.ports.join(',') : (tc.ports || '22,80,443,3000,5000,8080')
        const r = await runBash(`nmap -p ${ports} --open -T4 ${host} 2>&1 | head -30`, 30000)
        return r.output || 'scan failed'
    }

    // ── email ─────────────────────────────────────────────────────────────────
    if (t === 'email') {
        const smtpConfig = global.db?.data?.settings?.smtp
        if (!smtpConfig?.user) return '❌ Email not configured.\nOwner must run: .setemail <host> <port> <user> <password>\nExample: .setemail smtp.gmail.com 587 bot@gmail.com AppPassword123'
        if (!tc.to) return 'ERROR: no recipient (to field)'
        try {
            const nodemailer = require('nodemailer')
            const transporter = nodemailer.createTransport({
                host: smtpConfig.host || 'smtp.gmail.com',
                port: parseInt(smtpConfig.port) || 587,
                secure: smtpConfig.port === 465,
                auth: { user: smtpConfig.user, pass: smtpConfig.pass }
            })
            const info = await transporter.sendMail({
                from: tc.from || `Bera AI <${smtpConfig.user}>`,
                to: tc.to,
                subject: tc.subject || 'Message from Bera AI',
                [tc.html ? 'html' : 'text']: tc.body || tc.message || tc.content || ''
            })
            return `✅ Email sent to ${tc.to}!\nMessage ID: ${info.messageId}`
        } catch (e) { return `email failed: ${e.message}` }
    }

    // ── tts — FIXED: Google TTS with proper User-Agent ────────────────────────
    if (t === 'tts') {
        const text = (tc.text || '').slice(0, 200)
        const lang = tc.lang || tc.voice || 'en'
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`
        if (!conn || !m) return `TTS URL: ${ttsUrl}`
        try {
            // Fetch audio with proper headers to avoid 403, then send as buffer
            const r = await axios2.get(ttsUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://translate.google.com/',
                    'Accept': 'audio/mpeg, audio/*, */*'
                },
                timeout: 15000
            })
            await conn.sendMessage(chatId,
                { audio: Buffer.from(r.data), mimetype: 'audio/mpeg', ptt: tc.ptt !== false },
                { quoted: m }
            ).catch(() => {})
            return `🔊 TTS sent: "${text}"`
        } catch (e) { return `TTS failed: ${e.message}` }
    }

    // ── translate_text ────────────────────────────────────────────────────────
    if (t === 'translate_text' || t === 'translate') {
        const text = tc.text || ''
        const to = tc.to || tc.target || 'en'
        const from = tc.from || 'auto'
        try {
            // MyMemory free translation (1000 req/day, no auth)
            const r = await axios2.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`, { timeout: 12000 })
            const translated = r.data?.responseData?.translatedText
            if (translated && translated !== 'NO QUERY SPECIFIED') return `🌐 [${from} → ${to}]\n${translated}`
        } catch {}
        return 'translation unavailable'
    }

    // ── image_gen — multi-provider ────────────────────────────────────────────
    if (t === 'image_gen' || t === 'imagine') {
        const prompt = tc.prompt || tc.text || ''
        if (!prompt) return 'ERROR: no prompt'
        const provider = (tc.provider || 'pollinations').toLowerCase()
        const width = tc.width || 1024
        const height = tc.height || 1024

        let imageUrl = ''
        if (provider === 'pollinations' || provider === 'flux' || provider === 'default') {
            const model = tc.model || 'flux'
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&nologo=true&enhance=true&seed=${Date.now()}`
        } else if (provider === 'anime') {
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', anime style, high quality')}?width=${width}&height=${height}&model=anime&nologo=true`
        } else if (provider === 'sdxl' || provider === 'stable-diffusion') {
            try {
                const hfToken = global.db?.data?.settings?.hfToken || process.env.HF_TOKEN
                const headers = hfToken ? { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
                const r = await axios2.post('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
                    { inputs: prompt, parameters: { width, height } },
                    { headers, responseType: 'arraybuffer', timeout: 90000 }
                )
                if (conn && m) {
                    await conn.sendMessage(chatId, { image: Buffer.from(r.data), caption: `🎨 ${prompt}\n_via SDXL_` }, { quoted: m }).catch(() => {})
                    return 'image sent (SDXL)'
                }
                return 'image generated (no connection)'
            } catch (e) {
                // Fallback to Pollinations if HF fails
                imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`
            }
        } else if (provider === 'realistic') {
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', photorealistic, 8k, detailed')}?width=${width}&height=${height}&model=flux-realism&nologo=true`
        } else {
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`
        }

        if (imageUrl && conn && m) {
            await conn.sendMessage(chatId, { image: { url: imageUrl }, caption: `🎨 *${prompt}*\n_via ${provider}_` }, { quoted: m }).catch(() => {})
            return `image sent`
        }
        return imageUrl || 'image gen failed'
    }

    // ── qrgen ─────────────────────────────────────────────────────────────────
    if (t === 'qrgen') {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(tc.text || '')}`
        if (conn && m) {
            await conn.sendMessage(chatId, { image: { url }, caption: `🔲 QR: ${tc.text}` }, { quoted: m }).catch(() => {})
            return 'QR code sent'
        }
        return `QR URL: ${url}`
    }

    // ── barcode / qr ──────────────────────────────────────────────────────────
    if (t === 'barcode') {
        const text = tc.text || ''
        const type = (tc.type || 'qr').toLowerCase()
        let url
        if (type === 'qr') {
            url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}`
        } else {
            const bcType = { code128: 'CODE128', code39: 'CODE39', ean13: 'EAN13', upca: 'UPCA' }[type] || 'CODE128'
            url = `https://barcodeapi.org/api/${bcType}/${encodeURIComponent(text)}`
        }
        if (conn && m) {
            await conn.sendMessage(chatId, { image: { url }, caption: `📊 Barcode (${type}): ${text}` }, { quoted: m }).catch(() => {})
            return `barcode sent`
        }
        return url
    }

    // ── send_media ────────────────────────────────────────────────────────────
    if (t === 'send_media' || t === 'send_image' || t === 'send_video' || t === 'send_audio') {
        if (!conn || !m) return 'ERROR: no connection'
        const url = tc.url || ''
        const caption = tc.caption || ''
        const type = t === 'send_video' ? 'video' : t === 'send_audio' ? 'audio' : (tc.type || 'image')
        await conn.sendMessage(chatId, { [type]: { url }, caption }, { quoted: m }).catch(() => {})
        return `sent ${type}`
    }

    // ── system ────────────────────────────────────────────────────────────────
    if (t === 'system') {
        const info = await richServerStats()
        return JSON.stringify(info, null, 2)
    }

    // ── status_dashboard ──────────────────────────────────────────────────────
    if (t === 'status_dashboard' || t === 'dashboard') {
        const sys = await richServerStats()
        const crons = Object.entries(global._cronJobs || {})
        const monitors = Object.entries(global._monitors || {})
        const notes = Object.keys(global.db?.data?.notes || {})
        let bhLines = '┃ not connected (use .setbhkey)'
        try {
            const bh = require('./berahost')
            const deps = await bh.listDeployments()
            const list = Array.isArray(deps) ? deps : (deps.deployments || [])
            if (list.length) {
                bhLines = list.slice(0, 5).map(d => `┃ ${d.status === 'running' ? '🟢' : '🔴'} #${d.id} ${d.name || d.botName || ''}`).join('\n')
            } else bhLines = '┃ no deployments yet'
        } catch {}
        return `╭══〘 🤖 BERA AI STATUS 〙═⊷
┃ 🧠 RAM: ${sys.memory.used}/${sys.memory.total} (${sys.memory.pct})
┃ 💾 Disk: ${sys.disk.used}/${sys.disk.total} (${sys.disk.pct})
┃ ⏱️ Uptime: ${sys.uptime}
┃ 📈 Load: ${sys.load}
┃ 🖥️ CPUs: ${sys.cpus}
┃
┃ ━━━ 🚀 BERAHOST BOTS ━━━
${bhLines}
┃
┃ ━━━ ⏰ CRON JOBS (${crons.length}) ━━━
${crons.length ? crons.map(([id, j]) => `┃ • ${id}: ${j.schedule}`).join('\n') : '┃ none'}
┃
┃ ━━━ 👁️ MONITORS (${monitors.length}) ━━━
${monitors.length ? monitors.map(([id, mon]) => `┃ • ${id}: ${mon.lastStatus === true ? '✅ up' : mon.lastStatus === false ? '🔴 down' : '⏳'}`).join('\n') : '┃ none'}
┃
┃ ━━━ 📝 NOTES (${notes.length}) ━━━
${notes.length ? notes.slice(0, 5).map(n => `┃ • ${n}`).join('\n') : '┃ none'}
╰══════════════════⊷`
    }

    // ── memory: remember ──────────────────────────────────────────────────────
    if (t === 'remember') {
        if (!tc.key || tc.value === undefined) return 'ERROR: need key and value'
        saveMemory(chatId, tc.key, String(tc.value))
        return `🧠 remembered: *${tc.key}* = ${tc.value}`
    }

    // ── memory: recall ────────────────────────────────────────────────────────
    if (t === 'recall') {
        if (!tc.key) return JSON.stringify(getMemory(chatId))
        const val = getMemory(chatId)[tc.key]
        return val !== undefined ? `🧠 *${tc.key}*: ${val}` : `not found: ${tc.key}`
    }

    // ── memory: recall_all ────────────────────────────────────────────────────
    if (t === 'recall_all') {
        const mem = getMemory(chatId)
        const keys = Object.keys(mem)
        if (!keys.length) return '🧠 Memory is empty'
        return `🧠 *All memories:*\n${keys.map(k => `• ${k}: ${mem[k]}`).join('\n')}`
    }

    // ── memory: forget ────────────────────────────────────────────────────────
    if (t === 'forget') {
        deleteMemory(chatId, tc.key)
        return `🗑️ forgotten: ${tc.key || 'all'}`
    }

    // ── note ──────────────────────────────────────────────────────────────────
    if (t === 'note') {
        if (!global.db?.data) return 'ERROR: no db'
        if (!global.db.data.notes) global.db.data.notes = {}
        const action = tc.action || 'list'
        if (action === 'add' || action === 'save') {
            const title = tc.title || `note_${Date.now()}`
            global.db.data.notes[title] = { content: tc.content || '', createdAt: new Date().toISOString() }
            await global.db.write().catch(() => {})
            return `✅ note saved: "${title}"`
        }
        if (action === 'list') {
            const keys = Object.keys(global.db.data.notes)
            return keys.length ? `📝 *Notes:*\n${keys.map(n => `• ${n}`).join('\n')}` : 'no notes'
        }
        if (action === 'get' || action === 'read') {
            const n = global.db.data.notes[tc.title]
            return n ? `📝 *${tc.title}*\n${n.content}` : `not found: ${tc.title}`
        }
        if (action === 'delete') {
            delete global.db.data.notes[tc.title]
            await global.db.write().catch(() => {})
            return `deleted note: ${tc.title}`
        }
        return 'unknown note action'
    }

    // ── github ────────────────────────────────────────────────────────────────
    if (t === 'github') {
        const token = tc.token || global.db?.data?.settings?.gitToken || process.env.GIT_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
        const headers = Object.assign({ 'Accept': 'application/vnd.github.v3+json' }, token ? { 'Authorization': `token ${token}` } : {})
        const base = 'https://api.github.com'
        const action = tc.action || 'list_repos'
        try {
            if (action === 'list_repos') {
                const url = tc.user ? `${base}/users/${tc.user}/repos?per_page=15&sort=updated` : `${base}/user/repos?per_page=15&sort=updated`
                const r = await axios2.get(url, { headers, timeout: 10000 })
                return r.data.map(repo => `• *${repo.full_name}* ⭐${repo.stargazers_count}\n  ${repo.description || 'no description'} [${repo.language || '?'}]`).join('\n\n')
            }
            if (action === 'get_file') {
                const r = await axios2.get(`${base}/repos/${tc.repo}/contents/${tc.path}`, { headers, timeout: 10000 })
                return Buffer.from(r.data.content, 'base64').toString('utf8').slice(0, 4000)
            }
            if (action === 'create_file' || action === 'update_file') {
                const existing = await axios2.get(`${base}/repos/${tc.repo}/contents/${tc.path}`, { headers, timeout: 10000, validateStatus: () => true })
                const body = { message: tc.message || 'Update from Bera AI', content: Buffer.from(tc.content || '').toString('base64') }
                if (existing.status === 200) body.sha = existing.data.sha
                const r = await axios2.put(`${base}/repos/${tc.repo}/contents/${tc.path}`, body, { headers, timeout: 15000 })
                return `✅ ${action === 'create_file' ? 'created' : 'updated'}: ${r.data.content?.html_url}`
            }
            if (action === 'get_issues') {
                const r = await axios2.get(`${base}/repos/${tc.repo}/issues?state=open&per_page=15`, { headers, timeout: 10000 })
                return r.data.map(i => `#${i.number} [${i.state}] *${i.title}*`).join('\n')
            }
            if (action === 'list_branches') {
                const r = await axios2.get(`${base}/repos/${tc.repo}/branches`, { headers, timeout: 10000 })
                return r.data.map(b => `• ${b.name}`).join('\n')
            }
            if (action === 'clone') {
                const repoUrl = tc.repo.startsWith('http') ? tc.repo : `https://github.com/${tc.repo}`
                const dest = tc.dest || `workspace/${tc.repo.split('/').pop()}`
                const r = await runBash(`git clone ${repoUrl} ${dest} 2>&1`, 120000)
                return r.output || 'cloned'
            }
            if (action === 'search') {
                const r = await axios2.get(`${base}/search/repositories?q=${encodeURIComponent(tc.q || '')}&sort=stars&per_page=5`, { headers, timeout: 10000 })
                return r.data.items.map(repo => `⭐${repo.stargazers_count} *${repo.full_name}* — ${repo.description || ''}`).join('\n\n')
            }
            return `unknown github action: ${action}`
        } catch (e) { return `github error: ${e.message}` }
    }

    // ── berahost ──────────────────────────────────────────────────────────────
    if (t === 'berahost') {
        const bhLib = require('./berahost')
        const action = tc.action || 'list'
        try {
            switch (action) {
                case 'list': { const d = await bhLib.listDeployments(); return JSON.stringify(d, null, 2).slice(0, 2500) }
                case 'status': { const d = await bhLib.getDeployment(tc.id); return JSON.stringify(d, null, 2).slice(0, 1500) }
                case 'start': { await bhLib.startDeployment(tc.id); return `✅ started #${tc.id}` }
                case 'stop': { await bhLib.stopDeployment(tc.id); return `🛑 stopped #${tc.id}` }
                case 'logs': {
                    const logs = await bhLib.getLogs(tc.id)
                    const lines = Array.isArray(logs) ? logs : (logs.logs || [])
                    return lines.slice(-25).map(l => l.logLine || l).join('\n')
                }
                case 'deploy': {
                    const d = await bhLib.createDeployment(tc.botId, tc.envVars || {})
                    return `✅ deployed: id=${d.id} status=${d.status}`
                }
                case 'coins': { const c = await bhLib.getCoins(); return `💰 Coins: ${c.coins}\n📅 Streak: ${c.streak}\n🎁 Can claim: ${c.canClaimToday}` }
                case 'bots': { const bots = await bhLib.getBots(); return bots.map(b => `[${b.id}] *${b.name}* — ${Object.keys(b.requiredVars||{}).join(', ')}`).join('\n') }
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
        return (r.output || 'deployment attempted').slice(0, 2000)
    }

    // ── deploy_railway ────────────────────────────────────────────────────────
    if (t === 'deploy_railway') {
        const folder = tc.folder || 'workspace/'
        const r = await runBash(`cd "${folder}" && npx @railway/cli up 2>&1`, 120000)
        return (r.output || 'deployment attempted').slice(0, 2000)
    }

    // ── db ────────────────────────────────────────────────────────────────────
    if (t === 'db') {
        const file = _safeWsPath(tc.file || 'workspace/data.sqlite')
        const sql = tc.sql || ''
        if (!sql) return 'ERROR: no SQL'
        const action = tc.action || 'query'
        const escapedFile = file.replace(/'/g, "\\'")
        const escapedSql = sql.replace(/`/g, '\\`').replace(/\\/g, '\\\\')
        const jsCode = `
try {
    const Database = require('better-sqlite3');
    const db = new Database('${escapedFile}');
    if ('${action}' === 'query') {
        const rows = db.prepare(\`${escapedSql}\`).all();
        console.log(JSON.stringify(rows, null, 2));
    } else {
        const info = db.prepare(\`${escapedSql}\`).run();
        console.log(JSON.stringify({changes: info.changes, lastInsertRowid: info.lastInsertRowid}));
    }
    db.close();
} catch(e) { console.error('DB Error:', e.message); }`
        const tmpFile = `/tmp/db_${Date.now()}.js`
        _nodeFsSync.writeFileSync(tmpFile, jsCode)
        const r = await runBash(`node "${tmpFile}" 2>&1`, 15000)
        try { _nodeFsSync.unlinkSync(tmpFile) } catch {}
        return (r.output || 'done').slice(0, 3000)
    }

    // ── cron ──────────────────────────────────────────────────────────────────
    if (t === 'cron') {
        if (!global._cronJobs) global._cronJobs = {}
        const action = tc.action || 'list'
        if (action === 'add') {
            const id = tc.id || `cron_${Date.now()}`
            if (!tc.schedule || !tc.task) return 'ERROR: need schedule and task'
            global._cronJobs[id] = { schedule: tc.schedule, task: tc.task, chat: chatId, createdAt: new Date().toISOString() }
            try {
                const cron = require('node-cron')
                if (!cron.validate(tc.schedule)) return `ERROR: invalid cron expression: ${tc.schedule}`
                if (!global._cronTasks) global._cronTasks = {}
                global._cronTasks[id] = cron.schedule(tc.schedule, async () => {
                    try { if (conn) await conn.sendMessage(chatId, { text: `⏰ *Cron [${id}]:* ${tc.task}` }) } catch {}
                })
            } catch {}
            return `✅ Cron *${id}* scheduled: \`${tc.schedule}\` — ${tc.task}`
        }
        if (action === 'list') {
            const jobs = Object.entries(global._cronJobs)
            return jobs.length ? `⏰ *Cron Jobs (${jobs.length}):*\n${jobs.map(([id, j]) => `• *${id}*: \`${j.schedule}\` — ${j.task}`).join('\n')}` : 'No cron jobs'
        }
        if (action === 'cancel' || action === 'stop') {
            const id = tc.id
            if (!id) return 'ERROR: need id'
            try { global._cronTasks?.[id]?.stop(); delete global._cronTasks?.[id] } catch {}
            delete global._cronJobs?.[id]
            return `cancelled: ${id}`
        }
        return 'unknown cron action'
    }

    // ── monitor ───────────────────────────────────────────────────────────────
    if (t === 'monitor') {
        if (!global._monitors) global._monitors = {}
        if (!global._monitorIntervals) global._monitorIntervals = {}
        const action = tc.action || 'list'
        if (action === 'add') {
            const id = tc.id || tc.url
            const url = tc.url
            const interval = (tc.interval || 300) * 1000
            if (!url) return 'ERROR: need url'
            global._monitors[id] = { url, interval, chat: chatId, lastStatus: null }
            const check = async () => {
                if (!global._monitors[id]) return
                try {
                    const r = await axios2.get(url, { timeout: 10000, validateStatus: () => true })
                    const up = r.status < 400
                    const prev = global._monitors[id].lastStatus
                    if (prev !== null && prev !== up && conn) {
                        await conn.sendMessage(chatId, { text: up ? `✅ *${url}* is back UP (${r.status})` : `🔴 *${url}* is DOWN (${r.status})` }).catch(() => {})
                    }
                    if (global._monitors[id]) global._monitors[id].lastStatus = up
                } catch (e) {
                    if (global._monitors[id]?.lastStatus !== false && conn) {
                        await conn.sendMessage(chatId, { text: `🔴 *${url}* is DOWN — ${e.message}` }).catch(() => {})
                    }
                    if (global._monitors[id]) global._monitors[id].lastStatus = false
                }
            }
            check()
            global._monitorIntervals[id] = setInterval(check, interval)
            return `✅ Monitoring *${url}* every ${tc.interval || 300}s`
        }
        if (action === 'list') {
            const entries = Object.entries(global._monitors)
            return entries.length ? `👁️ *Monitors:*\n${entries.map(([id, mon]) => `• *${id}* (${mon.url}): ${mon.lastStatus === true ? '✅ up' : mon.lastStatus === false ? '🔴 down' : '⏳ checking'}`).join('\n')}` : 'No monitors'
        }
        if (action === 'remove' || action === 'stop') {
            const id = tc.id || tc.url
            try { clearInterval(global._monitorIntervals?.[id]); delete global._monitorIntervals?.[id] } catch {}
            delete global._monitors?.[id]
            return `stopped monitoring: ${id}`
        }
        return 'unknown monitor action'
    }

    // ── wa_kick ───────────────────────────────────────────────────────────────
    if (t === 'wa_kick') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        if (!group?.endsWith('@g.us')) return 'ERROR: must be used in a group'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        if (!num) return 'ERROR: no number'
        const jid = num.includes('@') ? tc.number : `${num}@s.whatsapp.net`
        try { await conn.groupParticipantsUpdate(group, [jid], 'remove'); return `kicked: ${num}` }
        catch (e) { return `kick failed: ${e.message}` }
    }

    // ── wa_promote ────────────────────────────────────────────────────────────
    if (t === 'wa_promote') {
        if (!conn) return 'ERROR: no connection'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        const jid = `${num}@s.whatsapp.net`
        try { await conn.groupParticipantsUpdate(tc.group || chatId, [jid], 'promote'); return `promoted: ${num}` }
        catch (e) { return `promote failed: ${e.message}` }
    }

    // ── wa_demote ─────────────────────────────────────────────────────────────
    if (t === 'wa_demote') {
        if (!conn) return 'ERROR: no connection'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        const jid = `${num}@s.whatsapp.net`
        try { await conn.groupParticipantsUpdate(tc.group || chatId, [jid], 'demote'); return `demoted: ${num}` }
        catch (e) { return `demote failed: ${e.message}` }
    }

    // ── wa_send ───────────────────────────────────────────────────────────────
    if (t === 'wa_send') {
        if (!conn) return 'ERROR: no connection'
        const to = tc.number || tc.to || chatId
        try { await conn.sendMessage(to, { text: tc.message || '' }); return `sent to ${to}` }
        catch (e) { return `send failed: ${e.message}` }
    }

    // ── wa_react ──────────────────────────────────────────────────────────────
    if (t === 'wa_react') {
        if (!conn || !m) return 'ERROR: no connection'
        try {
            await conn.sendMessage(chatId, { react: { text: tc.emoji || '👍', key: m.key } })
            return `reacted: ${tc.emoji}`
        } catch (e) { return `react failed: ${e.message}` }
    }

    // ── calc ──────────────────────────────────────────────────────────────────
    if (t === 'calc') {
        try {
            const expr = (tc.expr || tc.expression || '').replace(/[^0-9+\-*/().^ sqrt,!%]/g, '').slice(0, 300)
            const safe = expr.replace(/\^/g, '**').replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
            const result = new Function('return ' + safe)()
            return `🔢 ${tc.expr} = *${result}*`
        } catch (e) { return `calc error: ${e.message}` }
    }

    // ── currency ──────────────────────────────────────────────────────────────
    if (t === 'currency') {
        try {
            const r = await axios2.get(`https://api.exchangerate.host/convert?from=${tc.from}&to=${tc.to}&amount=${tc.amount}`, { timeout: 12000 })
            const result = r.data?.result
            if (result) return `💱 ${tc.amount} *${tc.from}* = *${result.toFixed(2)} ${tc.to}*`
        } catch {}
        // Fallback: use crypto coingecko rates if KES
        return 'currency conversion unavailable'
    }

    // ── unit_convert ──────────────────────────────────────────────────────────
    if (t === 'unit_convert') {
        const conversions = {
            'km_mi': 0.621371, 'mi_km': 1.60934, 'kg_lb': 2.20462, 'lb_kg': 0.453592,
            'c_f': v => v * 9/5 + 32, 'f_c': v => (v - 32) * 5/9, 'k_c': v => v - 273.15, 'c_k': v => v + 273.15,
            'm_ft': 3.28084, 'ft_m': 0.3048, 'm_yard': 1.09361, 'yard_m': 0.9144,
            'l_gal': 0.264172, 'gal_l': 3.78541, 'ml_oz': 0.033814, 'oz_ml': 29.5735,
            'gb_mb': 1024, 'mb_gb': v => v / 1024, 'tb_gb': 1024, 'gb_tb': v => v / 1024,
            'kph_mph': 0.621371, 'mph_kph': 1.60934, 'ms_kph': 3.6, 'kph_ms': v => v / 3.6
        }
        const key = `${tc.from}_${tc.to}`.toLowerCase()
        const conv = conversions[key]
        if (!conv) return `unknown conversion: ${tc.from} → ${tc.to}`
        const result = typeof conv === 'function' ? conv(Number(tc.value)) : Number(tc.value) * conv
        return `📐 ${tc.value} *${tc.from}* = *${result.toFixed(4)} ${tc.to}*`
    }

    return `❓ unknown tool: *${t}*\nAvailable tools listed in help. Ask "what tools do you have?" for the full list.`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AGENT LOOP — executes tools, feeds results back, gets final answer
// ─────────────────────────────────────────────────────────────────────────────
const generateAdvancedReply = async (text, chat, conn, m, opts = {}) => {
    // Pre-dispatch hook (existing utility)
    try {
        const pd = await preDispatch(text)
        if (pd?.reply) {
            pushHistory(chat, 'user', text)
            pushHistory(chat, 'assistant', pd.reply)
            return pd
        }
    } catch {}

    // Rate limiting for non-owners
    if (global.db?.data && !opts.isOwner) {
        const now = Date.now()
        const db = global.db.data
        if (!db.users) db.users = {}
        if (!db.users[chat]) db.users[chat] = {}
        const u = db.users[chat]
        u.agentCalls = (u.agentCalls || []).filter(ts => now - ts < 3600000)
        if (u.agentCalls.length >= 15) return { success: false, reply: '⏳ Rate limit: 15 agent tasks/hour.' }
        u.agentCalls.push(now)
        await global.db.write().catch(() => {})
    }

    pushHistory(chat, 'user', text)

    // Build rich context for the agent
    const mem = getMemory(chat)
    const memStr = Object.keys(mem).length
        ? '\n\nStored memory:\n' + Object.entries(mem).map(([k, v]) => `${k}: ${v}`).join('\n') : ''

    let wsCtx = ''
    try {
        const r = await runBash('ls workspace/ 2>/dev/null | head -20', 3000)
        if (r.output?.trim()) wsCtx = '\n\nWorkspace contents:\n' + r.output.trim()
    } catch {}

    // Inject WhatsApp context for group ops
    let mentionCtx = ''
    try {
        const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentioned.length) mentionCtx = '\n\nMentioned users: ' + mentioned.map(j => j.split('@')[0]).join(', ')
    } catch {}

    const groupCtx = (m?.isGroup && chat?.endsWith('@g.us')) ? `\n\nCurrent group JID: ${chat}` : ''

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT + memStr + wsCtx + mentionCtx + groupCtx },
        ...getHistory(chat).slice(-12)
    ]

    const loopCap = opts.maxLoops || 25
    let stepCount = 0

    for (let loop = 0; loop < loopCap; loop++) {
        let aiReply
        try { aiReply = await callAI(messages, 60000) } catch {}
        if (!aiReply) aiReply = localFallback(text)

        const toolCalls = parseToolCalls(aiReply)

        if (!toolCalls || !toolCalls.length) {
            // No tools → final answer
            pushHistory(chat, 'assistant', aiReply)
            return { success: true, reply: aiReply }
        }

        // Show progress for first 3 steps, then every 5
        stepCount += toolCalls.length
        if ((stepCount <= 3 || stepCount % 5 < toolCalls.length) && conn && m) {
            const toolNames = toolCalls.map(tc => tc.tool).join(', ')
            conn.sendMessage(chat, { text: `⚙️ *Working...* (step ${stepCount})\n_Tools: ${toolNames}_` }).catch(() => {})
        }

        messages.push({ role: 'assistant', content: aiReply })

        // Execute all tool calls
        const toolResults = []
        for (const tc of toolCalls) {
            try {
                const result = await executeToolCall(tc, chat, conn, m)
                toolResults.push({ tool: tc.tool, result: String(result).slice(0, 3000) })
            } catch (e) {
                toolResults.push({ tool: tc.tool, result: `EXECUTION ERROR: ${e.message}` })
            }
        }

        const resultsText = toolResults.map(r => `[Tool: ${r.tool}]\n${r.result}`).join('\n\n---\n\n')

        messages.push({
            role: 'user',
            content: `Tool results:\n${resultsText}\n\nContinue the task. If fully complete, give your final answer in plain text (no JSON).`
        })
    }

    return { success: false, reply: '⚠️ Task too complex. Try breaking it into smaller steps.' }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE CHAT MODE (no tools)
// ─────────────────────────────────────────────────────────────────────────────
const generateSimpleReply = async (text, chat) => {
    pushHistory(chat, 'user', text)
    const messages = [
        { role: 'system', content: 'You are Bera AI — a friendly, smart WhatsApp assistant by Bera Tech. Be helpful, concise, and conversational.' },
        ...getHistory(chat).slice(-6)
    ]
    try {
        const reply = await callAI(messages, 20000)
        if (reply?.length > 1) {
            pushHistory(chat, 'assistant', reply)
            return { success: true, reply }
        }
        return { success: false, reply: 'Bera AI is busy, please try again.' }
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
    callPollinations,
    parseToolCalls,
    executeToolCall
}
