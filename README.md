# SnowyChangAnRoad 的博客

基于 [Firefly](https://github.com/CuteLeaf/Firefly) 模板二次开发的个人博客，已完成从旧 FastAPI 站点的内容迁移，部署在自有云服务器上，以纯静态方式运行。

- 站点地址：<http://124.223.166.233/>
- 站点标题：SnowyChangAnRoad
- 当前分支：`migrate/blog`
- 运行形态：Nginx 静态托管 + Artalk 评论后端，站点本身不需要 Node/Python/数据库

## 当前状态

| 项 | 状态 |
| --- | --- |
| 文章 | 14 篇，位于 `src/content/posts/`（**不入 Git**） |
| 相册 | 3 个：`net`、`scenery`、`two-dimensional`（原图**不入 Git**） |
| 动态 | 已启用，内容在 `src/content/dynamic/`（**不入 Git**） |
| 留言板 | 已启用，依赖 Artalk |
| 文章评论 | 已启用（Artalk）；单篇可用 frontmatter `comment: false` 关闭 |
| 动态评论 | 已关闭（`dynamicConfig.showComment = false`） |
| 友链 / 项目 / 书签 / 打赏 / 追番 | 已关闭（`siteConfig.pages`） |
| 访问协议 | HTTP（暂无域名） |
| 搜索 | Pagefind，随 `pnpm build` 生成 |

## 技术栈

| 组成 | 说明 |
| --- | --- |
| 框架 | Astro 7，静态输出，`trailingSlash: "always"` |
| UI | Astro 组件 + Svelte 5 岛屿 + Tailwind CSS 4 |
| 语言 | TypeScript 6 |
| 包管理 | pnpm 11.22.0（`preinstall` 强制） |
| Node | >= 22.23.0 |
| 搜索 | Pagefind |
| 评论 | Artalk（独立后端，SQLite） |
| 代码高亮 | Expressive Code |

## 目录结构

```text
.
├─ docs/                     # 项目文档（见下方“文档索引”）
├─ src/
│  ├─ config/                # 站点、导航、相册、评论等配置
│  ├─ content/
│  │  ├─ posts/              # 文章（不入 Git，本地与服务器各自维护）
│  │  ├─ dynamic/            # 动态（不入 Git）
│  │  ├─ projects/           # 项目展示（页面已关闭）
│  │  └─ spec/               # about、guestbook、friends 固定页
│  ├─ components/            # Astro / Svelte 组件
│  ├─ layouts/               # 页面骨架
│  ├─ pages/                 # 文件路由
│  ├─ plugins/               # remark / rehype 插件
│  └─ styles/                # 全局样式
├─ public/
│  ├─ gallery/<albumId>/     # 相册原图（不入 Git，需单独上传服务器）
│  └─ assets/                # 字体、图标、音乐等静态资源
├─ scripts/                  # 构建前后处理与脚手架
├─ astro.config.mjs          # Astro 集成与 Markdown 插件链
└─ package.json
```

服务器部署时采用稀疏浅克隆，不检出体积较大的 `public/pio`。

## 本地开发

```bash
corepack enable
pnpm install
pnpm dev          # http://localhost:4321
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器 |
| `pnpm check` | Astro 诊断 |
| `pnpm type-check` | TypeScript 检查 |
| `pnpm build` | 完整构建（LQIP、字体子集、Pagefind 等） |
| `pnpm preview` | 预览构建产物 |
| `pnpm new-post` | 新建文章 |
| `pnpm lqips` | 重新生成图片 LQIP |
| `pnpm format` / `pnpm lint` | Biome 格式化与检查 |

注意：本地没有 `public/gallery`、`src/content/posts` 时，相册和文章列表会是空的，这是预期行为，这两类内容不随仓库分发。

## 内容与发布流程

文章、动态、相册原图、音乐都不入库，只在本地与服务器之间同步：

1. 本地写 `src/content/posts/<slug>.md`，frontmatter 至少包含 `title`、`published`、`slug`。
2. 本地 `pnpm dev` 预览。
3. 用 `scp` / `rsync` 把内容上传到服务器 `/var/www/blog_firefly/`。
4. 在服务器执行 `pnpm build`，Nginx 直接读取 `dist/`。
5. 新增相册图片需先上传到 `public/gallery/<albumId>/`，再构建。

完整命令、首次部署、备份回滚、常见问题见 [部署文档](docs/DEPLOYMENT.md)。

## 评论系统

评论使用 Artalk，后端独立运行在服务器 `8080` 端口，通过 Nginx 反向代理到 `127.0.0.1:23366`，数据存放在 SQLite。

- 前端配置：`src/config/commentConfig.ts` 的 `artalk.server`
- 后端配置：服务器 `/etc/artalk/artalk.yml` 的 `site_default`、`trusted_domains`
- 评论范围：留言板 + 文章；动态评论关闭

接入步骤与排错见 [Artalk 接入文档](docs/ARTALK_PLAN.md)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/TEMPLATE.md](docs/TEMPLATE.md) | Firefly 模板使用说明（原 README，介绍模板结构、配置、写作与发布） |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 服务器部署、日常更新、备份回滚、Nginx、Artalk |
| [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) | 从旧 FastAPI 站点迁移的决策与执行记录 |
| [docs/ARTALK_PLAN.md](docs/ARTALK_PLAN.md) | Artalk 接入的决策、服务器步骤与仓库改动 |

## 已知限制

- 暂无域名，站点通过 `http://124.223.166.233` 访问；管理员后台与评论 API 使用 `8080` 端口，部分受限网络可能拦截该端口。
- HTTP 明文传输，Artalk 管理员密码与会话不具备传输加密；长期建议配置域名并启用 HTTPS。
- RSS、Sitemap、canonical、OG 图使用 `siteConfig.site_url` 生成，更换 IP 或域名后必须重新构建。
- 相册原图、文章、动态、音乐不在 Git 中，换机器或重新克隆时需要单独迁移；服务器上禁止执行 `git clean -fdx`。
- 构建会改写 `src/constants/lqips.json`、`src/constants/github-card-data.json` 等生成文件，提交前注意区分。

## 来源与许可

- 模板：[CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly)
- Firefly 基于 [saicaca/fuwari](https://github.com/saicaca/fuwari) 二次开发
- 本仓库的许可证见 [LICENSE](LICENSE)
