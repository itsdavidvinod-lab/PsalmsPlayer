// Run with:  node --experimental-strip-types --test src/lib/lib.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChordPro, transposeChord, transposeKey, transposeLines, semitonesBetween, prefersFlats, stripChords, toPlainText,
} from './chordpro.ts';
import { extractYoutubeId, youtubeWatchUrl } from './youtube.ts';
import { buildShareUrl, safeNextPath } from './share.ts';

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
import { nextIndex, playableQueue, previousStep } from './queue.ts';
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
