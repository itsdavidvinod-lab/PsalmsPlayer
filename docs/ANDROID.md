# The Android app

The app is a thin native shell (Capacitor) around the live website. It opens `https://psalmsplayer.com` in a full-screen WebView, so every website change reaches the app at once and the Play Store only has to be updated when the shell itself changes. The shell adds three things a website cannot do alone:

- **Google sign-in.** Google refuses to sign anyone in inside an app's embedded browser. The app opens the phone's own browser for the Google step, and Supabase sends it back to `com.psalmsplayer.app://auth-callback`, which opens the app and finishes the sign-in (`src/lib/native-app.ts`, `src/components/NativeBridge.tsx`, `src/app/login/LoginForm.tsx`).
- **Music with the screen off.** A foreground service with a media session keeps Android from stopping the sound and shows the notification and lock-screen controls (`native/android/.../MediaPlaybackService.java`; web side `src/components/player/useNativeMedia.ts`). The website still plays the audio itself.
- **An offline page** (`native-shell/offline.html`) instead of Android's error page when the site cannot be reached.

Inside the app the Admin site does not exist (no row in Settings, and `/admin` goes back to Home). The shell tells the website it is the app through the word `PsalmsPlayerApp` in the user agent.

## How it is built

Nothing Android is committed except the small pieces that make it PsalmsPlayer. The Android project itself is generated on every build:

| Path | What it is |
| --- | --- |
| `capacitor.config.ts` | App id `com.psalmsplayer.app`, the site address, the offline page, the user-agent word |
| `native-shell/` | The two local pages bundled in the app (`offline.html`, and an unused `index.html` Capacitor requires) |
| `native/android/` | Files copied over the generated project: launcher icons, theme colours, the playback plugin and service |
| `scripts/android/prepare.mjs` | Patches the generated project: sign-in return address, permissions, the service, version numbers, release signing |
| `scripts/android/make-icons.py` | Draws the icon and the Play listing graphics (run by hand; the PNGs are committed) |
| `.github/workflows/android.yml` | `npm install`, `cap add android`, `prepare.mjs`, `cap sync android`, Gradle |

The workflow runs when any of those files change, and by hand (Actions, "android", Run workflow). Every run builds a **debug APK** (download it from the run's Artifacts, `psalmsplayer-debug-apk`, and install it on a phone to test) and checks what is inside it: package name, target API 36, the sign-in return address, the site address. When the signing secrets exist, runs on `main` and manual runs also build the **signed bundle for Google Play** (`psalmsplayer-play-bundle`, an `.aab`).

The app id `com.psalmsplayer.app` is permanent: it cannot be changed after the first upload to Google Play.

## One-time setup

### 1. Supabase: allow the app's sign-in return address

Supabase dashboard, `psalmsplayer-live`, Authentication, URL Configuration, Redirect URLs: add

```
com.psalmsplayer.app://auth-callback
```

Without it Google sign-in inside the app ends on an error page.

### 2. Database: the delete-account function

Google Play requires that people can delete their account from inside the app, and from a web page. The app has both (Settings, Account, "Delete account", and `https://psalmsplayer.com/delete-account`). They need `supabase/migrations/0016_delete_my_account.sql` to be applied to the live project. It is additive and changes no existing data.

### 3. A Google Play developer account

One-time fee of 25 US dollars, with identity verification. The developer name is shown publicly on the store page: a personal account shows your legal name, an organisation account shows the organisation (and needs a D-U-N-S number). An account created as a **personal** account after 13 November 2023 must first run a **closed test with at least 12 testers who stay opted in for 14 continuous days** before it can apply for production access. Start collecting testers (people with an Android phone and a Google account, added by email to the closed-test list) as soon as the account exists, because the 14 days cannot be shortened.

### 4. The upload key and the GitHub secrets

Google Play signs the app that people install (Play App Signing). You sign the file you upload with an **upload key**. It was generated on 2026-10-28 (RSA 2048, valid until 2054, alias `upload`); the keystore file and its password were handed to the owner, and are not in the repository (the repository is public, and `.gitignore` refuses keystores). **Keep the keystore file and the password in a password manager or a private cloud folder.** A lost upload key can be reset by Google support, but it takes days.

Its SHA-256 fingerprint (what Play Console shows for the upload key, and what the "android" run prints as a notice): `23:02:AD:26:0F:03:6F:B0:ED:5A:3D:39:C3:45:66:63:90:F6:62:05:48:77:18:2D:A0:FB:44:FB:A5:DE:1D:5B`

Secrets cannot be set from the build sandbox, so the owner adds four repository secrets once (GitHub, the repository, Settings, Secrets and variables, Actions, New repository secret):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the whole contents of `ANDROID_KEYSTORE_BASE64.txt` (one long line) |
| `ANDROID_KEYSTORE_PASSWORD` | the password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the same password |

From then on, a manual run of the "android" workflow (or any run on `main`) produces `psalmsplayer-play-bundle`.

To make a new upload key (only if this one is lost or leaked; Play Console, Test and release, App signing, "Request upload key reset"):

```bash
keytool -genkeypair -storetype PKCS12 -keystore psalmsplayer-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 psalmsplayer-upload.jks     # macOS: base64 -i psalmsplayer-upload.jks
```

## Google Play Console, step by step

1. **Create app.** Name PsalmsPlayer, language, App, Free.
2. **Store listing.** Icon `docs/play-store/icon-512.png`, feature graphic `docs/play-store/feature-graphic-1024x500.png`, short description (80 characters), full description, at least 2 phone screenshots (take them from the debug APK on a phone, signed in, on Home, a song's lyrics, and the player).
3. **App content** (Monitor and improve, App content):
   - Privacy policy: `https://psalmsplayer.com/privacy`
   - Account deletion: `https://psalmsplayer.com/delete-account`
   - **App access:** the app needs a sign-in, and the only way in is Google. Create a plain Google account for the reviewers, without 2-step verification and not an admin of the site, and give its address and password in the instructions ("Tap Continue with Google and sign in with this account"). Review fails with "Need login credentials" if this is missing.
   - Ads: none. Target audience: 13 and older, not for children. Content rating questionnaire: no violence, no user-to-user chat; the app plays licensed Christian music.
   - **Data safety.** The app collects: email address, name, a user id (the Google sign-in), and the person's activity inside the app (liked songs, follows, playlists and setlists, listening history). All of it is used for app functionality and account management; none of it is shared with other companies or sold; it is encrypted in transit; people can request deletion (the in-app button and the web page above). Check each answer against `supabase/migrations` before submitting.
   - **Foreground service declaration:** the app declares one type, `mediaPlayback`. Play asks for a description ("keeps the song playing when the screen is off and shows the lock-screen controls"), what happens if it is interrupted ("the song stops"), and a link to a short **screen recording** that shows a person starting a song, locking the phone, and using the lock-screen or notification controls. Record it on the phone with the built-in screen recorder and upload it unlisted to YouTube.
4. **Testing.** Internal testing (up to 100 testers, available within minutes, good for the first uploads) is for you. Then a **closed test**: create a track, add the 12 or more testers, upload the bundle, and keep them opted in for 14 days. After that, **Apply for production**.
5. **Production.** Upload the bundle to the Production track, roll out. First reviews usually take a few days, sometimes longer for new accounts.

## Testing the debug APK on a phone

Every build of the "android" workflow publishes the debug APK as a release. On the phone, open

`https://github.com/itsdavidvinod-lab/PsalmsPlayer/releases/tag/android-debug`

and tap `PsalmsPlayer-debug.apk`. Android asks to allow installing apps from the browser you used (Settings, then allow for that browser, then go back), and Play Protect may warn that the app is unknown: choose "Install anyway". The same file is also in the run's Artifacts (`psalmsplayer-debug-apk`, needs a GitHub sign-in). Once the signing secrets exist, a newer test build installs over the older one; before that, every build has a new debug key and Android says the app conflicts, so uninstall the old test build first. Check:

- [ ] Sign in with Google: the phone's browser opens, and the app comes back signed in.
- [ ] Play a song, press Home, lock the screen: the sound continues and the lock screen shows the title with play/pause/next/previous. Leave it for 10 minutes or more.
- [ ] Settings shows no "Admin site" row, even for an admin.
- [ ] Turn on airplane mode and reopen the app: the "You are offline" page, and "Try again" works when back online.
- [ ] Settings, Account, "Delete account" (with a throw-away Google account).
- [ ] Opening a shared song link (`https://psalmsplayer.com/get?song=...`) opens it in the phone's browser, which shows the `/get` page. Opening these links directly in the app (Android App Links) is not set up yet.

## Known limits

- **It needs the internet.** The app is the website; without a connection it shows the offline page. Capacitor documents `server.url` as intended for development; here it is the deliberate choice, because the site is server-rendered with cookie sessions and must be one codebase. The cost is that Google Play may judge a very thin wrapper as "minimum functionality"; the background playback, notification controls, in-app deletion and the native Google sign-in are what make this more than a bookmark. Apple is stricter about this (guideline 4.2) and will need more native features before the iOS submission.
- **Share links** open the browser, not the app (needs a Digital Asset Links file on the site and an intent filter for `https://psalmsplayer.com`).
- **Background audio is only tested on devices.** Aggressive battery savers (some Xiaomi, Huawei, Samsung modes) can still stop apps; the usual fix is for the person to set PsalmsPlayer's battery use to "unrestricted".
- The notification shows the title, artist and album but not the cover picture.

## Releasing a shell change

Website changes need nothing here. A shell change (anything in the table above) needs a new bundle: run the "android" workflow on `main`, download `psalmsplayer-play-bundle`, upload it to Play Console. Each run has a higher `versionCode` (the run number), which Play requires; `versionName` comes from `package.json`.
