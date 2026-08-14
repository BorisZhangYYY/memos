# Fork 版本安装与部署

本 fork 在官方 Memos 基础上增加了**心情模块**、**收支模块**、**提醒事项**（关联 Memo、站内通知和可选 SMTP 邮件通知）、**可见性策略**等个人生活平台功能。发布镜像仅推送至本 fork 的 GitHub Container Registry。

## 发布产物

| 产物 | 地址 |
|------|------|
| Docker 镜像 | `ghcr.io/boriszhangyyy/memos`（tag：`0.33.0` / `0.33` / `stable`） |
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
tar -xzf memos_0.33.0_linux_amd64.tar.gz
./memos --data ~/memos-data --port 5230
```

## 方式三：源码构建

```bash
# 前端打包（必须，否则页面空白）
cd web && pnpm install && pnpm release
cd ..

# 构建单二进制
VERSION="$(git describe --tags --abbrev=0 | sed 's/^v//')"
COMMIT="$(git rev-parse --short HEAD)"
GOPROXY=https://goproxy.cn,direct go build \
  -ldflags="-X github.com/usememos/memos/internal/version.Version=${VERSION} -X github.com/usememos/memos/internal/version.Commit=${COMMIT}" \
  -o memos ./cmd/memos
./memos --data ~/memos-data --port 5230
```

## 数据目录

- 默认（本地裸跑）：启动命令的**当前工作目录**下的 `memos_prod.db`（SQLite）
- 建议始终用 `--data <目录>` 显式指定，启动时终端会打印 `Data directory:` / `Database:` 确认
- **迁移/备份 = 拷贝整个数据目录**（`memos_prod.db` 即全部数据：日记、心情、设置）
- 开发模式：`./scripts/run-dev-backend.sh --data ~/memos-test-data --port 8081`，前端 `cd web && pnpm dev`（:3001 代理到 :8081）

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

- **心情模块**：编辑器 Heart 按钮记录心情（1-7）；日历每日/月度平均心情标注；首页看板和历史统计；侧栏心情多选筛选；memo 卡片心情 emoji + 彩色边框；设置页「心情设置」自定义每档 emoji 和颜色
- **收支模块**：钱包、收入支出类型、转账和余额校准；首页展示当日数据并支持按日期查看完整历史
- **提醒事项**：今天、计划、全部、旗标、已完成和已归档视图；支持列表、日期与时间、提前提醒、重复、优先级及关联 Memo
- **通知**：提醒事项支持站内通知；管理员可配置通用 SMTP 服务，将提醒同步发送到用户邮箱
- **可见性策略**：设置页单选（允许所有 / 禁用 Public / 禁用 Protected 和 Public）；禁用后隐藏对应已发布 memo、隐藏探索页入口，创建/更新/评论全链路校验
- **OAuth2 登录**：已注释（个人平台使用密码登录）
- **镜像**：仅发布至 `ghcr.io/boriszhangyyy/memos`（不推送官方 Docker Hub / GHCR 仓库）
