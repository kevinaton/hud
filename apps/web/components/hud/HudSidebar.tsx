'use client';

/**
 * HudSidebar — shadcn Sidebar-based navigation drawer.
 *
 * On mobile (< 768 px): opens as a Sheet (slide-in from left) triggered by
 * SidebarTrigger in HudHeader.
 * On desktop: collapsed off-canvas by default (top nav handles navigation).
 *
 * NAV_ITEMS mirrors AppNavDrawer structure. Uses shadcn Sidebar primitives
 * with HUD dark tokens applied via sidebar CSS vars in globals.css.
 */

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  {
    label: 'Finance',
    href: '/finance/cashflow',
    match: '/finance',
    children: [
      { label: 'Cashflow', href: '/finance/cashflow' },
      { label: 'Airbnb', href: '/finance/airbnb' },
      { label: 'Reports', href: '/finance/cashflow/report' },
    ],
  },
  {
    label: 'Logs',
    href: '/logs',
    match: '/logs',
    children: [] as { label: string; href: string }[],
  },
  {
    label: 'Nexus',
    href: '/nexus',
    match: '/nexus',
    children: [] as { label: string; href: string }[],
  },
] as const;

function NavItems() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.match);
        return (
          <div key={item.href}>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                size="lg"
                className="rounded-none font-body uppercase tracking-[0.12em] text-[13px] text-sidebar-foreground data-[active=true]:text-accent data-[active=true]:bg-sidebar-accent"
              >
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  {isActive && (
                    <span aria-hidden="true" className="mr-1 h-4 w-0.5 shrink-0 bg-accent" />
                  )}
                  {item.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Sub-items — always visible when parent section is active */}
            {item.children.length > 0 && isActive && (
              <div className="pb-1">
                {item.children.map((child) => {
                  const childActive =
                    pathname === child.href || pathname.startsWith(`${child.href}/`);
                  return (
                    <SidebarMenuItem key={child.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={childActive}
                        size="sm"
                        className="rounded-none pl-7 font-body text-[13px] text-sidebar-foreground data-[active=true]:text-accent data-[active=true]:bg-transparent"
                      >
                        <Link href={child.href} onClick={() => setOpenMobile(false)}>
                          {child.label}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </SidebarMenu>
  );
}

export function HudSidebar() {
  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      {/* Header — HUD wordmark */}
      <SidebarHeader className="h-14 flex-row items-center justify-start border-b border-sidebar-border px-4 py-0">
        <Link
          href="/finance/cashflow"
          className="font-display text-[13px] uppercase tracking-[0.2em] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          HUD
        </Link>
      </SidebarHeader>

      {/* Nav links */}
      <SidebarContent className="px-2 py-3">
        <NavItems />
      </SidebarContent>
    </Sidebar>
  );
}
