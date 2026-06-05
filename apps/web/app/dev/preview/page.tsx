/**
 * /dev/preview — visual preview of all HUD components.
 * Not linked in prod nav; accessible only by direct URL.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { HazardStripe } from '@/components/hud/HazardStripe';
import { Money } from '@/components/hud/Money';
import { NumericDisplay } from '@/components/hud/NumericDisplay';
import { TabBar } from '@/components/hud/TabBar';
import { TransactionRow } from '@/components/hud/TransactionRow';
import type { TransactionDisplay } from '@/components/hud/TransactionRow';
import { WarningCounter } from '@/components/hud/WarningCounter';

const TABS = [
  { label: 'Cashflow', href: '/finance/cashflow' },
  { label: 'Report', href: '/finance/report' },
];

const SAMPLE_TXS: TransactionDisplay[] = [
  {
    id: 1,
    item: 'Clean',
    amountMinor: -28000,
    currency: 'PHP',
    occurredAt: '2026-06-24T00:00:00+08:00',
    category: 'Airbnb',
  },
  {
    id: 2,
    item: 'Jeep',
    amountMinor: -28000,
    currency: 'PHP',
    occurredAt: '2026-06-24T00:00:00+08:00',
    category: 'Transportation',
  },
  {
    id: 3,
    item: 'Airbnb Payout',
    amountMinor: 1929384500,
    currency: 'PHP',
    occurredAt: '2026-06-20T00:00:00+08:00',
    category: 'Airbnb',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2
        className="mb-4 font-body uppercase text-muted"
        style={{ fontSize: '11px', letterSpacing: '0.18em' }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

export default function DevPreviewPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <GridOverlay />
      <div className="relative z-10 mx-auto max-w-lg px-4 py-12">
        <h1
          className="mb-8 font-display text-foreground"
          style={{ fontSize: '48px', fontWeight: 400, letterSpacing: '0.08em' }}
        >
          HUD / Preview
        </h1>

        {/* GridOverlay */}
        <Section title="GridOverlay (behind page)">
          <p className="font-body text-muted text-[13px]">
            Active — the faint grid you see behind this page.
          </p>
        </Section>

        {/* HazardStripe */}
        <Section title="HazardStripe">
          <HazardStripe />
          <div className="mt-2">
            <HazardStripe height={32} />
          </div>
        </Section>

        {/* NumericDisplay */}
        <Section title="NumericDisplay">
          <div className="space-y-4">
            <div>
              <p className="mb-1 font-body text-muted-2 text-[11px] uppercase tracking-widest">
                hero — net income
              </p>
              <NumericDisplay
                value="P125,999,597"
                variant="hero"
                delta={{ value: 20, positive: true }}
              />
            </div>
            <div>
              <p className="mb-1 font-body text-muted-2 text-[11px] uppercase tracking-widest">
                display — sub-card
              </p>
              <NumericDisplay
                value="P192,938.45"
                variant="display"
                delta={{ value: 5, positive: true }}
              />
            </div>
            <div>
              <p className="mb-1 font-body text-muted-2 text-[11px] uppercase tracking-widest">
                display — negative delta
              </p>
              <NumericDisplay
                value="P192,938.45"
                variant="display"
                delta={{ value: 20, positive: false }}
              />
            </div>
            <div>
              <p className="mb-1 font-body text-muted-2 text-[11px] uppercase tracking-widest">
                inline
              </p>
              <NumericDisplay value="42" variant="inline" />
            </div>
          </div>
        </Section>

        {/* TabBar */}
        <Section title="TabBar">
          <TabBar tabs={TABS} active="/finance/cashflow" />
          <div className="mt-4">
            <TabBar tabs={TABS} active="/finance/report" />
          </div>
        </Section>

        {/* WarningCounter */}
        <Section title="WarningCounter">
          <div className="flex gap-12">
            <WarningCounter count={0} />
            <WarningCounter count={2} />
            <WarningCounter count={5} />
          </div>
        </Section>

        {/* Money */}
        <Section title="Money">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <Money amountMinor={12599959700} currency="PHP" className="text-[32px]" />
              <span className="font-body text-muted-2 text-[11px]">
                12,599,959,700 minor → no decimals
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Money amountMinor={19293845} currency="PHP" className="text-[32px]" />
              <span className="font-body text-muted-2 text-[11px]">
                19,293,845 minor → 2 decimals
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Money amountMinor={-28000} currency="PHP" className="text-[32px]" />
              <span className="font-body text-muted-2 text-[11px]">-28000 minor → negative</span>
            </div>
            <div className="flex items-center gap-4">
              <Money
                amountMinor={19293845}
                currency="PHP"
                variant="neutral"
                className="text-[32px]"
              />
              <span className="font-body text-muted-2 text-[11px]">neutral variant</span>
            </div>
          </div>
        </Section>

        {/* TransactionRow */}
        <Section title="TransactionRow">
          <div className="border-t border-border">
            {SAMPLE_TXS.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
