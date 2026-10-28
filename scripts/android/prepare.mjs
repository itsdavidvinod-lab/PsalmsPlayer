#!/usr/bin/env node
// Turns the plain project that `npx cap add android` generates into the PsalmsPlayer app. Run it once after `cap add android`
// and before `cap sync android` (the Android workflow does exactly that). It is safe to run again on the same project.
//
//   1. copies native/android/** over android/**  (icons, colours, theme and any native code)
//   2. removes the default Capacitor splash pictures, which the overlaid theme no longer uses
//   3. patches AndroidManifest.xml: the sign-in return address, permissions
//   4. appends to app/build.gradle: version numbers and release signing taken from the environment
//
// Every patch checks that it found what it expected and stops with an error if not, so a changed Capacitor template
// fails the build loudly instead of producing an app that quietly lacks sign-in.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const androidDir = path.join(root, 'android');
const overlayDir = path.join(root, 'native', 'android');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const APP_ID = 'com.psalmsplayer.app';
const AUTH_HOST = 'auth-callback';

function fail(message) {
  console.error(`prepare.mjs: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'))) {
  fail('android/ does not exist yet. Run `npx cap add android` first.');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

// 1. overlay
let copied = 0;
for (const file of walk(overlayDir)) {
  const target = path.join(androidDir, path.relative(overlayDir, file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  copied++;
}
console.log(`overlay: ${copied} files copied`);

// A second MainActivity (the template's own, if Capacitor named its folder differently) would stop the build.
const javaRoot = path.join(androidDir, 'app', 'src', 'main', 'java');
const wantedMain = path.join(javaRoot, ...APP_ID.split('.'), 'MainActivity.java');
if (fs.existsSync(wantedMain)) {
  for (const f of walk(javaRoot)) {
    if (path.basename(f) === 'MainActivity.java' && f !== wantedMain) {
      fs.rmSync(f);
      console.log(`removed duplicate ${path.relative(androidDir, f)}`);
    }
  }
}

// 2. default splash pictures (the overlaid theme paints the launch window itself)
const resDir = path.join(androidDir, 'app', 'src', 'main', 'res');
let splashes = 0;
for (const f of walk(resDir)) {
  if (path.basename(f) === 'splash.png') {
    fs.rmSync(f);
    splashes++;
  }
}
console.log(`removed ${splashes} default splash pictures`);

// 3. manifest
const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');

if (!manifest.includes(`android:scheme="${APP_ID}"`)) {
  const closing = '</intent-filter>';
  const at = manifest.indexOf(closing);
  if (at < 0) fail('AndroidManifest.xml has no intent-filter to put the sign-in return address after.');
  const filter = `
            <!-- Google sign-in happens in the phone's browser; Supabase sends it back to ${APP_ID}://${AUTH_HOST}, which opens the app. -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${APP_ID}" android:host="${AUTH_HOST}" />
            </intent-filter>`;
  manifest = manifest.slice(0, at + closing.length) + filter + manifest.slice(at + closing.length);
}

const permissions = []; // filled in when the app gets features that need one (background audio notification)
for (const name of permissions) {
  if (manifest.includes(`android:name="${name}"`)) continue;
  const internet = '<uses-permission android:name="android.permission.INTERNET" />';
  if (!manifest.includes(internet)) fail('AndroidManifest.xml has no INTERNET permission line to put the other permissions after.');
  manifest = manifest.replace(internet, `${internet}\n    <uses-permission android:name="${name}" />`);
}
fs.writeFileSync(manifestPath, manifest);
console.log('manifest patched');

// 4. gradle: version numbers and signing, appended so the template's own settings stay untouched.
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const MARK = '// --- PsalmsPlayer (added by scripts/android/prepare.mjs) ---';
if (!gradle.includes(MARK)) {
  gradle += `

${MARK}
// Play Store accepts an upload only when versionCode is higher than every earlier upload, so CI passes its run number.
android {
    defaultConfig {
        versionCode = Integer.parseInt(System.getenv('ANDROID_VERSION_CODE') ?: '1')
        versionName = System.getenv('ANDROID_VERSION_NAME') ?: '${pkg.version}'
    }
}

// Release signing, only when the keystore is supplied (GitHub secrets, see docs/ANDROID.md). Without it, debug builds still work.
def keystoreFile = System.getenv('ANDROID_KEYSTORE_FILE')
if (keystoreFile) {
    android {
        signingConfigs {
            release {
                storeFile = file(keystoreFile)
                storePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias = System.getenv('ANDROID_KEY_ALIAS')
                keyPassword = System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
        buildTypes {
            release {
                signingConfig = signingConfigs.release
            }
        }
    }
}
`;
  fs.writeFileSync(gradlePath, gradle);
}
console.log('gradle patched');
