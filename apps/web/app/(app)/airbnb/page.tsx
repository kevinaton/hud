/**
 * app/(app)/airbnb/page.tsx
 *
 * Permanent redirect — Airbnb moved to /finance/airbnb.
 */

import { redirect } from 'next/navigation';

export default function AirbnbRedirect() {
  redirect('/finance/airbnb');
}
