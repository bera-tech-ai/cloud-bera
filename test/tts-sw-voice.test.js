'use strict'
// 2026-11-27: Bera picked Microsoft's Kenyan neural voice Zuri
// (sw-KE-ZuriNeural) for Swahili after hearing samples. Edge TTS —
// written off in Nov 2026 when its WebSocket 403'd from this host —
// works again (routing changed), so fetchTts now runs a Swahili
// ladder: Edge Zuri → Google (sw) → Piper. These tests drive the real
// fetchTts with a stub edge-tts binary (a Node script that copies a
// real WAV to the --write-media target and logs its argv), so no
// network is used; the WAV still goes through the real ffmpeg → Opus
// conversion.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { fetchTts, resolveEdgeTts, fetchEdgeMp3, EDGE_SW_VOICE_DEFAULT } = require('../Library/actions/tts')

const makeWav = (seconds = 0.25, sampleRate = 24000) => {
    const frames = Math.floor(seconds * sampleRate)
    const dataSize = frames * 2
    const buf = Buffer.alloc(44 + dataSize)
    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(36 + dataSize, 4)
    buf.write('WAVE', 8, 'ascii')
    buf.write('fmt ', 12, 'ascii')
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(1, 22)
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(sampleRate * 2, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36, 'ascii')
    buf.writeUInt32LE(dataSize, 40)
    return buf
}

const makeStub = (dir, { fail = false } = {}) => {
    const wavFile = path.join(dir, 'sample.wav')
    fs.writeFileSync(wavFile, makeWav())
    const stub = path.join(dir, 'edge-tts-stub')
    const body = fail
        ? '#!/bin/sh\nexit 3\n'
        : `#!/usr/bin/env node\nconst fs = require('fs')\nconst args = process.argv.slice(2)\nfs.writeFileSync(${JSON.stringify(path.join(dir, 'argv.json'))}, JSON.stringify(args))\nfs.copyFileSync(${JSON.stringify(wavFile)}, args[args.indexOf('--write-media') + 1])\n`
    fs.writeFileSync(stub, body, { mode: 0o755 })
    return stub
}

const withEnv = async (vars, fn) => {
    const saved = {}
    for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k] }
    try { return await fn() } finally {
        for (const k of Object.keys(vars)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    }
}

test('resolveEdgeTts: env override wins; missing venv yields null', async () => {
    await withEnv({ BERA_EDGE_TTS_BIN: '/somewhere/edge-tts' }, async () => {
        assert.equal(resolveEdgeTts(), '/somewhere/edge-tts')
    })
    const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-nohome-'))
    await withEnv({ BERA_EDGE_TTS_BIN: undefined, HOME: emptyHome }, async () => {
        assert.equal(resolveEdgeTts(), null)
    })
    fs.rmSync(emptyHome, { recursive: true, force: true })
    assert.equal(EDGE_SW_VOICE_DEFAULT, 'sw-KE-ZuriNeural')
})

test('fetchEdgeMp3: stub binary produces the file; failures reject cleanly', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-edge-'))
    try {
        const out = path.join(dir, 'out.mp3')
        await fetchEdgeMp3('Habari yako', 'sw-KE-ZuriNeural', out, makeStub(dir))
        assert.ok(fs.statSync(out).size > 44)
        await assert.rejects(() => fetchEdgeMp3('Habari', 'sw-KE-ZuriNeural', out, makeStub(dir, { fail: true })), /exited with code 3/)
        await assert.rejects(() => fetchEdgeMp3('Habari', 'sw-KE-ZuriNeural', out, null), /not installed/)
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('fetchTts: Swahili and Sheng are spoken by Edge Zuri, not Piper', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-edge-tts-'))
    try {
        const stub = makeStub(dir)
        await withEnv({ BERA_EDGE_TTS_BIN: stub, BERA_TTS_EDGE: undefined, BERA_TTS_SW_VOICE: undefined }, async () => {
            const audio = await fetchTts('Habari yako, karibu sana. Leo ni siku nzuri.', 'sw')
            assert.ok(audio.length > 100)
            assert.equal(audio.toString('ascii', 0, 4), 'OggS')
            const argv = JSON.parse(fs.readFileSync(path.join(dir, 'argv.json'), 'utf8'))
            assert.equal(argv[argv.indexOf('--voice') + 1], 'sw-KE-ZuriNeural')
            // Sheng resolves to Swahili speech → same ladder, same voice.
            const audio2 = await fetchTts('Sasa mkuu, niaje? Kila kitu kiko sawa.', 'sheng')
            assert.equal(audio2.toString('ascii', 0, 4), 'OggS')
        })
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('wiring: the Swahili ladder runs Edge → Google → Piper, with a kill switch', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Library', 'actions', 'tts.js'), 'utf8')
    const edgeAt = src.indexOf("speechLanguage === 'sw' && process.env.BERA_TTS_EDGE !== '0'")
    const googleSwAt = src.indexOf("fetchGoogleMp3Parts(speakable, 'sw', tempDir)")
    const piperAt = src.indexOf('const piper = resolvePiper(language)')
    assert.ok(edgeAt > -1 && googleSwAt > edgeAt && piperAt > googleSwAt, 'ladder order Edge → Google → Piper')
    assert.match(src, /BERA_TTS_SW_VOICE \|\| VOICE_MAP\.sw/)
    assert.match(src, /Using Edge Zuri voice \(Swahili\)/)
})
