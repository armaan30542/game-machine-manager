"use client";

import { useProfile } from "@/hooks/use-profile";
import type { UserRole } from "@/types/database";

interface RoleGateProps {
  requiredRole: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ requiredRole, children, fallback = null }: RoleGateProps) {
  const { profile } = useProfile();

  if (requiredRole === "admin" && profile?.role !== "admin") {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
