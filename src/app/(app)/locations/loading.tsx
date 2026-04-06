import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-1 h-4 w-56" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-[120px]" />
        <Skeleton className="h-10 w-[130px]" />
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
