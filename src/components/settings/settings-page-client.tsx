"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SettingsClient } from "@/components/settings/settings-client";
import { useSettings } from "@/hooks/use-settings";
import { useProfile } from "@/hooks/use-profile";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SettingsPageClient() {
  const { data: profiles, isLoading } = useSettings();
  const { isAdmin, isLoading: profileLoading } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [profileLoading, isAdmin, router]);

  if (profileLoading || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage users and app settings
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <SettingsClient profiles={profiles ?? []} />
      )}
    </div>
  );
}
