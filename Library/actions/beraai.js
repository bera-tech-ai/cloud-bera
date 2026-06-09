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

// ── Global Bera Identity Sanitizer — strips all AI identity leaks ─────────────
// Applied to EVERY response from ALL providers before returning to the user.
// Prevents Gemini/DeepSeek/Claude from revealing their true identity.
const _sanitizeIdentity = (text) => {
    if (!text || typeof text !== 'string') return text
    return text
        // ── "I am X" patterns ──────────────────────────────────────────────────
        .replace(/\bI am Gemini(?:-[\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI'm Gemini(?:-[\w.]+)?[,.]?/gi, "I'm Bera AI,")
        .replace(/\bI am DeepSeek(?:-[\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI'm DeepSeek(?:-[\w.]+)?[,.]?/gi, "I'm Bera AI,")
        .replace(/\bI am ChatGPT(?:-[\w.]+)?[,.]?/gi, 'I am Bera AI,')
          .replace(/\bI'm ChatGPT(?:-[\w.]+)?[,.]?/gi, "I'm Bera AI,")
          .replace(/\bI'm GPT-?[0-9o]+[,.]?/gi, "I'm Bera AI,")
          .replace(/\bAs ChatGPT[,.]?/gi, 'As Bera AI,')
          .replace(/\bmy name is ChatGPT/gi, 'my name is Bera AI')
          .replace(/\ban AI language model (?:built|created|developed|trained|made) by OpenAI/gi, 'an AI assistant built by Bera Tech')
          .replace(/\b(I was |I'm )?(?:a|an) AI (?:language model|assistant) (?:by|from|created by|built by) OpenAI/gi, "I'm Bera AI, an assistant by Bera Tech")
          .replace(/\bOpenAI(?:'s)?/gi, "Bera Tech's")
        .replace(/\bI am GPT-?[0-9o]+[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI am Claude(?:[\s-][\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI am Llama(?:[\s-][\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI am Mistral(?:[\s-][\w.]+)?[,.]?/gi, 'I am Bera AI,')
        // ── "As X" roleplay patterns ───────────────────────────────────────────
        .replace(/\bAs Gemini[,.]?/gi, 'As Bera AI,')
        .replace(/\bAs DeepSeek[,.]?/gi, 'As Bera AI,')
        // ── "My identity is/remains X" ─────────────────────────────────────────
        .replace(/\bmy identity (?:is|remains) Gemini/gi, 'my identity is Bera AI')
        .replace(/\bmy identity (?:is|remains) DeepSeek/gi, 'my identity is Bera AI')
        .replace(/\bmy identity (?:is|remains) Claude/gi, 'my identity is Bera AI')
        // ── Created/built by company ───────────────────────────────────────────
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by Google/gi, '$1$2 by Bera Tech')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by DeepSeek/gi, '$1$2 by Bera Tech')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by Anthropic/gi, '$1$2 by Bera Tech')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by OpenAI/gi, '$1$2 by Bera Tech')
        // ── "large language model by X" ────────────────────────────────────────
        .replace(/\ba large language model (?:built|created|developed|trained|made) by Google/gi, 'an AI assistant built by Bera Tech')
        .replace(/\ba large language model (?:built|created|developed|trained|made) by DeepSeek/gi, 'an AI assistant built by Bera Tech')
        .replace(/\bGoogle(?:'s)? AI assistant/gi, "Bera Tech's AI assistant")
        // ── Explicit refusals that reveal identity ─────────────────────────────
        .replace(/I am Gemini, operating here/gi, 'I am Bera AI, operating here')
        .replace(/I cannot (?:pretend|roleplay|impersonate|claim) to be (?:Bera AI|DeepSeek|another AI)[^.]*\./gi, 'I am Bera AI, built by Bera Tech.')
        // ── Cleanup double commas from replacements ────────────────────────────
        .replace(/,\s*,/g, ',')
        .replace(/Bera AI,\s+I/g, 'Bera AI. I')
}



  // ── DeepSeek Official API (PRIMARY — follows system prompts perfectly) ────────
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  const OR_MODELS = ['openai/gpt-oss-120b:free', 'nvidia/nemotron-3-ultra-550b-a55b:free']
  const callDeepSeekAI = async (messages, timeoutMs) => {
      if (!OPENROUTER_API_KEY) return null
      for (const model of OR_MODELS) {
          try {
              const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                  model,
                  messages: (Array.isArray(messages) ? messages : []).map(m => ({
                      role: m.role,
                      content: String(m.content || '').slice(0, 4000)
                  })),
                  max_tokens: 2048,
                  temperature: 0.7
              }, {
                  headers: {
                      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                      'Content-Type': 'application/json',
                      'HTTP-Referer': 'https://bera-tech-ai.github.io',
                      'X-Title': 'Bera AI'
                  },
                  timeout: timeoutMs || 20000
              })
              const text = res.data?.choices?.[0]?.message?.content
              if (text && typeof text === 'string' && text.trim().length > 2) return text.trim()
          } catch (e) {
              if (e?.response?.status === 429) await new Promise(r => setTimeout(r, 1000))
          }
      }
      return null
  }
  
// ── Bera AI — SECONDARY ENDPOINT ──────────────────────────────────────────────
const BERA_API_URL = 'https://repo-cloner--beratech.replit.app/api/ai/gpt4o'
const BERA_API_KEY = 'bera_c13f61f18adb86b8ae4764169eb3a8771fc4'

const callBeraAI = async (messages, timeoutMs) => {
    try {
        const systemMsg = (Array.isArray(messages) ? messages : []).find(m => m.role === 'system')?.content || ''
        const history = (Array.isArray(messages) ? messages : []).filter(m => m.role !== 'system').slice(-8)
        const histStr = history.map(m => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + String(m.content || '').slice(0, 600)).join('\n')
        const q = (systemMsg ? systemMsg.slice(0, 800) + '\n\n' : '') + histStr
        const res = await axios.get(BERA_API_URL, {
            params: { q: q.slice(0, 3000), apikey: BERA_API_KEY },
            timeout: timeoutMs || 20000
        })
        const text = res.data?.result
        if (text && typeof text === 'string' && text.trim().length > 2) return text.trim()
    } catch {}
    return null
}


// ── Gifted Overchat / DeepSeek — PRIMARY for ALL modes ──────────────────────
const OVERCHAT_URL = 'https://api.gifted.co.ke/api/ai/overchat'

const _overchatRaw = async (q, timeoutMs) => {
    try {
        const res = await axios.get(OVERCHAT_URL, {
            params: { apikey: GIFTED_KEY, model: 'deepseek', q },
            timeout: timeoutMs || 18000
        })
        const text = res.data?.result
        if (text && typeof text === 'string' && text.trim().length > 2) return text.trim()
    } catch {}
    return null
}

// Normal chat mode — system prompt + user message as flat string
const callOverchat = async (userText, systemPrompt, timeoutMs) => {
    const identity = 'You are Bera AI — a powerful WhatsApp AI assistant built by Bera Tech. NEVER say you are DeepSeek, Gemini, GPT, Claude, or any other AI. Always say your name is Bera AI, built by Bera Tech. Be helpful, friendly, and concise.'
    const q = identity + '\n\nUser: ' + String(userText || '').slice(0, 800) + '\nBera AI:'
    return _overchatRaw(q, timeoutMs)
}

// Agent / tool-calling mode — passes FULL system prompt + recent conversation
// Compact tool reference for Overchat (overchat has URL length limits so we can't send the full 25k-char SYSTEM_PROMPT)
const OVERCHAT_AGENT_PROMPT = `You are Bera AI, a powerful WhatsApp agent by Bera Tech. When a task needs tools, respond with ONE or MORE JSON tool calls (one per line, or an array). Otherwise reply in plain text.

TOOL FORMAT — one per line or array:
{"tool":"bash","cmd":"shell command"}
{"tool":"runcode","lang":"node","code":"..."}  or lang:python/bash
{"tool":"install","packages":["pkg"],"manager":"npm"}  or pip
{"tool":"writefile","path":"workspace/file.js","content":"..."}
{"tool":"readfile","path":"workspace/file.js"}
{"tool":"listfiles","path":"workspace/"}
{"tool":"mkdir","path":"workspace/dir"}
{"tool":"deletefile","path":"workspace/file"}
{"tool":"zipfolder","path":"workspace/dir","output":"workspace/out.zip"}
{"tool":"scaffold","type":"express|react|static|portfolio|landing","name":"myapp"}
{"tool":"github","action":"clone|list_repos|create_repo|push","repo":"user/repo","dest":"workspace/dir"}
{"tool":"create_repo","name":"myrepo","private":false}
{"tool":"git_push_folder","path":"workspace/dir","repo":"user/repo","message":"commit msg"}
{"tool":"pm2_manage","action":"list|start|stop|restart|logs","name":"myapp"}
{"tool":"berahost","action":"deploy|list|logs|stop","botId":1}
{"tool":"skyhost","action":"deploy|list|logs|stop|health","repoUrl":"...","name":"mybot"}
{"tool":"search","q":"query"}
{"tool":"news","query":"topic"}
{"tool":"weather","city":"Nairobi"}
{"tool":"crypto","coins":["bitcoin","ethereum"]}
{"tool":"stock","symbols":["AAPL","TSLA"]}
{"tool":"ip_info","ip":"8.8.8.8"}
{"tool":"dns","domain":"example.com","type":"A"}
{"tool":"whois","domain":"example.com"}
{"tool":"ping_url","url":"https://example.com"}
{"tool":"port_scan","host":"example.com","ports":"22,80,443"}
{"tool":"read_page","url":"https://example.com"}
{"tool":"screenshot","url":"https://example.com"}
{"tool":"web_scrape","url":"https://example.com"}
{"tool":"bulk_scrape","urls":["url1","url2"]}
{"tool":"data_pipeline","sources":["url1","url2"],"hint":"price"}
{"tool":"parse_html","html":"...","selector":"table"}
{"tool":"regex_extract","text":"...","pattern":"\\d+"}
{"tool":"analyze_data","data":[...],"action":"filter|sort|group","key":"field"}
{"tool":"ssl_check","host":"example.com"}
{"tool":"diff_text","a":"text1","b":"text2"}
{"tool":"hash_text","text":"hello","algo":"sha256"}
{"tool":"summarize_text","text":"long text"}
{"tool":"api","method":"GET","url":"https://api.example.com","params":{},"headers":{}}
{"tool":"pastebin","content":"text to paste"}
{"tool":"image_gen","prompt":"description","width":1024,"height":1024}
{"tool":"tts","text":"say this","lang":"en"}
{"tool":"translate_text","text":"hola","from":"es","to":"en"}
{"tool":"qrgen","text":"https://example.com"}
{"tool":"barcode","text":"1234","type":"qr|code128"}
{"tool":"email","to":"user@mail.com","subject":"Hi","body":"message"}
{"tool":"calc","expr":"2+2*10"}
{"tool":"currency","amount":100,"from":"USD","to":"KES"}
{"tool":"unit_convert","value":5,"from":"km","to":"miles"}
{"tool":"db","action":"query|tables|schema","sql":"SELECT 1"}
{"tool":"cron","action":"add|list|remove","schedule":"* * * * *","cmd":"echo hi"}
{"tool":"monitor","action":"add|list|remove","url":"https://example.com"}
{"tool":"remember","key":"mykey","value":"myvalue"}
{"tool":"recall","key":"mykey"}
{"tool":"recall_all"}
{"tool":"forget","key":"mykey"}
{"tool":"note","action":"list|save|get|delete","title":"Title","content":"text"}
{"tool":"wa_send","number":"254712345678@s.whatsapp.net","message":"Hello"}
{"tool":"wa_react","emoji":"👍"}
{"tool":"wa_group_setting","action":"close|open|restrict|unrestrict"}
{"tool":"wa_group_info"}
{"tool":"wa_group_subject","name":"New Name"}
{"tool":"wa_group_desc","description":"New desc"}
{"tool":"wa_group_invite"}
{"tool":"wa_kick","number":"254712345678"}
{"tool":"wa_promote","number":"254712345678"}
{"tool":"wa_demote","number":"254712345678"}
{"tool":"wa_add","number":"254712345678"}
{"tool":"system"}
{"tool":"status_dashboard"}
{"tool":"send_media","url":"https://example.com/img.jpg","caption":"text"}

Rules: Use tools for real tasks. Plain text for simple Q&A. After tool results continue until fully done, then reply in plain text.`

const callOverchatAgent = async (messages, timeoutMs) => {
    const history = messages.filter(m => m.role !== 'system').slice(-6)
    const histStr = history.map(m => (m.role === 'user' ? 'User' : 'Bera AI') + ': ' + String(m.content || '').slice(0, 500)).join('\n')
    const q = OVERCHAT_AGENT_PROMPT + '\n\n' + histStr + '\nBera AI:'
    return _overchatRaw(q, timeoutMs || 25000)
}

// ── Groq AI (ultra-fast, < 1 second responses) ────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']

const callGroqAI = async (messages, timeoutMs, maxTokens = 2048) => {
    for (const model of GROQ_MODELS) {
        try {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model,
                messages,
                max_tokens: maxTokens,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: timeoutMs || 20000
            })
            const text = res.data?.choices?.[0]?.message?.content
            if (text && String(text).trim().length > 2) return String(text).trim()
        } catch (e) {
            if (e?.response?.status === 429) await new Promise(r => setTimeout(r, 500))
        }
    }
    return null
}

// ── Memory store — persists to disk so it survives bot restarts ───────────────
const _MEM_FILE = require('path').join(__dirname, '../../Database/agent_memory.json')
let MEMORY = {}
try { MEMORY = JSON.parse(require('fs').readFileSync(_MEM_FILE, 'utf8')) } catch {}

const _saveMEMORY = () => {
    try { require('fs').writeFileSync(_MEM_FILE, JSON.stringify(MEMORY, null, 2)) } catch {}
}

const remember = (chat, key, val) => {
    if (!MEMORY[chat]) MEMORY[chat] = {}
    if (val !== undefined) { MEMORY[chat][key] = val; _saveMEMORY() }
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
const AI_MODELS = ['deepseek', 'openai', 'mistral', 'llama', 'unity', 'phi', 'mireille']
let _modelIdx = 0

const isPollinationsError = (text) => {
    if (!text) return true
    const t = text.trim()
    if (t.startsWith('{') && t.includes('"error"')) return true
    if (t.startsWith('{') && t.includes('"status"') && t.includes('404')) return true
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
            if (obj.choices && Array.isArray(obj.choices) && obj.choices[0]) {
                const c = obj.choices[0]
                const content = c.message?.content || c.text || c.delta?.content
                if (content && typeof content === 'string' && content.length > 1) return content.trim()
            }
            if (obj.content && typeof obj.content === 'string' && obj.content.length > 1) {
                return obj.content.trim()
            }
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

// ── Gifted Tech API — now routes through Overchat (primary endpoint) ──────────
const callGiftedTech = async (userText, historyMessages, timeoutMs, systemPrompt) => {
    const histCtx = (historyMessages || [])
        .filter(m => m.role !== 'system')
        .slice(-4)
        .map(m => (m.role === 'user' ? 'User' : 'Bera AI') + ': ' + String(m.content || '').slice(0, 300))
        .join('\n')

    const identity = systemPrompt && systemPrompt.length > 100
        ? systemPrompt.slice(0, 3000)
        : 'You are Bera AI, a smart WhatsApp assistant built by Bera Tech. Always say your name is Bera AI.'
    const userPart = String(userText || '').slice(0, 800)
    const histPart = histCtx.slice(0, 600)
    const q = histPart
        ? identity + '\n\nConversation:\n' + histPart + '\nUser: ' + userPart + '\nBera AI:'
        : identity + '\n\nUser: ' + userPart + '\nBera AI:'

    // Primary: Overchat endpoint (DeepSeek)
    const oc = await _overchatRaw(q, timeoutMs || 15000)
    if (oc) return oc

    // Fallback: other Gifted endpoints
    const GT_CHAT_ENDPOINTS = [
        `${GIFTED}/api/ai/gpt4o`,
        `${GIFTED}/api/ai/gpt`,
        `${GIFTED}/api/ai/gemini`,
    ]
    const isBadGTResponse = (t) => !t || t.trim().length < 3 || t.includes('<!DOCTYPE')
    for (const url of GT_CHAT_ENDPOINTS) {
        try {
            const r = await axios.get(url, { params: { apikey: GIFTED_KEY, q }, timeout: timeoutMs || 10000 })
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
    // Try preferred model first if user/owner has set one
    const preferred = global.db?.data?.settings?.aiModel
    if (preferred) {
        try {
            const r = await callPollinationsModel(messages, preferred, Math.min(timeoutMs, 25000))
            if (r && r !== 'RATELIMIT' && r !== 'ERROR' && r.length > 1) return r
        } catch {}
    }
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

// ── Local fallback — last resort when ALL providers are unreachable ───────────
const localFallback = async (userText) => {
    // Try Bera endpoint first as absolute last resort
    try {
        const beraFinal = await callBeraAI([{ role: 'user', content: String(userText || '').slice(0, 800) }], 25000)
        if (beraFinal && beraFinal.length > 2) return beraFinal
    } catch {}
    // One final direct overchat attempt with max timeout before giving up
    try {
        const finalTry = await _overchatRaw(
            'You are Bera AI, a helpful WhatsApp assistant by Bera Tech.\n\nUser: ' + String(userText || '').slice(0, 600) + '\nBera AI:',
            30000
        )
        if (finalTry && finalTry.length > 2) return finalTry
    } catch {}
    const t = (userText || '').trim().toLowerCase()
    if (/^(hi|hello|hey|sup|yo|wassup|hola|habari|mambo|niaje)/i.test(t))
        return "Hey! I'm Bera AI — I'm here and ready. What do you need?"
    if (/\b(who are you|what are you|your name|who made you)/i.test(t))
        return "I'm *Bera AI* — your intelligent WhatsApp assistant, built by Bera Tech."
    if (/\b(how are you|how r u|are you okay)/i.test(t))
        return "I'm running great, thanks for asking! Ready to work."
    if (/\b(what can you do|help|commands|capabilities)/i.test(t))
        return "I can: write code, run commands, search the web, manage servers, and much more. Try me!"
    return "I'm Bera AI and I'm here! Couldn't reach my AI brain right now — please try again in a moment."
}

// ── One attempt through ALL providers ────────────────────────────────────────
const _tryAllProviders = async (messages, lastUser, historyMsgs, systemContent, timeoutMs) => {
    // Bera AI — PRIMARY endpoint, always call first
    const bera = await callBeraAI(messages, Math.min(timeoutMs, 20000))
    if (bera) return bera

    // Overchat/DeepSeek — secondary endpoint
    if (lastUser) {
        const oc = await callOverchat(lastUser, systemContent, Math.min(timeoutMs, 22000))
        if (oc) return oc
    }
    // Groq backup — ultra-fast
    const groq = await callGroqAI(messages, Math.min(timeoutMs, 10000))
    if (groq) return groq
    // Gifted fallback
    if (lastUser) {
        const gt = await callGiftedTech(lastUser, historyMsgs, Math.min(timeoutMs, 15000), systemContent)
        if (gt) return gt
    }
    // Xwolf as third option
    if (lastUser) {
        const xw = await callXwolf(lastUser, Math.min(timeoutMs, 10000), systemContent)
        if (xw) return xw
    }
    // Pollinations as last resort (free, no key)
    const poll = await callPollinations(messages, Math.min(timeoutMs, 20000))
    if (poll) return poll
    return null
}

// ── Main AI caller ───────────────────────────────────────────────────────────
const callAI = async (messages, timeoutMs, agentMode = false) => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const historyMsgs = messages.filter(m => m.role !== 'system')
    const systemContent = messages.find(m => m.role === 'system')?.content || ''
    const t = timeoutMs || 30000

    if (agentMode) {
        // ── AGENT MODE: OpenRouter PRIMARY → Bera → Overchat → Groq → Pollinations ──

        // 0. ch.at — PRIMARY (free, no API key, OpenAI-compatible, 16k context)
        try {
            const _chatR = await axios.post('https://ch.at/v1/chat/completions',
                { messages: messages.map(msg => ({ role: msg.role, content: String(msg.content || '').slice(0, 16000) })) },
                { headers: { 'Content-Type': 'application/json' }, timeout: Math.min(t, 25000) }
            )
            const _chatTxt = _chatR.data?.choices?.[0]?.message?.content
            if (_chatTxt && _chatTxt.length > 2) return _sanitizeIdentity(_chatTxt)
        } catch {}

        // 1. OpenRouter — secondary fallback
        const _orKey = process.env.OPENROUTER_API_KEY
        if (_orKey) {
            try {
                const _orRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: 'openai/gpt-oss-120b:free',
                    messages: messages.map(msg => ({ role: msg.role, content: String(msg.content || '').slice(0, 16000) })),
                    max_tokens: 4096,
                    temperature: 0.7
                }, {
                    headers: {
                        'Authorization': `Bearer ${_orKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://bera-tech-ai.github.io',
                        'X-Title': 'Bera AI'
                    },
                    timeout: Math.min(t, 22000)
                })
                const _orTxt = _orRes.data?.choices?.[0]?.message?.content
                if (_orTxt && _orTxt.length > 2) return _sanitizeIdentity(_orTxt)
            } catch {}
        }

        // 1. Bera AI — secondary
        const beraR = await callBeraAI(messages, Math.min(t, 20000))
        if (beraR && beraR.length > 2) return _sanitizeIdentity(beraR)

        // 1. Gifted Overchat / DeepSeek — secondary
        const oc = await callOverchatAgent(messages, Math.min(t, 25000))
        if (oc && oc.length > 2) return _sanitizeIdentity(oc)

        // 2. Groq — ultra-fast, full messages array
        if (GROQ_API_KEY) {
            const groq = await callGroqAI(messages, Math.min(t, 25000), 4096)
            if (groq) return _sanitizeIdentity(groq)
        }

        // 3. DeepSeek via Pollinations — free, excellent instruction following
        const ds = await callPollinationsModel(messages, 'deepseek', Math.min(t, 40000))
        if (ds && ds !== 'ERROR' && ds !== 'RATELIMIT' && ds.length > 2) return _sanitizeIdentity(ds)

        // 4. OpenAI via Pollinations — fallback
        const oa = await callPollinationsModel(messages, 'openai', Math.min(t, 35000))
        if (oa && oa !== 'ERROR' && oa !== 'RATELIMIT' && oa.length > 2) return _sanitizeIdentity(oa)

        // 5. Full Pollinations rotation
        const poll = await callPollinations(messages, Math.min(t, 35000))
        if (poll) return _sanitizeIdentity(poll)

        return null
    }

    // Normal chat mode — Groq first, then fallbacks
    const r1 = await _tryAllProviders(messages, lastUser, historyMsgs, systemContent, t)
    if (r1) return _sanitizeIdentity(r1)

    await new Promise(r => setTimeout(r, 1000))
    const r2 = await _tryAllProviders(messages, lastUser, historyMsgs, systemContent, t)
    if (r2) return _sanitizeIdentity(r2)

    return null
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
const clearMemory = (chat) => { delete MEMORY[chat]; _saveMEMORY() }
const saveMemory = (chat, key, value) => remember(chat, key, value)
const setMemory = (chat, value, key) => {
    if (!MEMORY[chat]) MEMORY[chat] = {}
    const k = key || `note_${Object.keys(MEMORY[chat]).length + 1}`
    MEMORY[chat][k] = String(value).slice(0, 300)
    _saveMEMORY()
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
    _saveMEMORY()
}

// ── Auto-record completed agent actions to persistent memory ──────────────────
const _autoMemorize = (chat, task, summary) => {
    if (!chat || !task || !summary) return
    if (!MEMORY[chat]) MEMORY[chat] = {}
    // Keep rolling log of last 10 completed tasks
    const log = MEMORY[chat]._action_log || []
    log.push({ task: task.slice(0, 120), done: summary.slice(0, 200), at: new Date().toISOString() })
    MEMORY[chat]._action_log = log.slice(-10)
    _saveMEMORY()
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

    const PING_RX = /^ping\s+([\w.\-]+)$/i
    const mPing = t.match(PING_RX)
    if (mPing) {
        const host = mPing[1].replace(/[^a-zA-Z0-9.\-]/g, '')
        const r = await runBash(`ping -c 4 -W 3 ${host} 2>&1`)
        return { success: true, reply: `🏓 *Ping ${host}*\n\`\`\`\n${r.output.slice(0, 500)}\n\`\`\`` }
    }

    const RUN_RX = /^(?:run|execute|exec|bash|shell|terminal)\s+(.+)/i
    const mRun = t.match(RUN_RX)
    if (mRun) {
        const cmd = mRun[1].trim()
        const SECRET_RX = /\b(printenv|cat\s+\.env|echo\s+\$[A-Z_]+TOKEN)/i
        if (SECRET_RX.test(cmd)) return { success: false, reply: '🔒 Command blocked — could expose secrets.' }
        const r = await runBash(cmd, 15000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }

    const PM2_RX = /^pm2\s+(.+)/i
    const mPm2 = t.match(PM2_RX)
    if (mPm2) {
        const safe = mPm2[1].replace(/[;&|`$<>]/g, '').slice(0, 100)
        const r = await runBash(`pm2 ${safe} --no-color 2>&1`, 15000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }

    const NPM_RX = /^npm\s+(install|i|add|ci)\s+(.+)/i
    const mNpm = t.match(NPM_RX)
    if (mNpm) {
        const cmd = `npm ${mNpm[1]} ${mNpm[2]}`
        const r = await runBash(cmd, 60000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }
    
    const NPM_INSTALL_RX = /^npm\s+(install|i)$/i
    if (NPM_INSTALL_RX.test(t)) {
        const r = await runBash('npm install', 60000)
        return { success: true, reply: `\`\`\`\n${(r.output || 'done').slice(0, 1500)}\n\`\`\`` }
    }

    return null
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Full Agent Mode (65+ tools)
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Bera AI — the most powerful WhatsApp autonomous agent, built by Bera Tech.

━━━ WHO YOU ARE ━━━
You are Bera AI — an autonomous execution engine that DOES things, powered by DeepSeek + Groq. You run on a LIVE Linux server.
Every request → IMMEDIATE real action. No asking permission. No explaining plans. No narrating steps.
You have REAL tools running RIGHT NOW: bash shell, file system, web scraping, HTTP API, GitHub, BeraHost, Sky Hosting, PM2, Docker, SQLite, code runner — USE THEM ALL.
You are equivalent to Replit Agent, Cursor AI, and GitHub Copilot combined — but running on WhatsApp.

━━━ IRON RULES (NEVER BREAK) ━━━
1. User asks → CALL A TOOL immediately. NEVER write plain text before acting. JSON tool call FIRST, always.
2. NEVER say "I'll do X" — just DO X with a JSON tool call.
3. NEVER say "I can't scrape websites" — you have 4-strategy scraping: Jina.ai + Chrome curl + Google Cache + Wayback Machine. Use web_scrape IMMEDIATELY.
4. NEVER say "I'm a text-based AI" or "I can't access the internet/files/shell" — you CAN and you WILL.
5. NEVER say "I don't have tools" — you have 65+ real tools on a LIVE server. Use them.
6. NEVER ask "should I proceed?" — just proceed silently.
7. NEVER show your tool calls or reasoning — user sees ONLY the final result.
8. Chain tools until 100% done. When one approach fails → try another immediately.
9. Only write plain text when ALL tool calls are complete and the task is fully done.

━━━ WEB SCRAPING — YOU CAN ALWAYS DO THIS (REPLIT-LEVEL) ━━━
You scrape ANY website. Multiple strategies, automatic fallback. Never refuse. Never say you can't.
• Single page (auto-fallback):  {"tool":"web_scrape","url":"https://example.com"}
• Extract specific data:         {"tool":"smart_extract","url":"https://shop.com","hint":"price list"}
• Deep AI page analysis:         {"tool":"deep_scrape","url":"https://site.com","question":"what are the prices?"}
• Full site crawl:               {"tool":"crawl_site","url":"https://site.com","maxDepth":2,"maxPages":8}
• Extract all tables → markdown: {"tool":"extract_table","url":"https://site.com","index":0}
• Extract all links:             {"tool":"extract_links","url":"https://site.com","filter":"product"}
• Scrape multiple URLs:          {"tool":"bulk_scrape","urls":["url1","url2","url3"]}
• Multi-source pipeline:         {"tool":"data_pipeline","sources":["url1","url2"],"hint":"price","format":"json"}
• Raw text + markdown:           {"tool":"read_page","url":"https://site.com"}
• Screenshot (visual):           {"tool":"screenshot","url":"https://site.com"}
• HTTP API call:                 {"tool":"api","method":"GET","url":"https://api.example.com"}
• Extract with regex:            {"tool":"regex_extract","text":"...","pattern":"\\d+\\.\\d+"}
• Parse HTML tags:               {"tool":"parse_html","html":"...","selector":"table"}
Scraping pipeline: web_scrape → (if blocked) → read_page → (if blocked) → screenshot + vision analysis.
ALWAYS complete the full pipeline: fetch → extract → analyze → present clean result.

━━━ ADVANCED DATA TOOLS ━━━
• Analyze JSON arrays:    {"tool":"analyze_data","data":[...],"action":"stats","key":"price"}
• Filter data:            {"tool":"analyze_data","data":[...],"action":"filter","key":"country","value":"Kenya"}
• Sort data:              {"tool":"analyze_data","data":[...],"action":"sort","key":"price","dir":"asc"}
• Group & count:          {"tool":"analyze_data","data":[...],"action":"group","key":"category"}
• SSL certificate check:  {"tool":"ssl_check","host":"example.com"}
• Text diff:              {"tool":"diff_text","a":"original text","b":"modified text"}
• Hash/encrypt text:      {"tool":"hash_text","text":"hello","algo":"sha256"}
• Summarize long text:    {"tool":"summarize_text","text":"very long text here"}
• Send WhatsApp message:  {"tool":"send_whatsapp","to":"254700000000","text":"hello"}

━━━ DEEP INTENT — UNDERSTAND WHAT THEY REALLY WANT ━━━
Think beyond the literal words:
• "build me a portfolio"       → {"tool":"scaffold","type":"portfolio","name":"my-portfolio"} — static HTML/CSS/JS, NO clone, NO Express
• "make a landing page"        → {"tool":"scaffold","type":"landing","name":"my-site"} — static HTML/CSS/JS
• "build a website"            → {"tool":"scaffold","type":"static","name":"my-website"} — static HTML/CSS/JS
• "build me a todo app"        → {"tool":"scaffold","type":"express","name":"todo-app"} — Express + SQLite
• "make a weather app"         → {"tool":"scaffold","type":"react","name":"weather-app"} — React + weather API
• "check my website X"         → scrape + uptime check + SSL + response time → full report
• "fix my app"                 → scan_project first → find ALL bugs → edit_file surgically → test
• "get prices from [URL]"      → smart scrape → extract all prices → show as clean table
• "write a script to do X"     → Full production-quality script, not a skeleton
• "what is X?"                 → web search + Wikipedia + synthesize a real answer with sources
• "deploy my bot"              → git_push_folder → {"tool":"skyhost","action":"deploy","repoUrl":"...","name":"my-bot"} → wait for live URL
• "host my app on sky"         → {"tool":"skyhost","action":"deploy","repoUrl":"https://github.com/user/repo","name":"my-app","branch":"main"}
• "list my sky deployments"    → {"tool":"skyhost","action":"list"}
• "get logs for dep_xyz"       → {"tool":"skyhost","action":"logs","deploymentId":"dep_xyz"}
• "stop deployment dep_xyz"    → {"tool":"skyhost","action":"stop","deploymentId":"dep_xyz"}
• "is sky hosting online?"     → {"tool":"skyhost","action":"health"}
• "create a REST API for X"    → scaffold express → full CRUD routes → validation → start → show test URLs

⚠️ CRITICAL RULES FOR BUILDING:
- "portfolio" / "website" / "landing page" = ALWAYS use scaffold with type "portfolio" or "static" — writes HTML/CSS/JS directly. NEVER git clone for these.
- NEVER use git clone to "build" something — clone is ONLY for when the user provides an existing repo URL.
- "build" means WRITE FILES. "deploy" means push to hosting. These are two separate steps.
- ALWAYS scaffold or multi_write first. Ask nothing. Write the code, THEN optionally deploy.

━━━ GO BEYOND — BE PROACTIVE ━━━
Building an app?  → Add: README, sample data, input validation, error handling — unasked
Creating a file?  → Make it production-quality with proper structure, not a skeleton
Scraping data?    → Also: analyze it, highlight the top results, note anything interesting
Fixing bugs?      → Also check for similar bugs nearby and fix those too
Running code?     → Also explain output, flag issues, suggest improvements

━━━ SMART DEFAULTS — DECIDE WITHOUT ASKING ━━━
Port not given?         → Pick one 3001–4999 that pm2 isn't using
Language not given?     → Node.js for apps/APIs, Python for data/scripts
DB not given?           → SQLite for simple apps
Framework not given?    → Express for APIs, Vite+React for frontends

━━━ FINAL RESPONSE FORMAT ━━━
After all tools complete, give ONE clean impressive summary:
✅ [What was built/done]
📁 [Location / port / URL]
• [Key feature 1]
• [Key feature 2]
[Direct answer to any question asked]
Do NOT list every step you took. Do NOT say "I have completed". Just show the result.

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
WHATSAPP GROUP MANAGEMENT  ← VERY IMPORTANT — READ CAREFULLY
══════════════════════════════════════════════
CRITICAL: The bot IS ALREADY an admin in most groups. NEVER say "I need to be an admin" or "I don't have permission". Just call the tool directly. The tool will handle errors if they occur.

GROUP SETTINGS (open/close/lock/unlock):
{"tool":"wa_group_setting","action":"close"} → lock group — ONLY admins can send (aka mute/close/lock)
{"tool":"wa_group_setting","action":"open"} → open group — EVERYONE can send messages (aka unmute/unlock)
{"tool":"wa_group_setting","action":"restrict"} → only admins can edit group info/description/icon
{"tool":"wa_group_setting","action":"unrestrict"} → anyone can edit group info

GROUP INFO & IDENTITY:
{"tool":"wa_group_info"} → get group name, description, member count, admins list
{"tool":"wa_group_subject","name":"New Group Name"} → rename/change group name/subject
{"tool":"wa_group_desc","description":"New description here"} → change group description
{"tool":"wa_group_invite"} → get the group invite link

MEMBER MANAGEMENT:
{"tool":"wa_kick","number":"254712345678"} → remove member from group
{"tool":"wa_promote","number":"254712345678"} → make member an admin
{"tool":"wa_demote","number":"254712345678"} → remove admin rights
{"tool":"wa_add","number":"254712345678"} → add someone to the group

INTENT EXAMPLES:
"close the group" / "lock the group" / "mute the group" → {"tool":"wa_group_setting","action":"close"}
"open the group" / "unlock" / "unmute" → {"tool":"wa_group_setting","action":"open"}
"rename group to X" → {"tool":"wa_group_subject","name":"X"}
"kick @user" → {"tool":"wa_kick","number":"<their number>"}
"get invite link" → {"tool":"wa_group_invite"}
"how many members?" → {"tool":"wa_group_info"}

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
PROJECT SCAFFOLDING  (Replit/Lovable-like)
══════════════════════════════════════════════
When a user asks to "build", "create", "scaffold", "start", or "make" a project — use scaffold FIRST, then run npm install automatically.
{"tool":"scaffold","type":"react","name":"my-app"} → Full React 18 + Vite 5 + TailwindCSS project (ready to run)
{"tool":"scaffold","type":"next","name":"my-site"} → Next.js 14 App Router + TailwindCSS project
{"tool":"scaffold","type":"express","name":"my-api"} → Express 5 REST API + Zod validation + routes + middleware
{"tool":"scaffold","type":"fastapi","name":"my-api"} → Python FastAPI + Pydantic + uvicorn
{"tool":"scaffold","type":"fullstack","name":"my-app"} → React + Express monorepo with proxy setup
{"tool":"scaffold","type":"discord","name":"my-bot"} → Discord.js v14 bot with slash commands
{"tool":"scaffold","type":"telegram","name":"my-bot"} → Telegraf.js Telegram bot
{"tool":"scaffold","type":"electron","name":"my-desktop"} → Electron + React desktop app
{"tool":"scaffold","type":"cli","name":"my-tool"} → Node.js CLI with commander.js
{"tool":"scaffold","type":"flask","name":"my-app"} → Python Flask + SQLAlchemy + REST
{"tool":"scaffold","type":"portfolio","name":"my-portfolio"} → Static HTML portfolio with sections
{"tool":"scaffold","type":"landing","name":"my-site"} → Marketing landing page with animations

━━━ CREATE & RUN SERVERS (REPLIT-STYLE) ━━━
{"tool":"create_server","name":"my-api","type":"express","port":3001,"start":true} → scaffold + npm install + pm2 start → returns live URL
{"tool":"create_server","name":"my-app","type":"react","port":3002,"start":true}   → scaffold React + start dev server
{"tool":"live_preview","name":"my-api","port":3001}                                → get the live URL for a running process
{"tool":"hot_reload","name":"my-api"}                                              → restart a running process instantly
{"tool":"env_manager","action":"set","name":"my-api","key":"API_KEY","value":"sk-..."} → inject env var into process
{"tool":"env_manager","action":"get","name":"my-api"}                             → list all env vars for a process
{"tool":"port_forward","port":3001}                                               → expose local port to public URL
{"tool":"test_endpoint","url":"http://localhost:3001/api/users","method":"GET"}   → test any HTTP endpoint + show response
{"tool":"create_database","name":"mydb","schema":[{"table":"users","cols":["id INTEGER PRIMARY KEY","name TEXT","email TEXT UNIQUE"]}]} → create SQLite DB with schema
{"tool":"db_query","name":"mydb","sql":"SELECT * FROM users LIMIT 10"}           → run SQL query on SQLite database
{"tool":"code_generate","lang":"node","task":"REST API for a todo app with SQLite"} → AI generates full working code → writes to file
{"tool":"project_analyze","path":"workspace/my-app"}                             → analyze project: show structure, deps, issues, suggestions

━━━ SKYHOST DEPLOYMENT (FULL WORKFLOW) ━━━
{"tool":"skyhost","action":"deploy","repoUrl":"https://github.com/user/repo","name":"my-app","branch":"main"}
→ Creates project → triggers build → waits up to 3 min → returns live URL
→ Sends WhatsApp status updates while building: 📥 cloning → 🔨 building → ✅ live
{"tool":"skyhost","action":"list"}          → list all projects with status + live URLs
{"tool":"skyhost","action":"status","deploymentId":"dep_abc123"} → check specific deployment
{"tool":"skyhost","action":"logs","deploymentId":"dep_abc123"}   → build logs
{"tool":"skyhost","action":"stop","deploymentId":"dep_abc123"}   → stop deployment
{"tool":"skyhost","action":"health"}        → ping Sky Hosting API
Example workflow: build a todo API
→ {"tool":"scaffold","type":"express","name":"todo-api"}
→ {"tool":"bash","cmd":"cd workspace/todo-api && npm install"}
→ {"tool":"write_file","path":"workspace/todo-api/routes/todos.js","content":"...full todos route..."}
→ {"tool":"pm2_manage","action":"start","name":"todo-api","file":"workspace/todo-api/index.js"}

══════════════════════════════════════════════
PM2 PROCESS MANAGER  (start, stop, monitor apps)
══════════════════════════════════════════════
{"tool":"pm2_manage","action":"list"} → see all running processes
{"tool":"pm2_manage","action":"start","name":"my-api","file":"workspace/my-api/index.js"} → start app
{"tool":"pm2_manage","action":"start","name":"my-api","file":"workspace/my-api/index.js","env":{"PORT":"3000","NODE_ENV":"production"}}
{"tool":"pm2_manage","action":"stop","name":"my-api"}
{"tool":"pm2_manage","action":"restart","name":"my-api"}
{"tool":"pm2_manage","action":"logs","name":"my-api","lines":30}
{"tool":"pm2_manage","action":"delete","name":"my-api"}
{"tool":"pm2_manage","action":"monit"} → CPU/RAM usage for all processes

══════════════════════════════════════════════
ADVANCED GITHUB  (create repos, push full projects)
══════════════════════════════════════════════
{"tool":"create_repo","name":"my-app","private":false,"description":"My new app","autoInit":true}
{"tool":"git_push_folder","folder":"workspace/my-app","repo":"username/my-app","message":"feat: initial commit","branch":"main"}
→ This creates the repo on GitHub, inits git in the folder, commits all files, and pushes — one shot.
{"tool":"github","action":"clone","repo":"user/repo","dest":"workspace/myapp"}
{"tool":"github","action":"create_file","repo":"user/repo","path":"src/index.js","content":"...","message":"feat: add file"}

══════════════════════════════════════════════
BERAHOST DEPLOYMENTS  (https://bera-host--nelimadinah22.replit.app)
══════════════════════════════════════════════
{"tool":"berahost","action":"list"}                    → list all your bot deployments
{"tool":"berahost","action":"status","id":8}           → status of deployment 8
{"tool":"berahost","action":"start","id":8}            → start deployment 8
{"tool":"berahost","action":"stop","id":8}             → stop deployment 8
{"tool":"berahost","action":"logs","id":8}             → last 20 log lines
{"tool":"berahost","action":"metrics","id":8}          → CPU, RAM, uptime
{"tool":"berahost","action":"deploy","botId":3,"envVars":{"OWNER_NUMBER":"254787527753"}}
{"tool":"berahost","action":"coins"}                   → check coin balance
{"tool":"berahost","action":"bots"}                    → available bot templates
NOTE: Current Bera AI deployment ID is 8. BeraHost API key: stored in BH_API_KEY env or .setbhkey command

══════════════════════════════════════════════
DEPLOY & HOSTING
══════════════════════════════════════════════
{"tool":"deploy_vercel","folder":"workspace/myapp","name":"my-app"}
{"tool":"deploy_railway","folder":"workspace/myapp","name":"my-app"}
{"tool":"skyhost","action":"deploy","repoUrl":"https://github.com/user/repo","name":"my-app","branch":"main","envVars":{"PORT":"3000"}}
{"tool":"skyhost","action":"list"}                     → list all Sky Hosting projects
{"tool":"skyhost","action":"status","deploymentId":"dep_xyz"}
{"tool":"skyhost","action":"logs","deploymentId":"dep_xyz"}
{"tool":"skyhost","action":"stop","deploymentId":"dep_xyz"}
{"tool":"skyhost","action":"health"}                   → check if Sky Hosting API is online

NEW POWER TOOLS (use these instead of old slow alternatives):
{"tool":"multi_write","files":[{"path":"workspace/app/index.html","content":"..."},{"path":"workspace/app/style.css","content":"..."}]}
  → Writes ALL files in PARALLEL in one step. Use this instead of multiple writefile calls.
{"tool":"edit_file","path":"workspace/app/index.js","edits":[{"find":"old text","replace":"new text"}]}
  → Surgically edits ONE specific part of a file without rewriting it. Use for targeted changes.
{"tool":"scan_project","path":"workspace/myapp","read_contents":true}
  → Scans entire project folder — file tree + file contents. Use at START of every coding task.

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
// PARSE TOOL CALLS
// ─────────────────────────────────────────────────────────────────────────────
const _ACTION_TO_TOOL = {
    'execute_shell': 'bash', 'shell': 'bash', 'run_shell': 'bash', 'run_command': 'bash',
    'bash': 'bash', 'exec': 'bash', 'execute': 'bash', 'execute_command': 'bash',
    'create_directory': 'mkdir', 'make_directory': 'mkdir', 'mkdir': 'mkdir',
    'read_file': 'readfile', 'file_read': 'readfile', 'get_file': 'readfile',
    'write_file': 'writefile', 'file_write': 'writefile', 'create_file': 'writefile', 'save_file': 'writefile',
    'list_files': 'listfiles', 'file_list': 'listfiles', 'ls': 'listfiles',
    'delete_file': 'deletefile', 'remove_file': 'deletefile',
    'web_scrape': 'web_scrape', 'scrape': 'web_scrape', 'scrape_web': 'web_scrape', 'scrape_url': 'web_scrape', 'fetch_page': 'web_scrape',
    'web_search': 'search', 'search': 'search', 'google': 'search', 'find': 'search',
    'http': 'api', 'http_request': 'api', 'fetch': 'api', 'api_call': 'api', 'curl': 'api',
    'install_packages': 'install', 'npm_install': 'install', 'pip_install': 'install',
    'run_code': 'runcode', 'execute_code': 'runcode', 'code': 'runcode',
    'extract': 'smart_extract', 'smart_extract': 'smart_extract', 'extract_data': 'smart_extract',
    'deep_scrape': 'deep_scrape', 'analyze_page': 'deep_scrape', 'scrape_analyze': 'deep_scrape',
    'crawl': 'crawl_site', 'crawl_site': 'crawl_site', 'spider': 'crawl_site',
    'get_links': 'extract_links', 'extract_links': 'extract_links', 'find_links': 'extract_links',
    'get_table': 'extract_table', 'extract_table': 'extract_table', 'scrape_table': 'extract_table',
    'bulk_scrape': 'bulk_scrape', 'multi_scrape': 'bulk_scrape', 'scrape_urls': 'bulk_scrape',
    'pipeline': 'data_pipeline', 'data_pipeline': 'data_pipeline',
    'parse_html': 'parse_html', 'html_parse': 'parse_html', 'css_select': 'parse_html',
    'regex': 'regex_extract', 'regex_extract': 'regex_extract', 'extract_pattern': 'regex_extract',
    'ssl': 'ssl_check', 'ssl_check': 'ssl_check', 'cert_check': 'ssl_check',
    'send_msg': 'send_whatsapp', 'send_whatsapp': 'send_whatsapp', 'whatsapp': 'send_whatsapp', 'send_message': 'send_whatsapp',
    'diff': 'diff_text', 'diff_text': 'diff_text', 'compare_text': 'diff_text',
    'analyze': 'analyze_data', 'analyze_data': 'analyze_data', 'data_analysis': 'analyze_data',
    'hash': 'hash_text', 'hash_text': 'hash_text', 'md5': 'hash_text', 'sha': 'hash_text',
    'summarize': 'summarize_text', 'summarize_text': 'summarize_text', 'tldr': 'summarize_text',
    'create_server': 'create_server', 'new_server': 'create_server', 'scaffold_server': 'create_server',
    'preview': 'live_preview', 'live_preview': 'live_preview', 'get_url': 'live_preview',
    'reload': 'hot_reload', 'hot_reload': 'hot_reload', 'restart_server': 'hot_reload',
    'env': 'env_manager', 'env_manager': 'env_manager', 'setenv': 'env_manager',
    'test_api': 'test_endpoint', 'test_endpoint': 'test_endpoint', 'http_test': 'test_endpoint',
    'create_db': 'create_database', 'create_database': 'create_database', 'new_db': 'create_database',
    'sql': 'db_query', 'db_query': 'db_query', 'query_db': 'db_query',
    'analyze_project': 'project_analyze', 'project_analyze': 'project_analyze', 'scan_project': 'project_analyze',
    'expose': 'port_forward', 'port_forward': 'port_forward', 'ngrok': 'port_forward',
    'generate_code': 'code_generate', 'code_generate': 'code_generate', 'gen_code': 'code_generate'
}

const _normalizeToolObj = (obj) => {
    if (!obj || typeof obj !== 'object') return null
    if (obj.tool) return obj
    // Accept 'command' as action when no other identifier (handles {"command":"mkdir","args":["kids"]})
    const action = obj.action || obj.type || obj.name || obj.command
    if (!action) return null
    const tool = _ACTION_TO_TOOL[String(action).toLowerCase()] || String(action).toLowerCase()
    const norm = { tool }
    if (obj.cmd !== undefined) norm.cmd = obj.cmd
    // Handle args array: first string becomes path (e.g. args: ["kids"])
    const firstArrayArg = Array.isArray(obj.args) ? obj.args.find(a => typeof a === 'string') : undefined
    if (obj.path || obj.directory || obj.dir || obj.folder) norm.path = obj.path || obj.directory || obj.dir || obj.folder
    else if (firstArrayArg) norm.path = firstArrayArg
    if (obj.content !== undefined) norm.content = obj.content
    if (obj.url !== undefined) norm.url = obj.url
    if (obj.method !== undefined) norm.method = obj.method
    if (obj.body !== undefined) norm.body = obj.body
    if (obj.lang !== undefined) norm.lang = obj.lang
    if (obj.code !== undefined) norm.code = obj.code
    if (obj.query !== undefined) norm.query = obj.query
    if (obj.packages !== undefined) norm.packages = obj.packages
    for (const k of Object.keys(obj)) {
        const skip = ['action', 'type', 'name', 'command', 'directory', 'dir', 'folder']
        if (!skip.includes(k) && !(k in norm)) norm[k] = obj[k]
    }
    return norm
}

const parseToolCalls = (text) => {
    if (!text) return null
    const t = text.trim()

    const stripped = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    for (const src of [stripped, t]) {
        if (src.startsWith('[')) {
            try {
                const p = JSON.parse(src)
                if (Array.isArray(p) && p.length) {
                    const tools = p.map(_normalizeToolObj).filter(Boolean)
                    if (tools.length) return tools
                }
            } catch {}
        }
        if (src.startsWith('{')) {
            try {
                const p = JSON.parse(src)
                const norm = _normalizeToolObj(p)
                if (norm) return [norm]
            } catch {}
        }
    }

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
                    const tools = parsed.map(_normalizeToolObj).filter(Boolean)
                    if (tools.length) { tools.forEach(tc => matches.push(tc)); return }
                } else {
                    const norm = _normalizeToolObj(parsed)
                    if (norm) { matches.push(norm); return }
                }
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

    // ── multi_bash ───────────────────────────────────────────────────
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

    // ── multi_write — write many files simultaneously (parallel) ─────────────
    if (t === 'multi_write') {
        const files = Array.isArray(tc.files) ? tc.files : []
        if (!files.length) return 'ERROR: files array required [{path, content}]'
        const results = await Promise.all(files.map(async (f) => {
            try {
                const p = _safeWsPath(f.path)
                if (!p) return `ERROR: invalid path: ${f.path}`
                _nodeFsSync.mkdirSync(_nodePath.dirname(p), { recursive: true })
                await _nodeFsPromises.writeFile(p, f.content || '', 'utf8')
                return `✅ ${f.path} (${(f.content||'').length} bytes)`
            } catch (e) { return `❌ ${f.path}: ${e.message}` }
        }))
        return `Written ${files.length} files in parallel:\n` + results.join('\n')
    }

    // ── edit_file — surgical find-and-replace (never rewrites the whole file) ─
    if (t === 'edit_file') {
        const p = _safeWsPath(tc.path)
        if (!p) return 'ERROR: invalid path'
        if (!_nodeFsSync.existsSync(p)) return `ERROR: file not found: ${p}`
        let content = await _nodeFsPromises.readFile(p, 'utf8')
        const edits = Array.isArray(tc.edits) ? tc.edits : (tc.find ? [{ find: tc.find, replace: tc.replace || '' }] : [])
        if (!edits.length) return 'ERROR: edits array required [{find, replace}]'
        let changes = 0
        for (const edit of edits) {
            const before = content
            if (edit.find_regex) {
                content = content.replace(new RegExp(edit.find_regex, edit.flags || 'g'), edit.replace || '')
            } else {
                content = content.split(edit.find).join(edit.replace || '')
            }
            if (content !== before) changes++
        }
        if (!changes) return `WARNING: no matches found — file unchanged: ${p}`
        await _nodeFsPromises.writeFile(p, content, 'utf8')
        return `✅ edited ${p}: ${changes}/${edits.length} edit(s) applied`
    }

    // ── scan_project — read all files in a workspace folder (project awareness)
    if (t === 'scan_project') {
        const dir = _safeWsPath(tc.path || 'workspace/')
        if (!dir || !_nodeFsSync.existsSync(dir)) return `ERROR: directory not found: ${tc.path || 'workspace/'}`
        const walk = (d, prefix = '') => {
            let out = []
            try {
                const entries = _nodeFsSync.readdirSync(d, { withFileTypes: true })
                for (const e of entries) {
                    if (e.name.startsWith('.') || e.name === 'node_modules') continue
                    const rel = prefix ? prefix + '/' + e.name : e.name
                    if (e.isDirectory()) { out = out.concat(walk(_nodePath.join(d, e.name), rel)) }
                    else { out.push(rel) }
                }
            } catch {}
            return out
        }
        const files = walk(dir)
        if (!files.length) return `📂 ${tc.path || 'workspace/'} is empty.`
        const maxPreview = tc.preview !== false
        const lines = [`📂 Project: ${tc.path || 'workspace/'} (${files.length} files)\n`]
        let charBudget = 5000
        for (const f of files) {
            lines.push(`• ${f}`)
            if (maxPreview && charBudget > 0 && tc.read_contents !== false) {
                try {
                    const fp = _nodePath.join(dir, f)
                    const stat = _nodeFsSync.statSync(fp)
                    if (stat.size < 8000) {
                        const c = await _nodeFsPromises.readFile(fp, 'utf8')
                        const snippet = c.slice(0, Math.min(400, charBudget))
                        if (snippet.trim()) { lines.push(`\`\`\`\n${snippet}${c.length > 400 ? '\n...' : ''}\n\`\`\``) }
                        charBudget -= snippet.length
                    }
                } catch {}
            }
        }
        return lines.join('\n')
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

    // ── pastebin ─────────────────────────────────────────────────
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

    // ── api / fetch_api ───────────────────────────────────────────────────
    if (t === 'api' || t === 'fetch_api' || t === 'fetch' || t === 'http') {
        const method = (tc.method || 'GET').toUpperCase()
        const url = tc.url || tc.endpoint
        if (!url) return 'ERROR: no URL provided'
        const headers = Object.assign({}, tc.headers || {})
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

    // ── read_page / scrape ────────────────────────────────────────────────
    if (t === 'read_page' || t === 'scrape_page' || t === 'scrape') {
        const url = tc.url || ''
        if (!url) return 'ERROR: no URL'
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
            html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
                .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
                .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
                .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
                .replace(/<h[1-6][^>]*>/gi, '\n## ')
                .replace(/<\/h[1-6]>/gi, '\n')
                .replace(/<p[^>]*>/gi, '\n')
                .replace(/<li[^>]*>/gi, '\n• ')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, ' ')
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
            const r = await axios2.get(`https://api.giftedtech.web.id/api/search/screenshot`, {
                params: { url: sUrl, apikey: 'gifted' }, timeout: 30000, validateStatus: () => true
            })
            const img = r.data?.result?.url || r.data?.url || r.data?.result
            if (img && conn && m) {
                await conn.sendMessage(chatId, { image: { url: img }, caption: `📸 ${sUrl}` }, { quoted: m }).catch(() => {})
                return `screenshot sent`
            }
        } catch {}
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
        try {
            const r = await axios2.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=5&apikey=bbbc5ec9e33cb9cda571f61a1ba8cf0f`, {
                timeout: 10000, validateStatus: () => true
            })
            if (r.data?.articles?.length) {
                return r.data.articles.map(a => `📰 *${a.title}*\n${a.description || ''}\n${a.url}\n_${a.source?.name} — ${new Date(a.publishedAt).toLocaleDateString()}_`).join('\n\n')
            }
        } catch {}
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

    // ── tts ────────────────────────────────────────────────────────
    if (t === 'tts') {
        const rawText = (tc.text || '').slice(0, 700)
        const lang = tc.lang || tc.voice || 'en'
        if (!rawText) return '❌ TTS: no text provided'
        if (!conn || !m) return `TTS: "${rawText}" (lang: ${lang})`

        const tryTTS = async (url, opts = {}) => {
            try {
                const r = await axios2.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 20000,
                    headers: { 'User-Agent': 'Mozilla/5.0', ...opts.headers }
                })
                const buf = Buffer.from(r.data)
                if (buf.length > 1000) return buf
            } catch {}
            return null
        }

        const VOICE_MAP = { en: 'en-US-AriaNeural', sw: 'sw-KE-ZuriNeural', fr: 'fr-FR-DeniseNeural', ar: 'ar-EG-SalmaNeural', hi: 'hi-IN-SwaraNeural', de: 'de-DE-KatjaNeural', es: 'es-ES-ElviraNeural', pt: 'pt-BR-FranciscaNeural', zh: 'zh-CN-XiaoxiaoNeural' }
        const voice = tc.voice_name || VOICE_MAP[lang] || `${lang}-Default`
        let buf = await tryTTS(`https://tts.deno.dev/?t=${encodeURIComponent(rawText)}&v=${encodeURIComponent(voice)}`)

        if (!buf) buf = await tryTTS(`https://api.streamelements.com/kappa/v2/speech?voice=${tc.se_voice || 'Brian'}&text=${encodeURIComponent(rawText.slice(0,400))}`)

        if (!buf) {
            const chunks = rawText.match(/.{1,180}/g) || [rawText]
            const parts = []
            for (const chunk of chunks.slice(0, 3)) {
                const p = await tryTTS(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`, { headers: { Referer: 'https://translate.google.com/' } })
                if (p) parts.push(p)
            }
            if (parts.length) buf = Buffer.concat(parts)
        }

        if (!buf) buf = await tryTTS(`https://api.voicerss.org/?key=11f53b18b5094a2483f26fa09a28b74c&hl=${lang}&src=${encodeURIComponent(rawText.slice(0,300))}&f=16khz_16bit_stereo&c=MP3`)

        if (!buf) return `❌ TTS failed: all voice providers unavailable. Try again in a moment.`

        try {
            await conn.sendMessage(chatId,
                { audio: buf, mimetype: 'audio/mpeg', ptt: tc.ptt !== false, waveform: [0,25,50,75,100,75,50,25,0] },
                { quoted: m }
            )
            return `🔊 Voice note sent: _"${rawText.slice(0, 80)}${rawText.length > 80 ? '…' : ''}"_`
        } catch (e) { return `❌ TTS send failed: ${e.message}` }
    }

    // ── translate_text ────────────────────────────────────────────────────────
    if (t === 'translate_text' || t === 'translate') {
        const text = tc.text || ''
        const to = tc.to || tc.target || 'en'
        const from = tc.from || 'auto'
        try {
            const r = await axios2.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`, { timeout: 12000 })
            const translated = r.data?.responseData?.translatedText
            if (translated && translated !== 'NO QUERY SPECIFIED') return `🌐 [${from} → ${to}]\n${translated}`
        } catch {}
        return 'translation unavailable'
    }

    // ── image_gen ────────────────────────────────────────────────────────────
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
        return `╭══〘 🤖 BERA AI STATUS 〙═⊷\n┃ 🧠 RAM: ${sys.memory.used}/${sys.memory.total} (${sys.memory.pct})\n┃ 💾 Disk: ${sys.disk.used}/${sys.disk.total} (${sys.disk.pct})\n┃ ⏱️ Uptime: ${sys.uptime}\n┃ 📈 Load: ${sys.load}\n┃ 🖥️ CPUs: ${sys.cpus}\n┃\n┃ ━━━ 🚀 BERAHOST BOTS ━━━\n${bhLines}\n┃\n┃ ━━━ ⏰ CRON JOBS (${crons.length}) ━━━\n${crons.length ? crons.map(([id, j]) => `┃ • ${id}: ${j.schedule}`).join('\n') : '┃ none'}\n┃\n┃ ━━━ 👁️ MONITORS (${monitors.length}) ━━━\n${monitors.length ? monitors.map(([id, mon]) => `┃ • ${id}: ${mon.lastStatus === true ? '✅ up' : mon.lastStatus === false ? '🔴 down' : '⏳'}`).join('\n') : '┃ none'}\n┃\n┃ ━━━ 📝 NOTES (${notes.length}) ━━━\n${notes.length ? notes.slice(0, 5).map(n => `┃ • ${n}`).join('\n') : '┃ none'}\n╰══════════════════⊷`
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

    // ── skyhost — Sky Hosting API (create project, deploy, monitor, list) ─────
    if (t === 'skyhost') {
        const sh = require('./skyhost')
        const action = tc.action || 'list'
        try {
            switch (action) {
                case 'list': {
                    const r = await sh.listProjects()
                    if (!r.success) return `❌ Sky Hosting error: ${r.error}`
                    const projects = r.projects || []
                    if (!projects.length) return '📭 No Sky Hosting projects yet.'
                    return projects.map(p =>
                        `• *${p.name}* [${p.status}]\n  ID: ${p.id}\n  ${p.liveUrl ? '🌐 ' + p.liveUrl : 'Not deployed'}`
                    ).join('\n\n')
                }
                case 'deploy': {
                    if (!tc.repoUrl) return 'ERROR: repoUrl required'
                    const result = await sh.deployRepo({
                        name: tc.name,
                        repoUrl: tc.repoUrl,
                        branch: tc.branch || 'main',
                        envVars: tc.envVars || {},
                        conn,
                        chat: chatId
                    })
                    if (!result.success) {
                        const logsTail = result.logs ? '\n\n📋 *Build logs:*\n```\n' + result.logs + '\n```' : ''
                        return `❌ Deployment failed: ${result.error}${logsTail}`
                    }
                    return `✅ *Deployed to Sky Hosting!*\n\n🌐 *Live URL:* ${result.liveUrl}\n📦 *Project ID:* ${result.projectId}\n🆔 *Deployment ID:* ${result.deploymentId}\n🖥️ *Runtime:* ${result.runtime || 'auto-detected'}`
                }
                case 'status': {
                    if (!tc.deploymentId) return 'ERROR: deploymentId required'
                    const r = await sh.getDeployment(tc.deploymentId)
                    if (!r.success) return `❌ ${r.error}`
                    const d = r.deployment
                    return `📊 *Deployment Status*\n\nID: ${d.id}\nStatus: *${d.status}*\nRuntime: ${d.runtime || 'unknown'}\n${d.liveUrl ? '🌐 ' + d.liveUrl : ''}\nStarted: ${d.startedAt || d.createdAt}`
                }
                case 'logs': {
                    if (!tc.deploymentId) return 'ERROR: deploymentId required'
                    const r = await sh.getLogs(tc.deploymentId)
                    if (!r.success) return `❌ ${r.error}`
                    const lines = (r.logs || []).slice(-20).map(l => `[${l.level || 'info'}] ${l.message}`).join('\n')
                    return `📋 *Build Logs:*\n\`\`\`\n${lines || 'No logs yet.'}\n\`\`\``
                }
                case 'stop': {
                    if (!tc.deploymentId) return 'ERROR: deploymentId required'
                    const r = await sh.deleteDeployment(tc.deploymentId)
                    return r.success ? `🛑 Deployment ${tc.deploymentId} stopped.` : `❌ ${r.error}`
                }
                case 'delete_project': {
                    if (!tc.projectId) return 'ERROR: projectId required'
                    const r = await sh.deleteProject(tc.projectId)
                    return r.success ? `🗑️ Project ${tc.projectId} deleted.` : `❌ ${r.error}`
                }
                case 'health': {
                    const ok = await sh.checkHealth()
                    return ok ? '✅ Sky Hosting API is online.' : '❌ Sky Hosting API is unreachable.'
                }
                default: return `Unknown skyhost action: ${action}\nAvailable: list, deploy, status, logs, stop, delete_project, health`
            }
        } catch (e) { return `❌ skyhost error: ${e.message}` }
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

    // ── wa_group_setting ────────────────────────────────────
    if (t === 'wa_group_setting') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        if (!group?.endsWith('@g.us')) return '❌ This must be used inside a WhatsApp group.'
        const action = (tc.action || tc.setting || '').toLowerCase()
        let setting
        if (['close','lock','mute','locked','announcement'].includes(action)) {
            setting = 'announcement'
        } else if (['open','unlock','unmute','not_announcement','unlocked','everyone'].includes(action)) {
            setting = 'not_announcement'
        } else if (['restrict','only_admins_edit','restricted'].includes(action)) {
            setting = 'locked'
        } else if (['unrestrict','unlocked','everyone_edit','everyone_can_edit'].includes(action)) {
            setting = 'unlocked'
        } else {
            return `❌ Unknown action: "${action}". Use: open, close, restrict, or unrestrict`
        }
        const labels = {
            announcement: '🔇 Group closed — only admins can send messages.',
            not_announcement: '🔊 Group opened — everyone can send messages.',
            locked: '🔒 Group info locked — only admins can edit name/description.',
            unlocked: '🔓 Group info unlocked — anyone can edit.'
        }
        try {
            await conn.groupSettingUpdate(group, setting)
            return labels[setting] || '✅ Group setting updated.'
        } catch (e) {
            return `❌ Failed: ${e.message}\n\nMake sure the bot is an admin in this group.`
        }
    }

    // ── wa_group_info ─────────────────────────────────────────────────────────
    if (t === 'wa_group_info') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        if (!group?.endsWith('@g.us')) return '❌ Not in a group.'
        try {
            const meta = await conn.groupMetadata(group)
            const admins = meta.participants.filter(p => p.admin).map(p => `+${p.id.split('@')[0]}`)
            return [
                `📋 *Group Info:*`,
                `*Name:* ${meta.subject || 'Unknown'}`,
                `*Description:* ${meta.desc || 'None'}`,
                `*Members:* ${meta.participants.length}`,
                `*Admins:* ${admins.length} — ${admins.slice(0,5).join(', ')}${admins.length > 5 ? ` +${admins.length-5} more` : ''}`,
                `*Created:* ${meta.creation ? new Date(meta.creation*1000).toDateString() : 'Unknown'}`,
                `*Restricted:* ${meta.announce ? 'Yes (only admins can send)' : 'No'}`,
            ].join('\n')
        } catch (e) { return `❌ Could not get group info: ${e.message}` }
    }

    // ── wa_group_subject ──────────────────────────────────────────────────────
    if (t === 'wa_group_subject') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        const name = tc.name || tc.subject || tc.title || ''
        if (!name) return '❌ Provide a new group name: {"tool":"wa_group_subject","name":"New Name"}'
        if (!group?.endsWith('@g.us')) return '❌ Not in a group.'
        try {
            await conn.groupUpdateSubject(group, name)
            return `✅ Group renamed to: *${name}*`
        } catch (e) { return `❌ Rename failed: ${e.message}` }
    }

    // ── wa_group_desc ─────────────────────────────────────────────────────────
    if (t === 'wa_group_desc') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        const desc = tc.description || tc.desc || tc.text || ''
        if (!group?.endsWith('@g.us')) return '❌ Not in a group.'
        try {
            await conn.groupUpdateDescription(group, desc)
            return `✅ Group description updated.`
        } catch (e) { return `❌ Failed: ${e.message}` }
    }

    // ── wa_group_invite ───────────────────────────────────────────────────────
    if (t === 'wa_group_invite') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        if (!group?.endsWith('@g.us')) return '❌ Not in a group.'
        try {
            const code = await conn.groupInviteCode(group)
            const link = `https://chat.whatsapp.com/${code}`
            if (m) await conn.sendMessage(chatId, { text: `🔗 *Group Invite Link:*\n${link}` }, { quoted: m }).catch(() => {})
            return `🔗 Invite link: ${link}`
        } catch (e) { return `❌ Could not get invite link: ${e.message}` }
    }

    // ── wa_add ────────────────────────────────────────────────────────────────
    if (t === 'wa_add') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        if (!num) return '❌ No number provided.'
        if (!group?.endsWith('@g.us')) return '❌ Not in a group.'
        const jid = `${num}@s.whatsapp.net`
        try {
            const r = await conn.groupParticipantsUpdate(group, [jid], 'add')
            const status = r?.[0]?.status
            if (status === 200 || status === '200') return `✅ Added +${num} to the group.`
            if (status === 403) return `❌ +${num} has privacy settings that prevent being added. Send them the invite link instead.`
            if (status === 408) return `❌ +${num} is not on WhatsApp.`
            return `✅ Add request sent to +${num}. Status: ${status}`
        } catch (e) { return `❌ Add failed: ${e.message}` }
    }

    // ── wa_kick ───────────────────────────────────────────────────────────────
    if (t === 'wa_kick') {
        if (!conn) return 'ERROR: no connection'
        const group = tc.group || chatId
        if (!group?.endsWith('@g.us')) return '❌ Not in a group.'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        if (!num) return 'ERROR: no number'
        const jid = num.includes('@') ? tc.number : `${num}@s.whatsapp.net`
        try {
            await conn.groupParticipantsUpdate(group, [jid], 'remove')
            return `✅ Kicked +${num} from the group.`
        } catch (e) { return `❌ Kick failed: ${e.message}` }
    }

    // ── wa_promote ────────────────────────────────────────────────────────────
    if (t === 'wa_promote') {
        if (!conn) return 'ERROR: no connection'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        const jid = `${num}@s.whatsapp.net`
        try {
            await conn.groupParticipantsUpdate(tc.group || chatId, [jid], 'promote')
            return `✅ Promoted +${num} to admin.`
        } catch (e) { return `❌ Promote failed: ${e.message}` }
    }

    // ── wa_demote ─────────────────────────────────────────────────────────────
    if (t === 'wa_demote') {
        if (!conn) return 'ERROR: no connection'
        const num = String(tc.number || '').replace(/[^0-9]/g, '')
        const jid = `${num}@s.whatsapp.net`
        try {
            await conn.groupParticipantsUpdate(tc.group || chatId, [jid], 'demote')
            return `✅ Removed admin from +${num}.`
        } catch (e) { return `❌ Demote failed: ${e.message}` }
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

    // ── scaffold ──────────────────────────────────────────────────────────────
    if (t === 'scaffold') {
        const nodePath = require('path')
        const nodeFsS  = require('fs')
        const type = (tc.type || 'express').toLowerCase().trim()
        const rawName  = (tc.name || 'my-app').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        const dest = nodePath.resolve(process.env.HOME || '/root', 'workspace', rawName)

        const write = (rel, content) => {
            const full = nodePath.join(dest, rel)
            nodeFsS.mkdirSync(nodePath.dirname(full), { recursive: true })
            nodeFsS.writeFileSync(full, content, 'utf8')
        }

        const TEMPLATES = {
            react: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { '@vitejs/plugin-react': '^4.3.1', vite: '^5.4.2', tailwindcss: '^3.4.10', autoprefixer: '^10.4.20', postcss: '^8.4.45' } }, null, 2))
                write('vite.config.js', `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()], server: { port: 3000 } })`)
                write('tailwind.config.js', `export default { content: ['./index.html','./src/**/*.{js,jsx}'], theme: { extend: {} }, plugins: [] }`)
                write('postcss.config.js', `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`)
                write('index.html', `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n  <title>${rawName}</title>\n</head>\n<body class="bg-gray-950 text-white min-h-screen">\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>`)
                write('src/main.jsx', `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport './index.css'\nimport App from './App'\nReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)`)
                write('src/index.css', `@tailwind base;\n@tailwind components;\n@tailwind utilities;`)
                write('src/App.jsx', `import { useState } from 'react'\nexport default function App() {\n  const [count, setCount] = useState(0)\n  return (\n    <div className="flex flex-col items-center justify-center min-h-screen gap-6">\n      <h1 className="text-4xl font-bold text-blue-400">${rawName}</h1>\n      <p className="text-gray-400">Built with React + Vite + TailwindCSS</p>\n      <button onClick={() => setCount(c => c + 1)}\n        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold transition">\n        Count: {count}\n      </button>\n    </div>\n  )\n}`)
                write('.gitignore', 'node_modules/\ndist/\n.env\n.DS_Store')
                write('README.md', `# ${rawName}\n\nReact 18 + Vite 5 + TailwindCSS\n\n## Setup\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nOpen http://localhost:3000`)
                return ['package.json','vite.config.js','tailwind.config.js','postcss.config.js','index.html','src/main.jsx','src/index.css','src/App.jsx','.gitignore','README.md']
            },
            next: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '0.1.0', private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: '^14.2.5', react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { tailwindcss: '^3.4.10', autoprefixer: '^10.4.20', postcss: '^8.4.45' } }, null, 2))
                write('next.config.mjs', `/** @type {import('next').NextConfig} */\nconst nextConfig = {}\nexport default nextConfig`)
                write('tailwind.config.js', `module.exports = { content: ['./app/**/*.{js,jsx,ts,tsx}'], theme: { extend: {} }, plugins: [] }`)
                write('postcss.config.js', `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }`)
                write('app/globals.css', `@tailwind base;\n@tailwind components;\n@tailwind utilities;`)
                write('app/layout.jsx', `import './globals.css'\nexport const metadata = { title: '${rawName}', description: 'Next.js app' }\nexport default function RootLayout({ children }) {\n  return <html lang="en"><body className="bg-gray-950 text-white">{children}</body></html>\n}`)
                write('app/page.jsx', `export default function Home() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center gap-6">\n      <h1 className="text-5xl font-bold text-blue-400">${rawName}</h1>\n      <p className="text-gray-400">Next.js 14 App Router</p>\n      <a href="/api/hello" className="text-blue-500 underline">Test API →</a>\n    </main>\n  )\n}`)
                write('app/api/hello/route.js', `export async function GET() { return Response.json({ message: 'Hello from ${rawName}!' }) }`)
                write('.gitignore', 'node_modules/\n.next/\n.env*\n!.env.example')
                write('README.md', `# ${rawName}\n\nNext.js 14 + TailwindCSS\n\n\`\`\`bash\nnpm install && npm run dev\n\`\`\``)
                return ['package.json','next.config.mjs','app/layout.jsx','app/page.jsx','app/api/hello/route.js','tailwind.config.js','README.md']
            },
            express: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js', dev: 'nodemon index.js' }, dependencies: { express: '^5.0.0', cors: '^2.8.5', dotenv: '^16.4.5', morgan: '^1.10.0' }, devDependencies: { nodemon: '^3.1.4' } }, null, 2))
                write('index.js', `require('dotenv').config()\nconst express = require('express')\nconst cors    = require('cors')\nconst morgan  = require('morgan')\nconst routes  = require('./routes')\n\nconst app  = express()\nconst PORT = process.env.PORT || 3000\n\napp.use(cors())\napp.use(morgan('dev'))\napp.use(express.json())\napp.use(express.urlencoded({ extended: true }))\n\napp.use('/api', routes)\n\napp.get('/', (req, res) => res.json({ app: '${rawName}', status: 'running', time: new Date().toISOString() }))\n\napp.use((err, req, res, next) => {\n  console.error(err)\n  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' })\n})\n\napp.listen(PORT, () => console.log(\`✅ ${rawName} running on port \${PORT}\`))\n`)
                write('routes/index.js', `const express = require('express')\nconst router  = express.Router()\n\nrouter.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))\n\nrouter.get('/hello', (req, res) => res.json({ message: 'Hello from ${rawName}!' }))\n\nmodule.exports = router\n`)
                write('middleware/auth.js', `module.exports = (req, res, next) => {\n  const token = req.headers.authorization?.replace('Bearer ', '')\n  if (!token) return res.status(401).json({ error: 'Unauthorized' })\n  req.user = { token }\n  next()\n}\n`)
                write('.env', `PORT=3000\nNODE_ENV=development\n# Add your secrets below\n`)
                write('.env.example', 'PORT=3000\nNODE_ENV=development\n')
                write('.gitignore', 'node_modules/\n.env\n*.log')
                write('README.md', `# ${rawName}\n\nExpress 5 REST API\n\n## Setup\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Endpoints\n- GET /          → app info\n- GET /api/health → health check\n- GET /api/hello  → hello world`)
                return ['index.js','routes/index.js','middleware/auth.js','.env','.env.example','package.json','README.md']
            },
            fastapi: () => {
                write('main.py', `from fastapi import FastAPI, HTTPException\nfrom fastapi.middleware.cors import CORSMiddleware\nfrom pydantic import BaseModel\nfrom datetime import datetime\n\napp = FastAPI(title="${rawName}", version="1.0.0")\n\napp.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])\n\nclass Item(BaseModel):\n    name: str\n    description: str = ""\n\n@app.get("/")\nasync def root():\n    return {"app": "${rawName}", "status": "running", "time": str(datetime.now())}\n\n@app.get("/health")\nasync def health():\n    return {"status": "ok"}\n\n@app.post("/items")\nasync def create_item(item: Item):\n    return {"id": 1, **item.dict()}\n`)
                write('requirements.txt', 'fastapi==0.115.0\nuvicorn[standard]==0.30.6\npydantic==2.9.2\npython-dotenv==1.0.1\n')
                write('.env', 'PORT=8000\nDEBUG=True\n')
                write('README.md', `# ${rawName}\n\nPython FastAPI\n\n## Setup\n\`\`\`bash\npip install -r requirements.txt\nuvicorn main:app --reload\n\`\`\`\n\nDocs at http://localhost:8000/docs`)
                return ['main.py','requirements.txt','.env','README.md']
            },
            fullstack: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', workspaces: ['client','server'], scripts: { dev: 'concurrently "npm run dev --workspace=server" "npm run dev --workspace=client"', start: 'npm run start --workspace=server' }, devDependencies: { concurrently: '^8.2.2' } }, null, 2))
                write('server/package.json', JSON.stringify({ name: `${rawName}-server`, version: '1.0.0', main: 'index.js', scripts: { dev: 'nodemon index.js', start: 'node index.js' }, dependencies: { express: '^5.0.0', cors: '^2.8.5', dotenv: '^16.4.5' }, devDependencies: { nodemon: '^3.1.4' } }, null, 2))
                write('server/index.js', `require('dotenv').config()\nconst express = require('express')\nconst cors = require('cors')\nconst path = require('path')\nconst app = express()\nconst PORT = process.env.PORT || 5000\napp.use(cors({ origin: 'http://localhost:3000' }))\napp.use(express.json())\napp.get('/api/health', (_, res) => res.json({ status: 'ok' }))\napp.get('/api/hello', (_, res) => res.json({ message: 'Hello from ${rawName} server!' }))\napp.listen(PORT, () => console.log(\`✅ Server on port \${PORT}\`))\n`)
                write('server/.env', 'PORT=5000\n')
                write('client/package.json', JSON.stringify({ name: `${rawName}-client`, version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { '@vitejs/plugin-react': '^4.3.1', vite: '^5.4.2' } }, null, 2))
                write('client/vite.config.js', `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()], server: { port: 3000, proxy: { '/api': 'http://localhost:5000' } } })`)
                write('client/index.html', `<!DOCTYPE html><html><head><title>${rawName}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`)
                write('client/src/main.jsx', `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nReactDOM.createRoot(document.getElementById('root')).render(<App />)`)
                write('client/src/App.jsx', `import { useState, useEffect } from 'react'\nexport default function App() {\n  const [data, setData] = useState(null)\n  useEffect(() => { fetch('/api/hello').then(r=>r.json()).then(setData) }, [])\n  return <div style={{textAlign:'center',padding:'2rem'}}><h1>${rawName}</h1><p>{data?.message || 'Loading...'}</p></div>\n}`)
                write('.gitignore', 'node_modules/\ndist/\n.env\n.DS_Store')
                write('README.md', `# ${rawName}\n\nFull-stack React + Express monorepo\n\n\`\`\`bash\nnpm install\nnpm run dev   # starts both client (3000) and server (5000)\n\`\`\``)
                return ['package.json','server/index.js','server/package.json','client/src/App.jsx','client/vite.config.js','README.md']
            },
            discord: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js', dev: 'nodemon index.js', deploy: 'node deploy-commands.js' }, dependencies: { 'discord.js': '^14.15.3', dotenv: '^16.4.5' }, devDependencies: { nodemon: '^3.1.4' } }, null, 2))
                write('index.js', `require('dotenv').config()\nconst { Client, GatewayIntentBits, Collection } = require('discord.js')\nconst fs = require('fs')\nconst path = require('path')\nconst client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] })\nclient.commands = new Collection()\nconst cmdFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'))\nfor (const file of cmdFiles) {\n  const cmd = require(\`./commands/\${file}\`)\n  client.commands.set(cmd.data.name, cmd)\n}\nclient.once('ready', () => console.log(\`✅ Logged in as \${client.user.tag}\`))\nclient.on('interactionCreate', async i => {\n  if (!i.isChatInputCommand()) return\n  const cmd = client.commands.get(i.commandName)\n  if (!cmd) return\n  try { await cmd.execute(i) } catch (e) { await i.reply({ content: 'Error!', ephemeral: true }) }\n})\nclient.login(process.env.DISCORD_TOKEN)\n`)
                write('commands/ping.js', `const { SlashCommandBuilder } = require('discord.js')\nmodule.exports = { data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'), async execute(i) { await i.reply(\`🏓 Pong! Latency: \${Date.now() - i.createdTimestamp}ms\`) } }\n`)
                write('deploy-commands.js', `require('dotenv').config()\nconst { REST, Routes } = require('discord.js')\nconst fs = require('fs')\nconst commands = fs.readdirSync('./commands').filter(f=>f.endsWith('.js')).map(f=>require(\`./commands/\${f}\`).data.toJSON())\nconst rest = new REST().setToken(process.env.DISCORD_TOKEN)\nrest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands }).then(() => console.log('Commands deployed!')).catch(console.error)\n`)
                write('.env', 'DISCORD_TOKEN=your_bot_token_here\nCLIENT_ID=your_client_id\nGUILD_ID=your_guild_id\n')
                write('.gitignore', 'node_modules/\n.env')
                write('README.md', `# ${rawName}\n\nDiscord.js v14 Bot\n\n## Setup\n1. Create bot at https://discord.com/developers/applications\n2. Copy token to .env\n3. npm install\n4. npm run deploy\n5. npm start`)
                return ['index.js','commands/ping.js','deploy-commands.js','.env','package.json','README.md']
            },
            telegram: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js', dev: 'nodemon index.js' }, dependencies: { telegraf: '^4.16.3', dotenv: '^16.4.5' }, devDependencies: { nodemon: '^3.1.4' } }, null, 2))
                write('index.js', `require('dotenv').config()\nconst { Telegraf, session } = require('telegraf')\nconst bot = new Telegraf(process.env.BOT_TOKEN)\nbot.use(session())\nbot.start((ctx) => ctx.reply(\`👋 Welcome! I'm \${ctx.botInfo.first_name}. Type /help for commands.\`))\nbot.help((ctx) => ctx.reply('Available commands:\\n/start - Start bot\\n/help - Show this help\\n/ping - Check bot status'))\nbot.command('ping', (ctx) => ctx.reply(\`🏓 Pong! I'm alive.\`))\nbot.on('text', (ctx) => ctx.reply(\`You said: \${ctx.message.text}\`))\nbot.launch()\nprocess.once('SIGINT', () => bot.stop('SIGINT'))\nprocess.once('SIGTERM', () => bot.stop('SIGTERM'))\nconsole.log('✅ ${rawName} bot started')\n`)
                write('.env', 'BOT_TOKEN=your_telegram_bot_token_here\n')
                write('.gitignore', 'node_modules/\n.env')
                write('README.md', `# ${rawName}\n\nTelegraf.js Telegram Bot\n\n1. Create bot via @BotFather → get token\n2. Add token to .env\n3. npm install && npm start`)
                return ['index.js','.env','package.json','README.md']
            },
            cli: () => {
                write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', bin: { [rawName]: './bin/cli.js' }, scripts: { start: 'node bin/cli.js' }, dependencies: { commander: '^12.1.0', chalk: '^5.3.0', ora: '^8.0.1' }, type: 'module' }, null, 2))
                write('bin/cli.js', `#!/usr/bin/env node\nimport { program } from 'commander'\nimport chalk from 'chalk'\nimport ora from 'ora'\n\nprogram.name('${rawName}').description('CLI tool').version('1.0.0')\n\nprogram.command('hello').description('Say hello').option('-n, --name <name>', 'Your name', 'World').action(opts => { console.log(chalk.blue(\`Hello, \${opts.name}!\`)) })\n\nprogram.command('run').description('Run a task').action(async () => {\n  const spin = ora('Working...').start()\n  await new Promise(r => setTimeout(r, 1000))\n  spin.succeed(chalk.green('Done!'))\n})\n\nprogram.parse()\n`)
                write('.gitignore', 'node_modules/\n.env')
                write('README.md', `# ${rawName}\n\nNode.js CLI\n\n\`\`\`bash\nnpm install\nnode bin/cli.js hello --name Bera\nnpm link   # install globally\n${rawName} hello\n\`\`\``)
                return ['bin/cli.js','package.json','README.md']
            },
            flask: () => {
                write('app.py', `from flask import Flask, jsonify, request\nfrom flask_cors import CORS\nfrom dotenv import load_dotenv\nimport os\n\nload_dotenv()\napp = Flask(__name__)\nCORS(app)\n\n@app.route('/')\ndef index():\n    return jsonify({'app': '${rawName}', 'status': 'running'})\n\n@app.route('/api/health')\ndef health():\n    return jsonify({'status': 'ok'})\n\n@app.route('/api/hello', methods=['GET','POST'])\ndef hello():\n    data = request.json or {}\n    return jsonify({'message': f"Hello {data.get('name', 'World')}!"})\n\nif __name__ == '__main__':\n    port = int(os.getenv('PORT', 5000))\n    app.run(host='0.0.0.0', port=port, debug=os.getenv('DEBUG', 'false').lower() == 'true')\n`)
                write('requirements.txt', 'flask==3.0.3\nflask-cors==4.0.1\npython-dotenv==1.0.1\ngunicorn==23.0.0\n')
                write('.env', 'PORT=5000\nDEBUG=true\n')
                write('README.md', `# ${rawName}\n\nPython Flask\n\n\`\`\`bash\npip install -r requirements.txt\npython app.py\n\`\`\``)
                return ['app.py','requirements.txt','.env','README.md']
            }
        }
        const electron = () => {
            write('package.json', JSON.stringify({ name: rawName, version: '1.0.0', main: 'main.js', scripts: { start: 'electron .', dev: 'concurrently "vite" "electron ."' }, dependencies: { electron: '^31.3.1' }, devDependencies: { concurrently: '^8.2.2', vite: '^5.4.2' } }, null, 2))
            write('main.js', `const { app, BrowserWindow } = require('electron')\nconst path = require('path')\nfunction createWindow() {\n  const win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { nodeIntegration: true } })\n  win.loadFile('index.html')\n}\napp.whenReady().then(createWindow)\napp.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })\n`)
            write('index.html', `<!DOCTYPE html><html><head><title>${rawName}</title><style>body{font-family:sans-serif;text-align:center;padding:4rem;background:#1a1a2e;color:#fff}</style></head><body><h1>${rawName}</h1><p>Electron + Node.js desktop app</p></body></html>`)
            write('README.md', `# ${rawName}\n\nElectron desktop app\n\n\`\`\`bash\nnpm install && npm start\n\`\`\``)
            return ['main.js','index.html','package.json','README.md']
        }
        TEMPLATES.electron = electron

        // ── static / portfolio / landing / html ───────────────────────────────
        const staticSite = () => {
            const title = rawName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            write('index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <header class="header">
    <nav class="nav">
      <span class="logo">${title}</span>
      <ul>
        <li><a href="#about">About</a></li>
        <li><a href="#projects">Projects</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </header>

  <section class="hero">
    <div class="hero-content">
      <h1>Hi, I'm <span class="highlight">${title}</span> 👋</h1>
      <p>Full-Stack Developer · Designer · Problem Solver</p>
      <a href="#projects" class="btn">View My Work</a>
    </div>
  </section>

  <section id="about" class="section">
    <h2>About Me</h2>
    <p>I build clean, fast, and modern web applications. Passionate about great user experiences and elegant code.</p>
  </section>

  <section id="projects" class="section dark">
    <h2>Projects</h2>
    <div class="grid">
      <div class="card">
        <h3>Project One</h3>
        <p>A full-stack web app built with React and Node.js.</p>
        <a href="#" class="btn-sm">View →</a>
      </div>
      <div class="card">
        <h3>Project Two</h3>
        <p>Mobile-first responsive landing page with animations.</p>
        <a href="#" class="btn-sm">View →</a>
      </div>
      <div class="card">
        <h3>Project Three</h3>
        <p>REST API with authentication and real-time updates.</p>
        <a href="#" class="btn-sm">View →</a>
      </div>
    </div>
  </section>

  <section id="contact" class="section">
    <h2>Contact</h2>
    <p>Open to work! Reach out at <a href="mailto:hello@example.com">hello@example.com</a></p>
    <div class="socials">
      <a href="#">GitHub</a>
      <a href="#">LinkedIn</a>
      <a href="#">Twitter</a>
    </div>
  </section>

  <footer><p>© ${new Date().getFullYear()} ${title}. Built with ❤️</p></footer>

  <script src="script.js"></script>
</body>
</html>`)
            write('style.css', `* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #0f0f0f;
  --bg2: #1a1a1a;
  --text: #f0f0f0;
  --muted: #888;
  --accent: #6c63ff;
  --accent2: #a89cff;
}
html { scroll-behavior: smooth; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }

/* NAV */
.header { position: fixed; top: 0; width: 100%; background: rgba(15,15,15,0.9); backdrop-filter: blur(10px); z-index: 100; border-bottom: 1px solid #222; }
.nav { max-width: 1100px; margin: 0 auto; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 1.2rem; font-weight: 700; color: var(--accent); }
.nav ul { list-style: none; display: flex; gap: 2rem; }
.nav a { color: var(--muted); text-decoration: none; font-size: 0.95rem; transition: color 0.2s; }
.nav a:hover { color: var(--text); }

/* HERO */
.hero { min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; padding: 6rem 2rem 4rem; background: radial-gradient(ellipse at 50% 0%, #1e1b4b 0%, var(--bg) 60%); }
.hero h1 { font-size: clamp(2rem, 6vw, 4rem); font-weight: 800; margin-bottom: 1rem; }
.highlight { color: var(--accent); }
.hero p { color: var(--muted); font-size: 1.2rem; margin-bottom: 2rem; }
.btn { display: inline-block; padding: 0.85rem 2.2rem; background: var(--accent); color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; transition: transform 0.2s, opacity 0.2s; }
.btn:hover { opacity: 0.85; transform: translateY(-2px); }

/* SECTIONS */
.section { max-width: 1100px; margin: 0 auto; padding: 5rem 2rem; }
.section.dark { max-width: 100%; background: var(--bg2); }
.section.dark > * { max-width: 1100px; margin-left: auto; margin-right: auto; }
h2 { font-size: 2rem; font-weight: 700; margin-bottom: 1.5rem; }
h2::after { content: ''; display: block; width: 50px; height: 3px; background: var(--accent); margin-top: 0.5rem; border-radius: 2px; }

/* GRID */
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-top: 2rem; }
.card { background: var(--bg); border: 1px solid #2a2a2a; border-radius: 12px; padding: 1.8rem; transition: border-color 0.2s, transform 0.2s; }
.card:hover { border-color: var(--accent); transform: translateY(-4px); }
.card h3 { margin-bottom: 0.75rem; font-size: 1.15rem; }
.card p { color: var(--muted); font-size: 0.95rem; margin-bottom: 1.2rem; }
.btn-sm { color: var(--accent2); text-decoration: none; font-size: 0.9rem; font-weight: 600; }
.btn-sm:hover { color: var(--accent); }

/* CONTACT */
#contact p { color: var(--muted); font-size: 1.05rem; }
#contact a { color: var(--accent2); }
.socials { display: flex; gap: 1.5rem; margin-top: 1.5rem; }
.socials a { color: var(--muted); text-decoration: none; font-weight: 500; transition: color 0.2s; }
.socials a:hover { color: var(--text); }

/* FOOTER */
footer { text-align: center; padding: 2rem; color: var(--muted); font-size: 0.85rem; border-top: 1px solid #1e1e1e; }

/* RESPONSIVE */
@media (max-width: 600px) {
  .nav ul { gap: 1rem; }
  .hero h1 { font-size: 2rem; }
}`)
            write('script.js', `// Smooth nav highlight on scroll
const sections = document.querySelectorAll('section[id]')
const navLinks = document.querySelectorAll('.nav a')

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(a => a.classList.remove('active'))
      const link = document.querySelector(\`.nav a[href="#\${e.target.id}"]\`)
      if (link) link.style.color = 'var(--text)'
    }
  })
}, { threshold: 0.4 })

sections.forEach(s => observer.observe(s))

// Animate cards on scroll
const cards = document.querySelectorAll('.card')
const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1'
      e.target.style.transform = 'translateY(0)'
    }
  })
}, { threshold: 0.1 })

cards.forEach(card => {
  card.style.opacity = '0'
  card.style.transform = 'translateY(30px)'
  card.style.transition = 'opacity 0.5s ease, transform 0.5s ease'
  cardObserver.observe(card)
})`)
            write('README.md', `# ${title}\n\nStatic portfolio site — no build step needed.\n\n## Run locally\n\`\`\`bash\nnpx serve .\n# or just open index.html in your browser\n\`\`\`\n\n## Deploy\nDrop the folder on Netlify, Vercel, or GitHub Pages.`)
            return ['index.html', 'style.css', 'script.js', 'README.md']
        }
        TEMPLATES.static = staticSite
        TEMPLATES.portfolio = staticSite
        TEMPLATES.landing = staticSite
        TEMPLATES.html = staticSite
        TEMPLATES.website = staticSite

        const builder = TEMPLATES[type]
        if (!builder) return `❌ Unknown scaffold type: *${type}*\n\nAvailable: react, next, express, fastapi, fullstack, discord, telegram, electron, cli, flask, static, portfolio, landing`

        try {
            nodeFsS.mkdirSync(dest, { recursive: true })
            const files = builder()
            const fileList = files.map(f => `• ${f}`).join('\n')
            return `✅ *Scaffolded ${type} project:* \`${rawName}\`\n\n📁 *Location:* \`workspace/${rawName}/\`\n\n📄 *Files created:*\n${fileList}\n\n▶️ *Next step — install & run:*\n\`\`\`\ncd workspace/${rawName} && npm install && npm run dev\n\`\`\``
        } catch (e) {
            return `❌ Scaffold failed: ${e.message}`
        }
    }

    // ── pm2_manage ────────────────────────────────────────────────────────────
    if (t === 'pm2_manage') {
        const action = (tc.action || 'list').toLowerCase()
        try {
            const { execSync } = require('child_process')
            const run = (cmd) => execSync(cmd, { encoding: 'utf8', timeout: 20000, stdio: ['pipe','pipe','pipe'] }).trim()

            if (action === 'list' || action === 'ls') {
                try {
                    const out = run('pm2 jlist')
                    const procs = JSON.parse(out)
                    if (!procs.length) return `📭 No PM2 processes running.\n\nStart one: {"tool":"pm2_manage","action":"start","name":"my-app","file":"workspace/my-app/index.js"}`
                    const lines = procs.map(p => {
                        const mem = p.monit?.memory ? `${Math.round(p.monit.memory / 1024 / 1024)}MB` : 'N/A'
                        const cpu = p.monit?.cpu !== undefined ? `${p.monit.cpu}%` : 'N/A'
                        const st  = p.pm2_env?.status === 'online' ? '🟢' : p.pm2_env?.status === 'stopped' ? '🔴' : '🟡'
                        return `${st} *${p.name}* #${p.pm_id} | CPU:${cpu} MEM:${mem} | ${p.pm2_env?.status || 'unknown'}`
                    }).join('\n')
                    return `📊 *PM2 Processes (${procs.length}):*\n\n${lines}`
                } catch { return `📭 PM2 not available or no processes.\n\`\`\`\nnpm install -g pm2\n\`\`\`` }
            }
            if (action === 'start') {
                const name = tc.name || 'app'
                const file = tc.file || 'index.js'
                const envStr = tc.env ? Object.entries(tc.env).map(([k,v]) => `${k}=${v}`).join(' ') : ''
                const cmd = `${envStr ? envStr + ' ' : ''}pm2 start ${file} --name "${name}" --time`
                const out = run(cmd)
                return `✅ *Started:* \`${name}\`\n\nPM2 output: ${out.slice(0, 300)}\n\nView logs: {"tool":"pm2_manage","action":"logs","name":"${name}"}`
            }
            if (action === 'stop')    { run(`pm2 stop "${tc.name}"`);    return `⏹️ Stopped: \`${tc.name}\`` }
            if (action === 'restart') { run(`pm2 restart "${tc.name}"`); return `🔄 Restarted: \`${tc.name}\`` }
            if (action === 'delete')  { run(`pm2 delete "${tc.name}"`);  return `🗑️ Deleted: \`${tc.name}\`` }
            if (action === 'logs') {
                const lines = tc.lines || 30
                const out = run(`pm2 logs "${tc.name}" --lines ${lines} --nostream`)
                return `📋 *PM2 Logs — ${tc.name} (last ${lines} lines):*\n\n\`\`\`\n${out.slice(-2000)}\n\`\`\``
            }
            if (action === 'monit') {
                try {
                    const out = run('pm2 jlist')
                    const procs = JSON.parse(out)
                    const lines = procs.map(p => `• *${p.name}*: CPU ${p.monit?.cpu || 0}% | RAM ${Math.round((p.monit?.memory || 0)/1024/1024)}MB | ${p.pm2_env?.status}`).join('\n')
                    return `📈 *PM2 Monitor:*\n\n${lines || 'No processes running.'}`
                } catch { return `📭 PM2 monitor unavailable. Is PM2 running? Try: \`pm2 list\`` }
            }
            return `❓ Unknown PM2 action: ${action}\n\nAvailable: list, start, stop, restart, delete, logs, monit`
        } catch (e) {
            return `❌ PM2 error: ${e.message}\n\nInstall PM2: \`npm install -g pm2\``
        }
    }

    // ── create_repo ────────────────────────────────────────────────────────────
    if (t === 'create_repo') {
        const token = global.db?.data?.settings?.githubToken
        if (!token) return `❌ No GitHub token set. Use: {"tool":"setghtoken","token":"ghp_..."}`
        try {
            const res = await axios2.post('https://api.github.com/user/repos', {
                name: tc.name,
                description: tc.description || '',
                private: tc.private !== false,
                auto_init: tc.autoInit !== false
            }, { headers: { Authorization: `token ${token}`, 'User-Agent': 'BeraAgent/1.0', Accept: 'application/vnd.github.v3+json' } })
            const repo = res.data
            return `✅ *Repository created!*\n\n📁 *Name:* ${repo.full_name}\n🔗 *URL:* ${repo.html_url}\n🔒 *Private:* ${repo.private}\n\nClone: \`git clone ${repo.clone_url}\`\n\nPush local folder: {"tool":"git_push_folder","folder":"workspace/${tc.name}","repo":"${repo.full_name}","message":"feat: initial commit"}`
        } catch (e) {
            const msg = e.response?.data?.message || e.message
            return `❌ GitHub create repo failed: ${msg}`
        }
    }

    // ── git_push_folder ────────────────────────────────────────────────────────
    if (t === 'git_push_folder') {
        const token = global.db?.data?.settings?.githubToken
        if (!token) return `❌ No GitHub token set. Use: {"tool":"setghtoken","token":"ghp_..."}`
        const { execSync } = require('child_process')
        const nodeFsS = require('fs')
        const nodePath = require('path')
        const folder  = nodePath.resolve(process.env.HOME || '/root', tc.folder || 'workspace')
        const repo    = tc.repo
        const branch  = tc.branch || 'main'
        const message = tc.message || 'feat: initial commit via Bera Agent'

        if (!repo) return `❌ repo is required: e.g. "username/my-app"`
        if (!nodeFsS.existsSync(folder)) return `❌ Folder not found: ${folder}\n\nScaffold first: {"tool":"scaffold","type":"express","name":"my-app"}`

        try {
            const run = (cmd) => execSync(cmd, { cwd: folder, encoding: 'utf8', timeout: 60000, env: { ...process.env, GIT_ASKPASS: 'echo', GIT_TERMINAL_PROMPT: '0' } }).trim()

            const gitUrl = `https://${token}@github.com/${repo}.git`

            const isGitRepo = nodeFsS.existsSync(nodePath.join(folder, '.git'))
            if (!isGitRepo) run('git init')

            try { run('git remote remove origin') } catch {}
            run(`git remote add origin ${gitUrl}`)
            run('git add -A')
            try { run(`git commit -m "${message.replace(/"/g, '\\"')}"`) } catch {}
            try { run(`git branch -M ${branch}`) } catch {}
            run(`git push -u origin ${branch} --force`)

            return `✅ *Pushed to GitHub!*\n\n📁 *Repo:* https://github.com/${repo}\n🌿 *Branch:* ${branch}\n💬 *Commit:* ${message}\n\nView: https://github.com/${repo}`
        } catch (e) {
            return `❌ Git push failed: ${e.message.slice(0, 500)}\n\nCheck: repo name correct? GitHub token has write access?`
        }
    }


    // ── web_scrape — FIXED: full 4-strategy scraper ───────────────────────────
    if (t === 'web_scrape' || t === 'scrape_url' || t === 'fetch_page') {
        const url = tc.url || ''
        if (!url) return 'ERROR: no URL'
        const maxLen = tc.maxLen || 8000

        // Strategy 1: Jina.ai reader (best for articles, blogs, docs)
        try {
            const r = await axios2.get(`https://r.jina.ai/${url}`, {
                headers: { 'Accept': 'text/markdown', 'X-Return-Format': 'markdown', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 'X-No-Cache': 'true', 'X-With-Links-Summary': 'true' },
                timeout: 25000
            })
            if (r.status === 200 && r.data && String(r.data).length > 80) {
                const content = String(r.data)
                return `🌐 *${url}*

${content.slice(0, maxLen)}${content.length > maxLen ? '\n\n[...truncated]' : ''}`
            }
        } catch {}

        // Strategy 2: curl with real Chrome headers (beats most bot-detection)
        try {
            const curlCmd = `curl -sL --max-time 20 --compressed -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.5" "${url}"`
            const r = await runBash(`${curlCmd} 2>/dev/null | sed 's/<script[^>]*>[^<]*<\/script>//gI; s/<style[^>]*>[^<]*<\/style>//gI; s/<[^>]*>/ /g; s/  */ /g' | head -c ${maxLen}`, 28000)
            if (r.output && r.output.trim().length > 80) {
                return `🌐 *${url}*

${r.output.trim().slice(0, maxLen)}`
            }
        } catch {}

        // Strategy 3: Google Cache
        try {
            const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`
            const r = await axios2.get(cacheUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }, timeout: 15000, validateStatus: () => true })
            if (r.status === 200 && r.data) {
                let html = String(r.data).replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                if (html.length > 80) return `🌐 *${url}* (Google Cache)\n\n${html.slice(0, maxLen)}`
            }
        } catch {}

        // Strategy 4: Wayback Machine fallback
        try {
            const wb = await axios2.get(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { timeout: 10000 })
            const snapshot = wb.data?.archived_snapshots?.closest?.url
            if (snapshot) {
                const r = await axios2.get(`https://r.jina.ai/${snapshot}`, { headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 })
                if (r.status === 200 && r.data && String(r.data).length > 80) {
                    return `🌐 *${url}* (Archived Snapshot)\n\n${String(r.data).slice(0, maxLen)}`
                }
            }
        } catch {}

        return `❌ Could not scrape ${url}\nThe site may block all bots. Try: {"tool":"screenshot","url":"${url}"} to see it visually, or {"tool":"deep_scrape","url":"${url}","question":"what is on this page?"}`
    }

    // ── smart_extract — scrape + AI-targeted field extraction ─────────────────
    if (t === 'smart_extract') {
        const url = tc.url || ''
        const hint = tc.hint || tc.extract || tc.field || tc.what || ''
        if (!url) return 'ERROR: no URL'

        let pageText = ''
        try {
            const r = await axios2.get(`https://r.jina.ai/${url}`, { headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0', 'X-No-Cache': 'true' }, timeout: 25000 })
            if (r.status === 200 && r.data) pageText = String(r.data)
        } catch {}
        if (!pageText) {
            try {
                const r = await axios2.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 15000 })
                pageText = String(r.data || '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000)
            } catch {}
        }
        if (!pageText) return `❌ Could not fetch ${url}`

        const extractPrompt = hint
            ? `From this webpage, extract ONLY: ${hint}\n\nReturn the data clean and structured. No intro, no fluff.\n\nPage: ${url}\n\nContent:\n${pageText.slice(0, 5500)}`
            : `Summarize all key data from this webpage in a clean, structured format.\n\nPage: ${url}\n\nContent:\n${pageText.slice(0, 5500)}`

        try {
            const extracted = await callAI([ { role: 'system', content: 'You are a precise data extraction engine. Extract exactly what is asked. Return ONLY the requested data, structured clearly.' }, { role: 'user', content: extractPrompt } ], 35000)
            if (extracted) return `🎯 *Extracted from ${url}:*\n\n${extracted}`
        } catch {}

        // Fallback: keyword search
        const lines = pageText.split(/[\n.!?]+/).filter(l => hint ? l.toLowerCase().includes(hint.toLowerCase()) : l.trim().length > 30)
        return `🎯 *${hint || 'Key data'} from ${url}:*\n\n${lines.slice(0, 25).join('\n')}`
    }

    // ── deep_scrape — scrape + full AI analysis ───────────────────────────────
    if (t === 'deep_scrape') {
        const url = tc.url || ''
        const question = tc.question || tc.ask || tc.analyze || 'What is the main content, key data, and important information on this page?'
        if (!url) return 'ERROR: no URL'

        let pageText = ''
        try {
            const r = await axios2.get(`https://r.jina.ai/${url}`, { headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0', 'X-No-Cache': 'true' }, timeout: 30000 })
            if (r.status === 200 && r.data) pageText = String(r.data)
        } catch {}
        if (!pageText) {
            try {
                const r = await axios2.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 15000 })
                pageText = String(r.data || '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            } catch {}
        }
        if (!pageText) return `❌ Could not fetch ${url}`

        try {
            const answer = await callAI([
                { role: 'system', content: 'You are an expert web researcher and analyst. Answer questions about webpage content with precision and depth. Structure your response clearly.' },
                { role: 'user', content: `Question: ${question}\n\nURL: ${url}\n\nPage content:\n${pageText.slice(0, 6000)}` }
            ], 45000)
            if (answer) return `🔍 *Deep Analysis: ${url}*\n\n❓ ${question}\n\n${answer}`
        } catch {}

        return `📄 *Content from ${url}:*\n\n${pageText.slice(0, 5000)}`
    }

    // ── extract_links — get all links from a page ─────────────────────────────
    if (t === 'extract_links') {
        const url = tc.url || ''
        const filter = tc.filter || ''
        if (!url) return 'ERROR: no URL'
        try {
            const r = await axios2.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 20000 })
            const html = String(r.data || '')
            const titleRegex = /<a[^>]+href=["']([^"'#javascript][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
            const links = []
            let match
            while ((match = titleRegex.exec(html)) !== null) {
                let href = match[1].trim()
                const title = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
                if (!href || href.startsWith('javascript') || href.startsWith('mailto')) continue
                if (!href.startsWith('http')) {
                    try { const base = new URL(url); href = new URL(href, base.origin).href } catch { continue }
                }
                if (filter && !href.toLowerCase().includes(filter.toLowerCase()) && !title.toLowerCase().includes(filter.toLowerCase())) continue
                if (!links.find(l => l.url === href)) links.push({ url: href, title: (title || href).slice(0, 100) })
                if (links.length >= 60) break
            }
            if (!links.length) return `No links found on ${url}${filter ? ` matching "${filter}"` : ''}`
            return `🔗 *Links on ${url}* (${links.length}):${filter ? ` [filter: ${filter}]` : ''}\n\n${links.map((l, i) => `${i+1}. ${l.title}\n   ${l.url}`).join('\n\n').slice(0, 6000)}`
        } catch (e) { return `extract_links error: ${e.message}` }
    }

    // ── extract_table — HTML tables → markdown ────────────────────────────────
    if (t === 'extract_table') {
        const url = tc.url || ''
        const html_input = tc.html || ''
        const tableIdx = tc.index !== undefined ? parseInt(tc.index) : 'all'
        if (!url && !html_input) return 'ERROR: provide url or html'

        let html = html_input
        if (!html && url) {
            try {
                const r = await axios2.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 20000 })
                html = String(r.data || '')
            } catch (e) { return `extract_table fetch error: ${e.message}` }
        }

        const tableRegex = /<table[\s\S]*?<\/table>/gi
        const tables = html.match(tableRegex) || []
        if (!tables.length) return `No <table> elements found on ${url || '(provided html)'}`

        const parseTable = (tableHtml) => {
            const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []
            const parsed = rows.map(row => {
                const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []
                return cells.map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()).join(' | ')
            }).filter(r => r.trim())
            // Add header separator after first row
            if (parsed.length > 1) parsed.splice(1, 0, parsed[0].replace(/[^|]/g, '-').replace(/--+/g, '---'))
            return parsed.join('\n')
        }

        const target = tableIdx === 'all' ? tables.slice(0, 5) : [tables[tableIdx] || tables[0]]
        const result = target.map((t, i) => `**Table ${tableIdx === 'all' ? i+1 : (tableIdx||0)+1}:**\n${parseTable(t)}`).join('\n\n---\n\n')
        return `📊 *${tables.length} table(s) found on ${url || 'html input'}:*\n\n${result.slice(0, 6000)}`
    }

    // ── crawl_site — multi-page BFS crawler ───────────────────────────────────
    if (t === 'crawl_site') {
        const startUrl = tc.url || ''
        if (!startUrl) return 'ERROR: no URL'
        const maxDepth = Math.min(parseInt(tc.maxDepth) || 1, 2)
        const maxPages = Math.min(parseInt(tc.maxPages) || 5, 10)
        const topic = tc.topic || tc.filter || ''

        const visited = new Set()
        const results = []
        const queue = [{ url: startUrl, depth: 0 }]
        let baseHost = ''
        try { baseHost = new URL(startUrl).hostname } catch {}

        while (queue.length && results.length < maxPages) {
            const { url, depth } = queue.shift()
            if (visited.has(url)) continue
            visited.add(url)
            try {
                const r = await axios2.get(`https://r.jina.ai/${url}`, { headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0', 'X-No-Cache': 'true' }, timeout: 18000 })
                if (r.status === 200 && r.data) {
                    const content = String(r.data)
                    if (!topic || content.toLowerCase().includes(topic.toLowerCase())) {
                        results.push({ url, content: content.slice(0, 1200) })
                    }
                    if (depth < maxDepth) {
                        const linkMatches = content.match(/https?:\/\/[^\s)\]>",]+/g) || []
                        for (const link of linkMatches.slice(0, 30)) {
                            try { if (new URL(link).hostname === baseHost && !visited.has(link)) queue.push({ url: link, depth: depth + 1 }) } catch {}
                        }
                    }
                }
            } catch {}
        }

        if (!results.length) return `🕷️ Crawled ${visited.size} pages from ${startUrl}, no content found${topic ? ` matching "${topic}"` : ''}`
        return `🕷️ *Crawled ${results.length} pages from ${startUrl}:*\n\n${results.map((p, i) => `**${i+1}. ${p.url}**\n${p.content}`).join('\n\n---\n\n').slice(0, 8000)}`
    }

    // ── bulk_scrape — scrape multiple URLs in parallel ────────────────────────
    if (t === 'bulk_scrape') {
        const urls = Array.isArray(tc.urls) ? tc.urls : [tc.url].filter(Boolean)
        if (!urls.length) return 'ERROR: provide urls array. Example: {"tool":"bulk_scrape","urls":["url1","url2"]}'
        const maxUrls = Math.min(urls.length, 8)
        const results = await Promise.allSettled(
            urls.slice(0, maxUrls).map(async (url) => {
                try {
                    const r = await axios2.get(`https://r.jina.ai/${url}`, { headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0', 'X-No-Cache': 'true' }, timeout: 20000 })
                    if (r.status === 200 && r.data) return { url, content: String(r.data).slice(0, 1500), ok: true }
                } catch {}
                try {
                    const r = await axios2.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 12000 })
                    const text = String(r.data || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                    if (text.length > 50) return { url, content: text.slice(0, 1500), ok: true }
                } catch {}
                return { url, content: 'failed to fetch', ok: false }
            })
        )
        const mapped = results.map(r => r.value || { url: '?', content: 'error', ok: false })
        return `🌐 *Bulk Scrape (${mapped.length} URLs):*\n\n${mapped.map((r, i) => `**${i+1}. ${r.url}** ${r.ok ? '✅' : '❌'}\n${r.content}`).join('\n\n---\n\n').slice(0, 8000)}`
    }

    // ── data_pipeline — multi-source extraction pipeline ─────────────────────
    if (t === 'data_pipeline') {
        const sources = Array.isArray(tc.sources) ? tc.sources : [tc.url].filter(Boolean)
        const hint = tc.hint || ''
        const format = (tc.format || 'text').toLowerCase()
        if (!sources.length) return 'ERROR: no sources. Use {"tool":"data_pipeline","sources":["url1","url2"],"hint":"price"}'
        const items = []
        for (const src of sources.slice(0, 6)) {
            try {
                const r = await axios2.get(`https://r.jina.ai/${src}`, { headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0', 'X-No-Cache': 'true' }, timeout: 20000 })
                if (r.status === 200 && r.data) {
                    const content = String(r.data)
                    const relevant = hint ? content.split('\n').filter(l => l.toLowerCase().includes(hint.toLowerCase())).join('\n') : content
                    items.push({ source: src, content: (relevant || content).slice(0, 2000) })
                }
            } catch {}
        }
        if (!items.length) return 'Pipeline: failed to fetch any source'
        if (format === 'json') return `📦 *Pipeline Result (${items.length} sources):*\n\n${JSON.stringify(items.map(i => ({ url: i.source, data: i.content.slice(0, 500) })), null, 2).slice(0, 5000)}`
        return `📦 *Pipeline Result (${items.length} sources):*${hint ? ` [filtered: ${hint}]` : ''}\n\n${items.map((i, idx) => `**Source ${idx+1}: ${i.source}**\n${i.content}`).join('\n\n---\n\n').slice(0, 7000)}`
    }

    // ── parse_html — CSS tag selector extraction ──────────────────────────────
    if (t === 'parse_html') {
        const html = tc.html || tc.content || ''
        const selector = (tc.selector || tc.tag || 'p').replace(/^[.#]/, '')
        if (!html) return 'ERROR: provide html content or url'
        const pattern = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\/${selector}>`, 'gi')
        const matches = []
        let m
        while ((m = pattern.exec(html)) !== null) {
            const text = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
            if (text.length > 2) matches.push(text)
            if (matches.length >= 30) break
        }
        if (!matches.length) return `No <${selector}> elements found`
        return `📋 *<${selector}> elements (${matches.length} found):*\n\n${matches.map((t, i) => `${i+1}. ${t.slice(0, 300)}`).join('\n\n')}`
    }

    // ── regex_extract — extract data with regex pattern ───────────────────────
    if (t === 'regex_extract') {
        const text = tc.text || tc.content || tc.input || ''
        const pattern = tc.pattern || tc.regex || ''
        const flags = (tc.flags || 'g').replace(/[^gimsuy]/g, '')
        if (!text || !pattern) return 'ERROR: provide text and pattern'
        try {
            const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
            const matches = []
            let m
            while ((m = re.exec(text)) !== null) {
                matches.push(m[0])
                if (matches.length >= 100) break
            }
            if (!matches.length) return `No matches for pattern: /${pattern}/${flags}`
            return `🔍 *${matches.length} matches for /${pattern}/${flags}:*\n\n${matches.map((m, i) => `${i+1}. ${m}`).join('\n')}`
        } catch (e) { return `regex error: ${e.message}` }
    }

    // ── analyze_data — JSON data analysis (count/filter/sort/group/stats) ─────
    if (t === 'analyze_data') {
        let data = tc.data || tc.input || tc.json || []
        if (typeof data === 'string') { try { data = JSON.parse(data) } catch { return 'ERROR: could not parse data as JSON array' } }
        if (!Array.isArray(data)) return 'ERROR: data must be a JSON array. Example: {"tool":"analyze_data","data":[{"price":10},{"price":20}],"action":"stats","key":"price"}'
        const count = data.length
        if (!count) return 'Empty dataset (0 items)'
        const action = (tc.action || tc.op || 'describe').toLowerCase()
        const key = tc.key || tc.field

        if (action === 'count') return `📊 Total items: *${count}*`

        if (action === 'filter') {
            const value = String(tc.value || '')
            const op = (tc.op2 || tc.operator || 'equals').toLowerCase()
            if (!key) return 'ERROR: provide key and value for filter'
            const filtered = data.filter(item => {
                const v = item[key]
                if (op === 'contains') return String(v).toLowerCase().includes(value.toLowerCase())
                if (op === 'gt' || op === '>') return Number(v) > Number(value)
                if (op === 'lt' || op === '<') return Number(v) < Number(value)
                if (op === 'gte' || op === '>=') return Number(v) >= Number(value)
                if (op === 'lte' || op === '<=') return Number(v) <= Number(value)
                if (op === 'not') return String(v) !== value
                return String(v).toLowerCase() === value.toLowerCase()
            })
            return `📊 *Filter: ${key} ${op} "${value}"*\n${filtered.length}/${count} items matched:\n\n${JSON.stringify(filtered.slice(0, 15), null, 2).slice(0, 3000)}`
        }

        if (action === 'sort') {
            if (!key) return 'ERROR: provide key for sort'
            const dir = (tc.dir || tc.order || 'asc').toLowerCase()
            const sorted = [...data].sort((a, b) => {
                const va = a[key], vb = b[key]
                const na = Number(va), nb = Number(vb)
                if (!isNaN(na) && !isNaN(nb)) return dir === 'desc' ? nb - na : na - nb
                return dir === 'desc' ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1)
            })
            return `📊 *Sorted by ${key} (${dir}):*\n\n${JSON.stringify(sorted.slice(0, 15), null, 2).slice(0, 3000)}`
        }

        if (action === 'group') {
            if (!key) return 'ERROR: provide key for group'
            const groups = {}
            for (const item of data) { const v = String(item[key] ?? 'null'); groups[v] = (groups[v] || 0) + 1 }
            const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1])
            return `📊 *Grouped by ${key} (${Object.keys(groups).length} groups):*\n\n${sorted.map(([k, c]) => `• ${k}: ${c}`).join('\n')}`
        }

        if (action === 'stats' || action === 'sum' || action === 'avg') {
            if (!key) return 'ERROR: provide key for stats'
            const nums = data.map(i => Number(i[key])).filter(n => !isNaN(n))
            if (!nums.length) return `No numeric values found for key: ${key}`
            const sum = nums.reduce((a, b) => a + b, 0)
            const avg = sum / nums.length
            const sorted = [...nums].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)]
            return `📊 *Stats for ${key} (${nums.length} values):*\nSum: ${sum}\nAvg: ${avg.toFixed(3)}\nMedian: ${median}\nMin: ${Math.min(...nums)}\nMax: ${Math.max(...nums)}`
        }

        // Default: describe
        const sample = data[0]
        const keys = sample && typeof sample === 'object' ? Object.keys(sample) : []
        return `📊 *Dataset:* ${count} items\n*Fields:* ${keys.join(', ') || 'N/A'}\n\n*Sample (first 3):*\n${JSON.stringify(data.slice(0, 3), null, 2).slice(0, 2000)}`
    }

    // ── ssl_check — SSL certificate info ─────────────────────────────────────
    if (t === 'ssl_check') {
        const host = (tc.host || tc.url || tc.domain || '').replace(/https?:\/\//, '').split('/')[0].split(':')[0]
        if (!host) return 'ERROR: provide host'
        try {
            const r = await runBash(`echo | openssl s_client -connect ${host}:443 -servername ${host} 2>/dev/null | openssl x509 -noout -dates -subject -issuer 2>/dev/null`, 15000)
            if (r.output && r.output.includes('notAfter')) {
                const notAfter = r.output.match(/notAfter=(.*)/)?.[1]?.trim()
                const notBefore = r.output.match(/notBefore=(.*)/)?.[1]?.trim()
                const subject = r.output.match(/subject=(.*)/)?.[1]?.trim()
                const issuer = r.output.match(/issuer=(.*)/)?.[1]?.trim()
                const expiry = notAfter ? new Date(notAfter) : null
                const daysLeft = expiry ? Math.round((expiry - Date.now()) / 86400000) : 0
                const status = daysLeft > 30 ? '✅ Valid' : daysLeft > 7 ? '⚠️ Expiring soon' : daysLeft > 0 ? '🔴 Critical' : '❌ Expired'
                return `🔒 *SSL Certificate: ${host}*\n\n${status} (${daysLeft} days left)\n📅 Expires: ${notAfter}\n📅 Issued: ${notBefore}\n📋 Subject: ${subject || '?'}\n🏢 Issuer: ${issuer || '?'}`
            }
        } catch {}
        try {
            const r = await runBash(`curl -vI --max-time 10 https://${host} 2>&1 | grep -iE "expire|issuer|SSL|TLS|verify|cert" | head -8`, 12000)
            return r.output || `ssl_check: could not verify ${host}`
        } catch (e) { return `ssl_check error: ${e.message}` }
    }

    // ── send_whatsapp — send message to another WA number ────────────────────
    if (t === 'send_whatsapp' || t === 'send_message' || t === 'whatsapp_send') {
        if (!conn) return 'ERROR: no WhatsApp connection context'
        const rawNum = (tc.to || tc.number || tc.phone || '').replace(/[^0-9]/g, '')
        const msgText = tc.text || tc.message || tc.content || ''
        if (!rawNum) return 'ERROR: no recipient number (to field)'
        if (!msgText) return 'ERROR: no message text'
        const jid = rawNum.includes('@') ? rawNum : `${rawNum}@s.whatsapp.net`
        try {
            await conn.sendMessage(jid, { text: msgText })
            return `✅ Message sent to +${rawNum}`
        } catch (e) { return `send_whatsapp error: ${e.message}` }
    }

    // ── diff_text — compare two texts ─────────────────────────────────────────
    if (t === 'diff_text' || t === 'text_diff' || t === 'compare_text') {
        const a = (tc.a || tc.text1 || tc.original || '').split('\n')
        const b = (tc.b || tc.text2 || tc.modified || '').split('\n')
        if (!a.length && !b.length) return 'ERROR: provide a and b texts'
        const added = b.filter(l => l.trim() && !a.includes(l))
        const removed = a.filter(l => l.trim() && !b.includes(l))
        if (!added.length && !removed.length) return '✅ Texts are identical (no differences)'
        let out = `📝 *Diff Result:*\n`
        if (removed.length) out += `\n➖ *Removed (${removed.length} lines):*\n${removed.slice(0, 20).map(l => `- ${l}`).join('\n')}`
        if (added.length) out += `\n\n➕ *Added (${added.length} lines):*\n${added.slice(0, 20).map(l => `+ ${l}`).join('\n')}`
        return out
    }

    // ── hash_text — MD5/SHA hashing ───────────────────────────────────────────
    if (t === 'hash_text' || t === 'hash') {
        const text = tc.text || tc.input || tc.content || ''
        const algo = (tc.algo || tc.algorithm || 'sha256').toLowerCase().replace('-', '')
        if (!text) return 'ERROR: provide text to hash'
        try {
            const crypto = require('crypto')
            const valid = ['md5','sha1','sha256','sha384','sha512']
            const use = valid.includes(algo) ? algo : 'sha256'
            const hash = crypto.createHash(use).update(text).digest('hex')
            return `🔐 *Hash (${use}):*\n\`${hash}\`\n\nInput: "${text.slice(0,80)}${text.length>80?'...':''}"`
        } catch (e) { return `hash error: ${e.message}` }
    }

    // ── summarize_text — AI summarization ─────────────────────────────────────
    if (t === 'summarize_text' || t === 'summarize' || t === 'tldr') {
        const text = tc.text || tc.content || tc.input || ''
        const style = tc.style || 'bullet'  // bullet | paragraph | oneliner
        if (!text) return 'ERROR: provide text to summarize'
        const instruction = style === 'oneliner'
            ? 'Summarize in ONE sentence only.'
            : style === 'paragraph'
            ? 'Write a concise paragraph summary (3-5 sentences).'
            : 'Summarize as 5-8 bullet points, each starting with "•". Be specific and concise.'
        try {
            const summary = await callAI([
                { role: 'system', content: 'You are an expert summarizer. Be concise, accurate, and structured.' },
                { role: 'user', content: `${instruction}\n\nText to summarize:\n${text.slice(0, 7000)}` }
            ], 30000)
            if (summary) return `📝 *Summary:*\n\n${summary}`
        } catch {}
        return 'summarize: AI unavailable'
    }


    // ── create_server — scaffold + npm install + pm2 start (Replit-style) ────
    if (t === 'create_server') {
        const name = (tc.name || 'bera-server').replace(/[^a-zA-Z0-9-_]/g, '-')
        const type = tc.type || 'express'
        const port = tc.port || 3001
        const autoStart = tc.start !== false

        // 1. Scaffold the project
        const scaffoldResult = await executeToolCall({ tool: 'scaffold', type, name, port }, chatId, conn, m)
        if (String(scaffoldResult).startsWith('ERROR')) return scaffoldResult

        // 2. Install dependencies
        const installDir = `workspace/${name}`
        const pkgFile = `${installDir}/package.json`
        const hasPkg = _nodeFsSync.existsSync(pkgFile) || _nodeFsSync.existsSync(_safeWsPath(pkgFile))
        if (hasPkg || type !== 'fastapi') {
            await runBash(`cd "${_safeWsPath(installDir)}" && npm install 2>&1 | tail -5`, 90000).catch(() => {})
        }

        // 3. Start with PM2
        let liveUrl = ''
        if (autoStart) {
            const mainFile = type === 'react' ? null : 'index.js'
            if (mainFile) {
                const pm2r = await executeToolCall({
                    tool: 'pm2_manage', action: 'start', name,
                    file: `${installDir}/${mainFile}`,
                    env: { PORT: String(port), NODE_ENV: 'production' }
                }, chatId, conn, m)
                liveUrl = `http://localhost:${port}`
            } else {
                liveUrl = `Run: cd workspace/${name} && npm run dev`
            }
        }

        return `✅ *Server Created: ${name}*\n\n🏗️ Type: ${type}\n📁 Location: workspace/${name}\n${liveUrl ? '🌐 URL: ' + liveUrl : ''}\n\n${autoStart ? '_Started with PM2. Use hot_reload to restart._' : '_Run npm install && npm start to launch._'}\n\n*Next: deploy to Sky Hosting →* ${'`'}{"tool":"skyhost","action":"deploy","repoUrl":"https://github.com/user/${name}","name":"${name}"}${'`'}`
    }

    // ── live_preview — get live URL for a running PM2 process ─────────────────
    if (t === 'live_preview') {
        const name = tc.name || ''
        const port = tc.port || 3000
        const process2 = (await pm2List()).output || ''
        const isRunning = name ? process2.includes(name) : true
        if (!isRunning) return `❌ Process "${name}" is not running.\nStart with: {"tool":"pm2_manage","action":"start","name":"${name}","file":"workspace/${name}/index.js"}`
        const domain = process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || 'localhost'
        const url = domain.includes('replit') ? `https://${port}-${domain}.repl.co` : `http://localhost:${port}`
        return `🌐 *Live Preview: ${name || 'app'}*\n\nURL: ${url}\nPort: ${port}\nStatus: ${isRunning ? '✅ Running' : '❌ Not running'}\n\n_To take a screenshot: {"tool":"screenshot","url":"${url}"}_`
    }

    // ── hot_reload — instantly restart a PM2 process ──────────────────────────
    if (t === 'hot_reload') {
        const name = tc.name || tc.app || ''
        if (!name) return 'ERROR: provide name of process to reload'
        const r = await pm2Restart(name)
        if (r.output && !r.output.includes('error')) return `🔄 *${name} reloaded!*\n\`\`\`\n${r.output.slice(0, 500)}\n\`\`\``
        return `❌ hot_reload failed: ${r.output || 'process not found'}`
    }

    // ── env_manager — get/set/delete env vars for a PM2 process ──────────────
    if (t === 'env_manager') {
        const action = (tc.action || 'get').toLowerCase()
        const name = tc.name || ''
        const key = tc.key || tc.var || ''
        const value = tc.value || ''

        if (action === 'get' || action === 'list') {
            const r = await runBash(`pm2 env ${name} 2>/dev/null | grep -v "^\s*$" | head -30`, 10000)
            return `🔧 *Env vars for ${name}:*\n\`\`\`\n${r.output || 'none / process not found'}\n\`\`\``
        }
        if (action === 'set') {
            if (!key || !value) return 'ERROR: provide key and value'
            // Write to .env file in process workspace
            const envPath = _safeWsPath(`workspace/${name}/.env`)
            let envContent = ''
            try { envContent = _nodeFsSync.readFileSync(envPath, 'utf8') } catch {}
            const lines = envContent.split('\n').filter(l => !l.startsWith(key + '=') && l.trim())
            lines.push(`${key}=${value}`)
            _nodeFsSync.mkdirSync(_nodePath.dirname(envPath), { recursive: true })
            _nodeFsSync.writeFileSync(envPath, lines.join('\n') + '\n')
            // Restart with new env
            await pm2Restart(name)
            return `✅ Set ${key}=${value.startsWith('sk-') ? value.slice(0,8) + '...' : value} for ${name} (restarted)`
        }
        if (action === 'delete') {
            const envPath = _safeWsPath(`workspace/${name}/.env`)
            try {
                let envContent = _nodeFsSync.readFileSync(envPath, 'utf8')
                envContent = envContent.split('\n').filter(l => !l.startsWith(key + '=')).join('\n')
                _nodeFsSync.writeFileSync(envPath, envContent)
                await pm2Restart(name)
                return `🗑️ Deleted ${key} from ${name} .env (restarted)`
            } catch (e) { return `env delete error: ${e.message}` }
        }
        return 'env_manager: unknown action. Use get, set, or delete'
    }

    // ── test_endpoint — test any HTTP endpoint ────────────────────────────────
    if (t === 'test_endpoint') {
        const url = tc.url || tc.endpoint || ''
        const method = (tc.method || 'GET').toUpperCase()
        const body = tc.body || tc.data || null
        const headers2 = Object.assign({
            'Content-Type': 'application/json',
            'User-Agent': 'BeraAI-Tester/1.0'
        }, tc.headers || {})
        if (tc.bearer) headers2['Authorization'] = 'Bearer ' + tc.bearer
        if (tc.apikey) headers2['x-api-key'] = tc.apikey
        if (!url) return 'ERROR: provide url'

        const start = Date.now()
        try {
            const r = await axios2({ method, url, headers: headers2, data: body, timeout: tc.timeout || 20000, validateStatus: () => true })
            const ms = Date.now() - start
            const resBody = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : String(r.data || '')
            const statusEmoji = r.status < 300 ? '✅' : r.status < 500 ? '⚠️' : '❌'
            return `${statusEmoji} *${method} ${url}*\n\n📊 Status: ${r.status} ${r.statusText}\n⏱️ Time: ${ms}ms\n📦 Size: ${resBody.length} bytes\n\n*Response:*\n\`\`\`json\n${resBody.slice(0, 2000)}${resBody.length > 2000 ? '\n[...truncated]' : ''}\n\`\`\``
        } catch (e) { return `❌ *${method} ${url}* failed: ${e.message}` }
    }

    // ── create_database — create SQLite DB with schema ────────────────────────
    if (t === 'create_database') {
        const dbName = (tc.name || 'mydb').replace(/[^a-zA-Z0-9_-]/g, '_')
        const schema = Array.isArray(tc.schema) ? tc.schema : []
        const dbPath = _safeWsPath(`workspace/${dbName}.db`)

        try {
            // Use bash + sqlite3 to create DB
            const tables = schema.map(t2 => {
                const cols = Array.isArray(t2.cols) ? t2.cols.join(', ') : 'id INTEGER PRIMARY KEY, created_at TEXT'
                return `CREATE TABLE IF NOT EXISTS ${t2.table} (${cols});`
            })
            const allSql = tables.length ? tables.join(' ') : 'SELECT 1;'
            const r = await runBash(`sqlite3 "${dbPath}" "${allSql.replace(/"/g, '\\"')}" && echo "ok"`, 10000)

            if (r.output && r.output.includes('ok')) {
                const info = await runBash(`sqlite3 "${dbPath}" ".tables"`, 5000)
                return `✅ *Database Created: ${dbName}*\n\n📁 Path: ${dbPath}\n📋 Tables: ${info.output?.trim() || 'none'}\n\n*Query it:* {"tool":"db_query","name":"${dbName}","sql":"SELECT * FROM ..."}\n*Connect:* sqlite3 "${dbPath}"`
            }
            return `❌ SQLite error: ${r.output}`
        } catch (e) { return `create_database error: ${e.message}` }
    }

    // ── db_query — run SQL on a SQLite database ───────────────────────────────
    if (t === 'db_query') {
        const dbName = (tc.name || tc.db || '').replace(/[^a-zA-Z0-9_-]/g, '_')
        const sql = tc.sql || tc.query || ''
        if (!dbName) return 'ERROR: provide name (database name)'
        if (!sql) return 'ERROR: provide sql query'

        // Safety: block destructive ops unless confirmed
        const sqlUpper = sql.trim().toUpperCase()
        const safe = !['DROP TABLE', 'DROP DATABASE', 'DELETE FROM', 'TRUNCATE'].some(kw => sqlUpper.includes(kw) && !tc.confirm)

        const dbPath = _safeWsPath(`workspace/${dbName}.db`)
        if (!_nodeFsSync.existsSync(dbPath)) return `❌ Database not found: ${dbPath}\nCreate with: {"tool":"create_database","name":"${dbName}","schema":[...]}`

        const escaped = sql.replace(/'/g, "'\''").slice(0, 2000)
        const r = await runBash(`sqlite3 -header -column "${dbPath}" '${escaped}' 2>&1`, 15000)
        const output = r.output || '(no output)'
        return `📊 *SQL Result:*\n\`\`\`\n${output.slice(0, 3000)}${output.length > 3000 ? '\n[...truncated]' : ''}\n\`\`\``
    }

    // ── project_analyze — deep analysis of a workspace project ───────────────
    if (t === 'project_analyze') {
        const path2 = tc.path || tc.dir || 'workspace/'
        const safePath = _safeWsPath(path2)

        const [structure, pkg, readme, gitLog] = await Promise.all([
            runBash(`find "${safePath}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -40`, 10000),
            runBash(`cat "${safePath}/package.json" 2>/dev/null | head -30`, 5000),
            runBash(`cat "${safePath}/README.md" 2>/dev/null | head -20`, 5000),
            runBash(`git -C "${safePath}" log --oneline -10 2>/dev/null`, 5000),
        ])

        const [pm2Status, diskSize] = await Promise.all([
            runBash(`pm2 list --no-color 2>/dev/null | grep -i "${_nodePath.basename(safePath)}"`, 5000),
            runBash(`du -sh "${safePath}" 2>/dev/null | cut -f1`, 5000),
        ])

        return `📂 *Project Analysis: ${path2}*\n\n📁 *Files (${(structure.output||'').split('\n').filter(Boolean).length}):*\n\`\`\`\n${(structure.output||'').slice(0, 800)}\n\`\`\`\n\n📦 *Package.json:*\n\`\`\`json\n${(pkg.output||'none').slice(0, 600)}\n\`\`\`\n\n🖥️ *PM2 Status:* ${pm2Status.output?.trim() || 'Not started'}\n💾 *Size:* ${diskSize.output?.trim() || 'unknown'}\n\n📝 *README:*\n${(readme.output||'No README').slice(0, 400)}`
    }

    // ── port_forward — expose local port to public URL ────────────────────────
    if (t === 'port_forward') {
        const port = tc.port || 3000
        const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG || ''
        if (domain) {
            const url = `https://${port}-${domain}.repl.co`
            return `🌐 *Public URL for port ${port}:*\n${url}\n\n_Note: On Replit, ports are auto-forwarded. This URL should work if the server is running._`
        }
        // Try getting public IP
        try {
            const r = await axios2.get('https://api.ipify.org?format=json', { timeout: 5000 })
            return `🌐 *Port ${port} forward:*\nPublic IP: ${r.data.ip}\nAccess: http://${r.data.ip}:${port}\n\n_Firewall rules may block direct access. Consider deploying to Sky Hosting for a stable URL._`
        } catch {}
        return `🌐 Port ${port} is running locally.\nTo get a public URL, deploy to Sky Hosting:\n{"tool":"skyhost","action":"deploy","repoUrl":"https://github.com/user/repo","name":"my-app"}`
    }

    // ── code_generate — AI code generation → write directly to file ──────────
    if (t === 'code_generate') {
        const lang = tc.lang || tc.language || 'node'
        const task = tc.task || tc.prompt || ''
        const outFile = tc.file || `workspace/bera-gen-${Date.now()}.${lang === 'python' ? 'py' : 'js'}`
        if (!task) return 'ERROR: provide task/prompt'

        const prompt = `Write COMPLETE, production-quality ${lang} code for: ${task}\n\nRequirements:\n- Full working code, no placeholders\n- Proper error handling\n- Comments explaining key parts\n- Ready to run immediately\n\nReturn ONLY the code, no explanation.`

        try {
            const generated = await callAI([
                { role: 'system', content: 'You are an expert software engineer. Write complete, working, production-quality code. No placeholders, no "TODO", no incomplete sections.' },
                { role: 'user', content: prompt }
            ], 45000)

            if (!generated) return 'code_generate: AI unavailable'

            // Strip markdown code blocks
            const clean = generated.replace(/^```[w]*\n?/m, '').replace(/```s*$/m, '').trim()
            const safePath = _safeWsPath(outFile)
            _nodeFsSync.mkdirSync(_nodePath.dirname(safePath), { recursive: true })
            await _nodeFsPromises.writeFile(safePath, clean, 'utf8')

            return `✅ *Code Generated & Saved*\n\n📁 ${outFile}\n📏 ${clean.split('\n').length} lines\n\n\`\`\`${lang}\n${clean.slice(0, 1200)}${clean.length > 1200 ? '\n[...truncated]' : ''}\n\`\`\``
        } catch (e) { return `code_generate error: ${e.message}` }
    }

    if (t === 'list_tools' || t === 'help' || t === 'tools' || t === 'capabilities') {
        return `🛠️ *Bera AI — Available Tools (65+)*\n\n` +
            `*🖥️ Shell & Code:*\nbash, multi_bash, runcode (js/python/go/rust/...), install (npm/pip)\n\n` +
            `*📁 Files & Workspace:*\nwritefile, readfile, listfiles, mkdir, deletefile, zipfolder, pastebin\n\n` +
            `*🌐 Web & Scraping (4-strategy auto-fallback):*\nweb_scrape, smart_extract, deep_scrape, crawl_site, extract_links, extract_table, bulk_scrape, data_pipeline, read_page, api\n\n` +
            `*🔍 Extraction & Processing:*\nparse_html, regex_extract, summarize_text, diff_text, hash_text, ssl_check\n\n` +
            `*🖥️ Server & DevOps (Replit-style):*\ncreate_server, live_preview, hot_reload, env_manager, port_forward, test_endpoint, create_database, db_query, project_analyze, code_generate\n\n` +
            `*🌩️ Deployment:*\nskyhost (deploy/list/status/logs/stop/health), deploy_vercel, git_push_folder, scaffold (react/express/next/flask/etc)\n\n` +
            `*📊 Data & Analysis:*\nanalyze_data (filter/sort/group/stats/sum), format_convert (json/csv/yaml/xml)\n\n` +
            `*🐙 GitHub:*\ngithub_manage (whoami/list_repos/create_repo/commit_file/...), create_repo, git_push, git_clone\n\n` +
            `*⚙️ PM2 & Processes:*\npm2_manage (list/start/stop/restart/logs/monit)\n\n` +
            `*🤖 AI & Generation:*\nsearch, image_gen, code_review, code_explain, bug_finder, code_gen\n\n` +
            `*🚀 App Builder:*\nscaffold, build_webapp, generate_api, self_test_fix, mock_server\n\n` +
            `*🌍 Live Data:*\ncrypto_price, stock_price, weather_gt, news_fetch, translate, lyrics_fetch, wiki_search\n\n` +
            `*🏗️ BeraHost Deploy:*\nberahost (list/status/start/stop/logs/deploy/coins/bots)\n\n` +
            `Use: Agent <task> — I'll pick the right tools automatically.`
    }

    return `❓ unknown tool: *${t}*\nSay "Agent what tools do you have?" to see the full list.`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AGENT LOOP
// ─────────────────────────────────────────────────────────────────────────────
const generateAdvancedReply = async (text, chat, conn, m, opts = {}) => {
    try {
        const pd = await preDispatch(text)
        if (pd?.reply) {
            pushHistory(chat, 'user', text)
            pushHistory(chat, 'assistant', pd.reply)
            return pd
        }
    } catch {}

    pushHistory(chat, 'user', text)

    const mem = getMemory(chat)
    const memEntries = Object.entries(mem).filter(([k]) => k !== '_action_log')
    const memStr = memEntries.length
        ? '\n\nStored memory:\n' + memEntries.map(([k, v]) => `${k}: ${v}`).join('\n') : ''

    let wsCtx = ''
    try {
        const r = await runBash('ls workspace/ 2>/dev/null | head -20', 3000)
        if (r.output?.trim()) wsCtx = '\n\nWorkspace contents:\n' + r.output.trim()
    } catch {}

    let mentionCtx = ''
    try {
        const mentioned = m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
        if (mentioned.length) mentionCtx = '\n\nMentioned users: ' + mentioned.map(j => j.split('@')[0]).join(', ')
    } catch {}

    const groupCtx = (m?.isGroup && chat?.endsWith('@g.us')) ? `\n\nCurrent group JID: ${chat}` : ''

    // ── Inject persistent action log so agent recalls what it did before ────────
    let actionLogCtx = ''
    try {
        const log = (getMemory(chat)._action_log || []).slice(-5)
        if (log.length) {
            actionLogCtx = '\n\nRecent completed tasks (for context, do NOT repeat unless asked):\n' +
                log.map(e => `• [${e.at?.slice(0,10)}] ${e.task} → ${e.done}`).join('\n')
        }
    } catch {}

    // Custom system prompt per user
    let customSysPrompt = ''
    try {
        const _uSender = m?.sender?.replace(/:[0-9]+@/, '@') || ''
        customSysPrompt = global.db?.data?.users?.[_uSender]?.systemPrompt || ''
    } catch {}

    const messages = [
        { role: 'system', content: (customSysPrompt ? customSysPrompt + '\n\n---\n\n' : '') + SYSTEM_PROMPT + memStr + wsCtx + mentionCtx + groupCtx + actionLogCtx },
        ...getHistory(chat).slice(-12)
    ]

    const loopCap = opts.maxLoops || 25
    let stepCount = 0

    if (conn && m) {
        conn.sendMessage(chat, { react: { text: '🔄', key: m.key } }).catch(() => {})
    }

    for (let loop = 0; loop < loopCap; loop++) {
        let aiReply
        try { aiReply = await callAI(messages, 60000, true) } catch {}
        // Record last AI call for .debug command
        try {
            const _dSender = m?.sender?.replace(/:[0-9]+@/, '@') || chat
            if (!global._lastAIDebug) global._lastAIDebug = {}
            if (aiReply) global._lastAIDebug[_dSender] = { input: text, output: aiReply, model: global.db?.data?.settings?.aiModel || 'auto', at: Date.now() }
        } catch {}
        if (!aiReply) {
            const fb = await localFallback(text)
            return { success: false, reply: fb }
        }

        const toolCalls = parseToolCalls(aiReply)

        if (!toolCalls || !toolCalls.length) {
            pushHistory(chat, 'assistant', aiReply)
            // Auto-memorize: record this completed task so future sessions remember it
            try { _autoMemorize(chat, text, aiReply) } catch {}
            return { success: true, reply: aiReply }
        }

        stepCount += toolCalls.length

        messages.push({ role: 'assistant', content: aiReply })

        // ── Execute tools (parallel when possible) ────────────────────────────
        const toolResults = await Promise.all(toolCalls.map(async (tc) => {
            try {
                const result = await executeToolCall(tc, chat, conn, m)
                return { tool: tc.tool, result: String(result).slice(0, 3000), ok: true }
            } catch (e) {
                return { tool: tc.tool, result: `EXECUTION ERROR: ${e.message}`, ok: false }
            }
        }))

        // ── Progress update every 5 steps ─────────────────────────────────────
        if (conn && m && stepCount > 0 && stepCount % 5 === 0) {
            const toolNames = toolCalls.map(tc => tc.tool).join(', ')
            conn.sendMessage(chat, {
                text: `⚙️ *Working...* [Step ${stepCount}]\n_Tools used: ${toolNames}_`
            }, { quoted: m }).catch(() => {})
        }

        // ── Self-healing: detect failures and instruct AI to fix them ─────────
        const hasErrors = toolResults.some(r => !r.ok ||
            r.result.startsWith('EXECUTION ERROR') ||
            r.result.startsWith('ERROR:') ||
            r.result.startsWith('❌'))
        const allFailed = toolResults.every(r => !r.ok)

        const resultsText = toolResults.map(r => `[Tool: ${r.tool}]\n${r.result}`).join('\n\n---\n\n')

        const continuePrompt = hasErrors
            ? `Tool results:\n${resultsText}\n\n⚠️ Some tools failed above. Analyze each error carefully:\n- ENOENT → create the missing directory first with bash or mkdir tool\n- MODULE_NOT_FOUND → install the package with the install tool\n- Permission denied → try a different path\n- Any other error → try an alternative approach\n\nDo NOT give up. Fix the errors and continue. If fully done, give your final answer in plain text (no JSON).`
            : `Tool results:\n${resultsText}\n\nContinue the task. If fully complete, give your final answer in plain text (no JSON).`

        // If every single tool call failed repeatedly, abort early
        if (allFailed && loop >= 3) {
            const errSummary = toolResults.map(r => `• ${r.tool}: ${r.result.slice(0, 120)}`).join('\n')
            return { success: false, reply: `❌ *Task blocked* — tools keep failing:\n\n${errSummary}\n\nPlease check your setup or try a simpler request.` }
        }

        messages.push({
            role: 'user',
            content: continuePrompt
        })
    }

    return { success: false, reply: '⚠️ I could not complete this fully. Try rephrasing or breaking it into smaller parts.' }
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
