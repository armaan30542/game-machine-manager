"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Search, MapPin } from "lucide-react";
import type { LocationWithCounts } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";

interface LocationsClientProps {
  locations: LocationWithCounts[];
}

export function LocationsClient({ locations }: LocationsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const filtered = locations.filter((loc) => {
    const matchesSearch =
      search === "" ||
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.location_number.toLowerCase().includes(search.toLowerCase()) ||
      loc.city.toLowerCase().includes(search.toLowerCase());

    const matchesState =
      stateFilter === "all" || loc.state === stateFilter;

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !loc.close_date) ||
      (statusFilter === "closed" && loc.close_date);

    return matchesSearch && matchesState && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, location #, or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={(v) => v && setStateFilter(v)}>
          <SelectTrigger className="w-full sm:w-[120px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="VA">Virginia</SelectItem>
            <SelectItem value="TX">Texas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-center">Machines</TableHead>
              <TableHead className="text-center">Contract</TableHead>
              <TableHead className="text-right">% Share</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No locations found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((loc) => (
                <TableRow
                  key={loc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/locations/${loc.id}`)}
                >
                  <TableCell className="font-medium text-primary">
                    {loc.location_number}
                  </TableCell>
                  <TableCell>{loc.name}</TableCell>
                  <TableCell>{loc.city}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{loc.state}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {loc.machines?.[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="text-center">
                    {loc.has_contract ? (
                      <Badge variant="default" className="bg-green-600">Yes</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{loc.percentage_share}%</TableCell>
                  <TableCell>
                    {loc.close_date ? (
                      <Badge variant="destructive">Closed</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No locations found
          </p>
        ) : (
          filtered.map((loc) => (
            <Link key={loc.id} href={`/locations/${loc.id}`}>
              <Card className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">
                          {loc.location_number}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {loc.state}
                        </Badge>
                        {loc.close_date ? (
                          <Badge variant="destructive" className="text-xs">
                            Closed
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium">{loc.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {loc.city}, {loc.state}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium">
                        {loc.machines?.[0]?.count ?? 0} machines
                      </p>
                      <p className="text-muted-foreground">
                        {loc.percentage_share}% share
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {locations.length} locations
      </p>
    </div>
  );
}
