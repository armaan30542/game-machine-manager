"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { XCircle, RotateCcw, Minus } from "lucide-react";
import { closeLocation, reopenLocation } from "@/actions/location-actions";
import { removeDispenserFromLocation } from "@/actions/dispenser-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Location } from "@/types/database";

interface LocationActionsProps {
  location: Location;
  isAdmin: boolean;
  dispenserId?: string;
  showDispenserRemove?: boolean;
}

export function LocationActions({
  location,
  isAdmin,
  dispenserId,
  showDispenserRemove,
}: LocationActionsProps) {
  const [loading, setLoading] = useState(false);
  const [closeDate, setCloseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [closeNotes, setCloseNotes] = useState("");
  const router = useRouter();

  if (!isAdmin) return null;

  async function handleClose() {
    setLoading(true);
    const result = await closeLocation(location.id, closeDate, closeNotes);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Location closed successfully");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleReopen() {
    setLoading(true);
    const result = await reopenLocation(location.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Location reopened");
      router.refresh();
    }
    setLoading(false);
  }

  async function handleRemoveDispenser() {
    if (!dispenserId) return;
    setLoading(true);
    const result = await removeDispenserFromLocation(dispenserId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Dispenser removed from location");
      router.refresh();
    }
    setLoading(false);
  }

  if (showDispenserRemove && dispenserId) {
    return (
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Minus className="h-4 w-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Dispenser</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the dispenser back to inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveDispenser} disabled={loading}>
              {loading ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (location.close_date) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleReopen}
        disabled={loading}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        {loading ? "Reopening..." : "Reopen"}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <XCircle className="mr-2 h-4 w-4" />
        Close Location
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close Location</AlertDialogTitle>
          <AlertDialogDescription>
            This will move all machines and the dispenser (if any) back to
            inventory and mark this location as closed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="closeDate">Close Date</Label>
            <Input
              id="closeDate"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="closeNotes">Notes (optional)</Label>
            <Textarea
              id="closeNotes"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Reason for closing..."
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClose}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Closing..." : "Close Location"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
