import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="flex items-center gap-2 border-b px-4 py-3 md:px-6">
          <SidebarTrigger className="md:hidden" />
        </div>
        <div className="p-4 pb-20 md:p-6 md:pb-6">{children}</div>
      </main>
      <MobileNav />
    </SidebarProvider>
  );
}
