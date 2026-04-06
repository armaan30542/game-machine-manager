"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { InventoryClient } from "@/components/machines/inventory-client";
import { useInventory } from "@/hooks/use-inventory";
import { useProfile } from "@/hooks/use-profile";

export function InventoryPageClient() {
  const { data, isLoading } = useInventory();
  const { isAdmin } = useProfile();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Machines and dispensers available for deployment
          </p>
        </div>
        {isAdmin && (
          <Link href="/inventory/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Register New
            </Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <InventoryClient
          machines={data?.machines ?? []}
          dispensers={data?.dispensers ?? []}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
