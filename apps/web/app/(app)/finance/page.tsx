/**
 * app/(app)/finance/page.tsx
 *
 * Permanent redirect to /finance/cashflow — no flash, no render.
 */

import { redirect } from 'next/navigation';

export default function FinancePage() {
  redirect('/finance/cashflow');
}
