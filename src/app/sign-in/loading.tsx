import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Skeleton className="mb-5 h-12 w-12 rounded-2xl" />
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-3 h-3.5 w-full max-w-[19rem]" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-[46px] w-full rounded-xl" />
          <Skeleton className="h-[46px] w-full rounded-xl" />
          <Skeleton className="mt-6 h-[38px] w-full rounded-xl" />
          <Skeleton className="h-[46px] w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
