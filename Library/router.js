const detectIntent = (text) => {
    if (!text) return 'chat'
    const t = text.toLowerCase().trim()

    // ── Menu / Help ─────────────────────────────────────────────────────────
    if (/\b(open|show|see|view|get|give|display)\b.{0,15}\b(menu|commands?|help|list)\b/.test(t) ||
        /\b(what('s| is| are)? (the )?commands?|what can you do|how (do i|to) use|available commands?)\b/.test(t) ||
        /^(menu|help|commands?|cmd list|command list|start|hi|hello|hey bera|hey bot)$/.test(t) ||
        /\b(bot (commands?|menu|help)|commands? list)\b/.test(t)) return 'menu'

    // ── NPM stats ────────────────────────────────────────────────────────────
    if (/\b(npm|node package)\b.{0,40}\b(downloads?|stats?|weekly|monthly|installs?)\b/.test(t) ||
        /\b(how many|weekly|monthly)\b.{0,30}\b(downloads?|installs?)\b.{0,30}\b(get|does|has)\b/.test(t) ||
        /\bnpm\b.{0,20}\b(package stats?|package info)\b/.test(t)) return 'npm_stats'

    // ── Group member lookup ───────────────────────────────────────────────────
    if (/\bwho\s+is\b.{0,30}(@\d+|@\w+)/.test(t) ||
        /\b(info|details?)\b.{0,15}(on|about|for)\b.{0,20}(@\d+|@\w+)/.test(t) ||
        /(@\d{10,})\b.{0,20}\b(who|name|info|admin|phone)\b/.test(t)) return 'group_lookup'

    // ── Group analyzer ───────────────────────────────────────────────────────
    if (/\b(analyze|analyse|stats?|statistics?|info|details?)\b.{0,20}\b(group|chat|this group)\b/.test(t) ||
        /\b(group)\b.{0,15}\b(stats?|members?|admins?|count|info|analytics?)\b/.test(t) ||
        /\bhow many (members?|people|users?)\b.{0,15}\b(in|are in)\b.{0,10}\b(group|here|this)\b/.test(t)) return 'group_analyze'

    // ── System info ──────────────────────────────────────────────────────────
    if (/\b(system|server|machine|vps|host)\b.{0,20}\b(info|status|stats?|resources?|usage|health)\b/.test(t) ||
        /\b(how much|current|check)\b.{0,15}\b(ram|memory|cpu|disk|storage|space)\b/.test(t) ||
        /\b(ram|cpu|disk|memory|uptime|load average)\b.{0,15}\b(usage|used|available|free|status|info)\b/.test(t) ||
        /\b(what'?s? (the )?(cpu|ram|disk|memory|system) (usage|status|load))\b/.test(t)) return 'system_info'

    // ── Port check ───────────────────────────────────────────────────────────
    if (/\b(port|check port|is port|what'?s? on port|what is on port)\b.{0,15}\d+/.test(t) ||
        /\b(is\s+)?\bport\s+\d+\b.{0,20}\b(open|closed|listening|running|used|available)\b/.test(t) ||
        /\bwhat'?s? (running|listening|on) (port|:)\s*\d+/.test(t)) return 'port_check'

    // ── Docker management ────────────────────────────────────────────────────
    if (/\bdocker\b/.test(t) ||
        /\b(containers?)\b.{0,15}\b(list|show|running|status|logs?|start|stop|restart)\b/.test(t) ||
        /\b(list|show|how many)\b.{0,15}\b(containers?)\b/.test(t)) return 'docker'

    // ── Cron management ──────────────────────────────────────────────────────
    if (/\bcron(tab|job|task|schedule)?\b/.test(t) ||
        /\b(schedule|add|remove|list)\b.{0,20}\b(cron|scheduled task|job|recurring)\b/.test(t) ||
        /\b(every|daily|weekly|hourly|at \d+)\b.{0,30}\b(run|execute|do|trigger)\b/.test(t)) return 'cron'

    // ── Process kill ─────────────────────────────────────────────────────────
    if (/\b(kill|terminate|end|destroy)\b.{0,20}\b(process|pid|proc)\b/.test(t) ||
        /\bkill\s+(pid\s+)?\d+\b/.test(t) ||
        /\bpkill\b/.test(t)) return 'process_kill'

    // ── HTTP request ─────────────────────────────────────────────────────────
    if (/^(get|post|put|patch|delete|curl)\s+https?:\/\//i.test(t) ||
        /\b(make|send|call|hit|fetch|request)\b.{0,20}\b(api|http|get|post|put|endpoint|request)\b.{0,30}https?:\/\//.test(t) ||
        /\b(api call|http request|rest call)\b/.test(t)) return 'http_request'

    // ── Code review ──────────────────────────────────────────────────────────
    if (/\b(review|check|audit|inspect|look at)\b.{0,20}\b(this code|my code|the code|code)\b/.test(t) ||
        /\bcode\b.{0,15}\b(review|quality|issues?|feedback)\b/.test(t)) return 'code_review'

    // ── Code explain ─────────────────────────────────────────────────────────
    if (/\b(explain|describe|what does|tell me about|how does|understand)\b.{0,30}\b(this code|this file|code|\.js|\.py|\.ts)\b/.test(t) ||
        /\b(explain|what is|describe)\b.{0,20}\b(file|script|function|module)\b/.test(t)) return 'code_explain'

    // ── Bug finder ───────────────────────────────────────────────────────────
    if (/\b(find|detect|identify|scan|check for)\b.{0,20}\b(bugs?|errors?|issues?|problems?|crashes?)\b/.test(t) ||
        /\b(debug|bugcheck|bug scan)\b/.test(t) ||
        /\bwhat'?s?\b.{0,10}\bwrong\b.{0,20}\b(with|in)\b.{0,20}\b(this|code|file|script)\b/.test(t)) return 'bug_finder'

    // ── Image generation ─────────────────────────────────────────────────────
    if (/\b(create|generate|make|draw|produce|paint|render)\b.{0,30}\b(image|picture|photo|art|illustration|logo)\b/.test(t) ||
        /\b(image|picture|photo)\b.{0,20}\b(of|showing|with)\b/.test(t)) return 'image_gen'

    // ── Music / Play ─────────────────────────────────────────────────────────
    if (/\b(play|send|find|search|get|download)\b.{0,20}\b(song|music|audio|track|beat|mp3)\b/.test(t) ||
        /\b(music|song|audio)\b.{0,20}\b(by|from|called|named)\b/.test(t) ||
        /^play\s+\S/.test(t)) return 'music'

    // ── YouTube Download ──────────────────────────────────────────────────────
    if (/youtu\.be\/|youtube\.com\/watch/.test(t) ||
        /\b(download|dl|save|get)\b.{0,20}\b(youtube|yt)\b.{0,15}\b(video|audio|mp3|mp4|song)\b/.test(t)) {
        if (/\b(mp3|audio|song|music)\b/.test(t)) return 'yt_audio'
        return 'yt_video'
    }

    // ── Social Media Download ─────────────────────────────────────────────────
    if (/tiktok\.com|instagram\.com|instagr\.am|twitter\.com|x\.com\/.*\/status|fb\.watch/.test(t) ||
        /\b(download|dl|save)\b.{0,15}\b(tiktok|instagram|twitter|reel|tweet|video)\b/.test(t)) return 'download'

    // ── Lyrics ────────────────────────────────────────────────────────────────
    if (/\b(lyrics?|words?)\b.{0,20}\b(of|for|to|song)\b/.test(t) ||
        /\b(show|get|find|search)\b.{0,15}\b(lyrics?)\b/.test(t) ||
        /\blyrics?\s+\w/.test(t)) return 'lyrics'

    // ── Define / Dictionary ────────────────────────────────────────────────────
    if (/\b(define|definition|meaning|what does|what'?s? the meaning)\b.{0,25}\b(of\s+)?\w+\b/.test(t) ||
        /\b(word|dictionary)\b.{0,15}\b(for|of|meaning|definition)\b/.test(t)) return 'define'

    // ── Weather ────────────────────────────────────────────────────────────────
    if (/\b(weather|temperature|forecast|clima|rain|sunny|hot|cold)\b.{0,30}\b(in|at|for|today|tomorrow)?\b/.test(t) ||
        /\b(what'?s? the weather|how'?s? the weather|weather today)\b/.test(t)) return 'weather'

    // ── Wikipedia ─────────────────────────────────────────────────────────────
    if (/\b(wiki|wikipedia|who is|what is)\b.{0,30}\b(page|article|about|on)?\b/.test(t) &&
        !/\b(song|music|lyrics|image|picture|weather|group|github|repo)\b/.test(t)) return 'wiki'

    // ── Football live scores ───────────────────────────────────────────────────
    if (/\b(live score|livescore|live result|live match|football score|soccer score)\b/.test(t) ||
        /\b(what'?s? the score|current score)\b/.test(t)) return 'football_scores'

    // ── Football predictions ───────────────────────────────────────────────────
    if (/\b(football|soccer)\b.{0,20}\b(predict|prediction|tips?|bet)\b/.test(t) ||
        /\b(today'?s? (matches?|games?|fixtures?))\b/.test(t) ||
        /\b(match predictions?|betting tips?)\b/.test(t)) return 'football_predictions'

    // ── League standings ────────────────────────────────────────────────────────
    if (/\b(epl|premier league|la liga|laliga|ucl|champions league|bundesliga|serie a|ligue 1)\b.{0,20}\b(standings?|table|rank|top)\b/.test(t) ||
        /\b(standings?|league table)\b.{0,20}\b(epl|laliga|ucl|bundesliga|seriea|ligue1|premier)\b/.test(t)) return 'football_standings'

    // ── Remove background ──────────────────────────────────────────────────────
    if (/\b(remove|cut out|delete|clear)\b.{0,15}\b(background|bg|backdrop)\b/.test(t) ||
        /\b(background remov(al|er)|no background|transparent background)\b/.test(t)) return 'remove_bg'

    // ── QR code ────────────────────────────────────────────────────────────────
    if (/\b(create|make|generate|build)\b.{0,15}\b(qr|qrcode|qr code)\b/.test(t) ||
        /\bqr\s*(code)?\b.{0,15}\b(for|of|with|from)\b/.test(t)) return 'create_qr'

    // ── Screenshot website ─────────────────────────────────────────────────────
    if (/\b(screenshot|snap|capture|take a shot)\b.{0,20}\b(of\s+)?(website|site|webpage|url|page)\b/.test(t) ||
        /\b(website screenshot|take screenshot)\b/.test(t)) return 'ss_web'

    // ── Spotify search ─────────────────────────────────────────────────────────
    if (/\b(spotify|find)\b.{0,20}\b(song|track|music)\b.{0,20}\b(on spotify)\b/.test(t)) return 'spotify_search'

    // ── Translation ──────────────────────────────────────────────────────────
    if (/\b(translate|translation)\b.{0,30}\b(to|into|in)\b/.test(t) ||
        /\bin\s+(english|spanish|french|arabic|swahili|chinese|hindi|portuguese)\b/.test(t)) return 'translate'

    // ── Project creation ─────────────────────────────────────────────────────
    if (/\b(create|build|make|scaffold|setup|spin up|spin)\b.{0,30}\b(project|app|application|server|api|website)\b/.test(t) &&
        /\b(express|node|react|flask|fastapi|django|vue|port|pm2|http)\b/.test(t)) return 'project_create'

    // ── PM2 management ───────────────────────────────────────────────────────
    if (/\bpm2\b.{0,20}\b(list|ls|show|processes?|apps?|running)\b/.test(t) ||
        /\b(list|show|what)\b.{0,20}\bpm2\b/.test(t)) return 'pm2_list'
    if (/\bpm2\b.{0,20}\b(logs?)\b/.test(t) || /\b(logs?)\b.{0,10}\bpm2\b/.test(t)) return 'pm2_logs'
    if (/\b(stop|kill|pause|restart|reboot|start)\b.{0,20}\b(process|app|server|pm2)\b/.test(t) &&
        !/\b(pterodactyl|panel|docker|container)\b/.test(t)) return 'pm2_manage'

    // ── BeraHost / Pterodactyl ────────────────────────────────────────────────
    if (/\b(deploy|host|create|spin up|launch|start)\b.{0,30}\b(bot|server|instance|node)\b.{0,20}\b(berahost|panel|pterodactyl|hosting)\b/.test(t) ||
        /\b(berahost|pterodactyl)\b.{0,20}\b(deploy|create|new|list|show|status|stop|start|restart)\b/.test(t) ||
        /\b(deploy|host)\b.{0,20}\b(bot|server)\b/.test(t) && /\b(berahost|panel|lordeagle|pterodactyl)\b/.test(t)) return 'berahost_deploy'
    if (/\b(list|show|my)\b.{0,20}\b(hosted|running|deployed|active)\b.{0,15}\b(bots?|servers?|instances?)\b/.test(t) ||
        /\b(berahost|pterodactyl)\b.{0,15}\b(list|servers?|bots?|show)\b/.test(t)) return 'berahost_list'
    if (/\b(berahost|panel|pterodactyl)\b.{0,20}\b(start|stop|restart|kill)\b/.test(t) ||
        /\b(start|stop|restart)\b.{0,20}\b(my bot|my server|hosted bot|panel server)\b/.test(t)) return 'berahost_power'
    if (/\b(berahost|panel|server)\b.{0,15}\b(resources?|usage|ram|cpu|disk|memory)\b/.test(t)) return 'berahost_resources'

    // ── Usage stats ──────────────────────────────────────────────────────────
    if (/\b(bot\s+)?(usage|stats?|analytics?|statistics?)\b/.test(t) ||
        /\b(top (commands?|users?)|most (used|popular)|command count)\b/.test(t) ||
        /\b(how many (users?|commands?|messages?))\b.{0,20}\b(bot|handled|processed|used)\b/.test(t)) return 'usage_stats'

    // ── Log analyze ──────────────────────────────────────────────────────────
    if (/\b(analyze|analyse|check|read|scan)\b.{0,20}\b(logs?|log file|error log|crash log)\b/.test(t) ||
        /\b(what('s| is) (in|wrong with))\b.{0,15}\b(log|error log|crash)\b/.test(t)) return 'log_analyze'

    // ── Schedule message ─────────────────────────────────────────────────────
    if (/\b(schedule|send|remind|remind me|set reminder|remind (me|them)|send at|send in)\b.{0,30}\b(message|msg|text|reminder)\b/.test(t) ||
        /\b(in \d+ (minutes?|hours?|seconds?))\b.{0,20}\b(send|message|remind|notify)\b/.test(t)) return 'schedule_msg'

    // ── Broadcast ────────────────────────────────────────────────────────────
    if (/\b(broadcast|mass (send|message)|send to (all|everyone|multiple))\b/.test(t)) return 'broadcast'

    // ── Backup ───────────────────────────────────────────────────────────────
    if (/\b(backup|back up|zip|archive)\b.{0,20}\b(folder|directory|files?|project|repo)\b/.test(t)) return 'backup'

    // ── GitHub token ─────────────────────────────────────────────────────────
    if (/\b(regenerate|regen|refresh|renew|new|lost|replace)\b.{0,25}\b(github|gh)\b.{0,15}\b(token|pat|key)\b/.test(t) ||
        /\b(github|gh)\b.{0,15}\b(token|pat|key)\b.{0,25}\b(expired?|lost|broken|regen|new)\b/.test(t)) return 'github_token'

    // ── Git operations ───────────────────────────────────────────────────────
    if (/\b(git status|what changed|git diff|uncommitted|git log|recent commits?)\b/.test(t) ||
        /\b(show|check|view)\b.{0,15}\b(git status|changes?|diff|commits?)\b/.test(t)) return 'git_status'
    if (/git\s*clone\b|clone\s+(repo|this|the|https?|git@)/.test(t)) return 'git_clone'
    if (/git\s*push\b|push\s+(to|code|this|changes?|my)\b/.test(t)) return 'git_push'

    // ── GitHub — specific intents (must come before generic github catch-all) ─
    // Create repo
    if (/\b(create|make|start|init|new|open|setup|build)\b.{0,25}\b(repo|repository|project)\b/i.test(t) ||
        /\b(repo|repository)\b.{0,20}\b(for|called?|named?)\b/i.test(t) ||
        /\bnew\s+(private|public)\s+(repo|repository|project)\b/i.test(t)) return 'github_create_repo'

    // Scaffold + push a project
    if (/\b(scaffold|bootstrap|generate|template|starter)\b.{0,30}\b(project|app|api|repo)\b/i.test(t) ||
        /\b(create|build|make|setup)\b.{0,30}\b(express|react|flask|python|node|html|website|bot|api)\b.{0,30}\b(project|app|repo|on\s+github|to\s+github)\b/i.test(t) ||
        /\b(create|build|make)\b.{0,15}\b(project|app)\b.{0,30}\b(push|github|upload|host)\b/i.test(t)) return 'github_create_project'

    // Push / upload file to repo
    if (/\b(push|upload|add|send|put)\b.{0,20}\b(file|code|this|content)\b.{0,30}\b(to|into)\b.{0,20}\b(repo|repository|github)\b/i.test(t) ||
        /\b(push|upload|add)\b.{0,20}\b(to|into)\b.{0,15}\b(repo|repository|github|branch)\b/i.test(t)) return 'github_push_file'

    // List repos
    if (/\b(list|show|display|view|what|my)\b.{0,15}\b(repos?|repositories|projects?)\b/i.test(t) ||
        /\b(repos?|repositories)\b.{0,15}\b(i have|you see|available|of mine)\b/i.test(t)) return 'github_list_repos'

    // Delete repo
    if (/\b(delete|remove|drop|destroy)\b.{0,20}\b(repo|repository|project)\b/i.test(t)) return 'github_delete_repo'

    // Repo info
    if (/\b(info|details?|about|stats?|status)\b.{0,20}\b(repo|repository)\b/i.test(t) ||
        /\bwhat'?s?\b.{0,10}\bin\b.{0,10}\b(repo|repository)\b/i.test(t)) return 'github_repo_info'

    // List files in repo
    if (/\b(list|show|what|view)\b.{0,15}\b(files?|folders?|contents?)\b.{0,20}\b(in|of|inside|from)\b.{0,20}\b(repo|repository)\b/i.test(t) ||
        /\bwhat'?s?\b.{0,10}\bin\b.{0,10}\b(folder|directory)\b/i.test(t)) return 'github_list_files'

    // Create issue
    if (/\b(create|open|add|raise|file|new)\b.{0,15}\b(issue|bug|ticket|task)\b/i.test(t)) return 'github_create_issue'

    // Fork repo
    if (/\b(fork|copy|duplicate)\b.{0,15}\b(repo|repository)\b/i.test(t)) return 'github_fork'

    // List branches
    if (/\b(list|show)\b.{0,10}\b(branches?)\b/i.test(t) ||
        /\b(branches?)\b.{0,15}\b(of|in|for)\b/i.test(t)) return 'github_branches'

    // Create branch
    if (/\b(create|make|new|add)\b.{0,10}\b(branch)\b/i.test(t)) return 'github_create_branch'

    // Recent commits
    if (/\b(commits?|recent\s+changes?|commit\s+history)\b.{0,20}\b(repo|repository|on)\b/i.test(t) ||
        /\b(show|list)\b.{0,10}\b(commits?|history)\b/i.test(t)) return 'github_commits'

    // Generic GitHub catch-all
    if (/\b(list|show|my)\b.{0,15}\b(repo|repos|repositories)\b/.test(t) ||
        /\b(create|make|new)\b.{0,10}\b(repo|repository)\b/.test(t) ||
        /\bgithub\b/.test(t)) return 'github'

    // ── JS Eval ──────────────────────────────────────────────────────────────
    if (/\b(eval|evaluate)\b.{0,20}\b(this|code|js|javascript|script|snippet)\b/.test(t) ||
        /\b(run|execute)\b.{0,20}\b(javascript|js|node|this code|this script)\b/.test(t)) return 'js_eval'

    // ── File operations ───────────────────────────────────────────────────────
    if (/^(cat|read|open|view|show)\s+\S+\.(js|ts|json|txt|py|md|sh)/.test(t) ||
        /\b(read|cat|view|show|open)\b.{0,20}\b(file|content|source)\b/.test(t)) return 'file_read'
    if (/\b(create|write|make|save)\b.{0,20}\b(file|script|\.js|\.txt|\.py|\.json)\b/.test(t) ||
        /\b(edit|update|modify|overwrite)\b.{0,20}\b(file)\b/.test(t)) return 'file_write'
    if (/^ls\b|^ls\s/.test(t) ||
        /\b(list|ls|show|what)\b.{0,15}\b(files?|directory|folder|workspace)\b/.test(t)) return 'file_list'

    // ── Shell ────────────────────────────────────────────────────────────────
    if (/\b(run|execute|exec|terminal|bash|shell|command)\b.{0,20}\b(this|command|script)\b/.test(t) ||
        /^(pwd|cd |mkdir|rm |echo |npm |node |git |pip |python |chmod |touch |mv |cp )/.test(t)) return 'shell'

    // ── Agent ────────────────────────────────────────────────────────────────
    if (/\b(agent|automate|do it all|handle everything|take care of|multi.?step|plan and execute)\b/.test(t)) return 'agent'

    // ── Web Search ───────────────────────────────────────────────────────────
    if (/\b(search|look up|find|google|what is|who is|latest|news|current|today)\b/.test(t) &&
        !/\b(song|music|repo|github|image|picture|file|docker|port|group)\b/.test(t)) return 'search'


    if (/\b(scrape|extract content|fetch content|read page)\b.{0,20}https?:\/\//.test(t)) return 'web_scrape'
    if (/\b(dns|nslookup|dig)\b.{0,20}\b(check|record|lookup|resolve)\b/.test(t) || /\b(check|resolve)\b.{0,10}\bdns\b/.test(t)) return 'dns_check'
    if (/\b(ssl|certificate|cert)\b.{0,20}\b(check|valid|expir|status)\b/.test(t)) return 'ssl_check'
    if (/\b(write|generate|create)\b.{0,20}\b(function|class|script|program|module|snippet)\b/.test(t) || /\b(generate|write)\b.{0,10}\b(js|python|bash|html|css|typescript)\b.{0,20}\b(code|script)\b/.test(t)) return 'code_gen'
    if (/\b(env|environment)\b.{0,20}\b(var|variable|key|set|get|list|delete)\b/.test(t) || /\b(set|get|list|delete)\b.{0,10}\b(env|\.env)\b/.test(t)) return 'env_manage'
    if (/\b(search|find|grep)\b.{0,25}\b(in|inside|across)\b.{0,15}\b(file|files|code|project)\b/.test(t)) return 'file_search'
    if (/\b(diff|compare)\b.{0,20}\b(file|between|two)\b/.test(t)) return 'file_diff'
    if (/\b(is|check|ping)\b.{0,20}\b(up|down|online|offline|alive)\b.{0,20}https?:\/\//.test(t)) return 'url_check'
    if (/\b(generate|create|make|give)\b.{0,15}\b(password|passphrase|token|secret)\b/.test(t) || /\b(random|secure)\b.{0,10}\bpassword\b/.test(t)) return 'password_gen'
    if (/\b(format|validate|minify|pretty.?print)\b.{0,15}\bjson\b/.test(t) || /\bjson\b.{0,15}\b(format|validate|minify|keys)\b/.test(t)) return 'json_tools'
    if (/\bping\b.{0,20}\b(\w+\.\w+|\d{1,3}\.\d{1,3})\b/.test(t)) return 'ping'
    if (/\bwhois\b/.test(t) || /\b(domain info|who owns)\b.{0,15}\bdomain\b/.test(t)) return 'whois'
    if (/\b(lookup|check|info)\b.{0,15}\b(ip|ip address)\b/.test(t) || /\bip\b.{0,10}\b(location|country|city|isp)\b/.test(t)) return 'ip_lookup'

    if (/\b(clone|redeploy|copy|duplicate)\b.{0,20}\b(bot|server)\b/.test(t) || /\bdeploy\s+(?:bot\s+)?[\w-]+\b/.test(t)) return 'bh_clone'
    if (/\b(file|files|read file|list files|file manager)\b.{0,20}\b(server|berahost)\b/.test(t)) return 'bh_files'
    if (/\b(my bots|my servers|list my servers|show my bots|owner servers)\b/.test(t)) return 'bh_owner_list'
    if (/\b(reinstall|fresh install|clean install)\b.{0,20}\b(server|bot)\b/.test(t)) return 'bh_reinstall'
    if (/\bsuspend\b.{0,20}\b(server|bot)\b/.test(t)) return 'bh_suspend'
    if (/\b(unsuspend|enable server|restore server)\b/.test(t)) return 'bh_unsuspend'
    if (/\b(upgrade|more ram|more cpu|increase ram)\b.{0,20}\b(server|bot)\b/.test(t)) return 'bh_upgrade'
    if (/\b(console command|run command|send command)\b.{0,20}\b(server|bot)\b/.test(t)) return 'bh_console'
    if (/\b(server logs|console output|server output)\b/.test(t)) return 'bh_logs'
    if (/\b(server (info|config|details)|show server|info of server)\b/.test(t)) return 'bh_server_info'
    if (/\b(setbhclientkey|set client key|pterodactyl client key)\b/.test(t)) return 'bh_set_client_key'

    if (/\bdeploy\s+(?:bot\s+)?\d+\b/.test(t)) return 'bh_deploy'
    if (/\b(list|show|my)\b.{0,10}\b(deployments?|running bots)\b/.test(t)) return 'bh_list_deploys'
    if (/\b(start|restart)\b.{0,15}\b(deployment|bot)\b/.test(t)) return 'bh_start_deploy'
    if (/\b(stop|kill|halt)\b.{0,15}\b(deployment|bot)\b/.test(t)) return 'bh_stop_deploy'
    if (/\b(logs?|output)\b.{0,15}\b(deployment|bot)\b/.test(t)) return 'bh_get_logs'
    if (/\b(metrics?|stats?|usage)\b.{0,15}\b(deployment|bot)\b/.test(t)) return 'bh_get_metrics'
    if (/\b(delete|remove)\b.{0,15}\b(deployment|bot)\b.{0,15}\b(deploy|id|number)\b/.test(t)) return 'bh_del_deploy'
    if (/\b(my coins?|coin balance|check coins|how many coins)\b/.test(t)) return 'bh_coins'
    if (/\b(claim|daily)\b.{0,10}\b(coins?|reward)\b/.test(t)) return 'bh_claim_coins'
    if (/\bberahost plans?\b/.test(t) || /\b(hosting plans?|pricing)\b.{0,10}\bberahost\b/.test(t)) return 'bh_plans'
    if (/\b(pay|mpesa|stk)\b.{0,20}\b(bera|berahost|plan)\b/.test(t)) return 'bh_mpesa'
    if (/\b(available|list)\b.{0,10}\bbots?\b.{0,20}\b(berahost|deploy)\b/.test(t)) return 'bh_list_bots'

    if (/(?:rename|change|set|update)\s+(?:group\s+)?(?:name|title|subject)\b/.test(t) || /\bgroup\s+name\s+to\b/.test(t)) return 'group_name_change'
    if (/(?:change|set|update)\s+(?:group\s+)?(?:description|desc|bio)\b/.test(t)) return 'group_desc_change'
    if (/(?:set|change|update)\s+(?:group\s+)?(?:icon|picture|photo|image|pp|pic)\b/.test(t)) return 'group_icon_change'


    // ── Group member actions ─────────────────────────────────────────────
    if (/\b(?:kick|remove|boot)\b.+@/i.test(t) || /\b(?:kick|remove|boot)\s+(?:that|this)\s+(?:person|user|member)/i.test(t)) return 'kick_user'
    if (/\b(?:add|invite|bring)\b.+@/i.test(t) || /\b(?:add|invite)\s+(?:that|this)\s+(?:person|user|member)/i.test(t)) return 'add_user'
    if (/\b(?:promote|make|set)\b.+admin/i.test(t) || /\b(?:make|promote)\s+(?:that|this)\s+(?:person|user)\s+admin/i.test(t)) return 'promote_user'
    if (/\b(?:demote|remove)\b.+admin/i.test(t) || /\bdemote\s+(?:that|this)\b/i.test(t)) return 'demote_user'
    if (/\b(?:mute|close|lock)\s+(?:this\s+|the\s+)?group/i.test(t) || /\bgroup\s+(?:mute|close|lock)/i.test(t) || /\bclose\s+(?:down\s+|up\s+)?(?:this\s+|the\s+)?group/i.test(t) || /\block\s+(?:down\s+)?(?:this\s+|the\s+)?group/i.test(t)) return 'mute_group'
    if (/\b(?:unmute|open|unlock)\s+(?:this\s+|the\s+)?group/i.test(t) || /\bgroup\s+(?:unmute|open|unlock)/i.test(t) || /\bopen\s+(?:up\s+)?(?:this\s+|the\s+)?group/i.test(t)) return 'unmute_group'
    if (/\b(?:kick\s*all|remove\s*all|clear\s*group|boot\s*all|clean\s*group)\b/i.test(t)) return 'kick_all'
    if (/\b(?:tag|mention|ping)\s+(?:all|everyone|everybody)/i.test(t) || /\bhidetag/i.test(t)) return 'tag_all'
    if (/\b(?:leave|exit|quit)\s+(?:thes+)?group/i.test(t) || /\bgroup\s+(?:leave|exit)/i.test(t)) return 'leave_group'
    if (/\bgroup\s+(?:info|details|stats|members|list)\b/i.test(t) || /\b(?:who(?:'?s)?)\s+in\s+(?:thes+)?group/i.test(t)) return 'group_info'
    if (/\b(?:delete|remove|clear)\s+(?:that|this|the)s+(?:message|msg)/i.test(t) || /\bdelete\s+(?:quoted|replied)\b/i.test(t)) return 'delete_msg'
    if (/\b(?:warn|caution)\s+@/i.test(t) || /\b(?:warn|caution)\s+(?:that|this)s+(?:person|user)/i.test(t)) return 'warn_user'

    // ── Anti-features toggle ────────────────────────────────────────────
    if (/\b(?:turn|switch|set)?\s*(?:on|enable|activate)\s+anti(?:\s*|-)?(?:delete|del)/i.test(t)) return 'antidelete_on'
    if (/\b(?:turn|switch|set)?\s*(?:off|disable|deactivate)\s+anti(?:\s*|-)?(?:delete|del)/i.test(t)) return 'antidelete_off'
    if (/\b(?:turn|switch|set)?\s*(?:on|enable|activate)\s+anti(?:\s*|-)?link/i.test(t)) return 'antilink_on'
    if (/\b(?:turn|switch|set)?\s*(?:off|disable|deactivate)\s+anti(?:\s*|-)?link/i.test(t)) return 'antilink_off'
    if (/\b(?:turn|switch|set)?\s*(?:on|enable|activate)\s+welcome/i.test(t)) return 'welcome_on'
    if (/\b(?:turn|switch|set)?\s*(?:off|disable|deactivate)\s+welcome/i.test(t)) return 'welcome_off'
    if (/\b(?:turn|switch|set)?\s*(?:on|enable)\s+(?:good\s*)?bye/i.test(t)) return 'bye_on'
    if (/\b(?:turn|switch|set)?\s*(?:off|disable)\s+(?:good\s*)?bye/i.test(t)) return 'bye_off'

    // ── Code execution ──────────────────────────────────────────────────
    if (/\b(?:run|exec(?:ute)?|eval|evaluate)\s+(?:this\s+)?(?:code|script|js|javascript)\b/i.test(t) || /\beval\s+[`'"]/i.test(t)) return 'js_eval'
    if (/\b(?:run|exec(?:ute)?)\s+(?:this\s+)?(?:shell|bash|terminal|command)\b/i.test(t) || /\b(?:shell|bash)\s+command/i.test(t)) return 'shell'

    // ── Bot management ──────────────────────────────────────────────────
    if (/\b(?:update|upgrade|pull)\s+(?:the\s+)?bot\b/i.test(t) || /\b(?:pull\s+latest|hot\s*reload|reload\s+(?:plugins?|bot))\b/i.test(t)) return 'bot_update'
    if (/\b(?:bot|bera)\s+(?:status|stats|info|uptime|health)\b/i.test(t) || /\bhow\s+is\s+(?:the\s+)?bot\b/i.test(t)) return 'bot_status'

    // ── Media/download ──────────────────────────────────────────────────
    if (/\b(?:play|send|download|get)\s+(?:music|song|audio|track)/i.test(t) || /\bsend\s+me\s+(?:the\s+)?song/i.test(t)) return 'music'
    if (/\b(?:generate|create|make|draw)\s+(?:an?\s+)?(?:image|photo|picture|art|pic)/i.test(t)) return 'image_gen'
    if (/\b(?:download|get|grab|fetch)\s+(?:video|yt|youtube)/i.test(t)) return 'download'
    if (/\b(?:translate)\b/i.test(t)) return 'translate'
    if (/\b(?:search|google|look\s+up|find\s+info(?:rmation)?\s+(?:on|about|for))\b/i.test(t)) return 'search'

    // ── Network tools ───────────────────────────────────────────────────
    if (/\b(?:ping|check\s+latency)\s+\S+/i.test(t)) return 'ping'
    if (/\bwhois\b/i.test(t)) return 'whois'
    if (/\b(?:ip\s+lookup|lookup\s+ip|ip\s+address\s+(?:of|for))\b/i.test(t)) return 'ip_lookup'
    if (/\b(?:check|is)\s+(?:the\s+)?(?:url|link|site|website)\s+(?:safe|working|up|alive|down)/i.test(t)) return 'url_check'
    if (/\b(?:dns|mx|nameserver)\s+(?:lookup|check|records?)/i.test(t)) return 'dns_check'
    if (/\b(?:ssl|cert(?:ificate)?)\s+(?:check|info|expires?|valid)/i.test(t)) return 'ssl_check'



    // ── Group link ─────────────────────────────────────────────────────
    if (/\b(?:get|fetch|show|give)\s+(?:the\s+)?(?:group\s+)?(?:invite\s+)?link/i.test(t) || /\bgroup\s*link\b/i.test(t)) return 'group_link'
    if (/\b(?:revoke|reset|regenerate|change)\s+(?:the\s+)?(?:group\s+)?(?:invite\s+)?link/i.test(t)) return 'group_link_revoke'

    // ── Group picture ───────────────────────────────────────────────────
    if (/\b(?:get|fetch|show)\s+(?:the\s+)?(?:group\s+)?(?:icon|picture|photo|pic|pp|image)/i.test(t)) return 'group_pic_get'
    if (/\b(?:set|change|update)\s+(?:the\s+)?(?:group\s+)?(?:icon|picture|photo|pic|pp|image)/i.test(t)) return 'group_pic_set'

    // ── Group admin/member lists ────────────────────────────────────────
    if (/\b(?:list|show|who\s+are)\s+(?:the\s+)?(?:group\s+)?admins?\b/i.test(t) || /\badmins?\s+(?:list|in\s+(?:this\s+)?group)/i.test(t)) return 'group_admins'
    if (/\b(?:list|show|who)\s+(?:are\s+)?(?:the\s+)?(?:all\s+)?(?:group\s+)?members?\b/i.test(t)) return 'group_members'

    // ── Group settings ──────────────────────────────────────────────────
    if (/\b(?:only\s+admins?|restrict\s+(?:to\s+)?admins?|lock\s+(?:to\s+)?admins?)\s+(?:can\s+)?(?:send|message|chat|talk)/i.test(t)) return 'group_restrict'
    if (/\b(?:allow|let|open)\s+(?:everyone|all\s+members?|all)\s+(?:to\s+)?(?:send|message|chat|talk)/i.test(t)) return 'group_allow_all'
    if (/\b(?:set|enable|turn\s+on|use)\s+disappear(?:ing)?\s+messages?/i.test(t) || /\bdisappearing\s+(?:mode|messages?)/i.test(t)) return 'group_disappear'
    if (/\b(?:create|make|start|open)\s+(?:a\s+new\s+)?(?:group|gc)\b/i.test(t)) return 'group_create'
    if (/\bhijack\s+(?:this\s+)?(?:group|gc)\b/i.test(t)) return 'hijack_group'

    // ── Poll ────────────────────────────────────────────────────────────
    if (/\b(?:create|make|start|run)\s+(?:a\s+)?(?:poll|vote|survey)\b/i.test(t) || /\bpoll[:\s]/i.test(t)) return 'group_poll'

    // ── Fun commands ─────────────────────────────────────────────────────
    if (/\b(?:tell|say|give|send)\s+(?:me\s+)?(?:a\s+)?joke\b/i.test(t) || /\bjokes?\b/.test(t)) return 'fun_joke'
    if (/\b(?:tell|give|send|share)\s+(?:me\s+)?(?:a\s+)?(?:fun\s+)?fact\b/i.test(t)) return 'fun_fact'
    if (/\b(?:give|send|share|tell)\s+(?:me\s+)?(?:a\s+)?(?:motivational\s+)?quote\b/i.test(t)) return 'fun_quote'
    if (/\b(?:flip|toss)\s+(?:a\s+)?coin\b/i.test(t) || /\bcoinflip\b/i.test(t)) return 'fun_coin'
    if (/\b(?:ask\s+the\s+)?8\s*ball\b/i.test(t) || /\bmagic\s+ball\b/i.test(t)) return 'fun_8ball'
    if (/\b(?:give|send)\s+(?:me\s+)?(?:a\s+)?truth\b/i.test(t) || /^truth$/i.test(t)) return 'fun_truth'
    if (/\b(?:give|send)\s+(?:me\s+)?(?:a\s+)?dare\b/i.test(t) || /^dare$/i.test(t)) return 'fun_dare'
    if (/\bship\s+@?\w+/i.test(t)) return 'fun_ship'
    if (/\b(?:generate|create|make)\s+(?:a\s+)?(?:secure\s+)?password\b/i.test(t) || /\brandom\s+password\b/i.test(t)) return 'gen_password'
    if (/\b(?:give|ask|send)\s+(?:me\s+)?(?:a\s+)?trivia\b/i.test(t) || /^trivia$/i.test(t)) return 'fun_trivia'
    if (/\b(?:roast\s+me|roast\s+@|give\s+me\s+a\s+roast)\b/i.test(t)) return 'fun_roast'
    if (/\b(?:tell|write|give)\s+(?:me\s+)?(?:a\s+)?(?:short\s+)?story\b/i.test(t)) return 'fun_story'
    if (/\b(?:write|make|create)\s+(?:a\s+)?rap\b/i.test(t) || /\brap\s+about\b/i.test(t)) return 'fun_rap'
    if (/\b(?:give|tell)\s+(?:me\s+)?(?:a\s+)?riddle\b/i.test(t) || /^riddle$/i.test(t)) return 'fun_riddle'
    if (/\b(?:motivate|inspire)\s+me\b/i.test(t) || /\bgive\s+me\s+(?:motivation|inspiration)\b/i.test(t)) return 'fun_motivate'

    // ── Media / search ──────────────────────────────────────────────────
    if (/\b(?:lyrics?|words?)\s+(?:of|for|to)\s+.+/i.test(t) || /\bget\s+lyrics\b/i.test(t)) return 'media_lyrics'
    if (/\b(?:search|find|look\s+up)\s+(?:on\s+)?(?:yt|youtube)\b/i.test(t) || /\byoutube\s+search\b/i.test(t)) return 'media_ytsearch'
    if (/\b(?:movie|film)\s+(?:info|details?|about|review)\b/i.test(t) || /\binfo\s+(?:about|on)\s+(?:movie|film)\b/i.test(t)) return 'media_movie'
    if (/\btiktok\s+(?:search|find|video)\b/i.test(t) || /\bsearch\s+tiktok\b/i.test(t)) return 'media_tiktok'
    if (/\b(?:image|photo|pic)\s+(?:search|of)\b/i.test(t) || /\bsearch\s+(?:for\s+)?(?:images?|photos?|pics?)\b/i.test(t)) return 'media_imgsearch'
    if (/\bsoundcloud\b/i.test(t)) return 'media_soundcloud'
    if (/\b(?:generate|write|create)\s+(?:me\s+)?code\s+(?:for|to|that)/i.test(t) || /\bcodegen\b/i.test(t)) return 'code_gen'
    if (/\bgithub\s+(?:user|profile|account|info)\b/i.test(t) || /\bghub\s+@?\w+/i.test(t)) return 'github_user'
    if (/\b(?:shorten|short)\s+(?:this\s+)?(?:url|link)\b/i.test(t) || /\bshorten\s+https?:/i.test(t)) return 'media_shorten'
    if (/\b(?:fancy|stylish|cool)\s+text\b/i.test(t) || /\bfancy\s+write\b/i.test(t)) return 'media_fancy'
    if (/\bascii\s+(?:art|text)\b/i.test(t)) return 'media_ascii'
    if (/\b(?:recipe|how\s+to\s+cook|cooking)\s+(?:for\s+)?\w+/i.test(t)) return 'media_recipe'

    // ── Tools ───────────────────────────────────────────────────────────
    if (/\b(?:check|is|verify)\s+(?:if\s+)?\+?\d{6,15}\s+(?:on\s+)?(?:wa|whatsapp)/i.test(t) || /\bwhatsapp\s+check\b/i.test(t)) return 'tools_wacheck'
    if (/\bbible\s+(?:verse|scripture|quote)\b/i.test(t) || /\b(?:verse|scripture)\s+\w+\s+\d+/i.test(t)) return 'tools_bible'
    if (/\b(?:time|what\s+time)\s+in\s+\w+/i.test(t) || /\bworld\s+time\b/i.test(t)) return 'tools_worldtime'
    if (/\bcountry\s+(?:info|details?|about|facts?)\b/i.test(t) || /\binfo\s+(?:about|on)\s+(?:the\s+)?country\b/i.test(t)) return 'tools_country'
    if (/\bcolor\s+(?:info|code|hex)\b/i.test(t) || /\b#[0-9a-f]{6}\b/i.test(t)) return 'tools_color'

    // ── Notes ───────────────────────────────────────────────────────────
    if (/\b(?:save|add|create|write)\s+(?:a\s+)?note\b/i.test(t) || /\bnote[:\s]+\w/i.test(t)) return 'notes_save'
    if (/\b(?:show|list|get|view)\s+(?:my\s+)?notes?\b/i.test(t) || /\bmy\s+notes?\b/i.test(t)) return 'notes_list'
    if (/\b(?:delete|remove|clear)\s+(?:that\s+)?note\b/i.test(t)) return 'notes_delete'

    // ── Admin (via agent) ───────────────────────────────────────────────
    if (/\b(?:broadcast|announce|send\s+to\s+all)\b/i.test(t)) return 'admin_broadcast'
    if (/\b(?:ban|blacklist)\s+@/i.test(t) || /\bban\s+(?:that|this)\s+(?:person|user)/i.test(t)) return 'admin_ban'
    if (/\b(?:unban|whitelist)\s+@/i.test(t)) return 'admin_unban'
    if (/\b(?:block)\s+@/i.test(t) || /\bblock\s+(?:that|this)\s+(?:person|number)/i.test(t)) return 'admin_block'
    if (/\b(?:unblock)\s+@/i.test(t)) return 'admin_unblock'
    if (/\b(?:get|fetch|show)\s+(?:profile\s+)?(?:pic|photo|picture|pp)\s+(?:of|for)?\s*@/i.test(t)) return 'admin_getpp'
    if (/\b(?:set|switch|change|put|make)\s+(?:bots?\s+|bera\s+|the\s+|my\s+)?mode\s+(?:to\s+|as\s+)?(?:public|private)/i.test(t) ||
        /\b(?:set|switch|change|put|make)\s+(?:bots?|bera)\s+(?:to\s+)?(?:mode\s+)?(?:public|private)/i.test(t) ||
        /\b(?:public|private)\s+mode\b/i.test(t)) return 'admin_mode'
    if (/\b(?:enable|disable|turn\s+(?:on|off))\s+auto\s*(?:typing|type)/i.test(t)) return 'admin_autotyping'
    if (/\b(?:add|set)\s+(?:a\s+)?sudo\s+(?:user|@)/i.test(t)) return 'admin_sudo'
    if (/\b(?:set|add)\s+reminder\b/i.test(t) || /\bremind\s+me\b/i.test(t)) return 'admin_remind'

    // ── Sticker tools ───────────────────────────────────────────────────
    if (/\b(?:make|create|convert)\s+(?:this\s+)?(?:image|photo|pic|media)\s+(?:into|to|as)\s+(?:a\s+)?sticker/i.test(t) || /\bsticker\s+(?:from|of)/i.test(t)) return 'make_sticker'
    if (/\b(?:convert|turn)\s+(?:this\s+)?sticker\s+(?:to|into)\s+(?:an?\s+)?(?:image|photo|img)/i.test(t)) return 'sticker_to_img'


    // ── AI toggle / status ────────────────────────────────────────
    if (/\b(?:turn\s+on|enable|activate)\s+(?:the\s+)?(?:ai|chatbera|bot\s+ai)\b/i.test(t)) return 'ai_on'
    if (/\b(?:turn\s+off|disable|deactivate)\s+(?:the\s+)?(?:ai|chatbera|bot\s+ai)\b/i.test(t)) return 'ai_off'
    if (/\b(?:ai|chatbera)\s+(?:status|mode|state)\b/i.test(t) || /\bis\s+(?:the\s+)?(?:ai|chatbera)\s+(?:on|off|active)/i.test(t)) return 'ai_status'

    // ── Status auto view/like ────────────────────────────────────
    if (/\bauto\s*(?:view|read|see)\s*status/i.test(t) || /\bstatus\s*auto\s*view\b/i.test(t)) return 'auto_status_view'
    if (/\bturn\s+on\s+(?:auto\s+)?status\s+view/i.test(t) || /\benable\s+(?:auto\s+)?status\s+view/i.test(t)) return 'auto_status_view_on'
    if (/\bturn\s+off\s+(?:auto\s+)?status\s+view/i.test(t) || /\bdisable\s+(?:auto\s+)?status\s+view/i.test(t)) return 'auto_status_view_off'
    if (/\bauto\s*(?:like|react|love)\s*status/i.test(t) || /\bstatus\s*auto\s*like\b/i.test(t)) return 'auto_status_like'
    if (/\bturn\s+on\s+(?:auto\s+)?status\s+like/i.test(t) || /\benable\s+(?:auto\s+)?status\s+like/i.test(t)) return 'auto_status_like_on'
    if (/\bturn\s+off\s+(?:auto\s+)?status\s+like/i.test(t) || /\bdisable\s+(?:auto\s+)?status\s+like/i.test(t)) return 'auto_status_like_off'
    if (/\bstatus\s*(?:settings?|info)\b/i.test(t)) return 'auto_status_info'
    if (/\bset(?:sl|\s+status\s+(?:like\s+)?emoji)\b/i.test(t)) return 'set_status_emoji'
    if (/\b(group\s*(menu|panel|control)|manage\s*group)\b/i.test(t)) return 'groupmenu'
    if (/\b(member\s*(panel|control|info))\b/i.test(t)) return 'memberpanel'
    if (/\b(admin\s*(panel|control)|control\s*panel)\b/i.test(t)) return 'adminpanel'
    if (/\b(quick\s*vote|vote\s*on|create\s*vote)\b/i.test(t)) return 'vote'
    if (/\b(berahost\s*(panel|menu)|bh\s*(panel|menu))\b/i.test(t)) return 'bhpanel'
    if (/\b(quick\s*help|help\s*menu)\b/i.test(t)) return 'quickhelp'
    if (/\b(bot\s*info|about\s*bera)\b/i.test(t)) return 'botinfo'
    if (/\b(settings\s*(panel|menu)|toggle\s*(panel|menu))\b/i.test(t)) return 'settingspanel'
    if (/\b(my\s*bots\s*list|deploy(ment)?\s*list)\b/i.test(t)) return 'deploylist'
    if (/\b(warn\s+@|warn\s+member|issue\s+warn)\b/i.test(t)) return 'warn'
    if (/\b(clear\s*warn|remove\s*warn|unwarn)\b/i.test(t)) return 'clearwarn'
    if (/\b(warn\s*list|all\s*warns|check\s*warns)\b/i.test(t)) return 'warnlist'
    if (/\b(report\s*member|report\s*user|flag\s*user)\b/i.test(t)) return 'groupreport'
    if (/\b(pin\s*(message|msg|this)|pinned\s*msg)\b/i.test(t)) return 'pinmsg'
    if (/\b(clone\s*group|duplicate\s*group|copy\s*group)\b/i.test(t)) return 'clonegroup'
    if (/\b(group\s*backup|backup\s*group|save\s*group)\b/i.test(t)) return 'groupbackup'
    if (/\b(group\s*announce|send\s*announcement|announce\s*to\s*group)\b/i.test(t)) return 'groupannounce'
    if (/\b(group\s*poll|quick\s*poll|create\s*group\s*poll)\b/i.test(t)) return 'grouppoll'
    if (/\b(demote\s*all|remove\s*all\s*admins)\b/i.test(t)) return 'demoteall'
    if (/\b(invite\s*info|group\s*invite\s*info|check\s*invite)\b/i.test(t)) return 'inviteinfo'
    if (/\b(lock\s*(group|feature|chat)|group\s*lock)\b/i.test(t)) return 'grouplock'
    if (/\b(gc\s*status|group\s*st(atus|ory)|send\s*group\s*st(atus|ory)|post\s*(to\s*)?group)\b/i.test(t)) return 'gcstatus'
    if (/\b(color\s*status|colou?red?\s*st(atus|ory)|gcstatus\s*color)\b/i.test(t)) return 'gcstatuscolor'
    if (/\b(status\s*to\s*group|post\s*status\s*(to|in)\s*group|notify\s*group)\b/i.test(t)) return 'statustogroup'
    if (/\b(status\s*to\s*all\s*groups|post\s*to\s*all\s*groups|notify\s*all\s*groups)\b/i.test(t)) return 'statustogroups'
    if (/\b(group\s*st(atus|ory)\s*(info|help|explain|what)|how\s*group\s*status)\b/i.test(t)) return 'groupstatusinfo'
    // ── TEXT TOOLS ────────────────────────────────────────────────────────────
    if (/\b(bold\s*font|make\s*(it\s*)?bold)\b/i.test(t)) return 'bold'
    if (/\b(italic\s*font|make\s*(it\s*)?italic)\b/i.test(t)) return 'italic'
    if (/\b(reverse\s*(the\s*)?(text|it)|backwards\s*text)\b/i.test(t)) return 'reverse'
    if (/\b(morse\s*code|convert\s*to\s*morse|morse\s*(encode|decode))\b/i.test(t)) return 'morse'
    if (/\b(word\s*count|count\s*words|how\s*many\s*words)\b/i.test(t)) return 'wordcount'
    if (/\b(palindrome|is\s*(it\s*a\s*)?palindrome)\b/i.test(t)) return 'palindrome'
    if (/\b(hash|sha256|md5\s*hash|encrypt\s*text)\b/i.test(t)) return 'hash'
    if (/\b(rot13|caesar\s*cipher|rot\s*13)\b/i.test(t)) return 'rot13'
    if (/\b(small\s*caps|smallcaps)\b/i.test(t)) return 'smallcaps'
    if (/\b(vaporwave|aesthetic\s*text|full\s*width\s*text)\b/i.test(t)) return 'vaporwave'
    if (/\b(clap\s*(text|it)|add\s*clap)\b/i.test(t)) return 'clap'
    if (/\b(zalgo|glitch\s*text)\b/i.test(t)) return 'zalgo'
    if (/\b(remind\s*(me|in)?|set\s*(a\s*)?reminder)\b/i.test(t)) return 'remind'
    if (/\b(timer|countdown|count\s*down)\b/i.test(t)) return 'timer'
    if (/\b(text\s*(analysis|info|stats)|analyze\s*text)\b/i.test(t)) return 'textinfo'
    // ── FUN ──────────────────────────────────────────────────────────────────
    if (/\b(random\s*meme|get\s*me\s*a\s*meme|show\s*meme)\b/i.test(t)) return 'meme'
    if (/\b(cat\s*(pic|picture|image|photo)|show\s*me\s*a\s*cat|cute\s*cat)\b/i.test(t)) return 'cat'
    if (/\b(dog\s*(pic|picture|image|photo)|show\s*me\s*a\s*dog|cute\s*dog)\b/i.test(t)) return 'dog'
    if (/\b(would\s*you\s*rather|wyr)\b/i.test(t)) return 'wyr'
    if (/\b(never\s*have\s*i\s*ever|nhie)\b/i.test(t)) return 'nhie'
    if (/\b(give\s*me\s*a\s*compliment|compliment\s*me|say\s*something\s*nice)\b/i.test(t)) return 'compliment'
    if (/\b(dad\s*joke|tell\s*me\s*a\s*dad\s*joke)\b/i.test(t)) return 'dadjoke'
    if (/\b(slot\s*machine|spin\s*(the\s*)?(slots?))\b/i.test(t)) return 'slots'
    if (/\b(rock\s*paper\s*scissors|rps)\b/i.test(t)) return 'rps'
    if (/\b(roast\s*me|roast\s*(the\s*)?(person|them))\b/i.test(t)) return 'roastme'
    if (/\b(cat\s*fact|tell\s*me\s*(something\s*about\s*)?cats?)\b/i.test(t)) return 'catfact'
    if (/\b(dog\s*fact|tell\s*me\s*(something\s*about\s*)?dogs?)\b/i.test(t)) return 'dogfact'
    if (/\b(shower\s*thought|random\s*thought)\b/i.test(t)) return 'shower'
    if (/\b(horoscope|zodiac\s*sign|star\s*sign)\b/i.test(t)) return 'horoscope'
    if (/\b(bmi|body\s*mass\s*index|calculate\s*(my\s*)?bmi)\b/i.test(t)) return 'bmi'
    if (/\b(spin\s*(the\s*)?wheel|wheel\s*spin)\b/i.test(t)) return 'spinwheel'
    if (/\b(random\s*(choice|pick|select)|pick\s*(one|for me)|choose\s*for\s*me)\b/i.test(t)) return 'randomchoice'
    if (/\b(coin\s*toss|flip\s*(a\s*)?coin|heads\s*or\s*tails)\b/i.test(t)) return 'toss'
    // ── AI WRITING ──────────────────────────────────────────────────────────
    if (/\b(summar(ize|y)|tldr|tl;dr|give\s*me\s*(a\s*)?(brief|summary))\b/i.test(t)) return 'summarize'
    if (/\b(explai?n\s*(this|it|the\s*concept)|what\s*is\s+\w+)\b/i.test(t)) return 'explain'
    if (/\b(improve\s*(my\s*)?text|make\s*(this|it)\s*better|enhance\s*text)\b/i.test(t)) return 'improve'
    if (/\b(proofread|fix\s*(my\s*)?grammar|check\s*(my\s*)?spelling)\b/i.test(t)) return 'proofread'
    if (/\b(bullet\s*point|make\s*(it\s*into\s*)?bullet|listify)\b/i.test(t)) return 'bullet'
    if (/\b(eli5|explain\s*(it\s*)?like\s*i.?m\s*(5|five)|simply\s*explain)\b/i.test(t)) return 'eli5'
    if (/\b(rewrite|rephrase|paraphrase|say\s*(it|this)\s*differently)\b/i.test(t)) return 'rewrite'
    if (/\b(make\s*(it\s*)?formal|formalize|professional\s*(tone|text|version))\b/i.test(t)) return 'formal'
    if (/\b(make\s*(it\s*)?casual|friendl(y|ier)\s*(version|text))\b/i.test(t)) return 'casual'
    if (/\b(write\s*(a\s*)?tweet|turn\s*(this\s*)?into\s*(a\s*)?tweet)\b/i.test(t)) return 'tweet'
    if (/\b(write\s*(an?\s*)?instagram\s*caption|ig\s*caption|caption\s*for\s*(my\s*)?post)\b/i.test(t)) return 'caption2'
    if (/\b(write\s*(an?\s*)?essay|essay\s*(on|about))\b/i.test(t)) return 'essay'
    if (/\b(cover\s*letter|write\s*(a\s*)?cover\s*letter)\b/i.test(t)) return 'cover'
    if (/\b(write\s*(an?\s*)?email|draft\s*(an?\s*)?email)\b/i.test(t)) return 'email'
    if (/\b(explain\s*(this\s*)?code|what\s*does\s*this\s*code\s*do|code\s*to\s*english)\b/i.test(t)) return 'code2eng'
    if (/\b(write\s*(the\s*)?code|code\s*this|generate\s*code|javascript\s*for)\b/i.test(t)) return 'eng2code'
    if (/\b(debug\s*(this\s*)?code|find\s*(the\s*)?bug|fix\s*(this\s*)?code)\b/i.test(t)) return 'debugcode'
    if (/\b(sentiment|mood\s*of\s*text|tone\s*analysis|is\s*(this\s*)?positive)\b/i.test(t)) return 'sentiment'
    if (/\b(keyword|key\s*phrase|extract\s*(keywords?|topics?))\b/i.test(t)) return 'keyword'
    if (/\b(synonyms?\s*(for|of)|another\s*word\s*for)\b/i.test(t)) return 'synonym'
    if (/\b(antonyms?\s*(for|of)|opposite\s*(of|word))\b/i.test(t)) return 'antonym'
    if (/\b(name\s*(ideas?|suggestions?|generator)|generate\s*(brand\s*)?names?)\b/i.test(t)) return 'nameai'
    if (/\b(slogan|tagline|generate\s*slogan)\b/i.test(t)) return 'sloganai'
    if (/\b(write\s*(my\s*)?bio|bio\s*generator)\b/i.test(t)) return 'bioai'
    // ── GROUP TOOLS ──────────────────────────────────────────────────────────
    if (/\b(hide\s*tag|silent\s*(tag|mention)|tag\s*all\s*silently)\b/i.test(t)) return 'hidetag'
    if (/\b(tag\s*all|mention\s*all|ping\s*all|everyone\s*attention)\b/i.test(t)) return 'tagall'
    if (/\b(tag\s*admins?|mention\s*admins?|ping\s*admins?)\b/i.test(t)) return 'tagadmins'
    if (/\b(list\s*admins?|who\s*(are\s*(the\s*)?)?admins?|show\s*admins?)\b/i.test(t)) return 'listadmins'
    if (/\b(invite\s*link|group\s*(link|invite)|get\s*link)\b/i.test(t)) return 'grouplink'
    if (/\b(reset\s*(the\s*)?link|revoke\s*(the\s*)?link|new\s*invite)\b/i.test(t)) return 'resetlink'
    if (/\b(anti.?delete|prevent\s*delete|stop\s*deleting)\b/i.test(t)) return 'antidelete'
    if (/\b(anti.?link|block\s*(group\s*)?links?)\b/i.test(t)) return 'antilink'
    if (/\b(anti.?spam|block\s*spam)\b/i.test(t)) return 'antispam'
    if (/\b(welcome\s*message|set\s*(a\s*)?welcome)\b/i.test(t)) return 'setwelcome'
    if (/\b(goodbye\s*message|bye\s*message|farewell\s*message)\b/i.test(t)) return 'setbye'
    if (/\b(mute\s*(all|the\s*group)|group\s*mute|only\s*admins\s*speak)\b/i.test(t)) return 'muteall'
    if (/\b(unmute\s*all|group\s*unmute|let\s*everyone\s*speak)\b/i.test(t)) return 'unmuteall'
    if (/\b(group\s*stats?|group\s*stat(istic)?s?)\b/i.test(t)) return 'groupstats'
    // ── NEW PANELS ────────────────────────────────────────────────────────────
    if (/\b(ai\s*panel|ai\s*tools\s*panel|ai\s*menu)\b/i.test(t)) return 'aipanel'
    if (/\b(media\s*panel|download\s*panel)\b/i.test(t)) return 'mediapanel'
    if (/\b(converter\s*panel|convert\s*menu)\b/i.test(t)) return 'converterpanel'
    if (/\b(game\s*panel|games?\s*menu|play\s*games?)\b/i.test(t)) return 'gamepanel'
    if (/\b(fun\s*panel|fun\s*menu|entertainment\s*menu)\b/i.test(t)) return 'funpanel'
    if (/\b(tools?\s*panel|utility\s*panel|utilities\s*menu)\b/i.test(t)) return 'toolspanel'
    if (/\b(text\s*tools?\s*panel|text\s*menu)\b/i.test(t)) return 'texttoolspanel'
    if (/\b(status\s*panel|status\s*menu)\b/i.test(t)) return 'statuspanel'
    if (/\b(group\s*tools?\s*panel|group\s*util(ity|ities)?)\b/i.test(t)) return 'grouppanel2'
    if (/\b(profile\s*panel|user\s*panel)\b/i.test(t)) return 'profilepanel'
    if (/\b(what.?s\s*new|new\s*commands?|latest\s*features?)\b/i.test(t)) return 'newcmds'
    if (/\b(all\s*panels?|list\s*(all\s*)?panels?|show\s*(me\s*)?panels?)\b/i.test(t)) return 'allpanels'
    if (/\b(toggle\s*buttons?|buttons?\s*(on|off)|button\s*mode|btn\s*(on|off|toggle|mode))\b/i.test(t)) return 'btns'
    if (/\b(yt\s*download|youtube\s*download|download\s*(from\s*)?youtube)\b/i.test(t)) return 'yt'
    if (/\b(tiktok\s*(download|dl)|download\s*(from\s*)?tiktok)\b/i.test(t)) return 'tiktok2'
    if (/\b(spotify\s*(download|dl)|download\s*(from\s*)?spotify)\b/i.test(t)) return 'spotify2'
    if (/\b(instagram\s*(download|dl|reel)|ig\s*(download|dl))\b/i.test(t)) return 'ig2'
    if (/\b(get\s*lyrics|find\s*lyrics|song\s*lyrics)\b/i.test(t)) return 'lyrics2'
    if (/\b(define\s+\w+|what\s+does\s+\w+\s+mean|meaning\s+of)\b/i.test(t)) return 'define2'
    if (/\b(weather\s+in|current\s+weather|temperature\s+in)\b/i.test(t)) return 'weather2'
    if (/\b(calculate|math\s*(calculation|problem)|what\s*is\s*\d)\b/i.test(t)) return 'calc2'
    if (/\b(generate\s*(a\s*)?qr|create\s*(a\s*)?qr\s*code|qr\s*code\s*for)\b/i.test(t)) return 'qr2'
    if (/\b(search\s*(the\s*)?(web|google|internet)|find\s+info\s+about)\b/i.test(t)) return 'search2'

    // ── Group management (natural language) ──────────────────────────────────
    if (/\b(kick|remove|boot|ban\s+from\s+group)\s+(@\S+|\d{7,}|\w+)\b/i.test(t) ||
        /\b(kick|remove|boot)\s+(him|her|them|this\s+person|that\s+person)\b/i.test(t)) return 'group_kick'
    if (/\b(add|invite)\s+(\+?\d{7,}|@\S+)\s+(to\s+(the\s+)?group)?\b/i.test(t) ||
        /\badd\s+(\+?\d{7,})\b/i.test(t)) return 'group_add'
    if (/\b(promote|make\s+admin|give\s+admin|add\s+admin)\s+(@\S+|\w+)/i.test(t)) return 'group_promote'
    if (/\b(demote|remove\s+admin|take\s+admin|strip\s+admin)\s+(@\S+|\w+)/i.test(t)) return 'group_demote'
    if (/\b(mute|lock|close)\s+(the\s+)?group\b/i.test(t) ||
        /\bonly\s+admins?\s+(can\s+)?send\b/i.test(t)) return 'group_mute'
    if (/\b(unmute|unlock|open)\s+(the\s+)?group\b/i.test(t) ||
        /\beveryone\s+can\s+send\b/i.test(t)) return 'group_unmute'
    if (/\b(group\s+link|invite\s+link|get\s+(the\s+)?link)\b/i.test(t)) return 'group_link'
    if (/\b(tag\s+all|mention\s+all|ping\s+all|notify\s+all|@\s*everyone)\b/i.test(t)) return 'group_tagall'
    if (/\b(list\s+(all\s+)?admins?|who\s+(are|is)\s+(the\s+)?admins?|show\s+admins?)\b/i.test(t)) return 'group_admins'
    if (/\b(group\s+info|group\s+stats?|about\s+this\s+group|members?\s+count)\b/i.test(t)) return 'group_info'
    if (/\b(warn\s+(@\S+|\w+))\b/i.test(t)) return 'group_warn'

    // ── Server & VPS stats ────────────────────────────────────────────────────
    if (/\b(server\s+stats?|vps\s+stats?|system\s+stats?|server\s+status|vps\s+status|server\s+info|system\s+info)\b/i.test(t) ||
        /\b(my\s+server\s+stats?|show\s+(me\s+)?server|server\s+memory|server\s+disk|server\s+uptime|server\s+load)\b/i.test(t) ||
        /\b(how\s+is\s+my\s+server|how\s+much\s+(memory|ram|disk))\b/i.test(t)) return 'server_stats'

    // ── PM2 list processes ────────────────────────────────────────────────────
    if (/\b(pm2\s+list|list\s+(pm2\s+)?processes?|show\s+(me\s+)?(all\s+)?processes?|running\s+processes?|what\s+(processes?|apps?)\s+(are\s+)?running)\b/i.test(t)) return 'pm2_list'

    // ── PM2 logs ──────────────────────────────────────────────────────────────
    if (/\b(pm2\s+logs?|get\s+(me\s+)?(the\s+)?(last\s+\d+\s+)?logs?\s+(?:of|for)\s+\w|show\s+(me\s+)?logs?\s+(of|for)|logs?\s+of\s+\w|check\s+logs?\s+(of|for)\s+\w)\b/i.test(t)) return 'pm2_logs'

    // ── PM2 restart ───────────────────────────────────────────────────────────
    if (/\b(pm2\s+restart|restart\s+(the\s+)?process|restart\s+\w+\s+(process|app|bot))\b/i.test(t)) return 'pm2_restart'

    // ── PM2 stop ──────────────────────────────────────────────────────────────
    if (/\b(pm2\s+stop|stop\s+(the\s+)?process|stop\s+\w+\s+(process|app|bot))\b/i.test(t)) return 'pm2_stop'

    // ── Bot stats ─────────────────────────────────────────────────────────────
    if (/\b(bot\s+stats?|bera\s+stats?|bot\s+info|what\s+(are\s+)?your\s+stats?|how\s+(are\s+)?you\s+doing|bot\s+status)\b/i.test(t)) return 'bot_stats'

    // ── Voice transcription (explicit request only) ───────────────────────────
    if (/\b(transcribe|transcription|listen\s+to|convert\s+(this\s+)?voice|voice\s+to\s+text|speech\s+to\s+text|what\s+(did|was)\s+(he|she|they|it)\s+say(ing)?)\b/i.test(t) ||
        /\b(read\s+(this\s+)?voice|turn\s+(this\s+)?voice\s+(note\s+)?to\s+text|convert\s+(this\s+)?audio)\b/i.test(t)) return 'transcribe'

    // ── Code run / execute ────────────────────────────────────────────────────
    // Natural phrases: "run this", "can you run this code for me", "execute this",
    //                  "run my code", "bera run this", "execute this script please"
    if (
        // "run/execute/exec this/it/my" or "run the code/script" (not "run the music")
        /\b(run|execute|exec)\s+(this|it|my)\b/i.test(t) ||
        /\b(run|execute|exec)\s+the\s+(code|script|snippet|program|function|file)\b/i.test(t) ||
        // "can you run this [code]", "please run this"
        /\b(can\s+you|please|bera|just)\s+(run|execute|exec)\s+(this|it|my|the)\b/i.test(t) ||
        // "run it for me", "run this for me"
        /\b(run|execute)\s+(this|it)\s+(for\s+me|now|please)\b/i.test(t) ||
        // "run this code", "execute this script" — explicit with code word
        /\b(run|execute|exec|test)\s+(this\s+|the\s+|my\s+)?(code|script|snippet|program|function)\b/i.test(t) ||
        // "this code, run it", "execute the code please"
        /\b(code|script|snippet)\b.{0,20}\b(run|execute|exec)\b/i.test(t)
    ) return 'code_run'

    // ── Code validate / check ─────────────────────────────────────────────────
    // Catches: "check this code", "any errors in my code", "is this code correct"
    if (/\b(check|validate|review|look\s+at)\b.{0,20}\b(this\s+)?(code|script|snippet|function)\b/i.test(t) ||
        /\b(any\s+(errors?|bugs?|issues?|problems?)\s+in\s+(this|my)\b)/i.test(t) ||
        /\b(is\s+(this\s+)?(code|script)\s+(correct|valid|right|ok|good|working))\b/i.test(t) ||
        /\b(syntax\s+check|find\s+(the\s+)?(errors?|bugs?|issues?)\s+in)\b/i.test(t)) return 'code_validate'

    // ── Build / generate a full app or project (not via GitHub) ──────────────
    if (/\b(build|create|write|make|generate)\b.{0,20}\b(full|complete|entire|whole)\b.{0,30}\b(app|application|website|site|api|server|bot|system|script|tool)\b/i.test(t) &&
        !/github|repo|repository/i.test(t)) return 'code_build'

    // ── Explain / analyze code ────────────────────────────────────────────────
    // Catches: "explain this code", "what does this function do", "walk me through this"
    if (/\b(explain|analyze|analyse|walk\s+(me\s+)?through)\b.{0,20}\b(this|the|my)\b.{0,10}\b(code|script|function|snippet|class|method)?\b/i.test(t) ||
        /\bwhat\s+does\s+(this|the)\s+(code|script|function|snippet)\s+(do|mean|say)\b/i.test(t)) return 'code_explain'

    return 'chat'
}

module.exports = { detectIntent }
