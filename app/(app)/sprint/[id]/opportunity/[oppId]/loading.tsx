import { Skeleton } from "@/components/ui/Skeleton";

export default function OpportunityLoading() {
  return (
    <main className="w-full px-6 py-8 lg:px-8">
      <Skeleton className="mb-5 h-4 w-28" />
      <Skeleton className="mb-3 h-10 w-2/3" />
      <Skeleton className="mb-6 h-16 w-full" />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </main>
  );
}
