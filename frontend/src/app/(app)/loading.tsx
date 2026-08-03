import { Skeleton } from '@/components/ui/skeleton';

/**
 * Fallback de Suspense do segmento. O App Router faz streaming do shell
 * imediatamente e troca por este skeleton — a tela nunca fica em branco.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-xl" />
        ))}
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[168px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
