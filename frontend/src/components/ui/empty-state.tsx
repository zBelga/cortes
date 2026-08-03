import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vazio desenhado, não improvisado. Um "nenhum resultado" cru
 * comunica erro; um estado vazio com próximo passo comunica intenção.
 */
export const EmptyState = ({ icon, title, description, action, className }: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-20 text-center', className)}>
    <div className="relative mb-5">
      <div className="absolute inset-0 -z-10 blur-2xl" aria-hidden>
        <div className="mx-auto size-16 rounded-full bg-violet/25" />
      </div>
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-fg-muted [&_svg]:size-6">
        {icon}
      </div>
    </div>
    <h3 className="text-lg font-medium tracking-tight text-fg">{title}</h3>
    <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>
    {action ? <div className="mt-6">{action}</div> : null}
  </div>
);
