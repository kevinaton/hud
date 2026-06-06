'use client';

/**
 * _ProfileClient.tsx
 *
 * Client component that renders the interactive profile UI:
 *   - Avatar display + upload button
 *   - Edit username/email form
 *   - Change password form
 *   - Log out button
 *
 * All forms use the CSRF double-submit pattern: token is read from the hud_csrf
 * cookie (set by the server) and sent as X-CSRF-Token header.
 */

import { AvatarDisplay } from '@/components/hud/AvatarDisplay';
import { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the CSRF token from the hud_csrf cookie (non-httpOnly). */
function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;)\s*hud_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1] ?? '') : '';
}

async function apiFetch(
  url: string,
  method: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; data?: unknown; error?: string; issues?: Record<string, string[]> }> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      error: (data as { error?: string }).error ?? 'Request failed',
      issues: (data as { issues?: Record<string, string[]> }).issues,
    };
  }
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// AvatarSection
// ---------------------------------------------------------------------------

interface AvatarSectionProps {
  userId: number;
  avatarPath: string | null;
  displayName: string | null;
  email: string;
  onAvatarUpdated: (newPath: string) => void;
}

function AvatarSection({
  userId,
  avatarPath,
  displayName,
  email,
  onAvatarUpdated,
}: AvatarSectionProps) {
  const [currentAvatar, setCurrentAvatar] = useState(avatarPath);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      const form = new FormData();
      form.append('avatar', file);

      try {
        const res = await fetch('/api/profile/avatar', {
          method: 'POST',
          headers: { 'X-CSRF-Token': getCsrfToken() },
          body: form,
        });

        const data = (await res.json().catch(() => ({}))) as {
          avatarPath?: string;
          error?: string;
        };

        if (!res.ok) {
          setError(data.error ?? 'Upload failed');
          return;
        }

        if (data.avatarPath) {
          // Append cache-buster so Next Image re-fetches
          const busted = `${data.avatarPath}?v=${Date.now()}`;
          setCurrentAvatar(busted);
          onAvatarUpdated(busted);
        }
      } catch {
        setError('Network error during upload');
      } finally {
        setUploading(false);
        // Reset file input so the same file can trigger onChange again
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [onAvatarUpdated],
  );

  return (
    <div className="flex flex-col items-center gap-4 py-6 border-b border-border">
      <AvatarDisplay avatarPath={currentAvatar} displayName={displayName} email={email} size={96} />

      <div className="flex flex-col items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          id={`avatar-upload-${userId}`}
          onChange={handleFileChange}
          aria-label="Upload avatar image"
        />
        <label
          htmlFor={`avatar-upload-${userId}`}
          className="cursor-pointer rounded-[var(--radius)] border border-accent px-4 py-1.5 font-body text-accent uppercase tracking-[0.1em] hover:bg-accent hover:text-accent-fg transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-background"
          style={{ fontSize: '12px' }}
        >
          {uploading ? 'Uploading…' : 'Change Avatar'}
        </label>
        {error && (
          <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
            {error}
          </p>
        )}
        <p className="font-body text-muted" style={{ fontSize: '11px' }}>
          JPEG, PNG, or WebP · max 2 MB
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditProfileForm
// ---------------------------------------------------------------------------

interface EditProfileFormProps {
  displayName: string | null;
  email: string;
  onUpdated: (fields: { displayName: string | null; email: string }) => void;
}

function EditProfileForm({ displayName, email, onUpdated }: EditProfileFormProps) {
  const [name, setName] = useState(displayName ?? '');
  const [mail, setMail] = useState(email);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setSuccess(false);
      setFieldErrors({});

      const body: Record<string, string> = {};
      if (name !== (displayName ?? '')) body.displayName = name;
      if (mail !== email) body.email = mail;

      if (Object.keys(body).length === 0) {
        setLoading(false);
        setSuccess(true);
        return;
      }

      const result = await apiFetch('/api/profile', 'PUT', body);
      setLoading(false);

      if (!result.ok) {
        setError(result.error ?? 'Update failed');
        if (result.issues) setFieldErrors(result.issues);
        return;
      }

      const updated = result.data as { displayName: string | null; email: string };
      onUpdated({ displayName: updated.displayName, email: updated.email });
      setSuccess(true);
    },
    [name, mail, displayName, email, onUpdated],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-6 border-b border-border">
      <h2
        className="font-body text-muted uppercase"
        style={{ fontSize: '12px', letterSpacing: '0.18em' }}
      >
        Profile
      </h2>

      {/* Username */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="display-name"
          className="font-body text-muted uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.12em' }}
        >
          Username
        </label>
        <input
          id="display-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full bg-transparent border border-border px-3 py-2 font-body text-foreground rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ fontSize: '14px' }}
          placeholder="Your name"
        />
        {fieldErrors.displayName && (
          <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
            {fieldErrors.displayName[0]}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="email"
          className="font-body text-muted uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.12em' }}
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          required
          className="w-full bg-transparent border border-border px-3 py-2 font-body text-foreground rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ fontSize: '14px' }}
          placeholder="you@example.com"
        />
        {fieldErrors.email && (
          <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
            {fieldErrors.email[0]}
          </p>
        )}
      </div>

      {error && (
        <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
          {error}
        </p>
      )}
      {success && (
        <p className="font-body text-success" style={{ fontSize: '12px' }}>
          Profile updated.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[var(--radius)] bg-accent text-accent-fg font-body uppercase tracking-[0.1em] py-2 hover:opacity-90 disabled:opacity-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ fontSize: '13px' }}
      >
        {loading ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ChangePasswordForm
// ---------------------------------------------------------------------------

function ChangePasswordForm() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setSuccess(false);
      setFieldErrors({});

      // Client-side confirmation check before hitting the server
      if (newPw !== confirmPw) {
        setFieldErrors({ confirmPassword: ['Passwords do not match'] });
        setLoading(false);
        return;
      }

      const result = await apiFetch('/api/profile/password', 'PUT', {
        currentPassword: currentPw,
        newPassword: newPw,
        confirmPassword: confirmPw,
      });

      setLoading(false);

      if (!result.ok) {
        setError(result.error ?? 'Password change failed');
        if (result.issues) setFieldErrors(result.issues);
        return;
      }

      setSuccess(true);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    },
    [currentPw, newPw, confirmPw],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-6 border-b border-border">
      <h2
        className="font-body text-muted uppercase"
        style={{ fontSize: '12px', letterSpacing: '0.18em' }}
      >
        Change Password
      </h2>

      {/* Current password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="current-password"
          className="font-body text-muted uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.12em' }}
        >
          Current Password
        </label>
        <input
          id="current-password"
          type="password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full bg-transparent border border-border px-3 py-2 font-body text-foreground rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ fontSize: '14px' }}
        />
      </div>

      {/* New password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="new-password"
          className="font-body text-muted uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.12em' }}
        >
          New Password
        </label>
        <input
          id="new-password"
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          className="w-full bg-transparent border border-border px-3 py-2 font-body text-foreground rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ fontSize: '14px' }}
        />
        {fieldErrors.newPassword && (
          <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
            {fieldErrors.newPassword[0]}
          </p>
        )}
        <p className="font-body text-muted" style={{ fontSize: '11px' }}>
          Minimum 8 characters
        </p>
      </div>

      {/* Confirm password */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="confirm-password"
          className="font-body text-muted uppercase"
          style={{ fontSize: '11px', letterSpacing: '0.12em' }}
        >
          Confirm Password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full bg-transparent border border-border px-3 py-2 font-body text-foreground rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ fontSize: '14px' }}
        />
        {fieldErrors.confirmPassword && (
          <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
            {fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {error && (
        <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
          {error}
        </p>
      )}
      {success && (
        <p className="font-body text-success" style={{ fontSize: '12px' }}>
          Password changed.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[var(--radius)] bg-accent text-accent-fg font-body uppercase tracking-[0.1em] py-2 hover:opacity-90 disabled:opacity-50 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ fontSize: '13px' }}
      >
        {loading ? 'Updating…' : 'Change Password'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// LogoutButton
// ---------------------------------------------------------------------------

function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (res.ok) {
        window.location.href = '/login';
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Logout failed');
        setLoading(false);
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }, []);

  return (
    <div className="py-6 flex flex-col gap-2">
      {error && (
        <p className="font-body text-destructive" style={{ fontSize: '12px' }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="w-full rounded-[var(--radius)] border border-destructive text-destructive font-body uppercase tracking-[0.1em] py-2 hover:bg-destructive hover:text-foreground disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ fontSize: '13px' }}
      >
        {loading ? 'Logging out…' : 'Log Out'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileClient (root export)
// ---------------------------------------------------------------------------

export interface ProfileClientProps {
  userId: number;
  email: string;
  displayName: string | null;
  avatarPath: string | null;
}

export function ProfileClient({ userId, email, displayName, avatarPath }: ProfileClientProps) {
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [currentAvatarPath, setCurrentAvatarPath] = useState(avatarPath);

  const handleProfileUpdated = useCallback(
    (fields: { displayName: string | null; email: string }) => {
      setCurrentDisplayName(fields.displayName);
      setCurrentEmail(fields.email);
    },
    [],
  );

  return (
    <div className="flex flex-col px-4">
      <AvatarSection
        userId={userId}
        avatarPath={currentAvatarPath}
        displayName={currentDisplayName}
        email={currentEmail}
        onAvatarUpdated={setCurrentAvatarPath}
      />

      <EditProfileForm
        displayName={currentDisplayName}
        email={currentEmail}
        onUpdated={handleProfileUpdated}
      />

      <ChangePasswordForm />

      <LogoutButton />
    </div>
  );
}
