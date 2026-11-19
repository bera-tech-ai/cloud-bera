'use strict'

const unavailable = feature => ({
    success: false,
    error: `${feature} is disabled because no verified Xcasper web-search endpoint is currently available.`
})

const webSearch = async () => unavailable('Web search')
const braveSearch = async () => unavailable('Web search')

module.exports = { webSearch, braveSearch }
