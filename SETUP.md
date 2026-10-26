# PsalmsPlayer: setup

Step 1 of the build: the database, its rules, and the shared logic. The website (Next.js) is step 2 and is not in this folder yet.

## What is in this folder

| Path | What it is | Checked |
|---|---|---|
| `supabase/migrations/0001..0004` | Tables, visibility rules, security, public API | Run on Postgres 16 and tested |
| `supabase/seed.sql` | Fake development data (placeholder lyrics, a placeholder admin) | Run on Postgres 16 |
| `supabase/tests/` | 29 test blocks, 94 assertions and 36 must-fail checks (users cannot read agreements, prices, end dates or hidden songs, or make themselves admin) | Pass; 6 deliberate breakages were all caught |
| `src/lib/chordpro.ts` | Reads chord lyrics, transposes keys | 16 tests pass, strict TypeScript clean |
| `src/lib/youtube.ts` | Pulls a video id out of any pasted YouTube link | tested |
| `src/lib/share.ts` | Share links (app link, web login link), safe redirects | tested |
| `docs/DECISIONS.md` | Rules you decided, and what is still open | |

Not checked: running against a real Supabase project (this workspace could not reach one). The test harness stands in for Supabase's `auth` schema; see "First run" below for what to watch.

## Rules the database enforces

- A song is live only when its artist is published, an **agreement is verified and in date**, the song has a writer, and **every writer and owner has consented and the consent is in date**. Anything else hides it. No manual step, no cron job: the check runs on every request.
- Dates mean "valid through the end of that day, India time".
- A verified agreement must carry a document reference and a verifier. That is where the "official mailbox only" rule is recorded.
- An artist with an expired agreement still appears, as **Unavailable**: name and placeholder only.
- Lyrics need a login. Chords are removed unless the agreement allows chords. Romanized and meaning versions need the translations flag. The YouTube id is withheld unless the agreement allows embedding and the link passed its check.
- Users never receive poster start/end dates or any price. Posters are chosen on the server (`home_posters`), ranked both-match, then one match, then everyone, and stop at the earlier of the paid end or the event date.
- A poster can only be approved when its request has a verified requester and a recorded amount.
- Every change to agreements, consents, songs, posters, requests and artists is written to an audit log that nobody can edit or delete through the API.
- Users cannot make themselves admin. Genres, occasions, moods and languages come from controlled lists.

## First run on Supabase

1. Create a project at supabase.com. Pick the region closest to your users.
2. Open **SQL editor** and run these four files in order, each in a new query: `0001_schema.sql`, `0002_rules.sql`, `0003_security.sql`, `0004_public_api.sql`.
3. For a throwaway test project only, run `seed.sql` to get sample data. **Never run it on the real project.** Its placeholder admin cannot log in.
4. Sign up once through the site (or **Authentication → Users → Add user**), copy your user id, and make yourself admin:
   ```sql
   update public.profiles set role = 'admin' where id = '<your user id>';
   ```
   Only the SQL editor (or the service key) can do this; the API cannot.
5. **Authentication → Providers**: leave Email on. For Google, create an OAuth client in Google Cloud Console, add the redirect URL Supabase shows, paste the client id and secret into the Google provider.
6. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from **Project Settings → API**. Keep the service role key out of anything a browser or app can read.

Things to expect and check:

- Supabase's security linter will warn about "security definer views". That is deliberate here: the views filter by the visibility rules and are the only way users read the catalogue.
- If `seed.sql` fails on the `auth.users` insert in your project, the first lines of the seed can be replaced by signing up and using your own user id as `verified_by`.
- The `get_lyrics` call errors with a login message for anonymous visitors. The website should send them to `/login?next=...`.

## Running the checks yourself

```bash
node --experimental-strip-types --no-warnings --test src/lib/lib.test.ts   # needs Node 22.6 or newer
PGURL=postgres://postgres:password@localhost:5432/postgres bash supabase/tests/run.sh   # tested on Postgres 16, needs psql
```

The database script creates a database called `songbook_test` and the roles `anon`, `authenticated`, `service_role`. Do not point it at a server whose roles you care about.

## Next steps

2. Website (Next.js): login, Home, Browse, Artist, Album, Song and lyrics with transpose, Stage mode, Library, Discover, Settings, share pages, and the admin site.
3. Android app (Capacitor) once the site is complete. Offline lyrics for Stage mode need the app to carry its own screens and a local copy of the user's setlists, so the wrapper cannot simply open the website.
4. iOS after Android.
