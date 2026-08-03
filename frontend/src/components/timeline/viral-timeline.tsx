'use client';

import * as React from 'react';
import { cn, formatTimecode, SCORE_COLORS, scoreTier } from '@/lib/utils';
import type { Clip, TimelinePoint } from '@/types/api';

interface ViralTimelineProps {
  points: TimelinePoint[];
  clips: Clip[];
  durationMs: number;
  currentMs?: number;
  onSeek: (ms: number) => void;
  className?: string;
}

const HEIGHT = 96;

/**
 * Timeline inteligente: curva de score, com os cortes marcados sobre ela.
 *
 * Desenhada como um único `path` de SVG em vez de N elementos — 600 pontos
 * viram 600 nós no DOM, e o navegador engasga a cada hover. Um path é um nó.
 */
export function ViralTimeline({
  points,
  clips,
  durationMs,
  currentMs = 0,
  onSeek,
  className,
}: ViralTimelineProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<{ x: number; ms: number; score: number } | null>(null);

  const { areaPath, linePath } = React.useMemo(() => {
    if (points.length < 2) return { areaPath: '', linePath: '' };

    const toX = (ms: number) => (ms / durationMs) * 1000;
    const toY = (score: number) => HEIGHT - (score / 100) * HEIGHT;

    const line = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.timeMs).toFixed(2)},${toY(point.score).toFixed(2)}`)
      .join(' ');

    return { linePath: line, areaPath: `${line} L1000,${HEIGHT} L0,${HEIGHT} Z` };
  }, [points, durationMs]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ms = ratio * durationMs;
    const nearest = points.reduce(
      (best, point) => (Math.abs(point.timeMs - ms) < Math.abs(best.timeMs - ms) ? point : best),
      points[0]!,
    );
    setHover({ x: ratio * rect.width, ms, score: nearest?.score ?? 0 });
  };

  if (!points.length) return null;

  return (
    <div className={cn('relative select-none', className)}>
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Linha do tempo de viralização"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={currentMs}
        aria-valuetext={formatTimecode(currentMs)}
        className="relative cursor-crosshair overflow-hidden rounded-lg border border-border bg-surface"
        style={{ height: HEIGHT }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          onSeek(((event.clientX - rect.left) / rect.width) * durationMs);
        }}
        onKeyDown={(event) => {
          // Navegação por teclado: ±5 s, ±30 s com Shift.
          const step = event.shiftKey ? 30_000 : 5_000;
          if (event.key === 'ArrowRight') onSeek(Math.min(durationMs, currentMs + step));
          if (event.key === 'ArrowLeft') onSeek(Math.max(0, currentMs - step));
        }}
      >
        <svg
          viewBox={`0 0 1000 ${HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(258 90% 66%)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="hsl(258 90% 66%)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="timeline-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(217 91% 60%)" />
              <stop offset="55%" stopColor="hsl(258 90% 66%)" />
              <stop offset="100%" stopColor="hsl(187 85% 53%)" />
            </linearGradient>
          </defs>

          <path d={areaPath} fill="url(#timeline-fill)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#timeline-stroke)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Faixas dos cortes selecionados */}
        {clips.map((clip) => {
          const left = (clip.startMs / durationMs) * 100;
          const width = ((clip.endMs - clip.startMs) / durationMs) * 100;
          const color = SCORE_COLORS[scoreTier(clip.score)].hex;

          return (
            <button
              key={clip.id}
              onClick={(event) => {
                event.stopPropagation();
                onSeek(clip.startMs);
              }}
              title={`${clip.title} · ${Math.round(clip.score)}`}
              aria-label={`Ir para ${clip.title}`}
              className="absolute bottom-0 top-0 border-x transition-[background-color] duration-150 hover:bg-white/[0.06]"
              style={{
                left: `${left}%`,
                width: `${Math.max(0.35, width)}%`,
                borderColor: `${color}55`,
                background: `linear-gradient(to top, ${color}2e, transparent)`,
              }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-fg/70"
          style={{ left: `${(currentMs / durationMs) * 100}%` }}
        >
          <span className="absolute -left-1 -top-1 size-2 rounded-full bg-fg" />
        </div>

        {hover ? (
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/25"
            style={{ left: hover.x }}
          />
        ) : null}
      </div>

      {hover ? (
        <div
          className="glass pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border px-2 py-1 text-2xs shadow-overlay"
          style={{ left: hover.x }}
        >
          <span className="tabular font-mono text-fg">{formatTimecode(hover.ms)}</span>
          <span className="mx-1.5 text-fg-subtle">·</span>
          <span className={SCORE_COLORS[scoreTier(hover.score)].text}>{Math.round(hover.score)}</span>
        </div>
      ) : null}

      <div className="mt-1.5 flex justify-between font-mono text-2xs text-fg-subtle">
        <span>00:00</span>
        <span>{formatTimecode(durationMs)}</span>
      </div>
    </div>
  );
}
