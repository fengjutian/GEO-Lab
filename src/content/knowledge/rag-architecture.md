---
title: "RAG 完整技术架构"
description: "从索引、检索、重排到上下文装配与引用归因，拆解检索增强生成的每一个工程环节，并指出内容生产者在其中真正能影响的变量。"
summary: "RAG 不是“把文档丢给模型”，而是一条有预算约束的装配线：召回决定上限，重排决定顺序，上下文决定模型看到什么。"
publishDate: 2026-08-26
updatedDate: 2026-11-09
author: "GEO Lab Research"
category: "RAG 与检索"
tags: ["RAG", "检索", "重排", "上下文窗口"]
evidence: "paper"
featured: true
draft: false
tools: ["rag", "chunking"]
related: ["embedding-semantic-retrieval", "ai-search-how-it-works", "why-ai-cites-a-site"]
references:
  - title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
    url: "https://arxiv.org/abs/2005.11401"
    publisher: "Lewis et al., NeurIPS 2020"
    date: "2020"
  - title: "Dense Passage Retrieval for Open-Domain Question Answering"
    url: "https://arxiv.org/abs/2004.04906"
    publisher: "Karpukhin et al., EMNLP 2020"
    date: "2020"
  - title: "Lost in the Middle: How Language Models Use Long Contexts"
    url: "https://arxiv.org/abs/2307.03172"
    publisher: "Liu et al., arXiv"
    date: "2023"
order: 4
---

检索增强生成（Retrieval-Augmented Generation，RAG）最早由 Lewis 等人在 2020 年提出，用于把外部知识注入生成过程。工程实现远比论文摘要复杂：它不是一次“把文档丢给模型”的操作，而是一条带预算约束的装配线。理解这条装配线，才能判断 GEO 的每一个动作到底作用在哪个环节。

## 从索引到答案：五个阶段

一个完整的 RAG 请求会经过五个阶段，每个阶段都可能丢失你的内容。

| 阶段 | 输入 | 输出 | 失败后果 |
| --- | --- | --- | --- |
| 索引 | 原始文档 | 可检索的向量与倒排 | 内容根本没进候选池 |
| 召回 | 查询 | top-K 候选片段 | 相关内容未被取回 |
| 重排 | 候选片段 | 有序片段列表 | 相关片段被排到预算之外 |
| 上下文装配 | 有序片段 | 拼进提示词的文本 | 片段被截断或丢弃 |
| 生成与归因 | 提示词 | 答案 + 引用 | 内容被忽视或错误归因 |

这张表的右列值得反复看：GEO 的多数失败并不是“写得不好”，而是内容在某个阶段根本没被看到。

## 索引：离线阶段决定上限

索引阶段做的三件事是切分、向量化、落库。

切分决定检索的基本单位。一个 chunk 被编码成一个向量，向量的语义被压缩成一个点，因此 chunk 内主题越单一，向量越准。这也是为什么“一段一意”的写作方式对检索友好：它天然产生主题集中的块。

向量化通常同时保留稀疏与稠密两路：

- 稀疏检索（BM25 及其变体）依赖词项匹配，对专有名词、编号、精确短语敏感。
- 稠密检索依赖嵌入模型的语义表示，对同义改写、跨语言表述更稳。

混合检索是当前工程上的默认选择，因为两者失败模式互补：BM25 抓不到同义改写，稠密模型抓不准精确标识符。

```python
# 混合检索的最小示意：两路召回后做分数归一化融合
def hybrid_rank(query, bm25_index, vector_index, alpha=0.5, k=20):
    sparse_hits = bm25_index.search(query, k=k)          # [(doc_id, score)]
    dense_hits = vector_index.search(embed(query), k=k)  # [(doc_id, score)]

    fused = {}
    for doc_id, score in normalize(sparse_hits):
        fused[doc_id] = fused.get(doc_id, 0) + alpha * score
    for doc_id, score in normalize(dense_hits):
        fused[doc_id] = fused.get(doc_id, 0) + (1 - alpha) * score

    return sorted(fused.items(), key=lambda item: item[1], reverse=True)
```

## 召回与重排：两套不同的成本模型

召回追求“不漏”，重排追求“排序准”。

召回阶段用便宜的模型扫全库，返回几十到几百个候选；重排阶段用更贵的交叉编码器（cross-encoder）逐个打分，把真正相关的排到前面。重排之所以必要，是因为稠密检索的向量是独立编码的，查询与文档之间没有细粒度交互；交叉编码器把两者拼在一起送进模型，能捕捉到“这句话是否在回答这个问题”这种判断。

对内容生产者来说，这个阶段的影响是间接但明确的：如果一段内容是“背景铺垫”而不是“直接回答”，它可能在召回阶段入选、在重排阶段被压下去。

## 上下文装配：预算才是硬约束

模型的上下文窗口是有限资源，而且片段之间存在竞争关系。装配阶段要回答三个问题：

1. 放多少条片段？
2. 每条片段多长？
3. 排在前面的应该是谁？

Liu 等人的研究（*Lost in the Middle*）发现，模型对上下文中部信息的利用明显弱于开头与结尾。这意味着位置不只是排序问题，还影响被实际使用的概率。工程上常见的做法是把最相关的片段放在开头，把背景性材料放在末尾。

另一个常被忽略的事实是：**上下文里放不下的内容，等价于不存在。** 一个 2000 字的页面如果被切成 8 个 chunk，而预算只够 3 个，那么你在写作时就应该假设“多数读者只看到其中一段”。

## 生成与归因：引用是最后一道筛子

生成阶段，模型基于片段写答案。引用（citation）有两种常见实现：

- **生成式引用**：模型自行决定在句中标注哪个来源。灵活，但可能标错。
- **后置归因**：先生成不带引用的答案，再用句子级相似度匹配片段并回填来源。可控，但可能匹配到语义相近的无关片段。

两者的共同点是：引用发生的前提是片段已经进入上下文。因此不存在“结构做得好就一定会被引用”这回事——结构只影响前四个阶段。

## 内容侧真正能影响的四个变量

把上面的链路反过来看，内容生产者能影响的变量其实非常有限，而且都很具体：

| 变量 | 作用于 | 具体做法 |
| --- | --- | --- |
| 可抓取性 | 索引入口 | 服务端渲染、明确的 canonical、不被 robots 误拦 |
| 片段自洽性 | 切分与召回 | 一段一意、结论先行、不使用脱离上下文的代词 |
| 术语覆盖度 | 稠密召回 | 同一概念的多种表述都出现一次，而不是重复一个词 |
| 可核验性 | 重排与归因 | 具体数据、明确作者、可点击的来源链接 |

这四条都不需要特殊标记，也不需要“AI 专用文件”。它们恰好也是人类读者最需要的写作规范——这不是巧合：检索系统优化的目标函数，本质上就是“找出真正回答了问题的内容”。

## 小结

RAG 的每个阶段都在做减法：索引筛掉格式，召回筛掉不相关，重排筛掉弱相关，预算筛掉放不下的，生成本身还可能忽略已放入的内容。GEO 工作的实质，是让自己的内容在这五道减法里尽可能少地出局。可以把本站的 [RAG 实验](/tools/rag/) 跑一遍，观察同一份语料在不同 topK 与预算下的表现——比读十条优化技巧更快建立直觉。
