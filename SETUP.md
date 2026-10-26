# PsalmsPlayer: setup

Where the build stands: the database and its rules, and the user website with the player layer: Google sign-in, a Spotify-style frame (tab bar on phones, sidebar on wide screens), a mini player that keeps playing across pages, hosted audio streaming, lyrics with transpose, a YouTube link-out, Home, Browse, Artist, Album, Settings. Library, Stage mode, the admin site, the Android app and iOS are not built yet. Until the admin site exists, songs and audio can only be added with SQL and the Storage upload.

## What is in this folder

| Path | What it is | Checked |
|---|---|---|
| `supabase/migrations/0001..0007` | Tables, visibility rules, security, public API, listening time, hosted audio, audio rights | Run on a real Supabase stack in CI, and on plain Postgres 16 |
| `supabase/seed.sql` | Fake development data (placeholder lyrics, a placeholder admin) | Run on a real Supabase stack in CI |
| `supabase/tests/` | 94 assertions and 36 must-fail checks (users cannot read agreements, prices, end dates or hidden songs, or make themselves admin) | Pass on both; deliberate breakages are caught |
| `src/lib/` | ChordPro parsing and transposing, YouTube link reading, share links, play queue, audio-link cache, listening-time reporter | 27 tests pass, strict TypeScript clean |
| `src/app/`, `src/components/` | The website: `/login`, `/get`, and inside the app frame `/` (Home), `/browse`, `/artist/[slug]`, `/album/[slug]`, `/song/[slug]`, `/settings` | Built and type-checked in CI; browser-tested (see below) |
| `e2e/` | Playwright tests that drive the built site and call the API against a real Supabase stack | Pass in CI |
| `.github/workflows/checks.yml` | Runs everything above on every push | |
| `docs/DECISIONS.md` | Rules you decided, and what is still open | |

What the browser tests cover: a visitor who is not signed in is sent to login; Home shows only live songs and only posters inside their window; Settings changes which posters appear; artist, album and Browse pages hide what must be hidden (unavailable artists show a name only, a listener count appears only from 10 people); a song shows lyrics, transposes, links out to YouTube, switches versions, and can be liked; real audio plays through the mini player, which keeps playing across pages, moves to the next song and pauses; listening time counts only while the song is playing and audible; the audio bucket is private (no public or anonymous access, no link for a hidden song, only admins upload); hidden and unknown songs return the same "not available" page; and the API refuses anonymous or ordinary users anything they should not have (agreements, hidden lyrics, admin views, making themselves admin).

Not checked: Google sign-in (needs your Google Cloud client), email confirmation (switched off in the local stack), whether the YouTube link opens the YouTube app on a phone, whether audio keeps playing with the screen off, and anything else on a phone.

## Rules the database enforces

- A song is live only when its artist is published, an **agreement is verified and in date**, the song has a writer, and **every writer and owner has consented and the consent is in date**. Anything else hides it. No manual step, no cron job: the check runs on every request.
- Dates mean "valid through the end of that day, India time".
- A verified agreement must carry a document reference and a verifier. That is where the "official mailbox only" rule is recorded.
- An artist with an expired agreement still appears, as **Unavailable**: name and placeholder only.
- Lyrics need a login. Chords are removed unless the agreement allows chords. Romanized and meaning versions need the translations flag. The YouTube id is withheld unless its link passed the admin's check; the site only links out to YouTube and never embeds it. Audio files sit in a private bucket and are playable only while the song is live **and** an agreement in force for the artist has "allow audio hosting" ticked; otherwise the song shows as lyrics-only.
- Users never receive poster start/end dates or any price. Posters are chosen on the server (`home_posters`), ranked both-match, then one match, then everyone, and stop at the earlier of the paid end or the event date.
- A poster can only be approved when its request has a verified requester and a recorded amount.
- Every change to agreements, consents, songs, posters, requests and artists is written to an audit log that nobody can edit or delete through the API.
- Users cannot make themselves admin. Genres, occasions, moods and languages come from controlled lists.

## First run on Supabase

1. Create a project at supabase.com. Pick the region closest to your users.
2. Open **SQL editor** and run these seven files in order, each in a new query: `0001_schema.sql`, `0002_rules.sql`, `0003_security.sql`, `0004_public_api.sql`, `0005_listening.sql`, `0006_audio.sql`, `0007_audio_rights.sql`.
3. For a throwaway test project only, run `seed.sql` to get sample data. **Never run it on the real project.** Its placeholder admin cannot log in.
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

## Next steps

2. Website, remaining pages: Browse, Artist, Album, Stage mode, Library (liked, playlists, setlists), Charts, Share sheet polish, then the admin site (catalogue, agreements and consent, posters, requests ledger, expiry watch).
3. Android app (Capacitor) once the site is complete. Offline lyrics for Stage mode need the app to carry its own screens and a local copy of the user's setlists, so the wrapper cannot simply open the website.
4. iOS after Android.
