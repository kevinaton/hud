'use client';

/**
 * LogEntryActions — approve / reject / "don't ask again" buttons for a pending log_entry.
 *
 * Per hud-audit: all writes go through the API routes (session + CSRF gated).
 * CSRF token is read from the hud_csrf cookie client-side, same as TransactionModal.
 *
 * Shows:
 *   - "Approve" (accent)
 *   - "Approve + Rule" (ghost) — approves and inserts auto_approve rule
 *   - "Reject" (destructive) with inline reason input
 *
 * Per hud-ui: no box-shadow, 2px radius, accent/destructive/ghost variants only.
 */

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

interface LogEntryActionsProps {
  entryId: number;
}

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)hud_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function LogEntryActions({ entryId }: LogEntryActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'approveRule' | 'reject' | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  const doApprove = useCallback(
    async (autoApprove = false) => {
      const key = autoApprove ? 'approveRule' : 'approve';
      setLoading(key);
      setError(null);
      try {
        const res = await fetch(`/api/logs/${entryId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken(),
          },
          body: JSON.stringify({ autoApprove }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? 'Approval failed');
          return;
        }
        router.refresh();
      } catch {
        setError('Network error');
      } finally {
        setLoading(null);
      }
    },
    [entryId, router],
  );

  const doReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      reasonRef.current?.focus();
      return;
    }
    setLoading('reject');
    setError(null);
    try {
      const res = await fetch(`/api/logs/${entryId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Rejection failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(null);
    }
  }, [entryId, rejectReason, router]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {/* Approve */}
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => doApprove(false)}
          className={cn(
            'rounded-[var(--radius)] bg-accent px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.12em] text-accent-fg',
            'hover:opacity-90 disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          {loading === 'approve' ? '…' : 'Approve'}
        </button>

        {/* Approve + auto rule */}
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => doApprove(true)}
          className={cn(
            'rounded-[var(--radius)] border border-border px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.12em] text-muted',
            'hover:text-foreground hover:border-foreground disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
          title="Approve and always auto-approve this type"
        >
          {loading === 'approveRule' ? '…' : 'Approve + Rule'}
        </button>

        {/* Reject */}
        {!showReject ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => setShowReject(true)}
            className={cn(
              'rounded-[var(--radius)] border border-destructive px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.12em] text-destructive',
              'hover:bg-destructive hover:text-white disabled:opacity-40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            Reject
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              ref={reasonRef}
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason..."
              maxLength={200}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') doReject();
                if (e.key === 'Escape') setShowReject(false);
              }}
              className={cn(
                'h-8 w-36 rounded-[var(--radius)] border border-border bg-transparent px-2',
                'font-body text-[12px] text-foreground placeholder:text-muted',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            />
            <button
              type="button"
              disabled={loading !== null || !rejectReason.trim()}
              onClick={doReject}
              className={cn(
                'rounded-[var(--radius)] bg-destructive px-3 py-1.5 font-display text-[11px] uppercase tracking-[0.12em] text-white',
                'hover:opacity-90 disabled:opacity-40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              {loading === 'reject' ? '…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setShowReject(false)}
              className="font-body text-[12px] text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && <p className="font-body text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
