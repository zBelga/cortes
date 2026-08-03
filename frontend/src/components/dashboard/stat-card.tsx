'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  accent?: 'violet' | 'blue' | 'cyan' | 'success';
  delay?: number;
}

const ACCENTS = {
  violet: 'text-violet bg-violet/10',
  blue: 'text-blue bg-blue/10',
  cyan: 'text-cyan bg-cyan/10',
  success: 'text-success bg-success/10',
} as const;

export function StatCard({ label, value, hint, icon, accent = 'violet', delay = 0 }: StatCardProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1], delay }}
      className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-raised transition-colors duration-200 hover:border-border-strong"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-lg [&_svg]:size-4', ACCENTS[accent])}>
          {icon}
        </span>
      </div>

      <p className="tabular mt-3 text-3xl font-medium tracking-tight text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-subtle">{hint}</p> : null}

      {/* Brilho sutil no hover — no fundo, sem competir com o número. */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-violet/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />
    </motion.div>
  );
}
