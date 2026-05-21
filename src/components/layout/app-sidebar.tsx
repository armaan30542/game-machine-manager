"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  MapPin,
  Package,
  DollarSign,
  CalendarRange,
  AlertTriangle,
  History,
  Settings,
  Gamepad2,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { useIdleMachines } from "@/hooks/use-idle-machines";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

const navItems: {
  title: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Locations", href: "/locations", icon: MapPin },
  { title: "Inventory", href: "/inventory", icon: Package },
  { title: "Revenue", href: "/revenue", icon: DollarSign, exact: true },
  { title: "Revenue by Date", href: "/revenue/by-date", icon: CalendarRange },
  { title: "Activity", href: "/activity", icon: History },
];

const adminItems = [
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const { data: idle } = useIdleMachines();
  const router = useRouter();
  const supabase = createClient();
  const idleCount = idle?.count ?? 0;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Gamepad2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">Game Manager</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} className="w-full">
                    <SidebarMenuButton
                      isActive={
                        item.exact
                          ? pathname === item.href
                          : pathname.startsWith(item.href)
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
              {idleCount > 0 && (
                <SidebarMenuItem>
                  <Link href="/revenue/idle" className="w-full">
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/revenue/idle")}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      <span>0 Revenue</span>
                    </SidebarMenuButton>
                  </Link>
                  <SidebarMenuBadge>{idleCount}</SidebarMenuBadge>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {profile?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.href} className="w-full">
                      <SidebarMenuButton
                        isActive={pathname.startsWith(item.href)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium truncate max-w-[140px]">
              {profile?.full_name || profile?.email}
            </span>
            <Badge variant="outline" className="w-fit text-xs capitalize">
              {profile?.role}
            </Badge>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-2 hover:bg-gray-100 text-gray-500"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
