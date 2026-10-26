// Run with:  node --experimental-strip-types --test src/lib/lib.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChordPro, transposeChord, transposeKey, transposeLines, semitonesBetween, prefersFlats, stripChords, toPlainText,
} from './chordpro.ts';
import { extractYoutubeId, youtubeEmbedUrl } from './youtube.ts';
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

test('embed URL is built only from a valid id', () => {
  assert.match(youtubeEmbedUrl('dQw4w9WgXcQ'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  assert.throws(() => youtubeEmbedUrl('x"><script>'));
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
