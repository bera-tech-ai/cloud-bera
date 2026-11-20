'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const { execFileSync } = require('child_process')

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bera-living-projects-'))
process.env.BERA_WORKSPACE = path.join(temp, 'workspace')
process.env.BERA_AGENT_STATE_FILE = path.join(temp, 'agent-os.json')
const state = { projectSupport: { projects: {}, cases: {}, activeByUser: {}, activeByChat: {} } }
global.db = { get data() { return state }, async write() {} }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
    if (parent?.filename?.endsWith('/Library/actions/agent-os.js') && request === './xcasper') return { chat: async () => ({ success: false, error: 'stubbed in test' }) }
    if (parent?.filename?.endsWith('/Library/actions/agent-os.js') && request === './github') return {}
    if (parent?.filename?.endsWith('/Library/actions/agent-os.js') && request === './browser') return { takeScreenshot: async () => ({ success: false }) }
    return originalLoad.call(this, request, parent, isMain)
}
const agentOs = require('../Library/actions/agent-os')
const support = require('../Library/actions/project-support')
Module._load = originalLoad
after(() => fs.rmSync(temp, { recursive: true, force: true }))
const owner = '15550000001@s.whatsapp.net'
const group = '120363000000000000@g.us'
let project
let record
let sourceDir

const setup = async () => {
    const created = await agentOs.create({ userId: owner, name: 'test-project', projectId: 'test-project-id', task: 'test project' })
    assert.equal(created.success, true)
    record = created.record
    sourceDir = record.dir
    fs.mkdirSync(sourceDir, { recursive: true })
    execFileSync('git', ['init'], { cwd: sourceDir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test Owner'], { cwd: sourceDir })
    execFileSync('git', ['config', 'user.email', 'owner@example.test'], { cwd: sourceDir })
    fs.writeFileSync(path.join(sourceDir, 'README.md'), '# Test project\n')
    execFileSync('git', ['add', 'README.md'], { cwd: sourceDir })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: sourceDir, stdio: 'ignore' })
    project = await support.registerProject(record, { userId: owner, chat: group })
}

test('group member can file an issue but cannot access owner controls', async () => {
    await setup()
    const received = []
    const conn = { async sendMessage(_chat, payload) { received.push(payload); return { key: { id: 'sent' } } } }
    await support.handleCommand('report Login screen crashes', {
        m: { chat: group, sender: '15550000002@s.whatsapp.net', text: 'report Login screen crashes' },
        conn,
        sender: '15550000002@s.whatsapp.net',
        chat: group,
        isOwner: false,
        reply: async text => received.push({ text })
    })
    const issue = Object.values(state.projectSupport.cases)[0]
    assert.ok(issue)
    assert.equal(issue.state, 'reported')
    assert.ok(received.some(x => x.text?.includes('Issue recorded')))
    const access = support.findProject({ projectId: project.id, sender: '15550000002@s.whatsapp.net', chat: group, isOwner: false })
    assert.equal(access.error, undefined)
    let buttonReply = ''
    await support.handleCommand(`approve ${issue.id}`, {
        m: { chat: group, sender: '15550000002@s.whatsapp.net' },
        sender: '15550000002@s.whatsapp.net', chat: group, isOwner: false,
        reply: async text => { buttonReply = text }
    })
    assert.match(buttonReply, /Only the project owner/i)
    await assert.rejects(() => support.previewCase(issue, project, { sender: '15550000002@s.whatsapp.net', isOwner: false }), /project owner/i)
    await assert.rejects(() => support.applyCase({ ...issue, state: 'preview_ready' }, project, { sender: '15550000002@s.whatsapp.net', isOwner: false }, null), /project owner/i)
})

test('owner preview uses a separate copy without environment files, dependencies, or symlinks', async () => {
    fs.writeFileSync(path.join(sourceDir, '.env'), 'SHOULD_NOT_COPY=secret\n')
    fs.mkdirSync(path.join(sourceDir, 'node_modules', 'private-package'), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'node_modules', 'private-package', 'index.js'), 'not for preview')
    const checkpointHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf8' }).trim()
    const checkpoint = await agentOs.checkpoint(record, 'security test checkpoint')
    assert.equal(checkpoint.success, true)
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf8' }).trim(), checkpointHead)
    assert.equal(execFileSync('git', ['ls-files', '--', '.env', 'node_modules'], { cwd: sourceDir, encoding: 'utf8' }).trim(), '')
    const outside = path.join(temp, 'outside-secret.txt')
    fs.writeFileSync(outside, 'not for preview')
    fs.symlinkSync(outside, path.join(sourceDir, 'linked-secret.txt'))
    execFileSync('git', ['add', 'linked-secret.txt'], { cwd: sourceDir })
    execFileSync('git', ['commit', '-m', 'add preview symlink fixture'], { cwd: sourceDir, stdio: 'ignore' })
    const caseEntry = await support.createCase({ project, sender: owner, chat: group, description: 'Check the settings page.' })
    const originalRun = agentOs.run
    let previewRecord
    agentOs.run = async options => {
        previewRecord = agentOs.get(options.projectId)
        return { success: true, record: { preview: { url: `http://127.0.0.1:${options.port}` }, checks: [{ name: 'test', success: true }] }, validation: { checks: [{ name: 'test', success: true }] } }
    }
    try {
        const result = await support.previewCase(caseEntry, project, { sender: owner, isOwner: false })
        assert.equal(result.state, 'preview_ready')
        assert.ok(previewRecord?.dir)
        assert.ok(fs.existsSync(path.join(previewRecord.dir, 'README.md')))
        assert.equal(fs.existsSync(path.join(previewRecord.dir, '.env')), false)
        assert.equal(fs.existsSync(path.join(previewRecord.dir, 'node_modules')), false)
        assert.equal(fs.existsSync(path.join(previewRecord.dir, 'linked-secret.txt')), false)
        assert.ok(fs.existsSync(path.join(sourceDir, '.env')), 'the original project is not altered by preview preparation')
    } finally {
        agentOs.run = originalRun
    }
})

test('explicit cross-user project IDs are denied outside the registered group', () => {
    const access = support.findProject({ projectId: project.id, sender: '15550000003@s.whatsapp.net', chat: '15550000003@s.whatsapp.net', isOwner: false })
    assert.match(access.error, /access/i)
    return agentOs.run({ action: 'status', projectId: project.id, userId: '15550000003@s.whatsapp.net' }).then(result => {
        assert.equal(result.success, false)
        assert.match(result.error, /access denied/i)
    })
})

test('unapproved Agent OS publishing is blocked before lifecycle calls', async () => {
    const result = await agentOs.run({ action: 'publish', projectId: project.id, userId: owner })
    assert.equal(result.success, false)
    assert.match(result.error, /owner-approved/i)
    const runResult = await agentOs.run({ action: 'run', userId: owner, task: 'do not execute', publish: true })
    assert.equal(runResult.success, false)
    assert.match(runResult.error, /owner-approved/i)
})

test('initial-build approval is bound to a clean source head and calls publish only after owner approval', async () => {
    const baseHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf8' }).trim()
    const approval = await support.createBuildApproval(record, { userId: owner, chat: group, requestedPublish: true, repositoryVisibility: 'public' })
    assert.ok(approval)
    assert.equal(approval.baseHead, baseHead)
    assert.equal(approval.state, 'preview_ready')
    assert.equal(approval.repositoryVisibility, 'public')
    const originalRun = agentOs.run
    const publishCalls = []
    agentOs.run = async options => {
        publishCalls.push(options)
        return { success: true, record: { github: { url: 'https://github.com/owner/test-project' } } }
    }
    try {
        await assert.rejects(() => support.applyCase(approval, project, { sender: '15550000002@s.whatsapp.net', isOwner: false }, 'github'), /project owner/i)
        assert.equal(publishCalls.length, 0)
        const applied = await support.applyCase(approval, project, { sender: owner, isOwner: false }, 'github')
        assert.equal(applied.state, 'published')
        assert.equal(publishCalls.length, 1)
        assert.equal(publishCalls[0].action, 'publish')
        assert.equal(publishCalls[0].ownerAuthorized, true)
        assert.equal(publishCalls[0].deploy, false)
        assert.equal(publishCalls[0].private, false)
        let staleReply = ''
        await support.handleCommand(`approve ${approval.id} github`, {
            m: { chat: group, sender: owner }, sender: owner, chat: group, isOwner: false,
            reply: async text => { staleReply = text }
        })
        assert.match(staleReply, /no passing preview/i)
        assert.equal(publishCalls.length, 1, 'replayed approval button must not publish twice')
    } finally {
        agentOs.run = originalRun
    }
})

test('numbered replies resolve only for the exact pending prompt and preserve owner authorization', async () => {
    const approval = await support.createBuildApproval(record, {
        userId: owner, chat: group, requestedPublish: true, requestedDeploy: true
    })
    assert.equal(approval.repositoryVisibility, 'private')
    const prompt = `Bera project approval request\nCase ID: ${approval.id}\nProject: test-project\nAction: GitHub publication and deployment`

    assert.equal(support.resolveApprovalReply({ text: '1', quotedText: prompt, quotedId: 'prompt-1', chat: group }), null,
        'a quoted prompt is not valid until the outgoing message ID is recorded')
    assert.equal(await support.recordApprovalPromptMessage(approval.id, { id: 'prompt-1', remoteJid: group }), true)

    assert.deepEqual(support.resolveApprovalReply({ text: '1', quotedText: prompt, quotedId: 'prompt-1', chat: group }), {
        caseId: approval.id, action: 'approve', mode: 'deploy'
    })
    assert.deepEqual(support.resolveApprovalReply({ text: '2', quotedText: prompt, quotedId: 'prompt-1', chat: group }), {
        caseId: approval.id, action: 'undo', mode: 'deploy'
    })
    assert.equal(support.resolveApprovalReply({ text: '1', quotedText: prompt, quotedId: 'different-message', chat: group }), null)
    assert.equal(support.resolveApprovalReply({ text: '1', quotedText: prompt, quotedId: 'prompt-1', chat: '15550000001@s.whatsapp.net' }), null)
    assert.equal(support.resolveApprovalReply({ text: '1', quotedText: 'ordinary quoted message', quotedId: 'prompt-1', chat: group }), null)
    assert.equal(support.resolveApprovalReply({ text: '1', quotedText: '', quotedId: '', chat: group }), null,
        'an unquoted number cannot be interpreted as an approval')
    assert.equal(support.resolveApprovalReply({ text: '1. yes', quotedText: prompt, quotedId: 'prompt-1', chat: group }), null)

    approval.state = 'approved_publish_failed'
    assert.deepEqual(support.resolveApprovalReply({ text: '1', quotedText: prompt, quotedId: 'prompt-1', chat: group }), {
        caseId: approval.id, action: 'approve', mode: 'deploy'
    }, 'the owner can retry the failed publish by replying 1 again')
    assert.equal(support.resolveApprovalReply({ text: '2', quotedText: prompt, quotedId: 'prompt-1', chat: group }), null,
        'decline is available only while approval is still pending')
    approval.state = 'preview_ready'

    let unauthorizedReply = ''
    await support.handleCommand(`approve ${approval.id} deploy`, {
        m: { chat: group, sender: '15550000002@s.whatsapp.net' },
        sender: '15550000002@s.whatsapp.net', chat: group, isOwner: false,
        reply: async text => { unauthorizedReply = text }
    })
    assert.match(unauthorizedReply, /Only the project owner/i)
    assert.equal(approval.state, 'preview_ready', 'an unauthorized numeric approval must not alter the case')
})

test('owner can retry a failed publish only while the approved source head remains unchanged', async () => {
    const approval = await support.createBuildApproval(record, {
        userId: owner, chat: group, requestedPublish: true, requestedDeploy: true
    })
    approval.state = 'approved_publish_failed'
    approval.approvedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceDir, encoding: 'utf8' }).trim()
    const originalRun = agentOs.run
    const publishCalls = []
    agentOs.run = async options => {
        publishCalls.push(options)
        return { success: true, record: { deployment: { url: 'https://example.test' } } }
    }
    try {
        await assert.rejects(
            () => support.applyCase(approval, project, { sender: '15550000002@s.whatsapp.net', isOwner: false }, 'deploy'),
            /Only the project owner/i
        )
        assert.equal(publishCalls.length, 0)

        const retried = await support.applyCase(approval, project, { sender: owner, isOwner: false }, 'deploy')
        assert.equal(retried.state, 'published')
        assert.equal(retried.publishResult.url, 'https://example.test')
        assert.equal(publishCalls.length, 1)
        assert.equal(publishCalls[0].action, 'publish')
        assert.equal(publishCalls[0].ownerAuthorized, true)
    } finally {
        agentOs.run = originalRun
    }

    const stale = await support.createBuildApproval(record, {
        userId: owner, chat: group, requestedPublish: true, requestedDeploy: true
    })
    stale.state = 'approved_publish_failed'
    stale.approvedHead = 'not-the-current-head'
    await assert.rejects(
        () => support.applyCase(stale, project, { sender: owner, isOwner: false }, 'deploy'),
        /Project changed after the failed publish/i
    )
    assert.equal(publishCalls.length, 1, 'stale project content must never be republished')
})
