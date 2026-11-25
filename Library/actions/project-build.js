'use strict'

const looksLikeProjectBuild = text => {
    const value = String(text || '')
    return /\b(build|create|make|develop|scaffold|code)\b[\s\S]{0,180}\b(app(?:lication)?|website|web\s*app|site|project|dashboard|tracker|tool)\b/i.test(value) ||
        /\b(app|website|web\s*app|site|project|dashboard|tracker)\b[\s\S]{0,180}\b(build|create|make|develop|scaffold|code)\b/i.test(value)
}

const projectName = text => {
    const value = String(text || '')
    const quoted = value.match(/\b(?:called|named)\s+(?:“([^”\n]{2,60})”|‘([^’\n]{2,60})’|"([^"\n]{2,60})"|'([^'\n]{2,60})')/i)
    const unquoted = value.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9 _'-]{1,50}?)(?=\s+(?:and\s+(?:deploy|publish|push|launch|create|make|ask|validate|test)\b|with\b|including\b)|[.!?]\s|$)/i)
    const explicit = quoted?.slice(1).find(Boolean) || unquoted?.[1]
    if (explicit) return explicit.trim().replace(/[.!?,;:]+$/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const hint = String(text || '').match(/\b(todo|task|expense|weather|portfolio|recipe|chat|blog|shop|tracker|dashboard|calculator|notes?)\b/i)?.[1]
    return `${(hint || 'bera').toLowerCase()}-app`
}

const repositoryVisibilityFromRequest = text => {
    const value = String(text || '').toLowerCase()
    const visibility = value.match(/\b(public|private)\s+(?:github\s+)?(?:repo|repository)\b|\b(?:github\s+)?(?:repo|repository)\s+(?:be\s+)?(public|private)\b/)
    const explicitChoice = value.match(/\b(?:make|set|keep)\s+(?:it|the\s+(?:github\s+)?(?:repo|repository))\s+(public|private)\b/)
    // Public by default: BeraHost has no GitHub account connected, so it can
    // only clone public repositories. An explicit "private" request is still
    // honoured (that repo then cannot deploy on BeraHost).
    if (!visibility && !explicitChoice) return 'public'
    const requested = visibility?.[1] || visibility?.[2] || explicitChoice?.[1]
    if (requested === 'public' && /\b(?:don't|do not|dont|never)\b[\s\S]{0,40}\bpublic\b/.test(value)) return 'private'
    return requested
}

const validationFailureDetails = (result = {}, record = {}) => {
    const checks = Array.isArray(result.validation?.checks) ? result.validation.checks : Array.isArray(record.checks) ? record.checks : []
    return checks.filter(check => !check.success).map(check => {
        const detail = String(check.output || check.error || 'No diagnostic was returned.')
            .replace(/\u001b\[[0-9;]*m/g, '')
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 600)
        return `${check.name || 'validation'}: ${detail}`
    }).join('; ').slice(0, 1400)
}

const runProjectBuild = async (text, { userId, conn, chat, message } = {}) => {
    const agentOs = require('./agent-os')
    const { addRequesterMention } = require('../lib/group-mentions')
    const replyProgress = async content => {
        if (conn?.sendMessage && chat) {
            try {
                await conn.sendMessage(chat, addRequesterMention(message, content), message ? { quoted: message } : {})
            } catch {}
        }
    }
    const deployRequested = /\b(deploy|publish|launch\s+(?:it|the\s+app|the\s+site))\b/i.test(text)
    const repoRequested = deployRequested || /\b(github|repository|repo|push\s+(?:the\s+)?(?:code|project))\b/i.test(text)
    const repositoryVisibility = repositoryVisibilityFromRequest(text)
    let requesterIsOwner = false
    try { requesterIsOwner = Boolean(require('../../Auth').isAuthorized(userId)?.isOwner) } catch {}
    await replyProgress(deployRequested && requesterIsOwner
        ? '🏗️ I’ll build and validate the project locally first, then push and deploy it as you asked.'
        : '🏗️ I’ll build and validate the project locally first. Any GitHub push or deployment will wait for a separate owner approval tied to this exact build.')
    const progressSent = new Set()
    const result = await agentOs.run({
        action: 'run',
        userId,
        name: projectName(text),
        task: text,
        preview: true,
        screenshot: true,
        publish: false,
        deploy: false,
        private: repositoryVisibility !== 'public',
        skipUnapprovedShell: true,
        onProgress: async progress => {
            // One short message per build stage at most. Provider tries,
            // plan steps, JSON repairs and retries stay silent; the final
            // summary reports the outcome.
            const milestones = {
                planning: '🧠 Planning the project...',
                execute: '⚙️ Building the project files...',
                validation: '🧪 Files are ready; checking the build...',
                repair: '🛠️ A check failed; fixing it and re-checking...',
                preview: '🖥️ Starting a local preview...'
            }
            const text = milestones[progress.phase]
            if (!text || progressSent.has(text)) return
            if (progress.phase === 'execute' && progress.index !== 0) return
            progressSent.add(text)
            await replyProgress(text)
        }
    })
    const record = result.record || {}
    const failureDetails = validationFailureDetails(result, record)
    const failureMessage = [result.error, failureDetails].filter(Boolean).join(' | ').slice(0, 1800)
    const buildValidated = Boolean(record.checkpoint) && (record.checks || []).length > 0 && (record.checks || []).every(check => check.success)
    const usedFallback = Boolean(record.usedFallback)
    // The owner explicitly asking to deploy in the same message IS the
    // approval — no separate prompt. The prompt stays for everyone else,
    // for builds without an explicit deploy request, and for fallback
    // builds (a starter template must never go live unnoticed).
    const skipApproval = Boolean(deployRequested && requesterIsOwner && result.success && buildValidated && !usedFallback)
    let approvalCase = null
    let directPublish = null
    if (record.id) {
        try {
            const support = require('./project-support')
            await support.registerProject(record, { userId, chat })
            if (result.success && buildValidated && repoRequested) {
                if (skipApproval) {
                    try {
                        directPublish = await agentOs.run({ action: 'publish', projectId: record.id, userId, private: repositoryVisibility !== 'public', deploy: true, approveProduction: true, ownerAuthorized: true })
                    } catch (error) {
                        directPublish = { success: false, error: error.message }
                    }
                    const updated = agentOs.get(record.id)
                    if (updated) {
                        record.github = updated.github || record.github
                        record.deployment = updated.deployment || record.deployment
                    }
                } else {
                    approvalCase = await support.createBuildApproval(record, { userId, chat, requestedPublish: repoRequested, requestedDeploy: deployRequested, repositoryVisibility })
                }
            }
        } catch (error) {
            await replyProgress(`⚠️ Project memory/approval metadata could not be saved: ${error.message}`)
        }
    }
    const parts = [
        buildValidated ? (usedFallback ? '⚠️ The AI planner could not generate the requested design, so this is a starter template — the requested content is missing. Review it before approving.' : '✅ Project built and validated locally.') : `❌ Project build failed: ${failureMessage || 'validation or checkpoint did not pass; no diagnostic was returned'}`,
        !result.success && buildValidated ? `⚠️ Publishing/deployment did not finish: ${result.error || 'unknown error'}` : null,
        record.name ? `Project: ${record.name}` : null,
        record.dir ? `Workspace: ${record.dir}` : null,
        record.checks?.length ? `Checks: ${record.checks.map(c => `${c.name} ${c.success ? 'passed' : 'failed'}`).join(', ')}` : null,
        record.github?.url ? `GitHub: ${record.github.url}` : null,
        record.deployment?.url ? `Live site: ${record.deployment.url}` : null,
        record.deployment?.status === 'approval_required' ? 'Production deployment needs approval.' : null,
        directPublish?.success ? '🚀 Published and deployed as you asked — no separate approval needed.' : null,
        directPublish && !directPublish.success ? `⚠️ You asked me to deploy it, but publishing/deployment did not finish: ${directPublish.error || 'unknown error'}` : null,
        approvalCase ? `Owner approval is pending. Reply directly to the separate approval prompt with 1 to approve or 2 to decline (case ${approvalCase.id}).` : null,
        !approvalCase && !directPublish?.success && (repoRequested || deployRequested) && buildValidated ? 'No repository or deployment was created; project approval metadata was not recorded.' : null
    ].filter(Boolean)
    await replyProgress(parts.join('\n'))
    if (approvalCase && conn?.sendMessage && chat) {
        try {
            const mode = deployRequested ? 'GitHub publication and deployment' : 'GitHub publication'
            const prompt = [
                'Bera project approval request',
                `Case ID: ${approvalCase.id}`,
                `Project: ${record.name || record.id}`,
                `Action: ${mode}`,
                'The project was validated locally. No repository push or deployment happens unless an authorized project owner approves.',
                usedFallback ? '⚠️ This build fell back to a starter template; the requested content is not in it. Only approve if you want to publish the template as-is.' : null,
                repositoryVisibility === 'public'
                    ? 'The requested repository visibility is public. Confirm that source code is safe to expose before approving.'
                    : 'Repository visibility stays private by default. Bera will not make the source public automatically; BeraHost must already have authorized access to clone a private repository.',
                'Reply directly to this message with 1 to approve or 2 to decline.'
            ].filter(Boolean).join('\n')
            const sent = await conn.sendMessage(chat, { text: prompt }, message ? { quoted: message } : {})
            const support = require('./project-support')
            await support.recordApprovalPromptMessage(approvalCase.id, {
                id: sent?.key?.id,
                remoteJid: sent?.key?.remoteJid || chat
            })
        } catch {}
    }
    let deployShotSent = false
    if (directPublish?.success && record.deployment?.url && conn?.sendMessage && chat) {
        try {
            const { takeScreenshot } = require('./browser')
            const shot = await takeScreenshot(record.deployment.url)
            if (shot.success && Buffer.isBuffer(shot.buffer)) {
                const caption = `*${record.name || record.id}*\nLive: ${record.deployment.url}${record.github?.url ? `\nRepo: ${record.github.url}` : ''}`
                await conn.sendMessage(chat, {
                    image: shot.buffer,
                    mimetype: shot.mimetype || 'image/png',
                    ...addRequesterMention(message, caption, {}, 'caption')
                }, message ? { quoted: message } : {})
                deployShotSent = true
            }
        } catch {}
    }
    if (!deployShotSent && result.screenshot?.buffer && conn?.sendMessage && chat) {
        try {
            const caption = `📸 ${record.deployment?.url ? 'Deployment' : 'Preview'} screenshot${record.deployment?.url ? `\n${record.deployment.url}` : ''}`
            await conn.sendMessage(chat, {
                image: result.screenshot.buffer,
                mimetype: result.screenshot.mimetype || 'image/png',
                ...addRequesterMention(message, caption, {}, 'caption')
            }, message ? { quoted: message } : {})
        } catch {}
    }
    return result
}

module.exports = { looksLikeProjectBuild, runProjectBuild, validationFailureDetails, repositoryVisibilityFromRequest, projectName }
