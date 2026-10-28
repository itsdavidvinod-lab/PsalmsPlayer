# Google Play listing text (paste into Play Console)

Character limits are Play's. Edit freely; only describe what the app does today.

## Main store listing

- **App name** (max 30): `PsalmsPlayer`
- **Short description** (max 80, 74 used): `Christian songs with lyrics, chords and a music player for your community.`
- **Category**: Music & Audio
- **Tags**: Music player, Religion (pick whatever Play offers closest)
- **Contact email** (public): the developer contact address (decide whether to use a personal Gmail or an address on psalmsplayer.com)
- **Website**: `https://psalmsplayer.com`
- **Privacy policy**: `https://psalmsplayer.com/privacy`
- **Account deletion page**: `https://psalmsplayer.com/delete-account`

**Full description** (max 4000):

```
PsalmsPlayer is a songbook and music player for the Christian community.

Find a song, read its lyrics, play the recording, and keep your own lists for home, church and services.

LYRICS AND CHORDS
• Lyrics for every song, with chords when the writer provides them
• Move the key up or down to suit your voice or your band
• Songs in many languages, with the artist and writer credited

MUSIC PLAYER
• A player that stays on every page, with a full-screen view
• Keeps playing with the screen off, with controls on the lock screen and in the notification
• Shuffle and repeat, and a link to watch the song on YouTube when there is one

YOUR LIBRARY
• Like songs and follow your favourite artists
• Make playlists for listening
• Make setlists for a service, with the key for each song
• Stage mode: big, clear lyrics for the service, and your screen stays awake

COMMUNITY AND RIGHTS
• Songs appear only with the writers' and artists' consent
• Sign in with your Google account; nothing else to remember
• Delete your account and your data any time from Settings

PsalmsPlayer needs an internet connection.
```

**What's new** (first release): `First release.`

## Graphics

- App icon 512×512: `docs/play-store/icon-512.png`
- Feature graphic 1024×500: `docs/play-store/feature-graphic-1024x500.png`
- **Phone screenshots** (at least 2, up to 8; take them on your own phone from the installed test app, signed in): Home, a song's lyrics, the full-screen player, Library with a setlist, Stage mode. Play wants PNG or JPEG, 16:9 to 9:16 shape, each side between 320 and 3840 pixels.

## Data safety answers

Answer in Play Console, "Data safety". Confirm each line against the database before submitting.

| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Collects: yes. Shares with other companies: no |
| Is all data encrypted in transit? | Yes (HTTPS) |
| Can people ask for their data to be deleted? | Yes: in the app (Settings, Account, Delete account) and at `https://psalmsplayer.com/delete-account` |
| Personal info: email address | Collected (Google sign-in). Purpose: app functionality, account management |
| Personal info: name | Collected (display name from Google). Purpose: app functionality, account management |
| Personal info: user IDs | Collected. Purpose: app functionality, account management |
| App activity: app interactions | Collected (liked songs, follows, listening time). Purpose: app functionality, counting how often songs are played (the monthly listener and like counts shown on artist pages) |
| App activity: other user-generated content | Collected (playlists and setlists). Purpose: app functionality |
| Location, financial info, health, contacts, photos, audio recordings, files | Not collected |
| Is collection optional? | No for email, name, ID (needed to sign in) |

## Other App content answers

- **Ads**: no ads.
- **Target audience**: 13 and over; not designed for children.
- **Content rating**: answer the questionnaire honestly; the app plays music and shows lyrics, has no chat, no purchases, no gambling.
- **News app / government app / financial features / health features**: no.
- **App access**: all of the app needs sign-in with Google. Give Play a dedicated Google account (not an admin, 2-Step Verification off) with its email and password, and the instruction "Tap Continue with Google and sign in with this account."
- **Foreground service**: type `mediaPlayback`. Description: "Keeps the song playing when the screen is off and shows the lock-screen and notification controls." If interrupted: "The song stops playing." Video: a short screen recording of starting a song, locking the phone, and using the lock-screen controls.
