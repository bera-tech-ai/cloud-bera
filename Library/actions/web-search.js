'use strict'

const axios = require('axios')

const cleanResults = (rows) => (Array.isArray(rows) ? rows : [])
    .map(item => ({
        title: String(item?.title || item?.name || '').trim(),
        snippet: String(item?.snippet || item?.description || item?.content || item?.body || '').trim(),
        url: String(item?.url || item?.link || '').trim()
    }))
    .filter(item => item.title || item.snippet || item.url)
    .filter((item, index, all) => !item.url || all.findIndex(other => other.url === item.url) === index)
    .slice(0, 5)

const flattenTopics = (topics, out = []) => {
    for (const topic of Array.isArray(topics) ? topics : []) {
        if (topic?.FirstURL && (topic.Text || topic.Result)) {
            out.push({
                title: String(topic.Text || topic.Result).split(' - ')[0].replace(/<[^>]+>/g, '').trim(),
                snippet: String(topic.Text || topic.Result).replace(/<[^>]+>/g, '').trim(),
                url: topic.FirstURL
            })
        }
        if (Array.isArray(topic?.Topics)) flattenTopics(topic.Topics, out)
    }
    return out
}

const normalizeSearx = (data) => cleanResults(data?.results || data?.web?.results || [])

const webSearch = async (query) => {
    const q = String(query || '').trim().slice(0, 400)
    if (!q) return { success: false, results: [], error: 'A search query is required.' }

    const configuredSearx = String(process.env.BERA_WEB_SEARCH_URL || '').trim().replace(/\/+$/, '')
    if (configuredSearx) {
        try {
            const endpoint = /\/search$/i.test(configuredSearx) ? configuredSearx : `${configuredSearx}/search`
            const response = await axios.get(endpoint, {
                params: { q, format: 'json', language: 'en' },
                headers: { Accept: 'application/json', 'User-Agent': 'BeraBot/3.0' },
                timeout: 12000, proxy: false
            })
            const results = normalizeSearx(response.data)
            if (results.length) return { success: true, results, provider: 'searxng' }
        } catch {}
    }

    const braveKey = String(process.env.BRAVE_SEARCH_API_KEY || '').trim()
    if (braveKey) {
        try {
            const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
                params: { q, count: 5 },
                headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
                timeout: 15000, proxy: false
            })
            const results = cleanResults(response.data?.web?.results || [])
            if (results.length) return { success: true, results, provider: 'brave' }
        } catch (error) {
            return { success: false, results: [], error: `Brave Search failed: ${error.response?.status || error.message}` }
        }
    }

    try {
        const response = await axios.get('https://api.duckduckgo.com/', {
            params: { q, format: 'json', no_html: 1, skip_disambig: 1 },
            headers: { Accept: 'application/json', 'User-Agent': 'BeraBot/3.0' },
            timeout: 15000, proxy: false
        })
        const data = response.data || {}
        const results = cleanResults([
            ...(data.AbstractText ? [{ title: data.Heading || q, snippet: data.AbstractText, url: data.AbstractURL }] : []),
            ...(Array.isArray(data.Results) ? data.Results.map(item => ({ title: item.Text, snippet: item.Text, url: item.FirstURL })) : []),
            ...flattenTopics(data.RelatedTopics)
        ])
        if (results.length) return { success: true, results, provider: 'duckduckgo-instant-answer' }
        return {
            success: false,
            results: [],
            error: 'DuckDuckGo returned no Instant Answer results for this query. For full web results, configure BRAVE_SEARCH_API_KEY or BERA_WEB_SEARCH_URL.'
        }
    } catch (error) {
        return { success: false, results: [], error: `DuckDuckGo search failed: ${error.response?.status || error.message}` }
    }
}

const searchProviderStatus = () => ({
    // Presence only — never returns key material.
    searxng: Boolean(String(process.env.BERA_WEB_SEARCH_URL || '').trim()),
    brave: Boolean(String(process.env.BRAVE_SEARCH_API_KEY || '').trim()),
    duckduckgo: 'instant-answer fallback (no key required; full web results need BRAVE_SEARCH_API_KEY or BERA_WEB_SEARCH_URL)'
})

const formatSearchResults = (query, response) => {
    if (!response?.success || !response.results?.length) return `⚠️ ${response?.error || 'No search results found.'}`
    const results = response.results.slice(0, 5).map((item, index) =>
        `${index + 1}. *${item.title || 'Result'}*${item.snippet ? `\n${item.snippet}` : ''}${item.url ? `\n${item.url}` : ''}`
    ).join('\n\n')
    return `🔎 *Search results for: ${query}*\n\n${results}`
}

module.exports = { webSearch, formatSearchResults, cleanResults, searchProviderStatus }
