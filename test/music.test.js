'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const musicPath = require.resolve('../Library/actions/music')

const loadMusicWithXcasper = (mock) => {
    const originalLoad = Module._load
    delete require.cache[musicPath]
    Module._load = function (request, parent, isMain) {
        if (request === './xcasper' && parent?.filename === musicPath) return mock
        return originalLoad.call(this, request, parent, isMain)
    }
    try {
        return require(musicPath)
    } finally {
        Module._load = originalLoad
        delete require.cache[musicPath]
    }
}

test('searchAndDownload normalizes Xcasper nested audio.downloadUrl to a string', async () => {
    const xcasper = {
        youtubeSearch: async () => [{ videoId: 'abc123', title: 'Example song', thumbnail: 'https://img.example/thumb.jpg' }],
        youtubeAudio: async () => ({
            sourceUrl: 'https://youtube.com/watch?v=abc123',
            title: 'Example song',
            audio: { format: 'mp3', downloadUrl: 'https://media.example/song.mp3?token=redacted' }
        })
    }
    const music = loadMusicWithXcasper(xcasper)
    const result = await music.searchAndDownload('Example song')
    assert.equal(result.success, true)
    assert.equal(result.audioUrl, 'https://media.example/song.mp3?token=redacted')
    assert.equal(typeof result.audioUrl, 'string')
})

test('downloadAudio rejects nested metadata without a usable media URL', async () => {
    const music = loadMusicWithXcasper({ youtubeAudio: async () => ({ audio: { format: 'mp3', filename: 'song.mp3' } }) })
    const result = await music.downloadAudio('https://youtube.com/watch?v=abc123')
    assert.equal(result.success, false)
})

test('downloadVideo normalizes nested video.downloadUrl to a string', async () => {
    const music = loadMusicWithXcasper({ youtubeVideo: async () => ({ video: { downloadUrl: 'https://media.example/video.mp4' } }) })
    const result = await music.downloadVideo('https://youtube.com/watch?v=abc123')
    assert.equal(result.success, true)
    assert.equal(result.url, 'https://media.example/video.mp4')
    assert.equal(typeof result.url, 'string')
})
