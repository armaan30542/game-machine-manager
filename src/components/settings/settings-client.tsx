"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Profile, UserRole } from "@/types/database";

interface SettingsClientProps {
  profiles: Profile[];
}

export function SettingsClient({ profiles }: SettingsClientProps) {
  return (
    <div className="space-y-6">
      <UserManagement profiles={profiles} />
    </div>
  );
}

function UserManagement({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("reporting");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const supabase = createClient();

  async function handleInvite() {
    if (!email) return;
    setLoading(true);

    try {
      // Create user via Supabase Auth admin API
      // Note: This requires the service role key, so we'll call via API route
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: fullName, role }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Invited ${email}`);
        setOpen(false);
        setEmail("");
        setFullName("");
        setRole("reporting");
        queryClient.invalidateQueries();
      } else {
        toast.error(data.error || "Failed to invite user");
      }
    } catch {
      toast.error("Failed to invite user");
    }

    setLoading(false);
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      toast.error("Failed to update role");
    } else {
      toast.success("Role updated");
      queryClient.invalidateQueries();
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Manage user access and roles
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button />}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite User
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite User</DialogTitle>
                <DialogDescription>
                  Send an invitation email to a new user.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email *</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-name">Full Name</Label>
                  <Input
                    id="invite-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={role}
                    onValueChange={(v) => v && setRole(v as UserRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reporting">Reporting</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInvite} disabled={!email || loading}>
                  {loading ? "Inviting..." : "Send Invite"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.full_name || "-"}
                </TableCell>
                <TableCell>{p.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={p.role === "admin" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {p.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(p.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Select
                    value={p.role}
                    onValueChange={(v) =>
                      v && handleRoleChange(p.id, v as UserRole)
                    }
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reporting">Reporting</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
