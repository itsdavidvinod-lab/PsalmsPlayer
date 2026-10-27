import { loadSongScreen } from './load';
import SongScreen from './SongScreen';

export const dynamic = 'force-dynamic';

// A song with an audio file opens the player (lyrics and controls). A song without one opens its lyrics.
export default async function SongPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadSongScreen(slug, `/song/${slug}`);
  return <SongScreen key={data.song.id} {...data} mode={data.song.has_audio ? 'player' : 'lyrics'} />;
}
