# Algarve Fabfarm · 环境监控看板

只读环境监控控制台：原生 HTML/CSS/JS 前端，Python MQTT/WebSocket 桥接服务，SQLite 存储历史数据。用于查看实时读数、数据新鲜度、上报坐标、历史曲线与 Mesh 通讯。服务只采集和展示，不下发控制，也不做危险等级裁定。

## 本机预览

运行需 Python 3.10+，代码校验另需 Node.js 18+。依赖见 `requirements.txt`（`paho-mqtt`、`websockets`）。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py --demo --http-port 8018 --ws-port 8778
```

浏览器打开 `http://127.0.0.1:8018/ops`。

demo 模式：

- 只监听 loopback（`127.0.0.1`）
- 使用 SQLite 内存库，不读取、不修改、不删除磁盘上的 `farm.db`
- 不连接 MQTT
- 每 15 秒经真实解码器生成模拟数据（含静默源、历史空洞、零电量、无坐标节点）
- `Ctrl+C` 退出

## 页面路由与源码

| 路由 | 用途 | 对应源码 |
|---|---|---|
| `/ops`, `/b`, `/dashboard-b.html` | 运维主控台（中英切换） | `dashboard-b.html`, `ops.css`, `dashboard-b-client.js` |
| `/`, `/a`, `/index.html`, `/dashboard-a.html` | 简版旧看板 | `b.html`, `live-client.js`；改完跑 `python3 build_live.py` |
| `/admin` | 诊断：传输通道、数据源、原始报文 | `admin.html`, `workbench.js` |
| `/data` | 传感器明细：单设备字段与历史走势 | `data.html`, `workbench.js` |

- 不要手改 `dashboard-a.html`，它由 `build_live.py` 生成。
- `/ops`、`/admin`、`/data` 用本地静态资源和离线字体，没有 CDN，也不用 npm 打包。
- 显示计算与单位在 `ops-core.js`；WS 地址探测与中英切换在 `farm-connection.js`；协议见 [DATA-SPEC.md](DATA-SPEC.md)；运维交互见 [DESIGN.md](DESIGN.md)。
- `PROMPT_B.md` / `PROMPT_C.md` 是历史原型说明，不是现行实现。`map.svg` 是旧示意图，不是实测坐标。

## 生产配置

```sh
cp .env.example .env
chmod 600 .env
# 按现场 Broker 改 .env
.venv/bin/python bridge.py --env-file .env
```

- 优先级：CLI 参数 > 进程环境变量 > `.env`。
- 默认端口 HTTP 8000 / WS 8765。`.env.example` 默认绑 loopback，改绑用 `FARM_BIND`。
- 生产 MQTT 用 TLS（`MQTT_TLS=1`，对应端口与 CA）。非空 `MQTT_PREFIX` 必须以 `/` 结尾。
- 命令行会进进程列表，不要用 `--mqtt-pass`，密码放 `.env`。
- HTTP 与 WebSocket 端口分开。前端用 `/api/config` 探测 WS 端口。反代要把 `/ws` 和 `/ws/admin`（保留 Upgrade）转到 WS 端口，其余 HTTP 路由转到 HTTP 端口。
- 桥接服务没有内置鉴权。不要把 HTTP/WS 直接暴露到非可信网络。

## API

JSON，不缓存。非法时间窗口 400，未知路由 404，SQLite 查询失败 503。GET 与 HEAD 路由一致。

| 接口 | 说明 |
|---|---|
| `/api/overview` | 运维快照 `{state, metrics, health, mesh, server}`，不含原始上报堆栈 |
| `/api/config` | `{ws_port, mode}` |
| `/api/health` | 分类健康、时间戳、计数 |
| `/api/mesh` | 节点、`last_heard_ts`、`position_ts`、新鲜度 |
| `/api/raw` | 原始报文与最新解码字段 |
| `/api/fields` | 各设备最新解码；启动时从历史库预热 |
| `/api/history?hours=24` | `[timestamp, value]`，1–168 小时，单字段最多 400 点 |
| `/api/sparklines` | 各指标近 48 次采样 |
| `/api/wind` | 近 48 小时风速风向配对 |

WebSocket 推送含 `type`、`data`、`meta`（新鲜度）。管理通道另有 `admin_snapshot` 与 `raw`。入站 WS 不会发到 MQTT。

`weather.rain_rate` 是瞬时降雨强度，不是累计雨量；`weather.rain_24h` 只是兼容别名。新鲜度按字段接收时间，不是浏览器是否连上 socket。

## 现场同步（人工 cutover）

仓库没有自动部署。设备路径和主机不要写进仓库，调用时传入。

```sh
./deploy/sync-mission-pack.sh --dry-run user@host:/path/on/device
./deploy/sync-mission-pack.sh user@host:/path/on/device
```

或：

```sh
FARM_SYNC_HOST=user@host FARM_SYNC_DEST=/path/on/device ./deploy/sync-mission-pack.sh
```

- 排除 `.git`、`.venv`、`farm.db*`、`.env*`，并且不用 `rsync --delete`。
- 同步后不会重启服务，需在设备上自己重启。
- `wsl_service.sh` 只打印 [deploy/farm-bridge.service](deploy/farm-bridge.service)，不安装。
- 现场环境文件建议 `/etc/fabfarm/bridge.env`（600）。`FARM_DB` 填**现有**数据库的绝对路径，不要为了迁就示例路径去挪库。运行账号要对库所在目录可写（WAL/journal）。
- 服务不要用 root 跑。

### 备份与回滚

不要直接 `cp` 正在跑的 `farm.db`（会漏 WAL）。在线备份：

```sh
export FARM_DB="/path/to/existing/farm.db"
export FARM_BACKUP="/path/to/backup/farm.db"

python3 - <<'PYBACKUP'
import os, sqlite3
from pathlib import Path
source = Path(os.environ['FARM_DB']).resolve(strict=True)
target = Path(os.environ['FARM_BACKUP'])
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
    with sqlite3.connect(target) as dst:
        src.backup(dst)
        assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
PYBACKUP
```

回滚：换回旧代码目录和 venv，**同一份** `farm.db` 不动，再重启。不要为了回滚代码去还原旧库备份，那会丢掉备份之后的观测。本版本只给已有表加索引，不改、不删字段。

## 校验

```sh
.venv/bin/python -m compileall -q bridge.py demo.py build_live.py check.py sim tests
.venv/bin/python build_live.py
.venv/bin/python check.py dashboard-a.html --hub
.venv/bin/python check.py dashboard-b.html --app
.venv/bin/python check.py admin.html --app
.venv/bin/python check.py data.html --app
node --check dashboard-b-client.js
node --check ops-core.js
node --check farm-connection.js
node --check live-client.js
node --check workbench.js
node --test tests/*.test.js
.venv/bin/python -m unittest discover -s tests -v
bash -n wsl_setup.sh wsl_service.sh deploy/sync-mission-pack.sh
```

这些命令不做 deploy、commit 或 PR。浏览器核对：1920×1080、1440×900、390×844，中英文，空数据。截图放忽略目录 `.artifacts/`。

## 已知边界

- 传感器名称与 Mesh 拓扑未入库；重启后设备名回退为角色加 ID。
- 明细页折线只用带时间戳的历史；未映射字段重启后没有连续走势。
- Meshtastic RSSI/SNR 和原始包暂未暴露，诊断页显示不可用，不是 0。
- 很大的地理跨度超出本地位图用途。
- `sim/` 是独立 MQTT 模拟发送器，见 [sim/README.md](sim/README.md)。本地前端优先 `bridge.py --demo`。
