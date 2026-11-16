# Umami 待解决问题记录

> 用途：记录自建 Umami 两个图表问题的现象、已做检查与后续排查方向，避免上下文丢失。
> 站点：`http://124.223.166.233`（无域名，HTTP）
> 统计后台：`http://124.223.166.233/stats`
> 记录日期：2026-11-16
> 状态：**未解决**，部署已完成，数据正常入库

---

## 一、现象

### 问题 1：Websites 页面柱状图时间偏移

- 本地 10:00 左右的访问，在图表上显示在凌晨 `00:00am` 附近。
- 后台 `Settings` 中已选择正确时区，服务器系统时区也是 `Asia/Shanghai`。
- 数据本身能正常统计（Overview 有 Visitors / Views）。

### 问题 2：Realtime 页面柱状图空白

- Realtime 页面在 30 分钟内有多条访问记录，但图表没有任何柱子。
- 同期请求日志显示接口正常返回：

  ```text
  GET /stats/api/realtime/320a53f1-31c8-426b-9c13-d0d2b5ec9a17 HTTP/1.1  200  374
  ```

- 同一时间 `POST /stats/api/send` 返回 200，说明打点与入库正常。

---

## 二、当前环境

| 项 | 值 |
| --- | --- |
| 站点 | `http://124.223.166.233`（Nginx :80，root `/var/www/blog_firefly/dist`） |
| Umami | 源码部署，`/opt/umami`，Next.js 16.4.2，`output: standalone` |
| 进程 | systemd `umami.service`，`ExecStart=/usr/bin/node /opt/umami/.next/standalone/server.js` |
| 监听 | `127.0.0.1:3001`（未暴露公网） |
| 数据库 | 本机 PostgreSQL，库 `umami` |
| 反代 | `location /stats` → `http://127.0.0.1:3001` |
| 前端配置 | `src/config/analyticsConfig.ts`，`scriptUrl=http://124.223.166.233/stats/script.js` |
| Website ID | `320a53f1-31c8-426b-9c13-d0d2b5ec9a17` |

`/etc/umami.env`（已脱敏）：

```ini
BASE_PATH=/stats
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://umami:<密码>@localhost:5432/umami
APP_SECRET=<32字节随机串>
PORT=3001
HOSTNAME=127.0.0.1
NODE_ENV=production
HOME=/home/ubuntu
TZ=Asia/Shanghai
```

Nginx 当前关键配置：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

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

---

## 三、已完成并确认正常

### 部署与链路

- [x] PostgreSQL 安装、`umami` 库与用户创建、密码已修正并可连接
- [x] `pnpm build` 成功，`.next/BUILD_ID` 存在
- [x] `BASE_PATH` 已编译进产物：`routes-manifest.json` 的 `basePath` 为 `/stats`
- [x] 启动方式已从 `pnpm start`（`next start`）改为 standalone server，日志不再出现
      `"next start" does not work with "output: standalone"` 警告
- [x] `curl -I http://127.0.0.1:3001/stats` 返回 `200`
- [x] `ss -lntp` 显示监听 `127.0.0.1:3001`
- [x] 常驻内存约 145 MB，systemd 状态 `active (running)`
- [x] Nginx `location /stats` 生效，`http://124.223.166.233/stats` 可打开，可登录，可改密码
- [x] Nginx 已加 `proxy_buffering off` / `proxy_read_timeout 3600s` / Upgrade map

### 数据采集

- [x] 站点首页与文章页已注入统计脚本，`data-website-id` 正确
- [x] `POST /stats/api/send` 返回 200，访问有入库
- [x] Overview 能看到 Visitors / Views / Pages 数据
- [x] `GET /stats/api/realtime/<websiteId>` 返回 200（响应约 374 字节）

### 时区

- [x] 服务器系统时区为 `Asia/Shanghai`（`timedatectl status` 已确认）
- [x] `/etc/umami.env` 中存在 `TZ=Asia/Shanghai`，改后已 `systemctl restart umami`
- [x] Umami 后台 Settings 已选择正确时区
- [x] 浏览器强制刷新后两个问题依旧

### 构建期历史问题（已绕过）

- [x] `scripts/build-geo.js` 在打印 `Saved geo database` 后挂住，已通过临时替换为空脚本完成构建，构建后已还原
- [x] `geo/GeoLite2-City.mmdb`（48 MB）存在

---

## 四、尚未验证的怀疑点

按优先级排列，逐条执行并把结果补到本文档。

### 1. 数据库里的时间到底存成什么

```bash
psql "postgresql://umami:<密码>@localhost:5432/umami" -c "show timezone;"
psql "postgresql://umami:<密码>@localhost:5432/umami" -c "
  select created_at,
         created_at at time zone 'Asia/Shanghai' as local_time,
         url_path
  from website_event
  order by created_at desc
  limit 10;"
```

- `local_time` 与实际访问时间一致 → 存储正确，问题在 UI 层。
- 差 8 小时 → 写入端时区仍是 UTC，需要继续查 `TZ` 是否真正进入进程：

  ```bash
  sudo systemctl show umami -p EnvironmentFiles
  tr '\0' '\n' < /proc/$(pgrep -f standalone/server.js | head -1)/environ | grep -E 'TZ|PORT|HOSTNAME'
  ```

### 2. 是否是「站点级时区」而非「用户偏好」

Umami 可能同时存在用户偏好时区与站点时区：

- 检查 `/stats/websites/320a53f1-31c8-426b-9c13-d0d2b5ec9a17/settings` 是否有 Timezone 字段；
- 只有站点级时区才会影响该站点所有报表的展示与分桶。

### 3. Realtime 接口返回的 374 字节内容是什么

需要带登录态抓取，或直接从前端 DevTools 复制响应：

1. 打开 Realtime 页面；
2. DevTools → Network → 过滤 `realtime`；
3. 查看 `GET /stats/api/realtime/<websiteId>` 的 Response。

判断：

- 返回空数组 `[]` 或 `{"data":[]}` → 服务端认为窗口内无数据，重点查时间窗口计算；
- 返回有数据但页面空白 → 前端渲染问题（chunk、图表库、缓存）。

### 4. 前端静态资源与缓存

```bash
# Nginx 里是否有前端资源 404
sudo grep -E ' /stats/_next/.* (404|500) ' /var/log/nginx/access.log | tail -20

# standalone 静态资源是否存在
cd /opt/umami
ls .next/standalone/.next/static | head
ls .next/standalone/public | head

# 取一个真实 chunk 验证可访问
curl -sL http://127.0.0.1:3001/stats | grep -o '/stats/_next/static/[^"]*\.js' | head -3
```

浏览器侧还要排除：

- 强制刷新无效时，试无痕窗口；
- 排除广告拦截 / 隐私类扩展（可能拦截 `/stats/api/realtime` 长连接）；
- 排除 Service Worker 缓存（DevTools → Application → Service Workers → Unregister）。

### 5. Umami 版本已知问题

- 当前为 Next.js 16.4.2，属较新版本，建议记录具体 Umami tag：

  ```bash
  git -C /opt/umami describe --tags
  git -C /opt/umami log -1 --format='%H %ci'
  ```

- 到 Umami GitHub Issues 搜索关键词：`realtime chart empty`、`timezone offset chart`、`hours offset UTC`，确认是否已知缺陷。

### 6. 图表时间轴的真实口径

需要确认 Websites 页柱状图是：

- 按小时分桶（0–23）还是按日期分桶；
- 分桶依据是浏览器本地时区、用户设置时区，还是服务端 `TZ`。

确认方法：同一天内制造 3 次访问（如 10:00、14:00、20:00），看各柱子落在哪些刻度，即可反推口径。

---

## 五、临时替代方案（不影响继续用）

- 统计本身可用：Overview、Pages、Sessions 数据准确，只是图表轴与实时视图异常。
- 需要精确时间明细时，直接查库：

  ```bash
  psql "postgresql://umami:<密码>@localhost:5432/umami" -c "
    select created_at at time zone 'Asia/Shanghai' as local_time,
           url_path, referrer_path
    from website_event
    order by created_at desc
    limit 50;"
  ```

- 需要「近 30 分钟访问」时，同样用上面的 SQL 过滤 `created_at` 即可替代 Realtime。

---

## 六、相关文件

| 位置 | 说明 |
| --- | --- |
| `/opt/umami` | Umami 源码与构建产物 |
| `/etc/umami.env` | 运行环境变量（含 TZ、HOSTNAME、数据库连接） |
| `/etc/systemd/system/umami.service` | 启动命令（standalone server） |
| `/etc/nginx/conf.d/blog_firefly.conf` | `/stats` 反代与实时长连接配置 |
| `src/config/analyticsConfig.ts` | 前端脚本地址与 Website ID |
| `docs/UMAMI_PLAN.md` | 部署与接入文档 |
| `docs/tmp.txt` | 排查过程中的原始终端输出（可随时删除） |
