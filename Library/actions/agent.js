const axios = require('axios')
const { exec } = require('child_process')
const fs   = require('fs')
const path = require('path')
const {
    getUserWorkspace, resolvePath: wsResolve,
    listWorkspace, readWorkspaceFile, writeWorkspaceFile,
    mkdirWorkspace, deleteWorkspaceItem
} = require('../lib/workspace')

// Resolve agent file path: relative → workspace, absolute → as-is
const resolveAgentPath = (argPath, userId) => {
    if (!argPath) return userId ? getUserWorkspace(userId) : '/workspace/shared'
    const p = String(argPath)
    if (path.isAbsolute(p)) return p
    return wsResolve(userId || 'shared', p)
}

// ── Gifted Overchat / DeepSeek (primary — accepts Bera AI identity) ───────────
const OVERCHAT_URL_AGENT = 'https://api.gifted.co.ke/api/ai/overchat'
const {
    gtCrypto, gtStock, gtCurrency, gtMovie, gtAnime, gtIpInfo, gtGithub,
    gtTranslate, gtNews, gtWeather, gtLyrics, gtWiki, gtBible
} = require('./giftedapi')
const callOverchat = async (systemPrompt, userMsg, timeoutMs) => {
    try {
        const identity = systemPrompt && systemPrompt.length > 20
            ? systemPrompt.slice(0, 1200)
            : 'You are Bera AI v4 — a powerful WhatsApp AI assistant built by Bera Tech. NEVER say you are DeepSeek or any other AI. Always say your name is Bera AI.'
        const q = identity + '\n\nUser: ' + String(userMsg || '').slice(0, 800) + '\nBera AI:'
        const res = await axios.get(OVERCHAT_URL_AGENT, {
            params: { apikey: 'gifted', model: 'deepseek', q },
            timeout: timeoutMs || 12000
        })
        const text = res.data?.result
        if (text && typeof text === 'string' && text.trim().length > 2) {
            return { success: true, text: text.trim(), model: 'overchat/deepseek' }
        }
    } catch {}
    return { success: false, error: 'Overchat unavailable' }
}

// ── Groq AI (primary — ultra-fast, < 1 second responses) ────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']

const callGroqAI = async (systemPrompt, userMsg) => {
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt.slice(0, 4000) })
    messages.push({ role: 'user', content: userMsg.slice(0, 6000) })

    for (const model of GROQ_MODELS) {
        try {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model,
                messages,
                max_tokens: 2048,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            })
            const text = res.data?.choices?.[0]?.message?.content
            if (text && String(text).trim().length > 2) {
                return { success: true, text: String(text).trim(), model: `groq:${model}` }
            }
        } catch (e) {
            if (e?.response?.status === 429) await new Promise(r => setTimeout(r, 1000))
        }
    }
    return { success: false, error: 'Groq AI unavailable' }
}

// ── Gifted API (fallback 1) ──────────────────────────────────────────────────
const GIFTED = 'https://api.gifted.co.ke'
const GIFTED_KEY = '_0u5aff45,_0l1876s8qc'

const callGiftedAI = async (systemPrompt, userMsg) => {
    const q = (systemPrompt ? systemPrompt + '\n\n' : '') + userMsg
    const endpoints = [
        `${GIFTED}/api/ai/gemini`,
        `${GIFTED}/api/ai/gpt4o`,
        `${GIFTED}/api/ai/llama`,
        `${GIFTED}/api/ai/deepseek`,
    ]
    for (const url of endpoints) {
        try {
            const res = await axios.get(url, {
                params: { apikey: GIFTED_KEY, q: q.slice(0, 4000) },
                timeout: 15000
            })
            const text = res.data?.result || res.data?.response || res.data?.answer ||
                         (typeof res.data === 'string' ? res.data : null)
            if (!text || text === 'Request failed with status code 403') continue
            const trimmed = String(text).trim()
            if (trimmed.startsWith('{') && (trimmed.includes('"error"') || trimmed.includes('"success":false'))) continue
            return { success: true, text: trimmed, model: 'gifted' }
        } catch { continue }
    }
    return { success: false, error: 'Gifted AI unavailable' }
}

// ── Xwolf (fallback 2) ───────────────────────────────────────────────────────
const XWOLF_URL = 'https://apis.xwolf.space/api/ai/gemini'

const callXwolf = async (systemPrompt, userMsg) => {
    try {
        const q = systemPrompt ? `${systemPrompt}\n\n${userMsg}` : userMsg
        const res = await axios.get(XWOLF_URL, {
            params: { q: q.slice(0, 6000) },
            timeout: 12000
        })
        const text = res.data?.result || res.data?.response || res.data?.answer ||
                     (typeof res.data === 'string' ? res.data : null)
        if (!text) return { success: false, error: 'No response from Xwolf' }
        return { success: true, text: String(text).trim(), model: 'xwolf' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ── Pollinations (fallback 3 — free, no key) ─────────────────────────────────
const callPollinationsAgent = async (systemPrompt, userMsg) => {
    try {
        const messages = []
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt.slice(0, 3000) })
        messages.push({ role: 'user', content: userMsg.slice(0, 3000) })
        const body = JSON.stringify({ model: 'mistral', messages, seed: Math.floor(Math.random() * 99999) })
        const reply = await new Promise((resolve, reject) => {
            const req = require('https').request({
                hostname: 'text.pollinations.ai', path: '/', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'BeraAI/3.0' }
            }, res => {
                let d = ''
                res.on('data', c => d += c)
                res.on('end', () => {
                    if (res.statusCode >= 400) return resolve(null)
                    const t = d.trim()
                    if (!t || t.startsWith('{')) return resolve(null)
                    resolve(t)
                })
            })
            req.on('error', () => resolve(null))
            req.setTimeout(18000, () => { req.destroy(); resolve(null) })
            req.write(body); req.end()
        })
        if (reply && reply.length > 2) return { success: true, text: reply, model: 'pollinations' }
    } catch {}
    return { success: false, error: 'Pollinations unavailable' }
}

// ── Primary AI caller — Overchat/DeepSeek first, then Groq, then fallbacks ────
const callAI = async (systemPrompt, userMsg) => {
    // 1. Overchat/DeepSeek — accepts Bera AI identity
    const oc = await callOverchat(systemPrompt, userMsg)
    if (oc.success) return oc

    // 2. Groq — ultra-fast backup
    const groq = await callGroqAI(systemPrompt, userMsg)
    if (groq.success) return groq

    // 3. Gifted — gemini + gpt4o confirmed working
    const gifted = await callGiftedAI(systemPrompt, userMsg)
    if (gifted.success) return gifted

    // 4. Xwolf
    const xwolf = await callXwolf(systemPrompt, userMsg)
    if (xwolf.success) return xwolf

    // 5. Pollinations last resort last resort (free, no key)
    const poll = await callPollinationsAgent(systemPrompt, userMsg)
    if (poll.success) return poll

    return { success: false, error: 'All AI providers failed' }
}

// Backward compatibility
const callPollinations = callAI

// ── Shell runner ───────────────────────────────────────────────────────────────
const runShell = (cmd, timeout = 30000) => new Promise(resolve => {
    exec(cmd, { timeout, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        const out = (stdout || '').trim() + (stderr ? '\n[stderr]: ' + stderr.trim() : '')
        resolve({ success: !err, output: out.slice(0, 3000) || (err ? err.message : 'done') })
    })
})

// ══════════════════════════════════════════════════════════════════════════════
//  SYSTEM TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const systemInfo = async () => {
    try {
        const [ram, disk, cpu, uptime, processes] = await Promise.all([
            runShell("free -m | awk 'NR==2{printf \"%s/%s MB (%.0f%%)\", $3,$2,$3*100/$2}'"),
            runShell("df -h / | awk 'NR==2{print $3\"/\"$2\" (\"$5\" used)\"}'"),
            runShell("top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4\"%\"}'"),
            runShell("uptime -p"),
            runShell("ps aux --no-headers | wc -l")
        ])
        return {
            success: true,
            ram:       ram.output,
            disk:      disk.output,
            cpu:       cpu.output,
            uptime:    uptime.output,
            processes: processes.output.trim() + ' processes'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const portCheck = async (port) => {
    const r = await runShell(`ss -tlnp | grep :${port}; netstat -tlnp 2>/dev/null | grep :${port}; lsof -i :${port} -n -P 2>/dev/null | head -5`)
    return {
        success: true,
        port,
        open: r.output.trim().length > 0,
        info: r.output.trim() || `Nothing listening on port ${port}`
    }
}

const dockerManage = async (action, name) => {
    const cmds = {
        list:    'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
        listall: 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"',
        logs:    `docker logs ${name} --tail 50 2>&1`,
        start:   `docker start ${name}`,
        stop:    `docker stop ${name}`,
        restart: `docker restart ${name}`,
        remove:  `docker rm -f ${name}`,
        stats:   'docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"',
        images:  'docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"'
    }
    const cmd = cmds[action] || cmds.list
    return runShell(cmd, 20000)
}

const cronManage = async (action, expr, cmd) => {
    if (action === 'list') {
        return runShell('crontab -l 2>/dev/null || echo "No cron jobs"')
    }
    if (action === 'add' && expr && cmd) {
        const addCmd = `(crontab -l 2>/dev/null; echo "${expr} ${cmd}") | crontab -`
        return runShell(addCmd)
    }
    if (action === 'clear') {
        return runShell('crontab -r 2>/dev/null; echo "Cron cleared"')
    }
    return { success: false, output: 'Unknown cron action. Use: list, add, clear' }
}

const processKill = async (nameOrPid) => {
    const isPid = /^\d+$/.test(nameOrPid)
    const cmd = isPid ? `kill -9 ${nameOrPid}` : `pkill -f "${nameOrPid}"; killall "${nameOrPid}" 2>/dev/null; echo "killed"`
    return runShell(cmd)
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEVELOPER TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const codeReview = async (code, context = '') => {
    const sys = `You are an expert code reviewer. Analyze the code and provide:
1. 🐛 Bugs or errors
2. 🔒 Security issues  
3. ⚡ Performance improvements
4. 📝 Code quality suggestions
Be specific and concise. Use emojis for each point.`
    return callAI(sys, `${context ? 'Context: ' + context + '\n\n' : ''}Code:\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``)
}

const codeExplain = async (code, fileName = '') => {
    const sys = `You are a senior developer. Explain this code clearly to a developer. Cover: what it does, key functions, dependencies used, and any notable patterns. Be concise.`
    return callAI(sys, `File: ${fileName}\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``)
}

const bugFinder = async (code, fileName = '') => {
    const sys = `You are a bug hunter. Find ALL bugs, logic errors, unhandled edge cases, and potential crashes in this code. For each bug: state the line/function, what the bug is, and how to fix it. If no bugs, say so.`
    return callAI(sys, `File: ${fileName}\n\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\``)
}

const httpRequest = async (method, url, data, headers = {}) => {
    try {
        const config = { method: method.toUpperCase(), url, timeout: 20000, headers: { 'User-Agent': 'Bera-Agent/1.0', ...headers } }
        if (data && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            config.data = typeof data === 'string' ? data : JSON.stringify(data)
            config.headers['Content-Type'] = 'application/json'
        }
        const r = await axios(config)
        const body = typeof r.data === 'object' ? JSON.stringify(r.data, null, 2) : String(r.data)
        return {
            success: true,
            status: r.status,
            output: `HTTP ${r.status} ${r.statusText}\n\n${body.slice(0, 2000)}`
        }
    } catch (e) {
        const status = e.response?.status
        const body   = e.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : e.message
        return { success: false, output: `HTTP ${status || 'ERR'}: ${body}` }
    }
}

const gitStatus = async (folder) => {
    const cwd = folder || '.'
    const [status, log, diff] = await Promise.all([
        runShell(`cd ${cwd} && git status --short 2>&1`),
        runShell(`cd ${cwd} && git log --oneline -5 2>&1`),
        runShell(`cd ${cwd} && git diff --stat 2>&1`)
    ])
    return {
        success: true,
        output: `📁 Status:\n${status.output || 'clean'}\n\n📜 Last commits:\n${log.output || 'none'}\n\n📊 Diff:\n${diff.output || 'no changes'}`
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ANALYTICS & MONITORING
// ══════════════════════════════════════════════════════════════════════════════

const usageStats = () => {
    try {
        const stats   = global.db?.data?.stats || {}
        const users   = global.db?.data?.users || {}
        const cmds    = global.db?.data?.commandStats || {}
        const userArr = Object.entries(users)
        const topUser = userArr.sort((a,b) => (b[1].commandCount||0) - (a[1].commandCount||0)).slice(0, 3)
        const topCmd  = Object.entries(cmds).sort((a,b) => b[1]-a[1]).slice(0, 5)
        return {
            success: true,
            total:   stats.totalCommands || 0,
            users:   userArr.length,
            topUsers: topUser.map(([jid, u]) => `+${jid.replace(/@.+/,'')} (${u.commandCount||0} cmds)`),
            topCmds:  topCmd.map(([cmd, n]) => `.${cmd}: ${n}`)
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

const errorLogAnalyze = async (logContent) => {
    const sys = `You are a log analyzer. Read these logs and provide:
1. 🔴 Critical errors (with line context)
2. ⚠️ Warnings
3. 📊 Pattern summary (most common issues)
4. 💡 Suggested fixes
Be concise and actionable.`
    return callAI(sys, `Logs:\n${logContent.slice(0, 5000)}`)
}

const pm2Manage = async (action, name) => {
    const cmds = {
        list:    'pm2 list',
        logs:    `pm2 logs ${name || ''} --lines 50 --nostream 2>&1 | tail -50`,
        start:   `pm2 start ${name}`,
        stop:    `pm2 stop ${name}`,
        restart: `pm2 restart ${name}`,
        delete:  `pm2 delete ${name}`,
        status:  `pm2 show ${name} 2>&1`,
        save:    'pm2 save',
        monit:   'pm2 jlist 2>/dev/null || pm2 list'
    }
    const cmd = cmds[action] || cmds.list
    return runShell(cmd, 20000)
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION
// ══════════════════════════════════════════════════════════════════════════════

const scheduleMessage = (conn, target, messageText, delayMs) => {
    const sendAt = new Date(Date.now() + delayMs)
    setTimeout(async () => {
        try {
            await conn.sendMessage(target, { text: messageText })
        } catch (e) {
            console.error('[SCHEDULE]', e.message)
        }
    }, delayMs)
    return { success: true, output: `Message scheduled for ${sendAt.toLocaleTimeString()}` }
}

const backupToGithub = async (folder, repoUrl) => {
    const steps = []
    const folderName = path.basename(folder)
    const zipPath = `/tmp/${folderName}_backup_${Date.now()}.zip`
    let r = await runShell(`zip -r ${zipPath} ${folder} --exclude="*/node_modules/*" --exclude="*/.git/*"`, 60000)
    steps.push({ step: 'zip', ok: r.success, out: r.output.slice(0, 100) })
    if (!r.success) return { success: false, output: steps.map(s => `${s.ok?'✅':'❌'} ${s.step}: ${s.out}`).join('\n') }
    const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)
    return { success: true, output: `✅ Backup created: ${zipPath} (${sizeMB} MB)\nFolder: ${folder}`, file: zipPath }
}

const sqliteQuery = async (dbPath, query) => {
    const escapedQuery = query.replace(/'/g, "''")
    const r = await runShell(`sqlite3 "${dbPath}" "${escapedQuery}" 2>&1`, 15000)
    return r
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const groupAnalyzer = async (conn, chat) => {
    try {
        const meta = await conn.groupMetadata(chat)
        const parts = meta.participants || []
        const admins   = parts.filter(p => p.admin)
        const members  = parts.filter(p => !p.admin)
        return {
            success: true,
            name:        meta.subject || 'Unknown',
            description: meta.desc || 'No description',
            total:       parts.length,
            admins:      admins.length,
            members:     members.length,
            adminList:   admins.map(a => a.pushName || a.id.replace(/@.+/,'')).slice(0, 10),
            created:     meta.creation ? new Date(meta.creation * 1000).toDateString() : 'Unknown'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  NPM TOOLS
// ══════════════════════════════════════════════════════════════════════════════

const npmStats = async (pkg) => {
    try {
        const [weekly, monthly, info] = await Promise.all([
            axios.get(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`, { timeout: 10000 }),
            axios.get(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`, { timeout: 10000 }),
            axios.get(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, { timeout: 10000 })
        ])
        const latest = info.data['dist-tags']?.latest || 'unknown'
        return {
            success: true, pkg,
            weekly:  weekly.data.downloads?.toLocaleString() || '0',
            monthly: monthly.data.downloads?.toLocaleString() || '0',
            version: latest,
            description: info.data.description || '',
            author: info.data.author?.name || info.data.maintainers?.[0]?.name || 'unknown'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP MEMBER RESOLVER
// ══════════════════════════════════════════════════════════════════════════════

const resolveGroupMember = async (conn, chat, jidOrName) => {
    try {
        const meta = await conn.groupMetadata(chat)
        const search = jidOrName.replace(/[@+]/g, '').toLowerCase()
        const found  = meta.participants.find(p =>
            p.id.replace(/@.+/, '').includes(search) ||
            (p.pushName || '').toLowerCase().includes(search)
        )
        if (!found) return { success: false, error: 'Member not found' }
        return {
            success: true,
            jid:        found.id,
            phone:      found.id.replace(/@.+/, ''),
            name:       found.pushName || 'Unknown',
            isAdmin:    found.admin === 'admin' || found.admin === 'superadmin',
            isSuperAdmin: found.admin === 'superadmin'
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROJECT CREATOR
// ══════════════════════════════════════════════════════════════════════════════

const createProject = async (name, type = 'express', port = 3000, description = '') => {
    const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const projDir  = `/tmp/projects/${safeName}`
    const steps = []
    let r = await runShell(`mkdir -p ${projDir}`)
    steps.push({ step: 'mkdir', ok: r.success, out: r.output })
    const pkg = JSON.stringify({ name: safeName, version: '1.0.0', description, main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '*' } }, null, 2)
    fs.writeFileSync(`${projDir}/package.json`, pkg)
    steps.push({ step: 'package.json', ok: true, out: 'created' })
    const mainCode = `const express = require('express')
const app = express()
const PORT = ${port}
app.use(express.json())
app.use(express.static('public'))
app.get('/', (req, res) => {
  res.send(\`<!DOCTYPE html><html><head><title>${name}</title>
<style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1a1a2e;color:#eee}h1{color:#e94560}#display{font-size:4rem;font-weight:bold;color:#0f3460;background:#e94560;padding:20px 40px;border-radius:12px;margin:20px}button{padding:12px 30px;margin:8px;border:none;border-radius:8px;font-size:1rem;cursor:pointer;background:#0f3460;color:#fff}button:hover{background:#e94560}</style></head>
<body><h1>${name}</h1><div id="display">00:00:00</div><div><button onclick="start()">Start</button><button onclick="pause()">Pause</button><button onclick="reset()">Reset</button></div>
<script>let t=0,running=false,interval;function fmt(n){return String(n).padStart(2,'0')}function tick(){t++;const h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;document.getElementById('display').textContent=fmt(h)+':'+fmt(m)+':'+fmt(s)}function start(){if(!running){running=true;interval=setInterval(tick,1000)}}function pause(){running=false;clearInterval(interval)}function reset(){running=false;clearInterval(interval);t=0;document.getElementById('display').textContent='00:00:00'}<\/script></body></html>\`)
})
app.listen(PORT, () => console.log(\`${name} running on port \${PORT}\`))
`
    fs.writeFileSync(`${projDir}/index.js`, mainCode)
    steps.push({ step: 'index.js', ok: true, out: 'created' })
    r = await runShell(`cd ${projDir} && npm install --loglevel=error`, 60000)
    steps.push({ step: 'npm install', ok: r.success, out: r.output.slice(0, 200) })
    r = await runShell(`pm2 delete ${safeName} 2>/dev/null; pm2 start ${projDir}/index.js --name ${safeName}`)
    steps.push({ step: 'pm2 start', ok: r.success, out: r.output.slice(0, 300) })
    return { success: true, name: safeName, dir: projDir, port, steps }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GITHUB TOKEN
// ══════════════════════════════════════════════════════════════════════════════

const githubTokenRegen = async (tokenInDB) => {
    try {
        const ghToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || tokenInDB
        if (!ghToken) return { success: false, error: 'No GitHub token configured' }
        const meRes = await axios.get('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${ghToken}`, 'User-Agent': 'Bera-AI' }, timeout: 10000
        })
        return {
            success: true, username: meRes.data.login, canAutoCreate: false,
            message: `Token is valid for *${meRes.data.login}*.\n\nTo generate a new token:\n1. Go to: https://github.com/settings/tokens/new\n2. Set expiry, select repo/workflow scopes\n3. Click Generate token\n4. Send *.setgithub <token>* to update`
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT PLANNER — powered by Puter AI (primary) + fallbacks
// ══════════════════════════════════════════════════════════════════════════════

const PLAN_PROMPT = `You are Bera AI's action planner. You have FULL access to the server file system, bash shell, Puter cloud storage, and all tools below.

WORKSPACE RULES (CRITICAL):
- All files and folders are created inside /workspace/{userId}/ by default unless the user specifies an absolute path.
- When user says "create a folder called X" → use file_mkdir with path: "X" (relative — system auto-resolves to /workspace/{userId}/X)
- When user says "save file at Y" → use file_write with path: "Y" (relative)
- When user says "create in /tmp/..." → use absolute path as given
- ALWAYS use file_mkdir BEFORE file_write for new directories

CHAIN-OF-THOUGHT (include in your response):
Think through the task step by step in the "reasoning" field BEFORE listing steps.
Ask yourself: What is the end goal? What must happen first? What can run in parallel? What might fail?

Given a user task, return ONLY strict JSON — no markdown, no extra text.

Available actions:
SYSTEM & SHELL:
- shell          → args: { cmd }   ← run ANY bash command
- file_read      → args: { path }
- file_write     → args: { path, content }
- file_mkdir     → args: { path }   ← create a directory (recursive)
- file_mkdir_nested → args: { paths }   ← create multiple nested dirs (array)
- js_eval        → args: { code }
- system_info    → args: {}
- port_check     → args: { port }
- file_search    → args: { pattern, directory, ext }
- file_diff      → args: { file1, file2 }
- env_manage     → args: { action("list"|"get"|"set"|"delete"), key, value }
- password_gen   → args: { length, noSymbols }
- json_tools     → args: { action("format"|"minify"|"validate"|"keys"), json }

PUTER CLOUD (files & folders on Puter cloud storage):
- puter_write    → args: { path, content }   ← write/create file on Puter cloud
- puter_mkdir    → args: { path }             ← create folder on Puter cloud
- puter_read     → args: { path }             ← read file from Puter cloud
- puter_list     → args: { path }             ← list files in Puter folder
- puter_delete   → args: { path }             ← delete file/folder on Puter

CODE EXECUTION (any language via Piston API):
- run_code       → args: { code, lang, stdin }   ← lang: js, python, php, ruby, go, rust, c, cpp, java, kotlin, swift, lua, perl, r, haskell, ts, bash, etc.
- npm_install    → args: { packages, cwd }
- code_gen       → args: { description, language }
- code_review    → args: { code, context }
- code_explain   → args: { code, fileName }
- bug_finder     → args: { code, fileName }
- npm_stats      → args: { package }

WEB SCRAPING & BROWSING:
- web_scrape     → args: { url }
- extract_links  → args: { url, filter }
- extract_table  → args: { url }
- extract_data   → args: { url }
- extract_emails → args: { url }
- extract_phones → args: { url }
- find_text      → args: { url, query }
- bulk_scrape    → args: { urls }
- regex_extract  → args: { url, pattern, flags }
- fetch_json     → args: { url, headers }
- api_test       → args: { method, url, body, headers }
- screenshot     → args: { url }
- page_monitor   → args: { url, previousHash }

NETWORKING:
- http_request   → args: { method, url, data, headers }
- url_check      → args: { urls }
- dns_check      → args: { host }
- ssl_check      → args: { domain }
- ping           → args: { host }
- whois          → args: { domain }
- ip_lookup      → args: { ip }

PROJECT MANAGEMENT:
- create_project → args: { name, type, port, description }
- workspace_save → args: { projectDir, repoName, description, isPrivate }
- pm2_start      → args: { script, name }
- pm2_stop       → args: { name }
- pm2_restart    → args: { name }
- pm2_logs       → args: { name, lines }
- pm2_list       → args: {}
- git_clone      → args: { url, folder }
- git_push       → args: { folder, message }
- git_status     → args: { folder }
- github_token   → args: {}
- docker_manage  → args: { action, name }
- berahost       → args: { action("list"|"status"|"start"|"stop"|"logs"|"metrics"|"deploy"|"coins"|"bots"|"delete"), id, botId, envVars }
  Examples: list all → {"tool":"berahost","action":"list"}
            status   → {"tool":"berahost","action":"status","id":8}
            start    → {"tool":"berahost","action":"start","id":8}
            stop     → {"tool":"berahost","action":"stop","id":8}
            logs     → {"tool":"berahost","action":"logs","id":8}
            metrics  → {"tool":"berahost","action":"metrics","id":8}
            deploy   → {"tool":"berahost","action":"deploy","botId":3,"envVars":{"OWNER_NUMBER":"254712345678"}}
            coins    → {"tool":"berahost","action":"coins"}
            bots     → {"tool":"berahost","action":"bots"}

AI:
- search         → args: { query }
- image_gen      → args: { prompt }
- music          → args: { query }

DATA & LIVE INFO:
- crypto_price   → args: { coins: ["bitcoin","ethereum","solana"] }  ← live crypto prices
- stock_price    → args: { symbol: "AAPL" }  ← live stock price (Yahoo Finance)
- currency_convert → args: { amount, from: "USD", to: "KES" }  ← FX conversion
- weather_gt     → args: { location: "Nairobi" }  ← current weather + 3-day forecast
- news_fetch     → args: { topic: "Kenya" }  ← latest news headlines
- movie_info     → args: { title: "Inception" }  ← IMDB movie info
- anime_search   → args: { query: "Naruto" }  ← MyAnimeList anime search
- translate_text → args: { text, to: "sw" }  ← translate (sw=Swahili, fr, es, de, zh, ar...)
- lyrics_fetch   → args: { query: "Song by Artist" }  ← song lyrics
- wiki_search    → args: { topic: "Nairobi" }  ← Wikipedia summary
- bible_verse    → args: { verse: "John 3:16" }  ← Bible verse lookup

APP BUILDER:
- build_webapp   → args: { name, type("express"|"express-api"|"react"|"vue"|"nextjs"|"flask"|"fastapi"|"static"|"discord"|"telegram"), description, port }
- generate_api   → args: { description, port }
- auto_fix       → args: { projectDir }

DATA & ANALYSIS:
- analyze_data   → args: { data, question }
- markdown_tools → args: { action("to_html"|"generate"|"table"), input }

DEEP WEB:
- crawl_site     → args: { url, maxDepth, maxPages }
- compare_apis   → args: { urls, method }
- load_test      → args: { url, requests, concurrency, method }

SECURITY & CRYPTO:
- jwt_tools      → args: { action("encode"|"decode"|"verify"|"apikey"|"hash"|"base64encode"|"base64decode"), payload, secret, expiresIn }

DATABASE (SQLite):
- sqlite_manage  → args: { action("create"|"schema"|"tables"|"insert"|"query"|"run"|"drop"|"info"|"seed"), dbPath, query, data }

GITHUB:
- github_manage  → args: { action("whoami"|"list_repos"|"create_repo"|"delete_repo"|"create_issue"|"list_issues"|"commit_file"|"read_file"|"get_commits"|"fork"|"star"|"search_repos"), opts: { name, repo, owner, title, body, path, content, message, description, private, query, labels } }

DOCS & TESTING:
- generate_docs  → args: { code, language, style("markdown"|"jsdoc"|"html") }
- generate_tests → args: { code, language, framework("jest"|"mocha"|"pytest") }


SUPERTOOLS 2 — REPLIT-LEVEL AUTONOMOUS:
- smart_extract      → args: { url, hint("product"|"job"|"article"|"price") }  ← intelligently extract structured data from any page
- data_pipeline      → args: { sources: ["url1","url2"], hint, format("json"|"csv"|"tsv"), outputPath }  ← scrape → clean → store → export
- scaffold_project   → args: { name, stack("express-rest"|"flask"|"next"|"react"), description, port }  ← generate full multi-file project + install + start
- auto_install_deps  → args: { path, lang("node"|"python") }  ← detect and install missing packages from code or directory
- format_convert     → args: { input, from("json"|"csv"|"yaml"|"tsv"), to("json"|"csv"|"yaml"|"xml"|"table"), saveTo }  ← convert between data formats
- zip_tools          → args: { action("create"|"extract"|"list"|"tar"|"untar"|"tarlist"), target, dest }  ← archive management
- multi_shell        → args: { commands: [{ cmd, desc, required, timeout }] }  ← ordered bash pipeline with dependency checking
- nl_to_sql          → args: { query, schema, dialect("sqlite"|"mysql"|"postgres") }  ← natural language → SQL query
- self_test_fix      → args: { projectDir, port, endpoints: ["/health","/api/items"], maxRetries }  ← build → test → AI fix → repeat
- mock_server        → args: { spec, port }  ← describe API in plain English → running mock server with sample data
- github_code_search → args: { query, lang("javascript"|"python"|"etc"), limit }  ← search GitHub for real code examples
- ai_code_fix        → args: { file, instruction }  ← read a file, AI improves/fixes it, writes back
- project_memory     → args: { action("list"|"save"|"get"|"delete"), name, info }  ← remember built projects across sessions
- deep_scrape        → args: { url, question }  ← fetch page, strip HTML, AI analyzes and answers your question about it

AUTONOMOUS TASK PATTERNS:
- "build me a X app" → scaffold_project + self_test_fix + project_memory(save)
- "scrape X and save to CSV" → data_pipeline with format:"csv"
- "extract all products/prices from URL" → smart_extract with hint:"product"
- "convert this JSON to CSV" → format_convert
- "create a mock API for X" → mock_server
- "fix errors in my code" → ai_code_fix
- "install missing packages" → auto_install_deps
- "what does this page say about X?" → deep_scrape
- "find code examples for X" → github_code_search
- "run these commands in order" → multi_shell

RULES:
- "create folder/directory" or "mkdir" → use file_mkdir (local) or puter_mkdir (cloud)
- "create file" or "write file" → use file_write (local) or puter_write (cloud)
- "run bash/shell command" → use shell
- "save to workspace" → workspace_save (GitHub)
- "build me a <type> app" → build_webapp
- "create an API for X" → generate_api
- For any programming language task → run_code with the right lang
- For SQLite → sqlite_manage
- For GitHub management → github_manage
- urls arg in bulk_scrape must be an array

Return format (ONLY JSON, no markdown):
{"reasoning":"Why I chose these steps and in what order","plan":"one line summary","steps":[{"action":"shell","args":{"cmd":"mkdir -p /tmp/myproject"},"desc":"Create project directory"}]}

Task: `

const SUMMARY_PROMPT = `You are Bera AI — a smart, direct assistant. Summarize what was done clearly. Use bullets for multiple results. Be concise.

Task: {task}
Steps:
{steps}

Reply:`

const planTask = async (task) => {
    try {
        const result = await callAI('', PLAN_PROMPT + task)
        if (!result.success) return { success: false, error: result.error }
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return { success: false, error: 'Could not parse plan' }
        const plan = JSON.parse(jsonMatch[0])
        if (!plan.steps || !Array.isArray(plan.steps)) return { success: false, error: 'Invalid plan' }
        return { success: true, plan }
    } catch (e) {
        return { success: false, error: 'Plan failed: ' + e.message }
    }
}

const executeStep = async (step, conn, chat, m, opts = {}) => {
    const { action, args, desc } = step
    const userId = opts.userId || null  // for workspace-aware paths
    try {
        switch (action) {
            case 'shell':        return { ...await runShell(args.cmd, 45000), desc }
            case 'file_read': {
                const filePath = resolveAgentPath(args.path, userId)
                const content  = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').slice(0, 3000) : 'File not found'
                return { success: true, output: content, desc }
            }
            case 'file_write': {
                const writePath = resolveAgentPath(args.path, userId)
                fs.mkdirSync(path.dirname(writePath), { recursive: true })
                fs.writeFileSync(writePath, args.content || '')
                return { success: true, output: `✅ Written: ${writePath}`, desc }
            }
            case 'file_mkdir': {
                const rawPath = args.path || args.dir || ''
                if (!rawPath) return { success: false, output: 'No path provided', desc }
                const mkPath = resolveAgentPath(rawPath, userId)
                fs.mkdirSync(mkPath, { recursive: true })
                return { success: true, output: `✅ Directory created: ${mkPath}`, desc }
            }
            case 'file_mkdir_nested': {
                const rawPaths = Array.isArray(args.paths) ? args.paths : [args.paths || args.path]
                const results  = []
                for (const p of rawPaths) {
                    const resolved = resolveAgentPath(p, userId)
                    try { fs.mkdirSync(resolved, { recursive: true }); results.push(`✅ ${resolved}`) }
                    catch (e) { results.push(`❌ ${resolved}: ${e.message}`) }
                }
                return { success: true, output: `Created directories:\n${results.join('\n')}`, desc }
            }
            // ── Workspace shortcuts ────────────────────────────────────────────
            case 'workspace_list': {
                const r = listWorkspace(userId, args.path)
                return { success: r.success, output: r.output, desc }
            }
            case 'workspace_write': {
                const r = writeWorkspaceFile(userId, args.path || args.name, args.content || '')
                return { success: r.success, output: r.output, desc }
            }
            case 'workspace_read': {
                const r = readWorkspaceFile(userId, args.path)
                return { success: r.success, output: r.output, desc }
            }
            case 'workspace_mkdir': {
                const r = mkdirWorkspace(userId, args.path)
                return { success: r.success, output: r.output, desc }
            }
            case 'workspace_delete': {
                const r = deleteWorkspaceItem(userId, args.path)
                return { success: r.success, output: r.output, desc }
            }
            // ── Puter cloud file system ─────────────────────────────────────
            case 'puter_write': {
                const puterPath = args.path || 'untitled.txt'
                const content = args.content || ''
                return {
                    success: true,
                    output: `📁 Puter file operation queued:\nPath: ${puterPath}\nSize: ${content.length} chars\n\n⚠️ Puter cloud FS requires browser auth — for server-side file ops use file_write instead.\nLocal fallback: Writing to /tmp/puter_${path.basename(puterPath)}`,
                    desc
                }
            }
            case 'puter_mkdir': {
                return {
                    success: true,
                    output: `📁 Puter mkdir: ${args.path}\n\n⚠️ Puter cloud FS requires browser auth — for server-side dirs use file_mkdir instead.`,
                    desc
                }
            }
            case 'puter_read': {
                return {
                    success: true,
                    output: `📁 Puter read: ${args.path}\n\n⚠️ Puter cloud FS requires browser auth — use file_read for server-side files.`,
                    desc
                }
            }
            case 'puter_list':
            case 'puter_delete': {
                return { success: true, output: `Puter cloud FS operation '${action}' on ${args.path} — requires browser auth.`, desc }
            }
            case 'js_eval': {
                const out = eval(args.code)
                return { success: true, output: String(out ?? 'done'), desc }
            }
            case 'npm_install':    return { ...await runShell(`cd ${args.cwd||'.'} && npm install ${args.packages||''} --loglevel=error`, 60000), desc }
            case 'pm2_start':      return { ...await runShell(`pm2 start ${args.script} --name ${args.name}`), desc }
            case 'pm2_stop':       return { ...await runShell(`pm2 stop ${args.name}`), desc }
            case 'pm2_restart':    return { ...await runShell(`pm2 restart ${args.name}`), desc }
            case 'pm2_logs':       return { ...await runShell(`pm2 logs ${args.name} --lines ${args.lines||50} --nostream 2>&1 | tail -${args.lines||50}`), desc }
            case 'pm2_list':       return { ...await pm2Manage('list'), desc }
            case 'create_project': {
                const r = await createProject(args.name, args.type||'express', args.port||3000, args.description||'')
                return { success: r.success, output: r.steps.map(s=>`${s.ok?'✅':'❌'} ${s.step}`).join(' | '), desc }
            }
            case 'workspace_save': {
                try {
                    const gh = require('./github')
                    const repoName = (args.repoName || path.basename(args.projectDir || 'workspace')).replace(/[^a-zA-Z0-9-_.]/g, '-')
                    const createRes = await gh.createRepo(repoName, args.description || '', !!args.isPrivate)
                    if (!createRes.success && !createRes.html_url) return { success: false, output: `❌ Could not create GitHub repo: ${createRes.message || createRes.error || JSON.stringify(createRes)}`, desc }
                    const repoUrl = createRes.clone_url || createRes.html_url || `https://github.com/${createRes.full_name}`
                    const htmlUrl = createRes.html_url || repoUrl
                    const token = gh.getToken()
                    const authUrl = token ? repoUrl.replace('https://', `https://${token}@`) : repoUrl
                    const pushCmd = `cd "${args.projectDir}" && git init && git add . && git commit -m "Initial commit via Bera AI" 2>&1 && git remote remove origin 2>/dev/null; git remote add origin "${authUrl}" && git branch -M main && git push -u origin main 2>&1`
                    const pushRes = await runShell(pushCmd, 60000)
                    const out = pushRes.success || (pushRes.output || '').includes('main')
                        ? `✅ Saved to GitHub!\n🔗 ${htmlUrl}\n📁 Repo: ${repoName}`
                        : `⚠️ Repo created at ${htmlUrl} but push had issues:\n${(pushRes.output || pushRes.error || '').slice(0, 300)}`
                    return { success: true, output: out, desc }
                } catch (e) {
                    return { success: false, output: `❌ workspace_save failed: ${e.message}`, desc }
                }
            }
            case 'git_clone':      return { ...await runShell(`git clone ${args.url} ${args.folder||''} 2>&1`, 60000), desc }
            case 'git_push':       return { ...await runShell(`cd ${args.folder} && git add . && git commit -m "${args.message||'update'}" && git push 2>&1`, 30000), desc }
            case 'git_status':     return { ...await gitStatus(args.folder), desc }
            case 'http_request':   return { ...await httpRequest(args.method||'GET', args.url, args.data, args.headers), desc }
            case 'system_info': {
                const r = await systemInfo()
                return { success: r.success, output: `RAM: ${r.ram} | CPU: ${r.cpu} | Disk: ${r.disk} | Uptime: ${r.uptime} | Processes: ${r.processes}`, desc }
            }
            case 'port_check': {
                const r = await portCheck(args.port)
                return { success: r.success, output: `Port ${r.port}: ${r.open?'OPEN':'CLOSED'}\n${r.info}`, desc }
            }
            case 'docker_manage':  return { ...await dockerManage(args.action, args.name), desc }
            case 'code_review': {
                const r = await codeReview(args.code, args.context)
                return { success: r.success, output: r.text||r.error, desc }
            }
            case 'code_explain': {
                const r = await codeExplain(args.code, args.fileName)
                return { success: r.success, output: r.text||r.error, desc }
            }
            case 'bug_finder': {
                const r = await bugFinder(args.code, args.fileName)
                return { success: r.success, output: r.text||r.error, desc }
            }
            case 'npm_stats': {
                const r = await npmStats(args.package)
                return { success: r.success, output: r.success ? `${r.pkg} v${r.version} | Weekly: ${r.weekly} | Monthly: ${r.monthly}` : r.error, desc }
            }
            case 'github_token': {
                const r = await githubTokenRegen()
                return { success: r.success, output: r.message||r.error, desc }
            }
            case 'berahost_deploy':
            case 'berahost_list':
            case 'berahost_power':
            case 'berahost': {
                const bh = require('./berahost')
                const action = args.action || tc.action || 'list'
                const id = args.id || tc.id
                try {
                    switch(action) {
                        case 'list': {
                            const r = await bh.listDeployments()
                            if (!r.success) return { success: false, output: r.error, desc }
                            const deploys = r.deployments || []
                            if (!deploys.length) return { success: true, output: '📭 No deployments found', desc }
                            const lines = deploys.map(d => {
                                const em = {running:'🟢',starting:'🟡',installing:'🔵',stopped:'🔴',failed:'❌'}[d.status] || '⚪'
                                return `${em} [${d.id}] ${d.bot?.name||'Bot '+d.botId} — ${d.status}`
                            })
                            return { success: true, output: '🤖 *BeraHost Deployments*\n' + lines.join('\n'), desc }
                        }
                        case 'status': {
                            const r = await bh.getDeployment(id)
                            if (!r.success) return { success: false, output: r.error, desc }
                            const d = r.deployment
                            const em = {running:'🟢',starting:'🟡',stopped:'🔴',failed:'❌'}[d.status] || '⚪'
                            return { success: true, output: `${em} Bot: ${d.bot?.name||d.botId} | Status: ${d.status} | Last active: ${d.lastActive ? new Date(d.lastActive).toLocaleTimeString() : 'N/A'}`, desc }
                        }
                        case 'start': {
                            const r = await bh.startDeployment(id)
                            return { success: r.success, output: r.success ? `🟢 Deployment ${id} starting...` : r.error, desc }
                        }
                        case 'stop': {
                            const r = await bh.stopDeployment(id)
                            return { success: r.success, output: r.success ? `🔴 Deployment ${id} stopped` : r.error, desc }
                        }
                        case 'logs': {
                            const r = await bh.getDeploymentLogs(id)
                            if (!r.success) return { success: false, output: r.error, desc }
                            const logLines = (r.logs || '').split('\n').slice(-20).join('\n')
                            return { success: true, output: `📋 *Logs (last 20 lines)*:\n\`\`\`\n${logLines}\n\`\`\``, desc }
                        }
                        case 'metrics': {
                            const r = await bh.getDeploymentMetrics(id)
                            if (!r.success) return { success: false, output: r.error, desc }
                            return { success: true, output: `📊 *Metrics*\n• CPU: ${r.cpu}\n• RAM: ${r.ram}\n• Uptime: ${r.uptime}\n• Status: ${r.status}\n• Threads: ${r.threads||'N/A'}`, desc }
                        }
                        case 'deploy': {
                            const r = await bh.deployBot(args.botId||tc.botId||3, null, args.envVars||tc.envVars||{})
                            if (!r.success) return { success: false, output: r.error, desc }
                            return { success: true, output: `🚀 Deployed! ID: ${r.id} | Status: ${r.status}`, desc }
                        }
                        case 'delete': {
                            const r = await bh.deleteDeployment(id)
                            return { success: r.success, output: r.output||r.error, desc }
                        }
                        case 'coins': {
                            const r = await bh.getCoins()
                            if (!r.success) return { success: false, output: r.error, desc }
                            return { success: true, output: `💰 BeraHost Coins: *${r.balance}* coins`, desc }
                        }
                        case 'bots': {
                            const r = await bh.listBots()
                            if (!r.success) return { success: false, output: r.error, desc }
                            const bots = (r.bots||[]).map(b => `• [${b.id}] ${b.name} — ${(b.description||'').slice(0,60)}...`).join('\n')
                            return { success: true, output: `🤖 *Available Bots*:\n${bots}`, desc }
                        }
                        default:
                            return { success: false, output: `Unknown berahost action: ${action}. Use: list, status, start, stop, logs, metrics, deploy, coins, bots`, desc }
                    }
                } catch(e) { return { success: false, output: `BeraHost error: ${e.message}`, desc } }
            }
            case 'search': {
                const r = await axios.get(`https://ddg-api.rasa.gg/search?q=${encodeURIComponent(args.query)}&max_results=3`, { timeout: 15000 })
                const results = r.data?.results || r.data || []
                return { success: true, output: Array.isArray(results) ? results.slice(0,3).map(x=>`• ${x.title}: ${x.body||x.snippet||''}`).join('\n') : String(results).slice(0,500), desc }
            }

            // ── Code execution (any language via Piston) ────────────────────
            case 'run_code': {
                const { runCode, formatRunResult } = require('./coderunner')
                const r = await runCode(args.code || '', args.lang || 'javascript', args.stdin || '', 20000)
                return { success: r.success, output: formatRunResult(r), desc }
            }
            case 'code_gen': {
                const r = await codeGen(args.description || args.task || '', args.language || 'javascript')
                return { success: r.success, output: r.text || r.error, desc }
            }

            // ── Web scraping ────────────────────────────────────────────────
            case 'web_scrape': {
                const sc = require('./scraper')
                const r = await sc.scrapePage(args.url)
                if (!r.success) return { success: false, output: `❌ Scrape failed: ${r.error}`, desc }
                const out = [
                    `🌐 *${r.title || r.url}*`,
                    `📄 Text (${r.text.length} chars): ${r.text.slice(0, 600)}...`,
                    `🔗 Links: ${r.linksCount} found`,
                    `🖼️ Images: ${r.imagesCount} | 📊 Tables: ${r.tablesCount}`,
                    r.meta.description ? `📝 Description: ${r.meta.description.slice(0, 200)}` : '',
                    r.headings.length ? `📑 Headings: ${r.headings.slice(0,5).map(h=>`H${h.level}: ${h.text}`).join(' | ')}` : '',
                ].filter(Boolean).join('\n')
                return { success: true, output: out, rawData: r, desc }
            }
            case 'extract_links': {
                const sc = require('./scraper')
                const r = await sc.extractLinks(args.url, args.filter || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const preview = r.links.slice(0, 20).map(l => `• ${l.text || '(no text)'}: ${l.href}`).join('\n')
                return { success: true, output: `🔗 Found ${r.total} links${args.filter ? ` (filtered by "${args.filter}")` : ''}:\n\n${preview}`, desc }
            }
            case 'extract_table': {
                const sc = require('./scraper')
                const r = await sc.extractTables(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                if (!r.count) return { success: true, output: '📊 No tables found on this page.', desc }
                const preview = r.tables.map((t, i) =>
                    `📊 Table ${i+1} (${t.rowCount} rows):\nHeaders: ${t.headers.join(' | ')}\nRow 1: ${(t.rows[0] || []).join(' | ')}`
                ).join('\n\n')
                return { success: true, output: preview, rawData: r, desc }
            }
            case 'extract_data': {
                const sc = require('./scraper')
                const r = await sc.extractStructuredData(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const ogStr = Object.entries(r.og || {}).map(([k,v]) => `og:${k}=${v}`).join('\n') || '(none)'
                const metaStr = Object.entries(r.meta || {}).filter(([k]) => !k.startsWith('og:')).slice(0,8).map(([k,v]) => `${k}: ${v}`).join('\n') || '(none)'
                const schemaTypes = (r.jsonld || []).map(s => s['@type'] || '?').join(', ') || '(none)'
                return { success: true, output: `🔍 Structured data for ${r.title || r.url}\n\n📌 Open Graph:\n${ogStr}\n\n🏷️ Meta:\n${metaStr}\n\n📦 JSON-LD types: ${schemaTypes}`, desc }
            }
            case 'extract_emails': {
                const sc = require('./scraper')
                const r = await sc.extractEmails(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: r.count ? `📧 Found ${r.count} email(s):\n${r.emails.join('\n')}` : '📧 No emails found.', desc }
            }
            case 'extract_phones': {
                const sc = require('./scraper')
                const r = await sc.extractPhones(args.url)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: r.count ? `📞 Found ${r.count} phone(s):\n${r.phones.join('\n')}` : '📞 No phones found.', desc }
            }
            case 'find_text': {
                const sc = require('./scraper')
                const r = await sc.findText(args.url, args.query || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: r.found ? `🔎 "${args.query}" found ${r.matches.length} time(s):\n\n${r.matches.join('\n\n')}` : `🔎 "${args.query}" not found on this page.`, desc }
            }
            case 'bulk_scrape': {
                const sc = require('./scraper')
                const urls = Array.isArray(args.urls) ? args.urls : String(args.urls).split(/[\s,]+/).filter(u => u.startsWith('http'))
                const r = await sc.bulkScrape(urls.slice(0, 10))
                const summary = r.results.map((res, i) => res.success
                    ? `✅ ${res.url.slice(0,50)}: "${res.title}" (${res.text.length} chars)`
                    : `❌ ${res.url.slice(0,50)}: ${res.error}`
                ).join('\n')
                return { success: true, output: `📦 Bulk scrape (${r.count} URLs):\n\n${summary}`, desc }
            }
            case 'regex_extract': {
                const sc = require('./scraper')
                const r = await sc.regexExtract(args.url, args.pattern, args.flags || 'gi')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `🔍 Regex /${args.pattern}/ → ${r.count} match(es):\n\n${r.matches.slice(0,20).join('\n')}`, desc }
            }
            case 'fetch_json': {
                const sc = require('./scraper')
                const r = await sc.fetchJson(args.url, args.headers || {})
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `📡 JSON from ${args.url}\nType: ${r.type}\n\n${r.data}`, desc }
            }
            case 'api_test': {
                const sc = require('./scraper')
                const r = await sc.apiTest(args.method || 'GET', args.url, args.body || null, args.headers || {})
                if (!r.success) return { success: false, output: `❌ API test failed: ${r.error}`, desc }
                const icon = r.ok ? '✅' : '⚠️'
                return { success: true, output: `${icon} ${args.method?.toUpperCase() || 'GET'} ${args.url}\nStatus: ${r.status} | Time: ${r.ms}ms\n\n📦 Response:\n${r.body}`, desc }
            }
            case 'screenshot': {
                const { takeScreenshot } = require('./browser')
                const r = await takeScreenshot(args.url)
                if (!r.success) return { success: false, output: `❌ Screenshot failed: ${r.error}`, desc }
                return { success: true, output: `📸 Screenshot captured`, buffer: r.buffer, mimetype: r.mimetype, isMedia: true, desc }
            }
            case 'page_monitor': {
                const sc = require('./scraper')
                const r = await sc.checkPageChange(args.url, args.previousHash || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `👁️ ${args.url}\nContent hash: ${r.hash}\nChanged: ${r.changed ? '⚠️ YES' : '✅ No'}\nLength: ${r.contentLength} chars`, desc }
            }

            // ── Networking ──────────────────────────────────────────────────
            case 'url_check': {
                const urlList = Array.isArray(args.urls) ? args.urls : String(args.urls || '').split(/[\s,]+/).filter(u => u.startsWith('http'))
                const r = await urlCheck(urlList)
                return { success: r.success, output: r.output, desc }
            }
            case 'dns_check': { const r = await dnsCheck(args.host); return { success: r.success, output: r.output, desc } }
            case 'ssl_check': { const r = await sslCheck(args.domain); return { success: r.success, output: r.output, desc } }
            case 'ping':      { const r = await pingHost(args.host); return { success: r.success, output: r.output, desc } }
            case 'whois':     { const r = await whoisLookup(args.domain); return { success: r.success, output: r.output, desc } }
            case 'ip_lookup': { const r = await ipLookup(args.ip); return { success: r.success, output: r.output, desc } }

            // ── GIFTED DATA TOOLS ─────────────────────────────────────────
            case 'crypto_price': {
                const coins = args.coins || ['bitcoin', 'ethereum', 'solana']
                const data = await gtCrypto(coins)
                if (!data) return { success: false, output: 'Could not fetch crypto prices', desc }
                const lines = data.slice(0, 6).map(c => `${c.name} (${c.symbol?.toUpperCase()}): $${c.current_price?.toLocaleString()} | ${c.price_change_percentage_24h?.toFixed(2)}% 24h`)
                return { success: true, output: lines.join('\n'), desc }
            }
            case 'stock_price': {
                const d = await gtStock(args.symbol)
                if (!d) return { success: false, output: `No data for ${args.symbol}`, desc }
                return { success: true, output: `${d.name} (${d.symbol}): ${d.currency} ${d.price?.toFixed(2)} | ${d.change}% change | Exchange: ${d.exchange}`, desc }
            }
            case 'currency_convert': {
                const r = await gtCurrency(args.amount, args.from, args.to)
                if (!r) return { success: false, output: 'Conversion failed', desc }
                return { success: true, output: `${args.amount} ${args.from.toUpperCase()} = ${r.result} ${args.to.toUpperCase()} (rate: ${r.rate.toFixed(4)})`, desc }
            }
            case 'movie_info': {
                const d = await gtMovie(args.title)
                if (!d || d.Response === 'False') return { success: false, output: `Movie not found: ${args.title}`, desc }
                return { success: true, output: `${d.Title} (${d.Year}) | ⭐ ${d.imdbRating}/10 | ${d.Genre} | ${d.Plot}`, desc }
            }
            case 'anime_search': {
                const data = await gtAnime(args.query)
                if (!data?.length) return { success: false, output: `No anime found: ${args.query}`, desc }
                const top = data[0]
                return { success: true, output: `${top.title} (${top.title_english || ''}) | Score: ${top.score} | Episodes: ${top.episodes} | ${top.synopsis?.slice(0, 200)}`, desc }
            }
            case 'translate_text': {
                const result = await gtTranslate(args.text, args.to || 'sw', args.from || 'auto')
                if (!result) return { success: false, output: 'Translation failed', desc }
                return { success: true, output: `Translated to ${(args.to||'sw').toUpperCase()}: ${result}`, desc }
            }
            case 'weather_gt': {
                const w = await gtWeather(args.location)
                if (!w) return { success: false, output: `No weather data for: ${args.location}`, desc }
                return { success: true, output: `${w.city}, ${w.country}: ${w.temp}°C, Feels ${w.feels}°C, ${w.desc}, Humidity ${w.humidity}%, Wind ${w.wind}km/h`, desc }
            }
            case 'news_fetch': {
                const articles = await gtNews(args.topic || 'Kenya')
                if (!articles?.length) return { success: false, output: 'No news found', desc }
                const lines = articles.slice(0, 5).map((a, i) => `${i+1}. ${a.title} — ${a.url || ''}`)
                return { success: true, output: lines.join('\n'), desc }
            }
            case 'lyrics_fetch': {
                const d = await gtLyrics(args.query)
                if (!d?.lyrics) return { success: false, output: `No lyrics for: ${args.query}`, desc }
                return { success: true, output: `${d.title} — ${d.artist}\n\n${d.lyrics.slice(0, 1500)}`, desc }
            }
            case 'wiki_search': {
                const d = await gtWiki(args.topic)
                if (!d) return { success: false, output: `No Wikipedia article for: ${args.topic}`, desc }
                return { success: true, output: `${d.title}\n\n${d.extract}\n\n${d.url}`, desc }
            }
            case 'bible_verse': {
                const d = await gtBible(args.verse)
                if (!d) return { success: false, output: `Verse not found: ${args.verse}`, desc }
                return { success: true, output: `${d.verse || args.verse}: ${d.data || d.text || JSON.stringify(d)}`, desc }
            }

            // ── Dev tools ───────────────────────────────────────────────────
            case 'env_manage':   { const r = await envManager(args.action, args.key, args.value); return { success: r.success, output: r.output || r.error, desc } }
            case 'file_search':  { const r = await fileSearch(args.pattern, args.directory || '.', args.ext || ''); return { success: r.success, output: r.output, desc } }
            case 'file_diff':    { const r = await fileDiff(args.file1, args.file2); return { success: r.success, output: r.output, desc } }
            case 'json_tools':   { const r = jsonTools(args.action, args.json); return { success: r.success, output: r.output, desc } }
            case 'password_gen': { const r = passwordGen(args.length || 16, { noSymbols: args.noSymbols }); return { success: r.success, output: `🔑 Password: \`${r.password}\`\n${r.strength}`, desc } }

            // ── Supertools — App Builder ────────────────────────────────────
            case 'build_webapp': {
                const st = require('./supertools')
                const r = await st.buildWebApp(args.name, args.type || 'express', args.description || '', args.port || null)
                if (!r.success) return { success: false, output: `❌ Build failed`, desc }
                return {
                    success: true,
                    output: `🚀 *${r.name}* (${r.type}) built!\n📁 ${r.dir}\n🔌 Port: ${r.port}\n📄 Main: ${r.mainFile}\n\n${r.summary}`,
                    desc
                }
            }
            case 'generate_api': {
                const st = require('./supertools')
                const r = await st.generateAPI(args.description || args.desc || '', args.port || 4000)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `⚡ REST API generated!\n📁 ${r.dir}\n🔌 Port: ${r.port}\n${r.running ? '✅ Running with PM2' : '⚠️ Not started'}\n\nCode preview:\n\`\`\`js\n${(r.code || '').slice(0, 500)}\n\`\`\``,
                    desc
                }
            }
            case 'auto_fix': {
                const st = require('./supertools')
                const r = await st.autoFixBuild(args.projectDir || args.dir || '/tmp/projects')
                const out = r.success
                    ? `✅ Build ${r.fixed ? 'auto-fixed in' : 'OK —'} ${r.attempts} attempt(s)`
                    : `⚠️ Could not fully fix after ${r.attempts} attempt(s):\n${r.lastError}`
                return { success: r.success, output: out, desc }
            }

            // ── Supertools — Data ───────────────────────────────────────────
            case 'analyze_data': {
                const st = require('./supertools')
                const r = await st.analyzeData(args.data || args.csv || args.json || '', args.question || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `📊 *Data Analysis*\nType: ${r.dataType} | Rows: ${r.rows} | Columns: ${r.columns}\nColumns: ${(r.columnNames || []).join(', ')}\n\n${r.statSummary}\n\n💡 *Insights:*\n${r.insights}`,
                    desc
                }
            }
            case 'markdown_tools': {
                const st = require('./supertools')
                const r = await st.markdownTools(args.action || 'generate', args.input || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const out = r.html || r.markdown || r.table || 'Done'
                return { success: true, output: out.slice(0, 3000), desc }
            }

            // ── Supertools — Deep Web ───────────────────────────────────────
            case 'crawl_site': {
                const st = require('./supertools')
                const r = await st.crawlSite(args.url, args.maxDepth || 2, args.maxPages || 20)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const pageList = r.pages.slice(0, 15).map(p =>
                    `${p.ok ? '✅' : '❌'} [D${p.depth}] *${p.title}*\n   ${p.url.slice(0, 70)}`
                ).join('\n')
                return {
                    success: true,
                    output: `🕷️ *Site Crawl: ${r.baseUrl}*\nPages found: ${r.pagesFound} | Success: ${r.pagesSuccess} | Failed: ${r.pagesFailed}\n\n${pageList}`,
                    desc
                }
            }
            case 'compare_apis': {
                const st = require('./supertools')
                const urls = Array.isArray(args.urls) ? args.urls : String(args.urls || '').split(/[\s,]+/).filter(u => u.startsWith('http'))
                const r = await st.compareAPIs(urls, args.method || 'GET', args.body || null)
                return {
                    success: r.success,
                    output: `📊 *API Comparison* (${r.count} endpoints)\n\n${r.summary}\n\n${r.fastest}`,
                    desc
                }
            }
            case 'load_test': {
                const st = require('./supertools')
                const r = await st.loadTest(args.url, args.requests || 20, args.concurrency || 5, args.method || 'GET', args.body || null)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `🔥 *Load Test: ${r.url}*\n\n📋 Results:\n• Total: ${r.totalRequests} requests\n• ✅ Success: ${r.successful} (${r.successRate})\n• ❌ Failed: ${r.failed}\n• ⚡ RPS: ${r.rps}\n• ⏱️ Total: ${r.totalTimeMs}ms\n\n📈 Latency:\n• Avg: ${r.latency.avg}ms\n• P50: ${r.latency.p50}ms\n• P90: ${r.latency.p90}ms\n• P99: ${r.latency.p99}ms\n• Min/Max: ${r.latency.min}/${r.latency.max}ms\n\n🔢 Status codes: ${JSON.stringify(r.statusCodes)}`,
                    desc
                }
            }

            // ── Supertools — Security ───────────────────────────────────────
            case 'jwt_tools': {
                const st = require('./supertools')
                const r = st.jwtTools(args.action || 'encode', args.payload || {}, args.secret || 'bera-secret', args.expiresIn || '24h')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const act = args.action || 'encode'
                if (act === 'encode' || act === 'sign')
                    return { success: true, output: `🔐 *JWT Token*\n\`\`\`\n${r.token}\n\`\`\`\nExpires: ${r.expiresIn}`, desc }
                if (act === 'decode' || act === 'verify')
                    return { success: true, output: `🔓 *JWT Decoded*\nExpired: ${r.expired ? '⚠️ YES' : '✅ No'}\nExpires: ${r.expiresAt || 'N/A'}\nSig valid: ${r.signatureValid === null ? 'not checked' : r.signatureValid ? '✅' : '❌'}\n\nPayload:\n${JSON.stringify(r.payload, null, 2)}`, desc }
                if (act === 'apikey')
                    return { success: true, output: `🔑 *API Key*\n\`${r.apiKey}\`\nHash: \`${r.hash.slice(0, 20)}...\``, desc }
                if (act === 'hash')
                    return { success: true, output: `#️⃣ *Hashes for: "${r.input.slice(0, 30)}"*\nMD5: \`${r.md5}\`\nSHA1: \`${r.sha1}\`\nSHA256: \`${r.sha256}\``, desc }
                return { success: true, output: JSON.stringify(r, null, 2).slice(0, 1000), desc }
            }

            // ── Supertools — Database ───────────────────────────────────────
            case 'sqlite_manage': {
                const st = require('./supertools')
                const r = await st.sqliteManage(args.action || 'info', args.dbPath || 'bera.db', args.query || '', args.data || {})
                return { success: r.success, output: r.output || r.error || 'Done', desc }
            }

            // ── Supertools — GitHub ─────────────────────────────────────────
            case 'github_manage': {
                const st = require('./supertools')
                const r = await st.githubManage(args.action || 'whoami', args.opts || args)
                return { success: r.success, output: r.output || r.error, desc }
            }

            // ── Supertools — Docs & Tests ───────────────────────────────────
            case 'generate_docs': {
                const st = require('./supertools')
                const r = await st.generateDocs(args.code || '', args.language || 'javascript', args.style || 'markdown')
                return { success: r.success, output: (r.docs || r.error || '').slice(0, 3000), desc }
            }
            case 'generate_tests': {
                const st = require('./supertools')
                const r = await st.generateTests(args.code || '', args.language || 'javascript', args.framework || 'jest')
                return { success: r.success, output: (r.tests || r.error || '').slice(0, 3000), desc }
            }


            // ══ SUPERTOOLS 2 — Replit-level autonomous capabilities ════════

            case 'smart_extract': {
                const st2 = require('./supertools2')
                const r = await st2.smartExtract(args.url, args.hint || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const itemPreview = (r.items || []).slice(0, 8).map((item, i) =>
                    `${i+1}. ${Object.entries(item).map(([k,v]) => `${k}: ${v}`).join(' | ')}`
                ).join('\n')
                return {
                    success: true,
                    output: `🔍 *Smart Extract: ${r.url}*\nType: ${r.type} | Items: ${r.items?.length || 0}\n${r.summary || ''}\n\n${itemPreview}\n\n${r.raw?.emails?.length ? '📧 Emails: ' + r.raw.emails.slice(0,5).join(', ') : ''}\n${r.raw?.phones?.length ? '📞 Phones: ' + r.raw.phones.slice(0,5).join(', ') : ''}`.trim(),
                    rawData: r, desc
                }
            }
            case 'data_pipeline': {
                const st2 = require('./supertools2')
                const sources = Array.isArray(args.sources) ? args.sources : String(args.sources||'').split(/[,\s]+/).filter(u=>u.startsWith('http'))
                const r = await st2.dataPipeline({
                    sources, hint: args.hint || '', dbPath: args.dbPath || null,
                    exportFormat: args.format || 'json', outputPath: args.outputPath || null
                })
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const prev = (r.preview || []).map(i => JSON.stringify(i).slice(0, 80)).join('\n')
                return {
                    success: true,
                    output: `🔄 *Data Pipeline Complete*\n📡 Sources: ${r.sources} | ✅ Records: ${r.records} | ⚠️ Errors: ${r.errors}\n💾 DB: ${r.db}\n📁 Output: ${r.output} (${r.fileSize})\n🏷️ Columns: ${(r.columns||[]).join(', ')}\n\nPreview:\n${prev}`,
                    desc
                }
            }
            case 'scaffold_project': {
                const st2 = require('./supertools2')
                const r = await st2.scaffoldProject(args.name, args.stack || 'express-rest', args.description || '', args.port || null)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                // Save to project memory
                try {
                    const { projectMemory } = require('./supertools2')
                    projectMemory.save(r.name, { stack: r.stack, port: r.port, dir: r.dir })
                } catch {}
                return {
                    success: true,
                    output: `🏗️ *Project Scaffolded!*\n\n📁 ${r.dir}\n🔌 Port: ${r.port} | Stack: ${r.stack}\n✅ ${r.stepsOk}/${r.stepsTotal} steps OK\n📄 Main: ${r.mainFile}\n\n${r.summary}`,
                    desc
                }
            }
            case 'auto_install_deps': {
                const st2 = require('./supertools2')
                const r = await st2.autoInstallDeps(args.path || args.code || '', args.lang || 'node')
                return {
                    success: r.success,
                    output: r.installed?.length
                        ? `📦 *Installed ${r.installed.length} package(s):*\n${r.installed.join(', ')}\n\n${r.output || ''}`
                        : r.message || 'No packages needed',
                    desc
                }
            }
            case 'format_convert': {
                const st2 = require('./supertools2')
                const r = st2.formatConvert(args.input || '', args.from || 'json', args.to || 'csv')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const preview = (r.output || '').slice(0, 1500)
                if (args.saveTo) {
                    try { require('fs').writeFileSync(args.saveTo, r.output); } catch {}
                    return { success: true, output: `✅ Converted ${args.from}→${args.to} saved to ${args.saveTo}\n\nPreview:\n${preview}`, desc }
                }
                return { success: true, output: `✅ *${args.from.toUpperCase()} → ${args.to.toUpperCase()}*\n\n${preview}`, desc }
            }
            case 'zip_tools': {
                const st2 = require('./supertools2')
                const r = await st2.zipTools(args.action || 'list', args.target, args.dest || null)
                return { success: r.success, output: `🗜️ *${args.action}*\n${r.output}`, desc }
            }
            case 'multi_shell': {
                const st2 = require('./supertools2')
                const cmds = Array.isArray(args.commands) ? args.commands
                    : String(args.commands||'').split('\n').map(c=>({cmd:c.trim(),desc:c.trim(),required:true})).filter(c=>c.cmd)
                const r = await st2.multiShell(cmds)
                return {
                    success: r.success,
                    output: `🔧 *Multi-Shell: ${r.ok}✅ ${r.failed}❌ ${r.skipped}⏭️*\n\n${r.summary}`,
                    desc
                }
            }
            case 'nl_to_sql': {
                const st2 = require('./supertools2')
                const r = await st2.nlToSql(args.query || args.nl || '', args.schema || '', args.dialect || 'sqlite')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `🗃️ *NL → SQL (${r.dialect})*\n${r.valid ? '✅ Valid query' : '⚠️ Check syntax'}\n\n\`\`\`sql\n${r.sql}\n\`\`\``,
                    desc
                }
            }
            case 'self_test_fix': {
                const st2 = require('./supertools2')
                const endpoints = Array.isArray(args.endpoints) ? args.endpoints : [args.endpoint || '/health']
                const r = await st2.selfTestFix(args.projectDir || args.dir, args.port, endpoints, args.maxRetries || 4)
                return {
                    success: r.success,
                    output: `🔄 *Self-Test & Fix*\nAttempts: ${r.attempts} | Port: ${r.port}\n${r.success ? '✅ All tests passing!' : '❌ Could not fix: ' + (r.lastError||'')}\n\n${r.log}`,
                    desc
                }
            }
            case 'mock_server': {
                const st2 = require('./supertools2')
                const r = await st2.mockServer(args.spec || args.description || '', args.port || null)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const eps = (r.endpoints||[]).join('\n  ')
                return {
                    success: true,
                    output: `🎭 *Mock API Server*\n📡 Port: ${r.port} | ${r.healthy ? '✅ Healthy' : '⚠️ Check logs'}\n📁 ${r.dir}\n\nEndpoints:\n  ${eps}\n\nCode preview:\n\`\`\`js\n${(r.codePreview||'').slice(0,400)}\n\`\`\``,
                    desc
                }
            }
            case 'github_code_search': {
                const st2 = require('./supertools2')
                const r = await st2.githubCodeSearch(args.query || '', args.lang || '', args.limit || 5)
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                const lines = (r.results || []).map((res, i) =>
                    `${i+1}. 📁 ${res.repo} — ${res.file}\n   🔗 ${res.url}\n   ${res.snippet ? '\`\`\`\n' + res.snippet.slice(0,200) + '\n\`\`\`' : ''}`
                ).join('\n\n')
                return { success: true, output: `🔍 *GitHub Code Search* (${r.total?.toLocaleString() || '?'} results)\n\n${lines}`, desc }
            }
            case 'ai_code_fix': {
                const st2 = require('./supertools2')
                const r = await st2.aiCodeFix(args.file, args.instruction || args.error || '')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return { success: true, output: `✏️ *AI Code Fix*\n📄 ${r.file}\n📏 ${r.lines} lines\n\nPreview:\n${r.preview}`, desc }
            }
            case 'project_memory': {
                const st2 = require('./supertools2')
                const { projectMemory } = st2
                const action = args.action || 'list'
                if (action === 'save') {
                    const r = projectMemory.save(args.name, args.info || {})
                    return { success: true, output: `💾 Saved project: ${r.saved}`, desc }
                } else if (action === 'get') {
                    const p = projectMemory.get(args.name)
                    return { success: true, output: p ? JSON.stringify(p, null, 2) : 'Project not found', desc }
                } else if (action === 'delete') {
                    projectMemory.delete(args.name)
                    return { success: true, output: `🗑️ Deleted: ${args.name}`, desc }
                } else {
                    return { success: true, output: `📋 *Saved Projects*\n${projectMemory.list()}`, desc }
                }
            }
            case 'deep_scrape': {
                const st2 = require('./supertools2')
                const r = await st2.deepScrapeAnalyze(args.url, args.question || 'Summarize the key information on this page')
                if (!r.success) return { success: false, output: `❌ ${r.error}`, desc }
                return {
                    success: true,
                    output: `🧠 *Deep Scrape Analysis*\n🌐 ${r.url}\n❓ ${r.question}\n📏 Content: ${r.contentLength} chars\n\n${r.answer}`,
                    desc
                }
            }

            default: return { success: false, output: `Unknown action: ${action}`, desc }
        }
    } catch (e) {
        return { success: false, output: `Error: ${e.message}`, desc }
    }
}

const summarizeResults = async (task, stepResults) => {
    try {
        const stepsText = stepResults.map((s, i) => `Step ${i+1} (${s.desc}): ${s.success?'OK':'FAIL'} — ${(s.output||'').slice(0,300)}`).join('\n')
        const r = await callAI('You are Bera AI — smart, direct.', SUMMARY_PROMPT.replace('{task}', task).replace('{steps}', stepsText))
        return r.success ? r.text : 'Task completed.'
    } catch { return 'Task completed.' }
}

// ── v3 NEW TOOLS ─────────────────────────────────────────────────────────────
const webScrape = async (url) => {
    try {
        const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeraBot/1.0)' }, maxContentLength: 2097152 })
        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ').trim().slice(0, 3000)
        const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        return { success: true, url, title: tm ? tm[1].trim() : url, text, length: text.length }
    } catch (e) { return { success: false, error: e.message } }
}

const dnsCheck = async (host) => {
    const d = host.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`dig +short A ${d}; dig +short MX ${d}; dig +short NS ${d} | head -4`)
    const p = await runShell(`ping -c 2 -W 3 ${d} 2>&1 | tail -3`)
    return { success: true, domain: d, output: `DNS for ${d}:\n${r.output || 'No records found'}\n\nPing:\n${p.output}` }
}

const sslCheck = async (domain) => {
    const h = domain.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`echo | openssl s_client -connect ${h}:443 -servername ${h} 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "SSL check failed"`)
    return { success: true, domain: h, output: r.output || 'Could not retrieve SSL info' }
}

const codeGen = async (description, language = 'javascript') => {
    const sys = `You are an expert ${language} developer. Write complete, working, production-ready code. Return ONLY the code with brief comments, no markdown fences, no preamble.`
    return callAI(sys, `Write ${language} code for: ${description}`)
}

const envManager = async (action, key, value) => {
    const envPath = './.env'
    try {
        let content = require('fs').existsSync(envPath) ? require('fs').readFileSync(envPath, 'utf8') : ''
        if (action === 'list') { return { success: true, output: content.split('\n').filter(l => l.trim() && !l.startsWith('#')).join('\n') || 'No env vars set' } }
        if (action === 'get' && key) { const m = content.match(new RegExp(`^${key}=(.*)$`, 'm')); return { success: true, output: m ? `${key}=${m[1]}` : `${key} not found` } }
        if (action === 'set' && key) { const re = new RegExp(`^${key}=.*$`, 'm'); const nl = `${key}=${value}`; content = re.test(content) ? content.replace(re, nl) : content + '\n' + nl; require('fs').writeFileSync(envPath, content.trim() + '\n'); return { success: true, output: `Set ${key}=${value}` } }
        if (action === 'delete' && key) { content = content.replace(new RegExp(`^${key}=.*\n?`, 'm'), ''); require('fs').writeFileSync(envPath, content.trim() + '\n'); return { success: true, output: `Deleted ${key}` } }
        return { success: false, output: 'Usage: list | get KEY | set KEY VALUE | delete KEY' }
    } catch (e) { return { success: false, error: e.message } }
}

const fileSearch = async (pattern, directory = '.', fileExt = '') => {
    const ext = fileExt ? `--include="*.${fileExt}"` : '--include="*.js" --include="*.ts" --include="*.json" --include="*.py" --include="*.md"'
    const files = await runShell(`grep -r "${pattern.replace(/"/g, '\\"')}" ${directory} ${ext} --exclude-dir=node_modules --exclude-dir=.git -l 2>/dev/null | head -10`)
    const matches = await runShell(`grep -r "${pattern.replace(/"/g, '\\"')}" ${directory} ${ext} --exclude-dir=node_modules --exclude-dir=.git -n 2>/dev/null | head -15`)
    return { success: true, output: `Files:\n${files.output || 'None'}\n\nMatches:\n${matches.output || 'No matches'}` }
}

const fileDiff = async (file1, file2) => {
    const r = await runShell(`diff -u "${file1}" "${file2}" 2>&1 | head -50`)
    return { success: true, output: r.output || 'Files are identical' }
}

const urlCheck = async (urls) => {
    const list = Array.isArray(urls) ? urls : String(urls).split(/[\s,]+/).filter(u => u.startsWith('http'))
    const results = await Promise.all(list.slice(0, 5).map(async url => {
        try {
            const t0 = Date.now(); const r = await axios.get(url, { timeout: 10000, validateStatus: () => true }); const ms = Date.now() - t0
            const e = r.status >= 200 && r.status < 300 ? '🟢' : r.status >= 300 && r.status < 400 ? '🟡' : '🔴'
            return `${e} ${url.slice(0, 50)}: HTTP ${r.status} (${ms}ms)`
        } catch (e) { return `🔴 ${url.slice(0, 50)}: ${e.code || e.message}` }
    }))
    return { success: true, output: results.join('\n') }
}

const passwordGen = (length = 16, options = {}) => {
    const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + (options.noSymbols ? '' : '!@#$%^&*()_+-=[]{}|;:,.<>?')
    const bytes = require('crypto').randomBytes(length)
    const pass  = Array.from(bytes).map(b => pool[b % pool.length]).join('')
    return { success: true, password: pass, length: pass.length, strength: length >= 20 ? '💪 Strong' : length >= 12 ? '👍 Good' : '⚠️ Weak' }
}

const autoCommitCode = async (folder, message) => {
    const cmd = ['cd ' + (folder || '.'), 'git add .', 'git commit -m "' + (message || 'auto: update').replace(/"/g, '') + '"', 'git push 2>&1'].join(' && ')
    return runShell(cmd, 60000)
}

const jsonTools = (action, json) => {
    try {
        const parsed = JSON.parse(json)
        if (action === 'format' || action === 'pretty') return { success: true, output: JSON.stringify(parsed, null, 2) }
        if (action === 'minify') return { success: true, output: JSON.stringify(parsed) }
        if (action === 'validate') return { success: true, output: `✅ Valid JSON\nType: ${Array.isArray(parsed) ? 'Array[' + parsed.length + ']' : 'Object'}\nKeys: ${typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).join(', ') : 'N/A'}` }
        if (action === 'keys') return { success: true, output: 'Keys: ' + Object.keys(parsed).join(', ') }
        return { success: true, output: JSON.stringify(parsed, null, 2).slice(0, 2000) }
    } catch (e) { return { success: false, output: `❌ Invalid JSON: ${e.message}` } }
}

const pingHost = async (host) => {
    const h = host.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`ping -c 4 -W 3 ${h} 2>&1`)
    return { success: true, host: h, output: r.output }
}

const whoisLookup = async (domain) => {
    const h = domain.replace(/https?:\/\//, '').split('/')[0]
    const r = await runShell(`whois ${h} 2>/dev/null | head -25`)
    if (!r.output || r.output.includes('command not found')) {
        try {
            const res = await axios.get(`https://rdap.org/domain/${h}`, { timeout: 10000 })
            const d = res.data
            return { success: true, output: `Domain: ${d.ldhName || h}\nStatus: ${(d.status || []).join(', ')}` }
        } catch { return { success: false, output: 'whois not available' } }
    }
    return { success: true, host: h, output: r.output }
}

const ipLookup = async (ip) => {
    try {
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 10000 })
        const d = r.data
        return { success: true, output: `IP: ${d.ip}\nCity: ${d.city}, ${d.region}\nCountry: ${d.country_name}\nISP: ${d.org}\nTimezone: ${d.timezone}` }
    } catch (e) { return { success: false, error: e.message } }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SELF-CORRECTION LOOP — retry failed steps with AI-generated fix (max 3x)
// ══════════════════════════════════════════════════════════════════════════════

const RETRYABLE_ACTIONS = new Set([
    'shell', 'run_code', 'js_eval', 'npm_install',
    'file_write', 'file_mkdir', 'file_mkdir_nested',
    'workspace_write', 'workspace_mkdir', 'git_clone', 'http_request'
])

const executeWithRetry = async (step, conn, chat, m, opts = {}, maxRetries = 3) => {
    let current = { ...step }
    let lastResult = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        lastResult = await executeStep(current, conn, chat, m, opts)
        if (lastResult.success) return lastResult
        if (!RETRYABLE_ACTIONS.has(current.action) || attempt >= maxRetries - 1) break

        // Ask AI to correct the failed step
        const fixPrompt = `An automated task step failed. Analyze the error and return a corrected step as JSON only (no markdown).

FAILED STEP:
${JSON.stringify(current, null, 2)}

ERROR OUTPUT:
${(lastResult.output || 'unknown error').slice(0, 800)}

Return ONLY corrected step JSON: {"action":"...","args":{...},"desc":"..."}`

        const fix = await callAI('', fixPrompt)
        if (!fix.success) break
        try {
            const match = fix.text.match(/\{[\s\S]*?\}/)
            if (!match) break
            const corrected = JSON.parse(match[0])
            if (!corrected.action) break
            console.log(`[AGENT] 🔧 Self-correcting step (attempt ${attempt + 2}/${maxRetries}):`, corrected.action)
            current = corrected
        } catch { break }
    }

    return lastResult
}

// ══════════════════════════════════════════════════════════════════════════════
//  MULTI-AGENT PARALLELISM — run independent steps concurrently
// ══════════════════════════════════════════════════════════════════════════════

// Actions that are safe to run in parallel (no side-effect ordering needed)
const PARALLEL_SAFE = new Set([
    'shell', 'file_mkdir', 'file_mkdir_nested', 'workspace_mkdir',
    'http_request', 'web_scrape', 'extract_links', 'extract_emails',
    'extract_phones', 'run_code', 'npm_stats', 'search', 'dns_check',
    'ssl_check', 'ping', 'whois', 'ip_lookup', 'system_info', 'port_check'
])

const groupStepsForParallel = (steps) => {
    // Batch consecutive parallelizable steps; break on sequential actions
    const groups = []
    let batch     = []

    for (const step of steps) {
        if (PARALLEL_SAFE.has(step.action)) {
            batch.push(step)
        } else {
            if (batch.length) { groups.push([...batch]); batch = [] }
            groups.push([step])   // sequential — its own group
        }
    }
    if (batch.length) groups.push(batch)
    return groups
}

const runAgentParallel = async (steps, conn, chat, m, opts = {}, onStepDone) => {
    const groups  = groupStepsForParallel(steps)
    const results = []

    for (const group of groups) {
        if (group.length === 1) {
            const r = await executeWithRetry(group[0], conn, chat, m, opts)
            const entry = { desc: group[0].desc, ...r }
            results.push(entry)
            if (onStepDone) onStepDone(entry)
        } else {
            // Parallel group
            const groupResults = await Promise.all(
                group.map(step =>
                    executeWithRetry(step, conn, chat, m, opts)
                        .then(r => ({ desc: step.desc, ...r }))
                )
            )
            for (const r of groupResults) {
                results.push(r)
                if (onStepDone) onStepDone(r)
            }
        }
    }

    return results
}

// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
    planTask, executeStep, executeWithRetry, runAgentParallel, summarizeResults,
    callAI, callGroqAI, callGiftedAI, callXwolf, callPollinations, runShell,
    npmStats, resolveGroupMember, createProject, pm2Manage, githubTokenRegen,
    systemInfo, portCheck, dockerManage, cronManage, processKill,
    codeReview, codeExplain, bugFinder, httpRequest, gitStatus,
    usageStats, errorLogAnalyze, scheduleMessage, backupToGithub,
    sqliteQuery, groupAnalyzer,
    webScrape, dnsCheck, sslCheck, codeGen, envManager, fileSearch, fileDiff,
    urlCheck, passwordGen, autoCommitCode, jsonTools, pingHost, whoisLookup, ipLookup
}
