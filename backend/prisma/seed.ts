/**
 * Seed de desenvolvimento: cria um usuário, um projeto concluído com curva de
 * score e cortes plausíveis. Permite abrir a interface e ver dados reais
 * sem precisar processar um vídeo de verdade.
 */
import { PrismaClient, ClipCategory, ProjectSource, ProjectStatus, StageStatus } from '@prisma/client';

const prisma = new PrismaClient();

const STAGES = [
  ['download', 'Baixando vídeo'],
  ['probe', 'Lendo metadados'],
  ['extract-audio', 'Extraindo áudio'],
  ['waveform', 'Gerando waveform'],
  ['analyze-audio', 'Detectando risadas, gritos e energia'],
  ['analyze-visual', 'Detectando cenas e movimento'],
  ['transcribe', 'Transcrevendo'],
  ['detect-language', 'Detectando idioma'],
  ['analyze-semantics', 'Encontrando momentos marcantes'],
  ['score', 'Calculando Score de Viralização'],
  ['select-clips', 'Criando cortes'],
  ['render-previews', 'Gerando previews'],
  ['generate-marketing', 'Escrevendo títulos e hashtags'],
] as const;

const CLIPS = [
  { title: 'O erro que 90% dos criadores comete', category: ClipCategory.EDUCATIONAL, score: 96.4, startMs: 182_000 },
  { title: 'Ele não esperava essa resposta', category: ClipCategory.SHOCKING, score: 93.1, startMs: 640_000 },
  { title: 'A parte que ninguém te conta', category: ClipCategory.HOT_TAKE, score: 89.7, startMs: 1_204_000 },
  { title: 'Isso mudou tudo em 3 meses', category: ClipCategory.STORY, score: 86.2, startMs: 1_890_000 },
  { title: 'Não consegui segurar o riso', category: ClipCategory.FUNNY, score: 84.9, startMs: 2_310_000 },
  { title: 'A virada que ninguém viu chegando', category: ClipCategory.WIN, score: 81.3, startMs: 2_760_000 },
  { title: 'Por que isso quase deu errado', category: ClipCategory.EMOTIONAL, score: 77.5, startMs: 3_120_000 },
  { title: 'O detalhe que muda o resultado', category: ClipCategory.EDUCATIONAL, score: 72.8, startMs: 3_540_000 },
];

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: 'dev@clipforge.local' },
    update: {},
    create: {
      // Mesmo authId do SingleUserService: no modo sem login, o seed
      // aparece para o dono da instalação em vez de criar um segundo usuário.
      authId: 'single-user',
      email: 'dev@clipforge.local',
      name: 'Dev ClipForge',
      role: 'ADMIN',
      plan: 'ENTERPRISE',
      ledger: { create: { kind: 'GRANT', amount: 100_000, description: 'Instalação single-user' } },
    },
  });

  await prisma.project.deleteMany({ where: { userId: user.id } });

  const durationMs = 3_900_000; // 65 minutos
  const scores = CLIPS.map((c) => c.score);

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title: 'Entrevista completa — como escalar um produto do zero',
      source: ProjectSource.YOUTUBE,
      sourceUrl: 'https://youtube.com/watch?v=seedseedsee',
      externalId: 'seedseedsee',
      status: ProjectStatus.READY,
      completedAt: new Date(),
      clipCount: CLIPS.length,
      averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      bestScore: Math.max(...scores),
      secondsSaved: Math.round((durationMs - CLIPS.length * 42_000) / 1000),
      preferences: { minScore: 70, maxClips: 20 },
      pipelineRun: {
        create: {
          status: StageStatus.COMPLETED,
          progress: 1,
          startedAt: new Date(Date.now() - 480_000),
          finishedAt: new Date(),
          aiCostCents: 41,
          stages: {
            create: STAGES.map(([key, label], order) => ({
              key,
              label,
              order,
              status: StageStatus.COMPLETED,
              progress: 1,
              durationMs: 8_000 + order * 4_500,
            })),
          },
        },
      },
      clips: {
        create: CLIPS.map((clip) => ({
          startMs: clip.startMs,
          endMs: clip.startMs + 42_000,
          durationMs: 42_000,
          title: clip.title,
          category: clip.category,
          score: clip.score,
          reason: 'Gancho forte nos primeiros segundos e clímax bem posicionado.',
          hashtags: ['produto', 'startup', 'crescimento'],
          cta: 'Comenta aqui o que você faria diferente.',
          scoreBreakdown: {
            hook: clip.score / 110,
            emotion: clip.score / 130,
            humor: clip.category === ClipCategory.FUNNY ? 0.86 : 0.22,
            energy: clip.score / 120,
            novelty: clip.score / 140,
            visual: 0.41,
          },
        })),
      },
    },
    select: { id: true },
  });

  // Curva de score sintética: senoide com picos exatamente onde estão os cortes.
  const points = Math.floor(durationMs / 1000);
  await prisma.scorePoint.createMany({
    data: Array.from({ length: points }, (_, i) => {
      const timeMs = i * 1000;
      const nearClip = CLIPS.reduce((best, clip) => {
        const distance = Math.abs(clip.startMs + 21_000 - timeMs);
        return distance < best.distance ? { distance, score: clip.score } : best;
      }, { distance: Infinity, score: 0 });

      const proximity = Math.exp(-nearClip.distance / 40_000);
      const base = 28 + Math.sin(i / 90) * 9;
      const score = Math.min(100, Math.max(0, base + nearClip.score * proximity * 0.75));

      return {
        projectId: project.id,
        timeMs,
        score: Math.round(score * 10) / 10,
        emotion: score / 160,
        energy: score / 140,
        humor: score / 200,
        hook: score / 180,
        novelty: score / 220,
        visual: score / 190,
      };
    }),
  });

  console.log(`Seed pronto — usuário ${user.email}, projeto ${project.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
