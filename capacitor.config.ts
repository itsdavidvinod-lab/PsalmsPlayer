import type { CapacitorConfig } from '@capacitor/cli';

// The Android app is a thin native shell around the live website: it opens https://psalmsplayer.com in a full-screen WebView,
// so every website update reaches the app at once, with no new Play Store release. See docs/ANDROID.md.
const config: CapacitorConfig = {
  // The Play Store identity. It can never be changed after the first upload, and it must start with the website's domain reversed.
  appId: 'com.psalmsplayer.app',
  appName: 'PsalmsPlayer',
  // Local files bundled in the app: the "you are offline" page, shown when the website cannot be reached.
  webDir: 'native-shell',
  backgroundColor: '#000000',
  server: {
    url: 'https://psalmsplayer.com',
    errorPath: 'offline.html',
  },
  android: {
    // The website recognises the app by this word in the user agent (src/lib/native-app.ts, NATIVE_UA_MARKER). A test keeps both in step.
    appendUserAgent: 'PsalmsPlayerApp/1',
  },
  plugins: {
    // Light status-bar icons on the site's black background.
    SystemBars: { style: 'DARK' },
  },
};

export default config;
