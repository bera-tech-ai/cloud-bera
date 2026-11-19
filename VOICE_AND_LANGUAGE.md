# WhatsApp language and voice replies

Bera's conversational reply prompt now recognizes English, Swahili, Kenyan Sheng, and code-switching. By default it mirrors the language mix in the incoming message and avoids forcing slang into formal conversations.

## Commands

- `.language auto` — mirror the conversation (default).
- `.language en` — prefer conversational English.
- `.language sw` — prefer Swahili.
- `.language sheng` — prefer a natural Kenyan Sheng / English mix.
- `.voice auto on` — opt in to spoken private-chat ChatBera replies. Text remains enabled too.
- `.voice auto off` — turn off automatic spoken replies (default).
- `.voice <text>` or `.voice en|sw|sheng <text>` — send a one-off WhatsApp voice note.

Preferences are stored per WhatsApp sender. Automatic spoken replies are deliberately disabled by default and are suppressed in groups. They apply to direct AI agent answers and ChatBera's passive conversational replies when ChatBera is enabled; they do not cause every command response or project-agent message to become audio. Incoming voice notes continue to be transcribed only when explicitly requested, for example by quoting the note and using `.transcribe`.

## Runtime and limitations

The bot uses the existing `google-tts-api` dependency to obtain speech audio and FFmpeg to convert it into Ogg/Opus for WhatsApp voice-note playback. The bot host must have the dependency installed and an `ffmpeg` binary available. Text sent for speech is transmitted to the configured TTS provider; automatic speech is opt-in, and `.voice auto off` disables it.

Sheng does not have a dedicated standard TTS language/voice in this implementation. When Sheng is selected or detected, Bera uses the closest available Swahili speech voice; English words in a code-switched reply may not sound native. Automatic voice output is skipped for replies longer than 1,200 characters. If speech generation fails, the text reply is still delivered.

ChatBera style matching uses examples only for conversational tone. It should not claim to be the real person represented by those examples, and sensitive-looking credentials, links, and phone numbers are filtered from the examples used in prompts.
