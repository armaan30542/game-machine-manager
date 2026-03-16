"use client";

import { use } from "react";
import { LocationDetailClient } from "@/components/locations/location-detail-client";

export default function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <LocationDetailClient id={id} />;
}
