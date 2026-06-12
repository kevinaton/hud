'use client';

/**
 * LogsSettingsPanel — approval toggle + whitelist display.
 *
 * Shows:
 *   - Global approval required toggle (POST /api/logs/settings)
 *   - Whitelist entries (display only)
 *
 * Per hud-ui skill: surface-2 card, border-border, no shadows.
 */

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

interface WhitelistEntry {
  id: number;
  sender: string;
  enabled: number;
  note: string | null;
}

interface LogsSettingsPanelProps {
  approvalRequired: boolean;
  whitelist: WhitelistEntry[];
}

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)hud_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function LogsSettingsPanel({ approvalRequired, whitelist }: LogsSettingsPanelProps) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleApproval = useCallback(async () => {
    setToggling(true);
    setError(null);
    try {
      const res = await fetch('/api/logs/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ approvalRequired: !approvalRequired }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Failed to update setting');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setToggling(false);
    }
  }, [approvalRequired, router]);

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-4">
      <h3 className="mb-4 font-body text-[12px] uppercase tracking-[0.18em] text-muted">
        Settings
      </h3>

      {/* Approval required toggle */}
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="font-body text-[14px] text-foreground">Approval required</p>
          <p className="font-body text-[12px] text-muted">
            When on, new entries need manual approval before being recorded.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={approvalRequired}
          disabled={toggling}
          onClick={toggleApproval}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:opacity-40',
            approvalRequired ? 'border-accent bg-accent' : 'border-border bg-surface',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-accent-fg transition-transform',
              approvalRequired ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      {error && <p className="mt-2 font-body text-[12px] text-destructive">{error}</p>}

      {/* Whitelist */}
      {whitelist.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="mb-2 font-body text-[12px] uppercase tracking-[0.18em] text-muted">
            Sender Whitelist
          </h4>
          <ul className="space-y-1">
            {whitelist.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 rounded-full', entry.enabled ? 'bg-success' : 'bg-muted')}
                  aria-label={entry.enabled ? 'Enabled' : 'Disabled'}
                />
                <span className="font-body text-[13px] text-foreground">{entry.sender}</span>
                {entry.note && (
                  <span className="font-body text-[12px] text-muted">— {entry.note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
