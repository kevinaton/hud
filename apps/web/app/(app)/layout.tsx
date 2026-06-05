/**
 * (app) route group layout — protected area.
 *
 * Every page under (app)/ requires an authenticated session.
 * requireSession() will redirect to /login if no valid session exists.
 */

import { requireSession } from '@/lib/auth/index';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HUD',
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This throws a redirect to /login if not authenticated.
  // The return value (ctx) can be passed to child layouts via context if needed.
  await requireSession();

  return <>{children}</>;
}
