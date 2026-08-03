'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Link2, Twitch, Upload, Youtube } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Reveal } from '@/components/motion/reveal';
import { cn } from '@/lib/utils';
import { useCreateProject } from '@/hooks/use-projects';

type Source = 'YOUTUBE' | 'TWITCH' | 'UPLOAD';

const SOURCES = [
  { value: 'YOUTUBE' as const, label: 'YouTube', icon: Youtube, hint: 'Vídeo ou live já encerrada' },
  { value: 'TWITCH' as const, label: 'Twitch', icon: Twitch, hint: 'VOD de transmissão' },
  { value: 'UPLOAD' as const, label: 'Upload', icon: Upload, hint: 'MP4, MOV, MKV ou WebM' },
];

/** Validação no cliente espelha a do servidor — o erro aparece antes do request. */
const URL_PATTERNS: Record<string, RegExp> = {
  YOUTUBE: /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{11}/,
  TWITCH: /^https?:\/\/(www\.)?twitch\.tv\/(videos\/\d+|\w+\/v\/\d+)/,
};

export default function NewProjectPage() {
  const router = useRouter();
  const [source, setSource] = React.useState<Source>('YOUTUBE');
  const [url, setUrl] = React.useState('');
  const [minScore, setMinScore] = React.useState(70);
  const [maxClips, setMaxClips] = React.useState(20);
  const [error, setError] = React.useState<string>();

  const createProject = useCreateProject();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (source !== 'UPLOAD') {
      const pattern = URL_PATTERNS[source];
      if (!pattern?.test(url.trim())) {
        setError(`Cole um link válido do ${source === 'YOUTUBE' ? 'YouTube' : 'Twitch'}.`);
        return;
      }
    }

    const project = await createProject.mutateAsync({
      source,
      url: source === 'UPLOAD' ? undefined : url.trim(),
      preferences: { minScore, maxClips },
    });

    router.push(`/projects/${project.id}`);
  };

  return (
    <>
      <Topbar title="Novo projeto" />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <Reveal>
          <h1 className="text-2xl font-medium tracking-tight">De onde vem o vídeo?</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            O processamento roda em segundo plano. Você pode fechar esta aba.
          </p>
        </Reveal>

        <form onSubmit={submit} className="mt-8 space-y-6">
          <Reveal delay={0.05}>
            <div className="grid gap-3 sm:grid-cols-3">
              {SOURCES.map((option) => {
                const active = source === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSource(option.value)}
                    aria-pressed={active}
                    className={cn(
                      'relative overflow-hidden rounded-xl border p-4 text-left transition-[border-color,background-color] duration-150',
                      active
                        ? 'border-violet/45 bg-violet/8'
                        : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="source-glow"
                        className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-violet/25 blur-2xl"
                        aria-hidden
                      />
                    ) : null}
                    <option.icon className={cn('size-4', active ? 'text-violet' : 'text-fg-subtle')} />
                    <p className="mt-2.5 text-sm font-medium">{option.label}</p>
                    <p className="mt-0.5 text-2xs text-fg-subtle">{option.hint}</p>
                  </button>
                );
              })}
            </div>
          </Reveal>

          {source !== 'UPLOAD' ? (
            <Reveal delay={0.1}>
              <label className="mb-2 block text-sm text-fg-muted" htmlFor="source-url">
                Link do vídeo
              </label>
              <Input
                id="source-url"
                icon={<Link2 />}
                placeholder={
                  source === 'YOUTUBE'
                    ? 'https://youtube.com/watch?v=…'
                    : 'https://twitch.tv/videos/…'
                }
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                error={error}
                autoFocus
              />
            </Reveal>
          ) : (
            <Reveal delay={0.1}>
              <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
                <Upload className="mx-auto size-5 text-fg-subtle" />
                <p className="mt-3 text-sm text-fg">Arraste seu vídeo aqui</p>
                <p className="mt-1 text-xs text-fg-subtle">
                  O arquivo vai direto para o storage, sem passar pelo servidor.
                </p>
              </div>
            </Reveal>
          )}

          <Reveal delay={0.15}>
            <Card>
              <CardHeader>
                <CardTitle>Preferências de geração</CardTitle>
                <CardDescription>
                  Dá para mudar depois e reprocessar sem custo adicional de download.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Slider
                  label="Nota mínima"
                  hint="Cortes abaixo desta nota são descartados"
                  value={minScore}
                  min={40}
                  max={95}
                  step={5}
                  onChange={setMinScore}
                />
                <Slider
                  label="Máximo de cortes"
                  hint="Quantos cortes gerar no total"
                  value={maxClips}
                  min={5}
                  max={50}
                  step={5}
                  onChange={setMaxClips}
                />
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={0.2}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={createProject.isPending}
              disabled={source !== 'UPLOAD' && !url.trim()}
            >
              Analisar vídeo
              <ArrowRight />
            </Button>
          </Reveal>
        </form>
      </main>
    </>
  );
}

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function Slider({ label, hint, value, min, max, step, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm text-fg">{label}</label>
        <span className="tabular font-mono text-sm text-violet">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-violet"
        style={{
          background: `linear-gradient(to right, hsl(258 90% 66%) ${((value - min) / (max - min)) * 100}%, hsl(240 8% 9%) ${((value - min) / (max - min)) * 100}%)`,
        }}
      />
      <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}
