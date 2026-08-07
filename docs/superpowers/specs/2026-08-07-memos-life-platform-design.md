# Memos 个人生活轨迹记录与规划平台 — 设计文档

## 概述

将 Memos 从通用笔记应用改造为「个人生活轨迹记录与规划平台」，提供日记、心情、收支记录、日程规划、提醒事项等功能，并通过 MCP Service 供外部 Agent 接入，实现「跟 Agent 聊天即可自动记录生活」。

**核心交互模式**：用户通过 Agent（Claude 等）对话 → Agent 通过 MCP 调用 Memos → 自动记录、设置提醒、规划日程。人工在 Memos 网页上操作是辅助。

**改造策略**：注释为主，不删代码。

---

## 第一阶段：功能精简

### 1.1 保留

| 模块 | 说明 |
|------|------|
| 备忘录（Memos） | 核心，保留 |
| 捷径（Shortcuts） | CEL 多条件过滤视图，后续新字段自动支持 |
| 标签（Tags） | 内容自带 `#tag` 标注，零成本 |
| 附件库（Attachments） | 方便查看图片，保留 |
| 收件箱（Inbox） | 已有站内 + 邮件通知，后续加浏览器桌面通知 + Web Push + 移动推送 |
| 地图（Map） | 手动标记位置，保留；MCP 暴露位置相关 tool，Agent 可写入 GPS |
| Webhook | 保留，后续提醒事项联动飞书等外部渠道 |
| 活动日历（ActivityCalendar） | 记录频率可视化，保留 |
| 多用户体系 | 保留，公开注册已有 `disallow_user_registration` 开关 |
| 探索页（Explore） | 保留，公开注册关闭后访客只能看 PUBLIC 内容 |

### 1.2 注释掉

| 模块 | 理由 |
|------|------|
| OAuth2 第三方登录 | 个人/家庭用不上 Google/GitHub 登录，邮箱+密码即可 |

### 1.3 新增

| 功能 | 说明 |
|------|------|
| 实例级 `allowed_visibilities` 配置 | 管理员可禁用某个可见性级别（如关闭 PUBLIC），前端编辑器联动过滤 |

**涉及文件**：
- `proto/api/v1/instance_service.proto` — MemoRelatedSetting 新增 `allowed_visibilities`
- `proto/store/instance_setting.proto` — 同上
- `server/router/api/v1/instance_service.go` — 校验逻辑
- `server/router/api/v1/memo_service.go` — 创建/更新 memo 时校验 visibility
- `web/src/components/MemoEditor/Toolbar/VisibilitySelector.tsx` — 根据配置动态过滤选项
- `web/src/components/Settings/PreferencesSection.tsx` — 配置 UI

---

## 第二阶段：心情功能

### 2.1 数据模型

在 `MemoPayload` 中新增字段：

```protobuf
// proto/store/memo.proto
message MemoPayload {
  Property property = 1;
  Location location = 2;
  repeated string tags = 3;
  int32 mood_level = 4;  // 心情等级 1-7，0 表示未设置
}
```

心情等级映射（默认 emoji）：

| mood_level | 中文 | emoji |
|------------|------|-------|
| 1 | 非常不愉快 | 😫 |
| 2 | 有点不愉快 | 😟 |
| 3 | 不愉快 | 😔 |
| 4 | 不悲不喜 | 😐 |
| 5 | 愉快 | 😌 |
| 6 | 有点愉快 | ☺️ |
| 7 | 非常愉快 | 😆 |

### 2.2 编辑器交互

- 编辑器右上角工具栏新增 **Heart（Lucide）图标按钮**，与 `⋯` / `😊` / `🔒` 三个现有按钮并排
- 粉色描边 + 粉色浅底，与其他按钮区分
- 点击弹出 Popover：7 个 emoji 一字排开，hover 放大，选中高亮
- 选中后按钮变为已选中的 emoji（实心），未选时显示空心 Heart
- 心情与 memo 强制绑定，不可独立创建

### 2.3 设置页

在「设置 → 备忘录相关 → 表态」下方新增「心情配置」：

- 管理员可自定义 7 个档位各自用什么 emoji
- 未配置时使用默认映射
- 存储在 `InstanceSetting.MemoRelatedSetting`

### 2.4 首页展示

**日历标注**：侧栏日历中，每天格子左上角标注当天平均心情 emoji（四舍五入到最近档位），无心情记录时不显示。

**心情折线图**：首页可展开区域，点击放大看全屏趋势图。
- 图表类型：折线图
- 日视图（默认）：横轴 0-24 小时，时分精度，每个带心情的 memo 一个数据点
- 周视图：7 天聚合，每天显示均值点 + 半透明范围带（最低→最高）
- 默认日视图

**心情筛选**：在过滤器面板中新增心情维度，按档位范围筛选 memo。不与标签混淆，独立维度。

### 2.5 MCP 支持

Memos 的 MCP 框架从 OpenAPI 自动生成 tool。`mood_level` 字段加到 proto 并 regenerate 后，`memo_create_memo` 和 `memo_update_memo` 的 MCP tool schema 自动包含 `mood_level` 参数，无需额外适配。

示例：Agent 调用 `memo_create_memo` 时传入 `{"content": "...", "mood_level": 5}` 即可记录心情。

### 2.6 涉及文件

**Proto**：
- `proto/store/memo.proto` — MemoPayload 新增 `mood_level`
- `proto/api/v1/memo_service.proto` — Memo message 新增 `mood_level` 字段映射
- `proto/api/v1/instance_service.proto` — MemoRelatedSetting 新增心情 emoji 配置
- `proto/store/instance_setting.proto` — 同上

**后端**：
- `server/router/api/v1/memo_service_converter.go` — mood_level 转换
- `server/router/api/v1/memo_service.go` — 创建/更新 memo 时处理 mood_level
- `server/runner/memopayload/runner.go` — RebuildMemoPayload（如需从内容提取心情）
- `store/migration/` — 所有三个数据库驱动的迁移 + LATEST.sql
- `server/router/mcp/catalog.go` — 心情筛选 tool（可选单独 tool）

**前端**：
- `web/src/components/MemoEditor/Toolbar/` — Heart 按钮 + Popover 组件
- `web/src/components/MemoEditor/` — mood_level 状态管理
- `web/src/components/MemoFilters.tsx` — 心情筛选维度
- `web/src/components/Settings/MemoRelatedSettings.tsx` — 心情 emoji 配置 UI
- `web/src/components/AppSidebar/` — 侧栏日历心情 emoji 标注
- `web/src/components/` — 心情折线图组件（首页可展开区域）
- `web/src/hooks/` — 心情统计 React Query hook
- i18n 翻译文件

---

## MCP 架构（已有）

Memos 已有完整 MCP 服务，位于 `server/router/mcp/`：

- **端点**：`POST /mcp`（Streamable HTTP，stateless，JSON 响应）
- **认证**：`Authorization: Bearer <token>`
- **工具生成**：从 `proto/gen/openapi.yaml` 自动生成 tool schema
- **请求流程**：MCP 客户端 → `/mcp` → 转发到内部 REST API → 返回结果
- **已有 20 个 tools**：memo CRUD、评论、附件、reaction、relation、捷径、用户信息

### 添加新 MCP tool 的流程

1. 定义 proto → `buf generate`
2. 在 `catalog.go` 的 `curatedOperationIDs` 中加入新的 operation ID
3. 如有特殊输入校验，在 `requestBodySchemaOverrides` 中配置
4. 运行 `go test ./server/router/mcp/...`

---

## 待讨论

以下模块将在后续迭代中设计：

### 收支模块

- 钱包管理（新增钱包、记录收支）
- 首页右上方面板实时显示收支统计
- 左侧侧栏独立页面入口
- MCP tool 暴露

### 提醒事项模块

- iOS 风格提醒事项
- 首页右下角面板显示
- 左侧侧栏独立页面入口
- Webhook 联动飞书等外部推送
- MCP tool 暴露

### 首页 Dashboard 重新布局

- 左侧日历 + 标签（现有）
- 右上：收支统计面板
- 右下：提醒事项面板
- 心情折线图（可展开）

### 通知增强

- 浏览器桌面通知（Notification API）
- Web Push（Service Worker）
- 移动端推送（FCM/APNs）

---

## 技术注意事项

- 所有代码改动以**注释**为主，不物理删除代码
- Schema 变更需同步更新 SQLite、MySQL、PostgreSQL 三种数据库迁移
- Proto 修改后需 `buf generate` 重新生成 Go + TypeScript + OpenAPI
- MCP tool 从 OpenAPI 自动生成，新增 API 后只需加入 allowlist
- 遵循项目现有代码风格：Go 用 `errors.Wrap`，前端用 Tailwind CSS v4 + React Query + Biome 格式化
