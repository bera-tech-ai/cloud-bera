'use strict'
/**
 * HTTP tools action library — make arbitrary HTTP requests from the bot.
 * Supports GET, POST, PUT, PATCH, DELETE with custom headers and body.
 */
const axios = require('axios')

const SAFE_TIMEOUT = 15000
const MAX_RESPONSE = 4000

/**
 * Perform an HTTP request.
 * @param {object} opts
 *   method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
 *   url: string
 *   headers: object (optional)
 *   body: any (optional) — for POST/PUT/PATCH
 *   params: object (optional) — query params
 *   auth: { user, pass } (optional)
 *   timeout: number (ms, optional)
 * @returns {Promise<{ success: boolean, status: number, headers: object, body: string, error?: string }>}
 */
const httpRequest = async (opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase()
    const url = opts.url || ''

    if (!url || !url.startsWith('http')) {
        return { success: false, status: 0, body: '', error: 'Invalid URL — must start with http:// or https://' }
    }

    // Block internal network requests for security
    const blocked = /localhost|127\.|0\.0\.0\.0|169\.254\.|::1|10\.\d+\.\d+\.\d+|192\.168\.|172\.(1[6-9]|2\d|3[01])\./
    if (blocked.test(url)) {
        return { success: false, status: 0, body: '', error: 'Blocked: cannot request internal/private network addresses.' }
    }

    const axiosOpts = {
        method,
        url,
        timeout: Math.min(opts.timeout || SAFE_TIMEOUT, 30000),
        headers: opts.headers || {},
        params: opts.params || {},
        validateStatus: () => true,
        maxRedirects: 5,
        responseType: 'text'
    }

    if (opts.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        if (typeof opts.body === 'object') {
            axiosOpts.data = JSON.stringify(opts.body)
            if (!axiosOpts.headers['Content-Type']) axiosOpts.headers['Content-Type'] = 'application/json'
        } else {
            axiosOpts.data = String(opts.body)
        }
    }

    if (opts.auth?.user) {
        axiosOpts.auth = { username: opts.auth.user, password: opts.auth.pass || '' }
    }

    try {
        const res = await axios(axiosOpts)
        let body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)
        body = body.slice(0, MAX_RESPONSE)

        // Try to pretty-print JSON
        try {
            const parsed = JSON.parse(body)
            body = JSON.stringify(parsed, null, 2).slice(0, MAX_RESPONSE)
        } catch {}

        return {
            success: res.status >= 200 && res.status < 300,
            status: res.status,
            headers: res.headers || {},
            body
        }
    } catch (e) {
        return { success: false, status: 0, body: '', error: e.message }
    }
}

/**
 * Format HTTP result for WhatsApp display.
 */
const formatHttpResult = (res, method, url) => {
    const icon = res.success ? '✅' : '❌'
    const lines = [
        `${icon} *${method} ${url}*`,
        `📊 Status: \`${res.status || 'N/A'}\``
    ]
    if (res.error) lines.push(`⚠️ Error: ${res.error}`)
    if (res.body) lines.push(`📄 *Response:*\n\`\`\`\n${res.body}\n\`\`\``)
    return lines.join('\n')
}

module.exports = { httpRequest, formatHttpResult }
