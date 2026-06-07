import type { Metadata } from 'next';
import { Orbitron, Oxanium } from 'next/font/google';
import './globals.css';

// Orbitron: 400 (hero numerics, wordmark) + 700 (bold headings, tab labels).
// Orbitron does not have a 300 weight on Google Fonts; 400 is the lightest available.
// Weights 500/900 were previously loaded but are not used in the Figma design.
const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['400', '700'],
  display: 'swap',
});

// Oxanium: 400 (body, captions, metadata) + 500 (section headers, uppercase labels).
// Weights 300/600 were previously loaded but are not used in the Figma design.
const oxanium = Oxanium({
  subsets: ['latin'],
  variable: '--font-oxanium',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HUD',
  description: 'Operator console — authorized personnel only',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${orbitron.variable} ${oxanium.variable}`}>
      <body>{children}</body>
    </html>
  );
}
