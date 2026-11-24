'use strict'

// ── Movie / TV search via TVMaze (spec §17, no API key) ──────────────────────
// TVMaze was verified live 2026-11-24 (GET /search/shows returns 200; the
// spec's Kagurabachi example matches the live payload exactly). The returned
// object is both the normalized shape used by formatMovieCard() and — via the
// Title/Year/Genre/Plot aliases — the OMDB-style shape older callers expect.

const TVMAZE_URL = 'https://api.tvmaze.com/search/shows'

const stripHtml = value => String(value || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

const normalizeShow = show => {
    const s = show || {}
    const rating = s.rating?.average ?? null
    const genres = Array.isArray(s.genres) ? s.genres : []
    return {
        source: 'tvmaze',
        name: s.name || '',
        rating,
        status: s.status || 'unknown',
        genres,
        summary: stripHtml(s.summary || '').slice(0, 900),
        premiered: s.premiered || null,
        language: s.language || null,
        url: s.url || null,
        // OMDB-style aliases for legacy callers (agent movie_info, .movie).
        Title: s.name || '',
        Year: s.premiered ? String(s.premiered).slice(0, 4) : '',
        Genre: genres.join(', '),
        Plot: stripHtml(s.summary || '').slice(0, 900),
        imdbRating: rating == null ? 'N/A' : String(rating),
        Language: s.language || '',
        Response: 'True'
    }
}

const searchShow = async title => {
    const q = String(title || '').trim()
    if (!q) return { success: false, error: 'A movie or show title is required.' }
    try {
        const response = await fetch(`${TVMAZE_URL}?q=${encodeURIComponent(q)}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'BeraBot/3.0' },
            signal: AbortSignal.timeout(15000)
        })
        if (!response.ok) return { success: false, error: `TVMaze lookup failed (${response.status}).` }
        const data = await response.json()
        const show = Array.isArray(data) && data[0]?.show ? data[0].show : null
        if (!show) return { success: false, error: `No show matched: ${q}` }
        return { success: true, ...normalizeShow(show) }
    } catch (e) {
        return { success: false, error: `TVMaze lookup failed: ${e.message}` }
    }
}

module.exports = { searchShow, normalizeShow }
