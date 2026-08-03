'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { PipelineStage } from '@/types/api';

interface PipelineStepperProps {
  stages: PipelineStage[];
  currentStage: string | null;
  message: string | null;
}

/**
 * As 13 etapas em tempo real.
 *
 * A etapa ativa é a única que expande — mostrar detalhe de todas ao mesmo
 * tempo transformaria a tela numa parede de texto e escondería o que importa.
 */
export function PipelineStepper({ stages, currentStage, message }: PipelineStepperProps) {
  const reduced = useReducedMotion();

  return (
    <ol className="relative space-y-0.5">
      {stages.map((stage, index) => {
        const isActive = stage.key === currentStage && stage.status === 'RUNNING';
        const isDone = stage.status === 'COMPLETED';
        const isFailed = stage.status === 'FAILED';
        const isLast = index === stages.length - 1;

        return (
          <li key={stage.key} className="relative flex gap-3.5 pb-1">
            {/* Trilho conectando as etapas — preenchido conforme conclui. */}
            {!isLast ? (
              <span
                className={cn(
                  'absolute left-[11px] top-7 h-[calc(100%-12px)] w-px transition-colors duration-500',
                  isDone ? 'bg-violet/45' : 'bg-border',
                )}
                aria-hidden
              />
            ) : null}

            <StageIcon status={stage.status} active={isActive} />

            <div className="min-w-0 flex-1 pb-3 pt-0.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-sm transition-colors duration-300',
                    isDone && 'text-fg-muted',
                    isActive && 'font-medium text-fg',
                    isFailed && 'text-danger',
                    !isDone && !isActive && !isFailed && 'text-fg-subtle',
                  )}
                >
                  {stage.label}
                </span>

                {stage.durationMs ? (
                  <span className="tabular ml-auto shrink-0 font-mono text-2xs text-fg-subtle">
                    {formatDuration(stage.durationMs / 1000)}
                  </span>
                ) : null}
              </div>

              {isActive ? (
                <motion.div
                  initial={reduced ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  {message ? <p className="mt-1 text-xs text-fg-muted">{message}</p> : null}
                  <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full origin-left rounded-full bg-gradient-to-r from-violet to-cyan transition-transform duration-300 ease-smooth"
                      style={{ width: '100%', transform: `scaleX(${stage.progress || 0.04})` }}
                    />
                  </div>
                </motion.div>
              ) : null}

              {isFailed && stage.errorMessage ? (
                <p className="mt-1 text-xs text-danger/85">{stage.errorMessage}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StageIcon({ status, active }: { status: PipelineStage['status']; active: boolean }) {
  const base = 'relative z-10 flex size-[23px] shrink-0 items-center justify-center rounded-full border';

  if (status === 'COMPLETED') {
    return (
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        className={cn(base, 'border-violet/35 bg-violet/15 text-violet')}
      >
        <Check className="size-3" strokeWidth={3} />
      </motion.span>
    );
  }

  if (status === 'FAILED') {
    return (
      <span className={cn(base, 'border-danger/35 bg-danger/12 text-danger')}>
        <AlertCircle className="size-3" />
      </span>
    );
  }

  if (active) {
    return (
      <span className={cn(base, 'animate-pulse-ring border-violet/45 bg-violet/12 text-violet')}>
        <Loader2 className="size-3 animate-spin" />
      </span>
    );
  }

  return (
    <span className={cn(base, 'border-border bg-surface-2')}>
      <span className="size-1.5 rounded-full bg-fg-subtle/40" />
    </span>
  );
}
