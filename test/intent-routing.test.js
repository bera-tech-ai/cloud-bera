'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { detectIntent } = require('../Library/router')
const { looksLikeProjectBuild, projectName } = require('../Library/actions/project-build')

const EDUTRACK = 'build a complete school management system called EduTrack. Include separate dashboards for administrators, teachers, students, and parents. Implement student registration, class management, attendance tracking, examination results, fee records, announcements, and reports. Use role-based authentication and a database. Ensure each dashboard has working functionality and deploy it.'

test('a build request ending in "deploy it" is a build, never a server clone', () => {
    assert.equal(looksLikeProjectBuild(EDUTRACK), true)
    assert.notEqual(detectIntent(EDUTRACK), 'bh_clone')
    assert.equal(projectName(EDUTRACK), 'edutrack')
})

test('genuine BeraHost clone requests still route to bh_clone', () => {
    assert.equal(detectIntent('clone server atassa for 254712345678'), 'bh_clone')
    assert.equal(detectIntent('deploy bot atassa'), 'bh_clone')
    assert.equal(detectIntent('redeploy my bot server'), 'bh_clone')
})

test('build matcher covers systems, platforms and plurals without misfiring', () => {
    assert.equal(looksLikeProjectBuild('build me a booking platform for my salon'), true)
    assert.equal(looksLikeProjectBuild('create dashboards for my shop'), true)
    assert.equal(looksLikeProjectBuild('deploy it'), false)
    assert.equal(looksLikeProjectBuild('what is the weather today'), false)
})
