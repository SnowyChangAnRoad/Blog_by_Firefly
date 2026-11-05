# Firefly 博客服务器部署文档

> 目标服务器：`124.223.166.233`
>
> 部署形态：云服务器 + Nginx 静态托管，运行时不依赖 Node、Python 或数据库。
>
> 适用分支：`migrate/blog`（迁移完成后可合并回 `master`）
>
> 本文按“首次部署 → 验收 → 日常发文 → 备份回滚”的顺序编写，命令可直接复制执行。示例默认使用 `root` 登录服务器；若使用普通用户，请保证 `/var/www/firefly` 归该用户所有，并在需要时加 `sudo`。

---

## 1. 部署概览

```text
本地 Windows（写 Markdown、维护相册）
        │  scp / rsync 上传文章、配置、相册原图
        ▼
云服务器 124.223.166.233
/var/www/firefly/          # Git 仓库
├─ src/content/posts/      # 文章
├─ public/gallery/        # 相册原图（不入 Git，必须单独上传）
├─ dist/                  # 构建产物，Nginx 的 root
└─ node_modules/
        │  pnpm build
        ▼
Nginx 读取 dist/，对外提供 http://124.223.166.233
```

关键约定：

- **构建必须在服务器上执行**，因为相册图片只存在于服务器 `public/gallery/`。
- `public/gallery/` 已被 `.gitignore` 忽略，`git pull` 不会覆盖或删除它。
- **禁止在服务器执行 `git clean -fdx`**，否则会删除未入库的相册原图。
- 站点使用尾斜杠（`/posts/hello-world/`），站内链接都带 `/`。
- 当前无域名，只能使用 HTTP；`site_url` 已设为 `http://124.223.166.233`。

---

## 2. 服务器前置

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

仓库已 Fork，公开可读，直接使用 HTTPS 克隆即可：

```bash
sudo mkdir -p /var/www/firefly
sudo chown -R $USER:$USER /var/www/firefly

git clone https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git /var/www/firefly
cd /var/www/firefly
git switch migrate/blog
git log --oneline -3
```

如果使用 `git@github.com:...` 形式，需要先在服务器生成 SSH key 并添加到 GitHub 仓库的 Deploy Key。

### 步骤 2：安装依赖

```bash
cd /var/www/firefly
pnpm install --frozen-lockfile
```

项目通过 `preinstall` 强制使用 pnpm，不要改用 npm 或 yarn。

### 步骤 3：上传相册原图

相册原图不在 Git 仓库中，**必须先上传再构建**，否则相册页只有空列表、封面 404。

服务器上先建目录：

```bash
mkdir -p /var/www/firefly/public/gallery/net
mkdir -p /var/www/firefly/public/gallery/scenery
```

在本地 Windows PowerShell 执行（当前工作区已有一份可用的 `public/gallery`）：

```powershell
scp -r .\public\gallery\net\* root@124.223.166.233:/var/www/firefly/public/gallery/net/
scp -r .\public\gallery\scenery\* root@124.223.166.233:/var/www/firefly/public/gallery/scenery/
```

如果本机安装了 `rsync`：

```bash
rsync -avz public/gallery/net/ root@124.223.166.233:/var/www/firefly/public/gallery/net/
rsync -avz public/gallery/scenery/ root@124.223.166.233:/var/www/firefly/public/gallery/scenery/
```

上传后确认：

```bash
ls /var/www/firefly/public/gallery/net
ls /var/www/firefly/public/gallery/scenery
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
cd /var/www/firefly
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

创建 `/etc/nginx/conf.d/firefly.conf`：

```nginx
server {
    listen 80;
    server_name 124.223.166.233;

    root /var/www/firefly/dist;
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

### 步骤 7：线上验收

```bash
curl -I http://124.223.166.233/
curl -I http://124.223.166.233/posts/hello-world/
curl -I http://124.223.166.233/gallery/
curl -I http://124.223.166.233/gallery/net/
curl -I http://124.223.166.233/gallery/net/01-moon.jpg
curl -I http://124.223.166.233/rss.xml
curl -I http://124.223.166.233/sitemap-index.xml
```

预期均为 `HTTP/1.1 200 OK`。再检查：

```bash
curl -I http://124.223.166.233/not-exist-page
# 预期 404，并返回自定义 404 页面
```

浏览器逐项确认：

- [ ] 首页显示 4 篇文章，无演示文章
- [ ] `/posts/hello-world/`、`/posts/dev-log/`、`/posts/pandemic-memories/`、`/posts/courage-and-happiness/` 可访问
- [ ] 文章换行、表格、代码块、引用正常
- [ ] `/archive/`、`/categories/`、`/tags/`、`/series/` 正常
- [ ] `/gallery/` 只显示「好看的网图」「风景」
- [ ] `/gallery/net/` 图片顺序为 moon → sovgirl1 → sovgirl2
- [ ] `/gallery/scenery/` 顺序为 build_1…4 → flowers_1…2 → school_lake_1 → gools_1
- [ ] 灯箱可打开，移动端瀑布流正常
- [ ] `/about/` 显示占位内容
- [ ] 友链、留言、动态、项目、书签、打赏入口不存在
- [ ] `/rss.xml`、`/atom.xml`、`/sitemap-index.xml`、`/robots.txt` 可访问
- [ ] `/search/` 能搜索到 4 篇文章
- [ ] 查看网页源码，canonical / OG 链接为 `http://124.223.166.233/...`

---

## 4. 日常更新文章

Firefly 是静态站点，**上传 Markdown 后必须重新构建**才会生效，不能像旧 FastAPI 那样“放进去就能看”。

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
scp -r .\src\content\posts\* root@124.223.166.233:/var/www/firefly/src/content/posts/
```

或使用 rsync（不删除服务器上的其他文章）：

```bash
rsync -avz src/content/posts/ root@124.223.166.233:/var/www/firefly/src/content/posts/
```

### 4.3 服务器构建

```bash
ssh root@124.223.166.233
cd /var/www/firefly
pnpm build
```

构建前建议备份上一版产物：

```bash
cp -a dist dist.bak
```

Nginx 直接读取 `dist/`，不需要重启 Nginx。

### 4.4 其他更新

| 修改内容 | 操作 |
| --- | --- |
| 新增相册图片 | 上传到 `public/gallery/<albumId>/`，然后 `pnpm build` |
| 修改站点配置 | 上传 `src/config/*` 对应文件，然后 `pnpm build` |
| 修改依赖 | 服务器先 `pnpm install`，再 `pnpm build` |
| 删除文章 | 本地删除后，服务器手动删除对应文件，再 `pnpm build` |
| 修改相册封面/名称 | 修改 `src/config/galleryConfig.ts`，上传后重新构建 |

> `scp` / `rsync` 默认不会删除服务器上多出来的旧文件，删除文章需要手动处理。

---

## 5. 用 Git 更新模板代码

服务器仓库也可以直接 `git pull` 同步模板更新。由于构建会改写生成文件，拉取前先还原它们：

```bash
cd /var/www/firefly

# 构建会改写这些生成文件，先还原避免 pull 冲突
git checkout -- src/constants/lqips.json src/constants/github-card-data.json

git pull

# package.json / pnpm-lock.yaml 有变化时
pnpm install --frozen-lockfile

pnpm build
```

注意事项：

- 不要执行 `git clean -fdx`。
- 如果 `git pull` 仍提示本地修改冲突，先 `git status` 确认是不是构建生成文件，再按上面的方式还原。
- 如果后续频繁用 Git 更新，可给生成文件设置 `skip-worktree`，但首次部署不必处理。

---

## 6. 备份与回滚

### 6.1 备份

```bash
cd /var/www/firefly

# 相册原图（最重要，不在 Git 中）
tar -czf ~/firefly-gallery-$(date +%F).tar.gz public/gallery

# 上一版构建产物
cp -a dist dist.bak

# Nginx 配置
sudo cp /etc/nginx/conf.d/firefly.conf ~/firefly-nginx-$(date +%F).conf
```

建议定期把 `~/firefly-gallery-*.tar.gz` 下载到本地或对象存储。

### 6.2 回滚

如果新构建异常：

```bash
cd /var/www/firefly
rm -rf dist
mv dist.bak dist
sudo systemctl reload nginx
```

如果代码层面异常：

```bash
cd /var/www/firefly
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
| 首页 404 | Nginx `root` 是否指向 `/var/www/firefly/dist`，`dist/index.html` 是否存在 |
| 相册页为空或封面 404 | `public/gallery/net`、`public/gallery/scenery` 是否有图片，是否在**上传图片后**重新构建 |
| 图片 403 | 目录权限；确保 `public/gallery` 对运行 Nginx 的用户可读 |
| 新文章不显示 | 是否上传到 `src/content/posts/`，是否在服务器执行了 `pnpm build` |
| 搜索无结果 | 是否使用完整 `pnpm build`（包含 Pagefind），而不是仅 `astro build` |
| `pnpm build` 被杀 | 内存不足，增加 swap 或升级服务器 |
| `git pull` 冲突 | 先还原 `src/constants/lqips.json`、`src/constants/github-card-data.json` |
| `git clean -fdx` 后相册消失 | 该命令会删除未入库文件；从备份恢复 `public/gallery` |
| 页面样式错乱 | 是否直接修改了 `dist/`；应修改 `src/` 后重新构建 |

---

## 9. 当前已确认配置

| 项 | 值 |
| --- | --- |
| 公网 IP | `124.223.166.233` |
| `siteConfig.site_url` | `http://124.223.166.233` |
| 部署分支 | `migrate/blog` |
| 仓库 | `https://github.com/SnowyChangAnRoad/Blog_by_Firefly.git` |
| Nginx root | `/var/www/firefly/dist` |
| 相册目录 | `/var/www/firefly/public/gallery/{net,scenery}` |
| 页面开关 | 相册、关于开启；友链、留言、动态、项目、书签、打赏、追番等关闭 |
| 评论 | 未启用（`commentConfig.type = "none"`） |
| 访问协议 | HTTP（无域名，暂不启用 HTTPS） |

---

## 10. 首次部署执行清单

- [ ] 服务器已安装 Node >= 22.23.0、pnpm 11.22.0、Git、rsync、Nginx
- [ ] 云安全组与系统防火墙已放行 80 端口
- [ ] 仓库已克隆到 `/var/www/firefly`，并切换到 `migrate/blog`
- [ ] `pnpm install --frozen-lockfile` 成功
- [ ] `public/gallery/net`、`public/gallery/scenery` 图片已上传（3 + 8 张）
- [ ] `siteConfig.site_url` 为 `http://124.223.166.233`
- [ ] `pnpm build` 成功，`dist/`、`dist/pagefind/` 已生成
- [ ] Nginx 配置已写入并通过 `nginx -t`
- [ ] 首页、4 篇文章、2 个相册、RSS、Sitemap、404 均验证通过
- [ ] `public/gallery` 已做第一份备份
