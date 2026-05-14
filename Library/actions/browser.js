'use strict'
/**
 * Browser action library — headless screenshots and web scraping.
 * Primary: Uses the existing GiftedTech API for screenshots (already integrated).
 * Fallback: puppeteer-core with @sparticuz/chromium if available.
 * No-dep fallback: axios + a screenshot service.
 */
const axios = require('axios')

const SCREENSHOT_APIS = [
    // Gifted Tech (already used in the bot)
    (url) => `https://apiskeith.top/api/screenshot?url=${encodeURIComponent(url)}&key=bera`,
    // thum.io (free, reliable)
    (url) => `https://image.thum.io/get/width/1280/crop/900/${encodeURIComponent(url)}`,
    // ScreenshotOne (free tier)
    (url) => `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&viewport_width=1280&viewport_height=900&format=jpg`
]

/**
 * Take a screenshot of a URL and return the image buffer.
 * @param {string} url  The URL to screenshot
 * @returns {Promise<{ success: boolean, buffer?: Buffer, mimetype?: string, error?: string }>}
 */
const takeScreenshot = async (url) => {
    if (!url || !url.startsWith('http')) {
        return { success: false, error: 'Invalid URL — must start with http:// or https://' }
    }

    // Try Puppeteer if available
    let puppeteer
    try { puppeteer = require('puppeteer-core') } catch {}

    if (puppeteer) {
        let chromium
        try { chromium = require('@sparticuz/chromium') } catch {}

        if (chromium) {
            try {
                const browser = await puppeteer.launch({
                    args: chromium.args,
                    executablePath: await chromium.executablePath(),
                    headless: true
                })
                const page = await browser.newPage()
                await page.setViewport({ width: 1280, height: 900 })
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 })
                const buffer = await page.screenshot({ type: 'jpeg', quality: 85 })
                await browser.close()
                return { success: true, buffer: Buffer.from(buffer), mimetype: 'image/jpeg' }
            } catch (e) {
                // fall through to API fallbacks
            }
        }
    }

    // API fallbacks
    for (const buildUrl of SCREENSHOT_APIS) {
        try {
            const ssUrl = buildUrl(url)
            const res = await axios.get(ssUrl, { responseType: 'arraybuffer', timeout: 20000, validateStatus: s => s < 400 })
            if (res.data && res.data.byteLength > 1000) {
                const ct = res.headers['content-type'] || 'image/jpeg'
                if (/image/.test(ct)) {
                    return { success: true, buffer: Buffer.from(res.data), mimetype: ct.split(';')[0] }
                }
            }
        } catch {}
    }

    return { success: false, error: 'All screenshot methods failed. Check the URL and try again.' }
}

/**
 * Fetch readable text content from a URL.
 * @param {string} url
 * @returns {Promise<{ success: boolean, text?: string, title?: string, error?: string }>}
 */
const fetchPageText = async (url) => {
    if (!url || !url.startsWith('http')) {
        return { success: false, error: 'Invalid URL' }
    }

    try {
        const res = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeraBot/2.0)' },
            responseType: 'text',
            validateStatus: s => s < 400
        })

        const html = res.data || ''

        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
        const title = titleMatch ? titleMatch[1].trim() : 'No title'

        // Strip HTML tags and normalize whitespace
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000)

        return { success: true, text, title }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

module.exports = { takeScreenshot, fetchPageText }
