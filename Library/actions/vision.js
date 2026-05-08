const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
const os = require('os')

const BASE = 'https://apiskeith.top'

const analyzeImageFromBuffer = async (buffer, question = 'Describe this image in detail.') => {
    try {
        const tmpFile = path.join(os.tmpdir(), `nick_img_${Date.now()}.jpg`)
        fs.writeFileSync(tmpFile, buffer)

        const base64 = buffer.toString('base64')
        const dataUrl = `data:image/jpeg;base64,${base64}`

        const res = await axios.get(`${BASE}/ai/vision`, {
            params: { image: dataUrl, q: question },
            timeout: 30000
        })

        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)

        const data = res.data
        if (data?.status === false || data?.success === false || typeof data?.error === 'string') {
            return { success: false, error: 'Vision service is busy. Try again in a moment.' }
        }
        const result = data?.result || data?.answer || data?.response
        if (!result) return { success: false, error: 'No analysis returned.' }
        return { success: true, result }
    } catch (e) {
        return { success: false, error: 'Vision failed. Try again.' }
    }
}

const analyzeImageFromUrl = async (imageUrl, question = 'Describe this image in detail.') => {
    try {
        const res = await axios.get(`${BASE}/ai/vision`, {
            params: { image: imageUrl, q: question },
            timeout: 30000
        })
        const data = res.data
        if (data?.status === false || data?.success === false || typeof data?.error === 'string') {
            return { success: false, error: 'Vision service is busy. Try again in a moment.' }
        }
        const result = data?.result || data?.answer || data?.response
        if (!result) return { success: false, error: 'No analysis returned.' }
        return { success: true, result }
    } catch (e) {
        return { success: false, error: 'Vision failed. Try again.' }
    }
}

module.exports = { analyzeImageFromBuffer, analyzeImageFromUrl }
