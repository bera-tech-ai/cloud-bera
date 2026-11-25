'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { validationFailureDetails, repositoryVisibilityFromRequest, projectName } = require('../Library/actions/project-build')

test('project-build extracts the named project without trailing deployment instructions', () => {
    const request = 'Build a personal portfolio called “Zakayo’s Portfolio.” Include projects and contact details, then deploy it.'
    assert.equal(projectName(request), 'zakayo-s-portfolio')
})

test('project-build honors explicit public/private repository visibility and defaults to public', () => {
    assert.equal(repositoryVisibilityFromRequest('Create a public GitHub repo called demo'), 'public')
    assert.equal(repositoryVisibilityFromRequest('Create a repo and make it public'), 'public')
    assert.equal(repositoryVisibilityFromRequest('Create a private repository called demo'), 'private')
    assert.equal(repositoryVisibilityFromRequest('Create a GitHub repo called demo'), 'public')
    assert.equal(repositoryVisibilityFromRequest('Do not make the repo public'), 'private')
})

test('project-build failure formatter includes failed validation details', () => {
    const details = validationFailureDetails({
        validation: {
            checks: [{
                name: 'project-entrypoint',
                success: false,
                output: '\u001b[31mNo runnable application entrypoint found at the project root.\u001b[0m\nAdd a root index.html.'
            }]
        }
    })
    assert.equal(details, 'project-entrypoint: No runnable application entrypoint found at the project root. Add a root index.html.')
})

test('project-build failure formatter falls back to record checks', () => {
    const details = validationFailureDetails({}, {
        checks: [{ name: 'build', success: false, error: 'Missing output directory' }]
    })
    assert.equal(details, 'build: Missing output directory')
})
