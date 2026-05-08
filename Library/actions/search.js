const axios = require('axios')

const BASE = 'https://apiskeith.top'

const isApiError = (data) => {
    return data?.status === false || data?.success === false || typeof data?.error === 'string'
}

const SEARCH_AI_ENDPOINTS = [
    { url: `${BASE}/ai/gpt41Nano`,                      param: 'q'     },
    { url: `${BASE}/ai/searchai`,                       param: 'query' },
    { url: `${BASE}/ai/gpt`,                            param: 'q'     },
    { url: 'https://api.siputzx.my.id/api/ai/chatgpt', param: 'text'  },
    { url: 'https://bk9.fun/ai/gpt',                   param: 'q'     },
]

const webSearch = async (query) => {
    const prompt = `Search for and summarise information about: ${query}\n\nGive a direct, factual answer.`
    for (const ep of SEARCH_AI_ENDPOINTS) {
        try {
            const res = await axios.get(ep.url, {
                params: { [ep.param]: prompt, q: prompt, query, text: prompt },
                timeout: 20000
            })
            const data = res.data
            if (isApiError(data)) continue
            const result = data?.result || data?.answer || data?.response || data?.reply || data?.message
            if (!result || typeof result !== 'string') continue
            return { success: true, result }
        } catch (e) {
            const status = e?.response?.status
            if (status === 404 || status === 403 || status === 500 || status === 502 || status === 503) continue
        }
    }
    return { success: false, error: 'Search failed. Try again.' }
}

const BRAVE_ENDPOINTS = [
    { url: `${BASE}/search/brave`,    param: 'q' },
    { url: `${BASE}/ai/gpt41Nano`,    param: 'q', isAi: true },
    { url: `${BASE}/ai/gpt`,          param: 'q', isAi: true },
]

const braveSearch = async (query) => {
    for (const ep of BRAVE_ENDPOINTS) {
        try {
            const res = await axios.get(ep.url, {
                params: { q: query, query },
                timeout: 15000
            })
            const data = res.data
            if (isApiError(data)) continue
            const results = data?.result || data?.results || data
            if (Array.isArray(results) && results.length) return { success: true, results: results.slice(0, 4) }
            if (typeof data === 'string' && data.length > 10) return { success: true, result: data }
        } catch (e) {
            const status = e?.response?.status
            if (status === 404 || status === 403 || status === 500 || status === 502 || status === 503) continue
        }
    }
    return { success: false, error: 'Search failed. Try again.' }
}

module.exports = { webSearch, braveSearch }
