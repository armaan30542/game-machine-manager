"use client";

import { useUser } from "@/hooks/use-user";
import type { UserRole } from "@/types/database";

interface RoleGateProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ requiredRole, children, fallback = null }: RoleGateProps) {
  const { profile } = useUser();

  if (requiredRole === "admin" && profile?.role !== "admin") {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
