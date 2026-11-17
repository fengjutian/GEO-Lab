import type { ProviderInfo } from './types';
import { extractCitations } from './metrics';

/**
 * 模型适配层。
 *
 * 默认只支持 OpenAI 兼容的 /chat/completions 端点，因为这是覆盖面最广的接口，
 * 也允许通过 GEO_LLM_BASE_URL 指向任意兼容服务（含自建网关）。
 *
 * 必须清楚的能力边界：一次 chat 调用不包含真实网页检索。
 * 它衡量的是“模型在参数化知识下是否提及该品牌”，不是“AI 搜索结果里是否引用该页面”。
 * 若需要后者，请把 GEO_LLM_BASE_URL 指向带检索能力的搜索 API，或在方法论文档中声明这是无检索基线。
 */

export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 额外请求体，用于工具调用、搜索参数等供应商特定配置 */
  extraBody: Record<string, unknown>;
  timeoutMs: number;
};

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function providerConfig(): ProviderConfig {
  let extraBody: Record<string, unknown> = {};
  const raw = env('GEO_LLM_EXTRA_BODY');
  if (raw) {
    try {
      extraBody = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      extraBody = {};
    }
  }
  return {
    baseUrl: (env('GEO_LLM_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: env('GEO_LLM_API_KEY'),
    model: env('GEO_LLM_MODEL') || 'gpt-4o-mini',
    extraBody,
    timeoutMs: Number(env('GEO_LLM_TIMEOUT_MS') || 60000),
  };
}

export function providerInfo(): ProviderInfo {
  const config = providerConfig();
  const configured = Boolean(config.apiKey);
  return {
    configured,
    name: configured ? 'OpenAI 兼容端点' : '未配置',
    model: config.model,
    hint: configured
      ? `请求端点 ${config.baseUrl}，模型 ${config.model}`
      : '要自动运行测试，请设置 GEO_LLM_API_KEY（可选 GEO_LLM_BASE_URL / GEO_LLM_MODEL）。未配置时仍可手工粘贴答案记录。',
  };
}

const SYSTEM_PROMPT = `你是回答专业问题的助手。回答要求：
1. 用中文直接回答，控制在 200 字以内。
2. 只陈述确定的信息，不确定就说不确定。
3. 如果提到了某个品牌、产品或网站，保持与问题中的名称一致。
4. 在答案最后另起一行，用“来源：”开头列出你依据的链接，每条一行；没有链接就写“来源：无”。
不要输出除答案与来源以外的内容。`;

/** 提问。返回原始答案与解析出的引用链接。 */
export async function askModel(
  question: string,
  config = providerConfig(),
): Promise<{ answer: string; citations: string[]; model: string }> {
  if (!config.apiKey) {
    throw new Error('未配置 GEO_LLM_API_KEY，无法自动运行。请使用手工记录模式。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
        ...config.extraBody,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `模型端点返回 ${response.status}${text ? `：${text.slice(0, 200)}` : ''}`,
      );
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const answer = payload.choices?.[0]?.message?.content?.trim() ?? '';
    if (!answer) throw new Error('模型返回空答案');

    return {
      answer,
      citations: extractCitations(answer),
      model: payload.model ?? config.model,
    };
  } finally {
    clearTimeout(timer);
  }
}
