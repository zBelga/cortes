import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-medium leading-5',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-surface-2 text-fg-muted',
        violet: 'border-violet/25 bg-violet/12 text-violet-glow',
        blue: 'border-blue/25 bg-blue/12 text-blue',
        cyan: 'border-cyan/25 bg-cyan/12 text-cyan',
        success: 'border-success/25 bg-success/12 text-success',
        warn: 'border-warn/25 bg-warn/12 text-warn',
        danger: 'border-danger/25 bg-danger/12 text-danger',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
