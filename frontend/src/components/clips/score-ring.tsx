'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn, scoreTier, SCORE_COLORS } from '@/lib/utils';

interface ScoreRingProps {
  /** 0..100 */
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

/**
 * Anel de score. Um número sozinho não comunica "quão bom" —
 * o arco preenchido dá a leitura instantânea, e a cor dá a faixa.
 */
export function ScoreRing({
  score,
  size = 48,
  strokeWidth = 3,
  showLabel = true,
  className,
}: ScoreRingProps) {
  const reduced = useReducedMotion();
  const tier = scoreTier(score);
  const colors = SCORE_COLORS[tier];

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
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
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className={colors.ring}
          initial={reduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={
            tier === 'elite'
              ? { filter: `drop-shadow(0 0 6px ${colors.hex}88)` }
              : undefined
          }
        />
      </svg>

      {showLabel ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('tabular font-medium', colors.text)} style={{ fontSize: size * 0.3 }}>
            {Math.round(score)}
          </span>
        </div>
      ) : null}

      <span className="sr-only">Score de viralização: {Math.round(score)} de 100</span>
    </div>
  );
}
