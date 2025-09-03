import type {Metadata} from 'next';
import './globals.css';
import {APIProvider} from '@vis.gl/react-google-maps';
import {Toaster} from '@/components/ui/toaster';
import {cn} from '@/lib/utils';

export const metadata: Metadata = {
  title: 'GeoHex Uberizer',
  description: 'Generate Uber H3 hexagons within a polygon',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className={cn('font-body antialiased', 'min-h-screen bg-background')}>
        <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
          {children}
        </APIProvider>
        <Toaster />
      </body>
    </html>
  );
}
