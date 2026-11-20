'use strict'

const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const github = require('../Library/actions/github')
const { getOrCreateRepository, extractDeploymentUrl } = require('../Library/actions/project-lifecycle')

const originalGetRepo = github.getRepo
const originalCreateRepo = github.createRepo
const owner = 'bera-owner'
const repoName = 'kijani-coffee'
const existingRepo = {
    name: repoName,
    html_url: `https://github.com/${owner}/${repoName}`,
    owner: { login: owner },
    private: true
}

test('normalizes GitHub descriptions to 350 Unicode code points', () => {
    const longAscii = github.normalizeRepositoryDescription('a'.repeat(500))
    assert.equal(Array.from(longAscii).length, 350)

    const longEmoji = github.normalizeRepositoryDescription('🧋'.repeat(400))
    assert.equal(Array.from(longEmoji).length, 350)
    assert.ok(longEmoji.endsWith('🧋'))
})

test('extracts deployment URLs from direct, aliased, and nested BeraHost response fields', () => {
    assert.equal(extractDeploymentUrl({ url: 'https://site.example' }), 'https://site.example')
    assert.equal(extractDeploymentUrl({ live_url: 'https://live.example' }), 'https://live.example')
    assert.equal(extractDeploymentUrl({ data: { deployment: { publicUrl: 'https://public.example' } } }), 'https://public.example')
    assert.equal(extractDeploymentUrl({ domain: 'site.example' }), 'https://site.example')
    assert.equal(extractDeploymentUrl({ status: 'running' }), null)
})

afterEach(() => {
    github.getRepo = originalGetRepo
    github.createRepo = originalCreateRepo
})

test('reuses an existing repository only when its owner and visibility match', async () => {
    github.getRepo = async () => ({ ...existingRepo })
    github.createRepo = async () => { throw new Error('should not create a duplicate') }

    const result = await getOrCreateRepository(owner, repoName, { isPrivate: true })
    assert.equal(result.html_url, existingRepo.html_url)
})

test('creates a repository only after a confirmed 404', async () => {
    let lookups = 0
    let createArgs
    github.getRepo = async () => {
        lookups++
        return { error: 'Not Found', status: 404 }
    }
    github.createRepo = async (...args) => {
        createArgs = args
        return { ...existingRepo }
    }

    const result = await getOrCreateRepository(owner, repoName, { isPrivate: true, description: 'A test project' })
    assert.equal(result.html_url, existingRepo.html_url)
    assert.equal(lookups, 1)
    assert.deepEqual(createArgs, [repoName, true, 'A test project', { autoInit: false }])
})

test('recovers an already-created matching repository after a creation conflict', async () => {
    let lookups = 0
    github.getRepo = async () => {
        lookups++
        return lookups === 1 ? { error: 'Not Found', status: 404 } : { ...existingRepo }
    }
    github.createRepo = async () => ({
        error: 'Repository creation failed.', status: 422,
        details: [{ resource: 'Repository', field: 'name', code: 'already_exists' }]
    })

    const result = await getOrCreateRepository(owner, repoName, { isPrivate: true })
    assert.equal(result.html_url, existingRepo.html_url)
    assert.equal(lookups, 2)
})

test('does not create after authorization or network errors and includes status/details', async () => {
    github.getRepo = async () => ({ error: 'Resource not accessible by integration', status: 403 })
    let createCalled = false
    github.createRepo = async () => { createCalled = true; return { ...existingRepo } }

    await assert.rejects(
        () => getOrCreateRepository(owner, repoName, { isPrivate: true }),
        /GitHub repository lookup failed \(HTTP 403\): Resource not accessible by integration/
    )
    assert.equal(createCalled, false)
})

test('does not reuse a same-named repository under another owner or with different visibility', async () => {
    github.getRepo = async () => ({ ...existingRepo, owner: { login: 'someone-else' } })
    await assert.rejects(() => getOrCreateRepository(owner, repoName, { isPrivate: true }), /authenticated GitHub owner/i)

    github.getRepo = async () => ({ ...existingRepo, private: false })
    await assert.rejects(() => getOrCreateRepository(owner, repoName, { isPrivate: true }), /different visibility/i)
})
