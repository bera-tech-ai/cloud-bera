'use strict'
/**
 * supertools.js — Bera AI Power Pack
 * Adds: smart app builder, data analyst, deep crawler, load tester,
 *       JWT tools, SQLite manager, GitHub full manager, auto-fixer
 */
const axios  = require('axios')
const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const { exec } = require('child_process')

const GIFTED     = 'https://api.gifted.co.ke'
const GIFTED_KEY = process.env.GIFTED_API_KEY || ''
const PROJECTS   = '/tmp/projects'

const runShell = (cmd, timeout = 60000) => new Promise(resolve => {
    exec(cmd, { timeout, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
        const out = ((stdout || '').trim() + (stderr ? '\n[stderr]: ' + stderr.trim() : '')).slice(0, 4000)
        resolve({ success: !err, output: out || (err ? err.message : 'done') })
    })
})

const callAI = async (system, user) => {
    try {
        const q = system ? `${system}\n\n${user}` : user
        const res = await axios.get(`${GIFTED}/api/ai/gemini`, {
            params: { apikey: GIFTED_KEY, q: q.slice(0, 6000) },
            timeout: 60000
        })
        const text = res.data?.result || res.data?.response || res.data?.answer ||
                     (typeof res.data === 'string' ? res.data : null)
        if (!text) return { success: false, error: 'No AI response' }
        return { success: true, text: String(text).trim() }
    } catch (e) { return { success: false, error: e.message } }
}

// ══════════════════════════════════════════════════════════════════════════════
//  1. SMART APP BUILDER — AI generates real code for any framework
// ══════════════════════════════════════════════════════════════════════════════

const APP_TEMPLATES = {
    express: {
        deps: ['express', 'cors', 'dotenv'],
        devDeps: ['nodemon'],
        start: 'node index.js',
        dev: 'nodemon index.js',
        port: 3000,
        main: 'index.js',
        extra: {}
    },
    'express-api': {
        deps: ['express', 'cors', 'dotenv', 'helmet', 'morgan'],
        devDeps: ['nodemon'],
        start: 'node index.js',
        dev: 'nodemon index.js',
        port: 3000,
        main: 'index.js',
        extra: {}
    },
    vue: {
        deps: ['vue'],
        devDeps: ['vite', '@vitejs/plugin-vue'],
        start: 'vite preview',
        dev: 'vite',
        port: 5173,
        main: 'index.html',
        extra: { 'vite.config.js': "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\nexport default defineConfig({ plugins: [vue()], server: { port: 5173 } })" }
    },
    react: {
        deps: ['react', 'react-dom'],
        devDeps: ['vite', '@vitejs/plugin-react'],
        start: 'vite preview',
        dev: 'vite',
        port: 5173,
        main: 'index.html',
        extra: { 'vite.config.js': "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()], server: { port: 5173 } })" }
    },
    flask: {
        deps: [],
        devDeps: [],
        start: 'python3 app.py',
        dev: 'python3 app.py',
        port: 5000,
        main: 'app.py',
        lang: 'python',
        extra: { 'requirements.txt': 'flask\nflask-cors\nrequests\n' }
    },
    fastapi: {
        deps: [],
        devDeps: [],
        start: 'uvicorn main:app --host 0.0.0.0 --port 8000',
        dev: 'uvicorn main:app --reload --port 8000',
        port: 8000,
        main: 'main.py',
        lang: 'python',
        extra: { 'requirements.txt': 'fastapi\nuvicorn\nrequests\n' }
    },
    nextjs: {
        deps: ['next', 'react', 'react-dom'],
        devDeps: [],
        start: 'next start',
        dev: 'next dev',
        port: 3000,
        main: 'pages/index.js',
        extra: { 'next.config.js': "/** @type {import('next').NextConfig} */\nmodule.exports = {}" }
    },
    static: {
        deps: ['serve'],
        devDeps: [],
        start: 'serve . -p 3000 -s',
        dev: 'serve . -p 3000 -s',
        port: 3000,
        main: 'index.html',
        extra: {}
    },
    discord: {
        deps: ['discord.js', 'dotenv'],
        devDeps: ['nodemon'],
        start: 'node index.js',
        dev: 'nodemon index.js',
        port: 3000,
        main: 'index.js',
        extra: { '.env.example': 'TOKEN=your_discord_bot_token\n' }
    },
    telegram: {
        deps: ['node-telegram-bot-api', 'dotenv'],
        devDeps: ['nodemon'],
        start: 'node index.js',
        dev: 'nodemon index.js',
        port: 3000,
        main: 'index.js',
        extra: { '.env.example': 'BOT_TOKEN=your_telegram_bot_token\n' }
    }
}

const buildWebApp = async (name, type = 'express', description = '', port = null) => {
    const tpl = APP_TEMPLATES[type.toLowerCase()] || APP_TEMPLATES.express
    const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const projDir  = `${PROJECTS}/${safeName}`
    const usedPort = port || tpl.port
    const lang     = tpl.lang || 'javascript'
    const steps    = []

    // 1. Create directory
    await runShell(`rm -rf ${projDir} && mkdir -p ${projDir}`)
    steps.push({ step: 'mkdir', ok: true })

    // 2. AI generates the main file code
    const sysPrompt = `You are an expert ${lang === 'python' ? 'Python' : 'Node.js'} developer. 
Write COMPLETE, working, production-ready ${type} code. 
Return ONLY the code — no markdown fences, no explanations.
Requirements:
- App name: ${safeName}
- Framework: ${type}
- Port: ${usedPort}
- Language: ${lang}
- App purpose: ${description || 'a general web application'}
- Include: proper error handling, CORS if needed, clean routes
- For Express: include at least 3 routes (/, /api/status, and one feature route)
- For Flask/FastAPI: include at least 3 endpoints
- For React/Vue: include a beautiful responsive UI with real functionality`

    const aiRes = await callAI('', sysPrompt)
    const mainCode = aiRes.success ? aiRes.text : buildFallbackCode(type, safeName, usedPort)
    steps.push({ step: 'ai_codegen', ok: aiRes.success })

    // 3. Write main file
    const mainFile = tpl.main.includes('/') ? tpl.main : tpl.main
    const mainPath = `${projDir}/${mainFile}`
    if (mainFile.includes('/')) fs.mkdirSync(path.dirname(mainPath), { recursive: true })
    fs.writeFileSync(mainPath, mainCode)
    steps.push({ step: 'write_main', ok: true })

    // 4. Write extra files (configs, requirements, etc.)
    for (const [fname, fcontent] of Object.entries(tpl.extra || {})) {
        const fpath = `${projDir}/${fname}`
        if (fname.includes('/')) fs.mkdirSync(path.dirname(fpath), { recursive: true })
        fs.writeFileSync(fpath, fcontent)
    }

    // 5. Write README
    fs.writeFileSync(`${projDir}/README.md`,
        `# ${name}\n\n${description || `A ${type} application built by Bera AI`}\n\n## Run\n\`\`\`\n${tpl.dev}\n\`\`\`\n\n## Port\n${usedPort}`)

    // 6. Install dependencies
    if (lang !== 'python' && (tpl.deps.length || tpl.devDeps.length)) {
        // Write package.json
        const pkg = {
            name: safeName, version: '1.0.0', description: description || `${type} app by Bera AI`,
            main: tpl.main, scripts: { start: tpl.start, dev: tpl.dev },
            dependencies: Object.fromEntries(tpl.deps.map(d => [d, 'latest'])),
            devDependencies: Object.fromEntries(tpl.devDeps.map(d => [d, 'latest']))
        }
        fs.writeFileSync(`${projDir}/package.json`, JSON.stringify(pkg, null, 2))
        steps.push({ step: 'package.json', ok: true })

        const install = await runShell(`cd ${projDir} && npm install --loglevel=error 2>&1`, 90000)
        steps.push({ step: 'npm_install', ok: install.success, out: install.output.slice(0, 200) })
    } else if (lang === 'python' && fs.existsSync(`${projDir}/requirements.txt`)) {
        const pip = await runShell(`pip3 install -r ${projDir}/requirements.txt -q 2>&1`, 90000)
        steps.push({ step: 'pip_install', ok: pip.success, out: pip.output.slice(0, 200) })
    }

    // 7. Start with PM2
    const startCmd = lang === 'python'
        ? `pm2 delete ${safeName} 2>/dev/null; pm2 start ${projDir}/${tpl.main} --name ${safeName} --interpreter python3`
        : `pm2 delete ${safeName} 2>/dev/null; pm2 start ${projDir}/${tpl.main} --name ${safeName}`
    const pm2 = await runShell(startCmd, 30000)
    steps.push({ step: 'pm2_start', ok: pm2.success, out: pm2.output.slice(0, 200) })

    const allOk = steps.filter(s => !s.ok).length === 0
    return {
        success: true,
        name: safeName,
        type,
        dir: projDir,
        port: usedPort,
        mainFile: tpl.main,
        steps,
        summary: steps.map(s => `${s.ok ? '✅' : '⚠️'} ${s.step}`).join(' | ')
    }
}

const buildFallbackCode = (type, name, port) => {
    if (type === 'flask' || type === 'fastapi') {
        return `from flask import Flask, jsonify\napp = Flask(__name__)\n\n@app.route('/')\ndef home():\n    return jsonify({'app': '${name}', 'status': 'running', 'by': 'Bera AI'})\n\n@app.route('/api/status')\ndef status():\n    return jsonify({'ok': True})\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=${port}, debug=False)\n`
    }
    return `const express = require('express')\nconst app = express()\napp.use(express.json())\napp.get('/', (req, res) => res.json({ app: '${name}', status: 'running', by: 'Bera AI' }))\napp.get('/api/status', (req, res) => res.json({ ok: true }))\napp.listen(${port}, () => console.log('${name} on port ${port}'))\n`
}

// ══════════════════════════════════════════════════════════════════════════════
//  2. AUTO-FIX BUILDER — builds project, detects errors, self-corrects
// ══════════════════════════════════════════════════════════════════════════════

const autoFixBuild = async (projectDir, maxRetries = 3) => {
    let attempt = 0
    let lastError = ''
    const results = []

    while (attempt < maxRetries) {
        attempt++
        const mainFile = fs.existsSync(`${projectDir}/index.js`) ? 'index.js' :
                         fs.existsSync(`${projectDir}/app.py`)   ? 'app.py'   :
                         fs.existsSync(`${projectDir}/main.py`)  ? 'main.py'  : 'index.js'

        const testRun = await runShell(`cd ${projectDir} && timeout 5 node ${mainFile} 2>&1; echo EXIT:$?`, 10000)
        const hasError = testRun.output.includes('Error:') || testRun.output.includes('SyntaxError') ||
                         testRun.output.includes('Cannot find module') || testRun.output.includes('ENOENT')

        if (!hasError) {
            results.push({ attempt, fixed: false, output: 'No errors found' })
            return { success: true, attempts: attempt, results, fixed: false }
        }

        lastError = testRun.output
        results.push({ attempt, error: lastError.slice(0, 300) })

        // Ask AI to fix the error
        const code = fs.existsSync(`${projectDir}/${mainFile}`) ?
            fs.readFileSync(`${projectDir}/${mainFile}`, 'utf8').slice(0, 3000) : ''

        const fix = await callAI(
            'You are an expert Node.js debugger. Fix the code. Return ONLY the fixed code, no markdown.',
            `Code:\n${code}\n\nError:\n${lastError.slice(0, 500)}\n\nFix it completely.`
        )

        if (!fix.success) break

        fs.writeFileSync(`${projectDir}/${mainFile}`, fix.text)
        results[results.length - 1].fixed = true
    }

    return { success: false, attempts: attempt, results, lastError: lastError.slice(0, 300) }
}

// ══════════════════════════════════════════════════════════════════════════════
//  3. DATA ANALYST — CSV/JSON analysis with stats, patterns, insights
// ══════════════════════════════════════════════════════════════════════════════

const analyzeData = async (input, question = '') => {
    try {
        let parsed
        let dataType = 'unknown'
        let raw = typeof input === 'string' ? input.trim() : JSON.stringify(input)

        // Try JSON first
        try {
            parsed = JSON.parse(raw)
            dataType = Array.isArray(parsed) ? 'json_array' : 'json_object'
        } catch {
            // Try CSV
            const lines = raw.split('\n').filter(l => l.trim())
            if (lines.length > 1) {
                const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
                parsed = lines.slice(1).map(line => {
                    const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
                    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']))
                })
                dataType = 'csv'
            }
        }

        if (!parsed) return { success: false, error: 'Could not parse data as JSON or CSV' }

        const rows = Array.isArray(parsed) ? parsed : [parsed]
        const keys = rows.length ? Object.keys(rows[0]) : []

        // Basic stats per column
        const stats = {}
        for (const key of keys) {
            const vals = rows.map(r => r[key]).filter(v => v !== undefined && v !== '')
            const nums = vals.map(Number).filter(n => !isNaN(n))
            if (nums.length > 0) {
                const sum  = nums.reduce((a, b) => a + b, 0)
                const avg  = sum / nums.length
                const sorted = [...nums].sort((a, b) => a - b)
                stats[key] = {
                    type: 'numeric',
                    count: nums.length,
                    min: sorted[0],
                    max: sorted[sorted.length - 1],
                    avg: +avg.toFixed(4),
                    median: sorted[Math.floor(sorted.length / 2)],
                    sum: +sum.toFixed(4)
                }
            } else {
                const unique = [...new Set(vals)]
                const freq = {}
                vals.forEach(v => { freq[v] = (freq[v] || 0) + 1 })
                const topVals = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5)
                stats[key] = {
                    type: 'text',
                    count: vals.length,
                    unique: unique.length,
                    topValues: topVals.map(([v, c]) => `${v}(${c})`)
                }
            }
        }

        // Ask AI for insights
        const aiPrompt = `Analyze this dataset and give 3-5 key insights. Be specific with numbers.
Dataset: ${dataType}, ${rows.length} rows, ${keys.length} columns: ${keys.join(', ')}
Stats: ${JSON.stringify(stats, null, 1).slice(0, 2000)}
${question ? 'User question: ' + question : 'General insights:'}`

        const aiRes = await callAI('You are a data analyst. Give clear, numbered insights with exact numbers.', aiPrompt)

        const statLines = Object.entries(stats).slice(0, 8).map(([k, s]) =>
            s.type === 'numeric'
                ? `📊 *${k}*: min=${s.min}, max=${s.max}, avg=${s.avg}, sum=${s.sum}`
                : `📝 *${k}*: ${s.unique} unique values, top: ${s.topValues.slice(0, 3).join(', ')}`
        )

        return {
            success: true,
            dataType,
            rows: rows.length,
            columns: keys.length,
            columnNames: keys,
            stats,
            statSummary: statLines.join('\n'),
            insights: aiRes.success ? aiRes.text : 'No AI insights available',
        }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  4. DEEP SITE CRAWLER — follows links, maps entire websites
// ══════════════════════════════════════════════════════════════════════════════

const UA = 'Mozilla/5.0 (compatible; BeraBot/3.0)'

const crawlSite = async (startUrl, maxDepth = 2, maxPages = 20) => {
    const visited = new Set()
    const results = []
    const queue   = [{ url: startUrl, depth: 0 }]

    const base = (() => { try { return new URL(startUrl).origin } catch { return '' } })()

    const fetchPage = async (url) => {
        try {
            const res = await axios.get(url, {
                timeout: 12000, headers: { 'User-Agent': UA },
                maxContentLength: 2 * 1024 * 1024, validateStatus: s => s < 500
            })
            const html = String(res.data || '')
            const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || ''
            const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 500)

            // Extract internal links
            const links = []
            const rx = /href=["']([^"'#?][^"']*?)["']/gi
            let m
            while ((m = rx.exec(html)) !== null) {
                try {
                    const abs = new URL(m[1], url).href
                    if (abs.startsWith(base) && !visited.has(abs) && !abs.match(/\.(pdf|zip|jpg|png|gif|mp4|mp3|css|js)$/i)) {
                        links.push(abs)
                    }
                } catch {}
            }

            return { success: true, url, title, text, status: res.status, links: [...new Set(links)].slice(0, 15) }
        } catch (e) {
            return { success: false, url, error: e.message, links: [] }
        }
    }

    while (queue.length > 0 && results.length < maxPages) {
        const { url, depth } = queue.shift()
        if (visited.has(url)) continue
        visited.add(url)

        const page = await fetchPage(url)
        results.push({ ...page, depth })

        if (depth < maxDepth && page.links) {
            for (const link of page.links.slice(0, 5)) {
                if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 })
            }
        }

        await new Promise(r => setTimeout(r, 300)) // polite crawl
    }

    const successful = results.filter(r => r.success)
    const failed     = results.filter(r => !r.success)

    return {
        success: true,
        baseUrl: startUrl,
        pagesFound: results.length,
        pagesSuccess: successful.length,
        pagesFailed: failed.length,
        maxDepth,
        pages: results.map(r => ({
            url: r.url, depth: r.depth, title: r.title || '(no title)',
            status: r.status, ok: r.success, preview: (r.text || '').slice(0, 120)
        }))
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  5. LOAD TESTER — concurrent requests, timing analysis
// ══════════════════════════════════════════════════════════════════════════════

const loadTest = async (url, requests = 20, concurrency = 5, method = 'GET', body = null) => {
    const results = []
    const start = Date.now()

    const doRequest = async () => {
        const t0 = Date.now()
        try {
            const res = await axios.request({
                method: method.toUpperCase(), url,
                data: body, timeout: 15000, validateStatus: () => true,
                headers: { 'User-Agent': UA, 'Content-Type': 'application/json' }
            })
            return { ok: res.status >= 200 && res.status < 300, status: res.status, ms: Date.now() - t0 }
        } catch (e) {
            return { ok: false, status: 0, ms: Date.now() - t0, error: e.code || e.message }
        }
    }

    // Run in batches
    const total = Math.min(requests, 100)
    const batches = Math.ceil(total / concurrency)

    for (let b = 0; b < batches; b++) {
        const batchSize = Math.min(concurrency, total - results.length)
        const batch = await Promise.all(Array.from({ length: batchSize }, doRequest))
        results.push(...batch)
    }

    const totalMs = Date.now() - start
    const ok      = results.filter(r => r.ok)
    const times   = results.map(r => r.ms).sort((a, b) => a - b)
    const avgMs   = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const p50     = times[Math.floor(times.length * 0.50)]
    const p90     = times[Math.floor(times.length * 0.90)]
    const p99     = times[Math.floor(times.length * 0.99)] || times[times.length - 1]

    const statusGroups = {}
    results.forEach(r => { statusGroups[r.status] = (statusGroups[r.status] || 0) + 1 })

    return {
        success: true,
        url, method,
        totalRequests: results.length,
        successful: ok.length,
        failed: results.length - ok.length,
        successRate: `${((ok.length / results.length) * 100).toFixed(1)}%`,
        totalTimeMs: totalMs,
        rps: +(results.length / (totalMs / 1000)).toFixed(2),
        latency: { avg: avgMs, p50, p90, p99, min: times[0], max: times[times.length - 1] },
        statusCodes: statusGroups,
        concurrency
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  6. JWT TOOLS — encode, decode, verify, generate API keys
// ══════════════════════════════════════════════════════════════════════════════

const jwtTools = (action, payload = {}, secret = 'bera-ai-secret', expiresIn = '24h') => {
    try {
        if (action === 'encode' || action === 'sign') {
            // Manual JWT (HS256) without external library
            const header  = { alg: 'HS256', typ: 'JWT' }
            const now     = Math.floor(Date.now() / 1000)
            const expSecs = expiresIn.endsWith('h') ? parseInt(expiresIn) * 3600
                          : expiresIn.endsWith('d') ? parseInt(expiresIn) * 86400
                          : parseInt(expiresIn)
            const claims  = { iat: now, exp: now + expSecs, ...payload }

            const b64url  = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
            const headerB64  = b64url(header)
            const payloadB64 = b64url(claims)
            const sig = crypto.createHmac('sha256', secret)
                              .update(`${headerB64}.${payloadB64}`).digest('base64url')
            const token = `${headerB64}.${payloadB64}.${sig}`

            return { success: true, token, expiresIn, header, payload: claims }
        }

        if (action === 'decode' || action === 'verify') {
            const token = typeof payload === 'string' ? payload : payload.token || ''
            const parts = token.split('.')
            if (parts.length !== 3) return { success: false, error: 'Invalid JWT format (need 3 parts)' }

            const hdr = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
            const pay = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
            const now = Math.floor(Date.now() / 1000)
            const expired = pay.exp && pay.exp < now

            let sigValid = null
            if (secret) {
                const expected = crypto.createHmac('sha256', secret)
                                       .update(`${parts[0]}.${parts[1]}`).digest('base64url')
                sigValid = expected === parts[2]
            }

            return { success: true, header: hdr, payload: pay, expired, expiresAt: pay.exp ? new Date(pay.exp * 1000).toISOString() : null, signatureValid: sigValid }
        }

        if (action === 'apikey') {
            const prefix  = typeof payload === 'string' ? payload : 'bera'
            const key     = `${prefix}_${crypto.randomBytes(24).toString('hex')}`
            const keyHash = crypto.createHash('sha256').update(key).digest('hex')
            return { success: true, apiKey: key, hash: keyHash, prefix, length: key.length }
        }

        if (action === 'hash') {
            const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
            return {
                success: true,
                input,
                md5:    crypto.createHash('md5').update(input).digest('hex'),
                sha1:   crypto.createHash('sha1').update(input).digest('hex'),
                sha256: crypto.createHash('sha256').update(input).digest('hex'),
                sha512: crypto.createHash('sha512').update(input).digest('hex'),
            }
        }

        if (action === 'base64encode') {
            const inp = typeof payload === 'string' ? payload : JSON.stringify(payload)
            return { success: true, input: inp, encoded: Buffer.from(inp).toString('base64') }
        }

        if (action === 'base64decode') {
            const inp = typeof payload === 'string' ? payload : ''
            const decoded = Buffer.from(inp, 'base64').toString('utf8')
            return { success: true, encoded: inp, decoded }
        }

        return { success: false, error: 'Unknown action. Use: encode, decode, verify, apikey, hash, base64encode, base64decode' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  7. SQLITE MANAGER — create DBs, tables, insert, query, schema
// ══════════════════════════════════════════════════════════════════════════════

const sqliteManage = async (action, dbPath, query = '', data = {}) => {
    const fullPath = dbPath.startsWith('/') ? dbPath : `/tmp/dbs/${dbPath}`
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })

    const runSql = (sql) => runShell(`sqlite3 "${fullPath}" "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1`, 20000)
    const runSqlFile = (sql) => {
        const tmp = `/tmp/bera_sql_${Date.now()}.sql`
        fs.writeFileSync(tmp, sql)
        return runShell(`sqlite3 "${fullPath}" < "${tmp}" 2>&1`, 20000).then(r => { try { fs.unlinkSync(tmp) } catch {} return r })
    }

    if (action === 'create') {
        // query = table definition like: "users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
        const sql = `CREATE TABLE IF NOT EXISTS ${query};`
        const r = await runSqlFile(sql)
        return { success: r.success, output: r.success ? `✅ Table created in ${path.basename(fullPath)}` : `❌ ${r.output}` }
    }

    if (action === 'schema') {
        const r = await runSql('.schema')
        return { success: true, output: r.output || '(empty database)' }
    }

    if (action === 'tables') {
        const r = await runSql('.tables')
        return { success: true, output: `Tables: ${r.output || '(none)'}` }
    }

    if (action === 'insert') {
        // query = table name, data = {col: val, ...}
        const cols = Object.keys(data).join(', ')
        const vals = Object.values(data).map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ')
        const sql  = `INSERT INTO ${query} (${cols}) VALUES (${vals});`
        const r = await runSqlFile(sql)
        return { success: r.success, output: r.success ? `✅ Row inserted into ${query}` : `❌ ${r.output}` }
    }

    if (action === 'query' || action === 'select') {
        const sql = query.trim().toUpperCase().startsWith('SELECT') ? query : `SELECT * FROM ${query} LIMIT 20;`
        const r = await runShell(`sqlite3 -column -header "${fullPath}" "${sql.replace(/"/g, '\\"')}" 2>&1`, 15000)
        return { success: r.success, output: r.output || '(no results)' }
    }

    if (action === 'run' || action === 'exec') {
        const r = await runSqlFile(query)
        return { success: r.success, output: r.output || '✅ Done' }
    }

    if (action === 'drop') {
        const r = await runSql(`DROP TABLE IF EXISTS ${query};`)
        return { success: r.success, output: r.success ? `✅ Table ${query} dropped` : `❌ ${r.output}` }
    }

    if (action === 'info') {
        const tables = await runSql('.tables')
        const schema = await runSql('.schema')
        const size = fs.existsSync(fullPath) ? `${(fs.statSync(fullPath).size / 1024).toFixed(1)} KB` : 'new'
        return { success: true, output: `📦 DB: ${path.basename(fullPath)} (${size})\n\n📋 Tables:\n${tables.output || '(none)'}\n\n🏗️ Schema:\n${schema.output || '(empty)'}` }
    }

    if (action === 'seed') {
        // Use AI to generate seed data based on schema
        const schema = await runSql('.schema')
        const aiRes  = await callAI(
            'Generate realistic seed SQL INSERT statements. Return ONLY valid SQL, no markdown.',
            `Schema:\n${schema.output}\n\nGenerate 5-10 realistic INSERT statements per table.`
        )
        if (!aiRes.success) return { success: false, error: 'AI seed generation failed' }
        const r = await runSqlFile(aiRes.text)
        return { success: r.success, output: r.success ? `✅ Database seeded with AI-generated data` : `❌ ${r.output}` }
    }

    return { success: false, error: 'Unknown action. Use: create, schema, tables, insert, query, run, drop, info, seed' }
}

// ══════════════════════════════════════════════════════════════════════════════
//  8. GITHUB FULL MANAGER — repos, issues, PRs, files, commits
// ══════════════════════════════════════════════════════════════════════════════

const githubManage = async (action, opts = {}) => {
    const token = process.env.GITHUB_TOKEN || ''
    if (!token) return { success: false, error: 'No GitHub credential is configured in the host environment.' }

    const gh = async (endpoint, method = 'GET', data = null) => {
        try {
            const res = await axios({
                method, url: `https://api.github.com${endpoint}`,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'BeraBot/3.0',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                data, timeout: 25000, validateStatus: () => true
            })
            return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data }
        } catch (e) {
            return { ok: false, status: 0, data: null, error: e.message }
        }
    }

    const getUser = async () => {
        const r = await gh('/user')
        return r.ok ? r.data.login : null
    }

    switch (action) {
        case 'whoami': {
            const r = await gh('/user')
            if (!r.ok) return { success: false, error: 'Auth failed' }
            return { success: true, output: `👤 *${r.data.name || r.data.login}*\n📧 ${r.data.email || 'hidden'}\n⭐ ${r.data.public_repos} public repos | 👥 ${r.data.followers} followers\n🔗 ${r.data.html_url}` }
        }

        case 'list_repos': {
            const r = await gh(`/user/repos?per_page=20&sort=updated&affiliation=owner`)
            if (!r.ok) return { success: false, error: r.data?.message }
            const repos = r.data.map(repo =>
                `${repo.private ? '🔒' : '🌐'} *${repo.name}* — ${repo.description || 'no desc'} [${repo.language || '?'}] ⭐${repo.stargazers_count}`
            )
            return { success: true, output: `📁 Your repos (${repos.length}):\n\n${repos.join('\n')}` }
        }

        case 'create_repo': {
            const r = await gh('/user/repos', 'POST', {
                name: opts.name, description: opts.description || '', private: !!opts.private, auto_init: true
            })
            if (!r.ok) return { success: false, error: r.data?.message || 'Create failed' }
            return { success: true, output: `✅ Repo created!\n🔗 ${r.data.html_url}\n📦 Clone: ${r.data.clone_url}`, url: r.data.html_url }
        }

        case 'delete_repo': {
            const owner = opts.owner || await getUser()
            const r = await gh(`/repos/${owner}/${opts.repo}`, 'DELETE')
            return { success: r.status === 204, output: r.status === 204 ? `✅ Deleted ${opts.repo}` : `❌ Delete failed: ${r.data?.message}` }
        }

        case 'create_issue': {
            const r = await gh(`/repos/${opts.owner}/${opts.repo}/issues`, 'POST', {
                title: opts.title, body: opts.body || '', labels: opts.labels || []
            })
            if (!r.ok) return { success: false, error: r.data?.message }
            return { success: true, output: `✅ Issue #${r.data.number} created!\n🔗 ${r.data.html_url}` }
        }

        case 'list_issues': {
            const r = await gh(`/repos/${opts.owner}/${opts.repo}/issues?state=open&per_page=10`)
            if (!r.ok) return { success: false, error: r.data?.message }
            if (!r.data.length) return { success: true, output: '✅ No open issues.' }
            const list = r.data.map(i => `#${i.number} *${i.title}* — by ${i.user.login}`).join('\n')
            return { success: true, output: `🐛 Open Issues (${r.data.length}):\n\n${list}` }
        }

        case 'commit_file': {
            const owner = opts.owner || await getUser()
            const filePath = opts.path
            // Get current SHA if file exists
            const existing = await gh(`/repos/${owner}/${opts.repo}/contents/${filePath}`)
            const sha = existing.ok && existing.data?.sha ? existing.data.sha : undefined
            const body = {
                message: opts.message || `Update ${filePath} via Bera AI`,
                content: Buffer.from(opts.content || '').toString('base64')
            }
            if (sha) body.sha = sha
            const r = await gh(`/repos/${owner}/${opts.repo}/contents/${filePath}`, 'PUT', body)
            if (!r.ok) return { success: false, error: r.data?.message }
            return { success: true, output: `✅ File committed!\n📁 ${filePath}\n🔗 ${r.data.content?.html_url || ''}` }
        }

        case 'read_file': {
            const r = await gh(`/repos/${opts.owner}/${opts.repo}/contents/${opts.path}`)
            if (!r.ok) return { success: false, error: r.data?.message || 'File not found' }
            const content = Buffer.from(r.data.content || '', 'base64').toString('utf8').slice(0, 3000)
            return { success: true, output: `📄 *${opts.path}*\n\n\`\`\`\n${content}\n\`\`\`` }
        }

        case 'get_commits': {
            const r = await gh(`/repos/${opts.owner}/${opts.repo}/commits?per_page=8`)
            if (!r.ok) return { success: false, error: r.data?.message }
            const list = r.data.map(c => `• \`${c.sha.slice(0,7)}\` — ${c.commit.message.split('\n')[0].slice(0,60)} _by ${c.commit.author.name}_`).join('\n')
            return { success: true, output: `📜 Recent commits:\n\n${list}` }
        }

        case 'fork': {
            const r = await gh(`/repos/${opts.owner}/${opts.repo}/forks`, 'POST', {})
            if (!r.ok) return { success: false, error: r.data?.message }
            return { success: true, output: `✅ Forked! ${r.data.html_url}` }
        }

        case 'star': {
            const owner = opts.owner
            const r = await gh(`/user/starred/${owner}/${opts.repo}`, 'PUT')
            return { success: r.status === 204, output: r.status === 204 ? `⭐ Starred ${opts.repo}!` : `Already starred or failed` }
        }

        case 'search_repos': {
            const r = await gh(`/search/repositories?q=${encodeURIComponent(opts.query)}&sort=stars&per_page=8`)
            if (!r.ok) return { success: false, error: r.data?.message }
            const list = r.data.items.map(repo =>
                `⭐${repo.stargazers_count} *${repo.full_name}* — ${(repo.description || 'no desc').slice(0, 60)}\n🔗 ${repo.html_url}`
            ).join('\n\n')
            return { success: true, output: `🔍 GitHub search: "${opts.query}"\n\n${list}` }
        }

        default:
            return { success: false, error: `Unknown GitHub action: ${action}. Use: whoami, list_repos, create_repo, delete_repo, create_issue, list_issues, commit_file, read_file, get_commits, fork, star, search_repos` }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  9. GENERATE DOCS & TESTS — from any code
// ══════════════════════════════════════════════════════════════════════════════

const generateDocs = async (code, language = 'javascript', style = 'markdown') => {
    const sys = `You are a technical documentation expert. Generate clear, comprehensive documentation for this ${language} code.
Include: overview, functions/methods, parameters, return values, usage examples.
Format: ${style}. Be thorough but concise.`
    const r = await callAI(sys, `Document this code:\n\`\`\`${language}\n${code.slice(0, 5000)}\n\`\`\``)
    return { success: r.success, docs: r.text || r.error }
}

const generateTests = async (code, language = 'javascript', framework = 'jest') => {
    const sys = `You are a senior test engineer. Write comprehensive unit tests for this ${language} code.
Use ${framework}. Include: happy path tests, edge cases, error cases. Return ONLY the test code.`
    const r = await callAI(sys, `Write tests for:\n\`\`\`${language}\n${code.slice(0, 5000)}\n\`\`\``)
    return { success: r.success, tests: r.text || r.error }
}

// ══════════════════════════════════════════════════════════════════════════════
//  10. API GENERATOR — describe → working REST API
// ══════════════════════════════════════════════════════════════════════════════

const generateAPI = async (description, port = 4000) => {
    const sys = `You are an expert Node.js/Express developer. Generate a COMPLETE, working REST API.
Requirements:
- Use Express.js
- Port: ${port}
- Include realistic CRUD routes (GET all, GET one, POST, PUT, DELETE)
- Use in-memory data store (no database needed)
- Include proper status codes, error handling
- Include /api/status health endpoint
- Return ONLY the complete index.js code, no markdown`

    const r = await callAI(sys, `Build a REST API for: ${description}`)
    if (!r.success) return { success: false, error: r.error }

    const apiName  = description.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)
    const projDir  = `${PROJECTS}/${apiName}-api`
    await runShell(`mkdir -p ${projDir}`)

    fs.writeFileSync(`${projDir}/index.js`, r.text)
    fs.writeFileSync(`${projDir}/package.json`, JSON.stringify({
        name: `${apiName}-api`, version: '1.0.0', main: 'index.js',
        scripts: { start: 'node index.js' },
        dependencies: { express: 'latest', cors: 'latest' }
    }, null, 2))

    const install = await runShell(`cd ${projDir} && npm install --loglevel=error 2>&1`, 60000)
    const pm2 = await runShell(`pm2 delete ${apiName}-api 2>/dev/null; pm2 start ${projDir}/index.js --name ${apiName}-api`, 20000)

    return {
        success: true,
        name: `${apiName}-api`,
        dir: projDir,
        port,
        code: r.text,
        installed: install.success,
        running: pm2.success
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  11. WEB COMPARE — compare multiple APIs or websites side-by-side
// ══════════════════════════════════════════════════════════════════════════════

const compareAPIs = async (urls, method = 'GET', body = null) => {
    const results = await Promise.all(urls.slice(0, 6).map(async url => {
        const t0 = Date.now()
        try {
            const res = await axios.request({
                method, url, data: body, timeout: 15000, validateStatus: () => true,
                headers: { 'User-Agent': UA, 'Content-Type': 'application/json' }
            })
            const ms = Date.now() - t0
            let preview = ''
            try { preview = JSON.stringify(res.data).slice(0, 200) } catch { preview = String(res.data).slice(0, 200) }
            return { url: url.slice(0, 50), status: res.status, ms, ok: res.status >= 200 && res.status < 300, preview }
        } catch (e) {
            return { url: url.slice(0, 50), status: 0, ms: Date.now() - t0, ok: false, error: e.code || e.message }
        }
    }))

    const fastest = results.filter(r => r.ok).sort((a, b) => a.ms - b.ms)[0]
    const summary = results.map(r =>
        `${r.ok ? '✅' : '❌'} ${r.url}\n   Status: ${r.status} | Time: ${r.ms}ms${r.error ? ' | Error: ' + r.error : ''}`
    ).join('\n\n')

    return {
        success: true,
        count: results.length,
        summary,
        fastest: fastest ? `🏆 Fastest: ${fastest.url} (${fastest.ms}ms)` : 'No successful responses',
        results
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  12. MARKDOWN TOOLS — convert, render, generate
// ══════════════════════════════════════════════════════════════════════════════

const markdownTools = async (action, input) => {
    if (action === 'to_html') {
        // Simple markdown → HTML without external deps
        let html = input
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/\n\n/g, '</p><p>')
        html = `<html><body><p>${html}</p></body></html>`
        return { success: true, html }
    }

    if (action === 'generate') {
        const r = await callAI('Generate well-structured markdown documentation. Use headers, tables, code blocks.', input)
        return { success: r.success, markdown: r.text || r.error }
    }

    if (action === 'table') {
        // Convert JSON array to markdown table
        try {
            const data = typeof input === 'string' ? JSON.parse(input) : input
            if (!Array.isArray(data) || !data.length) return { success: false, error: 'Need array of objects' }
            const keys = Object.keys(data[0])
            const header = `| ${keys.join(' | ')} |`
            const sep    = `| ${keys.map(() => '---').join(' | ')} |`
            const rows   = data.slice(0, 50).map(row => `| ${keys.map(k => String(row[k] ?? '')).join(' | ')} |`)
            return { success: true, table: [header, sep, ...rows].join('\n') }
        } catch (e) { return { success: false, error: e.message } }
    }

    return { success: false, error: 'Unknown action. Use: to_html, generate, table' }
}

module.exports = {
    buildWebApp,
    autoFixBuild,
    analyzeData,
    crawlSite,
    loadTest,
    jwtTools,
    sqliteManage,
    githubManage,
    generateDocs,
    generateTests,
    generateAPI,
    compareAPIs,
    markdownTools,
    APP_TEMPLATES,
}
