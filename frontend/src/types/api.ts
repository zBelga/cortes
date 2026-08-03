export type ProjectSource = 'YOUTUBE' | 'TWITCH' | 'UPLOAD';
export type ProjectStatus = 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED';
export type StageStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export type ClipCategory =
  | 'FUNNY' | 'EDUCATIONAL' | 'EMOTIONAL' | 'SHOCKING' | 'GAMEPLAY'
  | 'RAGE' | 'FAIL' | 'WIN' | 'REACTION' | 'STORY' | 'HOT_TAKE' | 'OTHER';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  source: ProjectSource;
  status: ProjectStatus;
  clipCount: number;
  averageScore: number;
  bestScore: number;
  secondsSaved: number;
  failureHint: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  description: string | null;
  sourceUrl: string | null;
  preferences: Record<string, number>;
  failureCode: string | null;
  waveformUrl: string | null;
  transcript: { language: string; confidence: number; wordCount: number } | null;
  media: { kind: string; storageKey: string; durationMs: number | null; width: number | null; height: number | null }[];
}

export interface PipelineStage {
  key: string;
  label: string;
  order: number;
  status: StageStatus;
  progress: number;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface PipelineState {
  status: StageStatus | 'PENDING';
  progress: number;
  currentStage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stages: PipelineStage[];
}

export interface ScoreBreakdown {
  hook: number;
  emotion: number;
  humor: number;
  energy: number;
  novelty: number;
  visual: number;
}

export interface Clip {
  id: string;
  projectId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  title: string;
  description: string | null;
  hashtags: string[];
  cta: string | null;
  category: ClipCategory;
  score: number;
  reason: string | null;
  scoreBreakdown: ScoreBreakdown;
  favorite: boolean;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface TimelinePoint {
  timeMs: number;
  score: number;
  emotion: number;
  energy: number;
  humor: number;
  visual: number;
}

export interface StageUpdateEvent {
  type: 'stage.update';
  projectId: string;
  stage: string;
  label: string;
  status: StageStatus;
  progress: number;
  overallProgress: number;
  etaSeconds: number | null;
  message?: string;
  at: number;
}

export interface PipelineDoneEvent {
  type: 'pipeline.completed' | 'pipeline.failed';
  projectId: string;
  clipCount?: number;
  errorCode?: string;
  errorHint?: string;
  at: number;
}
