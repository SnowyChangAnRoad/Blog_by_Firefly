# 博客迁移方案：FastAPI 站点 → Firefly 静态模板

> **状态：方案已审核通过（v2），尚未开始动工。下一轮按第 14 节执行。**
>
> - 版本：v2
> - 编写日期：2026-11-04
> - 目标仓库：`c:\Users\xx\Desktop\git\Firefly`
> - 旧站仓库：`C:\Users\xx\Desktop\git\blog`（**只读**，迁移期间不修改、不删除）
> - 本文件用途：记录已确认的迁移决策与执行细节，防止上下文丢失；Agent 按本文件执行。

---

## 0. 已确认的决策

| # | 决策项 | 结论 |
| --- | --- | --- |
| 1 | 迁移形态 | **方案一：纯静态最小迁移**，只迁文章、相册、关于页 |
| 2 | 旧站动态功能 | **放弃** `/chat`、`/qa`、`/minigpt`，不迁移 |
| 3 | 旧 FastAPI 服务 | **暂不保留**，后续再讨论如何重新接入 |
| 4 | 部署平台 | 自有云服务器上的 **Nginx 静态站点** |
| 5 | 相册原图 | **不入 Git**，直接上传到服务器的 `public/gallery/<albumId>/` |
| 6 | 相册单图标题 | **接受丢失**（Firefly 相册不显示单图标题） |
| 7 | 相册排序 | 本次用文件名序号保序；**Phase 2** 再做“登录后拖动排序”（需要后端，见第 10 节） |
| 8 | 文章 slug | 采用本文附录 A 的英文 slug |
| 9 | 旧链接重定向 | **不做**，旧 `/post/*`、`/photo/*` 链接失效属于预期 |
| 10 | `DEPLOY.md` | **不发布** |
| 11 | 评论区 | **暂不开启**，`commentConfig.type` 保持 `none` |
| 12 | 站点身份 | **留空**。保留你已设置的 `title`/`name`/`avatar`，不新增个人信息 |
| 13 | 后续发文方式 | 本地写 md → 上传服务器 → 服务器构建（见第 9.4 节） |
| 14 | 迁移位置 | 当前 Firefly 工作区，新建分支 `migrate/blog` |
| 15 | 访问地址 | **暂无域名**，先使用 `http://<服务器公网IP>`；后续有域名再切换并重新构建（见第 9.6 节） |
| 16 | 换行处理 | **确认启用 `remark-breaks`**（新增依赖，行为对齐旧站 `nl2br`） |
| 17 | 相册排序 | **确认先按文件名序号保序**；拖动排序作为 Phase 2 单独实现 |
| 18 | 代码来源 | 当前是上游 `CuteLeaf/Firefly` 的 clone，**不能直接 push**；先 Fork/新建仓库并同步上游最新（见第 4.0 节） |

> **重要发现（执行前必须处理）**：当前本地 `master` 停留在 `e6d2e535`（6.16.5），而上游 `origin/master` 已到 `af8e98fd`（6.16.9），**本地落后 64 个提交**。上游包含本项目说明书与迁移方案未覆盖的新能力（项目展示页、Atom、沉浸阅读、导航栏模式、`siteConfig.feed` 等）。因此执行顺序调整为：**先 Fork + 同步上游 → 重新核对 README/本方案 → 再迁移内容**。

---

## 1. 目标与范围

### 1.1 目标

- 把旧站 4 篇博客文章、2 个非空相册迁移到 Firefly。
- 删除 Firefly 仓库内的演示文章、演示动态、演示相册、上游宣传性链接。
- 形成一个可长期维护的“本地写文章 → 上传服务器 → 构建发布”流程。
- 迁移后站点完全静态：运行时不需要 Python、数据库或 Node 服务。

### 1.2 非目标（本次不做）

- 不迁移 FastAPI、Jinja2 模板、SQLite 数据、SSE 对话、匿名问答、mini-GPT。
- 不实现评论、统计、相册拖动排序、旧链接重定向。
- 不填写站点身份、备案号、社交链接、许可证等个人信息。
- 不修改旧仓库 `C:\Users\xx\Desktop\git\blog`。

### 1.3 迁移完成标准

- 4 篇文章在 `/posts/<slug>/` 正常显示，排版与旧站基本一致。
- `/gallery/net/`、`/gallery/scenery/` 图片完整、顺序正确、封面正确。
- 模板演示内容全部清除，导航只保留实际使用的入口。
- `pnpm check`、`pnpm type-check`、`pnpm build` 通过。
- 服务器 Nginx 能访问站点、404、RSS、Sitemap、搜索（Pagefind 索引存在）。
- 按第 9.4 节流程新增一篇文章可以成功上线。

---

## 2. 旧站资产清单

| 资产 | 数量/内容 | 处理 |
| --- | --- | --- |
| `posts/hello.md` | 1 篇 | 迁移为 `hello-world` |
| `posts/0.开发日志.md` | 1 篇 | 迁移为 `dev-log` |
| `posts/1.叮咚鸡大狗叫.md` | 1 篇 | 迁移为 `pandemic-memories` |
| `posts/人在面对巨大的幸福会突然变得胆怯.md` | 1 篇 | 迁移为 `courage-and-happiness` |
| `posts/DEPLOY.md` | 1 篇部署指南 | **不迁移** |
| `photos/human/` | 只有 `human.json`，0 张图 | **跳过**（Firefly 无图相册不显示） |
| `photos/net/` | 3 张图 | 迁移为 `net` 相册 |
| `photos/scenery/` | 8 张图 | 迁移为 `scenery` 相册 |
| `static/img/avatar.png` | 旧头像 | 不迁移（你已使用新的 `src/assets/images/avatar.jpg`） |
| `static/css`、`static/js` | 旧站样式与脚本 | 不迁移 |
| `data/chat.db` | 11 个会话 / 76 条消息 / 0 条问答 | 不迁移；如需保留请自行备份到服务器以外 |
| `.env` | DeepSeek Key、后台密码 | **绝不复制到新仓库** |
| `venv/`、`models/`、`__pycache__/` | 运行时/模型 | 不迁移 |

---

## 3. 目标架构

### 3.1 站点形态

```text
本地 Windows（编辑 Markdown）
        │  rsync / scp 上传 md、配置、相册图
        ▼
云服务器 /var/www/firefly（Git 仓库 + node_modules + public/gallery 原图）
        │  pnpm build（Node 仅构建时使用）
        ▼
dist/  ──  Nginx 静态托管（运行时无 Node/Python）
```

### 3.2 服务器目录约定

```text
/var/www/firefly/                 # 仓库根目录
├─ src/content/posts/             # 文章（从本地上传/同步）
├─ public/gallery/net/            # 相册原图（只在服务器存在，不入 Git）
├─ public/gallery/scenery/
├─ src/constants/lqips.json       # 构建生成；不包含相册图（见 6.4）
├─ dist/                          # 构建产物，Nginx root 指向这里
├─ node_modules/
└─ package.json / astro.config.mjs / ...
```

补充：

- `public/gallery` 在服务器上是**唯一原图存放处**，请定期备份（与 Git 无关）。
- 不建议在服务器上执行 `git clean -fdx`，否则会删除未入库的相册原图。
- 如果后续换服务器，必须同时迁移 `public/gallery`。

---

## 4. 迁移前准备

### 4.0 仓库归属：先 Fork，再同步上游最新

**现状**：

```text
origin  git@github.com:CuteLeaf/Firefly.git   # 上游，无推送权限
master  e6d2e535（6.16.5），落后上游 64 个提交
```

**推荐做法：Fork 上游，保留 upstream 关系，便于以后同步模板更新。**

#### 步骤 1：在 GitHub 网页创建 Fork

1. 打开 <https://github.com/CuteLeaf/Firefly>。
2. 点右上角 **Fork** → Owner 选择你自己的账号 → **Create fork**。
3. 得到 `git@github.com:<你的GitHub用户名>/Firefly.git`。

> 当前机器没有安装 GitHub CLI（`gh`），使用网页操作即可。
> Fork 的可见性与上游一致（公开）。如果你希望博客源码私有，改用下面的“新建空仓库”方案。

#### 步骤 2：改远程地址

```bash
# 把原来的上游改名为 upstream
git remote rename origin upstream

# 添加你自己的 Fork 作为 origin
git remote add origin git@github.com:<你的GitHub用户名>/Firefly.git

# 确认
git remote -v
```

期望结果：

```text
origin    git@github.com:<你的GitHub用户名>/Firefly.git (fetch/push)
upstream  git@github.com:CuteLeaf/Firefly.git          (fetch/push)
```

验证 SSH：

```bash
ssh -T git@github.com
```

#### 步骤 3：先提交当前本地改动

当前工作区有你的配置、头像、壁纸、README 重写和本方案，先落到一个提交，避免同步上游时丢失：

```bash
git add -A
git commit -m "chore: 本地站点配置、素材与迁移方案"
```

#### 步骤 4：同步上游最新代码

```bash
git fetch upstream
git rebase upstream/master
```

冲突处理原则：

- `README.md`、`MIGRATION_PLAN.md`：保留本地版本（上游的 README 是旧宣传文档）。
- `src/config/*.ts`：保留你的个性化字段，同时合并上游新增字段（如 `projects`、`navbarMode`、`feed` 等）。
- 演示图片/壁纸：以上游最新结构为准，你的 `avatar.jpg`、`p1.png` 保留。
- 依赖变化后执行：

  ```bash
  pnpm install
  ```

如果 rebase 冲突过多，可中止并改用“全新 clone”方案：

```bash
git rebase --abort

# 另开目录克隆你的 Fork（Fork 刚创建，内容就是上游最新）
git clone git@github.com:<你的GitHub用户名>/Firefly.git firefly-latest
# 然后把旧目录里的个性化配置值、avatar.jpg、p1.png、README.md、MIGRATION_PLAN.md 复制过去
```

#### 步骤 5：推送到你的 Fork

```bash
git push -u origin master
```

#### 步骤 6：新建迁移分支

```bash
git switch -c migrate/blog
git push -u origin migrate/blog
```

后续所有迁移改动都在 `migrate/blog` 上完成。

#### 备选：新建空仓库（适合私有源码）

1. 在 GitHub 新建一个**空仓库**（不要勾选 README、.gitignore、License）。
2. 执行：

   ```bash
   git remote rename origin upstream
   git remote add origin git@github.com:<你的GitHub用户名>/<仓库名>.git
   git fetch upstream
   git rebase upstream/master
   git push -u origin master
   ```

3. 这种方式没有 GitHub 的 Fork 关系，后续同步上游需手动：

   ```bash
   git fetch upstream
   git merge upstream/master
   ```

| 方式 | 优点 | 缺点 |
| --- | --- | --- |
| Fork（推荐） | 保留上游关系，网页可 Sync fork | 仓库公开，与上游同可见性 |
| 新建空仓库 | 可设为私有 | 无 Fork 关系，需手动同步上游 |

### 4.1 本地准备

1. 备份当前工作区改动：

   ```bash
   git status
   git diff > pre-migration-backup.patch
   ```

2. 确认 Node/pnpm 版本：

   ```bash
   node -v     # >= 22.23.0
   pnpm -v     # 11.x
   ```

3. 旧仓库保持原样，不复制 `.env`、`data/`、`venv/`、`models/`。

4. 同步上游后，先重新核对 `README.md` 与本方案：上游 6.16.9 新增了项目展示页、Atom、沉浸阅读、导航栏模式、`siteConfig.feed` 等，若有字段/路径变化，先更新文档再迁移。

---

## 5. 文章迁移

### 5.1 映射表

| 旧文件 | 标题 | 旧日期 | 新 slug | 新 URL |
| --- | --- | --- | --- | --- |
| `posts/hello.md` | 你好，世界 | 2026-08-22 | `hello-world` | `/posts/hello-world/` |
| `posts/0.开发日志.md` | 开发日志 | 2026-08-21 | `dev-log` | `/posts/dev-log/` |
| `posts/1.叮咚鸡大狗叫.md` | 叮咚鸡大狗叫——疫情回忆 | 2026-08-22 | `pandemic-memories` | `/posts/pandemic-memories/` |
| `posts/人在面对巨大的幸福会突然变得胆怯.md` | 人在面对巨大的幸福会突然变得胆怯 | 2026-10-09 | `courage-and-happiness` | `/posts/courage-and-happiness/` |
| `posts/DEPLOY.md` | 部署指南 | 2026-08-22 | — | **不迁移** |

目标文件：

```text
src/content/posts/hello-world.md
src/content/posts/dev-log.md
src/content/posts/pandemic-memories.md
src/content/posts/courage-and-happiness.md
```

### 5.2 frontmatter 转换

旧格式：

```yaml
---
title: 你好，世界
date: 2026-08-22
summary: 这是本博客的第一篇示例文章，演示 Markdown 各类元素。
---
```

新格式：

```yaml
---
title: 你好，世界
published: 2026-08-22
description: 这是本博客的第一篇示例文章，演示 Markdown 各类元素。
slug: hello-world
draft: false
---
```

字段映射：

| 旧字段 | 新字段 | 说明 |
| --- | --- | --- |
| `title` | `title` | 必填 |
| `date` | `published` | 必填，建议 `YYYY-MM-DD` |
| `summary` | `description` | 用于列表、SEO、RSS |
| — | `slug` | 必填，使用 5.1 表中的值 |
| — | `draft` | 统一写 `false` |

可选补充（本次不强制）：`tags`、`category`、`series`、`updated`、`image`。旧站没有这些字段，留空即可。

### 5.3 正文处理

1. **删除与 frontmatter 重复的正文 H1**
   - `hello-world.md`、`dev-log.md`、`pandemic-memories.md` 正文开头都有 `# 标题`，需删除。
   - `courage-and-happiness.md` 没有 H1，保持原样。

2. **补表格前的空行**
   - `dev-log.md` 中多处表格紧贴上一段文字（如「使用Trae搭建…」后直接跟表格行），GFM 不识别，需要在这些表格前补一个空行。
   - `hello-world.md` 的表格已有空行，无需处理。

3. **换行语义（已确认：启用 `remark-breaks`）**
   - 旧站启用了 Python-Markdown 的 `nl2br`，单换行会变成 `<br>`。
   - Firefly 默认不会这样处理，正文里连续多行会合并成一段。
   - 执行时：

     ```bash
     pnpm add remark-breaks
     ```

     然后在 `astro.config.mjs` 的 remark 插件链中加入 `remarkBreaks`，与旧站阅读体验一致，并统一影响以后所有文章。
   - 注意：同步上游后 `astro.config.mjs` 的插件组织方式可能变化，需按最新文件的实际结构插入。

4. **代码块**
   - 旧站 Pygments `codehilite` → Firefly Expressive Code，语法不需要改，保留围栏语言标记（如 ` ```python `）。

5. **正文内容不改写**
   - `hello-world.md` 正文仍会提到 FastAPI、`/chat`，这属于旧内容，不在迁移中自动改写；是否更新由你决定。

6. **`[TOC]`**
   - 旧文章中没有实际使用 `[TOC]`；Firefly 自带浮动目录，无需转换。

### 5.4 删除模板演示文章

删除以下文件与目录：

```text
src/content/posts/code-examples.md
src/content/posts/draft.md
src/content/posts/encrypted-demo.md
src/content/posts/firefly.md
src/content/posts/katex-math-example.md
src/content/posts/markdown-extended.md
src/content/posts/markdown-mermaid.md
src/content/posts/markdown-plantuml.md
src/content/posts/markdown-tutorial.md
src/content/posts/mdx-example.mdx
src/content/posts/video.md
src/content/posts/guide/          # 整个目录，含示例图片
src/content/posts/images/         # 整个目录，含示例图片
```

删除后运行：

```bash
pnpm lqips
```

让 `src/constants/lqips.json` 清掉已删除演示图片的记录；不要手改该文件。

### 5.5 文章验收

- 4 个新文件 frontmatter 能通过 `pnpm check`。
- 正文无重复 H1。
- 表格、代码块、引用在 `pnpm dev` 中渲染正常。
- 每篇文章 URL 与 5.1 表一致，且带尾斜杠。

---

## 6. 相册迁移

### 6.1 第 4 问结论：图片不入库、直接传服务器，可行

可行，但必须满足以下条件：

1. **在服务器上构建**。Firefly 的相册列表由 `src/utils/gallery-utils.ts` 的 `scanAlbumPhotos()` 在**构建期**扫描 `public/gallery/<albumId>/` 生成；图片必须在构建时存在于该目录。
2. 构建时 `public/` 会原样复制到 `dist/`，所以图片最终会出现在 `dist/gallery/...`，Nginx 能直接访问。
3. 只在部署后往 `dist/gallery` 传图、不重新构建，**新图不会出现在相册页**（页面列表是构建期生成的）。
4. 任何其他构建机器（本地、CI、新服务器）如果没有这些图片，构建出的相册页会是空的或图片 404。因此约定：**相册以服务器副本为准，构建只在服务器做**。
5. 本地开发想看相册，需要把服务器 `public/gallery` 同步一份到本地（仍被 Git 忽略）。
6. 不建议在服务器执行 `git clean -fdx`，会删除未入库原图；换服务器时要单独迁移该目录。

### 6.2 目录与命名

目标目录：

```text
public/gallery/net/
public/gallery/scenery/
```

旧图重命名规则：用两位数字前缀固定顺序（Firefly 按文件名字典序扫描）。

| 旧图 | 旧标题/权重 | 新文件名 |
| --- | --- | --- |
| `net/moon.jpg` | 月亮 / 75 | `01-moon.jpg` |
| `net/sovgirl1.png` | 落日余晖 / 75 | `02-sovgirl1.png` |
| `net/sovgirl2.png` | 落日 / 74 | `03-sovgirl2.png` |
| `scenery/build_1.jpg` | 古寺-1 / 80 | `01-build_1.jpg` |
| `scenery/build_2.jpg` | 古寺-2 / 80 | `02-build_2.jpg` |
| `scenery/build_3.jpg` | 古寺-3 / 80 | `03-build_3.jpg` |
| `scenery/build_4.jpg` | 古寺-4 / 80 | `04-build_4.jpg` |
| `scenery/flowers_1.jpg` | 花-1 / 60 | `05-flowers_1.jpg` |
| `scenery/flowers_2.jpg` | 花-2 / 60 | `06-flowers_2.jpg` |
| `scenery/school_lake_1.jpg` | 启翔湖-1 / 50 | `07-school_lake_1.jpg` |
| `scenery/gools_1.jpg` | 无 json / 0 | `08-gools_1.jpg` |

说明：

- 旧站按 `weight` 降序、同权重按文件名升序；上表已按该规则排好。
- `gools_1.jpg` 原本权重 0，应排在 `school_lake_1`（50）之后，所以新文件名放在最后。
- 旧 `.json` 元信息（标题、权重）不再复制，信息只保留相册级的名称与描述。
- 单图标题（月亮、落日余晖、古寺-1 等）按约定丢弃，Firefly 不显示。

### 6.3 `galleryConfig` 替换

删除演示相册 `firefly-2026`、`encrypted-test`，改为：

| 字段 | `net` | `scenery` |
| --- | --- | --- |
| `id` | `net` | `scenery` |
| `name` | 好看的网图 | 风景 |
| `description` | 从互联网上收集的好看的网图 | 收集的一些自然风光照片，含山川、湖泊、城市夜景。 |
| `cover` | `/gallery/net/01-moon.jpg` | `/gallery/scenery/01-build_1.jpg` |
| `date` | 留空 | 留空 |
| `location` | 留空 | 留空 |
| `tags` | 留空 | 留空 |

`galleryConfig.columnWidth` 保持默认 `240`，或按你的观感调整。

### 6.4 `.gitignore` 与 LQIP

1. `.gitignore` 增加：

   ```gitignore
   # 相册原图：只存在服务器，不入库
   public/gallery/**
   !public/gallery/.gitkeep
   ```

   删除演示相册时用 `git rm -r --cached public/gallery/firefly-2026 public/gallery/encrypted-test`，避免历史继续跟踪。

2. `scripts/generate-lqips.ts` 的 `IGNORE_DIRS` 增加 `public/gallery/**`。

   原因：相册原图只在服务器存在，如果 LQIP 扫描它们，每次服务器构建都会改写 `src/constants/lqips.json`，导致服务器 Git 工作区变脏、影响后续 `git pull`；同时 44 MB 图片会明显拖慢构建。
   代价：相册图片没有构建期渐变占位（`PhotoCard` 会退化为无占位），不影响功能。

### 6.5 图片上传与可选压缩

- 原图共约 44 MB，直接由 Nginx 提供；建议上传前压成 `webp`（质量约 80），可显著降低流量与首屏时间。
- 压缩是可选项，本次不强制；若压缩，需要同步更新文件名与 `galleryConfig.cover`。
- 上传示例（在本地执行）：

  ```bash
  rsync -av photos/net/  user@server:/var/www/firefly/public/gallery/net/
  rsync -av photos/scenery/ user@server:/var/www/firefly/public/gallery/scenery/
  ```

  上传后删除服务器上的旧 `.json` 文件（Firefly 不读取它们）。

### 6.6 相册验收

- `/gallery/` 显示 2 个相册，封面正确。
- `/gallery/net/` 顺序为 moon → sovgirl1 → sovgirl2。
- `/gallery/scenery/` 顺序为 build_1..4 → flowers_1..2 → school_lake_1 → gools_1。
- 所有图片 200，无 404。
- 灯箱可打开、移动端瀑布流正常。

---

## 7. 站点身份与配置

### 7.1 保持不变

保留你已修改的内容，不覆盖：

- `siteConfig.title` = `SnowyChangAnRoad`
- `siteConfig.subtitle` = `blog`
- `siteConfig.description`
- `profileConfig.name` / `avatar`
- `backgroundWallpaper` 的桌面壁纸
- `announcementConfig` 的公告

### 7.2 留空/中性化

| 位置 | 处理 |
| --- | --- |
| `siteConfig.site_url` | 保持当前占位，**部署前必须改成真实域名**，否则 RSS/Sitemap/OG 链接错误 |
| `siteConfig.keywords` | 可保留通用词，或清空 |
| `siteConfig.favicon` | 保留模板图标，后续替换 |
| `siteConfig.navbar.logo/title` | 保留现状 |
| `profileConfig.bio` | 保持占位文本，不写个人信息 |
| `profileConfig.links` | 删除模板自带的 QQ/GitHub/邮箱链接；只保留 RSS，或全部留空 |
| `footerConfig` / `FooterConfig.html` | 不写备案号，保持中性 |
| `licenseConfig` | 保持默认或留空 |
| `src/content/spec/about.md` | 替换演示内容为占位文案（如「关于页内容待补充」），不写个人信息 |
| `src/content/spec/friends.mdx` / `guestbook.md` | 页面关闭，文件可保留或替换为空模板 |
| `commentConfig` | 保持 `type: "none"` |
| `analyticsConfig` | 不配置 |

### 7.3 页面开关

在 `siteConfig.pages` 中设置：

| 页面 | 值 | 原因 |
| --- | --- | --- |
| `gallery` | `true` | 相册要使用 |
| `friends` | `false` | 无友链 |
| `guestbook` | `false` | 评论未启用 |
| `dynamic` | `false` | 动态功能放弃 |
| `booknav` | `false` | 演示功能 |
| `bilibili` | `false` | 已是 false |
| `bangumi` | `false` | 已是 false |
| `vndb` | `false` | 已是 false |
| `mal` | `false` | 已是 false |
| `sponsor` | `false` | 无打赏 |

导航只保留：主页、文章（归档/分类/标签/系列）、相册、关于、RSS。

### 7.4 清理模板宣传内容

- 删除 `src/config/navBarConfig.ts` 中「链接」分组的 GitHub / Gitee / QQ 群 / Firefly 文档。
- 删除 `profileConfig.links` 中的上游示例链接。
- 删除 `src/content/dynamic/` 下 4 条演示动态（页面已关闭）。
- 删除 `friendsConfig.ts`、`sponsorConfig.ts`、`booknavConfig.ts` 中的演示条目（页面已关闭，避免误启用后出现示例数据）。
- 检查 `musicConfig.ts`、`pioConfig.ts`，如不使用则关闭，避免加载示例资源。

---

## 8. 路由与重定向

本次**不配置重定向**。旧地址失效属于已确认的预期：

| 旧地址 | 新地址 | 处理 |
| --- | --- | --- |
| `/post/hello` | `/posts/hello-world/` | 无重定向 |
| `/post/0.开发日志` | `/posts/dev-log/` | 无重定向 |
| `/post/1.叮咚鸡大狗叫` | `/posts/pandemic-memories/` | 无重定向 |
| `/post/人在面对巨大的幸福会突然变得胆怯` | `/posts/courage-and-happiness/` | 无重定向 |
| `/photo` | `/gallery/` | 无重定向 |
| `/photo/net` | `/gallery/net/` | 无重定向 |
| `/photo/scenery` | `/gallery/scenery/` | 无重定向 |
| `/chat`、`/qa`、`/minigpt` | — | 不再提供 |

---

## 9. 部署（自有服务器 + Nginx）

### 9.1 服务器前置

| 依赖 | 用途 |
| --- | --- |
| Node.js >= 22.23.0 | 构建 Astro |
| pnpm 11.x（corepack） | 安装依赖、构建 |
| Git、rsync | 拉代码、同步文章/图片 |
| Nginx | 静态托管 `dist/` |

首次安装：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

> 服务器只在构建时使用 Node；站点运行时不依赖 Node/Python。

### 9.2 首次部署

```bash
# 1. 拉取代码（首次可使用你的 Fork 地址）
sudo mkdir -p /var/www/firefly
sudo chown $USER:$USER /var/www/firefly
git clone <你的仓库地址> /var/www/firefly
cd /var/www/firefly
git switch migrate/blog   # 迁移完成并合并后再切回 master

# 2. 安装依赖
pnpm install --frozen-lockfile

# 3. 上传相册原图（在本地执行，或服务器上直接放）
#    public/gallery/net/、public/gallery/scenery/

# 4. 设置访问地址后再构建
#    暂无域名：src/config/siteConfig.ts 的 site_url 填 http://<公网IP>
pnpm build

# 5. 确认 dist/ 生成
ls dist/index.html dist/posts dist/gallery dist/pagefind
```

### 9.3 Nginx 配置要点

```nginx
server {
    listen 80;
    # 没有域名时用 _ 或直接写公网 IP
    server_name _;

    root /var/www/firefly/dist;
    index index.html;

    # 带哈希的构建资源，长缓存
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 相册原图，按需缓存
    location /gallery/ {
        expires 30d;
        add_header Cache-Control "public";
    }

    # HTML 不做长缓存，保证新文章能及时看到
    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html {
        internal;
    }
}
```

说明：

- 本站使用 `trailingSlash: "always"`，Astro 产物是 `dist/posts/<slug>/index.html`；站内链接都带尾斜杠。
- 旧链接没有尾斜杠，也不做重定向，访问会 404，符合本次决策。
- 如需要强制补尾斜杠，可在 `location /` 前加 `if (-d $request_filename) { return 301 $uri/; }`，但非必需。
- 当前没有域名，**先不启用 HTTPS**；有域名后再用 certbot 申请证书并跳转 443（见 9.6）。

### 9.4 后续内容更新流程（核心）

Firefly 是静态站点，**上传 md 后必须重新构建**才会生效，不能像旧 FastAPI 那样“放进去就能看”。

标准流程：

1. 本地新建/修改文章：

   ```text
   src/content/posts/<slug>.md
   ```

   frontmatter 必须包含 `title`、`published`、`slug`，建议写 `description`。

2. 本地预览（可选）：

   ```bash
   pnpm dev
   ```

   注意：本地若没有 `public/gallery` 图片，相册会是空的，这是预期。

3. 上传文章到服务器：

   ```bash
   rsync -av src/content/posts/ user@server:/var/www/firefly/src/content/posts/
   ```

4. 在服务器构建：

   ```bash
   ssh user@server
   cd /var/www/firefly
   pnpm build
   ```

5. Nginx 直接读取 `dist/`，不需要重启服务。

补充规则：

- 新增相册图片：先上传到 `public/gallery/<albumId>/`，再执行 `pnpm build`。
- 修改配置（`src/config/*`）：上传对应文件后再构建。
- 修改 `package.json` / 依赖：服务器上先 `pnpm install`，再 `pnpm build`。
- 后续可在本地加一个一键脚本（例如 `scripts/deploy-remote.sh`）：

  ```bash
  rsync -av src/content/posts/ user@server:/var/www/firefly/src/content/posts/
  ssh user@server "cd /var/www/firefly && pnpm build"
  ```

  本次迁移不强制创建，审核通过后可加。

- 备选（服务器性能不足时）：把 `public/gallery` 同步回本地，在本地 `pnpm build`，再把 `dist/` 整个 rsync 到服务器；但必须保证本地构建时图片齐全。

### 9.5 代码更新与 Git 工作区

- 服务器仓库用于构建，也可用 `git pull` 更新模板代码。
- 构建会改写 `src/constants/lqips.json`、`src/constants/github-card-data.json` 等生成文件。拉代码前如遇冲突：

  ```bash
  git checkout -- src/constants/lqips.json src/constants/github-card-data.json
  git pull
  pnpm install   # 依赖有变化时
  pnpm build
  ```

- 相册原图在 `public/gallery` 且已被 Git 忽略，`git pull` 不会删除；**禁止 `git clean -fdx`**。
- 如果后续频繁用 `git pull`，建议把服务器上的生成文件设为 `skip-worktree`，或干脆用 rsync 部署代码而不是 Git。

### 9.6 只有公网 IP、没有域名，是否可行

**可行**。先用 `http://<公网IP>` 上线，后续有域名再平滑切换。

配置要点：

1. `src/config/siteConfig.ts`：

   ```ts
   site_url: "http://<服务器公网IP>",
   ```

   - 必须带 `http://`，不能只写 IP。
   - 如果 Nginx 监听非 80 端口，写成 `http://<IP>:<端口>`。
   - 这个值影响 RSS、Sitemap、OG、canonical 等绝对链接，**改完必须重新构建**。

2. Nginx：

   ```nginx
   server {
       listen 80;
       server_name _;          # 或直接写公网 IP
       ...
   }
   ```

3. 云服务器安全组/防火墙放行 80 端口；确认 `curl http://<IP>/` 能拿到首页。

限制与注意：

- **无法申请公网 CA 证书**（Let's Encrypt 等不为纯 IP 签发），所以只能先用 HTTP；自签名证书会让浏览器报错，不建议。
- 搜索引擎对 IP 访问收录较差，RSS/OG 抓取也可能不理想；这是过渡方案。
- 部分第三方服务（评论区、统计、OAuth）要求 HTTPS 或域名，所以本次评论保持关闭。
- 如果服务器在中国大陆，使用 80/443 对外提供网站可能涉及备案要求，请以云厂商实际限制为准。

后续有域名时的切换步骤：

1. 域名解析 A 记录 → 服务器公网 IP。
2. `siteConfig.site_url` 改为 `https://<域名>`。
3. Nginx `server_name <域名>;`。
4. `certbot --nginx -d <域名>` 申请证书并启用 HTTPS。
5. 重新执行 `pnpm build`（绝对链接会写入构建产物）。
6. 把 80 端口 301 到 443。

---

## 10. 相册拖动排序（Phase 2，不在本次迁移）

### 10.1 为什么本次不做

纯静态站点没有登录态、没有可写接口，浏览器里的拖动结果无法持久化，也无法验证身份。要“登录后拖动排序”，必须增加一个小的后端/管理服务，属于新功能，不应混在内容迁移里。

### 10.2 推荐的数据设计（为后续预留）

每个相册目录增加：

```text
public/gallery/<albumId>/order.json
```

内容示例：

```json
{
  "order": [
    "03-sovgirl2.png",
    "01-moon.jpg",
    "02-sovgirl1.png"
  ]
}
```

改造 `scanAlbumPhotos()`：

1. 先按文件名扫描；
2. 若存在 `order.json`，按其中顺序排列；
3. `order.json` 中不存在的文件追加到末尾（按文件名）；
4. 文件不存在时回退到当前字典序，保持向后兼容。

本次迁移暂不实现该读取逻辑，先用文件名序号保序。

### 10.3 后续两种实现路径

| 路径 | 说明 | 成本 |
| --- | --- | --- |
| A. 手动 `order.json` | 改 JSON 后重新构建；无登录、无拖动 | 低 |
| B. 管理服务 | 独立小后端（Node/Python）：密码登录 → 拖动页面 → 保存 `order.json` → 触发 `pnpm build` | 中 |

路径 B 的安全要求：

- 独立子域或受保护的路径，HTTPS；
- 密码哈希存环境变量，不写仓库；
- 触发构建的接口必须鉴权，避免被滥用；
- 构建任务串行执行，防止并发写坏 `dist`。

Phase 2 单独评审，不在本方案内实施。

---

## 11. 验证清单

### 11.1 本地

```bash
pnpm check
pnpm type-check
pnpm build
pnpm preview
```

逐项检查：

- [ ] `/` 首页文章列表正常，无演示文章。
- [ ] `/posts/hello-world/`、`/posts/dev-log/`、`/posts/pandemic-memories/`、`/posts/courage-and-happiness/` 可访问。
- [ ] 文章排版：表格、代码块、引用、换行符合预期。
- [ ] `/archive/`、`/categories/`、`/tags/`、`/series/` 正常。
- [ ] `/gallery/` 仅显示 `net`、`scenery`。
- [ ] `/gallery/net/`、`/gallery/scenery/` 图片顺序与封面正确。
- [ ] `/about/` 为占位内容，无演示文案。
- [ ] 被关闭页面（friends/guestbook/dynamic/booknav/sponsor）返回 404，导航不显示。
- [ ] `/rss.xml`、`/sitemap-index.xml`、`/robots.txt` 可访问。
- [ ] `/search/` 能搜索到 4 篇文章（需完整 `pnpm build`）。
- [ ] 移动端布局、灯箱、目录正常。

### 11.2 服务器

- [ ] Nginx 首页、文章页、相册页 200。
- [ ] `/gallery/net/*.jpg|png` 等图片 200。
- [ ] 不存在的路径返回自定义 `404.html`。
- [ ] `/_astro/*` 带长缓存响应头。
- [ ] `http://<公网IP>/` 可访问；IP 阶段不启用 HTTPS（有域名后再加）。
- [ ] 按 9.4 节新增一篇文章并构建，线上能看到。

---

## 12. 风险与待确认

### 12.1 已确认（v2）

1. **换行处理**：全局启用 `remark-breaks`。
2. **相册排序**：本次用文件名序号保序，拖动排序放 Phase 2。
3. **访问地址**：暂无域名，使用 `http://<公网IP>`；部署前把 `site_url` 改为该地址，有域名后再切换。
4. **代码来源**：先 Fork（或新建空仓库），同步上游最新后再迁移；当前本地落后 64 个提交。

### 12.2 风险表

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 本地落后上游 64 个提交 | 迁移方案/README 针对旧版，可能与最新字段不一致 | **先 Fork + 同步上游 6.16.9，再核对文档** |
| `site_url` 仍为上游占位域名 | RSS/Sitemap/OG/canonical 链接错误 | 首次构建前改为 `http://<公网IP>` |
| 纯 IP 访问 | 无 HTTPS；搜索引擎收录差；第三方服务可能不可用 | 过渡方案；有域名后按 9.6 切换并重新构建 |
| 相册原图只在服务器 | 本地/新机器构建相册为空，图片 404 | 只允许服务器构建；换机迁移 `public/gallery`；定期备份 |
| 44 MB 原图 | 流量大、首屏慢 | 建议压缩为 webp；Nginx 30 天缓存 |
| 服务器性能不足 | `pnpm build` 慢或 OOM | 增加 swap；或本地构建后 rsync `dist` |
| 构建改写生成文件 | 服务器 Git 变脏，影响 `git pull` | 拉代码前 checkout 生成文件；或改用 rsync 部署代码 |
| `git clean -fdx` | 删除未入库相册原图 | 禁止执行；单独备份 |
| 旧链接失效 | 外部引用 404 | 已确认不做重定向 |
| 旧动态功能不可用 | `/chat`、`/qa`、`/minigpt` 下线 | 已确认放弃，旧服务暂不保留 |
| 换行语义差异 | 旧文章段落合并 | 已确认启用 `remark-breaks` |
| 无拖动排序 | 只能靠文件名改顺序 | 已确认 Phase 2 单独实现 |

---

## 13. 回滚方案

1. 迁移在 `migrate/blog` 分支进行，`master` 不动。
2. 新站验证通过前，旧站服务器保持运行；DNS 切换后再决定是否关闭。
3. 若新站异常：
   - 本地：`git switch master`；
   - 服务器：Nginx root 指回旧站目录，或恢复上一份 `dist` 备份；
   - 相册原图不受影响（独立目录，不在 Git）。
4. 上线前备份：
   - 服务器 `public/gallery/`
   - 服务器 `dist/`（上一版）
   - 服务器 Nginx 配置

---

## 14. Agent 执行顺序（审核通过后）

0. **Fork 上游并同步最新代码**（按第 4.0 节），然后重新核对 `README.md` 与本方案；发现上游字段/路径变化时先更新文档。
1. 阅读本文件与 `README.md`，确认决策未变。
2. 新建分支 `migrate/blog`。
3. 删除演示文章及 `guide/`、`images/`；运行 `pnpm lqips`。
4. 新建 4 篇文章（内容取自旧仓库，frontmatter 按第 5 节）。
5. 删除演示相册；更新 `.gitignore`、`scripts/generate-lqips.ts`、`galleryConfig.ts`。
6. 清理演示动态、演示友链/打赏/书签配置、导航上游链接、profile 示例链接。
7. 设置页面开关、评论保持 `none`、替换 `about.md` 为占位内容。
8. 加入 `remark-breaks` 并更新 `astro.config.mjs`。
9. 把 `siteConfig.site_url` 改为 `http://<公网IP>`（或等你提供 IP/域名）。
10. 运行 `pnpm check`、`pnpm type-check`、`pnpm build`，本地 `pnpm preview` 验收。
11. 输出服务器部署步骤与首次部署清单（不在本地修改服务器）。
12. 汇报改动文件、验证结果、遗留项（域名、Phase 2 排序）。

### 14.1 允许修改的文件

```text
src/content/posts/                 # 删除演示、新增 4 篇
src/content/dynamic/               # 删除演示
src/content/spec/about.md          # 占位内容
src/config/siteConfig.ts           # pages 开关、site_url 待填
src/config/galleryConfig.ts        # 相册
src/config/navBarConfig.ts         # 导航清理
src/config/profileConfig.ts        # 移除示例链接
src/config/friendsConfig.ts        # 清演示条目（页面关闭）
src/config/sponsorConfig.ts        # 清演示条目（页面关闭）
src/config/booknavConfig.ts        # 清演示条目（页面关闭）
src/config/musicConfig.ts / pioConfig.ts   # 按需关闭示例资源
.gitignore
scripts/generate-lqips.ts          # 忽略 public/gallery
astro.config.mjs / package.json    # 仅在确认 remark-breaks 后
public/gallery/                    # 删除演示相册（不入库的原图由服务器维护）
```

### 14.2 禁止事项

- 不修改旧仓库 `C:\Users\xx\Desktop\git\blog`。
- 不复制 `.env`、`data/chat.db`、`venv/`、`models/`。
- 不把 `public/gallery` 原图提交到 Git。
- 不开启评论、不添加统计脚本。
- 不写个人信息（真实姓名、社交账号、备案号等）。
- 不配置旧链接重定向。
- 不迁移 `DEPLOY.md`。
- 不执行 `git clean -fdx`。

---

## 附录 A：旧 URL → 新 URL（仅记录，不重定向）

| 旧 URL | 新 URL |
| --- | --- |
| `/post/hello` | `/posts/hello-world/` |
| `/post/0.开发日志` | `/posts/dev-log/` |
| `/post/1.叮咚鸡大狗叫` | `/posts/pandemic-memories/` |
| `/post/人在面对巨大的幸福会突然变得胆怯` | `/posts/courage-and-happiness/` |
| `/photo` | `/gallery/` |
| `/photo/net` | `/gallery/net/` |
| `/photo/scenery` | `/gallery/scenery/` |
| `/chat`、`/qa`、`/minigpt` | 不再提供 |

## 附录 B：迁移后内容结构预览

```text
src/content/posts/
├─ hello-world.md
├─ dev-log.md
├─ pandemic-memories.md
└─ courage-and-happiness.md

public/gallery/            # 仅服务器存在，Git 忽略
├─ net/
│  ├─ 01-moon.jpg
│  ├─ 02-sovgirl1.png
│  └─ 03-sovgirl2.png
└─ scenery/
   ├─ 01-build_1.jpg
   ├─ 02-build_2.jpg
   ├─ 03-build_3.jpg
   ├─ 04-build_4.jpg
   ├─ 05-flowers_1.jpg
   ├─ 06-flowers_2.jpg
   ├─ 07-school_lake_1.jpg
   └─ 08-gools_1.jpg
```

---

**v2 审核已完成**。下一轮从第 14 节的第 0 步开始：Fork 上游 → 同步最新 → 核对文档 → 迁移内容。部署前还需要你提供**服务器公网 IP**（域名可后补）。
