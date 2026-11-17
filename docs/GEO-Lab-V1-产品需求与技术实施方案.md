接下来建议把 GEO Lab 从概念规划推进到真正可以开发的产品。

我先按照已经确定的方向，制定一份 **GEO Lab V1 产品需求与技术实施方案**。这一版不急于开发复杂的 AI 监测 SaaS，而是先建立一个具有研究特色、技术深度和商业转化能力的 GEO 平台。

**GEO Lab V1**

产品方案

# **Generative Engine Optimization Laboratory**

让优质内容被 AI 发现、理解与引用。

# **6**

核心页面

# **5**

交互工具方向

# **3**

核心业务支柱

# **4**

建设阶段

技术栈：Astro + React + TypeScript

# **GEO Lab V1 产品需求文档**

# GEO Lab V1 产品需求文档

**产品名称：** GEO Lab\
**英文全称：** Generative Engine Optimization Laboratory\
**中文名称：** 生成式引擎优化实验室\
**产品口号：** Research. Optimize. Get Cited.\
**产品定位：** GEO 技术研究、知识传播、实验工具与企业服务平台。

---

## 一、产品目标

建设一个围绕生成式引擎优化的专业技术平台，提供：

1. GEO 基础知识与技术教程。
2. AI 搜索和检索增强生成技术研究。
3. GEO 相关开源项目和工具索引。
4. 可交互的 GEO 技术实验。
5. 网站 GEO 诊断与分析。
6. 企业 GEO 技术咨询与优化服务。

V1 的重点不是开发完整 SaaS，而是建立专业内容门户和第一批可使用的工具，为后续产品商业化积累内容、用户和技术能力。

## 二、目标用户

### 1. 技术开发者

关注 RAG、Embedding、向量检索、AI Search、LLM 等技术。

### 2. 企业市场人员

希望理解 GEO，改善品牌在 AI 搜索中的可见性。

### 3. 企业管理者

希望了解 GEO 的价值、技术方案、实施成本和效果。

### 4. GEO 从业者

希望学习研究方法、使用检测工具、跟踪行业变化。

## 三、产品信息架构

### 一级导航

- Home：首页
- Knowledge：知识库
- Research：技术研究
- Tools：工具箱
- Cases：案例库
- Services：企业服务
- About：关于我们

### 页面规划

#### 1. 首页 `/`

- 品牌介绍
- GEO 核心概念
- 技术研究方向
- 最新研究文章
- GEO 工具入口
- 案例展示
- 企业服务入口

#### 2. 知识库 `/knowledge/`

- GEO 基础知识
- SEO 与 GEO
- AI 搜索原理
- RAG 技术
- Embedding
- Chunking
- Knowledge Graph
- Citation
- GEO 优化方法

#### 3. 技术研究 `/research/`

- 学术论文
- 技术原理
- 实验报告
- 技术趋势
- 开源项目研究

#### 4. 工具箱 `/tools/`

- GEO 网站诊断
- Schema Generator
- Robots Analyzer
- Sitemap Analyzer
- Entity Extractor
- Semantic Similarity

#### 5. 案例库 `/cases/`

- 企业 GEO 案例
- 网站诊断案例
- 内容优化案例
- 实验对比报告

#### 6. 企业服务 `/services/`

- GEO 技术诊断
- GEO 网站优化
- GEO 内容优化
- GEO 持续运营
- GEO 可见性监测

## 四、核心功能需求

### F01：内容管理

采用 Astro Content Collections。

文章支持：

- 标题
- 摘要
- 封面图
- 作者
- 发布时间
- 更新时间
- 分类
- 标签
- 正文
- 参考资料
- 相关文章

内容类型：

- Article
- Research
- Case
- Tutorial
- Tool

### F02：站内搜索

支持：

- 标题搜索
- 正文搜索
- 标签搜索
- 分类过滤

第一版采用 Pagefind。

### F03：GEO 网站诊断

用户输入网站 URL，执行：

- HTTP 状态检查
- 页面标题和描述检查
- H1/H2 结构检查
- Canonical 检查
- Robots 检查
- Sitemap 检查
- JSON-LD 检查
- 作者信息检查
- 组织实体检查
- 内容结构检查

生成报告：

- 综合诊断结果
- 技术问题
- 内容问题
- 实体信息问题
- 优化建议

注意：技术检查与 AI 可见性测试分开，不应将静态网页诊断结果解释成 AI 引用概率。

### F04：GEO 实验室

第一批实现：

1. Embedding 语义相似度演示。
2. Chunking 文本切分演示。
3. RAG 检索流程可视化。
4. Entity 提取演示。
5. GEO 内容结构分析。

### F05：知识图谱

建立技术概念之间的关系：

- GEO
- SEO
- AEO
- RAG
- LLM
- Embedding
- Vector Database
- Reranking
- Knowledge Graph
- Citation

支持节点点击、关系查看、关联文章跳转。

### F06：企业服务线索

提供：

- 服务介绍
- 需求提交
- 联系方式
- 案例展示

第一版可以采用简单表单，不需要完整企业账号系统。

## 五、技术架构

### 前端

- Astro
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Starwind UI

### 内容

- Astro Content Collections
- MDX
- Shiki
- Pagefind

### 可视化

- Apache ECharts
- Cytoscape.js
- Mermaid
- D3.js（按需）

### 状态管理

- Zustand，仅用于复杂交互模块。

### 后端预留

- Go 或 NestJS
- PostgreSQL
- Redis
- LLM Gateway
- 定时任务系统

第一版以静态内容和浏览器端工具为主，暂不引入完整后端。

## 六、视觉设计

### 主站设计

研究机构 + 科技媒体风格。

主色：

- 白色背景
- 深绿色主色
- 橙色强调色
- 浅灰色辅助背景

视觉特点：

- 大留白
- 清晰排版
- 简洁卡片
- 技术图表
- 论文式文章排版
- 高质量示意图

### 工具工作台

后续独立设计：

- 深色背景
- 数据可视化
- 任务状态
- 监测趋势
- 实验记录

## 七、SEO 与 GEO 技术要求

- SSR/SSG 输出完整 HTML。
- 语义化 HTML。
- Sitemap。
- Robots.txt。
- Canonical。
- Open Graph。
- JSON-LD。
- Article Schema。
- Organization Schema。
- Person Schema。
- BreadcrumbList。
- RSS Feed。
- 中英文 hreflang。
- 清晰的内部链接。
- 页面性能优化。

不把 llms.txt、特殊 Meta 标签或 Schema 标记当作 AI 引用保证。

## 八、V1 验收标准

1. 六个一级页面完整可用。
2. 文章分类和标签正常工作。
3. 站内搜索正常。
4. 至少五种技术实验或工具可用。
5. 知识图谱可以交互浏览。
6. 网站可以生成静态部署产物。
7. 移动端正常显示。
8. 所有核心页面具备 SEO 基础信息。
9. 中英文内容架构可扩展。
10. 企业服务入口可正常提交需求。

## 九、后续发展

V2：GEO Benchmark。

V3：AI 可见性监测系统。

V4：企业 GEO SaaS 与 API。

长期方向：建立 GEO 技术研究、实验验证、企业服务和开发者生态。

# **二、项目代码结构**

我建议从一开始就采用模块化结构，避免后面增加工具和 SaaS 时重构整个项目。

```
geo-lab/
├── public/
│   ├── images/
│   ├── icons/
│   ├── robots.txt
│   └── favicon.svg
│
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── navigation/
│   │   ├── articles/
│   │   ├── research/
│   │   ├── tools/
│   │   └── visualization/
│   │
│   ├── content/
│   │   ├── knowledge/
│   │   ├── research/
│   │   ├── cases/
│   │   ├── tutorials/
│   │   └── projects/
│   │
│   ├── features/
│   │   ├── embedding-lab/
│   │   ├── chunking-lab/
│   │   ├── rag-playground/
│   │   ├── entity-extractor/
│   │   └── website-audit/
│   │
│   ├── layouts/
│   │   ├── MainLayout.astro
│   │   ├── ArticleLayout.astro
│   │   └── ResearchLayout.astro
│   │
│   ├── lib/
│   │   ├── seo/
│   │   ├── schema/
│   │   ├── search/
│   │   └── utils/
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── knowledge/
│   │   ├── research/
│   │   ├── tools/
│   │   ├── cases/
│   │   ├── services/
│   │   └── about.astro
│   │
│   └── styles/
│       ├── global.css
│       └── tokens.css
│
├── tests/
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

建议将 `features` 中的实验模块设计成相对独立的 React 组件。未来如果发展成独立工具平台，可以复用其业务逻辑。

## **三、第一批应该制作的内容**

建议不要一开始就发布几十篇普通 GEO 介绍文章，而是先建立 12 篇技术支柱文章。

| 序号 | 文章主题                  | 重要程度 |
| -- | --------------------- | ---- |
| 01 | 什么是 GEO？完整技术介绍        | 最高   |
| 02 | GEO 与 SEO 的区别         | 最高   |
| 03 | AI 搜索引擎工作原理           | 最高   |
| 04 | RAG 完整技术架构            | 最高   |
| 05 | Embedding 与语义检索       | 高    |
| 06 | Chunking 的原理与实践       | 高    |
| 07 | AI 如何理解网页实体           | 高    |
| 08 | Knowledge Graph 与 GEO | 高    |
| 09 | AI 回答为什么会引用某个网站       | 最高   |
| 10 | GEO 效果如何量化评估          | 最高   |
| 11 | 如何建设 AI 易理解的网站        | 最高   |
| 12 | GEO 技术诊断方法论           | 最高   |

每篇文章应该包含原理、流程图、技术示例、实践方法和参考资料。

## **四、开发优先级**

第一批开发顺序：

1. 品牌视觉与 MainLayout。
2. 首页与全局导航。
3. MDX 内容系统。
4. 知识库与文章详情。
5. 研究、案例和服务页面。
6. Pagefind 搜索。
7. SEO 元数据和结构化数据。
8. Embedding 与 Chunking 实验。
9. RAG 可视化。
10. 网站诊断器。

**开发原则：先把研究门户做好，再逐渐引入服务端能力。**

# **三、我还建议增加一个很重要的设计：内容与工具之间建立关联**

普通技术博客的一个问题是：文章和工具往往是两个独立的系统。

GEO Lab 应该让它们相互关联。

例如：

**知识文章**

Embedding 是什么？语义向量如何工作？

**交互实验**

输入两段文本，实时观察语义相似度。

**研究报告**

比较不同 Embedding 模型在不同语料上的表现。

**企业应用**

帮助企业分析内容语义覆盖和检索表现。

这样形成一个闭环：

**知识 → 实验 → 研究 → 应用 → 案例 → 新知识。**

这会成为 GEO Lab 长期积累竞争力的关键。

# **四、下一步建议先完成首页**

我建议不要马上开发所有页面，而是先把首页的设计语言、组件体系和交互方式确定下来。

首页可以分成：

**GEO Lab**

KNOWLEDGE · RESEARCH · TOOLS

GENERATIVE ENGINE OPTIMIZATION

# **让 AI 看见你的内容。**

## Make Your Content Visible to AI.

研究 AI 如何发现、理解、检索和引用互联网内容。

Explore Research

Explore Tools

RESEARCH · EXPERIMENT · OPTIMIZATION

**首页下方内容模块**

**Knowledge**

系统学习 GEO 技术

**Research**

论文、实验与技术研究

**Tools**

GEO 在线工具

**Benchmark**

AI 搜索效果评估

## **现在需要确定一个设计方向**

**1. 首页视觉风格**

A. 科技研究机构风格：白底、深绿、专业、克制

B. 现代 AI 科技风格：深色、渐变、动态效果

C. 科技媒体风格：杂志排版、图文内容、编辑感

D. 研究机构 + 科技媒体混合风格

**2. 网站语言**

中文为主

中英文双语

英文为主

**3. 第一阶段开发重点**

研究门户：先完成完整网站

交互实验室：先开发 GEO 技术工具

商业平台：先做网站诊断和企业服务

完整平台：门户、工具和服务同步规划

确定设计方向，继续设计
