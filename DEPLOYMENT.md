# Firefly 博客服务器部署文档

> 目标服务器：`124.223.166.233`
>
> 部署形态：云服务器 + Nginx 静态托管，运行时不依赖 Node、Python 或数据库。
>
> 适用分支：`migrate/blog`（迁移完成后可合并回 `master`）
>
> 本文按“首次部署 → 验收 → 日常发文 → 备份回滚”的顺序编写，命令可直接复制执行。示例默认使用 `ubuntu` 普通用户登录（`ssh ubuntu@124.223.166.233`）。系统级操作（安装软件、修改 Nginx、重启服务）均标注 `sudo`；克隆、安装依赖、构建以 `ubuntu` 身份执行，不需要 `sudo`。

---

## 1. 部署概览

```text
本地 Windows（写 Markdown、维护相册）
        │  scp / rsync 上传文章、动态、配置、相册原图
        ▼
云服务器 124.223.166.233
/var/www/blog_firefly/          # Git 仓库
├─ src/content/posts/      # 文章（不入 Git，必须单独上传）
├─ src/content/dynamic/    # 动态（不入 Git，必须单独上传）
├─ public/gallery/         # 相册原图（不入 Git，必须单独上传）
├─ dist/                   # 构建产物，Nginx 的 root
└─ node_modules/
        │  pnpm build
        ▼
Nginx 读取 dist/，对外提供 http://124.223.166.233
```

关键约定：

- **构建必须在服务器上执行**，因为文章、动态、相册都只存在于服务器的内容目录中。
- `src/content/posts/`、`src/content/dynamic/`、`public/gallery/` 均已被 `.gitignore` 忽略，`git pull` 不会覆盖或删除它们。
- **禁止在服务器执行 `git clean -fdx`**，否则会删除未入库的文章、动态和相册原图。
- 站点使用尾斜杠（`/posts/hello-world/`），站内链接都带 `/`。
- 当前无域名，只能使用 HTTP；`site_url` 已设为 `http://124.223.166.233`。
- 服务器使用**稀疏浅克隆**：`public/pio` 未检出（看板娘已关闭，构建不需要），`public/gallery` 始终不在 Git 中。维护约定见 3.2 节。

---

## 2. 服务器前置

默认使用 `ubuntu` 账号登录，不使用 root：

```bash
ssh ubuntu@124.223.166.233
whoami                  # 预期输出 ubuntu
getent passwd ubuntu    # 确认账号存在
sudo -n true && echo "已配置免密 sudo" || echo "sudo 需要输入密码，仍可使用"
```

若镜像没有 `ubuntu` 用户（例如部分 CentOS / Debian 精简镜像），改用实际默认账号（常见为 `root` 或 `centos`），并把全文的 `ubuntu@` 替换成该账号。

### 2.1 系统与依赖

需要：

| 依赖 | 版本/用途 |
| --- | --- |
| Node.js | >= 22.23.0，用于构建 |
| pnpm | 11.22.0，通过 corepack 启用 |
| Git | 拉取代码 |
| rsync / scp | 上传文章与相册 |
| Nginx | 静态托管 |

#### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y git rsync nginx curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 启用 pnpm
sudo corepack enable
sudo corepack prepare pnpm@11.22.0 --activate

node -v     # 必须 >= v22.23.0
pnpm -v     # 应为 11.22.0
nginx -v
```

#### CentOS / Rocky Linux / AlmaLinux

```bash
sudo dnf install -y git rsync nginx curl
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

sudo corepack enable
sudo corepack prepare pnpm@11.22.0 --activate

node -v
pnpm -v
```

> 如果服务器内存只有 1 GB，建议先加 2 GB swap，否则 `pnpm build` 可能被系统杀掉。可用 `free -h` 查看内存。

### 2.2 放行 80 端口

- 云厂商控制台：安全组放行 TCP 80。
- Ubuntu（ufw）：

  ```bash
  sudo ufw allow 80/tcp
  sudo ufw status
  ```

- CentOS（firewalld）：

  ```bash
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --reload
  ```

---

## 3. 首次部署

### 步骤 1：准备目录并克隆仓库

仓库已 Fork，公开可读。**服务器只负责构建，不需要完整 Git 历史，使用浅克隆即可**：

```bash
sudo mkdir -p /var/www/blog_firefly
sudo chown -R ubuntu:ubuntu /var/www/blog_firefly   # 目录归 ubuntu，后续 clone/install/build 都不需要 sudo

git clone --depth 1 --branch migrate/blog --single-branch \
  https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git /var/www/blog_firefly
cd /var/www/blog_firefly
git log --oneline -3
```

浅克隆只下载当前分支最新一次提交的文件，不下载上游历史。本仓库完整历史约 **128 MiB**，当前文件约 **24 MiB**，按 30 kB/s 估算：完整克隆约 70 分钟，浅克隆约 13 分钟。

如果使用 `git@github.com:...` 形式，需要先在服务器生成 SSH key 并添加到 GitHub 仓库的 Deploy Key。

> 后续更新代码时不要直接 `git pull`，用第 5 节的浅拉取命令。
>
> 如果浅克隆仍然很慢，见第 3.1 节的备选方案。

### 步骤 2：安装依赖

```bash
cd /var/www/blog_firefly
pnpm install --frozen-lockfile
```

项目通过 `preinstall` 强制使用 pnpm，不要改用 npm 或 yarn。

### 步骤 3：上传相册原图

相册原图不在 Git 仓库中，**必须先上传再构建**，否则相册页只有空列表、封面 404。

服务器上先建目录：

```bash
mkdir -p /var/www/blog_firefly/public/gallery/net
mkdir -p /var/www/blog_firefly/public/gallery/scenery
```

在本地 Windows PowerShell 执行（当前工作区已有一份可用的 `public/gallery`）：

```powershell
scp -r .\public\gallery\net\* ubuntu@124.223.166.233:/var/www/blog_firefly/public/gallery/net/
scp -r .\public\gallery\scenery\* ubuntu@124.223.166.233:/var/www/blog_firefly/public/gallery/scenery/
```

如果本机安装了 `rsync`：

```bash
rsync -avz public/gallery/net/ ubuntu@124.223.166.233:/var/www/blog_firefly/public/gallery/net/
rsync -avz public/gallery/scenery/ ubuntu@124.223.166.233:/var/www/blog_firefly/public/gallery/scenery/
```

上传后确认：

```bash
ls /var/www/blog_firefly/public/gallery/net
ls /var/www/blog_firefly/public/gallery/scenery
```

应看到：

- `net`：`01-moon.jpg`、`02-sovgirl1.png`、`03-sovgirl2.png`
- `scenery`：`01-build_1.jpg` 到 `08-gools_1.jpg`

> 旧站导出的 `.json` 元信息不要上传，Firefly 不读取它们。
> 建议长期备份 `public/gallery/`，它不受 Git 保护。

### 步骤 4：确认站点地址

打开 `src/config/siteConfig.ts`，确认：

```ts
site_url: "http://124.223.166.233",
```

这个值影响 RSS、Sitemap、OG 图、canonical 等绝对链接，后续更换 IP 或域名时修改后必须重新构建。

### 步骤 5：构建

```bash
cd /var/www/blog_firefly
pnpm build
```

构建会依次生成 LQIP、Astro 静态页面、字体子集、Pagefind 搜索索引。完成后确认：

```bash
ls dist/index.html
ls dist/posts
ls dist/gallery/net dist/gallery/scenery
ls dist/pagefind
```

构建期间出现 `No files found matching "**/*.md"` 的提示是正常的：`src/content/dynamic`、`src/content/projects` 已清空但目录保留。

### 步骤 6：配置 Nginx

`/etc/nginx` 属于系统目录，需要用 `sudo` 写入，例如：

```bash
sudo nano /etc/nginx/conf.d/blog_firefly.conf
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name 124.223.166.233;

    root /var/www/blog_firefly/dist;
    index index.html;
    charset utf-8;

    # 文本压缩
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;

    # 带哈希的构建资源，长缓存
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 相册原图，缓存 30 天
    location /gallery/ {
        expires 30d;
        add_header Cache-Control "public";
    }

    # 普通页面与静态文件
    location / {
        try_files $uri $uri/ =404;
        # HTML 不缓存：Astro 每次构建会更换资源哈希，旧 HTML 可能引用已删除的 CSS/JS
        add_header Cache-Control "no-cache, must-revalidate" always;
    }

    # 自定义 404
    error_page 404 /404.html;
    location = /404.html {
        internal;
    }
}
```

如果已有其他 `server` 占用 80 端口，请先停用或合并配置。

检查并重载：

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx
```

> `location /` 里的 `Cache-Control: no-cache` 是必要的：Astro 每次构建都会生成新的哈希文件名（如 `Layout.xxxx.css`），旧文件会被删除。如果浏览器继续使用旧 HTML，就会请求已经不存在的旧资源并返回 404。

### 步骤 7：线上验收

```bash
curl -I http://124.223.166.233/
curl -I http://124.223.166.233/posts/hello-world/
curl -I http://124.223.166.233/gallery/
curl -I http://124.223.166.233/gallery/net/
curl -I http://124.223.166.233/gallery/net/01-moon.webp
curl -I http://124.223.166.233/rss.xml
curl -I http://124.223.166.233/sitemap-index.xml
```

预期均为 `HTTP/1.1 200 OK`。再检查：

```bash
curl -I http://124.223.166.233/not-exist-page
# 预期 404，并返回自定义 404 页面

curl -I http://124.223.166.233/ | grep -i cache-control
# 预期 cache-control: no-cache, must-revalidate
```

浏览器逐项确认：

- [x] 首页显示 4 篇文章，无演示文章
- [x] `/posts/hello-world/`、`/posts/dev-log/`、`/posts/pandemic-memories/`、`/posts/courage-and-happiness/` 可访问
- [x] 文章换行、表格、代码块、引用正常
- [x] `/archive/`、`/categories/`、`/tags/`、`/series/` 正常
- [x] `/gallery/` 只显示「好看的网图」「风景」「二次元」
- [x] `/gallery/net/` 图片顺序为 moon → sovgirl1 → sovgirl2
- [x] `/gallery/scenery/` 顺序为 build_1…4 → flowers_1…2 → school_lake_1 → gools_1
- [x] 灯箱可打开，移动端瀑布流正常
- [x] `/about/` 显示占位内容
- [x] `/dynamic/` 显示动态内容，侧边栏「最新动态」正常
- [x] 友链、留言、项目、书签、打赏入口不存在
- [x] `/rss.xml`、`/atom.xml`、`/sitemap-index.xml`、`/robots.txt` 可访问
- [x] `/search/` 能搜索到 4 篇文章
- [x] 查看网页源码，canonical / OG 链接为 `http://124.223.166.233/...`
- [x] 刷新首页/相册后控制台没有 `Layout.*.css` 或 `*.js` 的 404

### 3.1 克隆仍然很慢时的备选方案

如果服务器访问 GitHub 只有 30 kB/s 左右，按顺序尝试：

#### 方案 A：Gitee 镜像（国内服务器推荐）

1. 登录 <https://gitee.com>，新建仓库 → 选择“导入已有仓库”。
2. 填入 `https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git`，创建。
3. 在服务器从 Gitee 浅克隆：

   ```bash
   git clone --depth 1 --branch migrate/blog --single-branch \
     https://gitee.com/<你的Gitee用户名>/Blog_by_Firefly.git /var/www/blog_firefly
   ```

4. 后续如果仍想从 GitHub 更新，可再添加远程：

   ```bash
   cd /var/www/blog_firefly
   git remote rename origin gitee
   git remote add origin https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git
   ```

Gitee 导入是服务器主动拉取，通常比服务器直连 GitHub 快；导入完成后，服务器从 Gitee 下载基本走国内线路。

#### 方案 B：下载源码压缩包（不需要 Git 历史）

服务器只构建、不维护代码历史时可以直接下载当前快照：

```bash
sudo mkdir -p /var/www/blog_firefly
sudo chown -R ubuntu:ubuntu /var/www/blog_firefly

curl -L --retry 3 --progress-bar \
  -o /tmp/firefly.tar.gz \
  https://codeload.github.com/SnowyChangAnRoad/Blog_by_Firefly/tar.gz/refs/heads/migrate/blog

tar -xzf /tmp/firefly.tar.gz -C /var/www/blog_firefly --strip-components=1
```

压缩包只包含当前分支的最新文件（不含历史）。缺点是没有 `.git`，后续更新需要重新下载压缩包，或执行：

```bash
cd /var/www/blog_firefly
git init
git remote add origin https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git
git fetch --depth 1 origin migrate/blog
git reset --hard FETCH_HEAD
```

#### 方案 C：第三方 GitHub 加速地址（不推荐长期使用）

可以使用 `ghproxy` 一类的加速前缀，例如：

```bash
git clone --depth 1 --single-branch --branch migrate/blog \
  https://ghproxy.net/https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git \
  /var/www/blog_firefly
```

这类服务由第三方提供，地址可能失效，且会把仓库内容经过第三方服务器，只建议临时使用。仓库是公开内容，风险相对低，但仍需自行判断。

> 不管用哪种方式，`public/gallery` 都不在仓库里，仍需按步骤 3 单独上传。

### 3.2 稀疏克隆后的维护约定

如果使用了方案 A（`--filter=blob:none --sparse`），服务器仓库**只检出以下目录**：

```text
根目录文件（package.json、astro.config.mjs、pnpm-lock.yaml 等）
src/
public/assets/
public/favicon/
scripts/
docs/
.github/
```

未检出的部分：

| 路径 | 状态 | 说明 |
| --- | --- | --- |
| `public/pio/` | 未检出 | 看板娘模型（14.6 MiB），两种看板娘都已关闭，构建不需要 |
| `public/gallery/` | 不在 Git | 相册原图，始终由你单独上传 |

对部署的影响：**没有影响**。`pnpm build` 会正常生成 `dist/`，只是产物里不再包含看板娘资源；`prune-pio-assets.ts` 会提示没有可裁剪资源，这是正常现象。

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

5. 文章与动态更新仍然按第 4 节用 `scp` / `rsync` 上传，不受稀疏检出影响。

6. `git reset --hard FETCH_HEAD` 不会删除 `public/gallery`，也不会改变稀疏配置；继续遵守“禁止 `git clean -fdx`”。

> 已经检出的 `public/assets/` 包含音乐、字体、图片等资源；`public/assets/music` 已被 `.gitignore` 忽略，不随 Git 更新，音频和封面需按 4.4 手动上传。

---

## 4. 日常更新文章与动态

Firefly 是静态站点，**上传 Markdown 后必须重新构建**才会生效，不能像旧 FastAPI 那样“放进去就能看”。

文章（`src/content/posts/`）与动态（`src/content/dynamic/`）都不入 Git，上传方式相同；动态的具体写法见 4.4 节的“动态维护”。

### 4.1 本地写文章

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

本地可先预览：

```bash
pnpm dev
```

### 4.2 上传文章

在本地 Windows PowerShell：

```powershell
scp -r .\src\content\posts\* ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/posts/
```

或使用 rsync（不删除服务器上的其他文章）：

```bash
rsync -avz src/content/posts/ ubuntu@124.223.166.233:/var/www/blog_firefly/src/content/posts/
```

### 4.3 服务器构建

```bash
ssh ubuntu@124.223.166.233
cd /var/www/blog_firefly
pnpm build
```

Nginx 直接读取 `dist/`，不需要重启 Nginx。

需要保留上一版产物用于回滚时，构建前执行：

```bash
cp -a dist dist.bak
```

> 因为 Nginx 已经对 HTML 设置了 `Cache-Control: no-cache`，正常的刷新/跳转都会拿到新 HTML，直接 `pnpm build` 即可。只有在部署瞬间仍有用户停留于旧页面、且希望完全避免旧资源 404 时，才需要看下面的可选方案。

#### 可选：保留上一版哈希资源

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

### 4.4 其他更新

| 修改内容 | 操作 |
| --- | --- |
| 新增相册图片 | 先运行 `pnpm optimize-gallery` 压缩，再上传 `.webp` 并 `pnpm build` |
| 修改站点配置 | 上传 `src/config/*` 对应文件，然后 `pnpm build` |
| 修改依赖 | 服务器先 `pnpm install`，再 `pnpm build` |
| 删除文章 | 本地删除后，服务器手动删除对应文件，再 `pnpm build` |
| 新增/修改动态 | 与文章相同，用 `scp` / `rsync` 上传到服务器 `src/content/dynamic/`，再 `pnpm build` |
| 删除动态 | 本地与服务器同时删除对应 md，再 `pnpm build` |
| 修改相册封面/名称 | 修改 `src/config/galleryConfig.ts`，上传后重新构建 |

> `scp` / `rsync` 默认不会删除服务器上多出来的旧文件，删除文章或动态需要手动处理。
> 文章与动态都不入 Git，服务器是唯一副本，改动后务必上传并重新构建。

#### 相册图片压缩与上传

`public/gallery/` 已被 `.gitignore` 忽略，图片只能手动上传。**不要直接上传原图**：原图单张可能 2–6 MB，整页会到几十 MB。

标准流程：

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

注意：

- 目录名必须与 `src/config/galleryConfig.ts` 里的 `id` 完全一致；
- 新增相册除了传图，还要在 `galleryConfig.ts` 的 `albums` 数组中登记；
- 修改过的 `galleryConfig.ts` 需要通过 Git 或 scp 同步到服务器；
- 压缩前原图保存在本地 `.gallery-originals/`，请勿删除，必要时可重新生成；
- 服务器上只需要保留压缩后的 `.webp`，不要保留原图，否则会白白占用带宽和磁盘。

#### 上传音乐

`public/assets/music/**` 同样被 `.gitignore` 忽略，音频和封面需手动上传：

```powershell
# 本地 PowerShell 执行
scp .\public\assets\music\*.mp3 ubuntu@124.223.166.233:/var/www/blog_firefly/public/assets/music/
scp -r .\public\assets\music\cover\* ubuntu@124.223.166.233:/var/www/blog_firefly/public/assets/music/cover/
```

服务器目录不存在时先创建：

```bash
mkdir -p /var/www/blog_firefly/public/assets/music/cover
```

```bash
# 服务器上构建并验证
cd /var/www/blog_firefly
pnpm build
ls dist/assets/music/
```

注意：

- 新增歌曲需同时修改 `src/config/musicConfig.ts` 的播放列表，配置走 Git 或 scp 上传；
- 文件名含中文或空格时，PowerShell 命令中要用双引号包住路径。

#### 动态维护

动态是短内容，每条一个 Markdown 文件，存放在 `src/content/dynamic/`。与文章一致，**动态不提交到 Git**（`src/content/dynamic/**` 已加入 `.gitignore`，只保留 `.gitkeep`），需要单独上传到服务器。

**文件命名**

```text
src/content/dynamic/YYYY-MM-DD-HHmmss.md
```

文件名只用于唯一标识，页面显示的时间取自 frontmatter 的 `published`。

**frontmatter**

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

**新增动态**

推荐用脚手架，会自动按站点时区生成文件名和 `published`：

```bash
pnpm new-d "今天的一点想法"
# 与 pnpm new-dynamic "今天的一点想法" 等价
```

也可以手动在 `src/content/dynamic/` 新建 md，注意文件名不要重复。

**带图片的动态**

正文使用标准 Markdown 图片语法：

```md
![描述](/assets/images/dynamic/photo.webp)
```

- 绝对路径指向 `public/`，图片需要单独上传；
- 也可以直接使用远程 URL；
- 构建时图片会从正文抽出，按图片列表单独渲染。

**本地预览**

```bash
pnpm dev
```

检查 `/dynamic/` 页面和侧边栏「最新动态」的排序、图片、置顶是否正常。

**上传与发布**

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
- 新增带图片的动态时，正文引用的 `public/assets/images/dynamic/` 图片也要一并上传（见下方“带图片的动态”）。

**删除动态**

在本地和服务器上同时删除对应 md，然后在服务器执行 `pnpm build`。`scp` 不会删除文件，必须手动移除。

**相关配置**

| 内容 | 位置 |
| --- | --- |
| 页面开关 | `src/config/siteConfig.ts` 的 `pages.dynamic` |
| 导航入口 | `src/config/navBarConfig.ts` 的 `LinkPresets.Dynamic` |
| 页面标题、每页数量、数据源 | `src/config/dynamicConfig.ts` |
| 侧边栏「最新动态」 | `src/config/sidebarConfig.ts` 中 `type: "dynamic"` 的组件 |
| 评论 | `src/config/commentConfig.ts`，`type: "none"` 时不显示 |

---

## 5. 用 Git 更新模板代码

服务器是浅克隆（`--depth 1`），更新时保持浅拉取即可：

```bash
cd /var/www/blog_firefly

git fetch --depth 1 origin migrate/blog
git reset --hard FETCH_HEAD

# package.json / pnpm-lock.yaml 有变化时
pnpm install --frozen-lockfile

pnpm build
```

说明：

- `git reset --hard` 会覆盖被构建改写的生成文件（`lqips.json`、`github-card-data.json` 等），因此不需要再手动 `git checkout --`。
- `git reset --hard` **只影响已跟踪文件**，不会删除未入库的 `src/content/posts/`、`src/content/dynamic/`、`public/gallery/`。
- **不要执行 `git clean -fdx`**，否则会删除文章、动态和相册原图。
- 如果远程名改成了 `gitee`，把上面的 `origin` 换成 `gitee`。
- 如果使用第 3.1 节方案 B（源码压缩包，没有 `.git`），更新时重新下载压缩包覆盖即可，覆盖前先备份 `src/content/posts/`、`src/content/dynamic/`、`public/gallery/`。

---

## 6. 备份与回滚

### 6.1 备份

```bash
cd /var/www/blog_firefly

# 文章与动态（不在 Git 中，丢了无法从仓库恢复）
tar -czf ~/firefly-content-$(date +%F).tar.gz src/content/posts src/content/dynamic

# 相册原图（不在 Git 中）
tar -czf ~/firefly-gallery-$(date +%F).tar.gz public/gallery

# 上一版构建产物
cp -a dist dist.bak

# Nginx 配置
sudo cp /etc/nginx/conf.d/blog_firefly.conf ~/firefly-nginx-$(date +%F).conf
```

建议定期把 `~/firefly-content-*.tar.gz`、`~/firefly-gallery-*.tar.gz` 下载到本地或对象存储。

### 6.2 回滚

如果新构建异常：

```bash
cd /var/www/blog_firefly
rm -rf dist
mv dist.bak dist
sudo systemctl reload nginx
```

如果代码层面异常：

```bash
cd /var/www/blog_firefly
git log --oneline -5
git checkout <上一个正常提交>
pnpm install --frozen-lockfile
pnpm build
```

切回分支时注意保留 `public/gallery/`，它不在 Git 中，不会被 `git checkout` 删除。

---

## 7. 后续切换域名

当前只有公网 IP，只能使用 HTTP。后续有域名时：

1. 域名解析 A 记录指向 `124.223.166.233`。
2. 修改 `src/config/siteConfig.ts`：

   ```ts
   site_url: "https://<域名>",
   ```

3. 修改 Nginx：

   ```nginx
   server_name <域名>;
   ```

4. 申请证书并启用 HTTPS：

   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d <域名>
   ```

5. 重新构建：`pnpm build`。
6. 确认 80 端口跳转到 443。

> `site_url` 改动后必须重新构建，否则 RSS、Sitemap、canonical 仍指向旧地址。

---

## 8. 常见问题

| 现象 | 排查 |
| --- | --- |
| 首页 502/无法连接 | Nginx 是否启动、80 端口是否放行、云安全组是否开放 |
| 首页 404 | Nginx `root` 是否指向 `/var/www/blog_firefly/dist`，`dist/index.html` 是否存在 |
| 相册页为空或封面 404 | `public/gallery/net`、`public/gallery/scenery` 是否有图片，是否在**上传图片后**重新构建 |
| 图片 403 | 目录权限；确保 `public/gallery` 对运行 Nginx 的用户可读 |
| 新文章不显示 | 是否上传到 `src/content/posts/`，是否在服务器执行了 `pnpm build` |
| 搜索无结果 | 是否使用完整 `pnpm build`（包含 Pagefind），而不是仅 `astro build` |
| `pnpm build` 被杀 | 内存不足，增加 swap 或升级服务器 |
| `git pull` 冲突 | 先还原 `src/constants/lqips.json`、`src/constants/github-card-data.json` |
| `git clean -fdx` 后相册消失 | 该命令会删除未入库文件；从备份恢复 `public/gallery` |
| `git clean -fdx` 后文章/动态消失 | 同上，`src/content/posts`、`src/content/dynamic` 也不在 Git 中，需从备份恢复 |
| 动态上传后页面没变 | 是否上传到了服务器 `src/content/dynamic/`，是否在服务器执行了 `pnpm build` |
| 页面样式错乱 | 是否直接修改了 `dist/`；应修改 `src/` 后重新构建 |
| 刷新后样式丢失，控制台 404 `Layout.*.css` | 旧 HTML 引用了已删除的哈希资源。确认 HTML 响应为 `Cache-Control: no-cache`；频繁部署时可选用 4.3 节的“保留上一版哈希资源” |
| 构建报 `CannotFetchFontFile` / 字体下载失败 | 多为服务器访问 `cdn.jsdelivr.net` 临时失败，可先重试；持续失败时考虑自托管字体或配置可用的网络代理 |

---

## 9. 当前已确认配置

| 项 | 值 |
| --- | --- |
| 公网 IP | `124.223.166.233` |
| `siteConfig.site_url` | `http://124.223.166.233` |
| 部署分支 | `migrate/blog` |
| 仓库 | `https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git` |
| 克隆方式 | 稀疏浅克隆（`--filter=blob:none --sparse`，不检出 `public/pio`） |
| Nginx root | `/var/www/blog_firefly/dist` |
| 相册目录 | `/var/www/blog_firefly/public/gallery/{net,scenery,two-dimensional}` |
| 不入 Git 的内容 | `src/content/posts/`、`src/content/dynamic/`、`public/gallery/`、`public/assets/music/` |
| 页面开关 | 动态、相册、关于开启；友链、留言、项目、书签、打赏、追番等关闭 |
| 评论 | 未启用（`commentConfig.type = "none"`） |
| 访问协议 | HTTP（无域名，暂不启用 HTTPS） |

---

## 10. 首次部署执行清单

- [x] 服务器已安装 Node >= 22.23.0、pnpm 11.22.0、Git、rsync、Nginx
- [x] 云安全组与系统防火墙已放行 80 端口
- [x] 仓库已克隆到 `/var/www/blog_firefly`，并切换到 `migrate/blog`
- [x] `pnpm install --frozen-lockfile` 成功
- [x] `public/gallery/net`、`public/gallery/scenery` 图片已上传（3 + 8 张）
- [ ] `src/content/posts/`、`src/content/dynamic/` 内容已上传（两目录不入 Git）
- [x] `siteConfig.site_url` 为 `http://124.223.166.233`
- [x] `pnpm build` 成功，`dist/`、`dist/pagefind/` 已生成
- [x] Nginx 配置已写入并通过 `nginx -t`
- [ ] 首页、文章、相册、动态、RSS、Sitemap、404 均验证通过
- [ ] `src/content/` 与 `public/gallery` 已做第一份备份
