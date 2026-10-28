# Decisions and open questions

## Chosen
- Stack: Next.js (TypeScript) for the website and admin, wrapped with Capacitor for the Android app, then iOS.
- Backend: Supabase (Postgres, login, file storage, row-level security).
- Login: Google only (the Email provider is switched off in the hosted Supabase project; that setting is the real enforcement). Any Google account works; there is no restriction to gmail.com. Phone OTP later if needed.
- Build order: website for users and admin first, then the Android APK, then iOS.
- Website: Next.js 15 (App Router) with the Supabase browser/server clients. Every page except login, the sign-in callback, the public `/get` landing page and the About, Privacy and Terms pages requires a login (a choice made while building; say if browsing should be public).
- The live site is https://psalmsplayer.com on Vercel, with the Supabase project `psalmsplayer-live`. Share links use `NEXT_PUBLIC_SITE_URL`. Details are in SETUP.md, "The live site".
- Hidden songs and unknown addresses return the same "not available" page, so nobody can tell that a hidden song exists.
- A share "app link" goes to `/get`, which for now points people to the web because the apps are not published.

## Player and media (decided with the owner)
- The product centres on lyrics and the music player. The look follows Spotify: dark, a tab bar on phones, a sidebar on wide screens, and a mini player that stays on every page. Tapping the mini player opens the song page, which holds the lyrics.
- Admins upload the audio file themselves. The admin site accepts **MP3 and M4A/AAC only, up to 50 MB** (the free Supabase plan refuses larger files; other formats must be converted first because MP3 and AAC play on every phone and browser we target). The storage bucket itself still permits other formats and 100 MB, so the limit is one number in `src/lib/audio-file.ts` when a paid plan allows more. Files are streamed to signed-in users through one-hour links, and only while the song is live.
- YouTube is a link out only: a "Watch on YouTube" link in the song page and the mini player opens YouTube (the YouTube app on a phone). Nothing from YouTube is embedded, and our audio pauses when the link is tapped.
- Dark theme only for now; all colours are variables, so a light theme is a second block of values.
- Songs without an audio file are lyrics-only: they show a "Lyrics" tag and no play button. The same happens when the artist's agreement does not allow audio hosting (a separate right from lyrics, chords, translations and video): the file stays uploaded but is not served until the flag is ticked.

## Library and Stage mode (decided while building)
- A list is a playlist (for listening) or a setlist (for a service, with an optional service date and a key per song). Limits: 100 lists per person, 200 songs per list.
- A song that becomes unavailable (hidden, agreement ended) stays in the list as an empty slot, so positions never shift. The slot shows no title.
- A setlist's key per song changes only that setlist; the song itself is never changed. In Stage mode the key can be nudged up or down by up to six semitones for the day, and that nudge is not saved.
- Stage mode is a separate full-screen view with no player bar: opening it from the app stops any music that was playing. Text size is remembered on the device only.
- Songs can also be opened in Stage mode one at a time from their page.

## Admin site (decided while building)
- Admins only, signed in through the same Google login; anyone else gets the same "not available" page as for an address that does not exist. The page check is a convenience; the database refuses admin reads and writes to everyone else.
- A song's live or hidden state always comes from the database's own rule, and the song page says in words what is missing (no writer, consent missing, consent expired, agreement not in force, not published, taken down).
- Replacing a recording uploads the new file under a fresh name, points the song at it, and only then deletes the old file, so a failure never leaves a song without audio. Removing deletes the file too.
- Agreements are never deleted: a record of what was agreed stays, and "revoked" ends it (with a second confirmation, because the artist's songs vanish at once). Verifying records which admin did it and when, and going back from verified clears that. The "photo and bio" right and the territories list are recorded but not enforced by the site yet; the form says so.
- Money is typed in rupees and stored in paise. Poster windows are typed and shown in India time. A poster's event date ends it at the end of that day (India time) even if its paid period runs longer.
- A refunded or cancelled request, or one that loses its verified requester or recorded amount, switches its posters off in the database. Putting a request back never switches a poster back on: an admin approves it again.
- Codes in the Lists page (languages, regions, genres, occasions, moods) never change, because records point to them by code; names can change. A value that anything still uses cannot be deleted.
- A real project gets its starting lists from `supabase/reference.sql`, never from the seed.
- The admin site is web only, on a laptop first. It is never part of the Android or iOS app: the app loads only the listener routes, and the "Admin site" link is hidden there (to be built with the Android app). The admin pages still work on a phone browser: the menu becomes a scrolling row and inputs are 16 px so the phone does not zoom.
- Look of the admin site: a left menu with icons (Dashboard, Artists, Songs, Requests, Posters, Lists), a page header with a trail back to the list, cards on black, and tables for Artists, Songs, Posters and Requests. A table row opens its record anywhere you click; search and the "Show" filter only hide rows on the page and tell you "x of y". Songs and artists editors use a main column with the form and a side column with recording, agreements and links. The look follows the approved design boards, not pixel for pixel.

## The app's look and screens (decided while building, from the approved design)
- Black pages, grey (#141414) cards, one accent colour (#9FB1FF) for liked, shuffle and repeat switched on, and the song that is playing. Open Sans only. Sizes: page title 21, section heading 15, row title 13, small text 11 to 12, nothing below 11. Every tap target has a 44 x 44 area even where the visible shape is smaller.
- Three tabs (Home, Search, Library). Settings is behind the round picture at the top right; sign-out is under Settings, Account. The picture is the one from the person's Google account and cannot be changed in the app.
- A song opens full screen. A song with an audio file opens the player (lyrics and controls); a song without opens the lyrics page. The Lyrics icon on a row always opens the lyrics page and never starts music. Stage mode is a separate full-screen mode for singing from, opened from the ⋮ menu or from a list.
- One "Share link" per song: it shares the web link. The link goes through login and then to the song. The Android app will get its own link kind later.
- Search finds songs by title, artist and by genre, occasion or mood words, and artists by name; the filter sheet narrows by language, genre, occasion and mood (one value each). An artist who is not available can be found by name but shows only as "Unavailable".
- Search browsing shows who you follow (eight, with "See more" only when there are more than eight), or artists to follow when you follow nobody, then the three newest songs, then Explore tiles. "Latest releases" means newest in this app, not the date a song was recorded.
- Follow: any signed-in person can follow up to 500 artists, only available artists can be newly followed, a follow of an artist who later becomes unavailable stays (as a name only) and can be undone. Nobody can see who follows whom; the follow list is private to its owner.
- Library has All, Lists and Artists. Liked songs is pinned first in Lists. One list screen serves Liked songs, playlists and setlists: Find in list, Sort (list order, title, artist, newest first), filter chips from the languages and genres that occur in that list, Shuffle and Play. Editing (reorder, key per song for setlists, rename, date, delete) is behind Edit. A song unliked on the Liked screen stays on the screen until you leave it, so a mistaken tap is undone by tapping the heart again; there is no "Removed, Undo" bar yet.
- Pictures: an admin chooses a picture file in the admin forms (artist photo, album cover, song cover, poster). The browser shrinks it (800 px wide, posters 1400 px; WebP, or JPEG where the browser cannot write WebP), uploads it to the public `pictures` bucket under a random name, and puts its address in the field; the form's Save keeps it. Only admins can write to the bucket, nobody can list it, and files are limited to 2 MB and image types. A replaced or abandoned picture is not deleted from storage automatically (they are small; delete them in the Supabase dashboard if the 1 GB ever matters). Pasting a link still works, and a Drive link needs "Anyone with the link" sharing; uploads avoid that problem. Importing from a Drive link on the server was considered and left out: it needs the same sharing and Google can block server fetches.
- Older rule for pasted links: pictures can also come from links an admin pastes. A Google Drive share link (file/d/ID/view and the other usual forms) is turned into Drive's thumbnail address when shown; any other https link is used as it is. A picture that fails to load falls back to a coloured placeholder with the first letter (a poster shows its title on a plain background). A Drive file must be shared "Anyone with the link" (Viewer): a file shared only with its owner looks fine to the owner and broken to every listener, so each picture-link field in the admin site explains how to share it. A song shows its own cover link when it has one, otherwise the cover of its published album; a single with neither has the placeholder. Song rows show no language tag on the cover.
- Artist names are never cut off: on Home the chip grows to fit the name (up to 120px) and a longer name wraps onto more lines; in the Library grid and in artist lists the name wraps too.
- Home posters are pictures only. One with a YouTube link opens YouTube when tapped. The strip swipes, moves on every 5 seconds, goes back to the first after the last, and stops while it is being touched, hovered or focused, and for people who turned reduced motion on.
- Not built yet from the design (not drawn): the "Add songs" picker (the row opens Search), the artist ⋮ menu, "Removed, Undo" on Liked, Settings sub-pages beyond Profile, Language and region, Account and About.

## Product rules
- Catalogue is curated by the owner. Songs and lyrics are uploaded for artists under a signed agreement. Uploading is free of cost.
- Agreements are accepted only from the official email (never WhatsApp or chat). In the database a verified agreement needs a document reference and a verifier.
- A song is hidden until every writer and owner has consented and the agreement and consent are in date. An artist whose agreement has expired shows as Unavailable.
- Expiry dates, end times and prices are visible to admins only. Users see posters and songs, never when they end or what was paid.
- Promotion and song requests arrive by WhatsApp or email and are logged by an admin. Prices are agreed in the chat and recorded in the admin ledger only.
- Buyers pay for eligibility to be shown, not views. If it cannot be shown, the full amount is refunded.
- Region and language live in Settings. Posters are shown by region and language: both, either, or everyone.
- Monthly listeners = distinct signed-in people (admins excluded) who played a song by the artist, audibly, for at least 30 seconds in the last 30 days. The artist page shows the exact number to every signed-in person, however small (decided 2026-10-27; it used to be hidden below 10), next to the total likes on the artist's songs. The page asks for the number with p_min 0; the database function still defaults to 10 and returns nothing for an unavailable artist. Trending uses the same listening time over 7 days. Opening lyrics does not count.
- How listening time is kept honest: the player reports play time from the audio element every 15 s; the database credits only what the clock allows (shared across all of a person's sessions, one report at a time, 20 s per report, 8 h per day, 120 new sessions per hour). Muted, paused or buffering audio does not count.

## Open
- Admin two-factor sign-in. The admin account can do everything, so its protection matters. Options: (a) rely on Google 2-Step Verification on the admin's Google account (nothing to build, and it protects the whole Google login), or (b) also require an authenticator code in the app (more to build, and a lost phone can lock the admin out). Not built; (a) is the recommendation until there is more than one admin.
- The artist "photo and bio" right and the agreement territories are stored but not enforced.
- Whether a second admin is needed, and if so how one is invited (today the role is set in the SQL editor).
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
