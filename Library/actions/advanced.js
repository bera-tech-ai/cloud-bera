'use strict'
  const https_mod = require('https')
  const http_mod  = require('http')
  const { exec }  = require('child_process')
  const crypto    = require('crypto')
  const fs        = require('fs')

  let axios
  try { axios = require('axios').default || require('axios') } catch(_) {}

  const _get = (url, opts = {}) => new Promise((res, rej) => {
      const mod = url.startsWith('https') ? https_mod : http_mod
      const req = mod.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 BeraBot/3.0', ...opts.headers }, ...opts }, r => {
          const bufs = []
          r.on('data', c => bufs.push(c))
          r.on('end', () => {
              try { res(JSON.parse(Buffer.concat(bufs).toString())) } catch(_) { res(Buffer.concat(bufs).toString()) }
          })
      })
      req.on('error', rej)
      req.setTimeout(12000, () => req.destroy())
  })

  // ── Weather ────────────────────────────────────────────────────────────────────
  const weather = async (city) => {
      try {
          const d = await _get('https://wttr.in/' + encodeURIComponent(city) + '?format=j1')
          if (typeof d === 'string') return { success: false, error: 'No data for city: ' + city }
          const cur  = d.current_condition?.[0] || {}
          const area = d.nearest_area?.[0]
          const name    = area?.areaName?.[0]?.value || city
          const country = area?.country?.[0]?.value  || ''
          const icon = { Sunny:'☀️', Clear:'🌙', Cloudy:'☁️', Overcast:'☁️', Mist:'🌫️', Rain:'🌧️', Snow:'❄️', Thunderstorm:'⛈️', Fog:'🌫️', Drizzle:'🌦️', Partly:'⛅' }
          const desc = cur?.weatherDesc?.[0]?.value || ''
          const emoji = Object.entries(icon).find(([k]) => desc.includes(k))?.[1] || '🌡️'
          return {
              success: true, name, country,
              temp_c: cur.temp_C,    temp_f: cur.temp_F,
              feels: cur.FeelsLikeC, humidity: cur.humidity,
              wind: cur.windspeedKmph, desc, emoji,
              uv: cur.uvIndex,        visibility: cur.visibility,
              pressure: cur.pressure, cloud: cur.cloudcover,
              sunrise: d.weather?.[0]?.astronomy?.[0]?.sunrise,
              sunset:  d.weather?.[0]?.astronomy?.[0]?.sunset,
          }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Crypto price ───────────────────────────────────────────────────────────────
  const crypto_price = async (coin) => {
      try {
          const ids = {
              btc:'bitcoin', eth:'ethereum', bnb:'binancecoin', sol:'solana',
              xrp:'ripple', ada:'cardano', doge:'dogecoin', dot:'polkadot',
              matic:'matic-network', ltc:'litecoin', link:'chainlink',
              avax:'avalanche-2', atom:'cosmos', trx:'tron', xlm:'stellar',
              algo:'algorand', near:'near', ftm:'fantom', usdt:'tether',
              usdc:'usd-coin', shib:'shiba-inu', uni:'uniswap', aave:'aave',
          }
          const id = ids[coin.toLowerCase()] || coin.toLowerCase().replace(/\s+/g,'-')
          const d = await _get('https://api.coingecko.com/api/v3/coins/' + id + '?localization=false&tickers=false&community_data=false&developer_data=false')
          if (d.error) return { success: false, error: 'Unknown coin: ' + coin }
          const mp = d.market_data
          const chg = mp?.price_change_percentage_24h || 0
          return {
              success: true,
              name: d.name, symbol: (d.symbol || coin).toUpperCase(),
              price_usd: mp?.current_price?.usd,
              price_change_24h: chg.toFixed(2),
              market_cap: mp?.market_cap?.usd,
              volume_24h: mp?.total_volume?.usd,
              high_24h: mp?.high_24h?.usd,
              low_24h: mp?.low_24h?.usd,
              rank: d.market_cap_rank,
              trend: chg >= 0 ? '📈' : '📉',
          }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Currency conversion ────────────────────────────────────────────────────────
  const currency = async (amount, from, to) => {
      try {
          const d = await _get('https://api.exchangerate-api.com/v4/latest/' + from.toUpperCase())
          if (typeof d === 'string') throw new Error('Bad response')
          const rate = d.rates?.[to.toUpperCase()]
          if (!rate) return { success: false, error: 'Unknown currency: ' + to }
          const result = (parseFloat(amount) * rate).toFixed(4)
          return { success: true, from: from.toUpperCase(), to: to.toUpperCase(), amount, rate: rate.toFixed(6), result }
      } catch(e) {
          // Fallback
          try {
              const d2 = await _get('https://open.er-api.com/v6/latest/' + from.toUpperCase())
              const r2 = d2.rates?.[to.toUpperCase()]
              if (!r2) return { success: false, error: 'Currency not found' }
              return { success: true, from: from.toUpperCase(), to: to.toUpperCase(), amount, rate: r2.toFixed(6), result: (parseFloat(amount)*r2).toFixed(4) }
          } catch(_) { return { success: false, error: e.message } }
      }
  }

  // ── News ───────────────────────────────────────────────────────────────────────
  const news = async (topic) => {
      try {
          const d = await _get('https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fnews.google.com%2Frss%2Fsearch%3Fq%3D' + encodeURIComponent(topic) + '%26hl%3Den%26gl%3DUS%26ceid%3DUS%3Aen&api_key=public')
          if (!d.items?.length) throw new Error('No items')
          return {
              success: true,
              articles: d.items.slice(0, 6).map(a => ({
                  title:   a.title?.replace(/<[^>]+>/g,'').replace(/\s+-.*$/,'').trim(),
                  source:  a.author || a.source || 'News',
                  url:     a.link,
                  pubDate: a.pubDate?.slice(0,10) || '',
              }))
          }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Movie info ─────────────────────────────────────────────────────────────────
  const movie_info = async (title) => {
      try {
          const d = await _get('https://www.omdbapi.com/?t=' + encodeURIComponent(title) + '&apikey=trilogy')
          if (d.Response === 'False') {
              const d2 = await _get('https://www.omdbapi.com/?s=' + encodeURIComponent(title) + '&apikey=trilogy')
              if (d2.Search?.length) {
                  const d3 = await _get('https://www.omdbapi.com/?i=' + d2.Search[0].imdbID + '&apikey=trilogy')
                  if (d3.Response !== 'False') return { success: true, ...d3 }
              }
              return { success: false, error: 'Movie not found: ' + title }
          }
          return { success: true, ...d }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── IP info ────────────────────────────────────────────────────────────────────
  const ip_info = async (ip) => {
      try {
          const d = await _get('http://ip-api.com/json/' + ip + '?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting')
          if (d.status !== 'success') return { success: false, error: 'IP lookup failed for: ' + ip }
          return { success: true, ...d }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Speedtest ──────────────────────────────────────────────────────────────────
  const speedtest = () => new Promise(resolve => {
      exec('curl -s -w "Download: %{speed_download} bytes/s\nUpload info: use speedtest-cli\n" https://speed.hetzner.de/100MB.bin -o /dev/null 2>&1', { timeout: 30000 }, (err, stdout) => {
          if (!err && stdout) {
              const down = stdout.match(/Download: ([\d.]+)/)?.[1]
              if (down) {
                  const mbps = (parseFloat(down) / 1048576 * 8).toFixed(2)
                  return resolve({ success: true, output: 'Download: ~' + mbps + ' Mbps (Hetzner test)' })
              }
          }
          exec('python3 -c "import urllib.request, time; start=time.time(); urllib.request.urlretrieve(\"https://speed.hetzner.de/10MB.bin\",\"/dev/null\"); elapsed=time.time()-start; print(f\"Download: {round(10/elapsed*8,2)} Mbps\")" 2>&1', { timeout: 20000 }, (e2, o2) => {
              if (!e2 && o2?.includes('Mbps')) resolve({ success: true, output: o2.trim() })
              else resolve({ success: false, error: 'Speedtest unavailable — try: agent run speedtest-cli' })
          })
      })
  })

  // ── Encode ─────────────────────────────────────────────────────────────────────
  const encode = (text, type) => {
      try {
          const MORSE = {A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.',}
          switch(type.toLowerCase()) {
              case 'base64': return { success: true, result: Buffer.from(text).toString('base64') }
              case 'hex':    return { success: true, result: Buffer.from(text).toString('hex') }
              case 'binary': return { success: true, result: text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ') }
              case 'url':    return { success: true, result: encodeURIComponent(text) }
              case 'morse':  return { success: true, result: text.toUpperCase().split('').map(c => MORSE[c]||(c===' '?'/':'?')).join(' ') }
              case 'reverse':return { success: true, result: text.split('').reverse().join('') }
              case 'rot13':  return { success: true, result: text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() <= 'm' ? 13 : -13))) }
              default: return { success: false, error: 'Types: base64, hex, binary, url, morse, reverse, rot13' }
          }
      } catch(e) { return { success: false, error: e.message } }
  }
  const decode = (text, type) => {
      try {
          switch(type.toLowerCase()) {
              case 'base64': return { success: true, result: Buffer.from(text, 'base64').toString('utf8') }
              case 'hex':    return { success: true, result: Buffer.from(text, 'hex').toString('utf8') }
              case 'binary': return { success: true, result: text.split(' ').map(b => String.fromCharCode(parseInt(b,2))).join('') }
              case 'url':    return { success: true, result: decodeURIComponent(text) }
              default: return { success: false, error: 'Types: base64, hex, binary, url' }
          }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Hash ───────────────────────────────────────────────────────────────────────
  const hash = (text, algo) => {
      try {
          const a = algo.toLowerCase().replace(/[^a-z0-9]/g,'')
          const map = { md5:'md5', sha1:'sha1', sha256:'sha256', sha512:'sha512', sha3256:'sha3-256' }
          const realAlgo = map[a] || a
          const result = crypto.createHash(realAlgo).update(text).digest('hex')
          return { success: true, algo: realAlgo, result }
      } catch(e) { return { success: false, error: 'Algos: md5, sha1, sha256, sha512' } }
  }

  // ── TTS via Google Translate (free, no key) ────────────────────────────────────
  const tts = async (text, lang = 'en') => {
      try {
          const safe = text.replace(/['"\\]/g, '').slice(0, 200)
          const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=' + lang + '&client=tw-ob&q=' + encodeURIComponent(safe)
          const tmpFile = '/tmp/bera_tts_' + Date.now() + '.mp3'
          await new Promise((res, rej) => {
              const file = require('fs').createWriteStream(tmpFile)
              https_mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
                  r.pipe(file)
                  file.on('finish', () => { file.close(); res() })
              }).on('error', rej)
          })
          const stat = require('fs').statSync(tmpFile)
          if (stat.size < 1000) return { success: false, error: 'TTS returned empty audio' }
          return { success: true, file: tmpFile }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Joke (no-key API) ─────────────────────────────────────────────────────────
  const get_joke = async () => {
      try {
          const d = await _get('https://official-joke-api.appspot.com/random_joke')
          if (d.setup) return { success: true, setup: d.setup, punchline: d.punchline }
          throw new Error('bad')
      } catch(_) {
          const jokes = [
              { setup:'Why do programmers hate nature?', punchline:"It has too many bugs!" },
              { setup:'Why do Java developers wear glasses?', punchline:"They can't C#!" },
              { setup:"Why did the developer go broke?", punchline:"They used up all their cache!" },
              { setup:'What do you call a sleeping dinosaur?', punchline:"A dino-snore!" },
              { setup:'Why don't scientists trust atoms?', punchline:"Because they make up everything!" },
              { setup:'What do you call a fish without eyes?', punchline:"A fsh!" },
              { setup:'Why did the scarecrow win an award?', punchline:"Because he was outstanding in his field!" },
          ]
          const j = jokes[Math.floor(Math.random()*jokes.length)]
          return { success: true, ...j }
      }
  }

  // ── Trivia ─────────────────────────────────────────────────────────────────────
  const get_trivia = async () => {
      try {
          const d = await _get('https://opentdb.com/api.php?amount=1&type=multiple')
          const q = d.results?.[0]
          if (!q) throw new Error('No trivia')
          const fix = s => s.replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          const all = [...q.incorrect_answers.map(fix), fix(q.correct_answer)].sort(() => Math.random()-0.5)
          const letters = ['A','B','C','D']
          const correctIdx = all.indexOf(fix(q.correct_answer))
          return {
              success: true,
              question: fix(q.question),
              options: all.map((o,i) => letters[i] + '. ' + o),
              correct: letters[correctIdx] + '. ' + fix(q.correct_answer),
              category: q.category, difficulty: q.difficulty
          }
      } catch(e) { return { success: false, error: e.message } }
  }

  // ── Truth or Dare ──────────────────────────────────────────────────────────────
  const TRUTHS = [
      "What's the most embarrassing thing you've ever done in public?",
      "Have you ever lied to get out of trouble? Tell us what happened.",
      "What's the most childish thing you still do regularly?",
      "What's the biggest lie you've ever told someone close to you?",
      "What's the most illegal thing you've ever done (be honest)?",
      "Who in this group do you trust the least and why?",
      "What's the most embarrassing thing you've searched on Google?",
      "Have you ever pretended to be sick to avoid something? What was it?",
      "What's something you've done that you've never told anyone about?",
      "What's the most cringeworthy thing you've ever said to your crush?",
      "What habit do you have that you'd be embarrassed if people knew?",
      "If you had to delete one person from your contacts, who would it be?",
  ]
  const DARES = [
      "Send a voice note making different animal sounds for 10 seconds.",
      "Change your WhatsApp profile picture to something embarrassing for 1 hour.",
      "Share your actual last 3 Google searches in the group.",
      "Write a love poem about the person above you and post it here.",
      "Send a voice note of you singing the chorus of any popular song.",
      "Send the most recent photo from your camera roll right now.",
      "Text your crush 'Hey stranger 😏' right now and show proof.",
      "Do a 30-second voice note speaking only in a different accent.",
      "Post your most embarrassing selfie in this group.",
      "Call someone from your contact list, say 'I miss you' and hang up immediately.",
  ]
  const truth = () => ({ success: true, type: 'truth', text: TRUTHS[Math.floor(Math.random()*TRUTHS.length)] })
  const dare  = () => ({ success: true, type: 'dare',  text: DARES[Math.floor(Math.random()*DARES.length)] })

  // ── Word of the day ────────────────────────────────────────────────────────────
  const word_of_day = async () => {
      const fallback = [
          { word:'Ephemeral',    def:'Lasting for only a very short time; transitory.' },
          { word:'Serendipity',  def:'Happy accidents — finding good things without looking for them.' },
          { word:'Mellifluous',  def:'Sweet or musical; pleasant to hear.' },
          { word:'Tenacious',    def:'Holding firm to a purpose; not giving up easily.' },
          { word:'Eloquent',     def:'Fluent and persuasive in speaking or writing.' },
          { word:'Perspicacious',def:'Having a ready insight; shrewd and discerning.' },
          { word:'Ubiquitous',   def:'Present, appearing, or found everywhere.' },
      ]
      const w = fallback[Math.floor(Math.random()*fallback.length)]
      return { success: true, word: w.word, definitions: [w.def] }
  }

  // ── Horoscope ──────────────────────────────────────────────────────────────────
  const horoscope = async (sign) => {
      try {
          const d = await _get('https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=' + encodeURIComponent(sign.toLowerCase()) + '&day=today')
          if (d.success && d.data?.horoscope_data) return { success: true, sign: d.data.zodiac_name || sign, text: d.data.horoscope_data, date: d.data.date }
          throw new Error('bad response')
      } catch(e) {
          const msgs = [
              'Today brings unexpected opportunities. Stay alert and embrace change.',
              'Patience is your greatest strength today. Take time to reflect before acting.',
              'Energy is high — channel it into something creative and meaningful.',
              'A conversation today could change your perspective entirely. Stay open.',
          ]
          return { success: true, sign, text: msgs[Math.floor(Math.random()*msgs.length)], date: new Date().toDateString() }
      }
  }

  // ── Riddle ─────────────────────────────────────────────────────────────────────
  const RIDDLES = [
      { q:'I speak without a mouth and hear without ears. I have nobody, but I come alive with wind. What am I?', a:'An echo' },
      { q:"The more you take, the more you leave behind. What am I?", a:'Footsteps' },
      { q:"I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. I have roads, but no cars drive there. What am I?", a:'A map' },
      { q:"What has hands but can't clap?", a:'A clock' },
      { q:"I'm tall when I'm young, short when I'm old. What am I?", a:'A candle' },
      { q:"What gets wetter the more it dries?", a:'A towel' },
      { q:"What can you break without touching it?", a:'A promise' },
      { q:"I have keys but no locks. I have space but no room. You can enter but can't go inside. What am I?", a:'A keyboard' },
  ]
  const get_riddle = () => {
      const r = RIDDLES[Math.floor(Math.random()*RIDDLES.length)]
      return { success: true, question: r.q, answer: r.a }
  }

  // ── Random motivational quote ───────────────────────────────────────────────────
  const get_quote = async () => {
      try {
          const d = await _get('https://api.quotable.io/random')
          if (d.content) return { success: true, quote: d.content, author: d.author }
          throw new Error('bad')
      } catch(_) {
          const q = [
              { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
              { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
              { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
              { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
          ]
          return { success: true, ...q[Math.floor(Math.random()*q.length)] }
      }
  }

  // ── Group activity analysis ────────────────────────────────────────────────────
  const analyze_group = (messages) => {
      if (!messages || !messages.length) return { success: false, error: 'No messages to analyze' }
      const counts = {}
      messages.forEach(msg => {
          const sender = msg.key?.participant || msg.key?.remoteJid || 'unknown'
          counts[sender] = (counts[sender] || 0) + 1
      })
      const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1])
      return {
          success: true,
          total: messages.length,
          unique_senders: sorted.length,
          top: sorted.slice(0, 5),
          least_active: sorted.slice(-3),
      }
  }

  module.exports = {
      weather, crypto_price, currency, news, movie_info, ip_info,
      speedtest, encode, decode, hash, tts,
      get_joke, get_trivia, truth, dare, word_of_day, horoscope,
      get_riddle, get_quote, analyze_group
  }
  