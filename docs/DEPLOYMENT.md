# Firefly 博客服务器部署文档

> 目标服务器：`124.223.166.233`
>
> 部署形态：云服务器 + Nginx 静态托管，运行时不依赖 Node、Python 或数据库。
>
> 适用分支：`migrate/blog`（迁移完成后可合并回 `master`）
>
> **本文只讲首次部署**：服务器前置、克隆、构建、Nginx、验收、域名切换，以及 Artalk / Umami 的一次性安装。
>
> **日常维护**（发布文章、更新动态、维护相册与音乐、更新模板代码、备份回滚、排错）见 [MAINTENANCE.md](MAINTENANCE.md)。
>
> 示例默认使用 `ubuntu` 普通用户登录（`ssh ubuntu@124.223.166.233`）。系统级操作（安装软件、修改 Nginx、重启服务）均标注 `sudo`；克隆、安装依赖、构建以 `ubuntu` 身份执行，不需要 `sudo`。

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
   ├─ /stats   → 127.0.0.1:3001   Umami 仪表盘（systemd: umami.service）
   └─ :8080    → 127.0.0.1:23366  Artalk 评论 API（systemd: artalk.service）
```

关键约定：

- **构建必须在服务器上执行**，因为文章、动态、相册都只存在于服务器的内容目录中。
- `src/content/posts/`、`src/content/dynamic/`、`public/gallery/` 均已被 `.gitignore` 忽略，`git pull` 不会覆盖或删除它们。
- **禁止在服务器执行 `git clean -fdx`**，否则会删除未入库的文章、动态和相册原图。
- 站点使用尾斜杠（`/posts/hello-world/`），站内链接都带 `/`。
- 当前无域名，只能使用 HTTP；`site_url` 已设为 `http://124.223.166.233`。
- 服务器使用**稀疏浅克隆**：`public/pio` 未检出（看板娘已关闭，构建不需要），`public/gallery` 始终不在 Git 中。维护约定见 3.2 节与 [MAINTENANCE.md](MAINTENANCE.md)。
- 评论（Artalk，SQLite）与访问统计（Umami，PostgreSQL）都是独立后端服务，站点本身仍是纯静态；两者的数据目录都在服务器本地，需要单独备份，见第 8、9 节。
- 侧边栏「站点统计」的累计访客数 / 浏览量由构建期的 `scripts/fetch-umami-stats.ts` 查 Umami 库生成，依赖服务器上的 `~/.umami-stats.env`；未配置时这两项不渲染，构建不受影响。详见第 9 节。

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
| Node.js | >= 22.23.0，用于构建博客与运行 Umami |
| pnpm | 11.22.0，通过 corepack 启用 |
| Git | 拉取代码 |
| rsync / scp | 上传文章与相册 |
| Nginx | 静态托管、`/stats` 反代、Artalk 8080 反代 |
| PostgreSQL | 仅 Umami 访问统计使用，见第 9 节与 [UMAMI_PLAN.md](UMAMI_PLAN.md) |

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

> 后续更新代码时不要直接 `git pull`，用 [MAINTENANCE.md](MAINTENANCE.md) 中「更新模板代码」的浅拉取命令。
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
> 建议长期备份 `public/gallery/`，它不受 Git 保护。图片压缩与后续增量上传流程见 [MAINTENANCE.md](MAINTENANCE.md)。

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

构建会依次生成访问量快照、LQIP、Astro 静态页面、字体子集、Pagefind 搜索索引。完成后确认：

```bash
ls dist/index.html
ls dist/posts
ls dist/gallery/net dist/gallery/scenery
ls dist/pagefind
```

访问量快照依赖 `~/.umami-stats.env`（见第 9 节）。首次部署 Umami 之前没有该文件，构建会打印 `[UMAMI-STATS] 未设置 UMAMI_DATABASE_URL，跳过访问量统计`，属正常现象，侧边栏不会显示这两项。

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

### 3.2 稀疏克隆后的目录范围

如果使用了 `--filter=blob:none --sparse` 做稀疏克隆，服务器仓库**只检出以下目录**：

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

启用看板娘、上游新增顶层目录、更新代码时的稀疏检出约定，见 [MAINTENANCE.md](MAINTENANCE.md) 的「稀疏克隆维护约定」。

---

## 4. 后续切换域名

当前只有公网 IP，只能使用 HTTP。后续有域名时：

1. 域名解析 A 记录指向 `124.223.166.233`。
2. 修改 `src/config/siteConfig.ts`：

   ```ts
   site_url: "https://<域名>",
   ```

3. 修改 Nginx 与统计相关配置：

   ```nginx
   server_name <域名>;
   ```

   同时把 `src/config/analyticsConfig.ts` 里的 `scriptUrl`、`replaysScriptUrl` 从 `http://124.223.166.233/stats/...` 改成 `https://<域名>/stats/...`，否则 HTTPS 页面会按混合内容拦截统计脚本。

4. 申请证书并启用 HTTPS：

   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d <域名>
   ```

5. 重新构建：`pnpm build`。
6. 确认 80 端口跳转到 443。
7. 视需要更新 Artalk 的 `trusted_domains`（见第 8 节）。

> `site_url` 改动后必须重新构建，否则 RSS、Sitemap、canonical 仍指向旧地址。

---

## 5. 常见问题

| 现象 | 排查 |
| --- | --- |
| 首页 502/无法连接 | Nginx 是否启动、80 端口是否放行、云安全组是否开放 |
| 首页 404 | Nginx `root` 是否指向 `/var/www/blog_firefly/dist`，`dist/index.html` 是否存在 |
| 构建报 `CannotFetchFontFile` / 字体下载失败 | 多为服务器访问 `cdn.jsdelivr.net` 临时失败，可先重试；持续失败时考虑自托管字体或配置可用的网络代理 |
| `/stats` 返回 404 | Nginx `location` 必须写 `/stats`（无尾斜杠）；写成 `/stats/` 时 Next 重定向到 `/stats` 后会落空 |
| Umami 图表时间偏移 | 检查 `/etc/umami.env` 的 `TZ=Asia/Shanghai`、系统时区、后台站点时区，见 [UMAMI_ISSUES.md](UMAMI_ISSUES.md) |
| Umami Realtime 空白 | 确认用 standalone server 启动、Nginx 已关 `proxy_buffering`，见 [UMAMI_ISSUES.md](UMAMI_ISSUES.md) |
| 侧边栏没有访问量 | 服务器是否配置 `~/.umami-stats.env`，构建日志是否有 `[UMAMI-STATS]` 输出 |

内容发布、相册、搜索、构建、Git 更新相关的问题见 [MAINTENANCE.md](MAINTENANCE.md) 的常见问题。

---

## 6. 当前已确认配置

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
| 页面开关 | 动态、相册、关于、留言板开启；友链、项目、书签、打赏等关闭 |
| 评论 | Artalk，留言板与文章启用，动态评论关闭 |
| Artalk 后端 | `http://124.223.166.233:8080` → `127.0.0.1:23366`（systemd） |
| Umami 后端 | `127.0.0.1:3001`（systemd `umami.service`，standalone server），Nginx 反代到 `/stats` |
| Umami 数据 | 本机 PostgreSQL，库 `umami` |
| Umami Website ID | `320a53f1-31c8-426b-9c13-d0d2b5ec9a17` |
| 访问量快照 | `~/.umami-stats.env` → `src/constants/umami-stats.json`（已 gitignore） |
| 访问协议 | HTTP（无域名，暂不启用 HTTPS） |

---

## 7. 首次部署执行清单

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
- [ ] Umami 已部署：`umami.service` active、`curl -I http://127.0.0.1:3001/stats` 返回 200、`/stats` 可登录
- [ ] `~/.umami-stats.env` 已配置，`pnpm build` 输出 `[UMAMI-STATS]` 且侧边栏显示访问量

---

## 8. Artalk 评论系统（留言板 + 文章）

评论后端单独运行，站点仍是纯静态；`commentConfig.type = "artalk"`，前端向 `http://124.223.166.233:8080` 请求 API。

### 8.1 安装二进制

```bash
uname -m    # x86_64 对应 linux_amd64

URL=$(curl -s https://api.github.com/repos/ArtalkJS/Artalk/releases/latest \
  | grep browser_download_url | grep -E 'linux_amd64.*tar\.gz' | cut -d '"' -f 4)
echo "$URL"

cd /tmp
curl -LO "$URL"
tar -zxvf artalk_*linux_amd64*.tar.gz
sudo mv artalk /usr/bin/artalk
artalk version
```

### 8.2 创建运行用户与目录

```bash
sudo groupadd --system artalk
sudo useradd --system --gid artalk --create-home \
  --home-dir /var/lib/artalk --shell /usr/sbin/nologin \
  --comment "Artalk server" artalk

sudo mkdir -p /etc/artalk /var/lib/artalk/data
```

### 8.3 配置文件

```bash
sudo /usr/bin/artalk gen conf -lang zh-CN /etc/artalk/artalk.yml
sudo nano /etc/artalk/artalk.yml
```

关键项：

```yaml
app_key: <随机长字符串>
locale: zh-CN
timezone: Asia/Shanghai

db:
  type: sqlite
  file: ./data/artalk.db

host: 127.0.0.1
port: 23366

site_default: SnowyChangAnRoad

trusted_domains:
  - http://124.223.166.233
```

- `site_default` 必须与 `siteConfig.title` 完全一致，否则后台看不到评论。
- `trusted_domains` 写前端站点地址，80 端口不用写端口号。以后换 IP 或域名必须同步修改并重启。

权限：

```bash
sudo chown -R artalk:artalk /var/lib/artalk
sudo chown root:artalk /etc/artalk/artalk.yml
sudo chmod 640 /etc/artalk/artalk.yml
```

### 8.4 systemd 服务

`/etc/systemd/system/artalk.service`：

```ini
[Unit]
Description=Artalk
Documentation=https://artalk.js.org
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=simple
User=artalk
Group=artalk
ExecStart=/usr/bin/artalk server -w /var/lib/artalk -c /etc/artalk/artalk.yml
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s QUIT $MAINPID
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now artalk
systemctl status artalk --no-pager
curl -I http://127.0.0.1:23366/
```

### 8.5 创建管理员

```bash
sudo -u artalk /usr/bin/artalk admin -w /var/lib/artalk -c /etc/artalk/artalk.yml
```

按提示设置用户名与密码，密码会以哈希形式存入数据库。

### 8.6 Nginx 8080 反向代理

`/etc/nginx/conf.d/artalk.conf`：

```nginx
server {
    listen 8080;
    server_name 124.223.166.233;

    location / {
        proxy_redirect off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://127.0.0.1:23366/;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

云安全组放行 TCP 8080；Ubuntu 还要 `sudo ufw allow 8080/tcp`。

验证：

```bash
curl -I http://124.223.166.233:8080/
```

再用手机流量访问一次，确认非 80/443 端口没有被运营商或公共网络拦截。

### 8.7 前端配置（仓库内）

| 文件 | 值 |
| --- | --- |
| `src/config/commentConfig.ts` | `type: "artalk"`，`artalk.server: "http://124.223.166.233:8080"` |
| `src/config/siteConfig.ts` | `pages.guestbook: true` |
| `src/config/navBarConfig.ts` | 导航包含「留言」 |
| `src/config/dynamicConfig.ts` | `showComment: false` |
| `src/components/comment/Artalk.astro` | 使用 npmmirror 2.10.1 的 CSS/JS |

修改后按 [MAINTENANCE.md](MAINTENANCE.md) 的发布流程同步到服务器并 `pnpm build`。

### 8.8 备份与排错

备份评论数据：

```bash
sudo systemctl stop artalk
sudo cp /var/lib/artalk/data/artalk.db ~/artalk-$(date +%F).db
sudo systemctl start artalk
```

| 现象 | 排查 |
| --- | --- |
| 评论区空白 | `curl -I http://IP:8080/` 是否 200；浏览器控制台是否有 CORS 报错；`trusted_domains` 是否为 `http://124.223.166.233` |
| 后台看不到评论 | `site_default` 与 `siteConfig.title` 是否一致 |
| 修改配置不生效 | `sudo systemctl restart artalk` |
| 换 IP / 域名后评论失效 | 同步更新 `trusted_domains`、`commentConfig.artalk.server`、`siteConfig.site_url`，重启 Artalk 并重新构建 |
| 垃圾评论 | 在 Artalk 后台开启评论审核或验证码 |

注意：当前站点为 HTTP，管理员密码与会话明文传输，请使用独立强密码，避免在公共网络登录后台；长期建议启用 HTTPS。

---

## 9. Umami 访问统计

访问统计后端独立运行，站点仍是纯静态。完整步骤、构建期踩坑与排错见 [UMAMI_PLAN.md](UMAMI_PLAN.md)，未解决的问题记录在 [UMAMI_ISSUES.md](UMAMI_ISSUES.md)。

### 9.1 运行形态

| 项 | 值 |
| --- | --- |
| 源码 | `/opt/umami`，`output: standalone` |
| 启动 | systemd `umami.service`：`node .next/standalone/server.js` |
| 监听 | `127.0.0.1:3001`（未暴露公网） |
| 数据库 | 本机 PostgreSQL，库 `umami` |
| 入口 | Nginx `location /stats` → `http://124.223.166.233/stats` |
| 前端 | `src/config/analyticsConfig.ts` 的 `umamiAnalytics` |

### 9.2 环境文件

`/etc/umami.env`（root 600）：`BASE_PATH=/stats`、`DATABASE_URL`、`APP_SECRET`、`PORT=3001`、`HOSTNAME=127.0.0.1`、`HOME=/home/ubuntu`、`TZ=Asia/Shanghai`。

启动命令必须是 standalone server：

```ini
ExecStart=/usr/bin/node /opt/umami/.next/standalone/server.js
```

用 `pnpm start`（`next start`）会提示 `does not work with "output: standalone"`，并导致实时图表异常。

### 9.3 Nginx 反代

站点配置文件顶部（`server {}` 之外）定义 map：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

在 `server {}` 内加入：

```nginx
# 不要写成 /stats/，Next.js 会把 /stats/ 重定向到 /stats
location /stats {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I http://124.223.166.233/stats      # 期望 200
```

### 9.4 构建期访问量快照

侧边栏「站点统计」的累计访客数 / 浏览量由 `scripts/fetch-umami-stats.ts` 在 `pnpm build` 开始时查库生成，写入 `src/constants/umami-stats.json`（已 gitignore）。

`~/.umami-stats.env`（ubuntu 600）：

```ini
UMAMI_DATABASE_URL=postgresql://umami:数据库密码@localhost:5432/umami
UMAMI_WEBSITE_ID=320a53f1-31c8-426b-9c13-d0d2b5ec9a17
```

构建前加载：`set -a; . ~/.umami-stats.env; set +a`。

### 9.5 排错要点

| 现象 | 处理 |
| --- | --- |
| `/stats` 404 | `location` 写 `/stats`，不能带尾斜杠 |
| 前端资源 404 / 页面错乱 | 必须用 standalone server 启动，并确认 `.next/standalone/.next/static`、`public` 已复制 |
| 图表时间偏移 | 系统时区、`/etc/umami.env` 的 `TZ`、后台站点时区三处都要为东八区 |
| Realtime 空白 | Nginx 需 `proxy_buffering off` + `proxy_read_timeout`，且必须 standalone 启动 |
| 侧边栏无数字 | 是否加载了 `~/.umami-stats.env`，构建日志有无 `[UMAMI-STATS]` |

### 9.6 备份

```bash
pg_dump "postgresql://umami:密码@localhost:5432/umami" | gzip > ~/umami-$(date +%F).sql.gz
```

---

## 10. 相关文档

| 文档 | 内容 |
| --- | --- |
| [MAINTENANCE.md](MAINTENANCE.md) | 日常维护：发布文章、动态、相册、音乐、模板更新、备份回滚、排错 |
| [TEMPLATE.md](TEMPLATE.md) | 模板结构、配置项、内容模型 |
| [UMAMI_PLAN.md](UMAMI_PLAN.md) | Umami 接入细节与踩坑 |
| [ARTALK_PLAN.md](ARTALK_PLAN.md) | Artalk 接入细节 |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | 旧站迁移历史归档 |
