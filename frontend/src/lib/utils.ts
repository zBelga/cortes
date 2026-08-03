import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** `95000` → `01:35` · `3695000` → `1:01:35` */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** `2h 14min` · `47min` · `38s` — leitura humana, não técnica. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function formatRelative(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atrás`;
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Faixa de cor por score — a mesma escala em toda a interface. */
export type ScoreTier = 'low' | 'mid' | 'high' | 'elite';

export function scoreTier(score: number): ScoreTier {
  if (score >= 90) return 'elite';
  if (score >= 75) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

export const SCORE_COLORS: Record<ScoreTier, { text: string; ring: string; bg: string; hex: string }> = {
  elite: { text: 'text-violet-glow', ring: 'stroke-violet-glow', bg: 'bg-violet/15', hex: '#A78BFA' },
  high: { text: 'text-violet', ring: 'stroke-violet', bg: 'bg-violet/12', hex: '#8B5CF6' },
  mid: { text: 'text-blue', ring: 'stroke-blue', bg: 'bg-blue/12', hex: '#3B82F6' },
  low: { text: 'text-fg-muted', ring: 'stroke-fg-subtle', bg: 'bg-surface-3', hex: '#8A8A99' },
};
