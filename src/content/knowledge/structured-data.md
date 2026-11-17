---
title: "结构化数据与 JSON-LD 的正确用法"
description: "结构化数据解决的是机器理解问题，不是被引用的通行证。本文拆解 Article、Organization、Person、FAQPage、BreadcrumbList 的真实作用与边界，并给出 JSON-LD 的编写要点。"
summary: "标记只能把你声明的事实说清楚，不能替你把事实变成真的，也不能保证被 AI 引用。"
publishDate: 2026-10-09
updatedDate: 2026-11-16
author: "GEO Lab Research"
category: "内容结构"
tags: ["结构化数据", "JSON-LD", "schema.org", "标记规范"]
evidence: "official"
featured: false
draft: false
tools: ["schema"]
related: ["entity-understanding", "knowledge-graph-geo", "ai-readable-content"]
references:
  - title: "Introduction to structured data"
    url: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data"
    publisher: "Google Search Central"
  - title: "Schema.org Vocabulary"
    url: "https://schema.org/"
    publisher: "Schema.org Community"
  - title: "JSON-LD 1.1: A JSON-based Serialization for Linked Data"
    url: "https://www.w3.org/TR/json-ld11/"
    publisher: "W3C Recommendation"
order: 13
---

结构化数据最常见的两种误用，一是当作排名开关，二是当作 AI 引用的保证。两者都不成立。Google 的文档把它的作用限定为帮助搜索引擎理解页面内容，并明确指出富媒体结果不被保证；schema.org 提供的是共享词表，不校验事实真伪；JSON-LD 只是 W3C 标准化的序列化格式。它能让声明更清晰，但不能让内容变好，也不能让生成式系统必须引用你。

## 结构化数据解决的是什么问题

页面文本对人是可读的，对机器则需要额外线索才能确定"这段文字描述的是什么类型的对象、哪个字段对应哪个属性"。结构化数据的作用就是补上这层映射：明确这是文章而不是产品页，明确这个日期是发布时间而不是更新时间，明确这个人是作者而不是受访者。

它带来三类实际收益：一是让搜索引擎更准确地理解页面要素，从而有机会展示相应的富媒体结果；二是让实体与属性以机器可读的方式被消费，减少歧义；三是迫使团队把散落在页面各处的信息统一口径，这本身就有价值。

它不带来什么：不提升内容质量，不改变页面在生成式回答中的被引用概率，不替代正文论证。Google 的政策要求标记必须描述用户可见的内容，标记与正文不符会被视为违规，而不是技巧。

## Article 与 Person：把作者变成可核验实体

Article 的价值在于把类型、标题、作者、发布时间、更新时间和主图显式化。这些字段在页面上往往已经存在，标记的作用是消除歧义——尤其是当页面同时包含多个时间、多个署名时。

Person 的价值常被低估。作者实体是否可核验，直接影响可信度判断：一个只有名字字符串的署名，与一个有独立页面、列出职位、机构、历史文章的署名，不在同一层级。为作者建立页面并用 sameAs 关联外部资料，是把"署名"变成"实体"的最低成本方式。

需要注意：Article 中的 author 应指向 Person 或 Organization 的标识，而不是一个纯字符串；日期使用 ISO 8601 格式；`dateModified` 应真实反映内容实质变更，而不是每次构建都刷新。

## Organization：品牌实体的最小声明

Organization 是站点级标记中最值得做的一项，因为它描述的是"这个站点属于谁"。name、url、logo、description、sameAs 是最小集合，其中 sameAs 用于把多个平台上的同一实体收敛到一个标识。

实践中常见的问题是 logo 尺寸不符合要求、sameAs 指向无关页面、description 写成营销口号。前两者影响可用性，后者浪费了一个本可用于消歧的字段。描述应当说明组织是什么、做什么、位于哪里，而不是"致力于成为全球领先"。

Organization 还应与关于页、页脚、作者页的信息保持一致。若标记写成立于 2019 年，关于页写"十余年经验"，两者不可能同时为真。

## FAQPage：作用被高估的典型

FAQPage 曾经是获取搜索结果富媒体展示的常用手段，如今其适用范围已被大幅收窄。Google 已把 FAQ 富媒体结果的展示限制在少数类型的站点，普通站点即便标记完全正确，通常也不会获得额外展示。

这并不意味着 FAQ 内容没有价值。问答结构对理解与抽取仍有帮助，但帮助来自内容组织本身，而不是标记。若一个页面为了标记而堆砌无人真实提问的问答，既不会获得展示，也降低了内容质量。

正确的做法是：先有真实的问答内容，再决定是否标记；若标记，答案必须是页面上完整可见的文本，不能用"详见下文"或折叠后不可见的内容。

## BreadcrumbList：导航而非权重

BreadcrumbList 描述页面在站点层级中的位置，影响的是搜索结果中路径的呈现方式，以及用户对站点结构的理解。它不改变页面在生成式回答中的被引用概率。

它的实际价值在于两点：一是让层级关系显式化，帮助系统判断页面与上级主题的归属；二是改善点击后的预期管理。对于层级深、主题多的站点，这项标记的性价比不低，但不必期待它带来可见性变化。

实现时要注意最后一项应是当前页面且不带链接，层级顺序与实际导航一致，名称使用用户可读的短语而不是 URL 片段。

## 五种类型的对照

| 类型 | 主要消费者 | 真实作用 | 主要局限 |
| --- | --- | --- | --- |
| Article | 搜索引擎、聚合系统 | 明确文章类型、作者、时间 | 不保证富媒体展示，不提升排名 |
| Person | 搜索引擎、知识系统 | 作者可核验，支持消歧 | 需要独立页面与外部佐证才有意义 |
| Organization | 搜索引擎、知识系统 | 声明品牌实体与站点归属 | 与正文不一致时失去价值 |
| FAQPage | 搜索引擎 | 曾经带来问答富媒体展示 | 展示范围已大幅收窄，多数站点无收益 |
| BreadcrumbList | 搜索引擎 | 呈现层级路径 | 不影响排名与引用 |

## JSON-LD 的编写要点

JSON-LD 1.1 是 W3C 推荐标准，Google 也推荐使用它而非 Microdata 或 RDFa，原因是它与 HTML 解耦、便于模板生成、不易在改版中损坏。

几个实用要点：用 `@id` 给实体一个稳定标识，便于跨块引用；用 `@graph` 组织多个实体，避免重复嵌套；顶层 `@context` 写 `https://schema.org`；日期用 ISO 8601；布尔与数字不要写成字符串；同一实体在多个页面出现时，`@id` 应指向同一个规范 URL。

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com/#organization",
      "name": "GEO Lab",
      "url": "https://example.com/",
      "sameAs": ["https://github.com/example-org"]
    },
    {
      "@type": "Article",
      "@id": "https://example.com/knowledge/structured-data/#article",
      "headline": "结构化数据与 JSON-LD 的正确用法",
      "datePublished": "2026-10-09",
      "dateModified": "2026-11-16",
      "author": {
        "@type": "Person",
        "name": "GEO Lab Research",
        "url": "https://example.com/about/"
      },
      "publisher": { "@id": "https://example.com/#organization" },
      "mainEntityOfPage": "https://example.com/knowledge/structured-data/"
    }
  ]
}
```

这段标记的每个字段都能在页面上找到对应内容。若某字段在页面上不可见，就不应写入。

## 为什么"加 Schema 就能被 AI 引用"不成立

这个说法混淆了三件事：被理解、被信任、被引用。

结构化数据只作用于第一件。被信任取决于署名、出处、站点一致性与长期积累；被引用取决于检索命中、片段可抽取、来源信号与模型侧策略。后两者都不由标记决定。

更实际的检验方式是：把标记全部删掉，页面是否仍然回答了问题？如果答案是否定的，标记只是给一个空洞页面加了注释。反过来，一个结构清晰、出处完整的页面，即使标记不完美，也不会因此失去被引用的可能。

因此合理的预期是：结构化数据降低误判概率，提高信息被正确解析的机会，是必要的基础设施，不是增长的杠杆。把它当作后者，就会不断在无效方向上投入。

## 实践清单

1. 先用 Schema Markup Validator 或富媒体测试工具验证语法，再谈语义。
2. 每个页面只标记与其主要内容匹配的类型，不堆叠无关类型。
3. 确保标记中的每个字段都能在页面上找到可见对应物。
4. 为 Organization 与 Person 建立规范页面，并用 sameAs 关联外部资料。
5. 日期字段使用 ISO 8601，`dateModified` 只在实质修改时更新。
6. FAQPage 只用于真实问答，不为了展示而制造问题。
7. 把标记纳入构建流程做自动化校验，避免改版后静默失效。
8. 记录每次标记变更的时间与原因，便于与观测数据对齐。
