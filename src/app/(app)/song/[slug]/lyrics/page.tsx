import { loadSongScreen } from '../load';
import SongScreen from '../SongScreen';

export const dynamic = 'force-dynamic';

// The lyrics on their own, without starting the song. Whatever is playing keeps playing.
export default async function SongLyricsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadSongScreen(slug, `/song/${slug}/lyrics`);
  return <SongScreen key={data.song.id} {...data} mode="lyrics" />;
}
