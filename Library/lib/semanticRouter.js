// Pure JS semantic intent router — no external dependencies
// Uses Jaccard word-overlap similarity. Falls back to null when confidence is low,
// letting the regex router in Library/router.js take over.

const tokenize = (text) =>
    String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

const jaccard = (setA, setB) => {
    if (!setA.size || !setB.size) return 0
    let intersection = 0
    for (const t of setA) if (setB.has(t)) intersection++
    return intersection / (setA.size + setB.size - intersection)
}

// ── Intent definitions: each entry is an array of example phrases ─────────────
const INTENT_EXAMPLES = {
    system_info: [
        'show system info', 'server stats', 'check ram usage', 'how much memory',
        'cpu usage now', 'disk space available', 'server health check',
        'check server resources', 'how much ram is free', 'server status report',
        'what is cpu load', 'memory info', 'system resources'
    ],
    agent: [
        'create a folder', 'make a directory', 'create a project', 'build an app',
        'write a file', 'create files', 'scaffold an api', 'automate this task',
        'run this bash command', 'execute shell command', 'run the following steps',
        'create folder structure', 'mkdir workspace', 'create project structure',
        'write code and save', 'create and save file', 'save to directory',
        'build a rest api', 'create express server', 'create react app',
        'make subdirectories', 'create nested folders', 'build project'
    ],
    music: [
        'play a song', 'send me music', 'download song', 'find audio track',
        'get mp3', 'play music by', 'search for song', 'music from artist',
        'download the song', 'send audio', 'play track', 'get beat'
    ],
    image_gen: [
        'generate an image', 'create a picture', 'draw something', 'make an image',
        'paint a portrait', 'render a scene', 'produce artwork', 'generate art',
        'create logo', 'design image', 'draw a dragon', 'make illustration'
    ],
    code_review: [
        'review my code', 'check this code', 'audit the code', 'look at my code',
        'code feedback', 'code quality check', 'review this function', 'check code issues'
    ],
    bug_finder: [
        'find bugs', 'detect errors', 'what is wrong with this code', 'debug this',
        'check for bugs', 'identify issues', 'find problems in code', 'bug scan'
    ],
    code_explain: [
        'explain this code', 'what does this do', 'describe this file',
        'explain function', 'how does this work', 'explain the script'
    ],
    translate: [
        'translate to english', 'translate this text', 'translate in french',
        'translate into spanish', 'translate to swahili', 'translate to arabic',
        'say this in german', 'translate this sentence'
    ],
    weather: [
        'weather in nairobi', 'what is the weather', 'todays forecast',
        'temperature in london', 'weather today', 'will it rain', 'current weather'
    ],
    lyrics: [
        'lyrics of the song', 'show me lyrics', 'get song lyrics',
        'what are the words', 'find lyrics for', 'song words'
    ],
    web_search: [
        'search the web', 'google this', 'look up online', 'search for info',
        'find information about', 'search internet for', 'what is on the web'
    ],
    workspace_cmd: [
        'show my workspace', 'list workspace files', 'ls workspace',
        'what is in my workspace', 'workspace contents', 'show my files',
        'list my files', 'my workspace', 'check workspace',
        'what files do i have', 'show files in workspace'
    ],
    http_request: [
        'make an api call', 'send http request', 'post to api', 'get request to url',
        'call this endpoint', 'fetch from api', 'curl this url', 'send post request'
    ],
    shell_cmd: [
        'run bash command', 'execute shell', 'run terminal command',
        'run this command', 'execute this script', 'run in terminal',
        'bash command', 'shell script'
    ],
    project_create: [
        'create express app', 'build node project', 'scaffold react app',
        'create flask server', 'build api server', 'new nodejs project',
        'create web server', 'start a project', 'new express project'
    ],
    pm2_list: [
        'list pm2 processes', 'show pm2 apps', 'what is running in pm2',
        'pm2 status', 'show running processes', 'pm2 list', 'check pm2'
    ],
    git_clone: [
        'clone this repo', 'clone github repository', 'git clone',
        'download repository', 'clone from github', 'clone the project'
    ],
    docker: [
        'list docker containers', 'docker ps', 'docker status',
        'show containers', 'container logs', 'docker stats', 'manage containers'
    ],
    list_tools: [
        'what tools do you have', 'show your tools', 'list your tools',
        'what can you do', 'list capabilities', 'show capabilities',
        'what are your tools', 'available tools', 'show all tools',
        'what commands do you have', 'what tools are available',
        'list your commands', 'show me your tools', 'your capabilities',
        'what features do you have', 'what are you capable of'
    ]
}

// Pre-tokenize all examples as Sets for fast comparison
const INTENT_SETS = {}
for (const [intent, examples] of Object.entries(INTENT_EXAMPLES)) {
    INTENT_SETS[intent] = examples.map(ex => new Set(tokenize(ex)))
}

// ── Route a user message to an intent ──────────────────────────────────────────
// Returns { intent, score } or null if confidence is below threshold
const semanticRoute = (text, threshold = 0.28) => {
    if (!text || text.length < 3) return null
    const inputSet = new Set(tokenize(text))
    let bestIntent = null, bestScore = 0

    for (const [intent, exSets] of Object.entries(INTENT_SETS)) {
        for (const exSet of exSets) {
            const score = jaccard(inputSet, exSet)
            if (score > bestScore) {
                bestScore = score
                bestIntent = intent
            }
        }
    }

    if (bestScore < threshold) return null
    return { intent: bestIntent, score: bestScore }
}

// ── Get all intents with scores (for debugging) ───────────────────────────────
const rankIntents = (text) => {
    const inputSet = new Set(tokenize(text))
    const scores = {}
    for (const [intent, exSets] of Object.entries(INTENT_SETS)) {
        scores[intent] = Math.max(...exSets.map(ex => jaccard(inputSet, ex)))
    }
    return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5)
}

module.exports = { semanticRoute, rankIntents }
