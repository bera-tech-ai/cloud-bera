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
    await replyProgress('🏗️ I’ll build and validate the project locally first. Any GitHub push or deployment will wait for a separate owner approval tied to this exact build.')
    const result = await agentOs.run({
        action: 'run',
        userId,
        name: projectName(text),
        task: text,
        preview: true,
        screenshot: true,
        publish: false,
        deploy: false,
        private: true,
        skipUnapprovedShell: true,
        onProgress: async progress => {
            if (progress.phase === 'planning') {
                await replyProgress('🧠 Planning the project locally and contacting the AI planner...')
            } else if (progress.phase === 'ai_provider' && progress.stage === 'trying') {
                const label = ({ deepseek: 'DeepSeek', publicai: 'PublicAI', gemini: 'Gemini', keithai: 'KeithAI' })[progress.provider] || progress.provider
                await replyProgress(`🔌 AI planner: trying ${label} (${progress.index + 1}/${progress.total})...`)
            } else if (progress.phase === 'planning_complete') {
                const label = ({ deepseek: 'DeepSeek', publicai: 'PublicAI', gemini: 'Gemini', keithai: 'KeithAI' })[progress.provider] || progress.provider
                await replyProgress(`✅ AI planner responded via ${label}; preparing the project files.`)
            } else if (progress.phase === 'planner_json_local_repair') {
                await replyProgress('🔧 Planner JSON needed formatting; repairing the response locally before continuing.')
            } else if (progress.phase === 'execute') {
                const { index, total, action } = progress
                if (index === 0 || index === total - 1 || (index + 1) % 4 === 0) {
                    await replyProgress(`⚙️ Building locally: step ${index + 1}/${total} (${String(action || 'work').replace(/_/g, ' ')}). Repository creation and deployment remain after build validation.`)
                }
            } else if (progress.phase === 'validation') {
                await replyProgress('🧪 Project files are generated; installing dependencies and running available build/tests now.')
            } else if (progress.phase === 'shell_skipped') {
                await replyProgress('⏭️ Skipped a planner shell command that is not allowlisted. General shell access stays disabled; Bera will rely on managed install/build/test validation.')
            } else if (progress.phase === 'repair') {
                await replyProgress(`🛠️ A local check failed; attempting repair ${progress.attempt}/${progress.total} before retrying validation.`)
            } else if (progress.phase === 'repair_provider' && progress.stage === 'trying') {
                const label = ({ deepseek: 'DeepSeek', publicai: 'PublicAI', gemini: 'Gemini', keithai: 'KeithAI' })[progress.provider] || progress.provider
                await replyProgress(`🔌 Repair planner: trying ${label} (${progress.index + 1}/${progress.total})...`)
            } else if (progress.phase === 'checkpoint') {
                await replyProgress('💾 Checks passed; saving the local build checkpoint. No GitHub push or deployment is happening yet.')
            } else if (progress.phase === 'preview') {
                await replyProgress('🖥️ Starting a local preview and attempting a screenshot...')
            }
        }
    })
    const record = result.record || {}
    const failureDetails = validationFailureDetails(result, record)
    const failureMessage = [result.error, failureDetails].filter(Boolean).join(' | ').slice(0, 1800)
    const buildValidated = Boolean(record.checkpoint) && (record.checks || []).length > 0 && (record.checks || []).every(check => check.success)
    let approvalCase = null
    if (record.id) {
        try {
            const support = require('./project-support')
            await support.registerProject(record, { userId, chat })
            if (result.success && buildValidated && repoRequested) {
                approvalCase = await support.createBuildApproval(record, { userId, chat, requestedPublish: repoRequested, requestedDeploy: deployRequested })
            }
        } catch (error) {
            await replyProgress(`⚠️ Project memory/approval metadata could not be saved: ${error.message}`)
        }
    }
    const parts = [
        buildValidated ? '✅ Project built and validated locally.' : `❌ Project build failed: ${failureMessage || 'validation or checkpoint did not pass; no diagnostic was returned'}`,
        !result.success && buildValidated ? `⚠️ Publishing/deployment did not finish: ${result.error || 'unknown error'}` : null,
        record.name ? `Project: ${record.name}` : null,
        record.dir ? `Workspace: ${record.dir}` : null,
        record.checks?.length ? `Checks: ${record.checks.map(c => `${c.name} ${c.success ? 'passed' : 'failed'}`).join(', ')}` : null,
        record.github?.url ? `GitHub: ${record.github.url}` : null,
        record.deployment?.url ? `Live site: ${record.deployment.url}` : null,
        record.deployment?.status === 'approval_required' ? 'Production deployment needs approval.' : null,
        approvalCase ? `Owner approval is pending. Reply directly to the separate approval prompt with 1 to approve or 2 to decline (case ${approvalCase.id}).` : null,
        !approvalCase && (repoRequested || deployRequested) && buildValidated ? 'No repository or deployment was created; project approval metadata was not recorded.' : null
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
                'Repository visibility stays private by default. Bera will not make the source public automatically; BeraHost must already have authorized access to clone a private repository.',
                'Reply directly to this message with 1 to approve or 2 to decline.'
            ].join('\n')
            const sent = await conn.sendMessage(chat, { text: prompt }, message ? { quoted: message } : {})
            const support = require('./project-support')
            await support.recordApprovalPromptMessage(approvalCase.id, {
                id: sent?.key?.id,
                remoteJid: sent?.key?.remoteJid || chat
            })
        } catch {}
    }
    if (result.screenshot?.buffer && conn?.sendMessage && chat) {
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

module.exports = { looksLikeProjectBuild, runProjectBuild, validationFailureDetails }
