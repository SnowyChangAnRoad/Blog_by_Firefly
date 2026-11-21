# Firefly 博客日常维护手册

> 目标服务器：`124.223.166.233`
>
> 本文只讲**站点上线之后**的日常操作：发布文章、更新动态、维护相册与音乐、更新模板代码、备份回滚、排错。
> 首次部署、Nginx 配置、域名切换、Artalk 与 Umami 的安装步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。

---

## 1. 维护总览

Firefly 是静态站点：**上传 Markdown 或图片后，必须在服务器重新构建才会生效**，不能像旧 FastAPI 那样“放进去就能看”。

服务器目录与内容归属：

```text
/var/www/blog_firefly/
├─ src/content/posts/      # 文章，不入 Git
├─ src/content/dynamic/    # 动态，不入 Git
├─ public/gallery/         # 相册图片，不入 Git
├─ public/assets/music/    # 音乐与封面，不入 Git
├─ dist/                   # 构建产物，Nginx 的 root
└─ node_modules/
```

| 内容 | 是否入 Git | 维护方式 |
| --- | --- | --- |
| 文章 `src/content/posts/` | 否 | 本地写 → 上传 → 构建 |
| 动态 `src/content/dynamic/` | 否 | 本地写 → 上传 → 构建 |
| 相册 `public/gallery/` | 否 | 本地压缩 → 上传 → 构建 |
| 音乐 `public/assets/music/` | 否 | 本地放文件 → 上传 → 构建 |
| 配置 `src/config/` | 是 | 改代码 → 提交 → 服务器拉取或上传 |
| 模板代码 | 是 | `git fetch` + `git reset` |

**服务器是文章、动态、相册、音乐的唯一副本**，请按第 9 节定期备份。

标准构建命令（服务器上执行）：

```bash
cd /var/www/blog_firefly
set -a; . ~/.umami-stats.env; set +a   # 可选，刷新侧边栏访客量；未配置时跳过
pnpm build
```

访客量的来源、前置条件与验证方法见 7.2 节。

Nginx 直接读取 `dist/`，构建完成后不需要重启 Nginx。因为 HTML 已设置 `Cache-Control: no-cache`，正常刷新就能拿到新页面。

---

## 2. 发布文章

### 2.1 本地写文章

在本地工作区创建：

```text
src/content/posts/<slug>.md
```

frontmatter 示例：

```yaml
---
title: 文章标题
published: 2026-11-05
description: 文章摘要
slug: my-new-post
draft: false
---
```

本地预览：

```bash
pnpm dev
```

### 2.2 上传文章

本地 Windows PowerShell：

```powershell
scp -r .\src\content\posts\* ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/posts/
```

或使用 rsync（不删除服务器上的其他文章）：

```bash
rsync -avz src/content/posts/ ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/posts/
```

### 2.3 服务器构建

```bash
ssh ubuntu@124.223.166.233
cd /var/www/blog_firefly
set -a; . ~/.umami-stats.env; set +a   # 未配置时跳过
pnpm build
```

需要保留上一版产物用于回滚时，构建前执行 `cp -a dist dist.bak`，详见第 10 节。

### 2.4 删除文章

在本地与服务器上同时删除对应的 `.md`，然后重新构建。`scp` / `rsync` 默认不会删除服务器上多出来的文件，必须手动移除。

---

## 3. 动态维护

动态是短内容，每条一个 Markdown 文件，存放在 `src/content/dynamic/`。**动态不提交到 Git**（`src/content/dynamic/**` 已加入 `.gitignore`，只保留 `.gitkeep`），必须单独上传到服务器。

### 3.1 文件命名

```text
src/content/dynamic/YYYY-MM-DD-HHmmss.md
```

文件名只用于唯一标识，页面显示的时间取自 frontmatter 的 `published`。

### 3.2 frontmatter

```yaml
---
published: 2026-11-10 21:03:10
pinned: false
location: ""
---
正文内容，支持 Markdown。
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `published` | 是 | 发布时间，格式 `YYYY-MM-DD HH:mm:ss` |
| `pinned` | 否 | `true` 时置顶 |
| `location` | 否 | 位置，显示在动态下方，留空则不显示 |

排序规则：置顶优先，其余按 `published` 降序。

### 3.3 新增动态

推荐用脚手架，会自动按站点时区生成文件名和 `published`：

```bash
pnpm new-d "今天的一点想法"
# 与 pnpm new-dynamic "今天的一点想法" 等价
```

也可以手动在 `src/content/dynamic/` 新建 md，注意文件名不要重复。

### 3.4 带图片的动态

正文使用标准 Markdown 图片语法：

```md
![描述](/assets/images/dynamic/photo.webp)
```

- 绝对路径指向 `public/`，图片需要单独上传；
- 也可以直接使用远程 URL；
- 构建时图片会从正文抽出，按图片列表单独渲染。

### 3.5 本地预览

```bash
pnpm dev
```

检查 `/dynamic/` 页面和侧边栏「最新动态」的排序、图片、置顶是否正常。

### 3.6 上传与发布

动态不入 Git，`git pull` 不会带来任何动态文件，必须手动上传：

```powershell
# 本地 PowerShell 执行，上传全部动态
scp -r .\src\content\dynamic\* ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/dynamic/
```

或只上传某一条：

```powershell
scp .\src\content\dynamic\2026-11-10-210310.md ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/dynamic/
```

使用 rsync 镜像整个目录（推荐，可断点续传）：

```bash
rsync -avz --progress src/content/dynamic/ ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/dynamic/
```

服务器上构建：

```bash
ssh ubuntu@124.223.166.233
cd /var/www/blog_firefly
pnpm build
```

服务器目录不存在时先创建：

```bash
mkdir -p /var/www/blog_firefly/src/content/dynamic
```

注意：

- 服务器上的动态是唯一副本，请定期备份 `src/content/dynamic/`，它对 Git 不可恢复；
- 不要执行 `git clean -fdx`，会删除该目录下未入库的动态；
- 新增带图片的动态时，正文引用的 `public/assets/images/dynamic/` 图片也要一并上传。

### 3.7 删除动态

在本地和服务器上同时删除对应 md，然后在服务器执行 `pnpm build`。`scp` 不会删除文件，必须手动移除。

### 3.8 相关配置

| 内容 | 位置 |
| --- | --- |
| 页面开关 | `src/config/siteConfig.ts` 的 `pages.dynamic` |
| 导航入口 | `src/config/navBarConfig.ts` 的 `LinkPresets.Dynamic` |
| 页面标题、每页数量、数据源 | `src/config/dynamicConfig.ts` |
| 侧边栏「最新动态」 | `src/config/sidebarConfig.ts` 中 `type: "dynamic"` 的组件 |
| 评论 | `src/config/commentConfig.ts`，`type: "none"` 时不显示 |

---

## 4. 相册维护

`public/gallery/` 已被 `.gitignore` 忽略，图片只能手动上传。**不要直接上传原图**：原图单张可能 2–6 MB，整页会到几十 MB。

### 4.1 压缩并上传

**1. 本地放入原图**

```text
public/gallery/<albumId>/01-xxx.jpg
```

文件名使用两位数字前缀控制顺序，尽量只用小写字母、数字、连字符。

**2. 本地压缩**

```bash
pnpm optimize-gallery
```

脚本会：

- 把原图转成 WebP（最长边 1920px，质量 80）
- 把原图移动到 `.gallery-originals/<albumId>/` 备份（已被 Git 忽略）
- 自动把 `galleryConfig.ts` 中指向旧扩展名的封面路径改成 `.webp`
- 跳过已经符合要求的 WebP 和 GIF 动图

需要强制重新压缩全部图片时：

```bash
pnpm optimize-gallery --force
```

**3. 本地预览**

```bash
pnpm dev
```

确认 `/gallery/<albumId>/` 顺序、封面、灯箱正常。相册图片不入库，`galleryConfig.ts` 的封面改动需要提交。

**4. 上传到服务器**

服务器先建目录（首次或新增相册时）：

```bash
mkdir -p /var/www/blog_firefly/public/gallery/<albumId>
```

本地 PowerShell：

```powershell
$albumId = "two-dimensional"    # 改成自己的相册 id
scp -r .\public\gallery\$albumId\* ubuntu@124.223.166.233:/var/www/blog_firefly/public/gallery/$albumId/
```

推荐用 rsync 镜像整个相册目录，`--delete` 会删除服务器上已被替换的旧 `.jpg/.png`：

```bash
rsync -avz --progress --delete public/gallery/two-dimensional/ ubuntu@124.223.166.233:/var/www/blog_firefly/public/gallery/two-dimensional/
```

**5. 服务器重新构建**

```bash
cd /var/www/blog_firefly
pnpm build
ls dist/gallery/<albumId>/
```

### 4.2 新增相册

除了传图，还要在 `src/config/galleryConfig.ts` 的 `albums` 数组中登记 `id`、名称、描述与封面，然后同步配置到服务器并重新构建。

### 4.3 删除图片

图片未入库，`rsync --delete` 或手动 `rm` 服务器上的文件后重新构建即可。

### 4.4 注意事项

- 目录名必须与 `src/config/galleryConfig.ts` 里的 `id` 完全一致；
- 修改过的 `galleryConfig.ts` 需要通过 Git 或 scp 同步到服务器；
- 压缩前原图保存在本地 `.gallery-originals/`，请勿删除，必要时可重新生成；
- 服务器上只需要保留压缩后的 `.webp`，不要保留原图，否则会白白占用带宽和磁盘。

---

## 5. 音乐维护

`public/assets/music/**` 被 `.gitignore` 忽略，音频和封面需手动上传：

```powershell
# 本地 PowerShell 执行
scp .\public\assets\music\*.mp3 ubuntu@124.223.166.233:/var/www/blog_firefly/public/assets/music/
scp -r .\public\assets\music\cover\* ubuntu@124.223.166.233:/var/www/blog_firefly/public/assets/music/cover/
```

服务器目录不存在时先创建：

```bash
mkdir -p /var/www/blog_firefly/public/assets/music/cover
```

服务器上构建并验证：

```bash
cd /var/www/blog_firefly
pnpm build
ls dist/assets/music/
```

注意：

- 新增歌曲需同时修改 `src/config/musicConfig.ts` 的播放列表，配置走 Git 或 scp 上传；
- 文件名含中文或空格时，PowerShell 命令中要用双引号包住路径。

---

## 6. 其他内容改动对照表

| 修改内容 | 操作 |
| --- | --- |
| 新增相册图片 | 先运行 `pnpm optimize-gallery` 压缩，再上传 `.webp` 并 `pnpm build` |
| 修改站点配置 | 上传 `src/config/*` 对应文件，然后 `pnpm build` |
| 修改依赖 | 服务器先 `pnpm install`，再 `pnpm build` |
| 删除文章 | 本地删除后，服务器手动删除对应文件，再 `pnpm build` |
| 新增/修改动态 | 与文章相同，用 `scp` / `rsync` 上传到服务器 `src/content/dynamic/`，再 `pnpm build` |
| 删除动态 | 本地与服务器同时删除对应 md，再 `pnpm build` |
| 修改相册封面/名称 | 修改 `src/config/galleryConfig.ts`，上传后重新构建 |
| 刷新侧边栏访问量 | 加载 `~/.umami-stats.env` 后 `pnpm build`，数字来自构建期快照，见 7.2 节 |
| 修改统计脚本地址 | 修改 `src/config/analyticsConfig.ts` 后重新构建 |

> `scp` / `rsync` 默认不会删除服务器上多出来的旧文件，删除文章或动态需要手动处理。
> 文章与动态都不入 Git，服务器是唯一副本，改动后务必上传并重新构建。

---

## 7. 构建与产物

### 7.1 常规构建

```bash
cd /var/www/blog_firefly
set -a; . ~/.umami-stats.env; set +a   # 可选
pnpm build
```

构建会依次生成访问量快照、LQIP、Astro 静态页面、字体子集、Pagefind 搜索索引。构建期间出现 `No files found matching "**/*.md"` 的提示是正常的：`src/content/dynamic`、`src/content/projects` 已清空但目录保留。

### 7.2 刷新侧边栏访客量

侧边栏「站点统计」里的累计访客数与浏览量**不是实时数据**，而是构建期快照：

- 由 `scripts/fetch-umami-stats.ts` 在 `pnpm build` 开始时查询 Umami 的 PostgreSQL，把结果写入 `src/constants/umami-stats.json`；
- 该 JSON 已加入 `.gitignore`，只存在于构建机；
- 页面上的数字要等下次 `pnpm build` 才会变化，访客浏览本身不会更新它。

因此**刷新访客量的唯一方式就是重新构建**。

**1. 确认前置条件**

服务器需要 `psql` 命令：

```bash
psql --version
# 未安装时
sudo apt install -y postgresql-client
```

`~/.umami-stats.env`（ubuntu 用户，权限 600）：

```ini
UMAMI_DATABASE_URL=postgresql://umami:数据库密码@localhost:5432/umami
UMAMI_WEBSITE_ID=320a53f1-31c8-426b-9c13-d0d2b5ec9a17
```

`UMAMI_WEBSITE_ID` 用于只统计本站；留空则统计整库。格式不是合法 UUID 时脚本会忽略并打印警告。

**2. 构建时加载环境变量**

```bash
ssh ubuntu@124.223.166.233
cd /var/www/blog_firefly
set -a; . ~/.umami-stats.env; set +a
pnpm build
```

`set -a` 让文件里的变量自动导出给子进程；`set +a` 关闭该行为。环境变量只在当前 shell 有效，每次重新登录都要重新加载。

**3. 确认快照已更新**

构建日志开头应出现类似输出：

```text
[UMAMI-STATS] visitors=1234 pageviews=5678 -> src/constants/umami-stats.json
```

也可以直接查看文件：

```bash
cat src/constants/umami-stats.json
```

```json
{
  "visitors": 1234,
  "pageviews": 5678,
  "updatedAt": "2026-11-17T02:10:00.000Z"
}
```

**4. 验证页面**

刷新首页，侧边栏「站点统计」卡片应显示新的数字。Nginx 对 HTML 设置了 `no-cache`，正常刷新即可，无需重启 Nginx。

**失败时的行为**

| 情况 | 表现 |
| --- | --- |
| 没有 `~/.umami-stats.env` 或未加载 | 日志打印 `[UMAMI-STATS] 未设置 UMAMI_DATABASE_URL，跳过访问量统计`，侧边栏不显示这两项 |
| 数据库连接失败 / `psql` 报错 | 日志打印 `[UMAMI-STATS] 读取失败，保留上次数据`，继续使用上一次的 JSON，构建不中断 |
| `UMAMI_WEBSITE_ID` 非法 | 打印警告后忽略该变量，按整库统计 |

注意：脚本失败不会阻断构建，但也不会更新数字。如果数字长期不变，先看构建日志里有没有 `[UMAMI-STATS]`。

### 7.3 可选：保留上一版哈希资源

如果访问量较大、部署比较频繁，可以在构建时保留上一版 `_astro` 哈希文件：

```bash
cd /var/www/blog_firefly

rm -rf /tmp/firefly-astro-old
cp -a dist/_astro /tmp/firefly-astro-old 2>/dev/null || true

pnpm build

rsync -a --ignore-existing /tmp/firefly-astro-old/ dist/_astro/
find dist/_astro -type f -mtime +7 -delete
```

哈希文件名不会冲突，保留 7 天是安全的。个人博客通常可以跳过这一步。

### 7.4 构建前备份

需要保留上一版产物用于回滚时：

```bash
cp -a dist dist.bak
```

---

## 8. 更新模板代码

服务器是浅克隆（`--depth 1`），更新时保持浅拉取即可：

```bash
cd /var/www/blog_firefly

git fetch --depth 1 origin migrate/blog
git reset --hard FETCH_HEAD

# package.json / pnpm-lock.yaml 有变化时
pnpm install --frozen-lockfile

set -a; . ~/.umami-stats.env; set +a   # 可选，刷新侧边栏访问量
pnpm build
```

说明：

- `git reset --hard` 会覆盖被构建改写的生成文件（`lqips.json`、`github-card-data.json` 等），因此不需要再手动 `git checkout --`。
- `src/constants/umami-stats.json` 已加入 `.gitignore`，由构建脚本生成，不受 Git 操作影响。
- `git reset --hard` **只影响已跟踪文件**，不会删除未入库的 `src/content/posts/`、`src/content/dynamic/`、`public/gallery/`。
- **不要执行 `git clean -fdx`**，否则会删除文章、动态和相册原图。
- 如果远程名改成了 `gitee`，把上面的 `origin` 换成 `gitee`。
- 如果使用源码压缩包部署（没有 `.git`），更新时重新下载压缩包覆盖即可，覆盖前先备份 `src/content/posts/`、`src/content/dynamic/`、`public/gallery/`。

### 8.1 稀疏克隆维护约定

服务器使用 `--filter=blob:none --sparse` 稀疏浅克隆，**只检出根目录文件与 `src/`、`public/assets/`、`public/favicon/`、`scripts/`、`docs/`、`.github/`**。`public/pio/`（看板娘模型，约 14.6 MiB）未检出，`public/gallery/` 始终不在 Git 中。

日常维护需要注意：

1. **不要执行 `git sparse-checkout disable`**。它会尝试恢复全部文件，包括 14.6 MiB 的 `public/pio`，可能再次卡在慢速下载。

2. 查看当前检出了哪些目录：

   ```bash
   git sparse-checkout list
   ```

3. 以后如果要启用看板娘：

   ```bash
   cd /var/www/blog_firefly
   git sparse-checkout add public/pio
   ```

   然后把 `src/config/pioConfig.ts` 中 `live2dWidgetConfig.enable` 或 `spineModelConfig.enable` 改为 `true`，再 `pnpm build`。

4. 用 Git 更新模板后，稀疏配置会保留。但**如果上游新增了新的顶层目录**（例如 `packages/`），默认不会检出，需要手动加入：

   ```bash
   git sparse-checkout add packages
   ```

   同理，如果上游新增了 `public/` 下的其他子目录（例如 `public/images/`），也需要 `git sparse-checkout add public/images`。

5. 文章与动态更新仍然按第 2、3 节用 `scp` / `rsync` 上传，不受稀疏检出影响。

6. `git reset --hard FETCH_HEAD` 不会删除 `public/gallery`，也不会改变稀疏配置；继续遵守“禁止 `git clean -fdx`”。

> 已检出的 `public/assets/` 包含音乐、字体、图片等资源；`public/assets/music` 已被 `.gitignore` 忽略，不随 Git 更新，音频和封面需按第 5 节手动上传。

---

## 9. 备份

### 9.1 站点内容

```bash
cd /var/www/blog_firefly

# 文章与动态（不在 Git 中，丢了无法从仓库恢复）
tar -czf ~/firefly-content-$(date +%F).tar.gz src/content/posts src/content/dynamic

# 相册原图（不在 Git 中）
tar -czf ~/firefly-gallery-$(date +%F).tar.gz public/gallery

# 音乐与封面（不在 Git 中）
tar -czf ~/firefly-music-$(date +%F).tar.gz public/assets/music

# 上一版构建产物
cp -a dist dist.bak

# Nginx 配置
sudo cp /etc/nginx/conf.d/blog_firefly.conf ~/firefly-nginx-$(date +%F).conf
```

建议定期把这些压缩包下载到本地或对象存储。

### 9.2 服务数据

评论（Artalk，SQLite）与访问统计（Umami，PostgreSQL）的备份命令见 [DEPLOYMENT.md](DEPLOYMENT.md) 对应章节。

---

## 10. 回滚

### 10.1 构建产物回滚

如果新构建异常，且构建前执行过 `cp -a dist dist.bak`：

```bash
cd /var/www/blog_firefly
rm -rf dist
mv dist.bak dist
sudo systemctl reload nginx
```

### 10.2 代码回滚

```bash
cd /var/www/blog_firefly
git log --oneline -5
git checkout <上一个正常提交>
pnpm install --frozen-lockfile
pnpm build
```

切回分支时注意保留 `public/gallery/`，它不在 Git 中，不会被 `git checkout` 删除。

---

## 11. 常见问题

| 现象 | 排查 |
| --- | --- |
| 新文章不显示 | 是否上传到 `src/content/posts/`，是否在服务器执行了 `pnpm build` |
| 动态上传后页面没变 | 是否上传到了服务器 `src/content/dynamic/`，是否在服务器执行了 `pnpm build` |
| 相册页为空或封面 404 | `public/gallery/<albumId>` 是否有图片，是否在**上传图片后**重新构建 |
| 图片 403 | 目录权限；确保 `public/gallery` 对运行 Nginx 的用户可读 |
| 页面样式错乱 | 是否直接修改了 `dist/`；应修改 `src/` 后重新构建 |
| 搜索无结果 | 是否使用完整 `pnpm build`（包含 Pagefind），而不是仅 `astro build` |
| 侧边栏没有访问量 | 是否加载了 `~/.umami-stats.env`，服务器是否有 `psql`，构建日志有无 `[UMAMI-STATS]`，见 7.2 节 |
| `pnpm build` 被杀 | 内存不足，增加 swap 或升级服务器 |
| `git pull` 冲突 | 先还原 `src/constants/lqips.json`、`src/constants/github-card-data.json` |
| `git clean -fdx` 后文章/动态消失 | 该命令会删除未入库文件，需从备份恢复 `src/content/posts`、`src/content/dynamic` |
| `git clean -fdx` 后相册消失 | 同上，从备份恢复 `public/gallery` |
| 构建报 `CannotFetchFontFile` / 字体下载失败 | 多为服务器访问 `cdn.jsdelivr.net` 临时失败，可先重试；持续失败时考虑自托管字体或配置可用的网络代理 |

部署、Nginx、Artalk、Umami 相关问题见 [DEPLOYMENT.md](DEPLOYMENT.md) 的常见问题与各服务章节。

---

## 12. 维护禁忌

- **不要执行 `git clean -fdx`**：会删除不入 Git 的文章、动态、相册和音乐。
- **不要直接修改 `dist/`**：下次构建会被覆盖，改动应落在 `src/` 或 `public/`。
- **不要执行 `git sparse-checkout disable`**：会重新拉取 14.6 MiB 的 `public/pio`。
- **不要在本地以外的机器构建后只拷 `dist/`**：相册、文章、动态都以服务器副本为准，容易漏文件。
- **不要把 `.env`、密钥、服务密码写进仓库**。
- **不要忘记构建**：`scp` 上传只是把文件放到服务器，页面不会自动更新。

---

## 13. 相关文档

| 文档 | 内容 |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 首次部署、Nginx、域名切换、Artalk / Umami 安装 |
| [TEMPLATE.md](TEMPLATE.md) | 模板结构、配置项、内容模型 |
| [UMAMI_PLAN.md](UMAMI_PLAN.md) | Umami 接入细节与踩坑 |
| [ARTALK_PLAN.md](ARTALK_PLAN.md) | Artalk 接入细节 |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | 旧站迁移历史归档 |
