import { Skeleton } from "@/components/ui/Skeleton";

export default function SprintLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Skeleton className="mb-2 h-8 w-80" />
      <Skeleton className="mb-6 h-4 w-[28rem]" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </main>
  );
}
