const axios = require('axios')

// Updated to correct base URL from the documentation
const GIFTED = 'https://api.gifted.co.ke'
const GIFTED_KEY = process.env.GIFTED_API_KEY || ''

const isApiError = (data) => {
    return data?.status === false || data?.success === false || typeof data?.error === 'string'
}

// AI endpoints using only Gifted API (exactly as you tested)
const SEARCH_AI_ENDPOINTS = [
    { url: `${GIFTED}/api/ai/gemini`,     param: 'q', key: true },  // ✅ Working - Gemini 3.5 Flash
    { url: `${GIFTED}/api/ai/ai`,         param: 'q', key: true },  // Generic AI endpoint
    { url: `${GIFTED}/api/ai/gpt`,        param: 'q', key: true },  // Standard GPT
    { url: `${GIFTED}/api/ai/chatgpt`,    param: 'q', key: true },  // ChatGPT endpoint
]

const webSearch = async (query) => {
    const prompt = `Search for and summarise information about: ${query}\n\nGive a direct, factual answer.`
    
    for (const ep of SEARCH_AI_ENDPOINTS) {
        try {
            const params = { [ep.param]: prompt }
            
            // Add API key if required
            if (ep.key) {
                params.apikey = GIFTED_KEY
            }
            
            const res = await axios.get(ep.url, {
                params: params,
                timeout: 20000
            })
            
            const data = res.data
            if (isApiError(data)) continue
            
            // Handle Gifted API response structure
            const result = data?.result || data?.answer || data?.response || data?.reply || data?.message
            
            if (!result || typeof result !== 'string') continue
            if (result === 'Request failed with status code 403') continue // Skip auth errors
            
            return { success: true, result }
        } catch (e) {
            const status = e?.response?.status
            if (status === 404 || status === 403 || status === 500 || status === 502 || status === 503) continue
        }
    }
    return { success: false, error: 'Search failed. Try again.' }
}

// Brave-style search endpoints using only Gifted API
const BRAVE_ENDPOINTS = [
    { url: `${GIFTED}/api/search/web`,    param: 'q', key: true },  // Web search endpoint
    { url: `${GIFTED}/api/ai/gemini`,     param: 'q', key: true, isAi: true },  // Gemini as fallback
    { url: `${GIFTED}/api/ai/ai`,         param: 'q', key: true, isAi: true },  // Generic AI fallback
]

const braveSearch = async (query) => {
    for (const ep of BRAVE_ENDPOINTS) {
        try {
            const params = { [ep.param]: query }
            
            // Add API key if required
            if (ep.key) {
                params.apikey = GIFTED_KEY
            }
            
            const res = await axios.get(ep.url, {
                params: params,
                timeout: 15000
            })
            
            const data = res.data
            if (isApiError(data)) continue
            
            // Handle Gifted API web search response
            if (data?.results && Array.isArray(data.results)) {
                const results = data.results.slice(0, 4).map(item => ({
                    title: item.title || '',
                    description: item.description || item.snippet || '',
                    url: item.url || ''
                }))
                if (results.length) return { success: true, results }
            }
            
            // Handle AI response as fallback
            const results = data?.result || data?.results || data
            if (Array.isArray(results) && results.length) {
                return { success: true, results: results.slice(0, 4) }
            }
            
            if (typeof data === 'string' && data.length > 10 && data !== 'Request failed with status code 403') {
                return { success: true, result: data }
            }
        } catch (e) {
            const status = e?.response?.status
            if (status === 404 || status === 403 || status === 500 || status === 502 || status === 503) continue
        }
    }
    return { success: false, error: 'Search failed. Try again.' }
}

module.exports = { webSearch, braveSearch }
