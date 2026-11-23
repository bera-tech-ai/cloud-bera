const assert = require('node:assert/strict')
const { _sanitizeIdentity, cleanAnswer } = require('../Library/lib/bera')

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

console.log('bera identity tests passed')
