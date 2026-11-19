'use strict'

const looksLikeProjectBuild = text => {
    const value = String(text || '')
    return /\b(build|create|make|develop|scaffold|code)\b[\s\S]{0,180}\b(app(?:lication)?|website|web\s*app|site|project|dashboard|tracker|tool)\b/i.test(value) ||
        /\b(app|website|web\s*app|site|project|dashboard|tracker)\b[\s\S]{0,180}\b(build|create|make|develop|scaffold|code)\b/i.test(value)
}

const projectName = text => {
    const explicit = String(text || '').match(/\b(?:called|named)\s+["']?([a-z0-9][a-z0-9 _-]{1,40})/i)
    if (explicit) return explicit[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const hint = String(text || '').match(/\b(todo|task|expense|weather|portfolio|recipe|chat|blog|shop|tracker|dashboard|calculator|notes?)\b/i)?.[1]
    return `${(hint || 'bera').toLowerCase()}-app`
}

const runProjectBuild = async (text, { userId, conn, chat, message } = {}) => {
    const agentOs = require('./agent-os')
    const replyProgress = async content => {
        if (conn?.sendMessage && chat) {
            try { await conn.sendMessage(chat, { text: content }, message ? { quoted: message } : {}) } catch {}
        }
    }
    const deployRequested = /\b(deploy|publish|launch\s+(?:it|the\s+app|the\s+site))\b/i.test(text)
    const repoRequested = deployRequested || /\b(github|repository|repo|push\s+(?:the\s+)?(?:code|project))\b/i.test(text)
    await replyProgress('🏗️ I’ll build and validate the project in your workspace first. I’ll create/push a repository only because you requested GitHub, and deploy only if you explicitly requested deployment.')
    const result = await agentOs.run({
        action: 'run',
        userId,
        name: projectName(text),
        task: text,
        preview: true,
        screenshot: true,
        publish: repoRequested,
        deploy: deployRequested,
        private: true,
        onProgress: async ({ index, total, action }) => {
            if (index === 0 || index === total - 1 || (index + 1) % 4 === 0) {
                await replyProgress(`⚙️ Building locally: step ${index + 1}/${total} (${action}). Repository creation and deployment remain after build validation.`)
            }
        }
    })
    const record = result.record || {}
    const buildValidated = Boolean(record.checkpoint) && (record.checks || []).every(check => check.success)
    const parts = [
        buildValidated ? '✅ Project built and validated locally.' : `❌ Project build failed: ${result.error || 'see validation details'}`,
        !result.success && buildValidated ? `⚠️ Publishing/deployment did not finish: ${result.error || 'unknown error'}` : null,
        record.name ? `Project: ${record.name}` : null,
        record.dir ? `Workspace: ${record.dir}` : null,
        record.checks?.length ? `Checks: ${record.checks.map(c => `${c.name} ${c.success ? 'passed' : 'failed'}`).join(', ')}` : null,
        record.github?.url ? `GitHub: ${record.github.url}` : null,
        record.deployment?.url ? `Live site: ${record.deployment.url}` : null,
        record.deployment?.status === 'approval_required' ? 'Production deployment needs approval.' : null
    ].filter(Boolean)
    await replyProgress(parts.join('\n'))
    if (result.screenshot?.buffer && conn?.sendMessage && chat) {
        try {
            await conn.sendMessage(chat, {
                image: result.screenshot.buffer,
                mimetype: result.screenshot.mimetype || 'image/png',
                caption: `📸 ${record.deployment?.url ? 'Deployment' : 'Preview'} screenshot${record.deployment?.url ? `\n${record.deployment.url}` : ''}`
            }, message ? { quoted: message } : {})
        } catch {}
    }
    return result
}

module.exports = { looksLikeProjectBuild, runProjectBuild }
