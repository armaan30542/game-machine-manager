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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, MoreHorizontal, KeyRound, Trash2, Shield, Plus, X, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useMachineTypes } from "@/hooks/use-machine-types";
import { addMachineType, deleteMachineType } from "@/actions/machine-type-actions";
import type { Profile, UserRole } from "@/types/database";

const MAIN_ADMIN_EMAIL = "cg.ne.printer@gmail.com";

interface SettingsClientProps {
  profiles: Profile[];
}

export function SettingsClient({ profiles }: SettingsClientProps) {
  return (
    <div className="space-y-6">
      <UserManagement profiles={profiles} />
      <MachineTypesManager />
    </div>
  );
}

function UserManagement({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("reporting");
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const supabase = createClient();

  async function handleInvite() {
    if (!email) return;
    setLoading(true);

    try {
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

  async function handleRoleChange(userId: string, userEmail: string, newRole: UserRole) {
    if (userEmail === MAIN_ADMIN_EMAIL && newRole !== "admin") {
      toast.error("Cannot change the role of the main admin");
      return;
    }

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

  async function handleSendResetPassword(email: string) {
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Password reset email sent to ${email}`);
      } else {
        toast.error(data.error || "Failed to send reset email");
      }
    } catch {
      toast.error("Failed to send reset email");
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const res = await fetch("/api/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: deleteTarget.id,
          userEmail: deleteTarget.email,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Deleted user ${deleteTarget.email}`);
        queryClient.invalidateQueries();
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    }

    setDeleting(false);
    setDeleteTarget(null);
  }

  const isMainAdmin = (email: string) => email === MAIN_ADMIN_EMAIL;

  return (
    <>
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
                    <div className="flex items-center gap-2">
                      {p.full_name || "-"}
                      {isMainAdmin(p.email) && (
                        <Shield className="h-4 w-4 text-primary" />
                      )}
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Select
                        value={p.role}
                        onValueChange={(v) =>
                          v && handleRoleChange(p.id, p.email, v as UserRole)
                        }
                        disabled={isMainAdmin(p.email)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reporting">Reporting</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleSendResetPassword(p.email)}
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            Send Password Reset
                          </DropdownMenuItem>
                          {!isMainAdmin(p.email) && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.email}</strong>? This action cannot be
              undone. The user will lose all access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MachineTypesManager() {
  const { data: types = [], isLoading } = useMachineTypes();
  const [newType, setNewType] = useState("");
  const [adding, setAdding] = useState(false);
  const [typeSearch, setTypeSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const filtered = types.filter((t) =>
    t.toLowerCase().includes(typeSearch.toLowerCase())
  );

  async function handleAdd() {
    if (!newType.trim()) return;
    setAdding(true);
    const result = await addMachineType(newType);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Added "${newType.trim()}"`);
      setNewType("");
      queryClient.invalidateQueries({ queryKey: ["machine-types"] });
    }
    setAdding(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteMachineType(deleteTarget);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Deleted "${deleteTarget}"`);
      queryClient.invalidateQueries({ queryKey: ["machine-types"] });
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Machine Types</CardTitle>
          <CardDescription>
            Manage the list of machine types available in the dropdown when creating or editing machines.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="New machine type name..."
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={!newType.trim() || adding}>
              <Plus className="mr-2 h-4 w-4" />
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search types..."
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="max-h-80 overflow-y-auto border rounded-md">
              {filtered.map((t) => (
                <div
                  key={t}
                  className="flex items-center justify-between px-3 py-2 border-b last:border-0 hover:bg-muted/50"
                >
                  <span className="text-sm">{t}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(t)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No machine types found
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {types.length} types total. Types in use by machines cannot be deleted.
          </p>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine Type</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteTarget}&quot;? This will only succeed if no
              machines currently use this type.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
