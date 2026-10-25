import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Geist, Roboto_Mono } from 'next/font/google';
import DemoTour from '@/components/DemoTour';
import '@/styles/globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const robotoMono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ReProducer',
  description: 'Reproduces the bugs you cannot reproduce, fixes them, and asks before opening a pull request.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* It reads the URL, which needs a Suspense boundary with cacheComponents. */}
        <Suspense fallback={null}>
          <DemoTour />
        </Suspense>
      </body>
    </html>
  );
}
