# Firefly 博客项目说明书

> 本文件面向两类读者：
>
> - **站点所有者**：准备用这个仓库搭建自己的个人博客，需要知道怎么装、怎么配、怎么写、怎么发布。
> - **协作 Agent / 后续维护者**：需要快速定位“改某个东西应该动哪个文件”，并避免踩到项目已有的约定与坑。
>
> 本文只描述当前仓库的真实实现。根目录的 `README.en.md` 和 `docs/` 目录仍是上游多语言文档，未随本文件同步，**以本文件为准**。

## 阅读顺序

1. [项目概览](#1-项目概览)
2. [快速开始](#2-快速开始)
3. [目录结构](#3-目录结构)
4. [路由与页面](#4-路由与页面)
5. [内容模型与写作](#5-内容模型与写作)
6. [配置系统](#6-配置系统)
7. [构建流水线](#7-构建流水线)
8. [部署](#8-部署)
9. [二次开发](#9-二次开发)
10. [Agent 操作指南](#10-agent-操作指南)
11. [启用清单](#11-启用清单)
12. [许可与来源](#12-许可与来源)

---

## 1. 项目概览

Firefly 是一个**以配置驱动的静态个人博客模板**：内容在 `src/content` 中用 Markdown/MDX 编写，页面由 Astro 在构建时生成，交互部分用 Svelte 5 岛屿实现。项目没有后端、数据库或登录系统；评论、统计、音乐、追番等能力都依赖第三方服务或构建期抓取。

| 项目 | 说明 |
| --- | --- |
| 站点框架 | Astro 7（静态输出，`trailingSlash: "always"`） |
| UI | Astro 组件 + Svelte 5 岛屿 + Tailwind CSS 4 |
| 语言 | TypeScript 6（`tsc --noEmit --isolatedDeclarations`） |
| 包管理器 | `pnpm`（`preinstall` 中通过 `only-allow pnpm` 强制） |
| Node | `>= 22.23.0`（`package.json` 的 `engines`） |
| 搜索 | Pagefind，索引只在 `pnpm build` 后生成 |
| 内容 | `posts`、`dynamic`、`spec` 三个内容集合 |
| 代码高亮 | Expressive Code（双主题、折叠、语言徽章/Logo、Tab 代码组） |
| 图表/公式 | Mermaid（构建期转 SVG）、PlantUML（远程服务器渲染）、KaTeX + mhchem |
| 部署 | 任意静态托管；可选 Cloudflare Workers 适配器 |
| CI | GitHub Actions：Astro Check、Astro Build、Biome、GitHub Pages 部署 |

### 1.1 功能范围

| 分类 | 已有能力 |
| --- | --- |
| 文章 | Markdown/MDX、草稿、置顶、系列、加密文章、封面与 LQIP、上下篇、相关推荐、分享海报、OG 图、RSS |
| 页面 | 首页分页、归档筛选、分类、标签、系列、搜索、友链、留言板、动态、相册、书签导航、B 站追番、Bangumi、VNDB、MyAnimeList、关于、打赏、404 |
| 视觉 | 横幅/全屏/透明覆盖/纯色四种壁纸模式、水波纹、渐变过渡、樱花、明暗模式、主题色相、双侧栏、可排序侧边栏小部件、移动端布局、Swup 页面过渡 |
| 内容增强 | 提醒框、剧透、图片网格、Wiki Link 文章卡片、GitHub 仓库卡片、Tab 代码组、MDX 组件、灯箱、浮动目录 |
| 第三方 | Twikoo / Waline / Giscus / Disqus / Artalk、Google Analytics / Clarity / Umami / 51la、Meting / 本地音乐、Live2D / Spine 看板娘、Memos |

### 1.2 当前仓库状态

- 仓库中保留了**演示文章、示例动态、示例相册、示例友链/打赏配置**，用于展示功能。
- `src/config` 中的站点身份信息仍是示例值，**站点名称、域名、描述、头像、横幅、社交链接等需要自行填写或清空**。
- 站点信息不写在本说明书中；请直接修改配置，字段见 [6.3 站点身份与占位符](#63-站点身份与占位符)。

---

## 2. 快速开始

### 2.1 安装与启动

```bash
# 建议通过 corepack 使用 package.json 中固定的 pnpm 版本
corepack enable

pnpm install
pnpm dev
```

开发服务器默认运行在 <http://localhost:4321>。

> 不要使用 `npm` 或 `yarn` 安装依赖：`preinstall` 会直接拒绝。

### 2.2 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm start` | 启动开发服务器 |
| `pnpm check` | 运行 `astro check`（Astro/TS/模板诊断） |
| `pnpm type-check` | 运行 `tsc --noEmit --isolatedDeclarations` |
| `pnpm format` | 用 Biome 格式化 `src` 与 `scripts` |
| `pnpm lint` | 用 Biome 检查并安全修复 `src` 与 `scripts` |
| `pnpm build` | 完整构建：预处理脚本 → `astro build` → 后处理脚本 → Pagefind |
| `pnpm preview` | 预览完整构建产物 |
| `pnpm new-post <文件名>` | 新建文章 Markdown 文件 |
| `pnpm new-d "<内容>"` | 新建一条动态 |
| `pnpm lqips` | 只为图片生成/更新 LQIP 数据 |
| `pnpm github-cards` | 只刷新 GitHub 仓库卡片缓存 |

### 2.3 只想快速验证页面时

`pnpm build` 会额外处理图片、字体子集、看板娘资源裁剪和搜索索引，耗时较长，并可能访问外网。只验证页面能否构建时，可以运行：

```bash
pnpm astro build
```

CI 中的构建任务使用的就是这条命令。代价是**没有 Pagefind 搜索索引**，字体子集、LQIP、内联脚本压缩等后处理也不会执行。

### 2.4 首次使用建议顺序

1. `pnpm install`。
2. 按 [11. 启用清单](#11-启用清单) 清空或替换站点身份、示例内容和第三方配置。
3. `pnpm dev` 逐页检查。
4. `pnpm build` + `pnpm preview` 验证搜索、RSS、OG 图等只在构建期生成的内容。
5. 按 [8. 部署](#8-部署) 发布。

---

## 3. 目录结构

```text
.
├─ astro.config.mjs          # Astro 集成、Markdown 处理器、字体、Swup、Sitemap、可选 Cloudflare 适配器
├─ package.json              # 命令、依赖、Node/pnpm 版本约束
├─ tsconfig.json             # 路径别名（@components、@utils、@i18n、@layouts、@/* 等）
├─ biome.json                # 格式化与 lint 规则（Tab 缩进、双引号）
├─ pagefind.yml              # Pagefind 索引排除选择器
├─ vercel.json               # Vercel 构建命令、输出目录、安全与缓存响应头
├─ wrangler.jsonc            # Cloudflare Workers/Pages 的 assets 配置
├─ public/                   # 原样复制到产物，不参与 Astro 图片优化
│  ├─ assets/                # css、fonts、images、js、music 等静态资源
│  ├─ favicon/               # favicon
│  ├─ gallery/<albumId>/     # 相册图片与 urls.txt
│  └─ pio/                   # Live2D / Spine 模型与运行时
├─ src/
│  ├─ assets/images/         # 会被 Astro 优化的图片（横幅、Logo、头像等）
│  ├─ components/            # Astro / Svelte 组件，按职责分目录
│  ├─ config/                # 全部站点配置（见第 6 节）
│  ├─ constants/             # lqips.json、github-card-data.json、icons-data.json 等
│  ├─ content/
│  │  ├─ posts/              # 文章（.md / .mdx，可嵌套目录）
│  │  ├─ dynamic/            # 动态（.md，文件名即时间戳）
│  │  └─ spec/               # about.md、friends.mdx、guestbook.md
│  ├─ content.config.ts      # 三个内容集合的 Zod schema
│  ├─ i18n/                  # 文案 key、翻译表、语言文件
│  ├─ layouts/               # Layout.astro（文档骨架）与 MainGridLayout.astro（页面布局）
│  ├─ pages/                 # 文件路由
│  ├─ plugins/               # 自定义 remark / rehype 插件
│  ├─ styles/                # 全局 CSS / Stylus / Tailwind 主题变量
│  ├─ types/                 # 与 config 对应的类型定义
│  └─ utils/                 # 数据获取、日期、URL、加密、布局等纯函数
├─ scripts/                  # 构建与脚手架脚本
├─ docs/                     # 上游多语言 README（不是本项目文档）
└─ dist/                     # 构建产物（不提交）
```

### 3.1 关键文件

| 文件 | 作用 |
| --- | --- |
| `astro.config.mjs` | 站点 `site`/`base`、Swup、Icon、Expressive Code、Svelte、Sitemap、MDX、Markdown 插件链、字体加载、Cloudflare 适配器开关 |
| `src/config/index.ts` | 所有配置的统一出口；组件应优先从 `@/config` 导入 |
| `src/config/siteConfig.ts` | 站点身份、主题色、页面宽度、导航栏、分页、文章页、媒体页、图片优化、页面开关 |
| `src/content.config.ts` | 文章/动态/固定页面的 frontmatter schema；改字段必须同步这里 |
| `src/pages/[...page].astro` | 首页与分页（项目没有 `index.astro`） |
| `src/pages/posts/[...slug].astro` | 文章详情、加密文章、目录、系列导航、相关推荐、评论 |
| `src/layouts/Layout.astro` | `<head>`、全局样式、字体、统计、特效、音乐管理器、JSON-LD |
| `src/layouts/MainGridLayout.astro` | 导航栏、壁纸、侧边栏、分类栏、页脚、看板娘 |
| `src/utils/content-utils.ts` | 文章排序、上下篇、系列、标签/分类统计、相关推荐 |
| `src/i18n/translation.ts` | 语言映射、语言回退规则 |
| `scripts/` | 构建前后处理与内容脚手架 |

### 3.2 图片与静态资源的放置规则

这是项目里最容易出错的地方之一：

| 放置位置 | 引用方式 | 是否优化 | 适用场景 |
| --- | --- | --- | --- |
| `src/assets/images/...` | 配置中写 `assets/images/xxx.avif`（**不带前导 `/`**） | 是（构建变慢） | 头像、Logo、横幅、封面等希望被压缩的图片 |
| `public/...` | 写 `/assets/images/xxx.webp`、`/gallery/...` 等（**带前导 `/`**） | 否，原样复制 | 需要稳定 URL、第三方引用、相册、看板娘模型、字体、音乐 |
| 远程 URL | 直接写 `https://...` | 否 | 随机图 API、外链图片 |

补充约定：

- `src/assets` 下的图片越多，构建越慢；`public` 下的图片不会生成 LQIP，也不会被 Astro 压缩。
- 图片 LQIP（2×2 渐变占位）数据在 `src/constants/lqips.json`，由脚本生成，**不要手改**。
- 相册图片只放在 `public/gallery/<albumId>/`。
- 本地字体放 `public/assets/fonts/`。
- Live2D / Spine 模型放 `public/pio/`。

---

## 4. 路由与页面

路由由 `src/pages` 的文件结构决定，并使用尾斜杠（`trailingSlash: "always"`），站内链接也应带尾斜杠。

| 路由 | 源文件 | 说明 |
| --- | --- | --- |
| `/`、`/2/`、`/3/`… | `src/pages/[...page].astro` | 首页文章列表与分页，每页数量由 `siteConfig.pagination.postsPerPage` 控制 |
| `/posts/<路径>/` | `src/pages/posts/[...slug].astro` | 文章详情；支持加密、目录、系列、上下篇、相关推荐、评论、分享海报 |
| `/archive/` | `src/pages/archive.astro` | 按年份归档；支持 `?tag=`、`?category=`、`?uncategorized=` 筛选与年份折叠 |
| `/categories/` | `src/pages/categories/index.astro` | 全部分类及文章数 |
| `/tags/` | `src/pages/tags/index.astro` | 全部标签及文章数 |
| `/series/` | `src/pages/series/index.astro` | 全部系列，按系列分组折叠展示 |
| `/search/` | `src/pages/search.astro` | Pagefind 高级搜索；索引只在完整构建后存在 |
| `/friends/` | `src/pages/friends.astro` | 友链 + `friends.mdx` 自定义内容 + 评论；受 `pages.friends` 控制 |
| `/guestbook/` | `src/pages/guestbook.astro` | 留言板，正文来自 `spec/guestbook.md`；评论系统启用后显示评论；受 `pages.guestbook` 控制 |
| `/dynamic/` | `src/pages/dynamic/index.astro` | 动态流；数据来自本地 JSON 或 Memos；受 `pages.dynamic` 控制 |
| `/dynamic/comments/` | `src/pages/dynamic/comments.astro` | 单条动态的评论 iframe 页；评论未启用时重定向 404 |
| `/gallery/` | `src/pages/gallery/index.astro` | 相册列表；受 `pages.gallery` 控制 |
| `/gallery/<albumId>/` | `src/pages/gallery/[album].astro` | 单个相册；可设置前端加密密码 |
| `/booknav/` | `src/pages/booknav.astro` | 书签导航；受 `pages.booknav` 控制 |
| `/bilibili/` | `src/pages/bilibili.astro` | B 站追番/追剧；构建时抓取；受 `pages.bilibili` 控制 |
| `/bangumi/` | `src/pages/bangumi.astro` | Bangumi；`static` 构建时抓取或 `dynamic` 浏览器请求；受 `pages.bangumi` 控制 |
| `/vndb/` | `src/pages/vndb.astro` | VNDB；static/dynamic 两种模式；受 `pages.vndb` 控制 |
| `/myanimelist/` | `src/pages/myanimelist.astro` | MyAnimeList；构建时抓取；受 `pages.mal` 控制 |
| `/about/` | `src/pages/about.astro` | 关于页，正文来自 `spec/about.md`；**始终存在** |
| `/sponsor/` | `src/pages/sponsor.astro` | 打赏页；受 `pages.sponsor` 控制 |
| `/404/`、`404.html` | `src/pages/404.astro` | 404 页；被关闭的页面重定向到 `/404/`，静态产物为 `404.html` |
| `/rss/` | `src/pages/rss.astro` | 人类可读的 RSS 说明页 |
| `/rss.xml` | `src/pages/rss.xml.ts` | RSS 2.0；加密文章只输出占位说明 |
| `/robots.txt` | `src/pages/robots.txt.ts` | 指向 `sitemap-index.xml`，并禁止抓取 `/_astro/` |
| `/sitemap-index.xml` | `@astrojs/sitemap` | 自动生成；按页面开关过滤 |
| `/og/<slug>.png` | `src/pages/og/[...slug].ts` | 文章 OG 图；由 `siteConfig.post.generateOgImages` 控制 |
| `/api/allPostMeta.json` | `src/pages/api/allPostMeta.json.ts` | 文章元数据（日历热力图等使用） |
| `/api/dynamic.json` | `src/pages/api/dynamic.json.ts` | 构建期生成的动态数据（含渲染后的 HTML 与图片列表） |

### 4.1 页面开关行为

`siteConfig.pages` 中的页面设为 `false` 时：

1. 对应页面在服务端直接 `Astro.redirect("/404/")`；
2. 导航栏中带 `pageKey` 的菜单项被隐藏；
3. Sitemap 过滤掉对应 URL。

页面开关可以被环境变量覆盖，见 [6.4 环境变量与构建期覆盖](#64-环境变量与构建期覆盖)。

---

## 5. 内容模型与写作

三个内容集合的 schema 定义在 `src/content.config.ts`。**新增 frontmatter 字段时，必须同时修改该文件和调用处**，否则字段不会出现在 `entry.data` 中。

### 5.1 文章（`src/content/posts`）

- 支持 `.md` 和 `.mdx`，可以放在多层目录中。
- 文章 URL 由 Astro glob loader 生成的 entry id 决定，规则是：
  1. frontmatter 写了 `slug`：直接用 `slug` 作为 URL 路径；
  2. 没写 `slug`：用文件相对路径去掉扩展名，每个路径段做 GitHub slug 化，并去掉末尾的 `/index`；
  3. 最终 URL 一律是 `/posts/<id>/`，并强制尾斜杠。

  示例：
  - `posts/firefly.md` + `slug: firefly` → `/posts/firefly/`
  - `posts/my-post.md`（无 slug）→ `/posts/my-post/`
  - `posts/guide/index.md`（无 slug）→ `/posts/guide/`
  - `posts/guide/foo.md` + `slug: guide/foo-bar` → `/posts/guide/foo-bar/`
- `slug` 不在 `content.config.ts` 的 Zod schema 中，因此 `entry.data.slug` 取不到；但 Astro 的 glob loader 会在 schema 校验前读取原始 frontmatter，所以**它确实影响 URL**。不要因为 TypeScript 不报错就删掉它。
- 中文文件名在无 `slug` 时会保留中文并做 URL 编码；`pnpm new-post` 默认用拼音生成 `slug`，因此中文标题会得到拼音 URL。需要稳定、可读 URL 时，建议显式写 `slug`。
- 发布时间使用 `published`，排序规则为：**置顶优先 → `published` 降序**。
- 草稿：`draft: true` 在开发环境仍可见，**只有生产构建会排除**。

#### 5.1.1 frontmatter 字段

| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | string | — | 是 | 文章标题 |
| `slug` | string | 文件路径（规范化） | 否 | **schema 外**，由 Astro glob loader 读取；优先作为文章 URL 与 entry id。可写多级路径，例如 `guide/foo-bar`；不要以 `/index` 结尾，避免与 Wiki Link 生成的链接不一致 |
| `published` | Date | — | 是 | 发布日期，建议 `YYYY-MM-DD` |
| `updated` | Date | — | 否 | 更新时间；影响“上次编辑”卡片 |
| `draft` | boolean | `false` | 否 | 生产构建时排除 |
| `description` | string | `""` | 否 | 摘要，用于列表、SEO、OG、RSS |
| `image` | string | `""` | 否 | 封面：本地路径、远程 URL，或 `"api"` 使用随机封面 |
| `tags` | string[] | `[]` | 否 | 标签；参与分类统计与相关推荐 |
| `category` | string \| null | `""` | 否 | 分类；空值显示为“未分类” |
| `lang` | string | `""` | 否 | 文章页面语言，留空跟随站点语言 |
| `pinned` | boolean | `false` | 否 | 置顶 |
| `author` | string | `""` | 否 | 覆盖默认作者 |
| `sourceLink` | string | `""` | 否 | 原文/来源链接 |
| `licenseName` | string | `""` | 否 | 覆盖默认许可证名称 |
| `licenseUrl` | string | `""` | 否 | 覆盖默认许可证链接 |
| `comment` | boolean | `true` | 否 | 是否显示评论；加密文章始终不显示 |
| `password` | string | `""` | 否 | 设置后文章内容在构建期加密 |
| `passwordHint` | string | `""` | 否 | 密码提示 |
| `series` | string | `""` | 否 | 系列名；相同值自动归为一组 |
| `seriesOrder` | number | — | 否 | 系列内顺序，升序；未设置者排最后 |
| `prevTitle` / `prevSlug` / `nextTitle` / `nextSlug` | string | `""` | 否 | **内部字段**，由构建过程写入，不要手填 |

#### 5.1.2 示例

```yaml
---
title: 我的第一篇文章
published: 2026-01-01
updated: 2026-01-02
description: 这是一段摘要
image: assets/images/cover.webp
tags: [Astro, 博客]
category: 技术
pinned: false
draft: false
series: Astro 入门
seriesOrder: 1
---
```

新建文章：

```bash
pnpm new-post my-first-post
# 生成 src/content/posts/my-first-post.md
```

> 脚手架会根据文件名生成 `slug`（中文会转拼音），这个值会直接成为文章 URL。若不想要拼音 URL，修改或删除该行即可；删除后 URL 回退到文件路径规则。

#### 5.1.3 加密文章

- 设置 `password` 后，正文 HTML 在**构建期**用 AES-256-GCM 加密，页面只下发密文；密码不会出现在 HTML 中。
- 客户端输入密码后解密；同一 `password + slug` 的盐和 IV 是确定的，因此同一篇文章的密文稳定，便于用 `sessionStorage` 记住已解锁状态。
- 加密文章的评论自动关闭；RSS 只输出占位文案；相关推荐会排除加密文章。
- 这是前端访问控制，不是强安全边界：能拿到完整构建产物的人仍可能尝试暴力破解，**不要用它保护真正的机密**。

#### 5.1.4 系列与相关推荐

- `series` 相同的文章组成一个系列；文章页显示系列导航，`/series/` 汇总全部系列。
- 相关推荐评分：标签 Jaccard 相似度 + 标题分词相似度 + 时间新鲜度（6 个月半衰期）+ 同分类加分；优先取有标签匹配的文章，不足时再按新鲜度补齐。

### 5.2 动态（`src/content/dynamic`）

每条动态是一个 `.md` 文件，文件名通常是时间戳。

| 字段 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `published` | Date | — | 是 | 发布时间；文件时间戳也会用于生成 id |
| `pinned` | boolean | `false` | 否 | 置顶 |
| `location` | string | `""` | 否 | 位置文本 |

```bash
pnpm new-d "今天把博客部署上线了"
```

数据来源有两种：

1. **本地文件**（默认）：构建时通过 `/api/dynamic.json` 输出，页面客户端加载。
2. **Memos**：在 `dynamicConfig.memos.enable = true` 后，浏览器直接请求 Memos API；需要给 Memos 配置 CORS，`parent` 必须与 API 返回的 `creator` 完全一致（区分大小写）。

### 5.3 固定页面（`src/content/spec`）

| 文件 | 对应页面 | 要求 |
| --- | --- | --- |
| `about.md` | `/about/` | **始终必需**，缺失会导致构建失败 |
| `friends.mdx` | `/friends/` | 页面启用时必需；支持 MDX；可被 `friendsPageConfig.showCustomContent` 控制显示 |
| `guestbook.md` | `/guestbook/` | 页面启用时必需；评论系统需另行启用 |

### 5.4 相册

相册配置在 `src/config/galleryConfig.ts`，图片放在 `public/gallery/<albumId>/`。

- 支持 `jpg`、`jpeg`、`png`、`webp`、`avif`、`gif`。
- 封面优先级：配置中的 `cover` → 目录下的 `cover.*` → 第一张图片。
- 目录下可放 `urls.txt`，每行一个远程图片 URL，`#` 开头的行会被忽略。
- `password` 会让照片列表在构建期加密，但**图片文件本身仍在 `public/gallery` 下，可直接通过 URL 访问**；不要用它保护敏感照片。
- `columnWidth` 控制瀑布流最小列宽。

### 5.5 Markdown / MDX 能力

以下语法已有示例文章，可直接对照：

| 能力 | 语法/入口 | 示例文件 |
| --- | --- | --- |
| 提醒框（GitHub/Obsidian/VitePress/Docusaurus） | `> [!NOTE]` 等，主题由 `siteConfig.post.rehypeCallouts.theme` 控制；Python-Markdown 的 `!!!` / `???` 语法需开启 `enablePythonMarkdownAdmonitions` | `src/content/posts/markdown-extended.md` |
| 剧透 | `:spoiler[文本]` | `markdown-extended.md` |
| 图片网格 | `[grid]` … `[/grid]` 包裹多张图片 | `markdown-extended.md` |
| Wiki Link（自动文章卡片/行内链接） | `[[文章id]]`、`[[文章id\|显示文字]]`；id 可写 slug、相对 `posts` 的文件路径或唯一裸文件名 | `guide/firefly-wiki-link.md` |
| GitHub 仓库卡片 | `::github{repo="owner/repo"}` | `markdown-extended.md` |
| Tab 代码组 | `::: code-group labels=[...]` 包裹多个代码块 | `code-examples.md` |
| 数学公式 | `$...$`、`$$...$$`，KaTeX + mhchem | `katex-math-example.md` |
| Mermaid | ` ```mermaid `，构建期转静态 SVG，亮暗双主题 | `markdown-mermaid.md` |
| PlantUML | ` ```plantuml `，由远程服务器渲染 | `markdown-plantuml.md` |
| Expressive Code | 代码高亮、行号、折叠、语言徽章/Logo | `code-examples.md` |
| MDX 组件 | 从 `@/components/firefly-mdx` 引入 | `mdx-example.mdx` |
| 视频/HTML | 直接在 Markdown 中写 HTML | `video.md` |

MDX 可用组件：

```mdx
import {
  Badge,
  StepItem,
  Steps,
  TabGroup,
  Timeline,
  TimelineItem,
} from "@/components/firefly-mdx";
```

可用的渲染行为：

- 标题自动生成锚点与 `#` 链接；
- 外链自动加图标并区分站内/站外；
- 邮箱地址会被 base64 混淆；
- 图片自动包 `<figure>` 并支持 Fancybox 灯箱；
- 配置 `siteConfig.imageOptimization.noReferrerDomains` 可为特定域名图片加 `no-referrer`，解决防盗链 403；
- 阅读时长与摘要由 `remark-reading-time`、`remark-excerpt` 生成。

### 5.6 封面与 OG 图

- `image` 留空：无封面。
- `image: "api"`：从 `coverImageConfig.randomCoverImage.apis` 依次尝试随机图；需要同时把 `randomCoverImage.enable` 设为 `true`。
- `coverImageConfig` 还控制文章页是否显示封面、是否使用封面叠加标题布局、是否显示加载动画。
- OG 图由 `siteConfig.post.generateOgImages` 控制；开启后构建明显变慢，本地调试建议关闭。
- OG 图会优先使用 `siteConfig.favicon` 中的 PNG 图标；没有时回退到 `/favicon/favicon-dark-192.png`。

---

## 6. 配置系统

所有站点配置都在 `src/config`，类型在 `src/types`。组件和页面通过 `@/config` 统一导入，避免深层相对路径。

典型用法：

```ts
import { siteConfig, sidebarLayoutConfig } from "@/config";
```

### 6.1 配置文件清单

| 文件 | 导出 | 控制内容 |
| --- | --- | --- |
| `index.ts` | 全部配置与类型 | 统一出口 |
| `siteConfig.ts` | `siteConfig` | 站点身份、主题色、页面宽度、卡片、favicon、导航栏、开始日期、时区、分类栏、标签样式、归档折叠、文章列表布局、分页、文章页、Bilibili/Bangumi/VNDB/MAL、图片优化、语言、页面开关 |
| `navBarConfig.ts` | `navBarConfig`、`navBarSearchConfig`、`LinkPresets` | 导航菜单结构、链接预设、搜索方式 |
| `sidebarConfig.ts` | `sidebarLayoutConfig` | 侧边栏位置、平板显示哪侧、文章页隐藏/保持、左右及移动端小部件顺序与开关 |
| `backgroundWallpaper.ts` | `backgroundWallpaper` | 壁纸模式、图片/视频、标题、打字机、链接、轮播、水波纹、渐变、导航栏透明、遮罩、全屏模式 |
| `profileConfig.ts` | `profileConfig` | 头像、昵称、签名、社交链接 |
| `announcementConfig.ts` | `announcementConfig` | 侧边栏公告文案、关闭按钮、链接 |
| `analyticsConfig.ts` | `analyticsConfig` | Google Analytics、Clarity、Umami、51la |
| `commentConfig.ts` | `commentConfig` | Twikoo / Waline / Giscus / Disqus / Artalk 与访问量 |
| `coverImageConfig.ts` | `coverImageConfig` | 文章封面显示方式、随机封面 API |
| `displaySettingsConfig.ts` | `displaySettingsConfig` | 前台“视图设置”面板总开关与各子项 |
| `dynamicConfig.ts` | `dynamicConfig` | 动态页标题、描述、每页数量、评论、API、Memos |
| `effectsConfig.ts` | `sakuraConfig` | 樱花特效 |
| `expressiveCodeConfig.ts` | `expressiveCodeConfig` | 代码高亮主题、折叠、语言徽章、语言 Logo |
| `fontConfig.ts` | `fontsList`、`fontConfig` | Astro Font API 字体定义、全局/区域字体、本地字体子集 |
| `footerConfig.ts` | `footerConfig` | 是否注入 `FooterConfig.html` |
| `FooterConfig.html` | — | 备案号等页脚自定义 HTML |
| `friendsConfig.ts` | `friendsPageConfig`、`friendsConfig`、`getEnabledFriends` | 友链页面选项、友链列表、权重/随机排序 |
| `galleryConfig.ts` | `galleryConfig` | 相册列表、封面、密码、瀑布流列宽 |
| `booknavConfig.ts` | `booknavPageConfig`、`booknavConfig` | 书签导航分组与条目、favicon 自动获取 |
| `licenseConfig.ts` | `licenseConfig` | 文章许可证名称、链接、图标 |
| `mermaidConfig.ts` | `mermaidConfig` | Mermaid 亮/暗主题 |
| `musicConfig.ts` | `musicPlayerConfig` | 导航栏/侧边栏入口、Meting 或本地歌单、播放模式、歌词 |
| `pioConfig.ts` | `live2dWidgetConfig`、`spineModelConfig` | Live2D / Spine 看板娘开关、模型、位置、尺寸、交互 |
| `plantumlConfig.ts` | `plantumlConfig` | PlantUML 开关、服务器、亮/暗主题 |
| `sponsorConfig.ts` | `sponsorConfig` | 打赏页文案、收款方式、打赏者列表、文章底部按钮 |

> `siteConfig` 顶部的 `SITE_LANG` 与 `pages` 在导出前会先经过环境变量解析，因此不要绕过 `resolveSiteLang` / `resolvePageToggles` 直接改内部变量。

### 6.2 核心配置速查

| 想改什么 | 字段 |
| --- | --- |
| 站点标题/副标题/域名/描述/关键词 | `siteConfig.title`、`subtitle`、`site_url`、`description`、`keywords` |
| 主题色相与默认明暗 | `siteConfig.themeColor.hue`、`themeColor.defaultMode` |
| 内容区宽度 | `siteConfig.pageWidth` |
| 卡片边框/阴影/跟随主题色 | `siteConfig.card` |
| favicon | `siteConfig.favicon` |
| 导航栏 Logo/标题/宽度/对齐/吸顶 | `siteConfig.navbar` |
| 运行天数起点 | `siteConfig.siteStartDate` |
| 时区（RSS、Bangumi、动态时间戳） | `siteConfig.timezone` |
| 分类快捷栏与样式 | `siteConfig.categoryBar`、`categoryStyle` |
| 标签样式 | `siteConfig.tagStyle` |
| 归档是否折叠往年 | `siteConfig.foldArticle` |
| 列表/网格布局、封面位置、元数据 | `siteConfig.postListLayout` |
| 每页文章数 | `siteConfig.pagination.postsPerPage` |
| 提醒框主题 | `siteConfig.post.rehypeCallouts` |
| 上次编辑卡片、分享海报、OG 图 | `siteConfig.post` |
| 媒体页账号/模式/NSFW | `siteConfig.bilibili`、`bangumi`、`vndb`、`mal` |
| 图片格式/质量/防盗链 | `siteConfig.imageOptimization` |
| 页面开关 | `siteConfig.pages` |

### 6.3 站点身份与占位符

本仓库不预置站点身份。使用前请按下表填写；**不要沿用示例值**。

| 位置 | 字段 | 填写内容 |
| --- | --- | --- |
| `siteConfig` | `title` | `<站点名称>` |
| `siteConfig` | `subtitle` | `<副标题>` |
| `siteConfig` | `site_url` | `https://<你的域名>`（RSS、Sitemap、OG、绝对链接都依赖它） |
| `siteConfig` | `description` | `<站点描述>` |
| `siteConfig` | `keywords` | `["<关键词>", ...]` |
| `siteConfig.navbar` | `logo`、`title` | 站点 Logo 与导航栏标题 |
| `siteConfig.favicon` | `src` | favicon 路径；OG 图会优先使用其中的 PNG |
| `backgroundWallpaper.common.homeText` | `title`、`subtitle`、`links` | 首页横幅文案与社交图标 |
| `profileConfig` | `avatar`、`name`、`bio`、`links` | 侧边栏/关于页的作者信息 |
| `footerConfig` + `FooterConfig.html` | — | 页脚自定义内容（备案号等） |
| `licenseConfig` | `name`、`url` | 文章默认许可证 |
| `commentConfig` | `type` 及各服务字段 | 评论系统 |
| `analyticsConfig` | 各统计 ID | 访问统计 |

### 6.4 环境变量与构建期覆盖

`PUBLIC_` 前缀的变量会在构建时被静态替换，必须**在构建环境里设置**，只在运行时设置无效。

| 变量 | 作用 | 取值 |
| --- | --- | --- |
| `PUBLIC_SITE_LANG` | 覆盖 `siteConfig.lang` | `zh_CN`、`zh_TW`、`en`、`ja`、`ru`、`ko`（也接受 `zh-cn` 等写法） |
| `PUBLIC_PAGES_<KEY>` | 覆盖页面开关，优先级高于 `siteConfig.pages` | `true/false/1/0/on/off/yes/no/enable/enabled/disable/disabled` |
| `PUBLIC_DISPLAY_SETTINGS` | 覆盖“视图设置”面板总开关 | 同上 |
| `CF_WORKERS` | 启用 `@astrojs/cloudflare` 适配器 | 任意非空值 |
| `GITHUB_TOKEN` | 构建时刷新 GitHub 卡片数据，避免 API 限流 | GitHub Token |
| `FIREFLY_BUILD_PLATFORM` | 覆盖侧边栏“站点信息”显示的构建平台名称 | 任意文本 |

页面开关的 `<KEY>` 为：`FRIENDS`、`GUESTBOOK`、`DYNAMIC`、`GALLERY`、`BOOKNAV`、`BILIBILI`、`BANGUMI`、`VNDB`、`MAL`、`SPONSOR`。例如：

```bash
PUBLIC_PAGES_GALLERY=false pnpm build
PUBLIC_SITE_LANG=en pnpm build
```

### 6.5 修改配置的注意事项

- 修改 `astro.config.mjs` 中读取的配置（Expressive Code、字体、提醒框主题等）后，**需要重启开发服务器**才生效。
- `displaySettingsConfig.enable = true` 会把设置面板及其依赖打进客户端；其中 `wallpaperModeSwitchable` 是体积大头，开启后约增加 **33 KB/页**。生产环境建议关闭或只保留必要子项。
- `siteConfig.site_url` 必须是最终可访问的绝对地址，否则 RSS、Sitemap、OG 图、JSON-LD 中的链接会错误。
- 预装图标集：`fa7-brands`、`fa7-regular`、`fa7-solid`、`material-symbols`、`simple-icons`；需要其他图标集时运行 `pnpm add @iconify-json/<图标集名>`。
- 不要把真实令牌（如 `vndb.apiToken`）、统计 ID、评论服务密钥提交到公开仓库；敏感值放在部署平台环境变量中。

---

## 7. 构建流水线

`pnpm build` 的执行顺序是固定的：

| 步骤 | 脚本 | 作用 | 产物/影响 |
| --- | --- | --- | --- |
| 1 | `scripts/generate-github-card-data.ts` | 扫描内容中的 `::github{repo=...}`，请求 GitHub API | `src/constants/github-card-data.json` |
| 2 | `scripts/generate-lqips.ts` | 用 sharp 为 `src` + `public` 图片生成 2×2 渐变（跳过 favicon、pio、特效图、音乐、VNDB 封面） | `src/constants/lqips.json`；自动清理已删除图片的旧记录 |
| 3 | `scripts/generate-vndb-covers.ts` | VNDB 封面下载（仅在配置开启时） | `public/vndb-covers/`（已 gitignore） |
| 4 | `astro build` | 渲染全部页面、RSS、OG 图、API JSON | `dist/`；启用 Cloudflare 适配器时为 `dist/client` + `dist/server` |
| 5 | `scripts/prune-pio-assets.ts` | 按看板娘开关删除未使用的模型/运行时 | 减小产物 |
| 6 | `scripts/subset-fonts.ts` | 扫描构建后 HTML 的实际字符，生成 woff2 子集 | `<siteRoot>/_astro/fonts` |
| 7 | `scripts/minify-inline-scripts.ts` | 用 esbuild 压缩 `is:inline` 脚本 | 修改构建后的 HTML |
| 8 | `scripts/run-pagefind.ts` | 在真实站点根目录建立搜索索引 | `<siteRoot>/pagefind/` |

几个要点：

- LQIP 与 GitHub 卡片数据是**提交到仓库的生成文件**，方便无网络构建时回退；但不要手改。
- 新增图片后可以单独运行 `pnpm lqips` 更新并提交 `src/constants/lqips.json`。
- GitHub 卡片刷新失败时会保留缓存；没有缓存则卡片显示回退状态，不会中断构建。
- VNDB 封面、番剧、MAL、Bilibili 的抓取都发生在构建期；对应页面关闭或账号为空时会跳过。
- Pagefind 索引不会出现在 `pnpm dev` 中，因此**开发环境搜索不可用**；请用 `pnpm build` + `pnpm preview` 验证。
- Cloudflare 构建时产物根目录不同，`scripts/site-root.ts` 会自动选择 `dist/client`，不要硬编码 `dist`。

### 7.1 脚本清单

| 脚本 | 用途 |
| --- | --- |
| `scripts/new-post.js` | 新建文章并生成 frontmatter 模板 |
| `scripts/new-dynamic.js` | 以站点时区生成带时间戳的动态文件 |
| `scripts/generate-github-card-data.ts` | 刷新 GitHub 仓库卡片缓存 |
| `scripts/generate-lqips.ts` | 生成图片 LQIP |
| `scripts/generate-vndb-covers.ts` | 下载并压缩 VNDB 封面 |
| `scripts/prune-pio-assets.ts` | 裁剪未启用的看板娘资源 |
| `scripts/subset-fonts.ts` | 本地字体子集化 |
| `scripts/minify-inline-scripts.ts` | 压缩内联脚本 |
| `scripts/run-pagefind.ts` | 运行 Pagefind |
| `scripts/quarantine-bad-posts.mjs` | 维护工具：把引用了不存在图片的文章移到隔离目录；**不在构建流程中，会移动文件，使用前先读脚本** |

### 7.2 CI 与本地构建的差异

| 工作流 | 触发 | 执行内容 |
| --- | --- | --- |
| `.github/workflows/build.yml` | push / PR 到 `master` | Node 22/23 矩阵；`pnpm install --frozen-lockfile`；`pnpm astro check`；`pnpm astro build` |
| `.github/workflows/biome.yml` | push / PR 到 `master` | `biome ci ./src` |
| `.github/workflows/deploy.yml` | push 到 `master` 或手动 | 完整 `pnpm build`，上传 `dist` 到 GitHub Pages |

CI 的 build 任务**不会**执行 LQIP、字体子集、Pagefind、看板娘裁剪等后处理，因此不要仅凭 CI 通过就认为搜索结果或字体子集正确；发布前应在本地跑一次完整 `pnpm build`。

---

## 8. 部署

### 8.1 通用静态部署

1. 设置最终域名到 `siteConfig.site_url`。
2. 运行 `pnpm build`。
3. 上传产物：
   - 未启用 Cloudflare 适配器：上传 `dist/`；
   - 启用 `CF_WORKERS` 时：静态资源在 `dist/client/`，按所选平台要求部署。
4. 确保服务器把 `/`、`/2/` 等尾斜杠路由映射到 `index.html`，并配置 404 页面。

### 8.2 Vercel

仓库自带 `vercel.json`：

- `buildCommand`：`pnpm build`
- `outputDirectory`：`dist`
- 对 `/_astro/*` 设置一年不可变缓存
- 附加 `X-Content-Type-Options`、`X-Frame-Options`、`X-XSS-Protection`、`Referrer-Policy`

在 Vercel 项目中设置 `PUBLIC_*` 环境变量后重新构建即可。

### 8.3 Cloudflare Workers / Pages

- 构建时设置 `CF_WORKERS=1`，`astro.config.mjs` 会启用 `@astrojs/cloudflare` 适配器。
- `wrangler.jsonc` 中已声明项目名与 `assets.directory = "./dist"`；不同 Cloudflare 部署方式对 `main`/`assets` 的要求可能不同，**部署前按当前 Cloudflare 文档核对产物目录（`dist/client`）**。
- 站点本身是静态内容为主；适配器主要用于需要 Workers 运行时的部署方式。

### 8.4 GitHub Pages

`.github/workflows/deploy.yml` 已配置：

1. push 到 `master`（或手动触发）；
2. Node 22 + pnpm 11.22.0；
3. `pnpm install --no-frozen-lockfile`；
4. `pnpm build`；
5. 生成 `dist/.nojekyll`；
6. 上传 `dist` 并部署。

注意：

- 仓库 Settings → Pages → Source 需选择 **GitHub Actions**。
- 当前 `astro.config.mjs` 的 `base` 是 `"/"`，适用于**用户/组织根站点或自定义域名**。如果部署到 `https://<user>.github.io/<repo>/` 这类项目页，需要同时修改 `base`，并确认所有站内链接/静态资源路径。
- `siteConfig.site_url` 要写成最终 Pages 地址（含子路径时也要一致）。

### 8.5 发布后检查

- `/`、`/posts/<示例文章>/`、`/archive/`、`/404/` 正常；
- `/search/` 能返回结果（说明 Pagefind 索引存在）；
- `/rss.xml`、`/sitemap-index.xml`、`/robots.txt` 可访问且域名正确；
- 文章 OG 图 `/og/<slug>.png` 可访问（若开启）；
- 被关闭的页面返回 404 且导航栏不显示；
- 移动端壁纸、侧边栏、目录、灯箱、代码折叠正常。

---

## 9. 二次开发

### 9.1 页面渲染链路

```text
src/pages/*.astro
  └─ MainGridLayout（导航栏 / 壁纸 / 侧边栏 / 页脚 / 看板娘）
       └─ Layout（<head> / 全局样式 / 字体 / 统计 / 特效 / JSON-LD）
            └─ 页面组件（PostPage、ArchivePanel、各页面 Svelte 岛屿）
```

- **Astro 组件**负责静态结构与构建期数据。
- **Svelte 组件**负责客户端交互（搜索、布局切换、动态流、相册、媒体网格、设置面板等），通过 `client:load` 等指令挂载。
- **Swup** 接管站内跳转，并替换 `#banner-overlay-container`、`#swup-container`、左右侧边栏、浮动目录等容器；新增全局交互时要考虑 Swup 生命周期，避免只在首次加载时初始化。
- 站点大部分页面在 `pnpm build` 时静态生成；评论、统计、音乐、Memos、动态模式媒体页是运行时请求。

### 9.2 组件目录职责

| 目录 | 职责 |
| --- | --- |
| `src/components/layout/` | 导航栏、页脚、侧边栏、文章卡片、分类栏、页面布局容器 |
| `src/components/controls/` | 返回顶部/主页/评论、浮动目录、归档面板、主题与布局切换、搜索 |
| `src/components/common/` | 通用 UI：按钮、标签、图标、封面、图片包装、分页、MDX 组件（Steps、Timeline、Badge、TabGroup） |
| `src/components/widget/` | 侧边栏小部件：资料、公告、分类、标签、日历、音乐、统计、站点信息、广告、目录 |
| `src/components/features/` | 全局功能：字体、KaTeX、Fancybox、音乐管理、加密内容、樱花、Live2D/Spine、打字机 |
| `src/components/pages/` | 页面专用组件：搜索、动态流、相册、媒体网格 |
| `src/components/comment/` | 评论系统适配组件 |
| `src/components/analytics/` | 统计脚本组件 |
| `src/components/misc/` | 许可证、相关推荐、分享海报 |

`src/components/README.md` 是上游的组件说明，部分条目可能滞后；**以实际文件与 import 为准**。

### 9.3 Markdown 插件链

`astro.config.mjs` 中注册的插件：

| 阶段 | 插件 | 作用 |
| --- | --- | --- |
| remark | `remarkAdmonitionToBlockquoteCallout` | Python-Markdown 风格 `!!!` / `???` 提醒框（需将 `enablePythonMarkdownAdmonitions` 设为 `true`） |
| remark | `remarkMath` | 数学公式 |
| remark | `remarkReadingTime` | 阅读时间 |
| remark | `remarkWikiLink` | `[[文章]]` 链接与卡片 |
| remark | `remarkImageGrid` | `[grid]` 图片网格 |
| remark | `remarkExcerpt` | 摘要 |
| remark | `remarkDirective` + `parseDirectiveNode` + `rehypeComponents` | `::github` 等指令 |
| remark | `remarkSectionize` | 标题分节 |
| remark | `remarkMermaid` / `remarkPlantuml` | 图表源码预处理 |
| rehype | `rehypeKatex` | KaTeX 渲染 |
| rehype | `rehypeCallouts` | 提醒框 |
| rehype | `rehypeSlug` / `rehypeAutolinkHeadings` | 标题锚点 |
| rehype | `rehypeCodeGroup` | Tab 代码组 |
| rehype | `rehypeMermaid` / `rehypePlantuml` / `rehypeDiagramPanZoom` | 图表 SVG 与缩放 |
| rehype | `rehypeFigure` / `rehypeImageReferrerPolicy` | 图片 figure 与防盗链 |
| rehype | `rehypeExternalLinks` / `rehypeEmailProtection` | 外链与邮箱保护 |

新增语法时，插件通常放在 `src/plugins`，并在 `astro.config.mjs` 的对应阶段注册；涉及配置的插件还要在 `src/config` 与 `src/types` 中补字段。

### 9.4 新增语言

1. 复制 `src/i18n/languages/en.ts` 为 `src/i18n/languages/<lang>.ts`，翻译全部 key。
2. 在 `src/i18n/translation.ts` 中 `import` 并加入 `map`（可同时加语言别名）。
3. 类型 `Translation` 基于 `I18nKey` 生成，缺 key 会被 TypeScript 发现。
4. 通过 `siteConfig` 顶部的 `SITE_LANG` 或 `PUBLIC_SITE_LANG` 选择语言。
5. 翻译缺失时的回退顺序：当前语言 → 中文 → 英文。

### 9.5 新增页面

1. 在 `src/pages/` 新建路由文件（文件名决定 URL，注意尾斜杠）。
2. 页面内使用 `MainGridLayout`。
3. 需要导航入口时，在 `src/config/navBarConfig.ts` 的 `LinkPresets` 与菜单树中添加项。
4. 需要页面开关时：
   - 在 `src/types/siteConfig.ts` 与 `src/config/siteConfig.ts` 的 `pages` 中加 key；
   - 在页面顶部做 `Astro.redirect("/404/")`；
   - 在 `astro.config.mjs` 的 sitemap `filter` 中过滤；
   - 导航项加 `pageKey`。
5. 需要文案时，在 `src/i18n/i18nKey.ts` 与各语言文件添加 key。

### 9.6 新增配置项

1. 在 `src/types` 新增或扩展类型。
2. 在 `src/config` 新增配置文件或字段。
3. 在 `src/types/config.ts` 聚合并导出类型，在 `src/config/index.ts` 导出值。
4. 业务代码从 `@/config` 导入。

### 9.7 样式与主题

- 全局入口：`src/styles/main.css`；主题变量：`src/styles/variables.styl`。
- 主要变量包括 `--primary`、`--page-width`、圆角、卡片背景等；主题色相由 `siteConfig.themeColor.hue` 注入。
- 使用 Tailwind CSS 4 的任意值语法（如 `text-(--primary)`、`max-w-(--page-width)`）时，注意变量必须已在 CSS 中定义。
- 组件私有样式优先写在组件内或用语义化 class；避免在全局样式里写宽泛选择器。
- 修改 `.styl` 或全局 CSS 后，确认明暗模式与移动端断点（768 / 1280 附近）表现。

### 9.8 性能与安全约束

| 事项 | 说明 |
| --- | --- |
| 壁纸/水波纹/樱花 | 都有运行时开销；移动端可通过配置关闭 |
| 显示设置面板 | 面板本身会增加客户端 JS；`wallpaperModeSwitchable` 约 +33 KB/页，生产环境建议关闭 |
| `src/assets` 图片 | 越多构建越慢；优先使用 `webp`/`avif` |
| OG 图 | 开启后构建显著变慢；本地调试建议关闭 |
| 字体 | Astro Font API 会在开发/构建时下载；本地字体子集在构建后生成 |
| 看板娘 | 模型约 15 MiB；关闭时构建后会被裁剪，但仓库里仍保留源文件 |
| 加密文章 | 前端解密，不是强安全措施；不要在文章中放真正的机密 |
| 相册密码 | 只加密列表展示，图片文件仍在 `public`，可被直接访问 |
| PlantUML | 图表源码会发送到配置的公共服务器；敏感内容请自建服务器 |
| Memos | 需要配置 CORS；`parent` 区分大小写 |
| 第三方脚本 | 评论、统计、音乐、Memos 都可能引入外部请求；注意隐私与合规 |

---

## 10. Agent 操作指南

### 10.1 开始任务前先读

按顺序读以下文件，可以快速建立上下文：

1. `AGENTS.md`：仓库约定（命令、风格、提交规范）。
2. 本文件的第 3、4、5、6 节。
3. `src/config/siteConfig.ts` 与 `src/config/index.ts`。
4. `src/content.config.ts`：内容字段的唯一来源。
5. `src/pages/[...page].astro`、`src/pages/posts/[...slug].astro`：首页与文章页的数据流。
6. `src/layouts/Layout.astro`、`src/layouts/MainGridLayout.astro`：全局布局与脚本加载位置。
7. `astro.config.mjs`：集成、插件、构建行为。

### 10.2 需求 → 修改位置

| 需求 | 主要修改位置 |
| --- | --- |
| 改站点标题/描述/域名/主题色/分页 | `src/config/siteConfig.ts` |
| 改导航菜单 | `src/config/navBarConfig.ts` |
| 改侧边栏小部件 | `src/config/sidebarConfig.ts` |
| 改首页横幅/壁纸/水波纹 | `src/config/backgroundWallpaper.ts` |
| 改作者资料/社交链接 | `src/config/profileConfig.ts` |
| 改公告/页脚/许可证/打赏 | `announcementConfig.ts`、`footerConfig.ts` + `FooterConfig.html`、`licenseConfig.ts`、`sponsorConfig.ts` |
| 改评论/统计 | `commentConfig.ts`、`analyticsConfig.ts` |
| 改文章列表样式 | `siteConfig.postListLayout` |
| 改文章字段 | `src/content.config.ts` + `src/types` + 使用处 |
| 改文章 URL | 优先设置 frontmatter `slug`；无 `slug` 时由文件路径决定（Astro glob loader）。`src/utils/url-utils.ts` 只负责拼接 |
| 新增/修改 Markdown 语法 | `src/plugins/*` + `astro.config.mjs` |
| 新增语言/文案 | `src/i18n/i18nKey.ts` + `src/i18n/languages/*` + `translation.ts` |
| 新增页面 | `src/pages/*` + 导航 + 页面开关 + i18n + sitemap |
| 改构建流程 | `scripts/*` + `package.json` |
| 改部署 | `vercel.json` / `wrangler.jsonc` / `.github/workflows/*` |
| 改组件 | `src/components/<职责目录>/` |
| 改全局样式 | `src/styles/*` |

### 10.3 修改后的验证

按改动类型选择，至少执行前两项：

```bash
pnpm check
pnpm type-check
pnpm lint
```

- 只改内容/frontmatter：`pnpm astro build` 或 `pnpm build`。
- 改页面/组件/样式：`pnpm dev` 人工检查，再 `pnpm astro build`。
- 改搜索、字体、Pagefind、OG、LQIP、看板娘裁剪：必须 `pnpm build`（完整流程）。
- 改部署配置：本地 `pnpm build` + `pnpm preview`，再在目标平台验证。

### 10.4 必须遵守的约定

1. **只使用 pnpm**，不要生成 `package-lock.json`、`yarn.lock`。
2. 代码风格遵循 Biome：**Tab 缩进、双引号**；组件 PascalCase，配置 `camelCase + Config.ts`，工具 `kebab-case.ts`。
3. 配置值与类型要同步：改 `src/config` 通常要同步 `src/types` 和 `src/types/config.ts`。
4. 内容 schema 只在 `src/content.config.ts` 中定义，不要在页面里复制字段校验。
5. 站内链接带尾斜杠；图片路径区分 `src/assets`（不带 `/`）与 `public`（带 `/`）。
6. `lqips.json`、`github-card-data.json` 由脚本生成，不要手改；`icons-data.json` 是图标数据，按需维护。
7. 不要提交 `dist/`、`.astro/`、`public/vndb-covers/`、`.env*`。
8. 不要把密钥、Token、统计 ID 写入公开配置。
9. 不要删除 `LICENSE` 中的版权声明。
10. 改动保持聚焦，不做无关格式化或重构。

### 10.5 常见坑

| 现象 | 原因/处理 |
| --- | --- |
| `pnpm dev` 搜索没有结果 | Pagefind 只在完整构建后生成；用 `pnpm build` + `pnpm preview` 验证 |
| 草稿在本地能看到，线上没有 | 生产构建会过滤 `draft: true`，这是预期行为 |
| 文章 URL 和文件名不一致 | frontmatter 的 `slug` 会覆盖文件路径成为 URL；检查文章头部是否设置了 `slug` |
| 页面显示 404，导航也没有入口 | 对应 `siteConfig.pages` 开关为 `false`，或环境变量覆盖为 `false` |
| 改了提醒框/代码高亮/字体不生效 | 这些配置在 Astro 启动时读取，需要重启开发服务器 |
| 新增图片没有占位渐变 | 运行 `pnpm lqips`，或完整 `pnpm build` |
| 线上图片路径 404 | 混淆了 `src/assets` 与 `public` 的引用规则 |
| RSS/Sitemap/OG 链接域名错误 | `siteConfig.site_url` 未设置为最终域名 |
| CI 通过但线上搜索失效 | CI 只跑 `astro build`，没有 Pagefind；需完整 build 后部署 |
| Cloudflare 部署找不到索引/字体 | 产物根目录是 `dist/client`；脚本已适配，但部署配置需一致 |
| 相册密码形同虚设 | 图片文件在 `public/gallery` 下可直接访问；密码只控制页面展示 |
| PlantUML 图表泄露内容 | 源码会发送到公共服务器；敏感图请自建服务 |
| `friends`/`guestbook`/`about` 构建失败 | `about.md` 始终必需；`friends`/`guestbook` 仅在对应页面启用时必需；文件在 `src/content/spec/` |
| 移动端布局异常 | 检查侧边栏 `position`、`tabletSidebar`、`mobileBottomComponents` 与断点样式 |
| 添加语言后部分文案仍是中文 | `translation.ts` 未注册或语言文件缺 key；回退顺序是当前语言 → 中文 → 英文 |

---

## 11. 启用清单

用这个模板搭建自己的博客时，按顺序完成：

### 11.1 站点身份

- [ ] `siteConfig.title`、`subtitle`、`site_url`、`description`、`keywords`
- [ ] `siteConfig.navbar.logo`、`title`
- [ ] `siteConfig.favicon`
- [ ] `siteConfig.siteStartDate`、`timezone`
- [ ] `profileConfig.avatar`、`name`、`bio`、`links`
- [ ] `backgroundWallpaper.common.homeText`（标题、副标题、链接）
- [ ] `footerConfig` 与 `FooterConfig.html`（备案号等）
- [ ] `licenseConfig`

### 11.2 内容

- [ ] 删除或替换 `src/content/posts` 下的演示文章
- [ ] 确认每篇文章的 `slug`（脚手架默认生成拼音 slug；不设置则回退到文件路径）
- [ ] 删除或替换 `src/content/dynamic` 下的演示动态
- [ ] 替换 `src/content/spec/about.md`、`friends.mdx`、`guestbook.md`
- [ ] 替换 `public/gallery/<albumId>/` 与 `galleryConfig.albums`
- [ ] 清理 `src/config/friendsConfig.ts`、`sponsorConfig.ts`、`booknavConfig.ts` 中的示例条目
- [ ] 替换音乐播放器示例歌曲/歌单
- [ ] 按需删除示例横幅/头像/Logo 并放入自己的图片

### 11.3 功能

- [ ] `siteConfig.pages` 打开/关闭需要的页面
- [ ] `commentConfig.type` 配置评论系统，并确认 `guestbook`/`friends`/`dynamic`/`sponsor` 的评论开关
- [ ] `analyticsConfig` 配置统计（不需要就留空）
- [ ] `musicPlayerConfig` 选择 `meting` 或 `local`
- [ ] `pioConfig` 决定是否启用 Live2D/Spine
- [ ] `galleryConfig`、`booknavConfig`、`friendsConfig`、`sponsorConfig` 替换示例数据
- [ ] `displaySettingsConfig.enable` 生产环境建议保持 `false`

### 11.4 构建与发布

- [ ] 设置 `site_url` 为最终域名
- [ ] 本地运行 `pnpm build`，确认没有内容/图片/字体缺失
- [ ] `pnpm preview` 检查搜索、RSS、Sitemap、OG、404、尾斜杠
- [ ] 在部署平台配置 `PUBLIC_*` 环境变量
- [ ] 配置域名、HTTPS、缓存与 404
- [ ] 保留 `LICENSE` 与版权声明

---

## 12. 许可与来源

- 本项目基于 fuwari（作者 saicaca）与 Firefly（作者 CuteLeaf）二次开发。
- 采用 **MIT License**，完整文本与版权声明见仓库根目录 `LICENSE`。
- 二次分发或修改时，请保留 `LICENSE` 中的版权声明；模板中的示例图片、字体、音乐、模型等素材如有单独授权，请按各自来源的许可使用。
