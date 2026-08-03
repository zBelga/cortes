'use client';

import * as React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Download, Heart, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScoreRing } from './score-ring';
import { cn, formatTimecode } from '@/lib/utils';
import type { Clip, ClipCategory } from '@/types/api';

const CATEGORY_LABEL: Record<ClipCategory, string> = {
  FUNNY: 'Engraçado',
  EDUCATIONAL: 'Educativo',
  EMOTIONAL: 'Emocionante',
  SHOCKING: 'Surpreendente',
  GAMEPLAY: 'Gameplay',
  RAGE: 'Rage',
  FAIL: 'Fail',
  WIN: 'Vitória',
  REACTION: 'Reação',
  STORY: 'História',
  HOT_TAKE: 'Opinião forte',
  OTHER: 'Outro',
};

interface ClipCardProps {
  clip: Clip;
  onPlay: (clip: Clip) => void;
  onToggleFavorite: (clip: Clip) => void;
  onExport: (clip: Clip) => void;
}

/**
 * `memo` + callbacks estáveis no pai: sem isso, favoritar um corte
 * re-renderizaria os outros 19 da grade.
 */
export const ClipCard = React.memo(function ClipCard({
  clip,
  onPlay,
  onToggleFavorite,
  onExport,
}: ClipCardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <motion.article
      layout
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-surface shadow-raised',
        'transition-[border-color,transform] duration-200 ease-smooth',
        'hover:-translate-y-0.5 hover:border-border-strong',
      )}
    >
      <button
        onClick={() => onPlay(clip)}
        className="relative block aspect-[9/16] w-full overflow-hidden bg-surface-2"
        aria-label={`Reproduzir ${clip.title}`}
      >
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 280px"
            className="object-cover transition-transform duration-500 ease-smooth group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface-2 to-surface-3" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

        <div className="absolute left-3 top-3">
          <ScoreRing score={clip.score} size={44} />
        </div>

        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity duration-200',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-white/12 backdrop-blur-md">
            <Play className="size-5 fill-white text-white" />
          </span>
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
          <Badge variant="neutral" className="bg-black/50 backdrop-blur-sm">
            {formatTimecode(clip.durationMs)}
          </Badge>
          <Badge variant="violet" className="bg-black/50 backdrop-blur-sm">
            {CATEGORY_LABEL[clip.category]}
          </Badge>
        </div>
      </button>

      <div className="p-3.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-fg">{clip.title}</h3>

        {clip.reason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="mt-1.5 line-clamp-1 cursor-help text-xs text-fg-muted">{clip.reason}</p>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{clip.reason}</TooltipContent>
          </Tooltip>
        ) : null}

        <div className="mt-3 flex items-center gap-1">
          <span className="tabular mr-auto font-mono text-2xs text-fg-subtle">
            {formatTimecode(clip.startMs)} → {formatTimecode(clip.endMs)}
          </span>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggleFavorite(clip)}
            aria-label={clip.favorite ? 'Remover dos favoritos' : 'Favoritar'}
            aria-pressed={clip.favorite}
          >
            <Heart className={cn(clip.favorite && 'fill-violet text-violet')} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onExport(clip)} aria-label="Exportar">
            <Download />
          </Button>
        </div>
      </div>
    </motion.article>
  );
});
