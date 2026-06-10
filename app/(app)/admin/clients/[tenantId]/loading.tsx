import { Skeleton } from "@/components/ui/Skeleton";

export default function ClientDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-8">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-9 w-64" />
      <Skeleton className="mb-6 h-4 w-40" />
      <div className="mb-5 flex gap-2 border-b border-border pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </main>
  );
}
