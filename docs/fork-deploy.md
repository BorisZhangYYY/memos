# Fork 版本安装与部署

本 fork 在官方 Memos 基础上增加了**心情模块**（memo 心情记录、日历标注、趋势图表、筛选、卡片展示）、**可见性策略**（单选项禁用 Public/Protected、隐藏已发布 memo 与探索页）等个人生活平台功能。发布镜像仅推送至本 fork 的 GitHub Container Registry。

## 发布产物

| 产物 | 地址 |
|------|------|
| Docker 镜像 | `ghcr.io/boriszhangyyy/memos`（tag：`0.32.0` / `0.32` / `stable`） |
| 二进制 | [GitHub Releases](https://github.com/BorisZhangYYY/memos/releases)（linux/darwin/windows × amd64/arm64/armv7） |

## 方式一：Docker 部署（推荐）

```bash
docker run -d \
  --name memos \
  -p 5230:5230 \
  -v ~/.memos:/var/opt/memos \
  ghcr.io/boriszhangyyy/memos:stable
```

打开 `http://localhost:5230` 注册第一个账号（自动成为管理员），然后在设置中关闭公开注册。

升级：`docker pull ghcr.io/boriszhangyyy/memos:stable && docker rm -f memos` 后按同样命令重新运行（数据在 `~/.memos` 卷中，不会丢失）。

## 方式二：二进制部署

从 [Releases](https://github.com/BorisZhangYYY/memos/releases) 下载对应平台压缩包：

```bash
tar -xzf memos_0.31.0_linux_amd64.tar.gz
./memos --data ~/memos-data --port 5230
```

## 方式三：源码构建

```bash
# 前端打包（必须，否则页面空白）
cd web && pnpm install && pnpm release
cd ..

# 构建单二进制
GOPROXY=https://goproxy.cn,direct go build -o memos ./cmd/memos
./memos --data ~/memos-data --port 5230
```

## 数据目录

- 默认（本地裸跑）：启动命令的**当前工作目录**下的 `memos_prod.db`（SQLite）
- 建议始终用 `--data <目录>` 显式指定，启动时终端会打印 `Data directory:` / `Database:` 确认
- **迁移/备份 = 拷贝整个数据目录**（`memos_prod.db` 即全部数据：日记、心情、设置）
- 开发模式：`go run ./cmd/memos --data ~/memos-test-data --port 8081`，前端 `cd web && pnpm dev`（:3001 代理到 :8081）

## 接入 Agent（MCP）

本 fork 自带 MCP 服务（`/mcp`，Streamable HTTP）。在 Claude Desktop 等客户端配置：

```json
{
  "mcpServers": {
    "memos": {
      "type": "http",
      "url": "http://<你的IP>:5230/mcp",
      "headers": { "Authorization": "Bearer <访问令牌>" }
    }
  }
}
```

访问令牌在网页「设置 → 我的账户 → 访问令牌」创建。Agent 即可通过 `memo_create_memo` 等工具自动记录日记、心情（`mood_level` 1-7 参数）。

## 与官方版的差异

- **心情模块**：编辑器 Heart 按钮记录心情（1-7）；日历每日/月度平均心情标注；今天/近 7 天/近 30 天趋势图表；侧栏心情多选筛选；memo 卡片心情 emoji + 彩色边框；设置页「心情设置」自定义每档 emoji 和颜色
- **可见性策略**：设置页单选（允许所有 / 禁用 Public / 禁用 Protected 和 Public）；禁用后隐藏对应已发布 memo、隐藏探索页入口，创建/更新/评论全链路校验
- **OAuth2 登录**：已注释（个人平台使用密码登录）
- **镜像**：仅发布至 `ghcr.io/boriszhangyyy/memos`（不推送官方 Docker Hub / GHCR 仓库）
