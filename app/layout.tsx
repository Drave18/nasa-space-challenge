import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'NASA Mission Gallery', template: '%s · NASA Mission Gallery' },
  description: 'Interactive 3D gallery of NASA missions built from scraped NASA Science and NSSDCA pages.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
