'use strict'
const axios = require('axios')
const crypto = require('crypto')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' }

const fetchHtml = async (url, timeout = 15000) => {
    const res = await axios.get(url, { headers: HEADERS, timeout, maxContentLength: 5 * 1024 * 1024, validateStatus: s => s < 500 })
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
}

const htmlDecode = (s) => s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))

const stripTags = (html) => html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

const getTitle = (html) => {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m ? htmlDecode(m[1].trim()) : ''
}

const getMeta = (html) => {
    const meta = {}
    const rx = /<meta[^>]+>/gi
    let m
    while ((m = rx.exec(html)) !== null) {
        const tag = m[0]
        const name = (tag.match(/(?:name|property)=["']([^"']+)["']/i) || [])[1]
        const content = (tag.match(/content=["']([^"']+)["']/i) || [])[1]
        if (name && content) meta[name.toLowerCase()] = htmlDecode(content)
    }
    return meta
}

const getHeadings = (html) => {
    const headings = []
    const rx = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi
    let m
    while ((m = rx.exec(html)) !== null) {
        const text = stripTags(m[2]).trim().slice(0, 120)
        if (text) headings.push({ level: +m[1], text })
    }
    return headings.slice(0, 20)
}

const getLinks = (html, baseUrl = '') => {
    const links = []
    const seen = new Set()
    const rx = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    let m
    try {
        const base = baseUrl ? new URL(baseUrl) : null
        while ((m = rx.exec(html)) !== null) {
            try {
                let href = htmlDecode(m[1].trim())
                if (href.startsWith('javascript:') || href.startsWith('mailto:') && !href.includes('@')) continue
                if (base && !href.startsWith('http')) href = new URL(href, base).href
                const text = stripTags(m[2]).trim().slice(0, 80)
                if (href && !seen.has(href)) { seen.add(href); links.push({ href, text }) }
            } catch {}
        }
    } catch {}
    return links.slice(0, 100)
}

const getImages = (html, baseUrl = '') => {
    const images = []
    const rx = /<img[^>]+>/gi
    let m
    try {
        const base = baseUrl ? new URL(baseUrl) : null
        while ((m = rx.exec(html)) !== null) {
            const tag = m[0]
            let src = (tag.match(/(?:src|data-src)=["']([^"']+)["']/i) || [])[1]
            const alt = (tag.match(/alt=["']([^"']+)["']/i) || [])[1] || ''
            if (!src) continue
            if (base && !src.startsWith('http')) { try { src = new URL(src, base).href } catch { continue } }
            if (src.startsWith('http')) images.push({ src, alt: htmlDecode(alt).slice(0, 80) })
        }
    } catch {}
    return images.slice(0, 30)
}

const parseTables = (html) => {
    const tables = []
    const tableRx = /<table[\s\S]*?<\/table>/gi
    let tm
    while ((tm = tableRx.exec(html)) !== null) {
        const tableHtml = tm[0]
        const rows = []
        const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
        let rm
        while ((rm = rowRx.exec(tableHtml)) !== null) {
            const cells = []
            const cellRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
            let cm
            while ((cm = cellRx.exec(rm[1])) !== null) {
                cells.push(stripTags(cm[1]).trim().slice(0, 200))
            }
            if (cells.length) rows.push(cells)
        }
        if (rows.length > 1) tables.push(rows)
    }
    return tables.slice(0, 5)
}

const extractJsonLd = (html) => {
    const schemas = []
    const rx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m
    while ((m = rx.exec(html)) !== null) {
        try { schemas.push(JSON.parse(m[1].trim())) } catch {}
    }
    return schemas
}

const extractOpenGraph = (html) => {
    const og = {}
    const rx = /<meta[^>]+property=["']og:([^"']+)["'][^>]+content=["']([^"']+)["'][^>]*>/gi
    let m
    while ((m = rx.exec(html)) !== null) og[m[1]] = htmlDecode(m[2])
    return og
}

// ── Public API ─────────────────────────────────────────────────────────────────

const scrapePage = async (url) => {
    try {
        if (!url.startsWith('http')) return { success: false, error: 'URL must start with http(s)://' }
        const html = await fetchHtml(url)
        const title = getTitle(html)
        const meta = getMeta(html)
        const headings = getHeadings(html)
        const links = getLinks(html, url)
        const images = getImages(html, url)
        const tables = parseTables(html)
        const jsonld = extractJsonLd(html)
        const og = extractOpenGraph(html)
        const text = stripTags(html).slice(0, 4000)
        return {
            success: true, url, title, text,
            headingsCount: headings.length, headings: headings.slice(0, 8),
            linksCount: links.length, links: links.slice(0, 15),
            imagesCount: images.length, images: images.slice(0, 8),
            tablesCount: tables.length,
            tables: tables.slice(0, 2).map(t => t.slice(0, 5).map(r => r.slice(0, 5))),
            meta: { description: meta.description || og.description || '', keywords: meta.keywords || '', og },
            structuredData: jsonld.slice(0, 3),
        }
    } catch (e) { return { success: false, error: e.message } }
}

const extractLinks = async (url, filter = '') => {
    try {
        const html = await fetchHtml(url)
        let links = getLinks(html, url)
        if (filter) {
            const re = new RegExp(filter, 'i')
            links = links.filter(l => re.test(l.href) || re.test(l.text))
        }
        return { success: true, url, total: links.length, links }
    } catch (e) { return { success: false, error: e.message } }
}

const extractTables = async (url) => {
    try {
        const html = await fetchHtml(url)
        const tables = parseTables(html)
        return {
            success: true, url, count: tables.length,
            tables: tables.map((rows, i) => ({
                index: i,
                headers: rows[0] || [],
                rows: rows.slice(1),
                rowCount: rows.length - 1
            }))
        }
    } catch (e) { return { success: false, error: e.message } }
}

const extractStructuredData = async (url) => {
    try {
        const html = await fetchHtml(url)
        const jsonld = extractJsonLd(html)
        const og = extractOpenGraph(html)
        const meta = getMeta(html)
        const title = getTitle(html)
        return { success: true, url, title, jsonld, og, meta }
    } catch (e) { return { success: false, error: e.message } }
}

const extractEmails = async (url) => {
    try {
        const html = await fetchHtml(url)
        const text = stripTags(html)
        const matches = [...new Set((text + html).match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])]
        return { success: true, url, count: matches.length, emails: matches.slice(0, 50) }
    } catch (e) { return { success: false, error: e.message } }
}

const extractPhones = async (url) => {
    try {
        const html = await fetchHtml(url)
        const text = stripTags(html)
        const patterns = [
            /\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
            /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
        ]
        const all = new Set()
        for (const p of patterns) { const m = text.match(p); if (m) m.forEach(n => all.add(n.trim())) }
        const phones = [...all].filter(n => n.replace(/\D/g, '').length >= 7).slice(0, 30)
        return { success: true, url, count: phones.length, phones }
    } catch (e) { return { success: false, error: e.message } }
}

const findText = async (url, query) => {
    try {
        const html = await fetchHtml(url)
        const text = stripTags(html)
        const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        const matches = []
        let m
        while ((m = re.exec(text)) !== null) {
            const start = Math.max(0, m.index - 80)
            const end   = Math.min(text.length, m.index + query.length + 80)
            matches.push('...' + text.slice(start, end).trim() + '...')
            if (matches.length >= 8) break
        }
        return { success: true, url, query, found: matches.length > 0, matches }
    } catch (e) { return { success: false, error: e.message } }
}

const bulkScrape = async (urls, maxConcurrent = 3) => {
    const results = []
    const chunks = []
    for (let i = 0; i < urls.length; i += maxConcurrent) chunks.push(urls.slice(i, i + maxConcurrent))
    for (const chunk of chunks) {
        const res = await Promise.all(chunk.map(u => scrapePage(u).catch(e => ({ success: false, url: u, error: e.message }))))
        results.push(...res)
    }
    return { success: true, count: results.length, results }
}

const checkPageChange = async (url, previousHash = '') => {
    try {
        const html = await fetchHtml(url)
        const text = stripTags(html).replace(/\s+/g, ' ')
        const hash = crypto.createHash('md5').update(text).digest('hex')
        const changed = previousHash ? hash !== previousHash : false
        return { success: true, url, hash, changed, contentLength: text.length }
    } catch (e) { return { success: false, error: e.message } }
}

const regexExtract = async (url, pattern, flags = 'gi') => {
    try {
        const html = await fetchHtml(url)
        const text = stripTags(html)
        const re = new RegExp(pattern, flags)
        const matches = [...new Set(text.match(re) || [])]
        return { success: true, url, pattern, count: matches.length, matches: matches.slice(0, 50) }
    } catch (e) { return { success: false, error: e.message } }
}

const fetchJson = async (url, headers = {}) => {
    try {
        const res = await axios.get(url, { headers: { ...HEADERS, ...headers }, timeout: 15000 })
        const data = res.data
        const formatted = JSON.stringify(data, null, 2).slice(0, 4000)
        const type = Array.isArray(data) ? `Array[${data.length}]` : `Object{${Object.keys(data || {}).slice(0, 10).join(', ')}}`
        return { success: true, url, type, data: formatted }
    } catch (e) { return { success: false, error: e.message } }
}

const apiTest = async (method, url, body = null, headers = {}) => {
    const t0 = Date.now()
    try {
        const res = await axios.request({
            method: method.toUpperCase(),
            url,
            data: body,
            headers: { 'Content-Type': 'application/json', ...HEADERS, ...headers },
            timeout: 20000,
            validateStatus: () => true
        })
        const ms = Date.now() - t0
        const ok = res.status >= 200 && res.status < 300
        let body_out = ''
        try { body_out = JSON.stringify(res.data, null, 2).slice(0, 2000) } catch { body_out = String(res.data).slice(0, 2000) }
        return {
            success: true, ok, status: res.status, ms,
            headers: Object.fromEntries(Object.entries(res.headers).slice(0, 8)),
            body: body_out
        }
    } catch (e) {
        return { success: false, error: e.message, ms: Date.now() - t0 }
    }
}

module.exports = {
    scrapePage, extractLinks, extractTables, extractStructuredData,
    extractEmails, extractPhones, findText, bulkScrape, checkPageChange,
    regexExtract, fetchJson, apiTest
}
