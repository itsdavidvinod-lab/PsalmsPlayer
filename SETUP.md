# PsalmsPlayer: setup

Where the build stands: the database and its rules, the user website with the player layer, and the admin site. The user website has Google sign-in, a Spotify-style frame (tab bar on phones, sidebar on wide screens), a mini player that keeps playing across pages, hosted audio streaming, lyrics with transpose, a YouTube link-out, Home, Browse, Artist, Album, Settings, Library (liked songs, playlists, setlists with a key per song) and Stage mode (big text, key for the service, screen kept awake). The admin site (`/admin`, admins only) manages artists and albums, songs, credits and consent, lyrics with a live preview and format warnings, the YouTube link and its check, the recording (upload, preview, replace, remove), agreements (verify with proof, rights, revoke), the requests ledger, posters, and the lists everything is tagged with. The Android app and iOS are not built yet.

## What is in this folder

| Path | What it is | Checked |
|---|---|---|
| `supabase/migrations/0001..0014` | Tables, visibility rules, security, public API, listening time, hosted audio, audio rights, library rules, admin guards (a song's album belongs to its artist; key names), a request that ends stops its posters, reference-list guards (fixed codes, nothing in use is deleted), following artists (a private list, soft limit 500), song covers taken from the published album, a song's own cover link (wins over the album's) | Run on a real Supabase stack in CI, and on plain Postgres 16 |
| `supabase/seed.sql` | Fake development data (placeholder lyrics, a placeholder admin). Test projects only | Run on a real Supabase stack in CI |
| `supabase/reference.sql` | The starting lists (languages, regions, genres, occasions, moods) for a real project, with no catalogue data. Safe to run twice | Checked on an empty database, run twice, and compared with the seed's lists |
| `supabase/tests/` | 159 assertions and 99 must-fail checks (users cannot read agreements, prices, end dates or hidden songs, or make themselves admin; the admin rules hold) | Pass on both; deliberate breakages are caught |
| `src/lib/` | ChordPro parsing and transposing, YouTube link reading, share links, play queue, audio-link cache, listening-time reporter, Stage rules, and the admin rules (text and error wording, lyrics warnings, audio file rules, agreement form, requests and posters, lists) | 48 tests pass, strict TypeScript clean |
| `src/app/`, `src/components/` | The website: `/login`, `/get`, and inside the app frame `/` (Home), `/browse`, `/artist/[slug]`, `/album/[slug]`, `/song/[slug]`, `/library`, `/library/[id]`, `/settings`, and without the frame `/stage/setlist/[id]`, `/stage/song/[slug]`. The admin site: `/admin`, `/admin/artists`, `/admin/songs`, `/admin/requests`, `/admin/posters`, `/admin/lists` and their detail pages | Built and type-checked in CI; browser-tested (see below) |
| `e2e/` | Playwright tests that drive the built site and call the API against a real Supabase stack | Pass in CI |
| `.github/workflows/checks.yml` | Runs everything above on every push | |
| `docs/DECISIONS.md` | Rules you decided, and what is still open | |

What the browser tests cover: a visitor who is not signed in is sent to login; Home shows only live songs and only posters inside their window; Settings changes which posters appear; artist, album and Browse pages hide what must be hidden (unavailable artists show a name only, a listener count appears only from 10 people); a song shows lyrics, transposes, links out to YouTube, switches versions, and can be liked; real audio plays through the mini player, which keeps playing across pages, moves to the next song and pauses; listening time counts only while the song is playing and audible; the audio bucket is private (no public or anonymous access, no link for a hidden song, only admins upload); a setlist can be made, filled from song pages, reordered, given a key per song, renamed and deleted; lists are private to their owner; a song that stops being available keeps its slot and never shows its title; Stage mode moves through a setlist with the key chosen for the service, text size, chords toggle and a screen that stays on; hidden and unknown songs return the same "not available" page; and the API refuses anonymous or ordinary users anything they should not have (agreements, hidden lyrics, admin views, making themselves admin). The admin tests cover: signed-out visitors and ordinary users cannot open any admin page; artists, albums and songs are created and edited, and a song goes live only when every rule is met, with the page naming what is missing at each step; lyrics warnings and preview; the YouTube link and its check; uploading, previewing, replacing and removing a recording, with the old file deleted; an agreement is verified only with proof and records who verified it, revoking asks twice, and the artist page says whether users can see the artist; requests record money in rupees (stored as paise), a poster needs a verified, recorded request and follows its India-time window and event date exactly as the database does, and a refund switches the poster off; lists can be added to and renamed, but a code never changes and nothing in use can be deleted. Every admin change is recorded with who made it.

Not checked: Google sign-in (needs your Google Cloud client), email confirmation (switched off in the local stack), and the admin site on a real phone or on a real project (only on the local stack in CI). Admin two-factor sign-in is not built (see docs/DECISIONS.md).

## Rules the database enforces

- A song is live only when its artist is published, an **agreement is verified and in date**, the song has a writer, and **every writer and owner has consented and the consent is in date**. Anything else hides it. No manual step, no cron job: the check runs on every request.
- Dates mean "valid through the end of that day, India time".
- A verified agreement must carry a document reference and a verifier. That is where the "official mailbox only" rule is recorded.
- An artist with an expired agreement still appears, as **Unavailable**: name and placeholder only.
- Lyrics need a login. Chords are removed unless the agreement allows chords. Romanized and meaning versions need the translations flag. The YouTube id is withheld unless its link passed the admin's check; the site only links out to YouTube and never embeds it. Audio files sit in a private bucket and are playable only while the song is live **and** an agreement in force for the artist has "allow audio hosting" ticked; otherwise the song shows as lyrics-only.
- Users never receive poster start/end dates or any price. Posters are chosen on the server (`home_posters`), ranked both-match, then one match, then everyone, and stop at the earlier of the paid end or the event date.
- A poster can only be approved when its request has a verified requester and a recorded amount, and the request is not refunded or cancelled. If a request is refunded, cancelled, loses its verified requester or its recorded amount, its posters stop at once.
- A song's album must belong to the song's artist, and a song's key is a key name (C, F#, Bb, Am).
- Languages, regions, genres, occasions and moods have fixed codes, a region's country is the first part of its code, and a value that artists, songs, listeners or posters still use cannot be deleted.
- Every change to agreements, consents, songs, posters, requests and artists is written to an audit log that nobody can edit or delete through the API.
- Users cannot make themselves admin. Genres, occasions, moods and languages come from controlled lists.

## First run on Supabase

1. Create a project at supabase.com. Pick the region closest to your users.
2. Open **SQL editor** and run the fourteen migration files in order, each in a new query, pasting the file's contents (not its path): `0001_schema.sql`, `0002_rules.sql`, `0003_security.sql`, `0004_public_api.sql`, `0005_listening.sql`, `0006_audio.sql`, `0007_audio_rights.sql`, `0008_library.sql`, `0009_admin_guards.sql`, `0010_request_stops_posters.sql`, `0011_reference_guards.sql`, `0012_follows.sql`, `0013_song_covers.sql`, `0014_song_own_cover.sql`.
3. For the **real** project, run `reference.sql` to get the starting lists (languages, regions, genres, occasions, moods); the admin site's Lists page takes it from there. For a **throwaway test project only**, run `seed.sql` instead to get sample data, which includes those lists. **Never run `seed.sql` on the real project.** Its placeholder admin cannot log in.
4. Sign up once through the site (or **Authentication → Users → Add user**), copy your user id, and make yourself admin:
   ```sql
   update public.profiles set role = 'admin' where id = '<your user id>';
   ```
   Only the SQL editor (or the service key) can do this; the API cannot.
5. **Authentication → Providers**: switch **Email off** and **Google on**. This is what makes sign-in Google-only: the site shows only a Google button, but the Email provider is what lets anyone sign up some other way, so it must be off in the hosted project. In Google Cloud Console create an OAuth client, add the redirect URL Supabase shows, and paste the client id and secret into the Google provider. Under **Authentication → URL Configuration** set the Site URL to your site and add `<your site>/auth/callback` to the redirect URLs. The email form exists only in test builds (`NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=1`); never set that for the real site.
6. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings → API**. Keep the service role key out of anything a browser or app can read.

Things to expect and check:

- Supabase's security linter will warn about "security definer views". That is deliberate here: the views filter by the visibility rules and are the only way users read the catalogue.
- If `seed.sql` fails on the `auth.users` insert in your project, the first lines of the seed can be replaced by signing up and using your own user id as `verified_by`.
- The `get_lyrics` call errors with a login message for anonymous visitors. The website should send them to `/login?next=...`.

## Running it yourself

```bash
cp .env.example .env.local       # then fill in the Supabase URL and anon key
npm install
npm run dev                      # http://localhost:3000
```

Every page except `/login`, `/auth/*` and `/get` needs a login. Until you choose a language and region in Settings, Home shows everything and a hint.

Checks:

```bash
npm run test:logic                                                                        # Node 22.6 or newer
PGURL=postgres://postgres:password@localhost:5432/postgres bash supabase/tests/run.sh     # needs psql
npm run build && npm run typecheck
npx supabase start && npm run test:e2e   # needs Docker; set NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY from `supabase status -o env`
```

The database script creates a database called `songbook_test` and the roles `anon`, `authenticated`, `service_role`. Do not point it at a server whose roles you care about.

GitHub also commits `package-lock.json` for you when dependencies change (a CI step on `main`). Run `git pull --rebase` before you push.

## The live site

- Address: **https://psalmsplayer.com** (domain bought at GoDaddy; its `@` A record and `www` record point at Vercel). `www.psalmsplayer.com` and `psalms-player.vercel.app` both redirect to it (set in Vercel, Domains; checked 2026-10-28), so there is one address and one sign-in. Vercel serves the site and redeploys on every push to `main`.
- Speed: the pages are rendered by Vercel functions, and every page asks the database several things one after another, so the functions must run next to the database. `vercel.json` pins them to Mumbai (`bom1`), the same place as the live Supabase project (ap-south-1). Before this they ran in Washington DC and each database call took about 600 ms instead of about 90 ms. If the database ever moves to another region, change `regions` to match.
- Database: the Supabase project **psalmsplayer-live** (ref `ykdrytvnzwrwdqgfclnl`, region ap-south-1, free plan). Migrations 0001 to 0014 and `reference.sql` are applied. The older practice project has seed data and email login: never point the live site at it. Apply a new migration to the live project **before** pushing code that needs it.
- Vercel environment variables (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the live project's), `NEXT_PUBLIC_SITE_URL` (`https://psalmsplayer.com`, used for share links) and `NEXT_PUBLIC_CONTACT_EMAIL`. `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` must not exist. After changing a variable, redeploy with the build cache off.
- Sign-in is Google only. Supabase **URL Configuration**: Site URL `https://psalmsplayer.com`; redirect URLs allow `psalmsplayer.com`, `www.psalmsplayer.com` and `psalms-player.vercel.app`. The Google OAuth client lists the domain under Authorized JavaScript origins; its redirect address is Supabase's callback.
- Google shows the app name and logo on its consent screen only after **brand verification**. The domain is verified in Google Search Console (2026-10-28); Google asks for a 24-hour wait before the branding review is requested again. Until it passes, the consent screen shows the Supabase address. This is cosmetic.
- The owner's Google account is the admin (set in the SQL editor).

## Next steps

1. Request Google brand verification again (24 hours after the Search Console check), then try the website and the admin site on a phone and a laptop.
2. Admin two-factor sign-in (decision needed, see docs/DECISIONS.md), then Charts and share-sheet polish.
3. Android app (Capacitor) once the site is complete. Offline lyrics for Stage mode need the app to carry its own screens and a local copy of the user's setlists, so the wrapper cannot simply open the website.
4. iOS after Android.
