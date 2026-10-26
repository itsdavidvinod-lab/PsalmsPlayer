# Decisions and open questions

## Chosen
- Stack: Next.js (TypeScript) for the website and admin, wrapped with Capacitor for the Android app, then iOS.
- Backend: Supabase (Postgres, login, file storage, row-level security).
- Login at launch: email and Google. Phone OTP later if needed.
- Build order: website for users and admin first, then the Android APK, then iOS.
- Website: Next.js 15 (App Router) with the Supabase browser/server clients. Every page except login, the sign-in callback and the public `/get` landing page requires a login (a choice made while building; say if browsing should be public).
- Hidden songs and unknown addresses return the same "not available" page, so nobody can tell that a hidden song exists.
- A share "app link" goes to `/get`, which for now points people to the web because the apps are not published.

## Product rules
- Catalogue is curated by the owner. Songs and lyrics are uploaded for artists under a signed agreement. Uploading is free of cost.
- Agreements are accepted only from the official email (never WhatsApp or chat). In the database a verified agreement needs a document reference and a verifier.
- A song is hidden until every writer and owner has consented and the agreement and consent are in date. An artist whose agreement has expired shows as Unavailable.
- Expiry dates, end times and prices are visible to admins only. Users see posters and songs, never when they end or what was paid.
- Promotion and song requests arrive by WhatsApp or email and are logged by an admin. Prices are agreed in the chat and recorded in the admin ledger only.
- Buyers pay for eligibility to be shown, not views. If it cannot be shown, the full amount is refunded.
- Region and language live in Settings. Posters are shown by region and language: both, either, or everyone.
- Monthly listeners = distinct signed-in people (admins excluded) who played a song by the artist, audibly, for at least 30 seconds in the last 30 days. Hidden below 10. Trending uses the same listening time over 7 days. Opening lyrics does not count.
- How listening time is kept honest: the song page reports play time from the YouTube player every 15 s; the database credits only what the clock allows (shared across all of a person's sessions, one report at a time, 20 s per report, 8 h per day, 120 new sessions per hour). Muted or paused video does not count.

## Open
- Tamil and other Indian-language lyrics use the device's own font for now. Check them on real phones and add a web font if any look wrong.
- Listening time is reported by the browser, so someone who writes a script that waits in real time on many real accounts can still inflate a count. Email confirmation and a CAPTCHA on sign-up (Supabase settings) are the defence; the choice is still open. Hosted audio with signed streaming would make it much harder, at a hosting cost.
- The Android app plays YouTube inside a WebView; whether the player reports state correctly there, and whether it keeps playing with the screen off, must be tested on a device.
- Sign-up sends a confirmation email on the hosted project (turn it on in Supabase) but not on the local stack. Pick the production setting before launch.
- What is refunded when a poster is taken down after part of its run (for example day 12 of 15).
- How a requester is verified before a poster or song goes live (the database only stores that it was done).
- How an artist's identity is checked independently of the channel their request came in on.
- Who watches the expiry list. The database exposes `v_expiry_watch`; nothing sends reminders yet.
- Whether unavailable setlist slots should keep the song title. Today they show position only.
- Playlist versus setlist: kept as one list type with a kind flag. Confirm that is what you want.
- Equalizer: only possible for audio the app hosts. YouTube embeds cannot be equalized.
- Offline Stage mode in the Android app: needs a local copy of the user's setlist lyrics and a purge when a song is hidden.
- Tax and invoicing for promotion income, and a lawyer's review of the agreement.
