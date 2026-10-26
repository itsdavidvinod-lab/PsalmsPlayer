import Link from 'next/link';
import Header from '@/components/Header';

// Used for songs that do not exist AND songs that are hidden. The page never says which.
export default function NotFound() {
  return (
    <div className="wrap">
      <Header />
      <div className="card empty">
        <h1>Not available</h1>
        <p>This page does not exist or is not available right now.</p>
        <Link href="/" className="btn btn-primary">Back to Home</Link>
      </div>
    </div>
  );
}
