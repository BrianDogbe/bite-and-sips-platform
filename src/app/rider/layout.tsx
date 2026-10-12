import type { Metadata, Viewport } from 'next';
import { RegisterSW } from '@/components/rider/RegisterSW';

export const metadata: Metadata = {
  title: 'Rider',
  manifest: '/rider/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'B&S Rider', statusBarStyle: 'default' },
  icons: { icon: '/icons/rider-192.png', apple: '/icons/rider-192.png' },
};
export const viewport: Viewport = { themeColor: '#35251f', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RegisterSW />
    </>
  );
}
