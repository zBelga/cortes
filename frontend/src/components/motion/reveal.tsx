'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RevealProps extends HTMLMotionProps<'div'> {
  delay?: number;
}

/**
 * Entrada padrão da interface: 6 px de deslocamento e 220 ms.
 * Movimento maior ou mais lento parece lento; menor não é percebido.
 * Só `opacity` e `transform` — ambos rodam no compositor da GPU.
 */
export const Reveal = ({ delay = 0, className, children, ...props }: RevealProps) => {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

/** Stagger com teto: acima de 8 itens o atraso acumulado vira espera. */
export const staggerDelay = (index: number, step = 0.024): number =>
  Math.min(index, 8) * step;
