/**
 * 浏览器端文本分析工具。
 * 全部为纯函数、无依赖，保证工具在静态站点里离线可用、不上传任何用户文本。
 */

export type Token = string;

const WORD = /[A-Za-z0-9][A-Za-z0-9+#._-]*/g;
const CJK_CHAR = /[\u4e00-\u9fff]/g;

const STOPWORDS_ZH = new Set([
  '的', '了', '和', '是', '在', '有', '就', '都', '而', '及', '与', '这', '那', '我', '你',
  '它', '们', '一个', '我们', '可以', '因为', '所以', '但是', '如果', '以及', '对于', '通过',
  '进行', '需要', '这个', '那个', '什么', '如何', '已经', '还是', '不是', '没有', '很多',
]);

const STOPWORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'this', 'that', 'as', 'at', 'by', 'from', 'we', 'you',
  'they', 'not', 'can', 'will', 'has', 'have', 'had', 'which', 'when', 'how', 'what', 'why',
]);

export function tokenize(text: string): Token[] {
  const words = (text.toLowerCase().match(WORD) ?? []).filter(
    (word) => word.length > 1 && !STOPWORDS_EN.has(word),
  );
  const chars = Array.from(text.match(CJK_CHAR) ?? []);
  const cjkBigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    const bigram = `${chars[i]}${chars[i + 1]}`;
    if (!STOPWORDS_ZH.has(bigram)) cjkBigrams.push(bigram);
  }
  return [...words, ...cjkBigrams];
}

export function termFrequency(tokens: Token[]): Map<Token, number> {
  const tf = new Map<Token, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
}

/** FNV-1a 32 位哈希，用于把 token 映射到固定维度。 */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export type HashVector = {
  dims: number;
  values: Float64Array;
  sparse: { token: string; weight: number }[];
};

/**
 * 哈希向量化（feature hashing）+ 次线性 TF 缩放 + L2 归一化。
 * 这是检索系统的经典工程手段，但不是神经嵌入模型：它只捕捉字面/子词重叠。
 */
export function hashEmbed(text: string, dims = 256): HashVector {
  const tokens = tokenize(text);
  const tf = termFrequency(tokens);
  const values = new Float64Array(dims);
  const sparse: { token: string; weight: number }[] = [];

  for (const [token, count] of tf) {
    const weight = 1 + Math.log(count);
    const bucket = hash32(token) % dims;
    const sign = (hash32(`s:${token}`) & 1) === 0 ? 1 : -1;
    values[bucket] += sign * weight;
    sparse.push({ token, weight: Number(weight.toFixed(3)) });
  }

  let norm = 0;
  for (let i = 0; i < dims; i += 1) norm += values[i] * values[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i += 1) values[i] /= norm;

  sparse.sort((a, b) => b.weight - a.weight);
  return { dims, values, sparse };
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) dot += a[i] * b[i];
  return dot;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function topSharedTerms(a: string, b: string, limit = 8): string[] {
  const setB = new Set(tokenize(b));
  const counts = new Map<string, number>();
  for (const token of tokenize(a)) {
    if (setB.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([token]) => token);
}

/** 相似度标签：只用于教学解释，不是模型判定阈值。 */
export function similarityLabel(score: number): { label: string; tone: string } {
  if (score >= 0.6) return { label: '字面高度重叠', tone: 'text-emerald-300' };
  if (score >= 0.35) return { label: '部分语义相关', tone: 'text-brand-300' };
  if (score >= 0.15) return { label: '弱相关', tone: 'text-amber-300' };
  return { label: '几乎无关', tone: 'text-rose-300' };
}

/* ---------- 句子与段落切分 ---------- */

export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[。！？；!?;])\s*|(?<=[.!?])\s+(?=[A-Z\u4e00-\u9fff])/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function countChars(text: string): number {
  return Array.from(text.replace(/\s/g, '')).length;
}

/** 粗略 token 估算：中文按字，英文按 0.75 词/字符折算。 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(CJK_CHAR) ?? []).length;
  const rest = text.replace(CJK_CHAR, ' ');
  const words = (rest.match(WORD) ?? []).length;
  return Math.ceil(cjk * 1.05 + words * 1.35);
}

/* ---------- BM25 检索（RAG 实验用） ---------- */

export type Doc = { id: string; title: string; text: string; source: string };

export type SearchHit = { doc: Doc; score: number; matched: string[] };

export function bm25Rank(
  query: string,
  docs: Doc[],
  options: { k1?: number; b?: number; limit?: number } = {},
): SearchHit[] {
  const { k1 = 1.5, b = 0.75, limit = 5 } = options;
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  const docTokens = docs.map((doc) => tokenize(`${doc.title} ${doc.text}`));
  const avgLength = docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / (docs.length || 1);
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    const unique = new Set(tokens);
    for (const term of queryTerms) if (unique.has(term)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const scored = docs.map((doc, index) => {
    const tokens = docTokens[index];
    const tf = termFrequency(tokens);
    let score = 0;
    const matched: string[] = [];
    for (const term of queryTerms) {
      const freq = tf.get(term) ?? 0;
      if (freq === 0) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      const denom = freq + k1 * (1 - b + (b * tokens.length) / (avgLength || 1));
      score += idf * ((freq * (k1 + 1)) / denom);
      matched.push(term);
    }
    return { doc, score, matched: [...new Set(matched)] };
  });

  return scored
    .filter((hit) => hit.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
