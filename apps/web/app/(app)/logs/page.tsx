/**
 * app/(app)/logs/page.tsx
 *
 * Logs tab — React Server Component.
 *
 * Shows all ingested email log_entries, filterable by status and kind.
 * Pending entries show Approve / Reject / "Approve + Rule" actions.
 * parse_failed and DKIM-rejected entries show status_reason; no actions.
 * Settings panel: approval toggle + whitelist display.
 *
 * Per hud-audit: approve/reject go through /api/logs/[id]/* routes.
 * Per hud-ui: no raw email body exposed — only parsed_json summary.
 */

import { GridOverlay } from '@/components/hud/GridOverlay';
import { HazardStripe } from '@/components/hud/HazardStripe';
import { LogEntryActions } from '@/components/hud/LogEntryActions';
import { LogsFilterBar } from '@/components/hud/LogsFilterBar';
import { LogsSettingsPanel } from '@/components/hud/LogsSettingsPanel';
import { Money } from '@/components/hud/Money';
import { requireSession } from '@/lib/auth/index';
import {
  type ListEntriesFilter,
  type LogStatus,
  getApprovalRequired,
  listEntries,
  listWhitelist,
} from '@/lib/db/logs';
import type { LogEntry } from '@hud/db';
import { Suspense } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const classMap: Record<string, string> = {
    pending: 'text-warning border-warning',
    recorded: 'text-success border-success',
    rejected: 'text-destructive border-destructive',
    parse_failed: 'text-muted border-muted',
  };
  const cls = classMap[status] ?? 'text-muted border-muted';
  return (
    <span
      className={`inline-block rounded-[var(--radius)] border px-2 py-0.5 font-body text-[11px] uppercase tracking-[0.1em] ${cls}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    'airbnb.reservation_confirmed': 'Confirmation',
    'airbnb.cancellation': 'Cancellation',
    'airbnb.payout': 'Payout',
    unknown: 'Unknown',
  };
  return map[kind] ?? kind;
}

function ParsedSummary({
  parsedJson,
  kind,
}: { parsedJson: string | null | undefined; kind: string }) {
  if (!parsedJson) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(parsedJson) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (kind === 'airbnb.reservation_confirmed') {
    return (
      <div className="mt-1 space-y-0.5 font-body text-[12px] text-muted">
        {parsed.confirmationCode != null && (
          <span>
            Code: <span className="text-foreground tabular">{String(parsed.confirmationCode)}</span>
          </span>
        )}
        {parsed.guestName != null && (
          <span className="ml-2">
            · Guest: <span className="text-foreground">{String(parsed.guestName)}</span>
          </span>
        )}
        {parsed.projectedEarningMinor != null && (
          <span className="ml-2">
            · Earn: <Money amountMinor={Number(parsed.projectedEarningMinor)} currency="PHP" />
          </span>
        )}
      </div>
    );
  }

  if (kind === 'airbnb.cancellation') {
    return (
      <div className="mt-1 space-y-0.5 font-body text-[12px] text-muted">
        {parsed.confirmationCode != null && (
          <span>
            Code: <span className="text-foreground tabular">{String(parsed.confirmationCode)}</span>
          </span>
        )}
        {parsed.guestName != null && (
          <span className="ml-2">
            · Guest: <span className="text-foreground">{String(parsed.guestName)}</span>
          </span>
        )}
      </div>
    );
  }

  if (kind === 'airbnb.payout') {
    const items = Array.isArray(parsed.items)
      ? (parsed.items as Array<Record<string, unknown>>)
      : [];
    return (
      <div className="mt-1 font-body text-[12px] text-muted">
        {parsed.payoutTotalMinor != null && (
          <span>
            Total: <Money amountMinor={Number(parsed.payoutTotalMinor)} currency="PHP" />
          </span>
        )}
        <span className="ml-2">
          · {items.length} reservation{items.length !== 1 ? 's' : ''}
        </span>
        {parsed.sentDate != null && (
          <span className="ml-2">
            · Sent: <span className="text-foreground tabular">{String(parsed.sentDate)}</span>
          </span>
        )}
      </div>
    );
  }

  return null;
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const isPending = entry.status === 'pending';
  const isActionable = isPending;
  const isFailed = entry.status === 'parse_failed' || entry.statusReason === 'dkim_fail';

  return (
    <article className="border-b border-border px-4 py-3 last:border-0">
      {/* Top row: kind + status + date */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-body text-[13px] font-[500] uppercase tracking-[0.1em] text-foreground">
            {kindLabel(entry.kind)}
          </span>
          {statusBadge(entry.status)}
        </div>
        <time
          dateTime={entry.receivedAt}
          className="font-body text-[12px] tabular text-muted shrink-0"
        >
          {entry.receivedAt.slice(0, 10)}
        </time>
      </div>

      {/* Subject */}
      {entry.subject && <p className="mt-0.5 font-body text-[13px] text-muted">{entry.subject}</p>}

      {/* Parsed summary — NO raw body, only structured fields */}
      <ParsedSummary parsedJson={entry.parsedJson} kind={entry.kind} />

      {/* Status reason for failed/rejected */}
      {(isFailed || entry.status === 'rejected') && entry.statusReason && (
        <p className="mt-1 font-body text-[12px] text-destructive">{entry.statusReason}</p>
      )}

      {/* Approve/reject actions — pending only */}
      {isActionable && (
        <div className="mt-3">
          <LogEntryActions entryId={entry.id} />
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSession();
  const { userId } = ctx;

  const resolvedParams = await searchParams;
  const rawStatus = typeof resolvedParams.status === 'string' ? resolvedParams.status : '';
  const rawKind = typeof resolvedParams.kind === 'string' ? resolvedParams.kind : '';

  const filter: ListEntriesFilter = {
    limit: 100,
  };
  if (rawStatus) filter.status = rawStatus as LogStatus;
  if (rawKind) filter.kind = rawKind;

  const entries = listEntries(userId, filter);
  const approvalRequired = getApprovalRequired(userId);
  const whitelist = listWhitelist(userId);

  const pendingCount = entries.filter((e) => e.status === 'pending').length;

  return (
    <main className="relative flex-1">
      <GridOverlay />

      <div className="relative z-10 flex flex-col flex-1">
        {/* Pending count hero */}
        {pendingCount > 0 && (
          <div className="px-4 py-4">
            <div className="rounded-[var(--radius)] border border-warning bg-surface px-4 py-3">
              <p className="font-display tabular text-[28px] font-[300] text-warning">
                {pendingCount}
              </p>
              <p className="font-body text-[12px] uppercase tracking-[0.18em] text-muted">
                {pendingCount === 1 ? 'Entry' : 'Entries'} awaiting review
              </p>
            </div>
          </div>
        )}

        <HazardStripe />

        {/* Entries section */}
        <section className="px-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="font-body text-[12px] uppercase tracking-[0.18em] text-muted">
              Log Entries
            </h2>
            <span className="font-body text-[12px] tabular text-muted">{entries.length}</span>
          </div>

          {/* Filter bar — client component */}
          <Suspense>
            <LogsFilterBar />
          </Suspense>

          {entries.length === 0 ? (
            <p className="px-4 py-8 font-body text-[14px] text-muted text-center">
              No entries found.
            </p>
          ) : (
            <div className="bg-surface">
              {entries.map((entry) => (
                <LogEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>

        <HazardStripe />

        {/* Settings panel */}
        <section className="px-4 py-4">
          <h2 className="mb-3 font-body text-[12px] uppercase tracking-[0.18em] text-muted">
            Ingestion Settings
          </h2>
          <LogsSettingsPanel
            approvalRequired={approvalRequired}
            whitelist={whitelist.map((w) => ({
              id: w.id,
              sender: w.sender,
              enabled: w.enabled,
              note: w.note,
            }))}
          />
        </section>
      </div>
    </main>
  );
}
