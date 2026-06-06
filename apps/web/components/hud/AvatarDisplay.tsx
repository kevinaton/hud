/**
 * AvatarDisplay
 *
 * Shows the user's avatar image if avatarPath is set.
 * Falls back to an initials-based placeholder styled with the cyberpunk cyan accent.
 *
 * Initials are derived from:
 *   - displayName: first letter of each word, max 2
 *   - email (fallback): first letter before "@"
 *
 * Per hud-ui skill: background uses --accent token (no inline hex).
 */
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface AvatarDisplayProps {
  avatarPath?: string | null;
  displayName?: string | null;
  email?: string;
  /** Pixel size of the avatar circle. Defaults to 64. */
  size?: number;
  className?: string;
}

/** Derive up to 2 initials from a display name or email. */
function getInitials(displayName?: string | null, email?: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length === 1) return (parts[0]?.[0] ?? '').toUpperCase();
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  if (email) {
    const local = email.split('@')[0] ?? '';
    return (local[0] ?? '').toUpperCase();
  }
  return '?';
}

export function AvatarDisplay({
  avatarPath,
  displayName,
  email,
  size = 64,
  className,
}: AvatarDisplayProps) {
  const initials = getInitials(displayName, email);

  if (avatarPath) {
    return (
      <div
        className={cn('relative overflow-hidden rounded-[var(--radius)]', className)}
        style={{ width: size, height: size, flexShrink: 0 }}
      >
        <Image
          src={avatarPath}
          alt={displayName ?? email ?? 'Avatar'}
          fill
          className="object-cover"
          sizes={`${size}px`}
        />
      </div>
    );
  }

  // Initials fallback — cyan background, dark text
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[var(--radius)] bg-accent text-accent-fg font-display font-[700] select-none tabular',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), flexShrink: 0 }}
      aria-label={`Avatar for ${displayName ?? email ?? 'user'}`}
    >
      {initials}
    </div>
  );
}
