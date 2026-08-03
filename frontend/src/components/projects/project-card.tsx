'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, Loader2, Scissors, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, formatDuration, formatRelative } from '@/lib/utils';
import type { ProjectSummary } from '@/types/api';

const STATUS_META = {
  DRAFT: { label: 'Rascunho', variant: 'neutral' as const },
  QUEUED: { label: 'Na fila', variant: 'blue' as const },
  PROCESSING: { label: 'Processando', variant: 'violet' as const },
  READY: { label: 'Pronto', variant: 'success' as const },
  FAILED: { label: 'Falhou', variant: 'danger' as const },
  CANCELLED: { label: 'Cancelado', variant: 'neutral' as const },
};

const SOURCE_LABEL = { YOUTUBE: 'YouTube', TWITCH: 'Twitch', UPLOAD: 'Upload' };

export const ProjectCard = React.memo(function ProjectCard({ project }: { project: ProjectSummary }) {
  const status = STATUS_META[project.status];
  const isActive = project.status === 'PROCESSING' || project.status === 'QUEUED';

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        'group relative flex flex-col rounded-xl border border-border bg-surface p-5 shadow-raised',
        'transition-[border-color,transform] duration-200 ease-smooth',
        'hover:-translate-y-0.5 hover:border-border-strong',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-fg">{project.title}</h3>
          <p className="mt-1 text-xs text-fg-subtle">
            {SOURCE_LABEL[project.source]} · {formatRelative(project.createdAt)}
          </p>
        </div>

        <Badge variant={status.variant}>
          {isActive ? <Loader2 className="size-3 animate-spin" /> : null}
          {project.status === 'FAILED' ? <AlertCircle className="size-3" /> : null}
          {status.label}
        </Badge>
      </div>

      {project.status === 'READY' ? (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          <Metric icon={<Scissors />} value={project.clipCount} label="cortes" />
          <Metric
            icon={<Sparkles />}
            value={project.bestScore.toFixed(0)}
            label="melhor nota"
            accent
          />
          <Metric
            icon={<Clock />}
            value={formatDuration(project.secondsSaved)}
            label="economizados"
          />
        </div>
      ) : null}

      {project.status === 'FAILED' && project.failureHint ? (
        <p className="mt-4 line-clamp-2 rounded-md border border-danger/20 bg-danger/8 px-3 py-2 text-xs text-danger/90">
          {project.failureHint}
        </p>
      ) : null}
    </Link>
  );
});

function Metric({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={cn('[&_svg]:size-3', accent ? 'text-violet' : 'text-fg-subtle')}>{icon}</span>
        <span className={cn('tabular text-sm font-medium', accent ? 'text-violet-glow' : 'text-fg')}>
          {value}
        </span>
      </div>
      <p className="mt-0.5 text-2xs text-fg-subtle">{label}</p>
    </div>
  );
}
