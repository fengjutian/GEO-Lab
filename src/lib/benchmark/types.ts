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

/**
 * 端点配置。密钥不落库：只保存环境变量名，启动时从 process.env 读取。
 * 这样数据库可以自由备份/迁移，不会把密钥带出去。
 */
export type Endpoint = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** 存放密钥的环境变量名；留空表示不需要鉴权（本地模型 / 自建网关） */
  apiKeyEnv: string;
  /** 额外请求体，用于搜索类 API 的参数 */
  extraBody: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type EndpointStatus = Endpoint & {
  configured: boolean;
  /** 未配置时说明缺哪个环境变量，而不是只说“不可用” */
  hint: string;
};

export type Run = {
  id: string;
  projectId: string;
  label: string;
  provider: string;
  model: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  /** 同一批并行运行共享 batchId，用于跨端点对比 */
  batchId: string | null;
  endpointId: string | null;
  endpointName: string | null;
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
  /** 同一问题的第几次观测（1 起）；>1 表示做了重复观测 */
  repeatIndex: number;
  createdAt: string;
};

export type Metrics = {
  total: number;
  mentionRate: number;
  citationRate: number;
  shareOfVoice: number;
  averagePosition: number | null;
  /** 同一问题多次观测的一致率均值；没有重复观测时为 null */
  stability: number | null;
  repeatCount: number;
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
