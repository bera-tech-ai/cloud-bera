'use strict'

const axios = require('axios')

const BASE_URL = (process.env.XCASPER_BASE_URL || 'https://apiz.xcasper.space').replace(/\/$/, '')
const DEFAULT_TIMEOUT = Number(process.env.XCASPER_TIMEOUT_MS || 25000)

const endpoint = (path) => `${BASE_URL}${path}`

const textFrom = (data) => {
    if (typeof data === 'string') return data.trim()
    if (!data || typeof data !== 'object') return ''
    const candidates = [
        data.result, data.response, data.answer, data.reply, data.text,
        data.message, data.content, data.data?.result, data.data?.response,
        data.data?.answer, data.data?.reply, data.data?.text,
        data.data?.content
    ]
    return candidates.find(v => typeof v === 'string' && v.trim().length > 1)?.trim() || ''
}

const requestGet = async (path, params, timeout = DEFAULT_TIMEOUT) => {
    const res = await axios.get(endpoint(path), {
        params,
        timeout,
        headers: { 'User-Agent': 'BeraAI/XcasperClient/1.0', Accept: 'application/json' }
    })
    return res.data
}

const requestPost = async (path, body, timeout = DEFAULT_TIMEOUT) => {
    const res = await axios.post(endpoint(path), body, {
        timeout,
        headers: {
            'User-Agent': 'BeraAI/XcasperClient/1.0',
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    })
    return res.data
}

const formatMessages = (messages, maxChars = 14000) => {
    const list = Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }]
    const text = list.map(m => `${m.role === 'system' ? 'System' : m.role === 'assistant' ? 'Assistant' : 'User'}: ${String(m.content || '')}`).join('\n\n')
    return text.slice(-maxChars)
}

const chat = async (messages, opts = {}) => {
    const prompt = formatMessages(messages, opts.maxChars || 14000)
    const timeout = opts.timeout || DEFAULT_TIMEOUT
    const providers = [
        { name: 'publicai', path: '/api/ai/publicai-chat', params: { message: prompt } },
        { name: 'deepseek', path: '/api/ai/deepseek', params: { query: prompt, model: 'v4-flash' } },
        { name: 'claude', path: '/api/ai/claude', params: { query: prompt } },
        { name: 'gemini', path: '/api/ai/gemini', params: { query: prompt } },
        { name: 'keithai', path: '/api/ai/keithai', params: { prompt } }
    ]
    const errors = []
    for (const provider of providers) {
        try {
            const data = await requestGet(provider.path, provider.params, timeout)
            const text = textFrom(data)
            if (text) return { success: true, text, model: `xcasper/${provider.name}`, provider: provider.name }
            errors.push(`${provider.name}: empty response`)
        } catch (e) {
            errors.push(`${provider.name}: ${e.response?.status || e.code || e.message}`)
        }
    }
    return { success: false, error: `Xcasper AI unavailable (${errors.join('; ')})` }
}

const vision = async (imageUrl, question = 'Describe this image in detail.') => {
    try {
        const data = await requestPost('/api/ai/vision', { imageUrl, question }, 35000)
        const text = textFrom(data)
        return text ? { success: true, text, provider: 'vision' } : { success: false, error: 'Vision returned no text' }
    } catch (e) {
        return { success: false, error: `Xcasper vision unavailable: ${e.response?.status || e.message}` }
    }
}

const unwrap = (data) => data?.data || data?.result || data
const youtubeAudio = async (url) => unwrap(await requestPost('/api/downloaders/youtube-audio', { url }))
const youtubeVideo = async (url) => unwrap(await requestPost('/api/downloaders/youtube-video', { url }))
const youtubeMp3 = async (url, format = 'mp3') => unwrap(await requestPost('/api/downloaders/yt', { url, format }))
const tiktok = async (url) => unwrap(await requestPost('/api/downloaders/tiktokdl2', { url }))
const instagram = async (url) => unwrap(await requestPost('/api/downloaders/igdl', { url }), 60000)
const tiktokSearch = async (query) => unwrap(await requestPost('/api/search/tiktok', { query }))
const youtubeSearch = async (query, limit = 6) => {
    const data = await requestPost('/api/search/youtube', { query, limit })
    return data?.data?.videos || data?.videos || data?.results || []
}
const qr = async (data, options = {}) => {
    const result = await requestPost('/api/utilities/qr-code', {
        data,
        size: options.size || 400,
        format: options.format || 'png',
        error_correction: options.error_correction || 'M'
    })
    return { ...(result?.data || result), url: result?.data?.qr_code_url || result?.qr_code_url || result?.url }
}
const screenshot = async (url, options = {}) => {
    const result = await requestPost('/api/tools/screenshot', {
        url,
        device: options.device || 'desktop',
        format: options.format || 'png',
        delay: options.delay || 500
    }, 60000)
    return { ...(result?.data || result), url: result?.data?.image_url || result?.image_url || result?.url }
}

module.exports = {
    BASE_URL,
    chat,
    vision,
    youtubeAudio,
    youtubeVideo,
    youtubeMp3,
    tiktok,
    instagram,
    tiktokSearch,
    youtubeSearch,
    qr,
    screenshot,
    textFrom,
    requestGet,
    requestPost
}
