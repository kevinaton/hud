/**
 * POST /api/profile/avatar
 *
 * Upload a new avatar image for the authenticated user.
 *
 * Accepts multipart/form-data with a single 'avatar' file field.
 * Constraints: JPEG, PNG, or WebP only; max 2 MB.
 *
 * Saves file to public/uploads/avatars/<userId>.<ext>
 * Updates users.avatar_path and writes audit_log in one transaction.
 *
 * Returns { avatarPath: string } on success.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getCsrfCookieValue } from '@/lib/auth/cookie';
import { extractCsrfFromRequest, verifyCsrfToken } from '@/lib/auth/csrf';
import { requireSession } from '@/lib/auth/index';
import { updateUserProfile } from '@/lib/db/users';
import { type NextRequest, NextResponse } from 'next/server';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';

  // 1. Session check
  const ctx = await requireSession('response');
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. CSRF check (token in custom header)
  const csrfCookie = await getCsrfCookieValue();
  const csrfHeader = extractCsrfFromRequest(req.headers);
  if (!verifyCsrfToken(csrfCookie, csrfHeader)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  // 3. Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('avatar');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'avatar field is required' }, { status: 400 });
  }

  // 4. Validate type
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, or WebP images are allowed' },
      { status: 400 },
    );
  }

  // 5. Validate size
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 2 MB limit' }, { status: 400 });
  }

  // 6. Write file
  const filename = `${ctx.userId}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
  const filePath = path.join(uploadDir, filename);
  const avatarPath = `/uploads/avatars/${filename}`;

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  // 7. Update DB + audit
  const updated = updateUserProfile(
    ctx.userId,
    { avatarPath },
    { actor: 'user', ipAddress: ip, userAgent },
  );

  return NextResponse.json({
    avatarPath: updated.avatarPath ?? avatarPath,
  });
}
