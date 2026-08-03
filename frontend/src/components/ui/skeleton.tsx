import { cn } from '@/lib/utils';

/**
 * Skeleton com a **forma** do conteúdo real. Um spinner genérico faz o layout
 * saltar quando os dados chegam; o skeleton mantém a página estável (CLS ≈ 0).
 */
export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('skeleton', className)} {...props} />
);
