# Artalk 评论系统接入临时文档

> 用途：记录本次接入的决策、服务器步骤与仓库改动，防止上下文丢失。
> 站点：`http://124.223.166.233`（无域名，HTTP）
> 编写日期：2026-11-15

## 一、已确认决策

| 项 | 选择 |
| --- | --- |
| 后端部署 | 二进制 + systemd |
| 评论范围 | 留言板 + 文章（动态评论关闭） |
| 前端资源 | npmmirror，固定 Artalk 2.10.1 |
| 后端地址 | `http://124.223.166.233:8080`（Nginx 反代到 `127.0.0.1:23366`） |
| 后台入口 | `http://124.223.166.233:8080/` |

## 二、最终结构

```text
站点   http://124.223.166.233/         Nginx :80   → /var/www/blog_firefly/dist
Artalk http://124.223.166.233:8080/    Nginx :8080 → 127.0.0.1:23366
                                             ↓
                               /usr/bin/artalk（systemd: artalk.service）
                               /etc/artalk/artalk.yml
                               /var/lib/artalk/data/artalk.db（SQLite）
```

## 三、服务器步骤（按顺序执行）

### 1. 安装二进制

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

### 2. 创建用户与目录

```bash
sudo groupadd --system artalk
sudo useradd --system --gid artalk --create-home \
  --home-dir /var/lib/artalk --shell /usr/sbin/nologin \
  --comment "Artalk server" artalk

sudo mkdir -p /etc/artalk /var/lib/artalk/data
```

### 3. 生成并修改配置

```bash
sudo /usr/bin/artalk gen conf -lang zh-CN /etc/artalk/artalk.yml
sudo nano /etc/artalk/artalk.yml
```

必须确认：

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

`site_default` 必须等于前端 `siteConfig.title`，否则后台看不到评论。

权限：

```bash
sudo chown -R artalk:artalk /var/lib/artalk
sudo chown root:artalk /etc/artalk/artalk.yml
sudo chmod 640 /etc/artalk/artalk.yml
```

### 4. systemd

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

### 5. 创建管理员

```bash
sudo -u artalk /usr/bin/artalk admin -w /var/lib/artalk -c /etc/artalk/artalk.yml
```

### 6. Nginx 8080 反代

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

### 7. 放行 8080

- 云安全组放行 TCP 8080
- Ubuntu：`sudo ufw allow 8080/tcp`
- 验证：`curl -I http://124.223.166.233:8080/`
- 手机流量再测一次，确认非 80/443 端口未被运营商/公共网络拦截

## 四、仓库改动清单

| 文件 | 改动 |
| --- | --- |
| `src/config/commentConfig.ts` | `type: "artalk"`；`artalk.server: "http://124.223.166.233:8080"`；`locale: "zh-CN"`；`visitorCount: true` |
| `src/config/siteConfig.ts` | `pages.guestbook: true` |
| `src/config/navBarConfig.ts` | 「动态」后新增 `links.push(LinkPresets.Guestbook)` |
| `src/config/dynamicConfig.ts` | `showComment: false` |
| `src/components/comment/Artalk.astro` | CSS/JS 改为 `https://registry.npmmirror.com/artalk/2.10.1/files/dist/Artalk.css` 与 `Artalk.mjs` |
| `docs/DEPLOYMENT.md` | 增补 Artalk 部署、备份、排错章节 |

不改文章 frontmatter：`content.config.ts` 中 `comment` 默认 `true`，当前 14 篇文章全部显示评论。若某篇不想开放评论，在该文章 frontmatter 加 `comment: false`。

不改用户未提交的 `src/config/backgroundWallpaper.ts`、`src/config/profileConfig.ts`。

## 五、验证

1. 本地 `pnpm check`、`pnpm type-check`、`pnpm build`。
2. 上传改动 → 服务器 `pnpm build`。
3. `http://124.223.166.233:8080/` 能登录后台。
4. `/guestbook/`：导航有「留言」，能发评论、刷新仍在、后台可见。
5. `/posts/hello-world/` 等文章页有评论区；如需关闭某篇，在 frontmatter 加 `comment: false`。
6. `/dynamic/` 无评论区。
7. 浏览器控制台无 CORS 报错。

## 六、风险与后续

| 项 | 说明 |
| --- | --- |
| HTTP 明文 | 管理员密码与会话明文传输；长期应上 HTTPS |
| 8080 被拦 | 公司/校园网可能只放行 80/443，评论区会空白 |
| 后台暴露 | `:8080` 会被扫描，必须强密码；后续可加验证码/审核 |
| 数据备份 | `/var/lib/artalk/data/artalk.db` 与 `public/gallery` 一起备份 |
| 换域名 | 同时改 `trusted_domains`、`siteConfig.site_url`、Nginx，重启 Artalk 并重新构建 |
| 评论数据 | `pageKey` 存相对路径，换域名不会丢失评论归属 |
| IP 证书 | Let's Encrypt 已支持 IP 证书（6 天有效期），需要时再启用 |

## 七、回滚

1. 仓库：`commentConfig.type` 改回 `"none"`，`guestbook` 改回 `false`，移除导航项，`showComment` 改回 `true`，重新构建。
2. 服务器：`sudo systemctl disable --now artalk`，删除或停用 `/etc/nginx/conf.d/artalk.conf`。
3. 评论数据保留在 `/var/lib/artalk/data/artalk.db`，不会随站点回滚丢失。
