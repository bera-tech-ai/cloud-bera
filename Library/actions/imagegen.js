const axios = require('axios')

const IMAGE_ENDPOINTS = [
    { base: 'https://apiskeith.top', path: '/ai/flux' },
    { base: 'https://apiskeith.top', path: '/ai/sdxl' },
    { base: 'https://apiskeith.top', path: '/ai/prodia' }
]

const generateImage = async (prompt) => {
    for (const ep of IMAGE_ENDPOINTS) {
        try {
            const res = await axios.get(`${ep.base}${ep.path}`, {
                params: { q: prompt },
                timeout: 45000,
                responseType: 'arraybuffer'
            })

            const ct = res.headers['content-type'] || ''

            if (ct.includes('image')) {
                return { success: true, buffer: Buffer.from(res.data) }
            }

            let json = {}
            try { json = JSON.parse(Buffer.from(res.data).toString()) } catch {}

            if (json?.result?.error || json?.error) continue

            const urlVal = json?.result?.url || json?.result?.image || json?.result ||
                json?.url || json?.image || json?.data
            const url = typeof urlVal === 'string' && urlVal.startsWith('http') ? urlVal : ''

            if (url) return { success: true, url }

        } catch { continue }
    }

    return { success: false, error: 'Image generation is unavailable right now. Try again in a moment.' }
}

module.exports = { generateImage }
