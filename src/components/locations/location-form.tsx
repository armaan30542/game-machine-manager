"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createLocation,
  updateLocation,
  getNextLocationNumber,
} from "@/actions/location-actions";
import { toast } from "sonner";
import type { Location } from "@/types/database";

interface LocationFormProps {
  location?: Location;
}

export function LocationForm({ location }: LocationFormProps) {
  const router = useRouter();
  const isEdit = !!location;
  const [loading, setLoading] = useState(false);
  const [previewNumber, setPreviewNumber] = useState<string>("");

  const [form, setForm] = useState({
    name: location?.name ?? "",
    address_line1: location?.address_line1 ?? "",
    address_line2: location?.address_line2 ?? "",
    city: location?.city ?? "",
    county: location?.county ?? "",
    state: (location?.state as "VA" | "TX") ?? "VA",
    zipcode: location?.zipcode ?? "",
    phone: location?.phone ?? "",
    email: location?.email ?? "",
    contact_name: location?.contact_name ?? "",
    contact_phone: location?.contact_phone ?? "",
    has_contract: location?.has_contract ?? false,
    percentage_share: location?.percentage_share ?? 50,
    fees: location?.fees ?? 0,
    revenue_url: location?.revenue_url ?? "",
    comments: location?.comments ?? "",
  });

  useEffect(() => {
    if (isEdit) return;
    getNextLocationNumber(form.state as "VA" | "TX").then((res) => {
      if (res.number) setPreviewNumber(res.number);
    });
  }, [form.state, isEdit]);

  function updateField(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...form,
      address_line2: form.address_line2 || null,
      county: form.county || null,
      phone: form.phone || null,
      email: form.email || null,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      revenue_url: form.revenue_url || null,
      comments: form.comments || null,
      percentage_share: Number(form.percentage_share),
      fees: Number(form.fees),
    };

    if (isEdit) {
      const result = await updateLocation(location!.id, payload);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Location updated");
        router.push(`/locations/${location!.id}`);
      }
    } else {
      const result = await createLocation(
        payload as Parameters<typeof createLocation>[0]
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Location created");
        router.push(`/locations/${result.id}`);
      }
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Location Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {isEdit ? (
              <div className="space-y-2">
                <Label>Location Number</Label>
                <Input value={location!.location_number} disabled />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Location Number</Label>
                <p className="text-sm font-mono font-medium border rounded-md px-3 py-2 bg-muted">
                  {previewNumber || "..."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Auto-generated from state
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Store name"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address_line1">Address Line 1 *</Label>
            <Input
              id="address_line1"
              value={form.address_line1}
              onChange={(e) => updateField("address_line1", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_line2">Address Line 2</Label>
            <Input
              id="address_line2"
              value={form.address_line2}
              onChange={(e) => updateField("address_line2", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">County</Label>
              <Input
                id="county"
                value={form.county}
                onChange={(e) => updateField("county", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select
                value={form.state}
                onValueChange={(v) => v && updateField("state", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VA">Virginia</SelectItem>
                  <SelectItem value="TX">Texas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipcode">Zipcode *</Label>
              <Input
                id="zipcode"
                value={form.zipcode}
                onChange={(e) => updateField("zipcode", e.target.value)}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Store Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Store Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                value={form.contact_name}
                onChange={(e) => updateField("contact_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                value={form.contact_phone}
                onChange={(e) => updateField("contact_phone", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="has_contract"
              checked={form.has_contract}
              onCheckedChange={(v) => updateField("has_contract", v)}
            />
            <Label htmlFor="has_contract">Has Contract</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="percentage_share">Percentage Share (%)</Label>
              <Input
                id="percentage_share"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.percentage_share}
                onChange={(e) =>
                  updateField("percentage_share", e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fees">Fees ($)</Label>
              <Input
                id="fees"
                type="number"
                min="0"
                step="0.01"
                value={form.fees}
                onChange={(e) => updateField("fees", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="revenue_url">Revenue URL</Label>
            <Input
              id="revenue_url"
              value={form.revenue_url}
              onChange={(e) => updateField("revenue_url", e.target.value)}
              placeholder="URL for fetching revenue data"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={form.comments}
              onChange={(e) => updateField("comments", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
              ? "Save Changes"
              : "Create Location"}
        </Button>
      </div>
    </form>
  );
}
