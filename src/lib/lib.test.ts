// Run with:  node --experimental-strip-types --test src/lib/lib.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseChordPro, transposeChord, transposeKey, transposeLines, semitonesBetween, prefersFlats, stripChords, toPlainText,
  isChordName, isKnownDirective,
} from './chordpro.ts';
import { checkChordPro } from './lyrics-check.ts';
import { TAG_KINDS, explainReferenceError, normalizeLanguageCode, normalizeRegionCode, regionCountry, suggestTagCode, validateLanguage, validateRegion, validateTag } from './reference-form.ts';
import { paiseToInput, paiseToRupees, istInputToIso, isoToIstInput, rupeesToPaise, validateRequest, validatePoster, requestAllowsApproval, posterPhase, paidOnToIso, isoToPaidOn, type RequestInput, type PosterInput } from './ledger.ts';
import { AGREEMENT_STATUSES, ENFORCED_RIGHTS, agreementPhase, agreementSummary, parseTerritories, stampsFor, validateAgreement, type AgreementInput } from './agreement-form.ts';
import { AUDIO_MAX_BYTES, checkAudioFile, audioObjectName, audioHostingState, durationSeconds, audioDisplayName, mmss, sizeLabel } from './audio-file.ts';
import { extractYoutubeId, youtubeWatchUrl } from './youtube.ts';
import { buildShareUrl, safeNextPath } from './share.ts';
import { COVER_PALETTE, coverBackground, coverColors, heroBackground, initialOf } from './cover.ts';
import { timeAgo } from './relative-time.ts';
import { FILTER_KINDS, cleanQuery, hasSearch, parseSearch, searchHref } from './search.ts';
import { NATIVE_AUTH_CALLBACK, NATIVE_UA_MARKER, isNativeUserAgent, nativeCallbackToWebPath } from './native-app.ts';
import { PICTURE_MAX_WIDTH, checkPictureFile, fitWithin, pictureObjectName } from './picture-upload.ts';
import { NO_CHIPS, isFiltering, listChips, matchesChips, matchesFind, songCountLabel, listenersLabel, likesLabel, sortSlots, toggleChip, visibleSlots, type Slot } from './list.ts';
import { makeLabels } from './labels.ts';
import { displayImageUrl, driveFileId } from './image-url.ts';
import { nextSlide, slideFromScroll } from './carousel.ts';
import type { Song } from './types.ts';
import { pictureFromMetadata, signInMethodLabel } from './user.ts';
import {
  visibilityLabel, slugify, isValidSlug, isHttpsUrl, isUuid, parseOptionalInt, daysLeftLabel, explainAdminError,
  visibilityHint, youtubeStatusLabel, KEY_CHOICES, isMusicalKey, indiaToday,
} from './admin-text.ts';

test('transposeChord moves roots and keeps quality and bass', () => {
  assert.equal(transposeChord('G', 2), 'A');
  assert.equal(transposeChord('C#m7', 1), 'Dm7');
  assert.equal(transposeChord('Bb', -2, true), 'Ab');
  assert.equal(transposeChord('G/B', 2), 'A/C#');
  assert.equal(transposeChord('D/F#', 1, true), 'Eb/G');
  assert.equal(transposeChord('Fmaj7', 7), 'Cmaj7');
  assert.equal(transposeChord('Asus4', 3), 'Csus4');
  assert.equal(transposeChord('Em', 12), 'Em');
  assert.equal(transposeChord('Em', -12), 'Em');
  assert.equal(transposeChord('N.C.', 5), 'N.C.');
  assert.equal(transposeChord('C', -1), 'B');
});

test('keys are spelled the way musicians write them', () => {
  assert.equal(transposeKey('G', 2), 'A');
  assert.equal(transposeKey('Em', 3), 'Gm');
  assert.equal(transposeKey('G', 3), 'Bb');
  assert.equal(transposeKey('G', 8), 'Eb');
  assert.equal(transposeKey('C', 6), 'F#');
  assert.equal(transposeKey('Am', 1), 'Bbm');
  assert.equal(transposeKey('Em', 5), 'Am');
  assert.equal(prefersFlats('F'), true);
  assert.equal(prefersFlats('Dm'), true);
  assert.equal(prefersFlats('G'), false);
  assert.equal(prefersFlats('Em'), false);
});

test('semitonesBetween gives the shift from one key to another', () => {
  assert.equal(semitonesBetween('G', 'A'), 2);
  assert.equal(semitonesBetween('A', 'G'), 10);
  assert.equal(semitonesBetween('Em', 'Gm'), 3);
  assert.equal(semitonesBetween('C', 'C'), 0);
});

test('parseChordPro splits chords from lyrics', () => {
  const { lines } = parseChordPro('[G]Placeholder line one of the [C]verse');
  assert.deepEqual(lines, [{ type: 'lyrics', segments: [
    { chord: 'G', text: 'Placeholder line one of the ' },
    { chord: 'C', text: 'verse' },
  ] }]);
});

test('text before the first chord and chords with no text are kept', () => {
  const { lines } = parseChordPro('Intro [G]word[D]');
  assert.deepEqual(lines[0], { type: 'lyrics', segments: [
    { chord: null, text: 'Intro ' },
    { chord: 'G', text: 'word' },
    { chord: 'D', text: '' },
  ] });
  const instrumental = parseChordPro('[G] [C] [D]').lines[0];
  assert.equal(instrumental.type, 'lyrics');
});

test('directives become metadata and section labels', () => {
  const { meta, lines } = parseChordPro('{title: Placeholder}\n{key: G}\n{tempo: 72}\n{comment: Verse 1}\nline\n\n{soc}\nchorus\n{eoc}\n{start_of_bridge: Bridge A}\nb\n{end_of_bridge}');
  assert.deepEqual(meta, { title: 'Placeholder', key: 'G', tempo: '72' });
  assert.deepEqual(lines.map((l) => l.type), ['section', 'lyrics', 'blank', 'section', 'lyrics', 'section', 'lyrics']);
  assert.deepEqual(lines[0], { type: 'section', label: 'Verse 1' });
  assert.deepEqual(lines[3], { type: 'section', label: 'Chorus' });
  assert.deepEqual(lines[5], { type: 'section', label: 'Bridge A' });
});

test('Windows line endings and trailing spaces are handled', () => {
  const { lines } = parseChordPro('[G]one   \r\n[C]two\r\n');
  assert.equal(lines.filter((l) => l.type === 'lyrics').length, 2);
});

test('non-Latin lyrics pass through untouched', () => {
  const tamil = 'இது ஒரு [G]சோதனை வரி [C]இங்கே';
  const { lines } = parseChordPro(tamil);
  assert.equal(toPlainText(lines), 'இது ஒரு சோதனை வரி இங்கே');
  assert.equal(stripChords(tamil), 'இது ஒரு சோதனை வரி இங்கே');
});

test('transposeLines shifts every chord and nothing else', () => {
  const { lines } = parseChordPro('{comment: Chorus}\n[G]Hello [C/E]world');
  const up = transposeLines(lines, 2);
  assert.deepEqual(up[0], { type: 'section', label: 'Chorus' });
  assert.deepEqual(up[1], { type: 'lyrics', segments: [{ chord: 'A', text: 'Hello ' }, { chord: 'D/F#', text: 'world' }] });
  assert.equal(transposeLines(lines, 0), lines);
  assert.equal(transposeLines(lines, 12), lines);
});

test('going up then back down restores the original chords', () => {
  const { lines } = parseChordPro('[G]a [Em7]b [C/E]c [D]d [Am]e');
  const there = transposeLines(lines, 5);
  const back = transposeLines(there, 7);
  assert.deepEqual(back, lines);
});

test('stripChords keeps directives intact and removes only brackets', () => {
  assert.equal(stripChords('[G]Hello [C]world'), 'Hello world');
  assert.equal(stripChords('{comment: Verse}\n[G]Hi'), '{comment: Verse}\nHi');
});

test('extractYoutubeId understands the common link shapes', () => {
  const id = 'dQw4w9WgXcQ';
  assert.equal(extractYoutubeId(id), id);
  assert.equal(extractYoutubeId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(extractYoutubeId(`https://www.youtube.com/watch?v=${id}&t=42s&list=PLxyz`), id);
  assert.equal(extractYoutubeId(`https://youtu.be/${id}?si=abc`), id);
  assert.equal(extractYoutubeId(`youtube.com/embed/${id}`), id);
  assert.equal(extractYoutubeId(`https://m.youtube.com/shorts/${id}`), id);
  assert.equal(extractYoutubeId(`https://music.youtube.com/watch?v=${id}`), id);
  assert.equal(extractYoutubeId(`  https://www.youtube.com/live/${id}  `), id);
});

test('extractYoutubeId rejects everything else', () => {
  assert.equal(extractYoutubeId(''), null);
  assert.equal(extractYoutubeId('https://www.youtube.com/playlist?list=PLxyz'), null);
  assert.equal(extractYoutubeId('https://www.youtube.com/@somechannel'), null);
  assert.equal(extractYoutubeId('https://evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractYoutubeId('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractYoutubeId('https://www.youtube.com/watch?v=short'), null);
  assert.equal(extractYoutubeId('not a url at all'), null);
});

test('the YouTube link-out is built only from a valid id', () => {
  assert.equal(youtubeWatchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.throws(() => youtubeWatchUrl('x"><script>'));
  assert.throws(() => youtubeWatchUrl('dQw4w9WgXcQ&autoplay=1'));
});

test('share links: app link and web login link', () => {
  assert.equal(buildShareUrl('app', 'placeholder-song-one', 'https://songs.example.org'), 'https://songs.example.org/get?song=placeholder-song-one');
  assert.equal(buildShareUrl('web', 'placeholder-song-one', 'https://songs.example.org/'), 'https://songs.example.org/login?next=%2Fsong%2Fplaceholder-song-one');
  assert.throws(() => buildShareUrl('web', 'Bad Slug', 'https://songs.example.org'));
  assert.throws(() => buildShareUrl('app', '../admin', 'https://songs.example.org'));
});

test('safeNextPath only allows paths on this site', () => {
  assert.equal(safeNextPath('/song/abc'), '/song/abc');
  assert.equal(safeNextPath('//evil.example'), '/');
  assert.equal(safeNextPath('https://evil.example'), '/');
  assert.equal(safeNextPath('/\\evil.example'), '/');
  assert.equal(safeNextPath(null), '/');
  assert.equal(safeNextPath('', '/library'), '/library');
});

import { ListenMeter, MAX_STEP_MS } from './listen.ts';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('ListenMeter counts only while playing and audible', () => {
  const c = clock();
  const m = new ListenMeter(c.now);
  c.advance(10_000);
  assert.equal(m.take(), 0, 'nothing counted before play starts');
  m.set(true);
  c.advance(15_400);
  assert.equal(m.take(), 15);
  m.set(false); // paused or muted
  c.advance(60_000);
  assert.equal(m.take(), 0, 'paused time is not counted');
  m.set(true);
  c.advance(3_000);
  m.set(true); // repeated calls change nothing
  c.advance(2_000);
  assert.equal(m.take(), 5, 'the 0.4 s remainder from before carries over (0.4 + 5.0 = 5.4 s)');
});

test('ListenMeter keeps the sub-second remainder and never counts a sleeping device as hours of listening', () => {
  const c = clock();
  const m = new ListenMeter(c.now);
  m.set(true);
  c.advance(1_500);
  assert.equal(m.take(), 1);
  c.advance(600);
  assert.equal(m.take(), 1, '0.5 s remainder + 0.6 s = 1.1 s');
  c.advance(8 * 3600 * 1000); // laptop asleep, then the poll fires once
  assert.equal(m.take(), MAX_STEP_MS / 1000, 'one step is capped');
  assert.equal(m.take(), 0);
});

import { ListenReporter, BEAT_MS } from './listen-reporter.ts';
import { hasNextSong, indexInOrder, isRepeatMode, nextIndex, nextRepeatMode, parsePlayerPrefs, playableQueue, previousStep, randomPlayableId, shuffleQueue } from './queue.ts';
import { SignedUrlCache } from './signed-url-cache.ts';
import { formatClock } from './format.ts';

type Call = { session: string | null; song: string; seconds: number };

function recorder(answer: (n: number) => Promise<string | null> | string | null = () => 'S1') {
  const calls: Call[] = [];
  const rpc = async (session: string | null, song: string, seconds: number) => {
    calls.push({ session, song, seconds });
    return answer(calls.length);
  };
  return { calls, rpc };
}

test('ListenReporter: silence and muted time are never reported', async () => {
  const c = clock();
  const r = recorder();
  const rep = new ListenReporter('song-1', r.rpc, c.now);
  for (let i = 0; i < 60; i++) { c.advance(1000); rep.tick(false); }
  await rep.settled();
  assert.equal(r.calls.length, 0, 'not even a session is opened before anything plays');
});

test('ListenReporter: opens a session at the first moment of play, reports every 15 s and on pause', async () => {
  const c = clock();
  const r = recorder();
  const rep = new ListenReporter('song-1', r.rpc, c.now);
  for (let i = 1; i <= 40; i++) { c.advance(1000); rep.tick(true); }
  c.advance(1000);
  rep.tick(false); // paused
  await rep.settled();

  assert.deepEqual(r.calls[0], { session: null, song: 'song-1', seconds: 0 }, 'first call opens the session and credits nothing');
  const reports = r.calls.slice(1);
  assert.ok(reports.every((x) => x.session === 'S1' && x.seconds > 0 && x.seconds <= BEAT_MS / 1000 + 1), 'every report belongs to the session and is a beat or less');
  assert.ok(reports.length >= 3, 'two beats and the remainder on pause');
  const total = reports.reduce((n, x) => n + x.seconds, 0);
  assert.equal(total, 40, '40 s of ticks that counted (the clock starts at the first counted tick) are all reported');
});

test('ListenReporter: pausing and muting stop the clock; resuming continues in the same session', async () => {
  const c = clock();
  const r = recorder();
  const rep = new ListenReporter('song-1', r.rpc, c.now);
  for (let i = 0; i < 10; i++) { c.advance(1000); rep.tick(true); }
  for (let i = 0; i < 120; i++) { c.advance(1000); rep.tick(false); } // two minutes muted
  for (let i = 0; i < 5; i++) { c.advance(1000); rep.tick(true); }
  c.advance(1000);
  rep.tick(false);
  await rep.settled();
  const total = r.calls.reduce((n, x) => n + x.seconds, 0);
  assert.ok(total >= 13 && total <= 15, `about 15 s were heard, reported ${total}`);
  assert.equal(r.calls.filter((x) => x.session === null).length, 1, 'one session for the whole song');
});

test('ListenReporter: if the session cannot be opened nothing is credited, and a failure never breaks later reports', async () => {
  const c = clock();
  let first = true;
  const r = recorder(async () => {
    if (first) { first = false; throw new Error('offline'); }
    return 'S2';
  });
  const rep = new ListenReporter('song-1', r.rpc, c.now);
  for (let i = 0; i < 20; i++) { c.advance(1000); rep.tick(true); }
  c.advance(1000);
  rep.tick(false);
  await rep.settled();
  assert.ok(r.calls.every((x) => x.session === null || x.seconds > 0), 'sanity');
  assert.ok(r.calls.filter((x) => x.seconds > 0).every((x) => x.session !== null), 'seconds are never sent without a session');
});

test('ListenReporter.end() reports what was heard', async () => {
  const c = clock();
  const r = recorder();
  const rep = new ListenReporter('song-1', r.rpc, c.now);
  for (let i = 0; i < 8; i++) { c.advance(1000); rep.tick(true); }
  c.advance(500);
  await rep.end();
  const total = r.calls.reduce((n, x) => n + x.seconds, 0);
  assert.ok(total >= 7 && total <= 8, `reported ${total}`);
});

test('play queue: songs without a hosted file are skipped and the start follows', () => {
  const songs = [
    { id: 'a', has_audio: false },
    { id: 'b', has_audio: true },
    { id: 'c', has_audio: false },
    { id: 'd', has_audio: true },
  ];
  assert.deepEqual(playableQueue(songs, 'd'), { queue: [songs[1], songs[3]], index: 1 });
  assert.equal(playableQueue(songs, 'a'), null, 'a song with no audio cannot start a queue');
  assert.equal(playableQueue(songs, 'zzz'), null);
  assert.equal(nextIndex(2, 0), 1);
  assert.equal(nextIndex(2, 1), null, 'the end of the queue');
});

test('Previous restarts after 3 seconds and goes back otherwise', () => {
  assert.deepEqual(previousStep(2, 10), { restart: true, index: 2 });
  assert.deepEqual(previousStep(2, 1), { restart: false, index: 1 });
  assert.deepEqual(previousStep(0, 1), { restart: true, index: 0 }, 'the first song just restarts');
  assert.deepEqual(previousStep(2, 3), { restart: false, index: 1 }, 'exactly 3 seconds still goes back');
});

test('SignedUrlCache reuses links for 50 minutes, shares one request, and never keeps a failure', async () => {
  const c = clock();
  let n = 0;
  let fail = false;
  const cache = new SignedUrlCache(async (id) => {
    n++;
    if (fail) return null;
    return `https://files.example/${id}?t=${n}`;
  }, c.now);

  const [a, b] = await Promise.all([cache.get('s1'), cache.get('s1')]);
  assert.equal(a, b);
  assert.equal(n, 1, 'two simultaneous requests make one call');
  c.advance(49 * 60_000);
  assert.equal(await cache.get('s1'), a, 'still fresh at 49 minutes');
  c.advance(2 * 60_000);
  assert.notEqual(await cache.get('s1'), a, 'renewed after 50 minutes');
  assert.equal(n, 2);

  cache.invalidate('s1');
  fail = true;
  assert.equal(await cache.get('s1'), null);
  fail = false;
  assert.ok(await cache.get('s1'), 'a failure is not remembered');

  const thrower = new SignedUrlCache(async () => { throw new Error('network'); }, c.now);
  assert.equal(await thrower.get('x'), null, 'a thrown error becomes "no link"');
});

test('formatClock', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65.9), '1:05');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(Number.NaN), '0:00');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(Infinity), '0:00');
});

import { clampAdjust, clampSize, stageIndex, stageKeyLabel, stageSemitones, swipeDirection } from './stage.ts';

test('Stage: the key chosen in the setlist plus the change made on stage', () => {
  assert.equal(stageSemitones('G', null, 0), 0);
  assert.equal(stageSemitones('G', 'G', 0), 0);
  assert.equal(stageSemitones('G', 'A', 0), 2);
  assert.equal(stageSemitones('G', 'F', 0), 10, 'down a tone is up ten');
  assert.equal(stageSemitones('G', 'A', -1), 1);
  assert.equal(stageSemitones(null, 'A', 2), 2, 'no key on the song: only the stage change applies');
  assert.equal(stageKeyLabel('G', 2), 'A');
  assert.equal(stageKeyLabel('G', 10), 'F');
  assert.equal(stageKeyLabel('Em', 3), 'Gm');
  assert.equal(stageKeyLabel(null, 3), null);
});

test('Stage: limits for size, key change and moving through the setlist', () => {
  assert.equal(clampAdjust(9), 6);
  assert.equal(clampAdjust(-9), -6);
  assert.equal(clampSize(0.2), 1.2);
  assert.equal(clampSize(9), 4);
  assert.equal(clampSize(2.04), 2);
  assert.equal(stageIndex(0, -1, 5), 0, 'cannot go before the first');
  assert.equal(stageIndex(4, 1, 5), 4, 'cannot go past the last');
  assert.equal(stageIndex(2, 1, 5), 3);
  assert.equal(stageIndex(0, 1, 1), 0);
});

test('Stage: a swipe must be long and mostly sideways', () => {
  assert.equal(swipeDirection(-120, 10), 1, 'left swipe goes to the next song');
  assert.equal(swipeDirection(120, 10), -1, 'right swipe goes back');
  assert.equal(swipeDirection(-30, 0), 0, 'too short');
  assert.equal(swipeDirection(-100, 80), 0, 'mostly vertical: that is scrolling');
});

test('Admin: reasons, addresses and links are checked the same way the database does', () => {
  assert.equal(visibilityLabel('live'), 'Live');
  assert.equal(visibilityLabel('agreement_inactive'), 'No verified agreement in force');
  assert.equal(visibilityLabel('taken_down'), 'Taken down by an admin');
  assert.equal(visibilityLabel('something_new'), 'something_new', 'an unknown code is shown as it is, never hidden');
  assert.equal(visibilityLabel(null), 'Unknown');

  assert.equal(slugify('Grace Worship Team'), 'grace-worship-team');
  assert.equal(slugify('  Café & Choir!! '), 'cafe-choir');
  assert.equal(slugify('தமிழ்'), '', 'no Latin letters: the admin must type the address');
  assert.equal(slugify('a'.repeat(120)).length, 80);
  assert.equal(slugify('x'.repeat(79) + ' y'), 'x'.repeat(79), 'a cut never leaves a trailing hyphen');

  assert.equal(isValidSlug('grace-worship'), true);
  assert.equal(isValidSlug('Grace'), false);
  assert.equal(isValidSlug('grace--worship'), false);
  assert.equal(isValidSlug('-grace'), false);
  assert.equal(isValidSlug(''), false);
  assert.equal(isValidSlug('a'.repeat(81)), false);

  assert.equal(isHttpsUrl('https://example.org/a.jpg'), true);
  assert.equal(isHttpsUrl('http://example.org/a.jpg'), false);
  assert.equal(isHttpsUrl('javascript:alert(1)'), false);
  assert.equal(isHttpsUrl('data:image/png;base64,AAAA'), false);
  assert.equal(isHttpsUrl('https://localhost/x'), false);
  assert.equal(isHttpsUrl('not a url'), false);

  assert.equal(isUuid('a0000000-0000-0000-0000-000000000001'), true);
  assert.equal(isUuid('a0000000-0000-0000-0000-00000000000'), false);
  assert.equal(isUuid("1' or '1'='1"), false);
});

test('Admin: optional numbers, day counts and error messages', () => {
  assert.deepEqual(parseOptionalInt('', 1900, 2100), { ok: true, value: null });
  assert.deepEqual(parseOptionalInt(' 2024 ', 1900, 2100), { ok: true, value: 2024 });
  assert.deepEqual(parseOptionalInt('1899', 1900, 2100), { ok: false });
  assert.deepEqual(parseOptionalInt('20x4', 1900, 2100), { ok: false });
  assert.deepEqual(parseOptionalInt('20.5', 1900, 2100), { ok: false });

  assert.equal(daysLeftLabel(null), 'No agreement in force');
  assert.equal(daysLeftLabel(0), 'Expires today');
  assert.equal(daysLeftLabel(1), '1 day left');
  assert.equal(daysLeftLabel(12), '12 days left');
  assert.equal(daysLeftLabel(-1), 'Expired 1 day ago');
  assert.equal(daysLeftLabel(-3), 'Expired 3 days ago');

  assert.match(explainAdminError({ code: '23505' }), /already uses/);
  assert.match(explainAdminError({ code: '23514', message: 'Unknown genre: x' }), /Unknown genre: x/);
  assert.match(explainAdminError({ code: '42501' }), /Not allowed/);
  assert.match(explainAdminError({ message: 'boom' }), /boom/);
  assert.equal(explainAdminError({}), 'Could not save.');
});

test('Admin: the lyrics checker warns about typos and never blocks', () => {
  assert.equal(isChordName('G'), true);
  assert.equal(isChordName('C#m7'), true);
  assert.equal(isChordName('Bb/D'), true);
  assert.equal(isChordName('N.C.'), true);
  for (const ok of ['Gadd9', 'Cmaj7', 'F7(b9)', 'Em7b5', 'A7sus4', 'D/F#', 'Dm', 'Fsus2', 'Abdim']) assert.equal(isChordName(ok), true, ok);
  assert.equal(isChordName('H'), false);
  assert.equal(isChordName('Gx'), false);
  assert.equal(isChordName(''), false);
  assert.equal(isKnownDirective('comment'), true);
  assert.equal(isKnownDirective('SOC'), true);
  assert.equal(isKnownDirective('define'), false);

  assert.deepEqual(checkChordPro('{comment: Verse 1}\n[G]Line of [C]lyrics\n\n{soc}\n[D]Chorus [G/B]line\n{eoc}'), []);
  assert.deepEqual(checkChordPro('[G]Fine\r\n[Em7]Also fine'), []);
  assert.deepEqual(checkChordPro('[G Line without a close'), [{ line: 1, message: 'A chord bracket [ is never closed.' }]);
  assert.deepEqual(checkChordPro('Line] stray'), [{ line: 1, message: 'A closing bracket ] has no opening [.' }]);
  assert.deepEqual(checkChordPro('[[G]]x'), [{ line: 1, message: 'A chord bracket [ is opened twice.' }]);
  assert.deepEqual(checkChordPro('[]x'), [{ line: 1, message: 'There is an empty chord [].' }]);
  assert.deepEqual(checkChordPro('[Hm]x'), [{ line: 1, message: '"Hm" does not look like a chord.' }]);
  assert.deepEqual(checkChordPro('{define: x}\n[G]x'), [{ line: 1, message: 'The directive {define} is not supported and will be ignored.' }]);
  assert.deepEqual(checkChordPro('{comment: unfinished\n[G]x'), [{ line: 1, message: 'A directive starts with { but does not end with }.' }]);
  assert.deepEqual(checkChordPro('   \n'), [{ line: 0, message: 'There are no lyric lines yet.' }]);
  assert.equal(checkChordPro('[G]a\n[Q]b\n[C]c')[0].line, 2, 'the line number points at the mistake');
});

test('Admin: hints, link status words and key choices', () => {
  assert.match(visibilityHint('no_writer'), /writer/i);
  assert.match(visibilityHint('agreement_inactive'), /agreement/i);
  assert.equal(visibilityHint('live'), '');
  assert.equal(visibilityHint(null), '');
  assert.match(youtubeStatusLabel('ok'), /shown to users/);
  assert.match(youtubeStatusLabel('channel_mismatch'), /hidden/);
  assert.equal(youtubeStatusLabel('new_status'), 'new_status');
  assert.equal(KEY_CHOICES.length, 24);
  assert.equal(new Set(KEY_CHOICES).size, 24);
  assert.ok(KEY_CHOICES.every(isMusicalKey), 'every offered key is accepted by the database rule');
  assert.equal(isMusicalKey('C7'), false);
  assert.equal(isMusicalKey('g'), false);
  assert.equal(isMusicalKey(''), false);
});

test('Admin audio: only MP3 and M4A/AAC, within the size limit, with safe storage names', () => {
  assert.deepEqual(checkAudioFile({ name: 'Nanna Kadege .mp3', type: 'audio/mpeg', size: 9_873_856 }), { ok: true, mime: 'audio/mpeg', ext: 'mp3' });
  assert.deepEqual(checkAudioFile({ name: 'SONG.M4A', type: 'audio/x-m4a', size: 5_000_000 }), { ok: true, mime: 'audio/mp4', ext: 'm4a' });
  assert.deepEqual(checkAudioFile({ name: 'song.aac', type: 'audio/aac', size: 5_000_000 }), { ok: true, mime: 'audio/aac', ext: 'aac' });
  assert.deepEqual(checkAudioFile({ name: 'song.mp3', type: '', size: 1000 }), { ok: true, mime: 'audio/mpeg', ext: 'mp3' }, 'some browsers send no type');

  for (const name of ['song.wav', 'song.flac', 'song.ogg', 'song.mp4', 'song', 'song.mp3.exe', '.mp3x']) {
    const r = checkAudioFile({ name, type: '', size: 1000 });
    assert.equal(r.ok, false, name);
  }
  const lie = checkAudioFile({ name: 'song.mp3', type: 'audio/wav', size: 1000 });
  assert.equal(lie.ok, false);
  assert.match(lie.ok ? '' : lie.reason, /does not match/);
  assert.equal(checkAudioFile({ name: 'song.mp3', type: 'audio/mpeg', size: 0 }).ok, false, 'empty');
  assert.equal(checkAudioFile({ name: 'song.mp3', type: 'audio/mpeg', size: AUDIO_MAX_BYTES }).ok, true, 'exactly at the limit');
  const big = checkAudioFile({ name: 'song.mp3', type: 'audio/mpeg', size: AUDIO_MAX_BYTES + 1 });
  assert.equal(big.ok, false);
  assert.match(big.ok ? '' : big.reason, /50 MB/);
  assert.equal(checkAudioFile({ name: 'song.mp3', type: 'audio/mpeg', size: 80 * 1024 * 1024 }, 100 * 1024 * 1024).ok, true, 'a paid plan can raise the limit');

  assert.equal(audioObjectName('Nanna Kadege .mp3', 'mp3', 1_700_000_000_000), 'nanna-kadege-lo6h2qfc.mp3'.replace('lo6h2qfc', (1_700_000_000_000).toString(36)));
  assert.equal(audioObjectName('தமிழ்.mp3', 'mp3', 36), 'audio-10.mp3', 'a name with no Latin letters still gets a usable one');
  assert.equal(audioObjectName('../../evil name!.mp3', 'mp3', 36), 'evil-name-10.mp3', 'no path tricks');
  assert.notEqual(audioObjectName('a.mp3', 'mp3', 1), audioObjectName('a.mp3', 'mp3', 2), 'never repeats');
  assert.ok(!audioObjectName('x'.repeat(200) + '.mp3', 'mp3', 1).includes('..'));
  assert.ok(audioObjectName('x'.repeat(200) + '.mp3', 'mp3', 1).length < 80);
});

test('Admin audio: whether the agreement in force lets the file play', () => {
  const ok = { status: 'verified', starts_on: '2026-01-01', expires_on: '2026-12-31', allow_audio_hosting: true };
  assert.equal(audioHostingState([ok], '2026-10-27').ok, true);
  assert.equal(audioHostingState([ok], '2026-12-31').ok, true, 'valid through the end of the last day');
  assert.equal(audioHostingState([ok], '2027-01-01').ok, false, 'expired');
  assert.equal(audioHostingState([ok], '2025-12-31').ok, false, 'not started');
  assert.equal(audioHostingState([{ ...ok, status: 'signed' }], '2026-10-27').ok, false, 'signed is not verified');
  assert.equal(audioHostingState([{ ...ok, status: 'revoked' }], '2026-10-27').ok, false);
  assert.equal(audioHostingState([{ ...ok, allow_audio_hosting: false }], '2026-10-27').reason, 'The agreement in force does not allow audio hosting.');
  assert.equal(audioHostingState([], '2026-10-27').reason, 'No verified agreement is in force for this artist.');
  assert.equal(audioHostingState([{ ...ok, allow_audio_hosting: false }, ok], '2026-10-27').ok, true, 'any agreement in force that allows it is enough');
  assert.equal(audioHostingState([{ ...ok, starts_on: null }], '2026-10-27').ok, false);
});

test('Admin audio: durations, names, sizes and the India date', () => {
  assert.equal(durationSeconds(2.61), 3);
  assert.equal(durationSeconds(411.4), 411);
  assert.equal(durationSeconds(0.2), null, 'under half a second rounds to zero, which the database refuses');
  assert.equal(durationSeconds(0), null);
  assert.equal(durationSeconds(-5), null);
  assert.equal(durationSeconds(Number.NaN), null);
  assert.equal(durationSeconds(Number.POSITIVE_INFINITY), null, 'a stream with no known end');
  assert.equal(durationSeconds(25 * 3600), null);

  assert.equal(audioDisplayName('d0000000-0000-0000-0000-000000000001/nanna-kadege-abc.mp3'), 'nanna-kadege-abc.mp3');
  assert.equal(audioDisplayName('plain.mp3'), 'plain.mp3');
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(65), '1:05');
  assert.equal(mmss(411), '6:51');
  assert.equal(sizeLabel(9_873_856), '9.4 MB');
  assert.equal(sizeLabel(50 * 1024 * 1024), '50 MB');
  assert.equal(sizeLabel(300), '1 KB');
  assert.equal(sizeLabel(512 * 1024), '512 KB');

  // 21:00 UTC on the 26th is already 02:30 on the 27th in India.
  assert.equal(indiaToday(new Date('2026-10-26T21:00:00Z')), '2026-10-27');
  assert.equal(indiaToday(new Date('2026-10-26T18:29:59Z')), '2026-10-26');
  assert.equal(indiaToday(new Date('2026-10-26T18:30:00Z')), '2026-10-27');
});

const goodAgreement: AgreementInput = { status: 'verified', starts_on: '2026-01-01', expires_on: '2026-12-31', document_ref: 'MSG-1', revocation_email: '', territories: '' };

test('Agreement form: what is checked before it is sent', () => {
  assert.equal(validateAgreement(goodAgreement), null);
  assert.equal(validateAgreement({ ...goodAgreement, status: 'sent', starts_on: '', expires_on: '', document_ref: '' }), null, 'a sent agreement needs nothing yet');
  assert.match(validateAgreement({ ...goodAgreement, document_ref: '  ' }) ?? '', /needs the document reference/);
  assert.match(validateAgreement({ ...goodAgreement, starts_on: '' }) ?? '', /both a start date and an end date/);
  assert.match(validateAgreement({ ...goodAgreement, expires_on: '' }) ?? '', /both a start date and an end date/);
  assert.match(validateAgreement({ ...goodAgreement, starts_on: '2026-06-01', expires_on: '2026-05-31' }) ?? '', /before the start/);
  assert.equal(validateAgreement({ ...goodAgreement, starts_on: '2026-06-01', expires_on: '2026-06-01' }), null, 'a one-day term is fine');
  assert.match(validateAgreement({ ...goodAgreement, starts_on: '2026-13-01x' }) ?? '', /start date is not a valid date/);
  assert.match(validateAgreement({ ...goodAgreement, document_ref: 'x'.repeat(301) }) ?? '', /too long/);
  assert.match(validateAgreement({ ...goodAgreement, revocation_email: 'not an email' }) ?? '', /email/);
  assert.equal(validateAgreement({ ...goodAgreement, revocation_email: 'rights@band.example' }), null);
  assert.match(validateAgreement({ ...goodAgreement, territories: 'India' }) ?? '', /"INDIA" is not a country/);
  assert.equal(validateAgreement({ ...goodAgreement, status: 'revoked', document_ref: '', starts_on: '', expires_on: '' }), null, 'revoking never needs proof');
});

test('Agreement form: territories', () => {
  assert.deepEqual(parseTerritories(''), { ok: true, value: [] });
  assert.deepEqual(parseTerritories('in, lk;  IN  in-tn'), { ok: true, value: ['IN', 'LK', 'IN-TN'] });
  assert.equal(parseTerritories('IND').ok, false);
  assert.equal(parseTerritories('I').ok, false);
  assert.equal(parseTerritories('IN-').ok, false);
  const many = Array.from({ length: 31 }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`).join(',');
  assert.equal(parseTerritories(many).ok, false, 'more than 30');
});

test('Agreement form: who verified it and when', () => {
  const now = '2026-10-27T10:00:00.000Z';
  const before = '2026-09-01T00:00:00.000Z';
  // new record
  assert.deepEqual(stampsFor(null, 'sent', 'admin-1', now), { sent_at: now, signed_at: null, verified_at: null, verified_by: null });
  assert.deepEqual(stampsFor(null, 'verified', 'admin-1', now), { sent_at: now, signed_at: now, verified_at: now, verified_by: 'admin-1' });
  // moving forward keeps the earlier moments
  const sent = { sent_at: before, signed_at: null, verified_at: null, verified_by: null };
  assert.deepEqual(stampsFor(sent, 'signed', 'admin-1', now), { sent_at: before, signed_at: now, verified_at: null, verified_by: null });
  const signed = { sent_at: before, signed_at: before, verified_at: null, verified_by: null };
  assert.deepEqual(stampsFor(signed, 'verified', 'admin-2', now), { sent_at: before, signed_at: before, verified_at: now, verified_by: 'admin-2' });
  // saving an already verified record again does not change who verified it
  const done = { sent_at: before, signed_at: before, verified_at: before, verified_by: 'admin-1' };
  assert.deepEqual(stampsFor(done, 'verified', 'admin-2', now), done);
  // taking verification back clears it
  assert.deepEqual(stampsFor(done, 'signed', 'admin-2', now), { sent_at: before, signed_at: before, verified_at: null, verified_by: null });
  assert.deepEqual(stampsFor(done, 'sent', 'admin-2', now), { sent_at: before, signed_at: before, verified_at: null, verified_by: null });
  // revoking keeps the history of who verified it
  assert.deepEqual(stampsFor(done, 'revoked', 'admin-2', now), done);
});

test('Agreement form: phase and summary line, matching the database definition of "in force"', () => {
  const t = '2026-10-27';
  const v = { status: 'verified', starts_on: '2026-01-01', expires_on: '2026-12-31' };
  assert.equal(agreementPhase(v, t), 'in_force');
  assert.equal(agreementPhase({ ...v, expires_on: '2026-10-27' }, t), 'in_force', 'valid through the end of the last day');
  assert.equal(agreementPhase({ ...v, expires_on: '2026-10-26' }, t), 'expired');
  assert.equal(agreementPhase({ ...v, starts_on: '2026-10-27' }, t), 'in_force', 'starts at the beginning of its first day');
  assert.equal(agreementPhase({ ...v, starts_on: '2026-10-28' }, t), 'not_started');
  assert.equal(agreementPhase({ ...v, status: 'signed' }, t), 'not_verified');
  assert.equal(agreementPhase({ ...v, starts_on: null }, t), 'not_verified');
  assert.equal(agreementPhase({ ...v, status: 'revoked' }, t), 'revoked');
  assert.equal(agreementSummary(v, t), 'Verified · 2026-01-01 to 2026-12-31 · In force');
  assert.equal(agreementSummary({ status: 'sent', starts_on: null, expires_on: null }, t), 'Sent · no term set · Not verified yet');
  assert.equal(agreementSummary({ status: 'revoked', starts_on: '2026-01-01', expires_on: '2026-12-31' }, t), 'Revoked · 2026-01-01 to 2026-12-31 · Revoked');
  assert.deepEqual(AGREEMENT_STATUSES.map((s) => s.value), ['sent', 'signed', 'verified', 'revoked']);
  assert.deepEqual(ENFORCED_RIGHTS.map((r) => r.key), ['allow_lyrics', 'allow_chords', 'allow_translations', 'allow_video_embed', 'allow_audio_hosting']);
});

test('Ledger: rupees and paise without floating point', () => {
  assert.deepEqual(rupeesToPaise(''), { ok: true, value: null });
  assert.deepEqual(rupeesToPaise('  '), { ok: true, value: null });
  assert.deepEqual(rupeesToPaise('0'), { ok: true, value: 0 });
  assert.deepEqual(rupeesToPaise('1500'), { ok: true, value: 150000 });
  assert.deepEqual(rupeesToPaise('1,500.5'), { ok: true, value: 150050 });
  assert.deepEqual(rupeesToPaise('₹ 1500.50'), { ok: true, value: 150050 });
  assert.deepEqual(rupeesToPaise('0.07'), { ok: true, value: 7 });
  assert.deepEqual(rupeesToPaise('19.99'), { ok: true, value: 1999 }, 'the classic float trap');
  assert.deepEqual(rupeesToPaise('1000000000'), { ok: true, value: 100_000_000_000 }, 'the largest accepted amount');
  for (const bad of ['-5', '1.234', '12abc', '1e3', '.5', '5.', '1000000001', '１２']) assert.equal(rupeesToPaise(bad).ok, false, bad);

  assert.equal(paiseToRupees(150050), '₹1,500.50');
  assert.equal(paiseToRupees(15000000), '₹1,50,000.00', 'Indian digit grouping');
  assert.equal(paiseToRupees(0), '₹0.00');
  assert.equal(paiseToRupees(null), 'not recorded');
  assert.equal(paiseToInput(150050), '1500.50');
  assert.equal(paiseToInput(150000), '1500');
  assert.equal(paiseToInput(7), '0.07');
  assert.equal(paiseToInput(null), '');
  for (const p of [0, 7, 99, 100, 1999, 150050, 100_000_000_000]) {
    assert.deepEqual(rupeesToPaise(paiseToInput(p)), { ok: true, value: p }, `round trip ${p}`);
  }
});

test('Ledger: India time in and out', () => {
  assert.equal(istInputToIso('2026-11-01T09:00'), '2026-11-01T03:30:00.000Z');
  assert.equal(istInputToIso('2026-11-01T00:00'), '2026-10-31T18:30:00.000Z');
  assert.equal(istInputToIso(''), null);
  assert.equal(istInputToIso('2026-11-01'), null);
  assert.equal(istInputToIso('2026-13-01T09:00'), null);
  assert.equal(isoToIstInput('2026-11-01T03:30:00.000Z'), '2026-11-01T09:00');
  assert.equal(isoToIstInput('2026-10-31T18:30:00+00:00'), '2026-11-01T00:00');
  assert.equal(isoToIstInput(null), '');
  assert.equal(isoToIstInput('garbage'), '');
  for (const local of ['2026-01-01T00:00', '2026-12-31T23:59', '2027-02-28T12:30']) assert.equal(isoToIstInput(istInputToIso(local)), local, local);
  assert.equal(paidOnToIso('2026-11-01'), '2026-10-31T18:30:00.000Z');
  assert.equal(paidOnToIso(''), null);
  assert.equal(isoToPaidOn('2026-10-31T18:30:00.000Z'), '2026-11-01');
});

const goodRequest: RequestInput = { kind: 'promotion', channel: 'email', contact: 'band@example.org', status: 'in_discussion', amount: '', refund: '', refund_reason: '', paid_on: '' };

test('Ledger: what a request must have at each stage', () => {
  assert.equal(validateRequest(goodRequest), null);
  assert.match(validateRequest({ ...goodRequest, contact: ' ' }) ?? '', /contact is required/);
  assert.match(validateRequest({ ...goodRequest, contact: 'band at example' }) ?? '', /email/);
  assert.equal(validateRequest({ ...goodRequest, channel: 'whatsapp', contact: '+91 98765-43210' }), null);
  assert.match(validateRequest({ ...goodRequest, channel: 'whatsapp', contact: '12345' }) ?? '', /8 to 15 digits/);
  assert.match(validateRequest({ ...goodRequest, amount: 'lots' }) ?? '', /amount is not a valid/);
  // paid, live and completed all need the money recorded
  for (const status of ['paid', 'live', 'completed'] as const) {
    assert.match(validateRequest({ ...goodRequest, status }) ?? '', /needs the amount/, status);
    assert.match(validateRequest({ ...goodRequest, status, amount: '0' }) ?? '', /needs the amount/, `${status} at zero`);
    assert.match(validateRequest({ ...goodRequest, status, amount: '1500' }) ?? '', /needs the date/, status);
    assert.equal(validateRequest({ ...goodRequest, status, amount: '1500', paid_on: '2026-10-20' }), null, status);
  }
  // refunds
  const paid = { ...goodRequest, status: 'paid' as const, amount: '1500', paid_on: '2026-10-20' };
  assert.match(validateRequest({ ...paid, status: 'refunded' }) ?? '', /amount refunded/);
  assert.match(validateRequest({ ...paid, status: 'refunded', refund: '1500' }) ?? '', /reason/);
  assert.equal(validateRequest({ ...paid, status: 'refunded', refund: '1500', refund_reason: 'Event cancelled' }), null);
  assert.equal(validateRequest({ ...paid, status: 'refunded', refund: '500', refund_reason: 'Part refund' }), null, 'a partial refund');
  assert.match(validateRequest({ ...paid, status: 'refunded', refund: '1500.01', refund_reason: 'x' }) ?? '', /more than the amount paid/);
  assert.match(validateRequest({ ...goodRequest, refund: '10' }) ?? '', /before recording a refund/);
  assert.equal(validateRequest({ ...goodRequest, status: 'cancelled' }), null, 'cancelling needs no money');
});

const goodPoster: PosterInput = {
  status: 'draft', title: 'Christmas night', image_url: 'https://cdn.example.org/p.jpg', youtube: '', match_mode: 'everyone',
  languages: [], regions: [], event_date: '', starts_local: '', ends_local: '', request_id: '',
};
const readyRequest = { contact_verified: true, amount_paise: 150000 };

test('Ledger: what a poster must have before it can be approved', () => {
  assert.equal(validatePoster(goodPoster, null), null, 'a draft needs nothing from a request');
  assert.match(validatePoster({ ...goodPoster, title: ' ' }, null) ?? '', /title is required/);
  assert.match(validatePoster({ ...goodPoster, image_url: 'http://x.org/p.jpg' }, null) ?? '', /https/);
  assert.match(validatePoster({ ...goodPoster, image_url: 'https://x.org/a b.jpg' }, null) ?? '', /https/);
  assert.match(validatePoster({ ...goodPoster, starts_local: '2026-12-01T09:00', ends_local: '2026-12-01T09:00' }, null) ?? '', /end must be after/);
  assert.match(validatePoster({ ...goodPoster, starts_local: 'soon' }, null) ?? '', /start is not a valid/);
  assert.match(validatePoster({ ...goodPoster, match_mode: 'both', languages: ['ta'] }, null) ?? '', /at least one language and at least one region/);
  assert.equal(validatePoster({ ...goodPoster, match_mode: 'both', languages: ['ta'], regions: ['IN'] }, null), null);
  assert.match(validatePoster({ ...goodPoster, match_mode: 'either' }, null) ?? '', /at least one language or region/);
  assert.equal(validatePoster({ ...goodPoster, match_mode: 'either', regions: ['IN'] }, null), null);

  const approved = { ...goodPoster, status: 'approved' as const, starts_local: '2026-12-01T09:00', ends_local: '2026-12-25T23:00' };
  assert.equal(validatePoster(approved, readyRequest), null);
  assert.match(validatePoster({ ...approved, ends_local: '' }, readyRequest) ?? '', /needs a start and an end/);
  assert.match(validatePoster(approved, null) ?? '', /Link the poster/);
  assert.match(validatePoster(approved, { contact_verified: false, amount_paise: 150000 }) ?? '', /not verified/);
  assert.match(validatePoster(approved, { contact_verified: true, amount_paise: null }) ?? '', /no amount recorded/);
  assert.equal(requestAllowsApproval({ contact_verified: true, amount_paise: 0 }).ok, true, 'a free promotion still has a recorded amount (zero)');
  assert.equal(requestAllowsApproval(null).ok, false);
});

test('Ledger: when a poster is showing, matching what home_posters() does', () => {
  const at = (iso: string) => Date.parse(iso);
  const p = { status: 'approved', starts_at: '2026-12-01T03:30:00Z', ends_at: '2026-12-25T17:30:00Z', event_date: null as string | null };
  assert.equal(posterPhase(p, at('2026-11-30T00:00:00Z')), 'scheduled');
  assert.equal(posterPhase(p, at('2026-12-01T03:30:00Z')), 'showing', 'from the very start');
  assert.equal(posterPhase(p, at('2026-12-25T17:29:59Z')), 'showing');
  assert.equal(posterPhase(p, at('2026-12-25T17:30:00Z')), 'ended', 'the end is exclusive');
  assert.equal(posterPhase({ ...p, status: 'draft' }, at('2026-12-02T00:00:00Z')), 'off');
  assert.equal(posterPhase({ ...p, status: 'paused' }, at('2026-12-02T00:00:00Z')), 'off');
  assert.equal(posterPhase({ ...p, starts_at: null }, at('2026-12-02T00:00:00Z')), 'off');
  // an event day cuts the display short: the day ends at midnight in India
  const ev = { ...p, event_date: '2026-12-10' };
  assert.equal(posterPhase(ev, at('2026-12-10T18:29:59Z')), 'showing', 'until 23:59:59 on the event day in India');
  assert.equal(posterPhase(ev, at('2026-12-10T18:30:00Z')), 'ended');
  assert.equal(posterPhase({ ...p, event_date: '2027-03-01' }, at('2026-12-25T17:30:00Z')), 'ended', 'a later event day does not extend the window');
});

test('Lists: codes and names are checked before the database is asked', () => {
  assert.equal(normalizeLanguageCode(' TA '), 'ta');
  assert.equal(normalizeRegionCode(' in-tn '), 'IN-TN');
  assert.equal(regionCountry('in-tn'), 'IN');
  assert.equal(regionCountry('LK'), 'LK');

  assert.equal(validateLanguage({ code: 'TA', name: 'Tamil', native_name: 'தமிழ்' }), null, 'upper case is tidied, not refused');
  assert.equal(validateLanguage({ code: 'hin', name: 'Hindi', native_name: '' }), null);
  for (const code of ['', 'a', 'abcd', 't1', 'ta-IN', 'த']) assert.match(validateLanguage({ code, name: 'x', native_name: '' }) ?? '', /2 or 3 letters/, code);
  assert.match(validateLanguage({ code: 'ta', name: '  ', native_name: '' }) ?? '', /name is required/);
  assert.match(validateLanguage({ code: 'ta', name: 'x'.repeat(81), native_name: '' }) ?? '', /too long/);
  assert.match(validateLanguage({ code: 'ta', name: 'Tamil', native_name: 'x'.repeat(81) }) ?? '', /too long/);

  assert.equal(validateRegion({ code: 'in', name: 'India' }), null);
  assert.equal(validateRegion({ code: 'IN-TN', name: 'Tamil Nadu' }), null);
  assert.equal(validateRegion({ code: 'IN-A1', name: 'x' }), null);
  for (const code of ['', 'I', 'IND', 'IN-', 'IN-TNNN', 'IN_TN', 'IN-tn!']) assert.match(validateRegion({ code, name: 'x' }) ?? '', /region code/, code);
  assert.match(validateRegion({ code: 'IN', name: '' }) ?? '', /name is required/);

  assert.equal(validateTag({ code: 'sunday-service', label: 'Sunday service' }, 'occasion'), null);
  for (const code of ['', 'Sunday', 'sunday service', '-x', 'x-', 'x--y', 'a'.repeat(41)]) assert.match(validateTag({ code, label: 'x' }, 'genre') ?? '', /genre code/, code);
  assert.match(validateTag({ code: 'ok', label: ' ' }, 'mood') ?? '', /label is required/);
  assert.equal(validateTag({ code: 'xyz', label: 'x' }, 'mood'), null);

  assert.equal(suggestTagCode('Sunday service'), 'sunday-service');
  assert.equal(suggestTagCode('New Year!'), 'new-year');
  assert.equal(suggestTagCode('தமிழ்'), '', 'no Latin letters: the admin types a code');
  assert.ok(suggestTagCode('x'.repeat(100)).length <= 40);
  assert.deepEqual(TAG_KINDS.map((k) => k.kind), ['genre', 'occasion', 'mood']);
});

test('Lists: errors read as sentences', () => {
  assert.equal(explainReferenceError({ code: '23505', message: 'duplicate key value' }, 'save'), 'That code is already in the list.');
  assert.equal(
    explainReferenceError({ code: '23503', message: 'This genre is still in use (artists: 1, songs: 3, listeners: 0, posters: 0, regions inside it: 0). Remove it from them first' }, 'delete'),
    'This genre is still in use (artists: 1, songs: 3, listeners: 0, posters: 0, regions inside it: 0). Remove it from them first.',
  );
  assert.match(explainReferenceError({ code: '23503', message: 'x' }, 'save'), /linked item does not exist/, 'a missing link on save keeps the generic text');
  assert.equal(explainReferenceError({ code: '23514', message: 'A code cannot be changed. Add a new one' }, 'save'), 'A code cannot be changed. Add a new one.');
  assert.match(explainReferenceError({ code: '42501' }, 'delete'), /Not allowed/);
});

test('placeholder pictures: the same name always gets the same colours, taken from the design palette', () => {
  assert.deepEqual(coverColors('Grace Worship Team'), coverColors('Grace Worship Team'));
  assert.deepEqual(coverColors('  grace worship team '), coverColors('Grace Worship Team'), 'spaces and capitals make no difference');
  for (const name of ['A', 'Placeholder Song One', 'தமிழ்', 'Shalom Choir', '']) {
    assert.ok(COVER_PALETTE.some(([a, b]) => coverColors(name)[0] === a && coverColors(name)[1] === b), `"${name}" uses a palette pair`);
  }
  const used = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'].map((n) => coverColors(n)[0]));
  assert.ok(used.size >= 3, 'different names spread over several colours');
  assert.match(coverBackground('x'), /^radial-gradient\(circle at 30% 25%, rgba\(255,255,255,0\.25\), transparent 55%\), linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
});

test('the initial of a name works for any script and never fails', () => {
  assert.equal(initialOf('grace'), 'G');
  assert.equal(initialOf('  zion'), 'Z');
  assert.equal(initialOf('தமிழ்'), 'த');
  assert.equal(initialOf('😀 smile'), '😀');
  assert.equal(initialOf(''), '?');
  assert.equal(initialOf(null), '?');
  assert.equal(initialOf(undefined), '?');
});

test('the profile picture comes from the Google account and only over https', () => {
  assert.equal(pictureFromMetadata({ avatar_url: 'https://lh3.googleusercontent.com/a/abc' }), 'https://lh3.googleusercontent.com/a/abc');
  assert.equal(pictureFromMetadata({ picture: 'https://lh3.googleusercontent.com/a/def' }), 'https://lh3.googleusercontent.com/a/def');
  assert.equal(pictureFromMetadata({ avatar_url: 'https://a.test/1', picture: 'https://a.test/2' }), 'https://a.test/1', 'avatar_url first');
  assert.equal(pictureFromMetadata({ avatar_url: 'http://insecure.test/x.png' }), null);
  assert.equal(pictureFromMetadata({ avatar_url: 'javascript:alert(1)' }), null);
  assert.equal(pictureFromMetadata({ avatar_url: 'not a url' }), null);
  assert.equal(pictureFromMetadata({ avatar_url: 42 }), null);
  assert.equal(pictureFromMetadata({}), null);
  assert.equal(pictureFromMetadata(null), null);
  assert.equal(pictureFromMetadata('text'), null);
});

test('the sign-in method is put in words', () => {
  assert.equal(signInMethodLabel('google'), 'Google');
  assert.match(signInMethodLabel('email'), /test account/);
  assert.equal(signInMethodLabel('github'), 'github');
  assert.equal(signInMethodLabel(undefined), 'Unknown');
  assert.equal(signInMethodLabel(''), 'Unknown');
});

/** A repeatable stand-in for Math.random, so a "random" order can be checked. */
function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

test('repeat cycles off, all, one, off; next wraps only when the whole queue repeats', () => {
  assert.equal(nextRepeatMode('off'), 'all');
  assert.equal(nextRepeatMode('all'), 'one');
  assert.equal(nextRepeatMode('one'), 'off');
  assert.equal(isRepeatMode('all'), true);
  assert.equal(isRepeatMode('loop'), false);
  assert.equal(isRepeatMode(undefined), false);

  assert.equal(nextIndex(3, 0), 1);
  assert.equal(nextIndex(3, 2), null, 'the end of the queue');
  assert.equal(nextIndex(3, 2, true), 0, 'repeat all goes back to the start');
  assert.equal(nextIndex(0, -1, true), null, 'an empty queue has no next song');

  assert.equal(hasNextSong(3, 0, 'off'), true);
  assert.equal(hasNextSong(3, 2, 'off'), false);
  assert.equal(hasNextSong(3, 2, 'one'), false, 'repeat one does not make Next appear at the end');
  assert.equal(hasNextSong(3, 2, 'all'), true);
  assert.equal(hasNextSong(1, 0, 'all'), false, 'one song has nowhere to go');
  assert.equal(hasNextSong(3, -1, 'all'), false, 'nothing is loaded');
});

test('shuffle keeps every song once and the song that is playing first, and never changes the original order', () => {
  const songs = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` }));
  const before = songs.map((s) => s.id).join(',');
  for (const seed of [1, 2, 3, 99, 12345]) {
    const out = shuffleQueue(songs, 's5', seeded(seed));
    assert.equal(out[0].id, 's5', 'the playing song stays first');
    assert.equal(out.length, 12);
    assert.deepEqual(out.map((s) => s.id).sort(), songs.map((s) => s.id).sort(), 'no song lost or doubled');
  }
  assert.equal(songs.map((s) => s.id).join(','), before, 'the input is not changed');
  const a = shuffleQueue(songs, 's0', seeded(7)).map((s) => s.id).join(',');
  const b = shuffleQueue(songs, 's0', seeded(7)).map((s) => s.id).join(',');
  assert.equal(a, b, 'same random numbers, same order');
  const orders = new Set([1, 2, 3, 4, 5, 6].map((seed) => shuffleQueue(songs, 's0', seeded(seed)).map((s) => s.id).join(',')));
  assert.ok(orders.size > 1, 'different random numbers give different orders');
  assert.notEqual(a, before, 'the order really changed');

  assert.deepEqual(shuffleQueue<{ id: string }>([], 'x').map((s) => s.id), []);
  assert.deepEqual(shuffleQueue([{ id: 'only' }], 'only').map((s) => s.id), ['only']);
  assert.equal(shuffleQueue(songs, 'gone', seeded(3)).length, 12, 'a current song that is not in the queue is not invented: every song of the queue is kept');

  // Turning shuffle off puts the playing song back at its own place in the original order.
  assert.equal(indexInOrder(songs, 's7'), 7);
  assert.equal(indexInOrder(songs, 'missing'), 0);
});

test('"Shuffle play" starts from a random song that has audio, and from none when no song has', () => {
  const songs = [
    { id: 'a', has_audio: false },
    { id: 'b', has_audio: true },
    { id: 'c', has_audio: false },
    { id: 'd', has_audio: true },
  ];
  for (const r of [0, 0.3, 0.49, 0.5, 0.99, 0.999999]) {
    assert.ok(['b', 'd'].includes(randomPlayableId(songs, () => r) ?? ''), `random ${r} picks a playable song`);
  }
  assert.equal(randomPlayableId(songs, () => 0), 'b');
  assert.equal(randomPlayableId(songs, () => 0.999999), 'd');
  assert.equal(randomPlayableId([{ id: 'x', has_audio: false }]), null);
  assert.equal(randomPlayableId([]), null);
});

test('shuffle and repeat are remembered on the device, and a damaged value falls back to the plain settings', () => {
  assert.deepEqual(parsePlayerPrefs('{"shuffle":true,"repeat":"all"}'), { shuffle: true, repeat: 'all' });
  assert.deepEqual(parsePlayerPrefs('{"shuffle":"yes","repeat":"sometimes"}'), { shuffle: false, repeat: 'off' });
  assert.deepEqual(parsePlayerPrefs('{"repeat":"one"}'), { shuffle: false, repeat: 'one' });
  assert.deepEqual(parsePlayerPrefs('not json'), { shuffle: false, repeat: 'off' });
  assert.deepEqual(parsePlayerPrefs('null'), { shuffle: false, repeat: 'off' });
  assert.deepEqual(parsePlayerPrefs(null), { shuffle: false, repeat: 'off' });
});

test('heroBackground uses the name colours and always ends in the dark wash', () => {
  const [a, b] = coverColors('Pastor.Veeresh');
  const css = heroBackground('Pastor.Veeresh');
  assert.ok(css.includes(a) && css.includes(b));
  assert.ok(css.endsWith('#1a1230)'));
  assert.equal(heroBackground('  pastor.veeresh '), css);
});

test('timeAgo gives short, plain labels', () => {
  const now = new Date('2030-03-31T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const min = 60_000, hour = 3_600_000, day = 86_400_000;
  assert.equal(timeAgo(null, now), '');
  assert.equal(timeAgo('not a date', now), '');
  assert.equal(timeAgo(ago(20_000), now), 'just now');
  assert.equal(timeAgo(ago(5 * min), now), '5m ago');
  assert.equal(timeAgo(ago(3 * hour), now), '3h ago');
  assert.equal(timeAgo(ago(2 * day), now), '2d ago');
  assert.equal(timeAgo(ago(13 * day), now), '13d ago');
  assert.equal(timeAgo(ago(14 * day), now), '2w ago');
  assert.equal(timeAgo(ago(45 * day), now), '6w ago');
  assert.equal(timeAgo(ago(90 * day), now), '3mo ago');
  assert.equal(timeAgo(ago(800 * day), now), '2y ago');
  assert.equal(timeAgo(new Date(now.getTime() + 5 * day).toISOString(), now), 'just now');
});

test('cleanQuery keeps letters, digits, spaces, apostrophes and hyphens only', () => {
  assert.equal(cleanQuery("x' or 1=1 --"), "x' or 1 1 --");
  assert.equal(cleanQuery('100%'), '100');
  assert.equal(cleanQuery('<script>alert(1)</script>'), 'script alert 1 script');
  assert.equal(cleanQuery('_'), '');
  assert.equal(cleanQuery(undefined), '');
  assert.equal(cleanQuery('  ನನ್ನ   ಕಡೆಗೆ '), 'ನನ್ನ ಕಡೆಗೆ');
  assert.equal(cleanQuery('a'.repeat(100)).length, 60);
});

test('parseSearch drops unknown filter values and takes the first of a repeated one', () => {
  const known = { language: ['ta', 'en'], genre: ['worship'], occasion: ['christmas'], mood: ['joyful'] };
  assert.deepEqual(parseSearch({ q: ' Grace ', language: 'ta', genre: 'worship' }, known), { q: 'Grace', language: 'ta', genre: 'worship' });
  assert.deepEqual(parseSearch({ language: 'xx', genre: ["worship'--"], mood: ['joyful', 'x'] }, known), { q: '', mood: 'joyful' });
  assert.deepEqual(parseSearch({}, known), { q: '' });
});

test('searchHref and hasSearch round-trip', () => {
  assert.equal(searchHref({ q: '' }), '/search');
  assert.equal(searchHref({ q: 'a b', genre: 'worship' }), '/search?q=a+b&genre=worship');
  assert.equal(searchHref({ q: '', language: 'ta', mood: 'joyful' }), '/search?language=ta&mood=joyful');
  assert.equal(hasSearch({ q: '' }), false);
  assert.equal(hasSearch({ q: 'x' }), true);
  for (const kind of FILTER_KINDS) assert.equal(hasSearch({ q: '', [kind]: 'v' }), true);
});

function song(over: Partial<Song> & { id: string; title: string }): Song {
  return {
    slug: over.id, language_code: 'ta', musical_key: null, tempo_bpm: null, duration_s: null, track_no: null, genres: [], occasions: [], moods: [],
    published_at: null, artist_id: 'a', artist_slug: 'a', artist_name: 'Artist', album_id: null, album_slug: null, album_title: null,
    youtube_id: null, like_count: 0, has_audio: true, cover_url: null, ...over,
  };
}

test('list finding is case-blind and looks at title and artist', () => {
  const s = song({ id: '1', title: 'Nanna Kadege', artist_name: 'Pastor.Veeresh' });
  assert.equal(matchesFind(s, ''), true);
  assert.equal(matchesFind(s, '  KADEGE '), true);
  assert.equal(matchesFind(s, 'veeresh'), true);
  assert.equal(matchesFind(s, 'grace'), false);
});

test('sortSlots: custom keeps order, others sort and push empty slots last', () => {
  const slots: Slot[] = [
    { id: 'a', song: song({ id: 'a', title: 'Zion', artist_name: 'B', published_at: '2030-01-01' }) },
    { id: 'gap', song: null },
    { id: 'b', song: song({ id: 'b', title: 'abba', artist_name: 'A', published_at: '2030-03-01' }) },
    { id: 'c', song: song({ id: 'c', title: 'Mercy', artist_name: 'A', published_at: null }) },
  ];
  assert.deepEqual(sortSlots(slots, 'custom').map((s) => s.id), ['a', 'gap', 'b', 'c']);
  assert.deepEqual(sortSlots(slots, 'title').map((s) => s.id), ['b', 'c', 'a', 'gap']);
  assert.deepEqual(sortSlots(slots, 'artist').map((s) => s.id), ['b', 'c', 'a', 'gap']);
  assert.deepEqual(sortSlots(slots, 'newest').map((s) => s.id), ['b', 'a', 'c', 'gap']);
  assert.deepEqual(slots.map((s) => s.id), ['a', 'gap', 'b', 'c'], 'the input is not changed');
});

test('list chips: languages then genres, most common first; kinds combine with and, values with or', () => {
  const songs = [
    song({ id: '1', title: 'One', language_code: 'ta', genres: ['worship'] }),
    song({ id: '2', title: 'Two', language_code: 'en', genres: ['praise', 'worship'] }),
    song({ id: '3', title: 'Three', language_code: 'ta', genres: [] }),
  ];
  const chips = listChips(songs, (c) => ({ ta: 'Tamil', en: 'English' })[c] ?? c, (c) => c.toUpperCase());
  assert.deepEqual(chips.map((c) => c.key), ['language:ta', 'language:en', 'genre:worship', 'genre:praise']);
  assert.deepEqual(chips.map((c) => c.label), ['Tamil', 'English', 'WORSHIP', 'PRAISE']);

  const tamil = toggleChip(NO_CHIPS, chips[0]);
  assert.deepEqual(tamil, { language: ['ta'], genre: [] });
  assert.deepEqual(songs.filter((s) => matchesChips(s, tamil)).map((s) => s.id), ['1', '3']);
  const tamilOrEnglish = toggleChip(tamil, chips[1]);
  assert.deepEqual(songs.filter((s) => matchesChips(s, tamilOrEnglish)).map((s) => s.id), ['1', '2', '3']);
  const andWorship = toggleChip(tamil, chips[2]);
  assert.deepEqual(songs.filter((s) => matchesChips(s, andWorship)).map((s) => s.id), ['1']);
  assert.deepEqual(toggleChip(tamil, chips[0]), NO_CHIPS);
});

test('visibleSlots drops empty slots only when finding or filtering', () => {
  const slots: Slot[] = [
    { id: 'a', song: song({ id: 'a', title: 'Alpha' }) },
    { id: 'gap', song: null },
    { id: 'b', song: song({ id: 'b', title: 'Beta' }) },
  ];
  assert.deepEqual(visibleSlots(slots, '', NO_CHIPS, 'custom').map((s) => s.id), ['a', 'gap', 'b']);
  assert.deepEqual(visibleSlots(slots, 'et', NO_CHIPS, 'custom').map((s) => s.id), ['b']);
  assert.equal(isFiltering('  ', NO_CHIPS), false);
  assert.equal(isFiltering('', { language: ['ta'], genre: [] }), true);
});

test('listenersLabel and likesLabel have the right grammar and digit grouping', () => {
  assert.equal(listenersLabel(0), '0 monthly listeners');
  assert.equal(listenersLabel(1), '1 monthly listener');
  assert.equal(listenersLabel(1234567), '12,34,567 monthly listeners');
  assert.equal(likesLabel(0), '0 likes');
  assert.equal(likesLabel(1), '1 like');
  assert.equal(likesLabel(2500), '2,500 likes');
});

test('songCountLabel has the right grammar', () => {
  assert.equal(songCountLabel(0), '0 songs');
  assert.equal(songCountLabel(1), '1 song');
  assert.equal(songCountLabel(2), '2 songs');
});

test('labels name codes and fall back to the code itself', () => {
  const labels = makeLabels([{ code: 'ta', name: 'Tamil', native_name: null }], [{ kind: 'genre', code: 'worship', label: 'Worship' }]);
  assert.equal(labels.languageName('ta'), 'Tamil');
  assert.equal(labels.languageName('xx'), 'xx');
  assert.equal(labels.tagLabel('genre', 'worship'), 'Worship');
  assert.equal(labels.tagLabel('mood', 'worship'), 'worship', 'a code is looked up inside its own kind');
});

test('Google Drive share links become thumbnail addresses; other https links are kept; anything else is no picture', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123';
  const thumb = `https://drive.google.com/thumbnail?id=${id}&sz=w600`;
  assert.equal(driveFileId(`https://drive.google.com/file/d/${id}/view?usp=sharing`), id);
  assert.equal(driveFileId(`https://drive.google.com/file/u/0/d/${id}/view`), id);
  assert.equal(driveFileId(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(driveFileId(`https://drive.google.com/uc?export=view&id=${id}`), id);
  assert.equal(driveFileId(`https://drive.google.com/thumbnail?id=${id}&sz=w100`), id);
  assert.equal(driveFileId('https://drive.google.com/drive/folders/abc'), null);
  assert.equal(driveFileId(`http://drive.google.com/file/d/${id}/view`), null);
  assert.equal(driveFileId(`https://evil.example/file/d/${id}/view`), null);
  assert.equal(driveFileId('https://drive.google.com/file/d/short/view'), null);

  assert.equal(displayImageUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`), thumb);
  assert.equal(displayImageUrl(`https://drive.google.com/open?id=${id}`, 1200), `https://drive.google.com/thumbnail?id=${id}&sz=w1200`);
  assert.equal(displayImageUrl(`https://drive.google.com/open?id=${id}`, 10), `https://drive.google.com/thumbnail?id=${id}&sz=w64`);
  assert.equal(displayImageUrl(`https://drive.google.com/open?id=${id}`, 99999), `https://drive.google.com/thumbnail?id=${id}&sz=w2000`);
  assert.equal(displayImageUrl('https://cdn.example.org/p.jpg'), 'https://cdn.example.org/p.jpg');
  assert.equal(displayImageUrl('  https://cdn.example.org/p.jpg  '), 'https://cdn.example.org/p.jpg');
  assert.equal(displayImageUrl('http://cdn.example.org/p.jpg'), null);
  assert.equal(displayImageUrl('javascript:alert(1)'), null);
  assert.equal(displayImageUrl('https://x.org/a b.jpg'), null);
  assert.equal(displayImageUrl(''), null);
  assert.equal(displayImageUrl(null), null);
});

test('the poster strip moves on and wraps, and reads its place from the scroll', () => {
  assert.equal(nextSlide(0, 3), 1);
  assert.equal(nextSlide(2, 3), 0, 'after the last comes the first');
  assert.equal(nextSlide(0, 1), 0);
  assert.equal(nextSlide(5, 0), 0);
  assert.equal(slideFromScroll(0, 354, 3), 0);
  assert.equal(slideFromScroll(180, 354, 3), 1);
  assert.equal(slideFromScroll(170, 354, 3), 0);
  assert.equal(slideFromScroll(684, 354, 3), 2, 'the last slide stops a little short of its snap point');
  assert.equal(slideFromScroll(9999, 354, 3), 2);
  assert.equal(slideFromScroll(-20, 354, 3), 0);
  assert.equal(slideFromScroll(100, 0, 3), 0);
  assert.equal(slideFromScroll(100, 354, 0), 0);
});


test('checkPictureFile accepts JPG, PNG and WebP up to 20 MB and refuses the rest', () => {
  assert.deepEqual(checkPictureFile({ type: 'image/jpeg', size: 1000 }), { ok: true });
  assert.deepEqual(checkPictureFile({ type: 'image/png', size: 1000 }), { ok: true });
  assert.deepEqual(checkPictureFile({ type: 'image/webp', size: 20 * 1024 * 1024 }), { ok: true });
  assert.equal(checkPictureFile({ type: 'image/gif', size: 1000 }).ok, false);
  assert.equal(checkPictureFile({ type: 'application/pdf', size: 1000 }).ok, false);
  assert.equal(checkPictureFile({ type: '', size: 1000 }).ok, false);
  assert.equal(checkPictureFile({ type: 'image/png', size: 0 }).ok, false);
  assert.equal(checkPictureFile({ type: 'image/png', size: 20 * 1024 * 1024 + 1 }).ok, false);
});

test('fitWithin never enlarges, keeps the shape and gives whole pixels', () => {
  assert.deepEqual(fitWithin(2400, 1200, 800), { width: 800, height: 400 });
  assert.deepEqual(fitWithin(3000, 2000, 1400), { width: 1400, height: 933 });
  assert.deepEqual(fitWithin(500, 300, 800), { width: 500, height: 300 });
  assert.deepEqual(fitWithin(800, 800, 800), { width: 800, height: 800 });
  assert.deepEqual(fitWithin(10000, 1, 800), { width: 800, height: 1 });
  assert.deepEqual(fitWithin(0, 100, 800), { width: 1, height: 1 });
  assert.equal(PICTURE_MAX_WIDTH.poster > PICTURE_MAX_WIDTH.artist, true);
});

test('pictureObjectName puts each picture in its own folder with the right extension', () => {
  assert.equal(pictureObjectName('artist', 'abc', 'image/webp'), 'artist/abc.webp');
  assert.equal(pictureObjectName('poster', 'abc', 'image/jpeg'), 'poster/abc.jpg');
  assert.equal(pictureObjectName('song', 'abc', 'image/png'), 'song/abc.png');
});


test('isNativeUserAgent recognises the app by the word its shell adds', () => {
  assert.equal(isNativeUserAgent(`Mozilla/5.0 (Linux; Android 15) ${NATIVE_UA_MARKER}/1`), true);
  assert.equal(isNativeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), false);
  assert.equal(isNativeUserAgent(''), false);
  assert.equal(isNativeUserAgent(null), false);
  assert.equal(isNativeUserAgent(undefined), false);
});

test('nativeCallbackToWebPath finishes a sign-in only for our own callback', () => {
  const code = 'abcDEF123456_-.~xyz';
  assert.equal(nativeCallbackToWebPath(`com.psalmsplayer.app://auth-callback?code=${code}`), `/auth/callback?code=${code}&next=%2F`);
  assert.equal(nativeCallbackToWebPath(`com.psalmsplayer.app://auth-callback/?code=${code}`), `/auth/callback?code=${code}&next=%2F`);
  // a callback that carries an error, no code, or a code of the wrong shape goes back to the sign-in page
  assert.equal(nativeCallbackToWebPath('com.psalmsplayer.app://auth-callback?error=access_denied'), '/login?error=callback');
  assert.equal(nativeCallbackToWebPath('com.psalmsplayer.app://auth-callback'), '/login?error=callback');
  assert.equal(nativeCallbackToWebPath('com.psalmsplayer.app://auth-callback?code=short'), '/login?error=callback');
  assert.equal(nativeCallbackToWebPath(`com.psalmsplayer.app://auth-callback?code=${code}&error=x`), '/login?error=callback');
  assert.equal(nativeCallbackToWebPath(`com.psalmsplayer.app://auth-callback?code=${'a'.repeat(300)}`), '/login?error=callback');
  // anything else is not ours
  assert.equal(nativeCallbackToWebPath('https://psalmsplayer.com/auth/callback?code=' + code), null);
  assert.equal(nativeCallbackToWebPath(`com.psalmsplayer.app://other?code=${code}`), null);
  assert.equal(nativeCallbackToWebPath(`com.psalmsplayer.app://auth-callbackevil?code=${code}`), null);
  assert.equal(nativeCallbackToWebPath(`javascript:alert(1)`), null);
});

test('the Android shell config stays in step with the website code', () => {
  const config = readFileSync(new URL('../../capacitor.config.ts', import.meta.url), 'utf8');
  const prepare = readFileSync(new URL('../../scripts/android/prepare.mjs', import.meta.url), 'utf8');
  // the user agent the app adds is the word the website looks for (a mismatch would show the Admin site inside the app)
  assert.ok(config.includes(`appendUserAgent: '${NATIVE_UA_MARKER}/`), 'capacitor.config.ts must append the NATIVE_UA_MARKER user agent');
  // the sign-in return address starts with the app id, and the manifest patch registers the same address
  const appId = /appId: '([^']+)'/.exec(config)?.[1];
  assert.ok(appId, 'capacitor.config.ts must set appId');
  assert.ok(NATIVE_AUTH_CALLBACK.startsWith(`${appId}://`), 'the sign-in return address must use the app id as its scheme');
  const host = NATIVE_AUTH_CALLBACK.slice(`${appId}://`.length);
  assert.ok(prepare.includes(`const APP_ID = '${appId}'`), 'prepare.mjs must use the same app id');
  assert.ok(prepare.includes(`const AUTH_HOST = '${host}'`), 'prepare.mjs must register the same return host');
  // the app opens the live site
  assert.ok(config.includes("url: 'https://psalmsplayer.com'"));
});
