'use strict'

const generateImage = async () => ({
    success: false,
    error: 'Image generation is disabled: no verified Xcasper image-generation endpoint is currently available.'
})

module.exports = { generateImage }
