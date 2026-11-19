'use strict'

const xcasper = require('./xcasper')

const unavailable = feature => ({ success: false, error: `${feature} is disabled because no verified Xcasper endpoint is available.` })
const unsupported = feature => async () => unavailable(feature)
const textResult = async result => result?.success ? result.text : null

const gtChat = async (q, systemPrompt = '') => textResult(await xcasper.chat([
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: String(q || '') }
]))
const gtVision = async (imageUrl, prompt) => xcasper.vision(imageUrl, prompt)
const gtYtSearch = async query => xcasper.youtubeSearch(query)
const gtYtMp3 = async url => xcasper.youtubeAudio(url)
const gtYtMp4 = async url => xcasper.youtubeVideo(url)
const gtTikTok = async url => xcasper.tiktok(url)
const gtInstagram = async url => xcasper.instagram(url)
const gtCreateQr = async text => xcasper.qr(text)
const gtScreenshot = async url => xcasper.screenshot(url)
const gtTikTokSearch = async query => xcasper.tiktokSearch(query)
const gtTranslate = async (text, to = 'en', from = 'auto') => textResult(await xcasper.chat([{ role: 'user', content: `Translate from ${from} to ${to}. Return only the translation.\n\n${text}` }]))

const gt = unsupported('Legacy Gifted API')
const free = unsupported('Unverified free provider')
const gtImage = unsupported('Image generation')
const gtWeather = unsupported('Weather')
const gtLyrics = unsupported('Lyrics')
const gtWiki = unsupported('Wikipedia')
const gtGoogle = unsupported('Web search')
const gtDictionary = unsupported('Dictionary')
const gtBible = unsupported('Bible lookup')
const gtWallpaper = unsupported('Wallpaper search')
const gtNews = unsupported('News')
const gtShazam = unsupported('Audio identification')
const gtSpotifySearch = unsupported('Spotify search')
const gtTwitter = unsupported('Twitter/X download')
const gtFacebook = unsupported('Facebook download')
const gtSpotifyDl = unsupported('Spotify download')
const gtRemoveBg = unsupported('Background removal')
const gtReadQr = unsupported('QR reading')
const gtOcr = unsupported('OCR')
const gtUpscale = unsupported('Image upscaling')
const gtTranscript = unsupported('Transcription')
const gtWhois = unsupported('WHOIS')
const gtLiveScore = unsupported('Live scores')
const gtPredictions = unsupported('Sports predictions')
const gtStandings = unsupported('League standings')
const gtFootballNews = unsupported('Football news')
const gtCrypto = unsupported('Crypto prices')
const gtMovie = unsupported('Movie lookup')
const gtAnime = unsupported('Anime lookup')
const gtIpInfo = unsupported('IP lookup')
const gtStock = unsupported('Stock lookup')
const gtCurrency = unsupported('Currency conversion')
const gtGithub = unsupported('GitHub lookup')
const gtDnsCheck = unsupported('DNS check')
const gtHttpHeaders = unsupported('HTTP headers')
const gtServerCheck = unsupported('Server check')
const gtEncodeBinary = unsupported('Binary encoding')
const gtDecodeBinary = unsupported('Binary decoding')
const gtEncodeBase64 = unsupported('Base64 encoding')
const gtDecodeBase64 = unsupported('Base64 decoding')
const gtFancyText = unsupported('Fancy text')
const gtFancyTextV2 = unsupported('Fancy text')
const gtTtp = unsupported('Text-to-picture')
const gtEmojiMix = unsupported('Emoji mixing')
const gtEncryptCode = unsupported('Code encryption')
const gtEncryptCodeV2 = unsupported('Code encryption')
const gtEncryptCodeV3 = unsupported('Code encryption')
const gtHtmlObfuscate = unsupported('HTML obfuscation')
const gtCarbonCode = unsupported('Code image')
const gtToPdf = unsupported('PDF generation')
const gtQuoteCard = unsupported('Quote cards')
const gtCanvasCard = unsupported('Canvas cards')
const gtSsPhone = gtScreenshot
const gtSsTab = gtScreenshot
const gtSsPc = gtScreenshot
const gtWeb2Zip = unsupported('Website download')
const gtGoogleImages = unsupported('Image search')
const gtUnsplash = unsupported('Image search')
const gtStickerSearch = unsupported('Sticker search')
const gtLyricsV2 = unsupported('Lyrics')
const gtSpotifyLyrics = unsupported('Spotify lyrics')
const gtSpotifyPlaylist = unsupported('Spotify playlist')
const gtSoundCloud = unsupported('SoundCloud search')
const gtHearthis = unsupported('HearThis search')
const gtHearthisSet = unsupported('HearThis set')
const gtChord = unsupported('Chord search')
const gtDefine = unsupported('Definitions')
const gtWikimedia = unsupported('Wikimedia search')
const gtPlaystore = unsupported('Play Store search')
const gtHappyMod = unsupported('APK search')
const gtApkMirror = unsupported('APK search')
const gtNpmSearch = unsupported('NPM search')
const gtWattpad = unsupported('Wattpad search')
const gtIntent = unsupported('Intent classification')

const GT = ''
const KEY = ''
const GT_LEAGUES = {}

module.exports = {
    gt, free, gtChat, gtVision, gtImage, gtWeather, gtLyrics, gtWiki, gtGoogle, gtDictionary, gtBible, gtWallpaper,
    gtNews, gtShazam, gtSpotifySearch, gtYtSearch, gtYtMp3, gtYtMp4, gtTikTok, gtInstagram, gtTwitter, gtFacebook,
    gtSpotifyDl, gtRemoveBg, gtCreateQr, gtReadQr, gtScreenshot, gtOcr, gtUpscale, gtTranscript, gtWhois,
    gtLiveScore, gtPredictions, gtStandings, gtFootballNews, gtCrypto, gtTranslate, gtMovie, gtAnime, gtIpInfo,
    gtStock, gtCurrency, gtGithub, gtDnsCheck, gtHttpHeaders, gtServerCheck, gtEncodeBinary, gtDecodeBinary,
    gtEncodeBase64, gtDecodeBase64, gtFancyText, gtFancyTextV2, gtTtp, gtEmojiMix, gtEncryptCode, gtEncryptCodeV2,
    gtEncryptCodeV3, gtHtmlObfuscate, gtCarbonCode, gtToPdf, gtQuoteCard, gtCanvasCard, gtSsPhone, gtSsTab, gtSsPc,
    gtWeb2Zip, gtGoogleImages, gtUnsplash, gtTikTokSearch, gtStickerSearch, gtLyricsV2, gtSpotifyLyrics,
    gtSpotifyPlaylist, gtSoundCloud, gtHearthis, gtHearthisSet, gtChord, gtDefine, gtWikimedia, gtPlaystore,
    gtHappyMod, gtApkMirror, gtNpmSearch, gtWattpad, gtIntent, GT, KEY, GT_LEAGUES
}
