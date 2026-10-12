import type { Metadata, Viewport } from 'next';
import { DM_Serif_Display, Manrope } from 'next/font/google';
import './globals.css';

const display = DM_Serif_Display({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-dm-serif', display: 'swap' });
const body = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Bite & Sips', template: '%s | Bite & Sips' },
  description: 'Good food. Good mood. Order for pickup or delivery from Bite & Sips.',
};

export const viewport: Viewport = {
  themeColor: '#35251f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GH" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
