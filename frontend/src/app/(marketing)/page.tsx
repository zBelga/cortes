'use client';

import Link from 'next/link';
import { ArrowRight, Gauge, Scissors, Sparkles, Wand2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Reveal, staggerDelay } from '@/components/motion/reveal';

const FEATURES = [
  {
    icon: Gauge,
    title: 'Score de Viralização',
    body: 'Cada trecho recebe uma nota de 0 a 100 a partir de gancho, emoção, humor, energia, novidade e ritmo visual — com a explicação de por que pontuou.',
  },
  {
    icon: Wand2,
    title: 'Corte em fronteira natural',
    body: 'Os limites são ajustados para fim de frase, troca de cena ou silêncio. Nenhum corte começa no meio de uma palavra.',
  },
  {
    icon: Zap,
    title: 'Processamento paralelo',
    body: 'Download, transcrição e análise rodam em filas independentes. Um vídeo de uma hora vira cortes prontos em minutos.',
  },
  {
    icon: Scissors,
    title: 'Edição não destrutiva',
    body: 'Cada ajuste vira uma nova versão declarativa. O arquivo original nunca é alterado e você volta atrás quando quiser.',
  },
] as const;

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg">
      <div className="grid-bg pointer-events-none absolute inset-0 h-[70vh]" aria-hidden />

      <header className="relative z-10 mx-auto flex h-16 max-w-6xl items-center px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan">
            <Sparkles className="size-4 text-white" />
          </div>
          <span className="font-medium tracking-tight">ClipForge</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Entrar</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/projects/new">Começar</Link>
          </Button>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-24 text-center">
        <Reveal>
          <Badge variant="violet" className="mb-6">
            <Sparkles className="size-3" />
            Análise de vídeo, áudio e texto em um só passo
          </Badge>
        </Reveal>

        <Reveal delay={0.06}>
          <h1 className="text-balance text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
            Seu vídeo longo já contém <span className="text-gradient">os cortes que viralizam</span>
          </h1>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-fg-muted">
            Cole um link do YouTube ou da Twitch. O ClipForge transcreve, analisa emoção,
            risadas, ritmo e storytelling, e devolve os melhores momentos ranqueados —
            com título, legenda e hashtags prontos.
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/projects/new">
                Criar meus cortes
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">Ver o dashboard</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-32">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={staggerDelay(index, 0.05)}>
              <article className="h-full rounded-xl border border-border bg-surface p-6 shadow-raised transition-colors duration-200 hover:border-border-strong">
                <span className="flex size-9 items-center justify-center rounded-lg bg-violet/10 text-violet">
                  <feature.icon className="size-4" />
                </span>
                <h2 className="mt-4 text-base font-medium tracking-tight">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}
