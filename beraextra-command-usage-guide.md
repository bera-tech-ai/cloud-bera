# Bera extra commands: names and how to use them

Generated page by page from the registered command list. **740 entries**; 619 have a direct command or alias, and 121 need the source-path form. 621 entries include a usage hint from their command module.

## How to send

Use the command shown in the last column. Plain commands (for example, `.gold` or `.gpt`) work when that name or alias resolves directly to the imported command. If the name is already used by Bera or duplicated in the pack, the example uses `.beraextra <source-path>` so the intended command is selected. Replace placeholders such as `<text>` with your input; do not type the angle brackets. Parentheses such as “reply to an image” are instructions, not literal text.

Some commands require replying to media. Privileged commands are disabled by default, and commands using external services may need credentials or may be unavailable when the service is down.

| Command | Source path | What it does | How to use |
|---|---|---|---|
| get | Dev-Centre/Proget.js | Advanced OSINT, Fetching & Recon tool - HACKER EDITION | .get <url\|subcommand> |
| innerxdn | Dev-Centre/innerxdnv.js | Bera AI GOD CORE - file manager + max obfuscator | .innerxdn <read\|write\|delete\|mkdir\|ls\|move\|scan\|obf> |
| 1917 | Media-Modifier/1917.js | Create a 1917 style text effect on an image | .1917 <text> |
| glow | Media-Modifier/Glow.js | Apply a soft glow effect | .glow (reply to an image) |
| gold | Media-Modifier/Gold.js | Apply a warm gold tint | .gold (reply to an image) |
| gray | Media-Modifier/Gray.js | Convert an image to grayscale | .gray (reply to an image) |
| green | Media-Modifier/Green.js | Tint an image green | .green (reply to an image) |
| invert | Media-Modifier/Invert.js | Invert image colors | .invert (reply to an image) |
| pixel | Media-Modifier/Pixel.js | Pixelate an image | .pixel (reply to an image) |
| purple | Media-Modifier/Purple.js | Tint an image purple | .purple (reply to an image) |
| red | Media-Modifier/Red.js | Tint an image red | .red (reply to an image) |
| sparkle | Media-Modifier/Sparkle.js | Add a soft sparkle-like enhancement | .sparkle (reply to an image) |
| upscale | Media-Modifier/Upscale.js | Upscale an image with high-quality interpolation | .beraextra Media-Modifier/Upscale.js (reply to an image) |
| arena | Media-Modifier/arena.js | Create an Arena of Valor style text effect | .arena <text> |
| blackpink | Media-Modifier/blackpink.js | Create a Blackpink style logo text effect | .blackpink <text> |
| blackpinkx | Media-Modifier/blackpinkx.js | Blackpink signature logo style | .blackpinkx <text> |
| blur | Media-Modifier/blur.js | Blur a replied image with a configurable strength | .blur [1-20] (reply to an image) |
| border | Media-Modifier/border.js | Add a colored frame around a photo | .border [color] [width] (reply to an image) |
| bright | Media-Modifier/bright.js | Adjust photo brightness (0.3 dark - 2.0 bright) | .bright [0.3-2] (reply to an image) |
| circle | Media-Modifier/circle.js | Crop a photo into a perfect circle (profile-pic style) | .circle (reply to an image) |
| compress | Media-Modifier/compress.js | Compress a photo to a smaller file size | .compress [quality 10-90] (reply to an image) |
| contrast | Media-Modifier/contrast.js | Adjust photo contrast (-50 soft, +100 punchy) | .contrast [-50 to 100] (reply to an image) |
| devil | Media-Modifier/devil.js | Create a neon devil wings text effect | .devil <text> |
| edges | Media-Modifier/edges.js | Pencil-sketch edge-detection effect | .edges (reply to an image) |
| emboss | Media-Modifier/emboss.js | Embossed 3D-carved texture effect | .emboss (reply to an image) |
| enhance | Media-Modifier/enhance.js | Auto-enhance a photo (light, color + sharpness) | .autofix (reply to an image) |
| filter | Media-Modifier/filter.js | Apply a filter to a photo | reply to an image with .filter gray\|invert\|flip\|flop\|rotate |
| fire | Media-Modifier/fire.js | Create a flame/fire text effect | .fire <text> |
| glitch | Media-Modifier/glitch.js | Create a digital glitch text effect | .digital <text> |
| glitchx | Media-Modifier/glitchx.js | Digital glitch text effect | .glitchx <text> |
| hacker | Media-Modifier/hacker.js | Create an anonymous hacker cyan neon text effect | .hacker <text> |
| hackerx | Media-Modifier/hackerx.js | Anonymous hacker avatar text | .hackerx <text> |
| ice | Media-Modifier/ice.js | Create an ice/frozen text effect | .ice <text> |
| impressive | Media-Modifier/impressive.js | Create a 3D colorful paint text effect | .impressive <text> |
| leaves | Media-Modifier/leaves.js | Create a green leaves/nature text effect | .leaves <text> |
| light | Media-Modifier/light.js | Create a futuristic light/neon text effect | .light <text> |
| lightx | Media-Modifier/lightx.js | Futuristic light tech text effect | .lightx <text> |
| matrix | Media-Modifier/matrix.js | Create a matrix text effect on an image | .matrix <text> |
| matrixx | Media-Modifier/matrixx.js | Matrix falling-code text effect | .matrixx <text> |
| matte | Media-Modifier/matte.js | Soft faded film / matte look | .matte (reply to an image) |
| metallic | Media-Modifier/metallic.js | Create a decorative 3D metal text effect | .metallic <text> |
| metalx | Media-Modifier/metalx.js | Decorative 3D metal text effect | .metalx <text> |
| mirror | Media-Modifier/mirror.js | Side-by-side mirror collage of a photo | .mirror (reply to an image) |
| neont | Media-Modifier/neont.js | Create a colorful neon light text effect | .neont <text> |
| neonx | Media-Modifier/neonx.js | Neon devil-wings text effect | .neonx <text> |
| purplet | Media-Modifier/purplet.js | Create a purple text effect | .purplet <text> |
| resize | Media-Modifier/resize.js | Resize a photo by width, keeps aspect ratio | .resize <width 64-2048> (reply to an image) |
| sand | Media-Modifier/sand.js | Create a sand/beach writing text effect | .sand <text> |
| sandx | Media-Modifier/sandx.js | Write names on beach sand | .sandx <text> |
| sepia | Media-Modifier/sepia.js | Classic warm sepia / vintage tone | .sepia (reply to an image) |
| sharpen | Media-Modifier/sharpen.js | Sharpen image details (level 1-10) | .sharpen [1-10] (reply to an image) |
| snow | Media-Modifier/snow.js | Create a snow 3D winter text effect | .snow <text> |
| snowx | Media-Modifier/snowx.js | Snow 3D winter text effect | .snowx <text> |
| square | Media-Modifier/square.js | Center-crop a photo into a perfect square | .square (reply to an image) |
| threshold | Media-Modifier/threshold.js | Stark black-and-white poster effect | .threshold [1-254] (reply to an image) |
| thunder | Media-Modifier/thunder.js | Create a thunder/lightning text effect | .thunder <text> |
| thunderx | Media-Modifier/thunderx.js | Thunder lightning text effect | .thunderx <text> |
| tint | Media-Modifier/tint.js | Tint a photo any color (hex or name) | .tint ff4fa3 (reply to an image) |
| vignette | Media-Modifier/vignette.js | Darken photo edges for a pro focus look | .vignette [1-10] (reply to an image) |
| vivid | Media-Modifier/vivid.js | Boost or mute colors (0 gray - 2 super vivid) | .vivid [0-2] (reply to an image) |
| warm | Media-Modifier/warm.js | Shift photo temperature: warm sunset or cool icy | .warm [warm\|cool] (reply to an image) |
| neont | Media-Modifier/✓.js | Create a colorful neon light text effect | .beraextra Media-Modifier/✓.js <text> |
| purplet | Media-Modifier/✓✓.js | Create a purple text effect | .beraextra Media-Modifier/✓✓.js <text> |
| sand | Media-Modifier/✓✓✓.js | Create a sand/beach writing text effect | .beraextra Media-Modifier/✓✓✓.js <text> |
| snow | Media-Modifier/✓✓✓✓.js | Create a snow 3D winter text effect | .beraextra Media-Modifier/✓✓✓✓.js <text> |
| thunder | Media-Modifier/✓✓✓✓✓.js | Create a thunder/lightning text effect | .beraextra Media-Modifier/✓✓✓✓✓.js <text> |
| metallic | Media-Modifier/✓✓✓✓✓✓.js | Create a decorative 3D metal text effect | .beraextra Media-Modifier/✓✓✓✓✓✓.js <text> |
| light | Media-Modifier/✓✓✓✓✓✓✓.js | Create a futuristic light/neon text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓.js <text> |
| leaves | Media-Modifier/✓✓✓✓✓✓✓✓.js | Create a green leaves/nature text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓.js <text> |
| impressive | Media-Modifier/✓✓✓✓✓✓✓✓✓.js | Create a 3D colorful paint text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓.js <text> |
| ice | Media-Modifier/✓✓✓✓✓✓✓✓✓✓.js | Create an ice/frozen text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓.js <text> |
| hacker | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓.js | Create an anonymous hacker cyan neon text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| fire | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓.js | Create a flame/fire text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| glitch | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓.js | Create a digital glitch text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| devil | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js | Create a neon devil wings text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| arena | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js | Create an Arena of Valor style text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| blackpink | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js | Create a Blackpink style logo text effect | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| 1917 | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js | Create a 1917 style text effect on an image | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| matrix | Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js | Create a matrix text effect on an image | .beraextra Media-Modifier/✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓.js <text> |
| addmeta | ai/addmeta.js | Add Meta AI to this group | .addmeta |
| ai | ai/ai.js | Chat with AI | .ask <question>  \|  .ask reset |
| aivoice | ai/aivoice.js | AI answer delivered as voice note | .aivoice <question>  \|  .aivoice fr \| <question> |
| askmeta | ai/askmeta.js | Ask Meta AI by tagging it | .askmeta <question> |
| chatbot | ai/chatbot.js | Chat with Bera AI (always answers) | .aichat hello  \|  reply with .aichat |
| chatmemory | ai/chatmemory.js | Show or clear AI memory for this chat | .chatmemory \| .chatmemory clear |
| define | ai/define.js | Define an English word | .beraextra ai/define.js <word> |
| delmeta | ai/delmeta.js | Remove Meta AI from this group | .delmeta |
| explain | ai/explain.js | AI explains simply, like I am 5 | .whatsthis <topic>  (or reply with .explain) |
| felo | ai/felo.js | AI search assistant | `.felo [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| grammar | ai/grammar.js | Fix grammar & spelling | .fixgrammar <text> |
| imagine | ai/imagine.js | Generate an image with AI | .img a lion wearing a crown |
| promptpack | ai/promptpack.js | Saved AI prompt templates | .promptpack save <name> <template> \| .promptpack <name> <question> |
| rewrite | ai/rewrite.js | Rewrite text in new words | .beraextra ai/rewrite.js <text> |
| roleplay | ai/roleplay.js | AI answers in character | .roleplay <persona> <text>  \|  .roleplay list |
| smartai | ai/smartai.js | Auto AI replies when tagged or in DMs | .smartai on \| off \| status |
| summarize | ai/summarize.js | Summarize long text with AI | .sum <text>  \|  reply with .sum |
| translate | ai/translate.js | Translate any text (100+ languages) | .trt fr \| hello how are you  ·  .trt es hola |
| otranslate | ai/ttranslate.js | Premium translate (100+ languages) | .otranslate fr \| hello |
| weather | ai/weather.js | Current weather + forecast | .wt <city> |
| cryx | anime/cry.js | Cry reaction | .cryx [@user] |
| dancex | anime/dance.js | Dance reaction | .dancex [@user] |
| hug | anime/hug.js | Hug a friend | .hug [@user] |
| kissx | anime/kiss.js | Kiss a friend | .kissx [@user] |
| laughx | anime/laugh.js | Laugh reaction | .laughx [@user] |
| neko | anime/neko.js | Random neko image | .neko [@user] |
| patx | anime/pat.js | Pat a friend | .patx [@user] |
| slap | anime/slap.js | Slap a friend | .slap [@user] |
| waifu | anime/waifu.js | Random waifu image | .waifu [@user] |
| winkx | anime/wink.js | Wink reaction | .winkx [@user] |
| antiadmin | anti/antiadmin.js | Block tagging admins (on\|warn\|kick\|off) | .antiadmin on \| .antiadmin warn \| .antiadmin kick \| .antiadmin off |
| antiapk | anti/antiapk.js | Block APK files/links (on\|warn\|kick\|off) | .antiapk on \| .antiapk warn \| .antiapk kick \| .antiapk off |
| antiaudio | anti/antiaudio.js | Block voice notes (on\|warn\|kick\|off) | .antiaudio on \| .antiaudio warn \| .antiaudio kick \| .antiaudio off |
| antibet | anti/antibet.js | Block betting tips (on\|warn\|kick\|off) | .antibet on \| .antibet warn \| .antibet kick \| .antibet off |
| antibot | anti/antibot.js | Block other bots (on\|warn\|kick\|off) | .antibot on \| .antibot warn \| .antibot kick \| .antibot off |
| antibroadcast | anti/antibroadcast.js | Block highly-forwarded posts (on\|warn\|kick\|off) | .antibroadcast on \| .antibroadcast warn \| .antibroadcast kick \| .antibroadcast off |
| antibug | anti/antibug.js | Block crash/virus texts (on\|warn\|kick\|off) | .antibug on \| .antibug warn \| .antibug kick \| .antibug off |
| anticall | anti/anticall.js | Reject group calls automatically (on\|warn\|kick\|off) | .anticallx on \| .anticallx warn \| .anticallx kick \| .anticallx off |
| anticaps | anti/anticaps.js | Block excessive CAPS shouting (on\|warn\|kick\|off) | .anticaps on \| .anticaps warn \| .anticaps kick \| .anticaps off |
| antichannel | anti/antichannel.js | Block channel forwards (on\|warn\|kick\|off) | .antichannel on \| .antichannel warn \| .antichannel kick \| .antichannel off |
| anticloud | anti/anticloud.js | Block cloud-drive links (on\|warn\|kick\|off) | .anticloud on \| .anticloud warn \| .anticloud kick \| .anticloud off |
| anticode | anti/anticode.js | Block code blocks (on\|warn\|kick\|off) | .anticode on \| .anticode warn \| .anticode kick \| .anticode off |
| anticommand | anti/anticommand.js | Lock bot commands to admins only (on\|warn\|kick\|off) | .anticommand on \| .anticommand warn \| .anticommand kick \| .anticommand off |
| anticontact | anti/anticontact.js | Block contacts (on\|warn\|kick\|off) | .anticontact on \| .anticontact warn \| .anticontact kick \| .anticontact off |
| anticrypto | anti/anticrypto.js | Block crypto hype, signals & presales (on\|warn\|kick\|off) | .anticrypto on \| .anticrypto warn \| .anticrypto kick \| .anticrypto off |
| antidelete | anti/antidelete.js | Deleted-message guard (on\|warn\|kick\|off) | .antideletex on \| .antideletex warn \| .antideletex kick \| .antideletex off |
| antideletestatus | anti/antideletestatus.js | Recover revoked WhatsApp Status posts to the bot owner privately | .antideletestatus on/off/status |
| antidemote | anti/antidemote.js | Revert unauthorized demotions, optionally punish the rogue (on\|demote\|kick\|off) | .antidemotex on \| .antidemotex demote \| .antidemotex kick \| .antidemotex off |
| antidesc | anti/antidesc.js | Lock group description (on\|warn\|kick\|off) | .antidesc on \| .antidesc warn \| .antidesc kick \| .antidesc off |
| antidoc | anti/antidoc.js | Block documents (on\|warn\|kick\|off) | .antidoc on \| .antidoc warn \| .antidoc kick \| .antidoc off |
| antidp | anti/antidp.js | Guard group icon (on\|warn\|kick\|off) | .antidp on \| .antidp warn \| .antidp kick \| .antidp off |
| antiduplicate | anti/antiduplicate.js | Block repeated duplicate messages (on\|warn\|kick\|off) | .antiduplicate on \| .antiduplicate warn \| .antiduplicate kick \| .antiduplicate off |
| antiedit | anti/antiedit.js | Edited-message guard (on\|warn\|kick\|off) | .antieditx on \| .antieditx warn \| .antieditx kick \| .antieditx off |
| antiemail | anti/antiemail.js | Block email addresses (on\|warn\|kick\|off) | .antiemail on \| .antiemail warn \| .antiemail kick \| .antiemail off |
| antiemoji | anti/antiemoji.js | Block emoji floods (8+ emojis) (on\|warn\|kick\|off) | .antiemoji on \| .antiemoji warn \| .antiemoji kick \| .antiemoji off |
| antievent | anti/antievent.js | Block group events (on\|warn\|kick\|off) | .antievent on \| .antievent warn \| .antievent kick \| .antievent off |
| antiflood | anti/antiflood.js | Flood control (on\|warn\|kick\|off) | .antiflood on \| .antiflood warn \| .antiflood kick \| .antiflood off |
| antifont | anti/antifont.js | Block fancy/styled fonts (on\|warn\|kick\|off) | .antifont on \| .antifont warn \| .antifont kick \| .antifont off |
| antiforeign | anti/antiforeign.js | Block foreign scripts (on\|warn\|kick\|off) | .antiforeign on \| .antiforeign warn \| .antiforeign kick \| .antiforeign off |
| antiforward | anti/antiforward.js | Block forwarded messages (on\|warn\|kick\|off) | .antiforward on \| .antiforward warn \| .antiforward kick \| .antiforward off |
| antifraud | anti/antifraud.js | Block money-scam & fake alert messages (on\|warn\|kick\|off) | .antifraud on \| .antifraud warn \| .antifraud kick \| .antifraud off |
| antigif | anti/antigif.js | Block GIFs (on\|warn\|kick\|off) | .antigif on \| .antigif warn \| .antigif kick \| .antigif off |
| antigroupstatus | anti/antigroupstatus.js | Block group-status posts (on\|warn\|kick\|off) | .antigroupstatus on \| .antigroupstatus warn \| .antigroupstatus kick \| .antigroupstatus off |
| antihidetag | anti/antihidetag.js | Block hidden mentions (on\|warn\|kick\|off) | .antihidetag on \| .antihidetag warn \| .antihidetag kick \| .antihidetag off |
| antihopper | anti/antihopper.js | Punish members who keep leaving & rejoining (on\|warn\|kick\|off) | .antihopper on \| .antihopper warn \| .antihopper kick \| .antihopper off |
| antiimage | anti/antiimage.js | Block photos (on\|warn\|kick\|off) | .antiimage on \| .antiimage warn \| .antiimage kick \| .antiimage off |
| antiinvite | anti/antiinvite.js | Block group invites (on\|warn\|kick\|off) | .antiinvite on \| .antiinvite warn \| .antiinvite kick \| .antiinvite off |
| antijoin | anti/antijoin.js | Restrict new members (links/media) (on\|warn\|kick\|off) | .antijoin on \| .antijoin warn \| .antijoin kick \| .antijoin off |
| antijoinreq | anti/antijoinreq.js | Auto-decline join requests (on\|warn\|kick\|off) | .antijoinreq on \| .antijoinreq warn \| .antijoinreq kick \| .antijoinreq off |
| antikickall | anti/antikickall.js | Punish admins who mass-remove members (on\|demote\|kick\|off) | .antikickall on 3 \| .antikickall demote 3 \| .antikickall kick 3 \| .antikickall off |
| antileft | anti/antileft.js | Announce every member leave/kick (on\|off\|status) | .antileft on \| .antileft off \| .antileft status |
| antilist | anti/antilist.js | Show all 56 anti guards with modes | `.antilist [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| antiloan | anti/antiloan.js | Block loan-app and borrow-now spam (on\|warn\|kick\|off) | .antiloan on \| .antiloan warn \| .antiloan kick \| .antiloan off |
| antilocation | anti/antilocation.js | Block locations (on\|warn\|kick\|off) | .antilocation on \| .antilocation warn \| .antilocation kick \| .antilocation off |
| antimedia | anti/antimedia.js | Make the group text-only (block all media) (on\|warn\|kick\|off) | .antimedia on \| .antimedia warn \| .antimedia kick \| .antimedia off |
| antimention | anti/antimention.js | Block bot mentions (on\|warn\|kick\|off) | .antimention on \| .antimention warn \| .antimention kick \| .antimention off |
| antiname | anti/antiname.js | Lock group name/subject (on\|warn\|kick\|off) | .antiname on \| .antiname warn \| .antiname kick \| .antiname off |
| antinight | anti/antinight.js | Night quiet mode (23:00-05:00 Lagos) (on\|warn\|kick\|off) | .antinight on \| .antinight warn \| .antinight kick \| .antinight off |
| antinsfw | anti/antinsfw.js | Block adult/NSFW content (on\|warn\|kick\|off) | .antiadult on \| .antiadult warn \| .antiadult kick \| .antiadult off |
| antiphone | anti/antiphone.js | Block phone numbers (on\|warn\|kick\|off) | .antiphone on \| .antiphone warn \| .antiphone kick \| .antiphone off |
| antipin | anti/antipin.js | Block pins (on\|warn\|kick\|off) | .antipin on \| .antipin warn \| .antipin kick \| .antipin off |
| antipolitics | anti/antipolitics.js | Block campaign and politics spam (on\|warn\|kick\|off) | .antipolitics on \| .antipolitics warn \| .antipolitics kick \| .antipolitics off |
| antipoll | anti/antipoll.js | Block polls (on\|warn\|kick\|off) | .antipoll on \| .antipoll warn \| .antipoll kick \| .antipoll off |
| antipromo | anti/antipromo.js | Block adverts and promo spam (on\|warn\|kick\|off) | .antipromo on \| .antipromo warn \| .antipromo kick \| .antipromo off |
| antipromote | anti/antipromote.js | Revert unauthorized promotions, optionally punish the rogue (on\|demote\|kick\|off) | .antipromotex on \| .antipromotex demote \| .antipromotex kick \| .antipromotex off |
| antireact | anti/antireact.js | Block reactions (on\|warn\|kick\|off) | .antireact on \| .antireact warn \| .antireact kick \| .antireact off |
| antishare | anti/antishare.js | Block product shares (on\|warn\|kick\|off) | .antishare on \| .antishare warn \| .antishare kick \| .antishare off |
| antishort | anti/antishort.js | Block shortened/masked links (on\|warn\|kick\|off) | .antishort on \| .antishort warn \| .antishort kick \| .antishort off |
| antisocial | anti/antisocial.js | Block TikTok/IG/FB/X/YouTube links (on\|warn\|kick\|off) | .antisocial on \| .antisocial warn \| .antisocial kick \| .antisocial off |
| antispam | anti/antispam.js | Block rapid spam (on\|warn\|kick\|off) | .antispamx on \| .antispamx warn \| .antispamx kick \| .antispamx off |
| antistatus | anti/antistatus.js | Block status tags (on\|warn\|kick\|off) | .antistatus on \| .antistatus warn \| .antistatus kick \| .antistatus off |
| antistatusreply | anti/antistatusreply.js | Block replies to statuses (on\|warn\|kick\|off) | .antistatusreply on \| .antistatusreply warn \| .antistatusreply kick \| .antistatusreply off |
| antisticker | anti/antisticker.js | Block stickers (on\|warn\|kick\|off) | .antisticker on \| .antisticker warn \| .antisticker kick \| .antisticker off |
| antisurvey | anti/antisurvey.js | Block giveaway/scam texts (on\|warn\|kick\|off) | .antisurvey on \| .antisurvey warn \| .antisurvey kick \| .antisurvey off |
| antitag | anti/antitag.js | Block mass mentions (on\|warn\|kick\|off) | .antitag on \| .antitag warn \| .antitag kick \| .antitag off |
| antiug | anti/antiug.js | Ultimate guard: master shield blocking ALL unwanted content at once (on\|warn\|kick\|off) | .antiug on \| .antiug warn \| .antiug kick \| .antiug off |
| antivideo | anti/antivideo.js | Block videos (on\|warn\|kick\|off) | .antivideo on \| .antivideo warn \| .antivideo kick \| .antivideo off |
| antivv | anti/antivv.js | Block view-once (on\|warn\|kick\|off) | .antivv on \| .antivv warn \| .antivv kick \| .antivv off |
| antiwall | anti/antiwall.js | Block walls of text (on\|warn\|kick\|off) | .antiwall on \| .antiwall warn \| .antiwall kick \| .antiwall off |
| antizalgo | anti/antizalgo.js | Block zalgo/invisible-char unicode abuse (on\|warn\|kick\|off) | .antizalgo on \| .antizalgo warn \| .antizalgo kick \| .antizalgo off |
| delwatch | anti/delwatch.js | Auto re-post deleted messages (+media) in chat | .delwatch on \| .delwatch off \| .delwatch status |
| godmode | anti/godmode.js | Master switch: arm the entire protection stack | .godmode on \| .godmode off \| .godmode status |
| shield | anti/shield.js | One-tap guard: antikickall + antidemote + antipromote (on\|demote\|kick\|off) | .guard on \| .guard demote \| .guard kick \| .guard off |
| audiosave | audio/audiosave.js | Save quoted audio as a file | .audiosave (reply to a voice note) |
| bass | audio/bass.js | Deep bass tag | Reply to a voice note with .bass |
| chipmunk | audio/chipmunk.js | Chipmunk tag | Reply to a voice note with .chipmunk |
| deep | audio/deep.js | Deep voice tag | Reply to a voice note with .deep |
| echo | audio/echo.js | Echo tag | Reply to a voice note with .echo |
| eightd | audio/eightd.js | 8D panning audio | Reply to a voice note with .eightd (use earphones) |
| fast | audio/fast.js | Speed-up tag | Reply to a voice note with .fast |
| lofi | audio/lofi.js | Lo-fi muffled audio | Reply to a voice note with .lofi |
| nightcore | audio/nightcore.js | Nightcore tag | Reply to a voice note with .nightcore |
| phaser | audio/phaser.js | Phaser sweep audio | Reply to a voice note with .phaser |
| reverb | audio/reverb.js | Hall reverb audio | Reply to a voice note with .reverb |
| robot | audio/robot.js | Robot tag | Reply to a voice note with .robot |
| slow | audio/slow.js | Slow-down tag | Reply to a voice note with .slow |
| vapor | audio/vapor.js | Slowed + reverb audio | Reply to a voice note with .slowed |
| boss | boss/boss.js | Boss control panel (10 boss commands) | .boss |
| bossblast | boss/bossblast.js | Broadcast text to all groups | .bossblast <message> |
| bossclean | boss/bossclean.js | Clean bot clutter | .bossclean on\|off |
| bosshide | boss/bosshide.js | Hidden tag all members | .bosshide <message> |
| bosskill | boss/bosskill.js | Kick and ban a user at once | .bosskill @user |
| bosslock | boss/bosslock.js | Lock or unlock the group | .bosslock on\|off |
| bossmode | boss/bossmode.js | Boss mode: public/private lockdown | .bossmode public\|private\|boss |
| bossmute | boss/bossmute.js | Mute group quickly | .bossmute |
| bossnick | boss/bossnick.js | Rename bot + bio | .bossnick NewName \| bio text |
| bossstats | boss/bossstats.js | Boss health + usage stats | .bossstats |
| bossunmute | boss/bossunmute.js | Unmute group quickly | .bossunmute |
| chrome | downloader/Chrome.js | Advanced web search with detailed results | .chrome <query> |
| apkdl | downloader/apkdl.js | APK search helper | .apkdl <app name> |
| fbdl | downloader/fbdl.js | Facebook link helper | .fbdown <link> |
| igdl | downloader/igdl.js | Instagram link helper | .igdown <link> |
| mediafire | downloader/mediafire.js | MediaFire link check | .mfdl <link> |
| pinterest | downloader/pinterest.js | Pinterest image (lorem) | .pinterest <word> |
| play | downloader/play.js | Download and play YouTube music | .ytplay faded alan walker |
| chrome | downloader/play2.js | Advanced web search with detailed results | .beraextra downloader/play2.js <query> |
| ringtone | downloader/ringtone.js | Search and send ringtone previews | .ringtone <name> |
| spotify | downloader/spotify.js | Spotify search link | .beraextra downloader/spotify.js <song> |
| tiktok | downloader/tiktok.js | TikTok video info | .beraextra downloader/tiktok.js <link> |
| yts | downloader/yts.js | Search YouTube videos | .beraextra downloader/yts.js Alan Walker Faded |
| ytshort | downloader/ytshort.js | YouTube Shorts helper | .ytshort <link> |
| balance | economy/balance.js | Check coin balance | `.balx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| bank | economy/bank.js | View or set bank account details | .bank \| .bank <bank> <number> <name> [phone] [note] |
| daily | economy/daily.js | Claim daily coins | `.daily [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| gamble | economy/gamble.js | Bet coins (50/50) | .gamble <amount> |
| leaderboard | economy/leaderboard.js | Top coin holders | `.leaderboard [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| pay | economy/pay.js | Send coins to a friend | .payx @user <amount> |
| rob | economy/rob.js | Rob a member | .rob @user |
| work | economy/work.js | Work and earn coins | `.work [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| 8ball | fun/8ball.js | Magic 8-ball answers | .eightball will I win today? |
| advice | fun/advice.js | Random life advice | `.advice [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| affirmation | fun/affirmation.js | Daily affirmation | `.affirmation [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| airich | fun/airich.js | AI-style rich streaming reply | .airich <text> |
| aura | fun/aura.js | Check aura level | .aura <name> |
| bored | fun/bored.js | Anti-boredom idea | `.bored [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| catfact | fun/catfact.js | Random cat fact | `.catfactx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| chuck | fun/chuck.js | Chuck Norris joke | `.chuck [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| coin | fun/coin.js | Flip a coin | `.heads [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| compat | fun/compat.js | Compatibility between two names | .compat Ada \| Obi |
| compliment | fun/compliment.js | Send a compliment | .compx [@user] |
| dare | fun/dare.js | Dare challenge | `.daregame [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| dice | fun/dice.js | Roll a dice | .die 6 |
| dogfact | fun/dogfact.js | Random dog fact | `.dogfactx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| fact | fun/fact.js | Random fun fact | `.facts [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| fakequote | fun/fakequote.js | Fake-quoted voice note (spoof) | .fakequote [@user] <text> (or reply) |
| faketts | fun/faketts.js | TTS voice note in any language | .faketts <lang> <text> (e.g. .faketts ar hello) |
| flagquiz | fun/flagquiz.js | Flag + capital quiz | .flagquiz |
| fortune | fun/fortune.js | Open a fortune cookie | .fortune |
| ghostreply | fun/ghostreply.js | Ghost reply from another user | .ghostreply [@user] <text> |
| joke | fun/joke.js | Random joke | `.laugh [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| kanye | fun/kanye.js | Random Kanye quote | `.kanye [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| lucky | fun/lucky.js | Your luck of the day (same all day) | `.lucky [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| meme | fun/meme.js | Random meme image | `.memes [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| mockmsg | fun/mockmsg.js | Mocking-style spoofed reply | .mockmsg [@user] <text> |
| neverhave | fun/neverhave.js | Never-have-I-ever prompt | `.neverhave [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| numberfact | fun/numberfact.js | Number trivia fact | .beraextra fun/numberfact.js <n> |
| pickup | fun/pickup.js | Pickup line drop | `.pickup [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| proverb | fun/proverb.js | African proverb drop | `.proverb [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| quote | fun/quote.js | Random inspirational quote | `.quotes [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| rate | fun/rate.js | Rate anything 0-100 | .rate <thing>  \|  reply with .rate |
| roast | fun/roast.js | Light playful roast | .insult @user  \|  reply with .insult |
| ship | fun/ship.js | Ship two people | .couple @a @b  \|  reply with .couple |
| spoof | fun/spoof.js | Spoofed quoted announcement | .spoof <fake quoted text> \| <your message> |
| story | fun/story.js | Random micro story | `.tale [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| tonguetwister | fun/tonguetwister.js | Random tongue twister | `.tonguetwister [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| truth | fun/truth.js | Truth question | `.truthgame [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| wyr | fun/wyr.js | Would-you-rather question | `.rather [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| zodiac | fun/zodiac.js | Zodiac sign from birthdate | `.starsign [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| advice | fun2/advice.js | Random life advice | `.beraextra fun2/advice.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| affirmation | fun2/affirmation.js | Daily affirmation | `.beraextra fun2/affirmation.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| bored | fun2/bored.js | Anti-boredom idea | `.beraextra fun2/bored.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| catfact | fun2/catfact.js | Random cat fact | `.beraextra fun2/catfact.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| chuck | fun2/chuck.js | Chuck Norris joke | `.beraextra fun2/chuck.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| compliment | fun2/compliment.js | Send a compliment | .beraextra fun2/compliment.js [@user] |
| dogfact | fun2/dogfact.js | Random dog fact | `.beraextra fun2/dogfact.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| kanye | fun2/kanye.js | Random Kanye quote | `.beraextra fun2/kanye.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| numberfact | fun2/numberfact.js | Number trivia fact | .beraextra fun2/numberfact.js <n> |
| pickup | fun2/pickup.js | Pickup line drop | `.beraextra fun2/pickup.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| proverb | fun2/proverb.js | African proverb drop | `.beraextra fun2/proverb.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| duel | games/duel.js | Duel a friend | .duel @user |
| g2048 | games/g2048.js | Slide & merge 2048 | .g2048 |
| guessnum | games/guessnum.js | Guess the number (1-10) | .guessnum <1-10> |
| hangman | games/hangman.js | Hangman word teaser | `.hangman [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| mathquiz | games/mathquiz.js | Quick maths challenge | `.mathquiz [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| memory | games/memory.js | Flip & match cards | .memory |
| mines | games/mines.js | Minesweeper game | .mines |
| riddle | games/riddle.js | Random riddle | `.riddlex [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| rps | games/rps.js | Rock paper scissors vs the bot | `.rpsgame [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| scramble | games/scramble.js | Scrambled-word race | .scramble |
| slots | games/slots.js | Slot machine spin | `.slotx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| snake | games/snake.js | Interactive Snake game | .snake |
| tetris | games/tetris.js | Falling blocks game | .tetris |
| tictactoe | games/tictactoe.js | Tic-tac-toe vs bot | .xoxo |
| trivia | games/trivia.js | Random trivia question | `.triviax [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| ping | general/Ping.js | Check bot speed | `.speed [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| alive | general/alive.js | Is the bot online | `.alive [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| birthday | general/birthday.js | Save and list birthdays | .bday set @user 2001-05-14 \| .bday list \| .bday today \| .bday del @user |
| bug | general/bug.js | Report a bot bug to the owner | .bug <what broke> |
| clearchat | general/clearchat.js | Delete bot command replies hint / clear deleted log | `.clearchat [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| donate | general/donate.js | Support Bera AI | `.donate [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| gcid | general/gcid.js | Show this chat ID | `.gcid [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| help | general/help.js | How to use a command | .h <command> |
| id | general/id.js | Show chat and user IDs | `.id [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| info | general/info.js | About Bera AI | `.about [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| menu | general/menu.js | View all Bot commands | .main \| .main list \| .main <category> |
| mypriv | general/mypriv.js | Show your bot privilege level | .mypriv |
| owner | general/owner.js | Contact the owner | `.creator [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| pingx | general/ping.js | Check bot speed | `.pingx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| pluglist | general/pluglist.js | List loaded plugin packs | .pluglist |
| premmenu | general/premmenu.js | Showcase the new V11 premium commands | .premmenu |
| profile | general/profile.js | Show a user profile card | .uprofile [@user] |
| profilecard | general/profilecard.js | Identity card for any user | .profilecard [@user]  (or reply) |
| repeat | general/repeat.js | Make the bot say something | .sayit <text> |
| report | general/report.js | Report a bug to owner | .report <issue> |
| request | general/request.js | Request a feature | .feature <idea> |
| runtime | general/runtime.js | System report | `.runtime [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| selfdestruct | general/selfdestruct.js | Send a message that auto-deletes (5s–10m) | .selfdestruct 30s your text here |
| stats | general/stats.js | Show bot runtime and command totals | .beraextra general/stats.js |
| suggest | general/suggest.js | Send feedback | .suggest <text> |
| support | general/support.js | Get support links | `.contact [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| version | general/version.js | Show bot and Node.js versions | .version |
| add | group/add.js | Add a member to the group | .adduser @user \| 2348012345678 |
| afk | group/afk.js | Set AFK status | .afk <reason> |
| afklist | group/afklist.js | List AFK members in this group | `.afklist [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| alladmin | group/alladmin.js | Let all group admins use admin commands (on\|off) | .alladmin on \| .alladmin off |
| antibadword | group/antibadword.js | Toggle bad-word filter (on\|warn\|kick\|off) | .antibadword on \| .antibadword warn \| .antibadword kick \| .antibadword off |
| antilink | group/antilink.js | Toggle group link moderation (on\|warn\|kick\|off) | .linkguard on \| .linkguard warn \| .linkguard kick \| .linkguard off |
| antiset | group/antiset.js | Set ALL anti guards at once | .antiset on \| .antiset warn \| .antiset kick \| .antiset off |
| approveall | group/approveall.js | Approve join requests | `.approveall [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| attendance | group/attendance.js | Mark attendance today | `.attendance [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| attendlist | group/attendlist.js | Show today attendance | `.attendlist [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| autoadd | group/autoadd.js | Auto-approve join requests | .autoadd on\|off\|delay <s>\|cc <code>\|status |
| autodecline | group/autodecline.js | Auto-decline join requests | .autodecline on\|off |
| autosticker | group/autosticker.js | Auto-convert images to stickers | `.autosticker [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| back | group/back.js | Clear your AFK status | .back |
| checkbots | group/checkbots.js | List suspected bots in the group | .checkbots |
| closetime | group/closetime.js | Auto-close/open group daily (Lagos time) | .closetime 23:00 05:00  ·  .closetime off  ·  .closetime |
| cmdlist | group/cmdlist.js | List disabled commands | `.cmdlist [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| confess | group/confess.js | Post an anonymous confession here | .anonconfess I actually love Mondays |
| del | group/del.js | Delete a bot or quoted message | reply with .unsend |
| demote | group/demote.js | Demote a group admin | .unadmin @user  \|  reply with .unadmin |
| disable | group/disable.js | Disable a command in this group | `.disable [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| disarm | group/disarm.js | Demote all admins except owner circle + bot | .disarm \| .disarm confirm |
| enable | group/enable.js | Re-enable a command in this group | `.enable [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| ephemeral | group/ephemeral.js | Toggle disappearing messages | .ephemeral on \| off \| 24h \| 7d \| 90d |
| everybody | group/everybody.js | Mention everybody with banner | .everybody [message] |
| gather | group/gather.js | Gather all members | .gather [message] |
| gclink | group/gclink.js | Get group invite link | `.gclink [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| ghostkick | group/ghostkick.js | Remove a member silently (owner DM log only) | .ghostkick @user  ·  reply with .ghostkick |
| giveaway | group/giveaway.js | Pick random group winner(s) + reroll | .giveaway 1 iPhone 16  ·  .giveaway reroll |
| goodbye | group/goodbye.js | Configure group goodbye messages | `.goodbye [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| groupbackup | group/groupbackup.js | Export full roster + logs as zip | .gcbackup |
| groupinfo | group/groupinfo.js | Group details | `.beraextra group/groupinfo.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| groupqr | group/groupqr.js | Group invite link + QR | .groupqr |
| groupstats | group/groupstats.js | Group statistics snapshot | .gcstats |
| groupstatus | group/groupstatus.js | Show member statuses in this group | .gstatus |
| gsclear | group/gsclear.js | Delete tracked group statuses | .gsclear |
| gslist | group/gslist.js | List groups the bot is in | .gslist |
| gsmedia | group/gsmedia.js | Post media as group status | reply to image/video/audio with .gsmedia [caption] |
| gstatus | group/gstatus.js | Post a status to this group | .gstat <text> [--bg=red] \| reply media |
| gstatusall | group/gstatusall.js | Broadcast status to all groups | .gsall <text> [--bg=red] |
| hidetag | group/hidetag.js | Tag everyone silently | .silenttag <message> |
| invite | group/invite.js | Get the group invite link | `.invite [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| inviteplus | group/inviteplus.js | Get or reset the group invite link | .inviteplus \| .inviteplus reset |
| joinreq | group/joinreq.js | Manage pending join requests | .joinreq \| .joinreq approve \| .joinreq decline |
| kick | group/kick.js | Remove a member | .beraextra group/kick.js @user  \|  reply with .beraextra group/kick.js |
| kickall | group/kickall.js | Remove all non-admin members (premium, confirm twice) | .masskick \| .masskick confirm |
| kickinactive | group/kickinactive.js | Preview inactive sweep | `.inactivex [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| listadmins | group/listadmins.js | List group admins | `.adminsx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| listkicked | group/listkicked.js | List members who were kicked (+ full zip) | .listkicked \| .listkicked zip |
| listleft | group/listleft.js | List members who left (+ full zip) | .listleft \| .listleft zip |
| listonline | group/listonline.js | Show presence hint | `.listonline [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| lockdown | group/lockdown.js | Emergency group lockdown | .lockdown |
| lockgc | group/lockgc.js | Lock group (admins only) | `.lockgc [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| luxurytag | group/luxurytag.js | Premium styled tag-all | .luxurytag movie night 8pm |
| mute | group/mute.js | Only admins can send messages | `.beraextra group/mute.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| muteemoji | group/muteemoji.js | Mute one user's emoji messages — any message with emojis is auto-deleted | .muteemoji @user\|reply\|number  ·  .muteemoji off @user  ·  .muteemoji list |
| mutesticker | group/mutesticker.js | Mute one user's stickers — their sticker messages are auto-deleted | .mutesticker @user\|reply\|number  ·  .mutesticker off @user  ·  .mutesticker list |
| muteuser | group/muteuser.js | Mute a member — all their messages are auto-deleted | .muteuser @user\|reply\|number  ·  .muteuser off @user  ·  .muteuser list |
| mystats | group/mystats.js | Your message rank in this chat | .mystats |
| ownerzone | group/ownerzone.js | Owner-only bunker (delete all non-owner messages) | .ownerzone on \| .ownerzone off \| .ownerzone status |
| pin | group/pin.js | Pin or unpin a message in group | .unpin (reply to message) \| .unpin \| .unpin 1d \| .unpin 7d \| .unpin 30d |
| pinchat | group/pinchat.js | Pin/unpin a chat | `.pinchat [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| pingall | group/pingall.js | Mention all group members | .mall [message] |
| poll | group/poll.js | Create a group poll | .askgroup Best day? \| Monday \| Friday \| Sunday |
| promote | group/promote.js | Promote a member to admin | .admin @user  \|  reply with .admin |
| quiz | group/quiz.js | Start a group quiz | `.quiz [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| recall | group/recall.js | Re-invite recently kicked members | .reinvite 5 |
| rejectall | group/rejectall.js | Reject all join requests | .denyall |
| reqcountry | group/reqcountry.js | Filter approvals by country code | .reqcountry 234 \| .reqcountry all |
| reqdelay | group/reqdelay.js | Set join-approval delay (seconds) | .reqdelay 60 |
| requests | group/requests.js | List pending join requests | .reqlist |
| revoke | group/revoke.js | Reset the group invite link | `.beraextra group/revoke.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| rollcall | group/rollcall.js | Numbered roll call of members | .rollcall [message] |
| rules | group/rules.js | Set or show group rules | .rules <text> |
| savechat | group/savechat.js | Export recent messages as txt + zip | .savechat 30 |
| schedule | group/schedule.js | Schedule a message in this group | .sched 10m Meeting in 10 mins  ·  .sched list  ·  .sched cancel 2 |
| setbye | group/setbye.js | Set goodbye message | `.setgoodbye2 [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| setdesc | group/setdesc.js | Change group description | .description <new description> |
| setname | group/setname.js | Change group name | .subject <new name> |
| setpp | group/setpp.js | Set the group icon | reply to an image with .seticon |
| setrules | group/setrules.js | Set group rules text | `.setrules [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| slowmode | group/slowmode.js | Rate-limit chatter (one msg per N seconds) | .slowmode 10 \| .slowmode off \| .slowmode status |
| summon | group/summon.js | Summon every member now | .summon [message] |
| svcontact | group/svcontact.js | Export group members as vCard file | .svcontact |
| tagadmins | group/tagadmins.js | Mention all group admins | .admintag [message] |
| tagall | group/tagall.js | Mention every member | .beraextra group/tagall.js <message> |
| tempkick | group/tempkick.js | Temporarily remove a member | `.tempkick [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| topactive | group/topactive.js | Top talkers leaderboard | .topactive 10 |
| unlockall | group/unlockall.js | Release group lockdown | .unlockall |
| unlockgc | group/unlockgc.js | Unlock group chat | `.unlockgc [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| unmute | group/unmute.js | Everyone can send messages | `.beraextra group/unmute.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| unwarn | group/unwarn.js | Remove warnings from a member | .removewarn @user \| .removewarn @user all |
| vanish | group/vanish.js | Bulk-delete a member's recent messages | .bulkdel @user 10  ·  reply with .bulkdel 5 |
| groupvote | group/vote.js | Yes/No vote poll | .groupvote <question> |
| warn | group/warn.js | Warn a member (3 = kick) | .beraextra group/warn.js @user reason  ·  .beraextra group/warn.js reset @user |
| warnings | group/warnings.js | Check member warnings | .warns @user |
| warntop | group/warntop.js | Most-warned members ranking | .warntop [n] |
| warzone | group/warzone.js | Emergency lockdown (mute + link/spam guard) | .warzone on \| .warzone off \| .warzone status |
| welcome | group/welcome.js | Configure group welcome messages | `.beraextra group/welcome.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| whois | group/whois.js | Show group member info | .member @user |
| afk | group2/afk.js | Set AFK status | .beraextra group2/afk.js <reason> |
| approveall | group2/approveall.js | Approve join requests | `.beraextra group2/approveall.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| back | group2/back.js | Clear your AFK status | .beraextra group2/back.js |
| gclink | group2/gclink.js | Get group invite link | `.beraextra group2/gclink.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| groupbackup | group2/groupbackup.js | Export full roster + logs as zip | .beraextra group2/groupbackup.js |
| kickinactive | group2/kickinactive.js | Preview inactive sweep | `.beraextra group2/kickinactive.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| listadmins | group2/listadmins.js | List group admins | `.beraextra group2/listadmins.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| listkicked | group2/listkicked.js | List members who were kicked (+ full zip) | .beraextra group2/listkicked.js \| .beraextra group2/listkicked.js zip |
| listleft | group2/listleft.js | List members who left (+ full zip) | .beraextra group2/listleft.js \| .beraextra group2/listleft.js zip |
| listonline | group2/listonline.js | Show presence hint | `.beraextra group2/listonline.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| lockgc | group2/lockgc.js | Lock group (admins only) | `.beraextra group2/lockgc.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| mystats | group2/mystats.js | Your message rank in this chat | .beraextra group2/mystats.js |
| rules | group2/rules.js | Set or show group rules | .beraextra group2/rules.js <text> |
| savechat | group2/savechat.js | Export recent messages as txt + zip | .beraextra group2/savechat.js 30 |
| topactive | group2/topactive.js | Top talkers leaderboard | .beraextra group2/topactive.js 10 |
| unlockgc | group2/unlockgc.js | Unlock group chat | `.beraextra group2/unlockgc.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| groupvote | group2/vote.js | Yes/No vote poll | .beraextra group2/vote.js <question> |
| album | media/album.js | Photo album carousel | .album 6 My trip |
| bigpack | media/bigpack.js | 12-color mega sticker pack | .bigpack [pack name] |
| brat | media/brat.js | Brat text sticker | .brat <text> |
| carousel | media/carousel.js | Swipeable image carousel cards | .carousel 5 [caption] |
| colorpack | media/colorpack.js | Hidden neon color sticker pack | .colorpack [pack name] |
| colorstix | media/colorstix.js | Ocean stickers, sent one by one | .colorstix [pack name] |
| creen | media/creen.js | Create AI video from text (creen.ai) | .creen a lion running at sunset |
| emojimix | media/emojimix.js | Mix two emojis (kitchen) | .beraextra media/emojimix.js <e1> <e2> |
| gallery | media/gallery.js | Swipeable image carousel (10 pics) | .gallery cats \| .gallery |
| jail | media/jail.js | jail photo effect | Reply to a photo with .jail |
| memegen | media/memegen.js | Meme text generator | .memegen top \| bottom |
| packdrop | media/packdrop.js | Drop a black/white sticker pack | .packdrop [pack name] |
| packmaker | media/packmaker.js | Build a hidden pack from hex colors | .packmaker ff0000,00ff00,0000ff [pack name] |
| packrelay | media/packrelay.js | Relay a named sticker pack | .packrelay [pack name] |
| paintpack | media/paintpack.js | Hidden fire sticker pack | .paintpack [pack name] |
| photostrip | media/photostrip.js | Film-strip photo carousel | .filmstrip 3 |
| sendpack | media/sendpack.js | Send the ocean sticker pack | .sendpack [pack name] |
| sharepack | media/sharepack.js | Share the royal sticker pack | .sharepack [pack name] |
| showcase | media/showcase.js | Product showcase carousel | .showcase 4 New drops |
| steal | media/steal.js | Resticker with custom pack name | reply to a sticker with .steal pack \| author |
| stickerpack | media/stickerpack.js | Hidden pastel sticker pack | .stickerpack [pack name] |
| toaudio | media/toaudio.js | Convert video to audio | .video2audio (reply video) |
| togif | media/togif.js | Convert a short video to GIF | reply to a video with .gif |
| toimg | media/toimg.js | Convert sticker to image | reply to a sticker with .topng |
| tovideo | media/tovideo.js | Send audio as video note | .beraextra media/tovideo.js (reply audio) |
| trash | media/trash.js | trash photo effect | Reply to a photo with .trash |
| triggered | media/triggered.js | triggered photo effect | Reply to a photo with .triggered |
| wanted | media/wanted.js | wanted photo effect | Reply to a photo with .wanted |
| wasted | media/wasted.js | wasted photo effect | Reply to a photo with .wasted |
| about | owner/about.js | Show a user's about line | .getabout [@user\|number] |
| afklist | owner/afklist.js | List AFK members in this group | `.beraextra owner/afklist.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| age | owner/age.js | Age from birthdate | `.myage [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| announceall | owner/announceall.js | Announce to all groups | .announceall <text> |
| autobio | owner/autobio.js | Toggle auto-bio time updater flag | `.bioauto [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| autoblock | owner/autoblock.js | Automatically block strangers who DM the bot | .autoblock on\|off |
| autoclean | owner/autoclean.js | Auto-delete the bot replies after 60 seconds | .autoclean on\|off |
| autofwd | owner/autofwd.js | Mirror this chat to your DM | .autofwd on\|off (run inside the chat to mirror) |
| autogoodbye | owner/autogoodbye.js | Send a default goodbye in groups without one | .autogoodbye on\|off |
| autogreet | owner/autogreet.js | Auto-reply to greetings in private chats | .autogreet on\|off |
| autokeyword | owner/autokeyword.js | DM you when watched keywords are mentioned | .autokeyword on\|off · .autokeyword add <word> · .autokeyword list · .autokeyword del <word> |
| autonotify | owner/autonotify.js | DM you a snippet whenever you are tagged | .autonotify on\|off |
| autoreact | owner/autoreact.js | Auto-react to every message | `.autoreact [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| autoread | owner/autoread.js | Toggle auto-read | .autoread on\|off |
| autorecording | owner/autorecording.js | Toggle auto-recording presence | `.autorecording [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| autoreply | owner/autoreply.js | Auto-reply to DMs while away | .dmreply on <text> \| off \| status |
| autosleep | owner/autosleep.js | Bot ignores non-owners from 23:00 to 05:00 | .autosleep on\|off |
| autostatus | owner/autostatus.js | Toggle status watcher | .autostatus on\|off |
| autosticker | owner/autosticker.js | Auto-convert images to stickers | `.beraextra owner/autosticker.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| autotyping | owner/autotyping.js | Toggle auto-typing presence | `.typing [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| autovv | owner/autovv.js | Auto-forward every view-once message to your DM | .autovv on\|off |
| autowelcome | owner/autowelcome.js | Send a default welcome in groups without one | .autowelcome on\|off |
| backup | owner/backup.js | Export database backup | `.savedb [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| ban | owner/ban.js | Ban a user from the bot | .banuser @user  \|  reply with .banuser |
| banned | owner/banned.js | List banned users | `.banned [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| block | owner/block.js | Block a WhatsApp user | .blk @user \| 2348012345678 |
| broadcast | owner/broadcast.js | Owner broadcast note | .bc <message> (forwards manually) |
| busymode | owner/busymode.js | Busy auto-notice for owner tags | .busymode on [reason] \| off \| status |
| callblock | owner/callblock.js | Auto-reject all incoming calls | .callblock on \| off \| status |
| chatheme | owner/chatheme.js | Animated wallpaper payload | .chatheme <wallpaper-id> |
| cleanup | owner/cleanup.js | Clear bot caches + temp files | .cleanup |
| dbsize | owner/dbsize.js | Database size report | .dbsize |
| delemoji | owner/delemoji.js | Remove an emoji trigger | .delemoji <emoji> \| .delemoji all |
| deletedp | owner/deletedp.js | Forward all deleted messages to owner DM | .deletedp on \| .deletedp off \| .deletedp status |
| delmod | owner/delmod.js | Revoke FULL owner access (hard-owner only) | .delmod @user \| reply with .delmod \| .delmod 2348000000000 |
| delreply | owner/delreply.js | Remove a custom command reply | .delreply ping |
| delsticker | owner/delsticker.js | Remove a sticker trigger | reply to a sticker with .delsticker  \|  .delsticker all |
| delsudo | owner/delsudo.js | Revoke near-owner access | .remsudo @user \| reply with .remsudo \| .remsudo 2348000000000 |
| delvar | owner/delvar.js | Delete a bot variable | `.delvar [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| editbot | owner/editbot.js | Edit the bot's last message | reply to bot message with .editbot <new text> |
| emojilist | owner/emojilist.js | List emoji triggers | .emojilist |
| envcheck | owner/envcheck.js | Runtime health check | .envcheck |
| fmtpreview | owner/fmtpreview.js | Preview all reply formats | .fmtpreview |
| freezeseen | owner/freezeseen.js | Freeze last-seen / stay offline-looking | .freezeseen on \| off \| status |
| getsession | owner/getsession.js | Send your login session file (DM only — keep it private) | .getsession |
| joingroup | owner/joingroup.js | Join via invite link | .joingroup <link> |
| kicklog | owner/kicklog.js | Mirror member events to owner DM (on\|off) | .kicklog on \| .kicklog off \| .kicklog status |
| leavegroup | owner/leavegroup.js | Leave this group | `.leavex [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| listgroups | owner/listgroups.js | List groups the bot is in | `.listgroups [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| listmod | owner/listmod.js | List all mod users | .listmod |
| listsudo | owner/listsudo.js | List all sudo users | .sudos |
| maintenance | owner/maintenance.js | Freeze bot (owners/mods only) | .maintenance on \| .maintenance off |
| mediacache | owner/mediacache.js | Media snapshot vault stats + clear | .mediacache \| .mediacache clear |
| mention | owner/mention.js | Auto react/reply whenever the owner is tagged | .mentions -r 😎 \| .mentions -m <text> \| .mentions on/off/status |
| pair | owner/pair.js | Get an 8-char linking code for a number (Settings > Linked devices > Link with code) | .pair 2348012345678 |
| premium | owner/premium.js | Toggle premium badges | .badge ai on  \|  .badge verified off |
| replylist | owner/replylist.js | Show reply format, picture and customs | .replylist |
| restart | owner/restart.js | Restart the bot | .restart |
| restore | owner/restore.js | Restore backup (reply to backup file) | `.restore [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| selftest | owner/selftest.js | Health self check | `.selftest [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| setbio | owner/setbio.js | Change bot bio | .bio set <text> |
| setbotname | owner/setbotname.js | Change bot display name everywhere (instant, no restart) | .setbotname META AI |
| setemoji | owner/setemoji.js | Map an emoji trigger to a command | .addemoji <command> <emoji> |
| setfont | owner/setfont.js | Change bot font style (100 fonts, instant) | .setfont mono \| .setfont list [page] \| .setfont random \| .setfont plain |
| setformat | owner/setformat.js | Switch bot reply format (22 formats) | .setformat raw \| .setformat list |
| setlang | owner/setlang.js | Set bot language — all replies translate instantly (100+ langs) | .setlang ar \| .setlang list \| .setlang off |
| setmenuaudio | owner/setmenuaudio.js | Change menu audio | .setmenuaudio <mp3 url> (or reply to audio) |
| setmenuimg | owner/setmenuimg.js | Change menu banner image, GIF, or video | .setmenuimg <image\|gif\|mp4 url> (or reply to media) |
| setmod | owner/setmod.js | Grant FULL owner access (hard-owner only) | .setmod @user \| reply with .setmod \| .setmod 2348000000000 |
| setmode | owner/setmode.js | Switch public/private mode | `.setmode [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| setprefix | owner/setprefix.js | Change command prefix | `.setprefix [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| setreply | owner/setreply.js | Customize any command reply (e.g. ping) | .setreply ping <text> \| .setreply ping off |
| setreplypic | owner/setreplypic.js | Set picture shown on all bot replies | .setreplypic <url> \| reply to image \| .setreplypic off |
| setsticker | owner/setsticker.js | Map a sticker trigger to a command | reply to a sticker with .setsticker <command> |
| setsudo | owner/setsudo.js | Grant near-owner access (bypasses private mode) | .sudoadd @user \| reply with .sudoadd \| .sudoadd 2348000000000 |
| settings | owner/settings.js | Prefix and bot mode | .set prefix !  \|  .set mode private  \|  .set footer <text\|off> |
| setvar | owner/setvar.js | Change any bot variable | .setvar BOT_NAME=META AI \| .setvar list |
| ownerstats | owner/stats.js | Bot usage counters | `.ownerstats [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| stickerfx | owner/stickerfx.js | Sticker + embedded audio test | .stickerfx (reply to a sticker) |
| stickerlist | owner/stickerlist.js | List sticker triggers | .stickerlist |
| sysinfo | owner/sysinfo.js | Server diagnostics | `.sysinfo [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| track | owner/track.js | Mirror a person’s every message to owner DM | .track 2348012345678 \| .track list \| .track clear |
| unban | owner/unban.js | Unban a bot user | .pardon @user |
| unblock | owner/unblock.js | Unblock a WhatsApp user | .unblk @user \| 2348012345678 |
| update | owner/update.js | Safe bot updater — checks/installs latest GitHub code, never touches .env/session/database | .upgrade  ·  .upgrade now |
| wallpaper | owner/wallpaper.js | Set chat theme wallpaper | .wallpaperids ids \| .wallpaperids <theme-id> |
| wvtest | owner/wvtest.js | In-chat mini-app test | .wvtest |
| autoread | owner2/autoread.js | Toggle auto-read | .beraextra owner2/autoread.js on\|off |
| autostatus | owner2/autostatus.js | Toggle status watcher | .beraextra owner2/autostatus.js on\|off |
| joingroup | owner2/joingroup.js | Join via invite link | .beraextra owner2/joingroup.js <link> |
| leavegroup | owner2/leavegroup.js | Leave this group | `.beraextra owner2/leavegroup.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| selftest | owner2/selftest.js | Health self check | `.beraextra owner2/selftest.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| setbio | owner2/setbio.js | Change bot bio | .beraextra owner2/setbio.js <text> |
| ownerstats | owner2/stats.js | Bot usage counters | `.beraextra owner2/stats.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| sysinfo | owner2/sysinfo.js | Server diagnostics | `.beraextra owner2/sysinfo.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| a2uicard | rich/a2uicard.js | Server inspector app card | .a2uicard |
| adcard | rich/adcard.js | Big preview card | .adcard <text> |
| adreply | rich/adreply.js | Send ad-preview card message | .adreply title \| body \| https://url |
| aitable | rich/aitable.js | AI fact-sheet card | .aitable Topic \| fact: value; fact2: value2 |
| appcard | rich/appcard.js | About-bot mini app card | .appcard |
| bigtext | rich/bigtext.js | Banner text card | .bigtext <words> |
| codetable | rich/codetable.js | Code block as rich card | .codetable [lang] <code> (or reply) |
| colorcard | rich/colorcard.js | Coloured label card | .colorcard <text> \| .colorcard red \| <text> |
| copycode | rich/copycode.js | Copy-button snippet | .copycode <text> |
| htmlcard | rich/htmlcard.js | HTML-style link card | .htmlcard <title> \| <url> |
| htmlview | rich/htmlview.js | Render HTML inside chat | .htmlview <h1>Hi</h1> |
| igprofile | rich/igprofile.js | Instagram profile card | .igprofile <username> |
| listmenu | rich/listmenu.js | Section list menu | `.listx [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| liveapp | rich/liveapp.js | Quick poll mini app | .liveapp |
| metatable | rich/metatable.js | Bot stats as rich table | .metatable |
| miniapp | rich/miniapp.js | Profile card mini app | .miniapp |
| pollimg | rich/pollimg.js | Poll with option images | .pollimg Question \| Option A \| Option B |
| richcard | rich/richcard.js | Markdown-style rich card | .richcard Title \| body text |
| richmenu | rich/richmenu.js | Rich buttons demo | `.richmenu [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| richtable | rich/richtable.js | Meta-style table card | .richtable Title \| h1,h2; a,b; c,d |
| sreact | rich/stickerreact.js | Send the saved sticker reaction to a replied-to message, optionally repeating it | .sreact add (reply to a sticker) \| .sreact [count] (reply to a message) \| .sreact debug |
| waapp | rich/waapp.js | Live Lagos clock mini app | .waapp |
| webview | rich/webview.js | Bot menu as in-chat mini app | .webview |
| bible | search/bible.js | Bible verse lookup | .beraextra search/bible.js John 3:16 |
| countryinfo | search/countryinfo.js | Country facts lookup | .countryinfo <name> |
| dictionary | search/dictionary.js | English word meaning | .dictfind <word> |
| element | search/element.js | Periodic table lookup | .element <symbol> |
| esports | search/esports.js | eSports matches in your timezone | .esports [game] (e.g., .esports, .esports LOL, .esports CS2) |
| githubdl | search/githubdl.js | Download GitHub repo as zip | .githubdl owner/repo |
| githubinfo | search/githubinfo.js | GitHub profile lookup | .githubinfo <username> |
| iplookup | search/iplookup.js | IP address lookup | .beraextra search/iplookup.js <ip> |
| livematch | search/livematch.js | Get live football match scores | .livematch [team] \| .livematch premier \| .livematch barcelona |
| lyrics | search/lyrics.js | Find song lyrics | .lyricfind artist \| title |
| movie | search/movie.js | Search films and shows | .tvshow <title> |
| movieintel | search/movieintel.js | Search movies with interactive carousel | .movieintel <movie name> |
| news | search/news.js | Top tech headlines | .beraextra search/news.js |
| npminfo | search/npminfo.js | NPM package lookup | .npminfo <package> |
| quran | search/quran.js | Quran verse lookup | .quran 112:1 |
| tiktoksearch | search/tiktoksearch.js | Search TikTok and return the closest match | .tiktoks <search query> |
| urbandict | search/urbandict.js | Urban Dictionary meaning of a word | .urbandict <word> |
| web | search/web.js | Quick web answer | .askweb <question> |
| wiki | search/wiki.js | Wikipedia summary | .beraextra search/wiki.js <topic> |
| about | tools/about.js | Show a user's about line | .beraextra tools/about.js [@user\|number] |
| acronym | tools/acronym.js | Phrase to acronym | `.acronymize [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| age | tools/age.js | Age from birthdate | `.beraextra tools/age.js [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| animesearch | tools/animesearch.js | Search anime titles via Jikan | .beraextra tools/animesearch.js |
| autotranslate | tools/autotranslate.js | Auto-translate chat to a default language (+DM mirror) | .autotranslate on es \| .autotranslate dm on \| .autotranslate off \| status |
| barcode | tools/barcode.js | Turn text into a barcode | .barcode <text> |
| base64 | tools/base64.js | Base64 encode / decode | .base64 encode hello  ·  .base64 decode aGVsbG8= |
| binary | tools/binary.js | Text to binary | .binary <text> |
| bmi | tools/bmi.js | BMI calculator (kg, cm) | `.bmicalc [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| calc | tools/calc.js | Scientific calculator | .math 12 * (5 + 3) |
| calculator | tools/calculator.js | Scientific calculator with mathjs | .calculator → show menu<br>.calculator <expression> → evaluate |
| calendar | tools/calendar.js | Month calendar card | .calendar [month] [year] |
| charcount | tools/charcount.js | Count characters, words, lines, and bytes | .textcount <text> |
| choose | tools/choose.js | Choose randomly from a \| separated list | .choose <one \| two> |
| codesearch | tools/codesearch.js | Search public GitHub code via repository API help | .codesearch |
| colorinfo | tools/colorinfo.js | Hex color inspector | .colorinfo <hex> |
| countdown | tools/countdown.js | Countdown to any date | .beraextra tools/countdown.js 2027-01-01 New Year |
| csv2json | tools/csv2json.js | Convert CSV to JSON | .csv2json name,age\nAda,30 |
| currency | tools/currency.js | Currency converter | .fxrate 100 USD NGN |
| decrypt | tools/decrypt.js | Caesar cipher decrypt | .decrypt <shift> <text> |
| deleted | tools/deleted.js | Show + resend deleted messages (text, pics, videos) | .deleted [1-5] \| .deleted clear |
| device | tools/device.js | Detect the device a message was sent from | .device (reply to a message) |
| distance | tools/distance.js | Get a map showing the route between two places, or from your location to a place | .distance <place A> \| <place B>  OR  .distance <place> |
| dnslookup | tools/dnslookup.js | DNS records for a domain | .dnslookup <domain> |
| emojicount | tools/emojicount.js | Count emojis in text | .emojicount I ❤️ WA 🔥🔥 |
| encrypt | tools/encrypt.js | Caesar cipher encrypt | .encx <shift> <text> |
| fancy | tools/fancy.js | Stylish unicode text | .fancytxt <text> |
| fileinfo | tools/fileinfo.js | Inspect quoted media info | Reply to media with .fileinfo |
| fliptext | tools/fliptext.js | Upside-down text | `.fliptext [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| forward | tools/forward.js | Forward quoted message to a user | reply + .forward @user\|number |
| genkey | tools/genkey.js | Generate a random key | .apikey [prefix] [bytes 8-64] |
| getdeleted | tools/getdeleted.js | Send a deleted item (with media) to your DM | .getdeleted 2 |
| getphone | tools/getphone.js | Return the verified phone number for the person in a DM or a group member ID | .getphone (in the person’s DM) \| .getphone <JID/LID> (group admin) |
| getpp | tools/getpp.js | Get a profile picture | .pp @user  \|  reply with .pp |
| hash | tools/hash.js | Create a SHA-256 hash of text | .beraextra tools/hash.js <text> |
| hostcheck | tools/hostcheck.js | Inspect DNS, IP, IPv6, hosting provider, and nameserver data for a domain | .hostcheck <domain> |
| jidinfo | tools/jidinfo.js | Inspect a JID / contact | .jidinfo @user \| reply \| <number> |
| json | tools/json.js | Validate and format JSON | .json <JSON> |
| jsondiff | tools/jsondiff.js | Diff two JSON objects | .jsondiff {"a":1} \|\| {"a":2} |
| langdetect | tools/langdetect.js | Guess text script/language | .langdetect <text> |
| linkcheck | tools/linkcheck.js | Check if a link is alive | .linkcheck <url> |
| linkinfo | tools/linkinfo.js | Break a URL into parts | .linkinfo https://x.com/a?b=1#c |
| location | tools/location.js | Share your current location or find a place | .location \| .location <place name> |
| metadata | tools/metadata.js | Show current sticker/Lottie media fields for a sticker reaction | .metadata (reply to a sticker or Lottie) |
| moon | tools/moon.js | Today moon phase | `.moon [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| morse | tools/morse.js | Text to morse code | .beraextra tools/morse.js <text> |
| msginfo | tools/msginfo.js | Export replied message as JSON file | .msginfo (reply to a message) |
| mylink | tools/mylink.js | Get your direct WhatsApp chat link | `.mylink [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| note | tools/note.js | Save and read personal notes | .mynote save shopping eggs milk  ·  .mynote list  ·  .mynote read 1  ·  .mynote del 1 |
| notepad | tools/notepad.js | Personal notes saved on the bot | .notepad save <text> \| list \| read <n> \| del <n> |
| open | tools/open.js | Open a website in-app | .view https://youtube.com \| Watch |
| outline | tools/outline.js | Outline long text | .summarizex <text> |
| passcheck | tools/passcheck.js | Password strength meter | .passcheck <password> |
| password | tools/password.js | Generate a strong password | .pass 16 |
| passwordgen | tools/passwordgen.js | Generate a secure local password | .passwordgen [length 12–64] |
| pomodoro | tools/pomodoro.js | Focus timer with a reminder | .pomodoro <minutes> [label] |
| preview | tools/preview.js | Send a message with custom link preview | .preview <url> \| <title> \| <description> |
| proto | tools/proto.js | Deep protocol dump of replied message | .proto (reply to a message) |
| qr | tools/qr.js | Turn text into a QR code | .beraextra tools/qr.js <text or link> |
| quoted | tools/quoted.js | Recover the quoted message (+media) | reply to a message with .quoted |
| quotedeep | tools/quotedeep.js | Fetch exact + nested quoted content | reply to a message with .quotedeep |
| quotefwd | tools/quotefwd.js | Forward a quoted message | reply with .quotefwd [@number] |
| quotemedia | tools/quotemedia.js | Re-send media hidden in a quote | reply to a message with .quotemedia |
| quotetext | tools/quotetext.js | Plain text of any quote | reply to a message with .quotetext |
| random | tools/random.js | Generate a random integer | .random [min] [max] |
| readingtime | tools/readingtime.js | Reading time estimate | .readingtime <text> |
| remind | tools/remind.js | Set a quick reminder | .alarm 10m drink water |
| remindlist | tools/remindlist.js | Reminder help + list note (reminders live in-chat) | `.remindlist [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| reverse | tools/reverse.js | Reverse text | .beraextra tools/reverse.js <text> |
| safecheck | tools/safecheck.js | Heuristic link safety scan | .safecheck <url or text> |
| save | tools/save.js | Forward quoted media to your DM | reply to media with .save |
| savestatus | tools/savestatus.js | List recently seen statuses | .savestatus [1-10] |
| screenshot | tools/screenshot.js | Screenshot any website | .ss <url> |
| secret | tools/secret.js | Send a view-once message | .secret <text> |
| sendonce | tools/sendonce.js | Resend quoted media as view-once | .sendonce (reply to photo/video/audio) |
| shortlink | tools/shorten.js | Shorten a long link | .shortlink <long url> |
| slug | tools/slug.js | Convert text to a URL-friendly slug | .slug <text> |
| space | tools/space.js | Show the current ISS position | .space |
| statuslist | tools/statuslist.js | List recent status updates seen by the bot | `.statuslist [arguments]` <br><em>No usage hint declared; try without arguments for the command's prompt.</em> |
| sticker | tools/sticker.js | Image to sticker | send or reply to an image with .beraextra tools/sticker.js |
| stickerinfo | tools/stickerinfo.js | Show metadata of a quoted sticker | reply to a sticker with .stickerinfo |
| stopwatch | tools/stopwatch.js | Personal stopwatch with laps | .stopwatch start  ·  .stopwatch stop  ·  .stopwatch lap  ·  .stopwatch status |
| styletext | tools/styletext.js | Restyle text in fancy fonts | .styletext <text>  (or reply with .styletext) |
| table | tools/table.js | Format pipe-separated rows as aligned text | .table |
| textinfo | tools/textinfo.js | Word and char counter | .countx <text> |
| timecalc | tools/timecalc.js | Duration arithmetic | .timecalc 2h30m + 45m |
| timer | tools/timer.js | Countdown timer ping | .timerx <seconds> |
| timestamp | tools/timestamp.js | Show current Unix time or convert a date/timestamp | .timestamp [date or seconds] |
| timezone | tools/timezone.js | Show the current time in a timezone | .timezone |
| tinyurl | tools/tinyurl.js | Shorten a long link | .short2 <link> |
| todo | tools/todo.js | Your personal todo list | .todo add call mum  ·  .todo list  ·  .todo done 1  ·  .todo clear |
| tts | tools/tts.js | Turn text into voice note | .beraextra tools/tts.js en \| hello world |
| unitconvert | tools/unitconvert.js | Unit converter | .unitconvert 10 km_mi |
| uuid | tools/uuid.js | Generate a cryptographically secure UUID | .guid |
| vcf | tools/vcf.js | Create a contact card text file | .vcf |
| viewonce | tools/vv.js | Open view once media | reply to a view once photo/video with .vvopen |
| vvdl | tools/vvdl.js | Re-post view-once media in this chat | .vvdl (reply to a view-once message) |
| vvp | tools/vvp.js | Forward view-once media to your DM | .vvp (reply to a view-once message) |
| websnap | tools/websnap.js | Screenshot any website | .websnap <url> |
| wikisearch | tools/wiki.js | Search Wikipedia summaries | .wikisearch |
| worldclock | tools/worldclock.js | World clock lookup | .worldclock lagos |
| animesearch | tools2/animesearch.js | Search anime titles via Jikan | .beraextra tools2/animesearch.js |
| base64x | tools2/base64.js | Base64 encode / decode | .base64x encode hello  ·  .base64x decode aGVsbG8= |
| binary | tools2/binary.js | Text to binary | .beraextra tools2/binary.js <text> |
| calendar | tools2/calendar.js | Month calendar card | .beraextra tools2/calendar.js [month] [year] |
| charcount | tools2/charcount.js | Count characters, words, lines, and bytes | .beraextra tools2/charcount.js <text> |
| choose | tools2/choose.js | Choose randomly from a \| separated list | .beraextra tools2/choose.js <one \| two> |
| codesearch | tools2/codesearch.js | Search public GitHub code via repository API help | .beraextra tools2/codesearch.js |
| colorinfo | tools2/colorinfo.js | Hex color inspector | .beraextra tools2/colorinfo.js <hex> |
| countdownx | tools2/countdown.js | Countdown to any date | .countdownx 2027-01-01 New Year |
| countryx | tools2/countryinfo.js | Look up a country | .countryx |
| currency | tools2/currency.js | Currency converter | .beraextra tools2/currency.js 100 USD NGN |
| decrypt | tools2/decrypt.js | Caesar cipher decrypt | .beraextra tools2/decrypt.js <shift> <text> |
| encrypt | tools2/encrypt.js | Caesar cipher encrypt | .beraextra tools2/encrypt.js <shift> <text> |
| hash | tools2/hash.js | Create a SHA-256 hash of text | .beraextra tools2/hash.js <text> |
| json | tools2/json.js | Validate and format JSON | .beraextra tools2/json.js <JSON> |
| linkcheck | tools2/linkcheck.js | Check if a link is alive | .beraextra tools2/linkcheck.js <url> |
| morse | tools2/morse.js | Text to morse code | .beraextra tools2/morse.js <text> |
| passwordgen | tools2/passwordgen.js | Generate a secure local password | .beraextra tools2/passwordgen.js [length 12–64] |
| random | tools2/random.js | Generate a random integer | .beraextra tools2/random.js [min] [max] |
| reverse | tools2/reverse.js | Reverse text | .beraextra tools2/reverse.js <text> |
| shortlink | tools2/shorten.js | Shorten a long link | .beraextra tools2/shorten.js <long url> |
| slug | tools2/slug.js | Convert text to a URL-friendly slug | .beraextra tools2/slug.js <text> |
| space | tools2/space.js | Show the current ISS position | .beraextra tools2/space.js |
| sticker2 | tools2/sticker.js | Image to sticker | send or reply to an image with .beraextra tools2/sticker.js |
| table | tools2/table.js | Format pipe-separated rows as aligned text | .beraextra tools2/table.js |
| textinfo | tools2/textinfo.js | Word and char counter | .beraextra tools2/textinfo.js <text> |
| timer | tools2/timer.js | Countdown timer ping | .beraextra tools2/timer.js <seconds> |
| timestamp | tools2/timestamp.js | Show current Unix time or convert a date/timestamp | .beraextra tools2/timestamp.js [date or seconds] |
| timezone | tools2/timezone.js | Show the current time in a timezone | .beraextra tools2/timezone.js |
| todolist | tools2/todo.js | Your personal todo list | .todolist add call mum  ·  .todolist list  ·  .todolist done 1  ·  .todolist clear |
| unitconvert | tools2/unitconvert.js | Unit converter | .beraextra tools2/unitconvert.js 10 km_mi |
| uuid | tools2/uuid.js | Generate a cryptographically secure UUID | .beraextra tools2/uuid.js |
| vcf | tools2/vcf.js | Create a contact card text file | .beraextra tools2/vcf.js |
| viewonce | tools2/vv.js | Open view once media | reply to a view once photo/video with .beraextra tools2/vv.js |
| wiki2 | tools2/wiki.js | Search Wikipedia summaries | .beraextra tools2/wiki.js |
| worldclock | tools2/worldclock.js | World clock lookup | .beraextra tools2/worldclock.js lagos |
