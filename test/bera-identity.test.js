const assert = require('node:assert/strict')
const { _sanitizeIdentity, cleanAnswer, PERSONALITY, SHORT_PERSONA } = require('../Library/lib/bera')

for (const prompt of [PERSONALITY, SHORT_PERSONA]) {
    assert.match(prompt, /Bera Tech/)
    assert.match(prompt, /Bruce Bera/)
    assert.match(prompt, /254116763755/)
    assert.match(prompt, /beratech00@gmail\.com/)
    assert.match(prompt, /github\.com\/bera-tech-ai/)
    assert.match(prompt, /Never (?:identify|say).*developer/i)
}

const reportedResponse = `@jared_anthony_higgins I'm **Bera AI** — your intelligent WhatsApp assistant developed by **Gifted Tech** (also known as Maurice or his team).

My developer's technical reach includes:
- **GitHub**: [bera-tech-ai](https://github.com/bera-tech-ai)
- **Deployment Platforms**: SkyHost, BeraHost, Vercel, Railway`

const sanitized = _sanitizeIdentity(reportedResponse)
assert.doesNotMatch(sanitized, /Gifted\s*Tech|\bMaurice\b/i)
assert.match(sanitized, /Bera Tech/i)
assert.match(sanitized, /Bruce Bera/i)
assert.match(sanitized, /254116763755/)
assert.match(sanitized, /beratech00@gmail\.com/)
assert.match(sanitized, /github\.com\/bera-tech-ai/)

const cleaned = cleanAnswer('I am ChatGPT, developed by Gifted Tech and Maurice.')
assert.match(_sanitizeIdentity(cleaned), /Bera AI|Bera Tech/i)
assert.doesNotMatch(_sanitizeIdentity(cleaned), /Gifted\s*Tech|\bMaurice\b/i)

// Phase 3 (§1): one version (3.0.0) and no provider names in either prompt.
for (const prompt of [PERSONALITY, SHORT_PERSONA]) {
    assert.doesNotMatch(prompt, /Groq/i)
    assert.doesNotMatch(prompt, /DeepSeek/i)
    assert.doesNotMatch(prompt, /powered by/i)
    assert.match(prompt, /Bera AI v3\.0\.0/)
}

console.log('bera identity tests passed')
