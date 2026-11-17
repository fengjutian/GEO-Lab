import type { Endpoint, EndpointStatus, ProviderInfo } from './types';
import type { ProviderConfig } from './provider';
import { providerConfig, providerInfo } from './provider';

/**
 * 端点解析。密钥只从环境变量读取：数据库里存的是变量名（apiKeyEnv），不是密钥本身。
 * 这样备份/迁移数据库不会泄露凭证，代价是新增端点后需要设置环境变量。
 */

export function resolveEndpoint(endpoint: Endpoint): ProviderConfig {
  const base = providerConfig();
  const apiKey = endpoint.apiKeyEnv ? (process.env[endpoint.apiKeyEnv] ?? '').trim() : '';
  return {
    baseUrl: endpoint.baseUrl.replace(/\/$/, ''),
    apiKey,
    model: endpoint.model,
    extraBody: endpoint.extraBody,
    timeoutMs: base.timeoutMs,
    // 未声明密钥环境变量 = 自建网关/本地模型，允许无 Authorization 直接请求
    allowEmptyKey: endpoint.apiKeyEnv === '',
  };
}

export function endpointConfigured(endpoint: Endpoint): boolean {
  if (!endpoint.apiKeyEnv) return true;
  return Boolean((process.env[endpoint.apiKeyEnv] ?? '').trim());
}

export function endpointStatus(endpoint: Endpoint): EndpointStatus {
  const configured = endpointConfigured(endpoint);
  return {
    ...endpoint,
    configured,
    hint: configured
      ? `${endpoint.baseUrl} · ${endpoint.model}`
      : `缺少环境变量 ${endpoint.apiKeyEnv}：设置后重启服务即可启用（数据库不保存密钥）。`,
  };
}

export function listEndpointStatuses(endpoints: Endpoint[]): EndpointStatus[] {
  return endpoints.map(endpointStatus);
}

/** 未配置端点时沿用的默认端点（等同 V2 的单一模型行为）。 */
export function defaultEndpoint(): { name: string; config: ProviderConfig; info: ProviderInfo } {
  return {
    name: '默认端点',
    config: providerConfig(),
    info: providerInfo(),
  };
}
