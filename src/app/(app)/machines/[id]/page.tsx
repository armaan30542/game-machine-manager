"use client";

import { use } from "react";
import { MachineDetailPageClient } from "@/components/machines/machine-detail-page-client";

export default function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <MachineDetailPageClient id={id} />;
}
