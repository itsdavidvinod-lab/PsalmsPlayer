import Link from 'next/link';

// Used for songs, albums and artists that do not exist AND ones that are hidden. The page never says which.
// Shown inside the app frame, so the player keeps going.
export default function NotFound() {
  return (
    <div className="card empty">
      <h1>Not available</h1>
      <p>This page does not exist or is not available right now.</p>
      <Link href="/" className="btn btn-primary">Back to Home</Link>
    </div>
  );
}
