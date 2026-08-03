'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { formatDuration } from '@/lib/utils';

interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  etaSeconds: number | null;
  elapsedSeconds: number;
}

/** Indicador principal da tela de processamento: progresso, ETA e tempo gasto. */
export function ProgressRing({ progress, etaSeconds, elapsedSeconds }: ProgressRingProps) {
  const reduced = useReducedMotion();
  const size = 168;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(258 90% 66%)" />
              <stop offset="100%" stopColor="hsl(187 85% 53%)" />
            </linearGradient>
          </defs>

          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-surface-3"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#progress-gradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={reduced ? false : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: 'drop-shadow(0 0 10px hsl(258 90% 66% / 0.45))' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-4xl font-medium tracking-tight text-fg">
            {Math.round(progress * 100)}
            <span className="text-xl text-fg-muted">%</span>
          </span>
          <span className="mt-0.5 text-xs text-fg-subtle">
            {etaSeconds !== null && etaSeconds > 0
              ? `~${formatDuration(etaSeconds)} restantes`
              : 'calculando…'}
          </span>
        </div>
      </div>

      <p className="tabular mt-4 font-mono text-2xs text-fg-subtle">
        {formatDuration(elapsedSeconds)} decorridos
      </p>
    </div>
  );
}
