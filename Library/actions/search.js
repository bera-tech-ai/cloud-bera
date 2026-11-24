'use strict'

// ── Web search (spec §17) ────────────────────────────────────────────────────
// Delegates to the real provider chain in ./web-search.js (configured SearxNG
// → Brave with BRAVE_SEARCH_API_KEY → DuckDuckGo Instant Answer fallback).
// Previously this module was a stub that always reported web search as
// disabled, while the working implementation sat unused in web-search.js and
// the reaction-search path in Handler/index.js read a `result` field this
// stub never returned.

const { webSearch, formatSearchResults, searchProviderStatus } = require('./web-search')
const braveSearch = webSearch

module.exports = { webSearch, braveSearch, formatSearchResults, searchProviderStatus }
