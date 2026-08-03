'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatTimecode } from '@/lib/utils';
import type { Clip } from '@/types/api';

interface ClipPlayerProps {
  clip: Clip;
  onNext?: () => void;
  onPrevious?: () => void;
  className?: string;
}

/** Passo de um frame a 30 fps. */
const FRAME_MS = 1000 / 30;

/**
 * Player próprio. Um `<video controls>` nativo não oferece navegação
 * frame a frame nem atalhos, que são o mínimo para revisar cortes.
 */
export function ClipPlayer({ clip, onNext, onPrevious, className }: ClipPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [currentMs, setCurrentMs] = React.useState(0);
  const [durationMs, setDurationMs] = React.useState(clip.durationMs);

  const toggle = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const step = React.useCallback((deltaMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, video.currentTime + deltaMs / 1000);
  }, []);

  const seekRatio = React.useCallback((ratio: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ratio * video.duration;
  }, []);

  // Atalhos de edição de vídeo: espaço, setas, vírgula/ponto para frames.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          toggle();
          break;
        case 'ArrowRight':
          step(event.shiftKey ? 5000 : 1000);
          break;
        case 'ArrowLeft':
          step(event.shiftKey ? -5000 : -1000);
          break;
        case '.':
          step(FRAME_MS);
          break;
        case ',':
          step(-FRAME_MS);
          break;
        case 'm':
          setMuted((m) => !m);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, step]);

  const progress = durationMs ? currentMs / durationMs : 0;

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-black', className)}>
      <div className="relative aspect-[9/16] w-full">
        {clip.previewUrl ? (
          <video
            ref={videoRef}
            src={clip.previewUrl}
            poster={clip.thumbnailUrl ?? undefined}
            playsInline
            muted={muted}
            // `metadata`: o browser não baixa o vídeo inteiro antes do play.
            preload="metadata"
            className="size-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
            onLoadedMetadata={(e) => setDurationMs(e.currentTarget.duration * 1000)}
            onClick={toggle}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-fg-subtle">
            Preview ainda sendo gerado…
          </div>
        )}
      </div>

      <div className="space-y-2.5 border-t border-border bg-surface p-3">
        <button
          className="group relative h-1.5 w-full cursor-pointer rounded-full bg-surface-3"
          aria-label="Progresso do vídeo"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            seekRatio((event.clientX - rect.left) / rect.width);
          }}
        >
          <div
            className="h-full origin-left rounded-full bg-gradient-to-r from-violet to-cyan"
            style={{ width: '100%', transform: `scaleX(${progress})` }}
          />
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${progress * 100}%` }}
          />
        </button>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onPrevious} disabled={!onPrevious} aria-label="Corte anterior">
            <ChevronLeft />
          </Button>

          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>

          <Button variant="ghost" size="icon-sm" onClick={onNext} disabled={!onNext} aria-label="Próximo corte">
            <ChevronRight />
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="tabular ml-2 font-mono text-2xs text-fg-muted">
                {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Espaço: play · ← →: 1s · Shift+← →: 5s · , .: frame · M: mudo
            </TooltipContent>
          </Tooltip>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setMuted((m) => !m)} aria-label="Mudo">
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void videoRef.current?.requestFullscreen()}
              aria-label="Tela cheia"
            >
              <Maximize2 />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
