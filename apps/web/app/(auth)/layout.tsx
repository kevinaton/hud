/**
 * (auth) route group layout.
 * Unauthenticated area — no requireSession call here.
 * Renders the login/signup pages with the HUD grid background.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HUD — Authenticate',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
