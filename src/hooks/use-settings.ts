"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export function useSettings() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["settings-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      return (data ?? []) as Profile[];
    },
  });
}
