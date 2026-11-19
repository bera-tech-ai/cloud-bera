'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { findMediaUrl } = require('../Library/lib/media-url')

test('extracts the Xcasper nested audio download URL', () => {
    const response = {
        sourceUrl: 'https://youtube.com/watch?v=example',
        title: 'Example song',
        audio: {
            format: 'mp3',
            downloadUrl: 'https://media.example/audio.mp3?token=redacted',
            filename: 'song.mp3'
        }
    }
    assert.equal(findMediaUrl(response), 'https://media.example/audio.mp3?token=redacted')
})

test('accepts direct URL aliases and nested video payloads', () => {
    assert.equal(findMediaUrl({ download_url: '/tmp/audio.mp3' }), '/tmp/audio.mp3')
    assert.equal(findMediaUrl({ data: { result: { video: { url: 'https://media.example/video.mp4' } } } }), 'https://media.example/video.mp4')
})

test('does not return an object or an empty URL as a media path', () => {
    assert.equal(findMediaUrl({ audio: { format: 'mp3', filename: 'song.mp3' } }), null)
    assert.equal(findMediaUrl({ url: '   ' }), null)
    assert.equal(findMediaUrl(null), null)
})
