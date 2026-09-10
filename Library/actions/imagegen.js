const axios = require('axios')

// Gifted API endpoints - all working and tested
const GIFTED = 'https://api.giftedtech.co.ke'
const GIFTED_KEY = process.env.GIFTED_API_KEY || ''

const IMAGE_ENDPOINTS = [
    { 
        url: `${GIFTED}/api/ai/fluximg`,     // ✅ Working - returns S3 image URL
        params: { apikey: GIFTED_KEY, prompt: '', ratio: '1:1' }
    },
    { 
        url: `${GIFTED}/api/ai/txt2img`,     // ✅ Working - returns Sora image URL
        params: { apikey: GIFTED_KEY, prompt: '' }
    },
    { 
        url: `${GIFTED}/api/ai/deepimg`,     // ✅ Working - returns Pollinations.ai URL
        params: { apikey: GIFTED_KEY, prompt: '' }
    }
]

const generateImage = async (prompt, ratio = '1:1') => {
    for (const ep of IMAGE_ENDPOINTS) {
        try {
            // Build params for this endpoint
            const params = { ...ep.params, prompt: prompt }
            
            // Add ratio if endpoint is fluximg
            if (ep.url.includes('fluximg') && ratio) {
                params.ratio = ratio
            }
            
            const res = await axios.get(ep.url, {
                params: params,
                timeout: 45000,
                responseType: 'json'
            })

            const data = res.data
            
            // Check if request failed
            if (data?.status === false || data?.success === false) {
                continue
            }
            
            let imageUrl = null
            
            // Handle different response formats
            if (data?.result?.url) {
                // fluximg and txt2img format: { result: { url: "..." } }
                imageUrl = data.result.url
            } else if (typeof data?.result === 'string' && data.result.startsWith('http')) {
                // deepimg format: { result: "https://..." }
                imageUrl = data.result
            }
            
            if (imageUrl && imageUrl.startsWith('http')) {
                // Try to download the image directly
                try {
                    const imgRes = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    })
                    if (imgRes.headers['content-type']?.includes('image')) {
                        return { success: true, buffer: Buffer.from(imgRes.data) }
                    }
                } catch (downloadError) {
                    // If downloading fails, return the URL itself
                    console.error('Download failed, returning URL:', downloadError.message)
                    return { success: true, url: imageUrl }
                }
            }

        } catch (error) {
            console.error(`Image generation failed for ${ep.url}:`, error.message)
            continue
        }
    }

    return { success: false, error: 'Image generation is unavailable right now. Try again in a moment.' }
}

module.exports = { generateImage }
