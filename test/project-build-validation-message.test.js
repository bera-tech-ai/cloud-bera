'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { validationFailureDetails } = require('../Library/actions/project-build')

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
