'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1 */
  value: number;
  indeterminate?: boolean;
}

export const Progress = ({ value, indeterminate, className, ...props }: ProgressProps) => (
  <div
    role="progressbar"
    aria-valuenow={Math.round(value * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
    className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    {...props}
  >
    <div
      className={cn(
        'h-full rounded-full bg-gradient-to-r from-violet to-cyan',
        // Anima só transform: nunca `width`, que força layout a cada frame.
        'origin-left transition-transform duration-500 ease-smooth',
        indeterminate && 'animate-pulse',
      )}
      style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})`, width: '100%' }}
    />
  </div>
);
