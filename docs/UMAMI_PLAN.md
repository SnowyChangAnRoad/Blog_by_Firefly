# Umami 访问统计接入文档

> 用途：记录本次接入的决策、服务器步骤与仓库改动，防止上下文丢失。
> 站点：`http://124.223.166.233`（无域名，HTTP）
> 编写日期：2026-11-15

## 一、已确认决策

| 项 | 选择 |
| --- | --- |
| 统计方案 | 自建 Umami 2.x |
| 部署方式 | 不用 Docker：apt 安装 PostgreSQL + 源码构建 + systemd |
| 访问入口 | `http://124.223.166.233/stats/`（Nginx 反代到 `127.0.0.1:3001`） |
| 统计粒度 | 全站 UV / PV + 每篇文章 UV / PV |
| 查看方式 | Umami 自带网页仪表盘 |
| 内存保护 | 增加 2 GB swap，避免构建期 OOM |
| 与 Artalk 关系 | 互不依赖；Artalk 继续负责评论与单篇 PV 显示 |

UV 口径：Umami 不保存原始 IP，服务端按「IP + UA + 每日盐」生成访客标识后去重，等价于日 UV。

## 二、最终结构

```text
站点    http://124.223.166.233/          Nginx :80   → /var/www/blog_firefly/dist
统计    http://124.223.166.233/stats/    Nginx :80   → 127.0.0.1:3001（同站点配置内的 location）
                                             ↓
                               pnpm start（systemd: umami.service）
                               /opt/umami（源码 + .next）
                               PostgreSQL 本地库 umami:5432
```

内存预估（4 GB 机器，常驻约 500–800 MB）：

| 组件 | 常驻内存 |
| --- | --- |
| 系统 + Nginx | 150–250 MB |
| Artalk | 50–100 MB |
| Umami（Node） | 200–300 MB |
| PostgreSQL | 80–150 MB |

## 三、服务器步骤（按顺序执行）

### 1. 先加 swap

构建 Umami 时 Next.js 峰值约 1.5–2 GB，先加 swap 兜底：（手动创建一个 2GB 的 Swap 交换文件，并启用它、设置开机自动启用，最后查看内存和 Swap 使用情况。）

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

确认磁盘至少还有 3 GB 空闲：`df -h /`。

### 2. 安装 PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
psql --version          # 需要 >= 12
```

建库建用户（密码换成自己的强密码）：

```bash
sudo -u postgres psql -c "CREATE USER umami WITH PASSWORD '换成强密码';"
sudo -u postgres psql -c "CREATE DATABASE umami OWNER umami;"
```

验证：

```bash
psql "postgresql://umami:换成强密码@localhost:5432/umami" -c "select 1;"
```

### 3. 拉取源码并构建

```bash
sudo mkdir -p /opt/umami && sudo chown "$USER":"$USER" /opt/umami
git clone https://github.com/umami-software/umami.git /opt/umami
cd /opt/umami
git tag --sort=-v:refname | head -5     # 选最新稳定 tag
git checkout <上一步选中的 tag>

pnpm install
```

`BASE_PATH` 会被编译进前端资源路径，**必须在 build 前导出**：

```bash
export BASE_PATH=/stats
export DATABASE_TYPE=postgresql
export DATABASE_URL="postgresql://umami:换成强密码@localhost:5432/umami"
export APP_SECRET=$(openssl rand -hex 32)
echo "$APP_SECRET" > /tmp/umami-app-secret   # 后面写进环境文件

pnpm build
```

> 子脚本名称（`build:app`、`build:geo`、`build:recorder`、`postbuild` 等）随 Umami 版本变化，以 `grep -n '"build' package.json` 的输出为准。

构建成功后的判定：

```bash
ls -la .next/BUILD_ID

# 确认 BASE_PATH 已被编译进产物，期望输出 "/stats"
node -e "console.log(JSON.stringify(require('./.next/routes-manifest.json').basePath))"
```

> 如果输出是 `""` 或 `undefined`，说明构建时没有读到 `BASE_PATH`，需要按第 4 步的 `/etc/umami.env` 重新构建。

#### 卡在 `node scripts/build-geo.js`

现象：日志停在 `Saved geo database: /opt/umami/geo/GeoLite2-City.mmdb`，进程常驻但 CPU 接近 0，`ss -tnp` 看不到网络连接。

原因：GeoIP 库已下载完成，脚本收尾阶段挂住（DNS/句柄未释放）。数据库文件已可用，跳过该步骤即可。

```bash
# 1. 原窗口 Ctrl+C 中断
# 2. 核对 GeoIP 文件（City 库约 48–70 MB）
ls -lh /opt/umami/geo/

# 3. 临时替换为空的 geo 脚本
cd /opt/umami
cp scripts/build-geo.js scripts/build-geo.js.bak
printf 'console.log("skip geo build (db already exists)");\n' > scripts/build-geo.js

# 4. 重新构建（BASE_PATH 必须重新加载）
set -a; . /etc/umami.env; set +a
NEXT_TELEMETRY_DISABLED=1 pnpm build 2>&1 | tee /tmp/umami-build.log

# 5. 构建成功后还原脚本
git -C /opt/umami checkout -- scripts/build-geo.js
```

> 如果 `/etc/umami.env` 还没创建，先按第 4 步写好，或手工重新 `export` 那几个变量。

> 如果构建被 `Killed`，先确认第 1 步 swap 已生效（`free -h` 里 Swap 不为 0）。

### 4. systemd 常驻

> 本步骤全程使用绝对路径，**不需要 `cd` 到任何目录**。systemd 通过 `WorkingDirectory=/opt/umami` 进入源码目录。

`/etc/umami.env`（权限 600）：

```ini
BASE_PATH=/stats
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://umami:换成强密码@localhost:5432/umami
APP_SECRET=第 3 步生成的随机串
PORT=3001
HOSTNAME=127.0.0.1
NODE_ENV=production
HOME=/home/ubuntu
# 时区：不设置时图表按 UTC 分桶，东八区会看到时间整体偏移
TZ=Asia/Shanghai
```

`/etc/systemd/system/umami.service`：

```ini
[Unit]
Description=Umami Analytics
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/umami
EnvironmentFile=/etc/umami.env
# next.config 使用 output: standalone，必须用 standalone server 启动，
# 不能写 /usr/bin/pnpm start（会打印 "next start does not work with output: standalone"）
ExecStart=/usr/bin/node /opt/umami/.next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

说明：

- `User=ubuntu` 用你部署用的普通用户；`HOME` 必须指向该用户的家目录。
- 本项目版本使用 `output: standalone`，必须用 `node .next/standalone/server.js` 启动。用 `pnpm start`（即 `next start`）虽然能打开页面，但静态资源与实时接口会出现异常，典型表现是「实时图表空白」「页面图表数据错乱」。
- standalone 目录需要包含静态资源，正常情况下 `postbuild` 脚本已复制。缺失时手动补：

  ```bash
  cd /opt/umami
  ls .next/standalone/server.js
  cp -r .next/static .next/standalone/.next/
  cp -r public .next/standalone/
  ```

```bash
# 启动前确认构建产物存在
ls -la /opt/umami/.next/BUILD_ID
ls -la /opt/umami/.next/standalone/server.js

sudo chmod 600 /etc/umami.env
sudo systemctl daemon-reload
sudo systemctl enable --now umami
systemctl status umami --no-pager
curl -I http://127.0.0.1:3001/stats/
```

- 若报 `Could not find a production build`，说明第 3 步构建未完成，或 `WorkingDirectory` 不是 `/opt/umami`。
- `curl -I http://127.0.0.1:3001/stats/` 返回 **308** 是正常现象：Next.js 会把带尾斜杠的 `/stats/` 重定向到 `/stats`。服务本身已经跑起来了。

首次启动会自动建表并执行数据库迁移；若日志报缺表，按当时版本的 `package.json` scripts 执行迁移命令。

### 5. Nginx 反代

在站点配置文件（`/etc/nginx/conf.d/blog_firefly.conf`）的 `server {}` 内加入：

```nginx
# 注意：不要写成 /stats/，Next.js 会把 /stats/ 重定向到 /stats
location /stats {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # 实时页依赖长连接/流式响应，必须关闭缓冲
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

`$connection_upgrade` 需要在该配置文件、`server {}` 之前定义：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

注意：

- `location` 必须是 `/stats`（无尾斜杠）。若写成 `location /stats/`，浏览器被重定向到 `/stats` 后不匹配该 location，会落到站点配置返回 404。
- `proxy_pass` 末尾**不要加斜杠**，否则 `/stats` 前缀被剥掉，和 `BASE_PATH=/stats` 冲突。
- `proxy_buffering off` 与 `proxy_read_timeout` 是 Realtime 页面能刷新的关键，缺失时表现为「有访问数据但实时图表空白」。
- 不要放行 3001 到公网，也不需要开放新端口。

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I http://124.223.166.233/stats      # 期望 200
```

### 6. 初始化并拿到 Website ID

1. 打开 `http://124.223.166.233/stats`
2. 默认账号 `admin` / `umami`，登录后立即修改密码
3. 新建站点：Name 填 `SnowyChangAnRoad`，Domain 填 `124.223.166.233`
4. 复制生成的 Website ID（UUID）

## 四、仓库改动清单

| 文件 | 改动 |
| --- | --- |
| `src/config/analyticsConfig.ts` | `umamiAnalytics.scriptUrl` 指向 `http://124.223.166.233/stats/script.js`；`replaysScriptUrl` 指向同目录 `recorder.js`；`websiteId` 等第 6 步拿到后填入 |
| `README.md` | 新增「访问统计」小节与文档索引条目 |
| `docs/UMAMI_PLAN.md` | 本文件 |

`websiteId` 为空的含义：`Layout.astro` 判断 `websiteId` 才注入脚本，所以填之前站点完全不受影响，也不会产生 404 请求。

填好后需要重新构建才能生效（脚本标签写在 HTML 里）：

```bash
# 本地
pnpm build
# 或把 analyticsConfig.ts 上传服务器后在那里构建
```

## 五、验证

1. `pnpm check`、`pnpm type-check`、`pnpm build` 通过。
2. 线上首页源码包含：

   ```html
   <script defer src="http://124.223.166.233/stats/script.js" data-website-id="..."></script>
   ```

3. Umami 仪表盘「Realtime」能看到自己的访问。
4. 「Pages」报表能按 `/posts/xxx/` 看到每篇文章的 Visitors（UV）与 Views（PV）。
5. 站内点击切换文章后 Views 继续增长（Umami 会跟随 History API，Swup 切页不会漏计）。
6. 浏览器控制台无 `/stats/script.js` 404、无 CORS 报错。
7. `curl -I http://124.223.166.233/stats/` 返回 200 或 302。

### 常见问题

#### 图表时间整体偏移 8 小时

现象：本地 10:00 的访问，在图表上落在 02:00 附近（或凌晨 00:00）。

原因：容器/进程时区是 UTC，图表按 UTC 分桶。

处理：

```bash
sudo timedatectl set-timezone Asia/Shanghai
sudo timedatectl status

# 给 Umami 进程加时区（写入环境文件后重启）
echo 'TZ=Asia/Shanghai' | sudo tee -a /etc/umami.env
sudo systemctl restart umami

# 可选：让 PostgreSQL 会话时区也用东八区
psql "postgresql://umami:密码@localhost:5432/umami" -c "ALTER DATABASE umami SET timezone TO 'Asia/Shanghai';"
```

历史数据按 UTC 存储，改时区后展示会一并校正，不需要重算。

#### Realtime 图表空白，但概览有数据

先确认请求类型：打开 Realtime 页面 → DevTools → Network → 过滤 `stats`。

- 若看到 `eventsource` 或长时间 pending 的请求 → Nginx 缓冲未关闭，按第 5 步补上 `proxy_buffering off`、`proxy_read_timeout 3600s` 后 `sudo nginx -t && sudo systemctl reload nginx`。
- 若请求 200 但返回空数组 → 检查服务器时间是否正确：

  ```bash
  date
  timedatectl status
  ```

- 若完全看不到 `/stats/api` 请求 → 浏览器插件拦截或页面未登录成功。

#### 实时与图表同时异常：检查启动方式

日志里出现下面这行时，说明启动命令与构建模式不匹配：

```text
⚠ "next start" does not work with "output: standalone" configuration.
```

处理：按第 4 步把 `ExecStart` 改成 `node /opt/umami/.next/standalone/server.js`，并确认静态资源已复制：

```bash
cd /opt/umami
ls .next/standalone/server.js
ls .next/standalone/.next/static | head
ls .next/standalone/public | head

# 静态资源缺失时补一次
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

sudo systemctl daemon-reload
sudo systemctl restart umami
```

另外检查前端资源是否 404：

```bash
sudo grep -E ' /stats/_next/.* (404|500) ' /var/log/nginx/access.log | tail -20
```

有大量 404 就是上面的静态资源未复制问题。

## 六、查询与备份

仪表盘上可以按时间范围、路径、来源、设备、浏览器筛选，并导出 CSV。也可以直接连库：

```bash
psql "postgresql://umami:密码@localhost:5432/umami" -c "\dt"        # 查看表
psql "postgresql://umami:密码@localhost:5432/umami" -c "
  select url_path, count(*) as pv
  from website_event
  where event_type = 1
  group by url_path order by pv desc limit 20;"
```

备份：

```bash
pg_dump "postgresql://umami:密码@localhost:5432/umami" \
  | gzip > ~/umami-$(date +%F).sql.gz
```

建议和 `public/gallery`、Artalk 的 `artalk.db` 一起定期备份。

### 站点统计显示累计访问量

侧边栏「站点统计」里的**累计访客数**与**累计浏览量**是构建期快照，不是实时数据。

实现方式：

```text
pnpm build
  └─ scripts/fetch-umami-stats.ts   # 用 psql 查 Umami 数据库
       └─ src/constants/umami-stats.json   # { visitors, pageviews, updatedAt }
            └─ SiteStats.astro 读取并渲染
```

需要的环境变量（**只在服务器设置，不要提交到仓库**）：

```bash
# 新建一个仅自己可读的环境文件
nano ~/.umami-stats.env
chmod 600 ~/.umami-stats.env
```

内容：

```ini
UMAMI_DATABASE_URL=postgresql://umami:数据库密码@localhost:5432/umami
UMAMI_WEBSITE_ID=320a53f1-31c8-426b-9c13-d0d2b5ec9a17
```

构建时加载：

```bash
cd /var/www/blog_firefly
set -a; . ~/.umami-stats.env; set +a
pnpm build
```

说明：

- `UMAMI_WEBSITE_ID` 可省略；省略时统计整库所有事件。
- 数据库不可用或变量缺失时，脚本只打印警告，保留上一次的 JSON，不影响构建。
- `src/constants/umami-stats.json` 已加入 `.gitignore`，本地没有该文件时侧边栏不显示这两项。
- 数字只在重新构建后更新；要更实时需要改成运行时接口方案（见 `docs/UMAMI_ISSUES.md` 的排查思路）。

## 七、风险与后续

| 项 | 说明 |
| --- | --- |
| 内存峰值 | 构建 Umami 与构建博客不要同时进行；swap 必须生效 |
| HTTP 明文 | 统计脚本走明文 HTTP；上 HTTPS 后 `scriptUrl` 必须同步改，否则被混合内容拦截 |
| 无域名 | 用 IP 访问时 Umami 的 Domain 填 IP；换域名后建议新建站点或修改域名并重新构建 |
| 数据自持 | 数据只在本地 PostgreSQL，换服务器需要 `pg_dump` 迁移 |
| 与 Artalk PV 不一致 | 两套统计口径不同，不必对齐；以 Umami 为准做分析，Artalk 只负责展示 |
| 爬虫流量 | 执行 JS 的爬虫会被计入，可忽略 |
| 版本升级 | 升级 Umami 需重新 `pnpm install && pnpm build` 并重启服务，当日数据不受影响 |

## 八、回滚

1. 仓库：把 `analyticsConfig.umamiAnalytics.websiteId` 改回空字符串，重新构建，站点立即停止上报。
2. 服务器：注释或删除 Nginx 的 `location /stats/`，`sudo systemctl disable --now umami`。
3. 如不再需要统计，`sudo apt remove --purge postgresql` 并删除 `/opt/umami`。
4. 历史数据在 PostgreSQL 中，回滚站点不会删除；需要保留时先 `pg_dump`。
