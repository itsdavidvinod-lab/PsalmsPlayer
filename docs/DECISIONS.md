# Decisions and open questions

## Chosen
- Stack: Next.js (TypeScript) for the website and admin, wrapped with Capacitor for the Android app, then iOS.
- Backend: Supabase (Postgres, login, file storage, row-level security).
- Login: Google only (the Email provider is switched off in the hosted Supabase project; that setting is the real enforcement). Any Google account works; there is no restriction to gmail.com. Phone OTP later if needed.
- Build order: website for users and admin first, then the Android APK, then iOS.
- Website: Next.js 15 (App Router) with the Supabase browser/server clients. Every page except login, the sign-in callback and the public `/get` landing page requires a login (a choice made while building; say if browsing should be public).
- Hidden songs and unknown addresses return the same "not available" page, so nobody can tell that a hidden song exists.
- A share "app link" goes to `/get`, which for now points people to the web because the apps are not published.

## Player and media (decided with the owner)
- The product centres on lyrics and the music player. The look follows Spotify: dark, a tab bar on phones, a sidebar on wide screens, and a mini player that stays on every page. Tapping the mini player opens the song page, which holds the lyrics.
- Admins upload the audio file themselves (any common format: MP3, M4A/AAC, WAV, OGG/Opus, FLAC, WebM; up to 100 MB each). Files are streamed to signed-in users through one-hour links, and only while the song is live.
- YouTube is a link out only: a "Watch on YouTube" link in the song page and the mini player opens YouTube (the YouTube app on a phone). Nothing from YouTube is embedded, and our audio pauses when the link is tapped.
- Dark theme only for now; all colours are variables, so a light theme is a second block of values.
- Songs without an audio file are lyrics-only: they show a "Lyrics" tag and no play button. The same happens when the artist's agreement does not allow audio hosting (a separate right from lyrics, chords, translations and video): the file stays uploaded but is not served until the flag is ticked.

## Library and Stage mode (decided while building)
- A list is a playlist (for listening) or a setlist (for a service, with an optional service date and a key per song). Limits: 100 lists per person, 200 songs per list.
- A song that becomes unavailable (hidden, agreement ended) stays in the list as an empty slot, so positions never shift. The slot shows no title.
- A setlist's key per song changes only that setlist; the song itself is never changed. In Stage mode the key can be nudged up or down by up to six semitones for the day, and that nudge is not saved.
- Stage mode is a separate full-screen view with no player bar: opening it from the app stops any music that was playing. Text size is remembered on the device only.
- Songs can also be opened in Stage mode one at a time from their page.

## Product rules
- Catalogue is curated by the owner. Songs and lyrics are uploaded for artists under a signed agreement. Uploading is free of cost.
- Agreements are accepted only from the official email (never WhatsApp or chat). In the database a verified agreement needs a document reference and a verifier.
- A song is hidden until every writer and owner has consented and the agreement and consent are in date. An artist whose agreement has expired shows as Unavailable.
- Expiry dates, end times and prices are visible to admins only. Users see posters and songs, never when they end or what was paid.
- Promotion and song requests arrive by WhatsApp or email and are logged by an admin. Prices are agreed in the chat and recorded in the admin ledger only.
- Buyers pay for eligibility to be shown, not views. If it cannot be shown, the full amount is refunded.
- Region and language live in Settings. Posters are shown by region and language: both, either, or everyone.
- Monthly listeners = distinct signed-in people (admins excluded) who played a song by the artist, audibly, for at least 30 seconds in the last 30 days. Hidden below 10. Trending uses the same listening time over 7 days. Opening lyrics does not count.
- How listening time is kept honest: the player reports play time from the audio element every 15 s; the database credits only what the clock allows (shared across all of a person's sessions, one report at a time, 20 s per report, 8 h per day, 120 new sessions per hour). Muted, paused or buffering audio does not count.

## Open
- Tamil and other Indian-language lyrics use the device's own font for now. Check them on real phones and add a web font if any look wrong.
- Listening time is reported by the browser, so someone who writes a script that waits in real time on many real accounts can still inflate a count. Email confirmation and a CAPTCHA on sign-up (Supabase settings) are the defence; the choice is still open. Hosted audio with signed streaming would make it much harder, at a hosting cost.
- The Android app plays the hosted audio inside a WebView; whether it keeps playing, and keeps reporting listening time, with the screen off must be tested on a device. If timers stop with the screen off, listening time is under-counted (safe direction), and a native audio plugin may be needed.
- Sign-up sends a confirmation email on the hosted project (turn it on in Supabase) but not on the local stack. Pick the production setting before launch.
- What is refunded when a poster is taken down after part of its run (for example day 12 of 15).
- How a requester is verified before a poster or song goes live (the database only stores that it was done).
- How an artist's identity is checked independently of the channel their request came in on.
- Who watches the expiry list. The database exposes `v_expiry_watch`; nothing sends reminders yet.
- Whether unavailable setlist slots should keep the song title. Today they show position only.
- Playlist versus setlist: kept as one list type with a kind flag. Confirm that is what you want.
- Equalizer: possible now that the app hosts the audio. Not built.
- Offline Stage mode in the Android app: needs a local copy of the user's setlist lyrics and a purge when a song is hidden. Today Stage mode needs a connection.
- Sharing a setlist with a band (a read-only link, or a copy for another person) is not built; lists are private to their owner.
- Tax and invoicing for promotion income, and a lawyer's review of the agreement.
