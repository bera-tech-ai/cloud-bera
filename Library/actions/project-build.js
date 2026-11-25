'use strict'

const looksLikeProjectBuild = text => {
    const value = String(text || '')
    return /\b(build|create|make|develop|scaffold|code)\b[\s\S]{0,180}\b(app(?:lication)?|website|web\s*app|site|project|dashboard|tracker|tool)\b/i.test(value) ||
        /\b(app|website|web\s*app|site|project|dashboard|tracker)\b[\s\S]{0,180}\b(build|create|make|develop|scaffold|code)\b/i.test(value)
}

const projectName = text => {
    const value = String(text || '')
    const quoted = value.match(/\b(?:called|named)\s+(?:“([^”\n]{2,60})”|‘([^’\n]{2,60})’|"([^"\n]{2,60})"|'([^'\n]{2,60})')/i)
    const unquoted = value.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9 _'-]{1,50}?)(?=\s+(?:and\s+(?:deploy|publish|push|launch|create|make|ask|validate|test)\b|with\b|including\b)|[.!?,]\s|$)/i)
    // "build a website for "Savannah Cuts"" / "for Savannah Cuts in Westlands":
    // the business name often follows "for" instead of called/named.
    const forQuoted = value.match(/\bfor\s+(?:“([^”\n]{2,60})”|‘([^’\n]{2,60})’|"([^"\n]{2,60})"|'([^'\n]{2,60})')/i)
    const forCapitalised = value.match(/\bfor\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/)
    const anyQuoted = value.match(/(?:“([^”\n]{2,60})”|"([^"\n]{2,60})")/)
    const raw = quoted?.slice(1).find(Boolean) || unquoted?.[1] || forQuoted?.slice(1).find(Boolean) || forCapitalised?.[1] || anyQuoted?.slice(1).find(Boolean)
    if (raw) {
        const slug = raw.trim().replace(/[.!?,;:]+$/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
        if (slug) return slug
    }
    const hint = String(text || '').match(/\b(todo|task|expense|weather|portfolio|recipe|chat|blog|shop|tracker|dashboard|calculator|notes?)\b/i)?.[1]
    return `${(hint || 'bera').toLowerCase()}-app`
}

const explicitRepoName = text => {
    const match = String(text || '').match(/\b(?:github\s+)?(?:repository|repo)\s+(?:named|called)\s+([a-z0-9][a-z0-9-_]{1,60})/i)
    return match ? match[1].toLowerCase() : null
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

const REVISION_VERB = /\b(change|edit|update|revise|modify|add|remove|delete|replace|rename|fix|make)\b/i
const normaliseProjectName = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// The newest record per project name for this user (several builds of the
// same project share one directory; the newest carries the live links).
const userProjectsByName = userId => {
    try {
        const agentOs = require('./agent-os')
        const byName = new Map()
        for (const record of agentOs.list(userId)) {
            if (!record?.name || !record?.dir) continue
            const prev = byName.get(record.name)
            if (!prev || String(record.updatedAt || record.createdAt || '') > String(prev.updatedAt || prev.createdAt || '')) byName.set(record.name, record)
        }
        return [...byName.values()]
    } catch { return [] }
}

// A revision names an edit verb AND one of the user's existing projects
// (full name, or its unique first word — "tembea", "swahili"). Build
// requests ("build a new site called X") are never revisions.
const parseProjectRevision = (text, projects) => {
    const value = String(text || '')
    if (!REVISION_VERB.test(value)) return null
    if (/\b(build|create|scaffold)\b/i.test(value) && /\b(called|named|new)\b/i.test(value)) return null
    const haystack = ` ${normaliseProjectName(value)} `
    const matches = []
    for (const project of projects || []) {
        const name = normaliseProjectName(project.name)
        if (!name) continue
        if (haystack.includes(` ${name} `)) { matches.push({ project, score: 2 }); continue }
        const first = name.split(' ')[0]
        if (first.length >= 5 && haystack.includes(` ${first} `)) matches.push({ project, score: 1 })
    }
    if (!matches.length) return null
    matches.sort((a, b) => b.score - a.score)
    if (matches.length > 1 && matches[0].score === matches[1].score && matches[0].project.id !== matches[1].project.id) return null
    return { project: matches[0].project, instruction: value }
}

const looksLikeProjectRevision = (text, userId) => Boolean(parseProjectRevision(text, userProjectsByName(userId)))

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
    const repoName = explicitRepoName(text)
    // A private repository can never be deployed on BeraHost — it has no
    // GitHub account connected, so it cannot clone private repos. When the
    // owner asks for both, honour the private repo, skip the doomed deploy,
    // and say so plainly instead of reporting a failed deployment.
    const deployBlockedByPrivate = deployRequested && repositoryVisibility === 'private'
    let requesterIsOwner = false
    try { requesterIsOwner = Boolean(require('../../Auth').isAuthorized(userId)?.isOwner) } catch {}
    await replyProgress(deployRequested && requesterIsOwner && !deployBlockedByPrivate
        ? '🏗️ I’ll build and validate the project locally first, then push and deploy it as you asked.'
        : deployRequested && requesterIsOwner && deployBlockedByPrivate
            ? '🏗️ I’ll build and validate the project locally first, then push it to the private GitHub repository as you asked.'
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
                        directPublish = await agentOs.run({ action: 'publish', projectId: record.id, userId, private: repositoryVisibility !== 'public', deploy: !deployBlockedByPrivate, repoName: repoName || undefined, approveProduction: true, ownerAuthorized: true })
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
        record.deployment?.url && !/fail|error|suspend/i.test(record.deployment?.status || '') ? `Live site: ${record.deployment.url}` : null,
        record.deployment?.status === 'approval_required' ? 'Production deployment needs approval.' : null,
        directPublish?.success && !deployBlockedByPrivate ? '🚀 Published and deployed as you asked — no separate approval needed.' : null,
        directPublish?.success && deployBlockedByPrivate ? '📦 Pushed to the private GitHub repository as you asked. ⚠️ It was NOT deployed: BeraHost cannot clone private repositories (it has no GitHub account connected), so a private site cannot go live there. Make the repository public and tell me to deploy, and it will go live.' : null,
        directPublish && !directPublish.success ? `⚠️ You asked me to deploy it, but publishing/deployment did not finish: ${directPublish.error || 'unknown error'}` : null,
        approvalCase ? `Owner approval is pending. Reply directly to the separate approval prompt with 1 to approve or 2 to decline (case ${approvalCase.id}).` : null,
        !approvalCase && !directPublish && (repoRequested || deployRequested) && buildValidated ? 'No repository or deployment was created; project approval metadata was not recorded.' : null
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

const runProjectRevision = async (text, { userId, conn, chat, message } = {}) => {
    const agentOs = require('./agent-os')
    const { addRequesterMention } = require('../lib/group-mentions')
    const replyProgress = async content => {
        if (conn?.sendMessage && chat) {
            try {
                await conn.sendMessage(chat, addRequesterMention(message, content), message ? { quoted: message } : {})
            } catch {}
        }
    }
    const projects = userProjectsByName(userId)
    const parsed = parseProjectRevision(text, projects)
    if (!parsed) {
        const names = projects.map(p => p.name)
        await replyProgress(names.length
            ? `✏️ Which project should I change? You have: ${names.join(', ')}. Name the project and the change — e.g. "change the prices on ${names[0]}".`
            : '✏️ You have no built projects yet — ask me to build one first.')
        return { success: false, error: 'No matching project for the revision.' }
    }
    const target = parsed.project
    const deployRequested = /\b(deploy|publish|launch\s+(?:it|the\s+app|the\s+site))\b/i.test(text)
    const repoRequested = deployRequested || /\b(github|repository|repo|push\s+(?:the\s+)?(?:code|project|changes?))\b/i.test(text)
    const repositoryVisibility = repositoryVisibilityFromRequest(text)
    let requesterIsOwner = false
    try { requesterIsOwner = Boolean(require('../../Auth').isAuthorized(userId)?.isOwner) } catch {}
    await replyProgress(`✏️ Making that change to ${target.name} — editing the existing files, nothing else will be rewritten.`)
    const progressSent = new Set()
    const result = await agentOs.run({
        action: 'revise',
        projectId: target.id,
        userId,
        instruction: text,
        onProgress: async progress => {
            const milestones = {
                revision_plan: '✏️ Finding the exact spot to change...',
                validation: '🧪 Change applied; checking the project still works...'
            }
            const line = milestones[progress.phase]
            if (!line || progressSent.has(line)) return
            progressSent.add(line)
            await replyProgress(line)
        }
    })
    const record = result.record || target
    if (!result.success) {
        await replyProgress(`❌ I couldn't make that change: ${result.error || 'unknown error'}`)
        return result
    }
    const buildValidated = Boolean(record.checkpoint) && (record.checks || []).length > 0 && (record.checks || []).every(check => check.success)
    // Same approval model as builds: the owner saying "deploy it" in the
    // same message is the approval; otherwise a prompt case is created.
    const skipApproval = Boolean(deployRequested && requesterIsOwner && buildValidated)
    let approvalCase = null
    let directPublish = null
    if (record.id && buildValidated && repoRequested) {
        try {
            const support = require('./project-support')
            await support.registerProject(record, { userId, chat })
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
        } catch (error) {
            await replyProgress(`⚠️ Project memory/approval metadata could not be saved: ${error.message}`)
        }
    }
    const parts = [
        `✅ Change applied to ${record.name || record.id}.`,
        result.revision?.summary ? `Change: ${result.revision.summary}` : null,
        result.revision?.files?.length ? `Files changed: ${result.revision.files.join(', ')}` : null,
        record.checks?.length ? `Checks: ${record.checks.map(c => `${c.name} ${c.success ? 'passed' : 'failed'}`).join(', ')}` : null,
        record.github?.url ? `GitHub: ${record.github.url}` : null,
        record.deployment?.url && !/fail|error|suspend/i.test(record.deployment?.status || '') ? `Live site: ${record.deployment.url}` : null,
        directPublish?.success ? '🚀 Updated site published and deployed as you asked — no separate approval needed.' : null,
        directPublish && !directPublish.success ? `⚠️ You asked me to deploy it, but publishing/deployment did not finish: ${directPublish.error || 'unknown error'}` : null,
        approvalCase ? `Owner approval is pending to publish this change. Reply directly to the separate approval prompt with 1 to approve or 2 to decline (case ${approvalCase.id}).` : null,
        !approvalCase && !directPublish && buildValidated ? 'The change is saved and validated locally. Say "deploy it" when you want it live.' : null
    ].filter(Boolean)
    await replyProgress(parts.join('\n'))
    if (approvalCase && conn?.sendMessage && chat) {
        try {
            const prompt = [
                'Bera project approval request',
                `Case ID: ${approvalCase.id}`,
                `Project: ${record.name || record.id}`,
                `Action: ${deployRequested ? 'GitHub publication and deployment' : 'GitHub publication'} (revision)`,
                `Change: ${result.revision?.summary || text}`,
                'The change was applied and validated locally. No repository push or deployment happens unless an authorized project owner approves.',
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
    if (directPublish?.success && record.deployment?.url && conn?.sendMessage && chat) {
        try {
            const { takeScreenshot } = require('./browser')
            const shot = await takeScreenshot(record.deployment.url)
            if (shot.success && Buffer.isBuffer(shot.buffer)) {
                const caption = `*${record.name || record.id}* (updated)\nLive: ${record.deployment.url}${record.github?.url ? `\nRepo: ${record.github.url}` : ''}`
                await conn.sendMessage(chat, {
                    image: shot.buffer,
                    mimetype: shot.mimetype || 'image/png',
                    ...addRequesterMention(message, caption, {}, 'caption')
                }, message ? { quoted: message } : {})
            }
        } catch {}
    }
    return result
}

module.exports = { looksLikeProjectBuild, runProjectBuild, validationFailureDetails, repositoryVisibilityFromRequest, projectName, looksLikeProjectRevision, parseProjectRevision, runProjectRevision, userProjectsByName, explicitRepoName }
