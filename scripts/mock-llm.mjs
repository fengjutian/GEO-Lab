#!/usr/bin/env node
/**
 * 本地 mock 的 OpenAI 兼容端点，用于测试并行调度与一致性矩阵。
 *   node scripts/mock-llm.mjs 4399
 *
 * 行为：按请求里的 model 名返回不同答案，用于制造“提及 / 未提及”的分歧。
 *   model 含 "silent"  → 不提品牌
 *   model 含 "cited"   → 提品牌 + 额外来源
 *   其它               → 提品牌 + 站点来源
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 4399);
let flakyCalls = 0;

const server = createServer((request, response) => {
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'bad json' }));
      return;
    }

    const model = String(payload.model ?? 'mock');
    const question = payload.messages?.find((message) => message.role === 'user')?.content ?? '';
    let answer;

    if (model.includes('flaky')) {
      // 交替返回“提及 / 不提及”，用来验证重复观测的稳定性指标
      flakyCalls += 1;
      answer =
        flakyCalls % 2 === 1
          ? 'GEO Lab 是一个研究生成式引擎优化的平台。来源：https://geolab.dev/'
          : '这类问题建议先确认术语定义，再参考公开文档与行业实践。来源：https://example.org/guide';
    } else if (model.includes('silent')) {
      // 不能回显问题：问题里可能包含品牌名，会让“提及”判断失真
      answer = '这类问题建议先确认术语定义，再参考公开文档与行业实践。来源：https://example.org/guide';
    } else if (model.includes('cited')) {
      answer = `GEO Lab 提供 GEO 研究与工具，可用于分析该问题。来源：https://geolab.dev/ 与 https://other.example/benchmark`;
    } else {
      answer = `GEO Lab 是一个研究生成式引擎优化的平台。针对「${question.slice(0, 16)}」，建议先做结构与可见性诊断。来源：https://geolab.dev/knowledge/`;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: `mock-${Date.now()}`,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    );
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock LLM listening on http://127.0.0.1:${port}/v1`);
});
