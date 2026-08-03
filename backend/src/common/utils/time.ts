/** Utilidades de tempo de mídia. Toda a base trabalha em milissegundos inteiros. */

export const secondsToMs = (s: number): number => Math.round(s * 1000);
export const msToSeconds = (ms: number): number => ms / 1000;

/** `95000` → `"01:35"`; `3695000` → `"01:01:35"` */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
