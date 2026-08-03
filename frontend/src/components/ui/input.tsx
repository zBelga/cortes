'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, error, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-base text-fg',
            'placeholder:text-fg-subtle',
            'transition-[border-color,box-shadow] duration-[120ms] ease-smooth',
            'hover:border-border-strong',
            'focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
            icon && 'pl-9',
            error && 'border-danger focus:border-danger focus:ring-danger/25',
            className,
          )}
          {...props}
        />
      </div>
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
    </div>
  ),
);
Input.displayName = 'Input';
