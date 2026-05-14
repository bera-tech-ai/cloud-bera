'use strict'
/**
 * Developer Tools Plugin — HTTP requests, QR codes, hashing, encoding, JWT, etc.
 * Commands: .http, .qrgen, .qrscan, .hash, .jwtgen, .jwtverify, .encode2, .decode2,
 *           .mathcalc, .unitconv, .currency2, .csvparse, .yamlparse, .template2
 */
const crypto = require('crypto')
const { httpRequest, formatHttpResult } = require('../Library/actions/httptools')
const { evalMath, convertUnit, convertCurrency } = require('../Library/actions/devmath')

const react = (conn, m, e) => conn.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {})

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {

    // ── .http GET|POST|PUT|DELETE <url> [body] ────────────────────────────────
    if (command === 'http' || command === 'httpreq' || command === 'request') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(
            `❌ *Usage:* ${prefix}http <METHOD> <url> [json-body]\n\n` +
            `Examples:\n` +
            `• ${prefix}http GET https://api.ipify.org?format=json\n` +
            `• ${prefix}http POST https://httpbin.org/post {"key":"value"}\n` +
            `• ${prefix}http GET https://api.coindesk.com/v1/bpi/currentprice.json`
        )

        const parts = text.trim().split(/\s+/)
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
        let method, url, bodyStr

        if (methods.includes(parts[0]?.toUpperCase())) {
            method = parts[0].toUpperCase()
            url = parts[1]
            bodyStr = parts.slice(2).join(' ')
        } else {
            method = 'GET'
            url = parts[0]
            bodyStr = parts.slice(1).join(' ')
        }

        if (!url) return reply(`❌ Please provide a URL.`)

        let body = null
        if (bodyStr) {
            try { body = JSON.parse(bodyStr) } catch { body = bodyStr }
        }

        await react(conn, m, '🌐')
        const res = await httpRequest({ method, url, body })
        await react(conn, m, res.success ? '✅' : '❌')
        return reply(formatHttpResult(res, method, url))
    }

    // ── .hash <algo> <text> ───────────────────────────────────────────────────
    if (command === 'hash' || command === 'hashtext') {
        if (!text) return reply(`❌ Usage: ${prefix}hash <md5|sha256|sha512|sha1> <text>`)
        const parts = text.trim().split(/\s+/)
        const algoInput = parts[0].toLowerCase()
        const input = parts.slice(1).join(' ')
        if (!input) return reply(`❌ Provide text after the algorithm. E.g. ${prefix}hash sha256 hello`)

        const algoMap = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512', sha384: 'sha384' }
        const algo = algoMap[algoInput]
        if (!algo) return reply(`❌ Unsupported algorithm: \`${algoInput}\`\nSupported: md5, sha1, sha256, sha512`)

        const result = crypto.createHash(algo).update(input).digest('hex')
        return reply(
            `╭══〘 *🔑 HASH* 〙═⊷\n` +
            `┃ Algorithm: \`${algo.toUpperCase()}\`\n` +
            `┃ Input: \`${input.slice(0, 50)}${input.length > 50 ? '…' : ''}\`\n` +
            `┃\n` +
            `┃ Result:\n` +
            `┃ \`${result}\`\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .encode2 <type> <text> ────────────────────────────────────────────────
    if (command === 'encode2') {
        if (!text) return reply(`❌ Usage: ${prefix}encode2 <base64|hex|binary|rot13|morse|url> <text>`)
        const parts = text.trim().split(/\s+/)
        const type = parts[0].toLowerCase()
        const input = parts.slice(1).join(' ')
        if (!input) return reply(`❌ Provide text to encode.`)

        let result = ''
        if (type === 'base64') result = Buffer.from(input).toString('base64')
        else if (type === 'hex') result = Buffer.from(input).toString('hex')
        else if (type === 'binary') result = input.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ')
        else if (type === 'rot13') result = input.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)))
        else if (type === 'url') result = encodeURIComponent(input)
        else if (type === 'morse') {
            const MORSE = { a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',y:'-.--',z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.' }
            result = input.toLowerCase().split('').map(c => c === ' ' ? '/' : (MORSE[c] || '?')).join(' ')
        }
        else return reply(`❌ Unknown type. Supported: base64, hex, binary, rot13, url, morse`)

        return reply(`╭══〘 *🔐 ENCODE* 〙═⊷\n┃ Type: \`${type}\`\n┃ Input: \`${input.slice(0, 40)}\`\n┃\n┃ Result:\n\`${result.slice(0, 1500)}\`\n╰══════════════════⊷`)
    }

    // ── .decode2 <type> <text> ────────────────────────────────────────────────
    if (command === 'decode2') {
        if (!text) return reply(`❌ Usage: ${prefix}decode2 <base64|hex|binary|url> <encoded>`)
        const parts = text.trim().split(/\s+/)
        const type = parts[0].toLowerCase()
        const input = parts.slice(1).join(' ')
        if (!input) return reply(`❌ Provide encoded text.`)

        let result = ''
        try {
            if (type === 'base64') result = Buffer.from(input, 'base64').toString('utf8')
            else if (type === 'hex') result = Buffer.from(input.replace(/\s+/g, ''), 'hex').toString('utf8')
            else if (type === 'binary') result = input.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('')
            else if (type === 'url') result = decodeURIComponent(input)
            else return reply(`❌ Unknown type. Supported: base64, hex, binary, url`)
        } catch (e) {
            return reply(`❌ Decode failed: ${e.message}`)
        }
        return reply(`╭══〘 *🔓 DECODE* 〙═⊷\n┃ Type: \`${type}\`\n┃\n┃ Result:\n\`${result.slice(0, 1500)}\`\n╰══════════════════⊷`)
    }

    // ── .jwtgen <secret> <payload-json> ──────────────────────────────────────
    if (command === 'jwtgen') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}jwtgen <secret> <json-payload>\nExample: ${prefix}jwtgen mySecret {"userId":1,"role":"admin"}`)
        const parts = text.trim().split(/\s+/)
        const secret = parts[0]
        const payloadStr = parts.slice(1).join(' ')
        let payload = { sub: 'bera', iat: Math.floor(Date.now() / 1000) }
        try { payload = { ...JSON.parse(payloadStr), iat: Math.floor(Date.now() / 1000) } } catch {}

        try {
            const jwt = require('jsonwebtoken')
            const token = jwt.sign(payload, secret, { expiresIn: '1h' })
            return reply(`╭══〘 *🔑 JWT GENERATED* 〙═⊷\n┃ Payload: \`${JSON.stringify(payload)}\`\n┃ Expires: 1 hour\n┃\n┃ Token:\n\`${token}\`\n╰══════════════════⊷`)
        } catch (e) { return reply(`❌ JWT generation failed: ${e.message}`) }
    }

    // ── .jwtverify <secret> <token> ───────────────────────────────────────────
    if (command === 'jwtverify') {
        if (!text) return reply(`❌ Usage: ${prefix}jwtverify <secret> <token>`)
        const parts = text.trim().split(/\s+/)
        const secret = parts[0]
        const token = parts.slice(1).join(' ')
        if (!token) return reply(`❌ Provide the JWT token.`)

        try {
            const jwt = require('jsonwebtoken')
            const decoded = jwt.verify(token, secret)
            return reply(`╭══〘 *✅ JWT VALID* 〙═⊷\n┃ Payload:\n\`${JSON.stringify(decoded, null, 2)}\`\n╰══════════════════⊷`)
        } catch (e) {
            return reply(`╭══〘 *❌ JWT INVALID* 〙═⊷\n┃ Error: ${e.message}\n╰══════════════════⊷`)
        }
    }

    // ── .mathcalc <expression> ────────────────────────────────────────────────
    if (command === 'mathcalc' || command === 'compute') {
        if (!text) return reply(`❌ Usage: ${prefix}mathcalc <expression>\nExamples:\n• 2^32\n• sin(45 deg)\n• sqrt(144)\n• (5! + 3) / 2`)
        const res = await evalMath(text.trim())
        if (!res.success) return reply(`❌ Math error: ${res.error}`)
        return reply(`╭══〘 *🧮 CALCULATOR* 〙═⊷\n┃ Expression: \`${res.expression}\`\n┃ Result: *${res.result}*\n╰══════════════════⊷`)
    }

    // ── .unitconv <value> <from> to <to> ─────────────────────────────────────
    if (command === 'unitconv') {
        if (!text) return reply(`❌ Usage: ${prefix}unitconv <value> <from> to <to>\nExamples:\n• 100 km to miles\n• 10 kg to lb\n• 100 celsius to fahrenheit`)
        const match = text.trim().match(/^(\d+(?:\.\d+)?)\s+(\S+)\s+to\s+(\S+)$/i)
        if (!match) return reply(`❌ Format: ${prefix}unitconv <number> <from> to <to>\nExample: ${prefix}unitconv 100 km to miles`)
        const [, value, from, to] = match
        const res = convertUnit(parseFloat(value), from, to)
        if (!res.success) return reply(`❌ Conversion failed: ${res.error}`)
        return reply(`╭══〘 *🔄 UNIT CONVERTER* 〙═⊷\n┃ ${res.formatted}\n╰══════════════════⊷`)
    }

    // ── .currency2 <amount> <from> to <to> ────────────────────────────────────
    if (command === 'currency2') {
        if (!text) return reply(`❌ Usage: ${prefix}currency2 <amount> <from> to <to>\nExample: ${prefix}currency2 100 USD to KES`)
        const match = text.trim().match(/^(\d+(?:\.\d+)?)\s+([A-Za-z]+)\s+to\s+([A-Za-z]+)$/i)
        if (!match) return reply(`❌ Format: ${prefix}currency2 <amount> <FROM> to <TO>\nExample: ${prefix}currency2 50 USD to KES`)
        const [, amount, from, to] = match
        await react(conn, m, '💱')
        const res = await convertCurrency(parseFloat(amount), from, to)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ ${res.error}`)
        return reply(`╭══〘 *💱 CURRENCY* 〙═⊷\n┃ ${res.formatted}\n╰══════════════════⊷`)
    }

    // ── .regextest <pattern> | <string> ──────────────────────────────────────
    if (command === 'regextest' || command === 'regex') {
        if (!text) return reply(`❌ Usage: ${prefix}regextest <pattern> | <test string>\nExample: ${prefix}regextest ^\\d+$ | 12345`)
        const parts = text.split('|')
        if (parts.length < 2) return reply(`❌ Separate pattern and string with |\nExample: ${prefix}regextest \\w+ | hello world`)
        const pattern = parts[0].trim()
        const str = parts.slice(1).join('|').trim()

        try {
            const rx = new RegExp(pattern, 'g')
            const matches = [...str.matchAll(rx)].map(m => m[0])
            const isMatch = rx.test(str) || matches.length > 0
            return reply(
                `╭══〘 *🔍 REGEX TEST* 〙═⊷\n` +
                `┃ Pattern: \`${pattern}\`\n` +
                `┃ Input: \`${str.slice(0, 50)}\`\n` +
                `┃ Match: ${isMatch ? '✅ YES' : '❌ NO'}\n` +
                `┃ Matches: ${matches.length ? matches.slice(0, 10).map(x => `\`${x}\``).join(', ') : 'none'}\n` +
                `╰══════════════════⊷`
            )
        } catch (e) {
            return reply(`❌ Invalid regex: ${e.message}`)
        }
    }

    // ── .yamlparse <yaml> ─────────────────────────────────────────────────────
    if (command === 'yamlparse') {
        const raw = m.quoted?.text || text
        if (!raw?.trim()) return reply(`❌ Usage: ${prefix}yamlparse <yaml text>\nOr quote a YAML message.`)
        try {
            const yaml = require('js-yaml')
            const parsed = yaml.load(raw.trim())
            return reply(`╭══〘 *📄 YAML → JSON* 〙═⊷\n\`\`\`json\n${JSON.stringify(parsed, null, 2).slice(0, 1500)}\n\`\`\`\n╰══════════════════⊷`)
        } catch (e) { return reply(`❌ YAML parse error: ${e.message}`) }
    }

    // ── .csvparse <csv> ───────────────────────────────────────────────────────
    if (command === 'csvparse') {
        const raw = m.quoted?.text || text
        if (!raw?.trim()) return reply(`❌ Usage: ${prefix}csvparse <csv text>\nOr quote a CSV message.`)
        try {
            const Papa = require('papaparse')
            const result = Papa.parse(raw.trim(), { header: true, skipEmptyLines: true })
            const preview = result.data.slice(0, 5)
            return reply(
                `╭══〘 *📊 CSV PARSED* 〙═⊷\n` +
                `┃ Rows: ${result.data.length} | Columns: ${Object.keys(preview[0] || {}).length}\n` +
                `┃ Fields: ${Object.keys(preview[0] || {}).join(', ')}\n` +
                `┃\n` +
                `┃ Preview (first 5 rows):\n` +
                `\`\`\`json\n${JSON.stringify(preview, null, 2).slice(0, 1200)}\n\`\`\`\n` +
                `╰══════════════════⊷`
            )
        } catch (e) { return reply(`❌ CSV parse error: ${e.message}`) }
    }

    // ── .qrgen2 <text> ────────────────────────────────────────────────────────
    if (command === 'qrgen2' || command === 'makeqr') {
        if (!text) return reply(`❌ Usage: ${prefix}qrgen2 <text or URL>`)
        try {
            const QRCode = require('qrcode')
            const buffer = await QRCode.toBuffer(text.trim(), { width: 512, margin: 2 })
            await conn.sendMessage(chat, { image: buffer, caption: `🔳 QR code for: *${text.slice(0, 50)}*` }, { quoted: m })
            return
        } catch (e) { return reply(`❌ QR generation failed: ${e.message}`) }
    }

    // ── .netping <host> ────────────────────────────────────────────────────────
    if (command === 'netping' || command === 'pinghost') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}netping <host or IP>`)
        const host = text.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9.\-]/g, '')
        if (!host) return reply(`❌ Invalid host.`)
        await react(conn, m, '🏓')
        const { exec } = require('child_process')
        exec(`ping -c 4 -W 3 ${host} 2>&1`, { timeout: 15000 }, (err, stdout) => {
            const icon = (stdout || '').includes('0% packet loss') || (stdout || '').includes('0 packets received') === false ? '✅' : '❌'
            const result = (stdout || err?.message || 'Ping failed').slice(0, 1000)
            reply(`╭══〘 *🏓 PING: ${host}* 〙═⊷\n\`\`\`\n${result}\n\`\`\`\n╰══════════════════⊷`)
        })
    }
}

handle.command = [
    'http', 'httpreq', 'request',
    'hash', 'hashtext',
    'encode2', 'decode2',
    'jwtgen', 'jwtverify',
    'mathcalc', 'compute',
    'unitconv',
    'currency2',
    'regextest', 'regex',
    'yamlparse',
    'csvparse',
    'qrgen2', 'makeqr',
    'netping', 'pinghost'
]
handle.tags = ['developer']
module.exports = handle
