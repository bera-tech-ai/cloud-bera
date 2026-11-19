const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
const os = require('os')

const xcasper = require('./xcasper')

const analyzeImageFromBuffer = async (buffer, question = 'Describe this image in detail.') => {
    if (!buffer || !Buffer.isBuffer(buffer)) return { success: false, error: 'No image supplied.' }
    const result = await xcasper.vision(`data:image/jpeg;base64,${buffer.toString('base64')}`, question)
    return result.success ? { success: true, result: result.text } : { success: false, error: result.error }
}

const analyzeImageFromUrl = async (imageUrl, question = 'Describe this image in detail.') => {
    const result = await xcasper.vision(imageUrl, question)
    return result.success ? { success: true, result: result.text } : { success: false, error: result.error }
}

module.exports = { analyzeImageFromBuffer, analyzeImageFromUrl }
