import type { Metadata, Viewport } from 'next';
import { DM_Sans, Lora } from 'next/font/google';
import { APP_NAME } from '@/lib/brand';
import './globals.css';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Lora({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Songs, lyrics and chords for the Christian community.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f2a6b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
