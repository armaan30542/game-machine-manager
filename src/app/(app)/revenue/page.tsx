import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RevenueClient } from "@/components/revenue/revenue-client";

export default async function RevenuePage() {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const { data: revenueRecords } = await supabase
    .from("revenue_records")
    .select("*, locations:location_id(location_number, name, state)")
    .order("period_end", { ascending: false });

  const { data: locations } = await supabase
    .from("locations")
    .select("id, location_number, name, state, percentage_share, fees, revenue_url")
    .is("close_date", null)
    .order("location_number");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="text-sm text-muted-foreground">
          Track revenue across all locations
        </p>
      </div>

      <RevenueClient
        revenueRecords={revenueRecords ?? []}
        locations={locations ?? []}
        isAdmin={isAdmin}
      />
    </div>
  );
}
