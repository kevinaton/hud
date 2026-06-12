/**
 * app/(app)/profile/layout.tsx
 *
 * Profile section shell.
 * Header is provided by the parent (app)/layout.tsx via HudHeader.
 */

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
