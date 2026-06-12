'use client';

/**
 * HudSidebar — mobile navigation drawer (shadcn Sidebar).
 *
 * Mobile (< 768 px): opens as a Sheet triggered by SidebarTrigger in HudHeader.
 * Desktop: collapsed off-canvas — top navbar in HudHeader handles navigation.
 *
 * 3 flat items only: Finance | Logs | Nexus.
 * Finance sub-tabs (Cashflow / Airbnb / Reports) live in FinanceSubTabs, not here.
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
  { label: 'Finance', href: '/finance/cashflow', match: '/finance' },
  { label: 'Logs', href: '/logs', match: '/logs' },
  { label: 'Nexus', href: '/nexus', match: '/nexus' },
] as const;

function NavItems() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.match);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              size="lg"
              className="rounded-none font-body uppercase tracking-[0.12em] text-[13px]"
            >
              <Link href={item.href} onClick={() => setOpenMobile(false)}>
                {isActive && (
                  <span aria-hidden="true" className="mr-1 h-4 w-0.5 shrink-0 bg-accent" />
                )}
                {item.label}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function HudSidebar() {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-14 flex-row items-center border-b border-sidebar-border px-4 py-0">
        <Link
          href="/finance/cashflow"
          className="font-display text-[13px] uppercase tracking-[0.2em] text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          HUD
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <NavItems />
      </SidebarContent>
    </Sidebar>
  );
}
