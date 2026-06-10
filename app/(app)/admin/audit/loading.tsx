import { Skeleton } from "@/components/ui/Skeleton";

export default function AuditLoading() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-8">
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-6 h-4 w-96" />
      <Skeleton className="mb-5 h-20 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </main>
  );
}
