import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import NativeBridge from '@/components/NativeBridge';
import { APP_NAME } from '@/lib/brand';
import './globals.css';

const sans = Open_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Songs, lyrics and chords for the Christian community.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        {children}
        <NativeBridge />
      </body>
    </html>
  );
}
