/** 可见性监测的数据模型与指标定义。服务端类型，不进入客户端 bundle。 */

export type Project = {
  id: string;
  name: string;
  brand: string;
  site: string;
  competitors: string[];
  questions: Question[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Question = {
  id: string;
  text: string;
  /** 意图分层：认知 / 比较 / 决策 / 问题排查 */
  intent: Intent;
  createdAt: string;
};

export const INTENTS = ['认知', '比较', '决策', '问题排查'] as const;
export type Intent = (typeof INTENTS)[number];

export type RunStatus = 'running' | 'completed' | 'failed' | 'manual';

export type Run = {
  id: string;
  projectId: string;
  label: string;
  provider: string;
  model: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  /** 失败原因或运行备注，必须如实记录 */
  note?: string;
};

export type Observation = {
  id: string;
  runId: string;
  projectId: string;
  questionId: string;
  questionText: string;
  answer: string;
  citations: string[];
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorMentions: Record<string, boolean>;
  mode: 'auto' | 'manual';
  createdAt: string;
};

export type Metrics = {
  total: number;
  mentionRate: number;
  citationRate: number;
  shareOfVoice: number;
  averagePosition: number | null;
  competitorRates: { name: string; rate: number }[];
  byIntent: { intent: Intent; total: number; mentionRate: number }[];
  citationDomains: { domain: string; count: number }[];
};

export type ProviderInfo = {
  configured: boolean;
  name: string;
  model: string;
  /** 未配置时给出可执行的下一步，而不是静默失败 */
  hint: string;
};
