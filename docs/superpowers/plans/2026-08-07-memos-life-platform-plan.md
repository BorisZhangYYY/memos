# Memos 生活平台 Phase 1+2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 精简 OAuth2 并新增可见性配置，Phase 2 实现心情记录与展示功能。

**Architecture:** Proto 驱动开发——先改 proto 定义，`buf generate` 生成 Go/TS/OpenAPI，再改后端服务层，最后改前端组件。MCP tool 从 OpenAPI 自动生成，无需额外适配。

**Tech Stack:** Go 1.26.2, Echo v5, Connect RPC, Protocol Buffers, React 19, TypeScript 6, Vite 8, Tailwind CSS v4, React Query v5, SQLite/MySQL/PostgreSQL.

## Global Constraints

- 所有删除操作以注释方式处理，不物理删除代码
- Schema 变更需同步更新 SQLite、MySQL、PostgreSQL 三种数据库迁移
- Proto 修改后运行 `cd proto && buf generate`
- Go 错误处理用 `errors.Wrap(err, "context")`
- 前端遵循 Biome 格式化（2-space indent, double quotes, semicolons, 140-char line width）
- 前端用 `@/` 绝对路径导入
- 提交信息遵循 Conventional Commits

---

## Phase 1: 功能精简

### Task 1: 注释掉 OAuth2 Identity Provider 功能

**Files:**
- Modify: `server/router/api/v1/v1.go`
- Modify: `web/src/components/IdentityProviderButtons.tsx`

**Interfaces:**
- Consumes: 现有 IDP 服务注册和前端登录页按钮
- Produces: OAuth2 登录按钮不再显示，后端 IDP 端点仍然存在但前端不暴露

- [ ] **Step 1: 前端注释掉 OAuth2 登录按钮**

在 `web/src/components/IdentityProviderButtons.tsx` 中，将整个组件的 render 逻辑注释掉，返回 null。保留原有代码在注释中。

```tsx
// OAuth2 identity provider support is disabled for life-platform mode.
// Original implementation preserved below.
export default function IdentityProviderButtons(_props: IdentityProviderButtonsProps) {
  return null;
  /*
  // ... original implementation preserved below ...
  */
}
```

- [ ] **Step 2: 运行前端 lint 验证**

```bash
cd web && pnpm lint
```

- [ ] **Step 3: 提交**

```bash
git add web/src/components/IdentityProviderButtons.tsx
git commit -m "chore: comment out OAuth2 identity provider buttons for life-platform mode"
```

---

### Task 2: Proto — 新增 allowed_visibilities 到 InstanceMemoRelatedSetting

**Files:**
- Modify: `proto/api/v1/instance_service.proto`
- Modify: `proto/store/instance_setting.proto`

**Interfaces:**
- Consumes: 现有 MemoRelatedSetting message 定义
- Produces: `allowed_visibilities` 字段（repeated string），可用于限制允许的可见性级别

- [ ] **Step 1: 修改 API proto**

在 `proto/api/v1/instance_service.proto` 的 `MemoRelatedSetting` message 中，reactions (field 7) 之后新增：

```protobuf
// allowed_visibilities restricts which visibility levels users can select.
// Values are PRIVATE, PROTECTED, PUBLIC. Empty means all levels are allowed.
repeated string allowed_visibilities = 8;
```

- [ ] **Step 2: 修改 Store proto**

在 `proto/store/instance_setting.proto` 的 `InstanceMemoRelatedSetting` message 中，reactions (field 7) 之后新增：

```protobuf
// allowed_visibilities restricts which visibility levels users can select.
repeated string allowed_visibilities = 8;
```

- [ ] **Step 3: 重新生成 proto**

```bash
cd proto && buf generate
```

- [ ] **Step 4: 验证生成成功**

```bash
go build ./... && cd web && pnpm lint
```

- [ ] **Step 5: 提交**

```bash
git add proto/ proto/gen/ web/src/types/proto/
git commit -m "feat(proto): add allowed_visibilities to instance memo-related settings"
```

---

### Task 3: 后端 — 创建/更新 memo 时校验 visibility 是否在允许列表中

**Files:**
- Modify: `server/router/api/v1/memo_service.go`

**Interfaces:**
- Consumes: `InstanceMemoRelatedSetting.AllowedVisibilities` from instance settings
- Produces: 当 visibility 不在允许列表中时返回 `InvalidArgument` 错误

- [ ] **Step 1: 在 memo 创建和更新处添加校验**

在 `memo_service.go` 的 `CreateMemo` 和 `UpdateMemo` 函数中，调用 `convertVisibilityToStore` 后添加校验。需要先获取 instance setting，检查 `allowed_visibilities` 是否非空，若非空则检查请求的 visibility 是否在列表中。

在 `CreateMemo` 中（`memo_service.go` 约第 80-90 行，`convertVisibilityToStore` 调用之后）：

```go
// Validate visibility against allowed list.
instanceSetting, err := s.Store.GetInstanceSetting(ctx, &store.FindInstanceSetting{
    Key: store.InstanceSettingKeyMemoRelated,
})
if err != nil {
    return nil, status.Errorf(codes.Internal, "failed to get instance setting")
}
if instanceSetting != nil && instanceSetting.MemoRelatedSetting != nil {
    allowedVis := instanceSetting.MemoRelatedSetting.AllowedVisibilities
    if len(allowedVis) > 0 {
        visStr := convertVisibilityToString(create.Visibility)
        allowed := false
        for _, v := range allowedVis {
            if v == visStr {
                allowed = true
                break
            }
        }
        if !allowed {
            return nil, status.Errorf(codes.InvalidArgument, "visibility %q is not allowed", visStr)
        }
    }
}
```

在 `UpdateMemo` 的 visibility 更新分支（约第 460-465 行）添加相同校验。

- [ ] **Step 2: 运行后端测试**

```bash
go test -v -race ./server/...
```

- [ ] **Step 3: 提交**

```bash
git add server/router/api/v1/memo_service.go
git commit -m "feat(api): validate memo visibility against allowed_visibilities instance setting"
```

---

### Task 4: 前端 — 设置页新增 allowed_visibilities 配置 UI

**Files:**
- Modify: `web/src/components/Settings/MemoRelatedSettings.tsx`

**Interfaces:**
- Consumes: `memoRelatedSetting.allowedVisibilities` from `useInstance()`
- Produces: 多选框 UI，管理员可勾选允许的可见性级别，保存到 instance setting

- [ ] **Step 1: 添加可见性多选配置**

在 `MemoRelatedSettings.tsx` 的 `contentLengthLimit` 设置之后、「reactions」设置之前，新增一个 `SettingGroup`，展示三个可见性级别（PRIVATE、PROTECTED、PUBLIC）的勾选框。

```tsx
import { Switch } from "@/components/ui/switch";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { convertVisibilityToString } from "@/utils/memo";

// Inside the component, add after contentLengthLimit SettingGroup:

const visibilityOptions = [Visibility.PRIVATE, Visibility.PROTECTED, Visibility.PUBLIC];
const allowedVis = memoRelatedSetting.allowedVisibilities || [];

const toggleVisibility = (vis: Visibility) => {
  const visStr = convertVisibilityToString(vis);
  const next = allowedVis.includes(visStr)
    ? allowedVis.filter((v: string) => v !== visStr)
    : [...allowedVis, visStr];
  updatePartialSetting({ allowedVisibilities: next });
};

// In the JSX, add before the reactions SettingGroup:
<SettingGroup title={t("setting.memo.allowed-visibilities")} description={t("setting.memo.allowed-visibilities-description")}>
  <SettingList>
    {visibilityOptions.map((vis) => {
      const visStr = convertVisibilityToString(vis);
      return (
        <SettingListItem key={visStr} label={t(`memo.visibility.${visStr.toLowerCase()}`)}>
          <Switch
            checked={allowedVis.includes(visStr)}
            onCheckedChange={() => toggleVisibility(vis)}
          />
        </SettingListItem>
      );
    })}
  </SettingList>
</SettingGroup>
```

- [ ] **Step 2: 添加 i18n key**

在 `web/src/locales/zh-Hans.json` 中添加：

```json
"setting.memo.allowed-visibilities": "允许的可见性级别",
"setting.memo.allowed-visibilities-description": "勾选用户可以选择哪些可见性级别。取消勾选的级别将不会在编辑器中显示。"
```

同样添加英文翻译到 `en.json`。

- [ ] **Step 3: 运行前端 lint**

```bash
cd web && pnpm lint
```

- [ ] **Step 4: 提交**

```bash
git add web/src/components/Settings/MemoRelatedSettings.tsx web/src/locales/
git commit -m "feat(web): add allowed_visibilities configuration UI in memo-related settings"
```

---

### Task 5: 前端 — VisibilitySelector 根据 allowed_visibilities 动态过滤

**Files:**
- Modify: `web/src/components/MemoEditor/Toolbar/VisibilitySelector.tsx`
- Modify: `web/src/components/Settings/PreferencesSection.tsx`

**Interfaces:**
- Consumes: `instance.memoRelatedSetting.allowedVisibilities`
- Produces: 可见性选择器中只显示允许的选项

- [ ] **Step 1: 读取 instance setting 并过滤选项**

在 `VisibilitySelector.tsx` 中，使用 `useInstance()` hook 获取 `memoRelatedSetting.allowedVisibilities`。当 `allowedVisibilities` 非空时，过滤下拉选项只显示允许的级别。

在 `PreferencesSection.tsx` 的 `visibilityOptions` 定义处（约 37 行），同样读取 `allowedVisibilities` 并过滤。

```tsx
import { useInstance } from "@/contexts/InstanceContext";

// In VisibilitySelector:
const { memoRelatedSetting } = useInstance();
const allowedVis = memoRelatedSetting?.allowedVisibilities;
const options = useMemo(() => {
  const all = [
    { value: Visibility.PRIVATE, label: t("memo.visibility.private"), icon: LockIcon },
    { value: Visibility.PROTECTED, label: t("memo.visibility.protected"), icon: UsersIcon },
    { value: Visibility.PUBLIC, label: t("memo.visibility.public"), icon: GlobeIcon },
  ];
  if (!allowedVis || allowedVis.length === 0) return all;
  return all.filter((opt) => allowedVis.includes(convertVisibilityToString(opt.value)));
}, [allowedVis, t]);
```

- [ ] **Step 2: 运行前端 lint 和测试**

```bash
cd web && pnpm lint && pnpm test
```

- [ ] **Step 3: 提交**

```bash
git add web/src/components/MemoEditor/Toolbar/VisibilitySelector.tsx web/src/components/Settings/PreferencesSection.tsx
git commit -m "feat(web): filter visibility options by allowed_visibilities instance setting"
```

---

## Phase 2: 心情功能

### Task 6: Proto — 新增 mood_level 到 MemoPayload 和 Memo

**Files:**
- Modify: `proto/store/memo.proto`
- Modify: `proto/api/v1/memo_service.proto`

**Interfaces:**
- Consumes: MemoPayload message (store), Memo message (api)
- Produces: `mood_level` int32 字段

- [ ] **Step 1: 修改 store proto**

在 `proto/store/memo.proto` 的 `MemoPayload` message 中，tags (field 3) 之后新增：

```protobuf
// mood_level represents the mood of the memo, 1-7.
// 0 means no mood is set. 1=very unhappy, 7=very happy.
int32 mood_level = 4;
```

- [ ] **Step 2: 修改 API proto**

在 `proto/api/v1/memo_service.proto` 的 `Memo` message 中，当前最后一个字段是 location=18，新增：

```protobuf
// Optional. The mood level of the memo, 1-7. 0 means unset.
int32 mood_level = 19;
```

- [ ] **Step 3: 修改 InstanceMemoRelatedSetting — 新增心情 emoji 配置**

在 `proto/api/v1/instance_service.proto` 和 `proto/store/instance_setting.proto` 的 MemoRelatedSetting message 中，新增：

```protobuf
// mood_emojis are the emoji representations for mood levels 1-7.
// Index 0 = mood level 1, index 6 = mood level 7. Default emojis are used when empty.
repeated string mood_emojis = 9;
```

- [ ] **Step 4: 重新生成 proto**

```bash
cd proto && buf generate
```

- [ ] **Step 5: 验证**

```bash
go build ./... && cd web && pnpm lint
```

- [ ] **Step 6: 提交**

```bash
git add proto/ proto/gen/ web/src/types/proto/
git commit -m "feat(proto): add mood_level to MemoPayload/Memo and mood_emojis to instance settings"
```

---

### Task 7: 数据库迁移

**Files:**
- Create: `store/migration/sqlite/0.31/00_mood.sql`
- Create: `store/migration/mysql/0.31/00_mood.sql`
- Create: `store/migration/postgres/0.31/00_mood.sql`
- Modify: `store/migration/sqlite/LATEST.sql`
- Modify: `store/migration/mysql/LATEST.sql`
- Modify: `store/migration/postgres/LATEST.sql`

**Interfaces:**
- Produces: memo 表的 `payload` 列默认值包含 `"mood_level": 0`

- [ ] **Step 1: 创建 SQLite 迁移**

`store/migration/sqlite/0.31/00_mood.sql`：

```sql
-- mood_level is stored inside the memo payload JSON column.
-- No schema change needed — the field defaults to 0 in application code.
-- This migration exists to document the schema version bump.
```

- [ ] **Step 2: 创建 MySQL 和 PostgreSQL 迁移（内容同上）**

- [ ] **Step 3: 更新 LATEST.sql 文件**

在三个 `LATEST.sql` 中，payload 默认值已经是 `'{}'`，新字段默认由应用代码处理。确认 LATEST.sql 中的注释注明 mood_level 字段存在于 payload JSON 中。

- [ ] **Step 4: 更新 schema version**

检查 `store/migration/` 下的 version 常量是否正确引用 `0.31`。查看 `store/db/sqlite/migration.go` 等文件中 migration 列表是否包含了 `0.31` 目录。

- [ ] **Step 5: 运行 store 测试**

```bash
go test -v ./store/...
```

- [ ] **Step 6: 提交**

```bash
git add store/migration/
git commit -m "feat(store): add migration for mood_level in memo payload"
```

---

### Task 8: 后端 — memo_service_converter 支持 mood_level

**Files:**
- Modify: `server/router/api/v1/memo_service_converter.go`

**Interfaces:**
- Consumes: `store.Memo` with `Payload.MoodLevel`, `apiv1.Memo` with `MoodLevel`
- Produces: 双向转换 mood_level

- [ ] **Step 1: 在 memo → API 转换中添加 mood_level**

在 `convertMemoFromStoreWithCreators` 函数中，找到处理 `memo.Payload` 的部分（约 47 行），添加：

```go
if memo.Payload != nil {
    memoMessage.Tags = memo.Payload.Tags
    memoMessage.MoodLevel = memo.Payload.MoodLevel
    // ... existing property, location handling ...
}
```

- [ ] **Step 2: 在 API → memo 创建中添加 mood_level 转换**

在 `CreateMemo` 函数中（约 108-112 行），`RebuildMemoPayload` 调用附近，如 API memo 有 `MoodLevel` 则写入 payload：

```go
if request.Memo.MoodLevel > 0 {
    create.Payload.MoodLevel = request.Memo.MoodLevel
}
```

- [ ] **Step 3: 在 UpdateMemo 中添加 mood_level 更新支持**

在 `UpdateMemo` 函数中，添加对 `mood_level` 路径的处理：

```go
} else if path == "mood_level" {
    payload.MoodLevel = request.Memo.MoodLevel
}
```

- [ ] **Step 4: 运行测试**

```bash
go test -v -race ./server/...
```

- [ ] **Step 5: 提交**

```bash
git add server/router/api/v1/memo_service_converter.go server/router/api/v1/memo_service.go
git commit -m "feat(api): support mood_level in memo create/update/convert"
```

---

### Task 9: 前端 — Heart 按钮 + Mood Popover 组件

**Files:**
- Create: `web/src/components/MemoEditor/Toolbar/MoodSelector.tsx`
- Modify: `web/src/components/MemoEditor/Toolbar/EditorToolbar.tsx`
- Modify: `web/src/components/MemoEditor/types/components.ts`
- Modify: `web/src/components/MemoEditor/state/types.ts`
- Modify: `web/src/components/MemoEditor/state/actions.ts`

**Interfaces:**
- Consumes: Editor state (`s.metadata.moodLevel`), dispatch actions
- Produces: Heart 按钮 + Popover，点击选择心情 emoji，更新 editor state

- [ ] **Step 1: 扩展 editor state types**

在 `state/types.ts` 的 `MetadataState` 中添加：

```typescript
moodLevel: number; // 0 = unset, 1-7
```

在初始 state 中，`moodLevel` 默认为 0。

- [ ] **Step 2: 扩展 editor actions**

在 `state/actions.ts` 中，`setMetadata` action 已支持 partial metadata 更新，确认 `moodLevel` 能被正确传递。

- [ ] **Step 3: 扩展 editor component types**

在 `types/components.ts` 的 Editor 相关接口中，如需要，添加 moodLevel。

- [ ] **Step 4: 创建 MoodSelector 组件**

创建 `web/src/components/MemoEditor/Toolbar/MoodSelector.tsx`：

```tsx
import { HeartIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslate } from "@/utils/i18n";

const DEFAULT_MOOD_EMOJIS = ["😫", "😟", "😔", "😐", "😌", "☺️", "😆"];

interface MoodSelectorProps {
  moodLevel: number;
  onChange: (moodLevel: number) => void;
}

export default function MoodSelector({ moodLevel, onChange }: MoodSelectorProps) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const emojis = DEFAULT_MOOD_EMOJIS; // TODO: read from instance settings later

  const handleSelect = (level: number) => {
    onChange(moodLevel === level ? 0 : level); // toggle off if same level
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={moodLevel > 0 ? "text-rose-500 bg-rose-50 hover:bg-rose-100" : "text-muted-foreground"}
          aria-label={t("mood.select")}
        >
          {moodLevel > 0 ? (
            <span className="text-base">{emojis[moodLevel - 1]}</span>
          ) : (
            <HeartIcon className="size-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          {emojis.map((emoji, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i + 1)}
              className={`size-9 flex items-center justify-center rounded-lg text-xl transition-all hover:bg-accent hover:scale-110 ${
                moodLevel === i + 1 ? "bg-rose-100 scale-110" : ""
              }`}
              aria-label={`${t("mood.level")} ${i + 1}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 5: 集成到 EditorToolbar**

在 `EditorToolbar.tsx` 中，`VisibilitySelector` 旁边添加 `MoodSelector`：

```tsx
import MoodSelector from "./MoodSelector";

// Read moodLevel from editor state:
const moodLevel = useEditorSelector((s) => s.metadata.moodLevel ?? 0);

// Handler:
const handleMoodChange = (next: number) => {
  dispatch(actions.setMetadata({ moodLevel: next }));
};

// In JSX, next to VisibilitySelector:
<MoodSelector moodLevel={moodLevel} onChange={handleMoodChange} />
```

- [ ] **Step 6: 运行前端 lint**

```bash
cd web && pnpm lint
```

- [ ] **Step 7: 提交**

```bash
git add web/src/components/MemoEditor/
git commit -m "feat(web): add mood selector button with emoji popover in memo editor toolbar"
```

---

### Task 10: 前端 — 心情 emoji 设置 UI

**Files:**
- Modify: `web/src/components/Settings/MemoRelatedSettings.tsx`

**Interfaces:**
- Consumes: `memoRelatedSetting.moodEmojis`
- Produces: 7 个心情档位的 emoji 编辑控件

- [ ] **Step 1: 在 reactions 设置后添加心情 emoji 配置**

在 `MemoRelatedSettings.tsx` 中，reactions `SettingGroup` 之后，新增心情配置：

```tsx
const DEFAULT_MOOD_EMOJIS = ["😫", "😟", "😔", "😐", "😌", "☺️", "😆"];
const moodEmojis = memoRelatedSetting.moodEmojis?.length === 7
  ? memoRelatedSetting.moodEmojis
  : DEFAULT_MOOD_EMOJIS;

const updateMoodEmoji = (index: number, value: string) => {
  const next = [...moodEmojis];
  next[index] = value;
  updatePartialSetting({ moodEmojis: next });
};

// In JSX:
<SettingGroup title={t("setting.memo.mood-emojis")} description={t("setting.memo.mood-emojis-description")} showSeparator>
  <SettingList>
    {moodEmojis.map((emoji: string, i: number) => (
      <SettingListItem key={i} label={`${t("mood.level")} ${i + 1}`}>
        <Input
          className="w-20 font-mono text-center text-lg"
          value={emoji}
          onChange={(e) => updateMoodEmoji(i, e.target.value)}
        />
      </SettingListItem>
    ))}
  </SettingList>
</SettingGroup>
```

- [ ] **Step 2: 运行前端 lint**

```bash
cd web && pnpm lint
```

- [ ] **Step 3: 提交**

```bash
git add web/src/components/Settings/MemoRelatedSettings.tsx
git commit -m "feat(web): add mood emoji configuration UI in memo-related settings"
```

---

### Task 11: 前端 — 心情筛选

**Files:**
- Modify: `web/src/contexts/MemoFilterContext.tsx`
- Modify: `web/src/components/MemoFilters.tsx`

**Interfaces:**
- Consumes: `FilterFactor` type (新增 `moodLevel`)
- Produces: 心情范围筛选 chip，显示在 MemoFilters 中

- [ ] **Step 1: 添加 moodLevel 筛选因子**

在 `MemoFilterContext.tsx` 的 `FilterFactor` 类型中添加：

```typescript
export type FilterFactor =
  | "tagSearch"
  | "visibility"
  | "contentSearch"
  | "displayTime"
  | "pinned"
  | "property.hasLink"
  | "property.hasTaskList"
  | "property.hasCode"
  | "moodLevel";
```

- [ ] **Step 2: 在 MemoFilters 中添加心情筛选按钮**

在 `MemoFilters.tsx` 的 `FILTER_CONFIGS` 中添加：

```typescript
moodLevel: {
  icon: HeartIcon,
  getLabel: (value, t) => {
    const [min, max] = value.split("-").map(Number);
    return `${t("mood.filter")}: ${min}-${max}`;
  },
},
```

同时需要在过滤器面板（如 MemoFilters 或 FilterDialog）中添加心情范围选择的 UI 控件，让用户可以选最低和最高心情档位。

- [ ] **Step 3: 在后端 filter 系统注册 mood_level 字段**

在 `internal/filter/schema.go` 中，为 memo 表添加 `mood_level` 字段定义（映射到 `payload` JSON 列的 `$.mood_level`），使 CEL filter 的 `mood_level >= 5` 等表达式能正常工作。

- [ ] **Step 4: 运行 lint 和测试**

```bash
cd web && pnpm lint && go test -v ./internal/filter/...
```

- [ ] **Step 5: 提交**

```bash
git add web/src/contexts/MemoFilterContext.tsx web/src/components/MemoFilters.tsx internal/filter/schema.go
git commit -m "feat: add mood_level filter dimension for memo filtering"
```

---

### Task 12: 前端 — 侧栏日历心情 emoji 标注

**Files:**
- Modify: `web/src/components/StatisticsView.tsx`（或其子组件）
- Create: `web/src/hooks/useMoodStats.ts`

**Interfaces:**
- Consumes: 带 mood_level 的 memo 统计数据
- Produces: 日历格子中显示每日平均心情 emoji

- [ ] **Step 1: 创建心情统计 hook**

创建 `web/src/hooks/useMoodStats.ts`：

```typescript
import { useMemo } from "react";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

export interface DailyMood {
  date: string;    // YYYY-MM-DD
  avgMood: number; // average mood_level for the day
  count: number;   // number of memos with mood
}

const DEFAULT_MOOD_EMOJIS = ["😫", "😟", "😔", "😐", "😌", "☺️", "😆"];

export function getMoodEmoji(moodLevel: number, customEmojis?: string[]): string {
  if (moodLevel < 1 || moodLevel > 7) return "";
  const emojis = customEmojis?.length === 7 ? customEmojis : DEFAULT_MOOD_EMOJIS;
  return emojis[Math.round(moodLevel) - 1];
}

export function useDailyMoodStats(memos: Memo[]): Map<string, DailyMood> {
  return useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const memo of memos) {
      if (!memo.moodLevel || memo.moodLevel === 0) continue;
      const date = memo.createTime?.toDate().toISOString().slice(0, 10);
      if (!date) continue;
      const entry = map.get(date) || { sum: 0, count: 0 };
      entry.sum += memo.moodLevel;
      entry.count += 1;
      map.set(date, entry);
    }
    const result = new Map<string, DailyMood>();
    for (const [date, { sum, count }] of map) {
      result.set(date, { date, avgMood: sum / count, count });
    }
    return result;
  }, [memos]);
}
```

- [ ] **Step 2: 在日历组件中显示心情 emoji**

在 `StatisticsView.tsx` 中找到渲染每天格子的代码。在每个格子左上角添加心情 emoji（如果当天有心情数据）。需要祖先组件传递带 mood 的 memo 数据或直接查询 mood 统计。

实际实现取决于日历组件的结构。需要将 `dailyMood` map 传入日历渲染循环，在每个日期格子的左上角叠加一个小 emoji。

- [ ] **Step 3: 运行 lint**

```bash
cd web && pnpm lint
```

- [ ] **Step 4: 提交**

```bash
git add web/src/hooks/useMoodStats.ts web/src/components/StatisticsView.tsx
git commit -m "feat(web): show daily average mood emoji on sidebar calendar"
```

---

### Task 13: 前端 — 心情折线图组件

**Files:**
- Create: `web/src/components/MoodChart.tsx`
- Modify: `web/src/pages/Home.tsx`

**Interfaces:**
- Consumes: 带 mood_level 的 memo 列表
- Produces: 可展开的折线图，日视图和周视图

- [ ] **Step 1: 创建 MoodChart 组件**

创建 `web/src/components/MoodChart.tsx`。由于 Memos 没有引入图表库，有两种实现方式：

**方案 A（推荐）**：使用纯 SVG/CSS 绘制简单折线图，避免增加依赖。适合 7 个离散等级的 mood 数据。

**方案 B**：安装 `recharts` 作为图表库。

选择方案 A，因为心情等级是离散的 1-7，不需要复杂图表库。

核心接口：

```tsx
interface MoodChartProps {
  memos: Array<{ createTime: Date; moodLevel: number }>;
  view: "day" | "week"; // day = 24h, week = 7 days
}

export function MoodChart({ memos, view }: MoodChartProps) {
  // Day view: group by hour, show each memo as a point
  // Week view: group by day, show avg as point + min/max band
  
  // SVG 渲染折线图，横轴时间，纵轴 mood level (1-7)
}
```

将 `MoodChart` 放在 `Home.tsx` 的可展开区域中（如 Collapsible 或 Dialog）。

- [ ] **Step 2: 集成到首页**

在 `Home.tsx` 中，在 memo 列表上方或侧边添加可展开的心情图表区域。默认折叠，点击展开显示完整图表。

- [ ] **Step 3: 运行 lint**

```bash
cd web && pnpm lint
```

- [ ] **Step 4: 提交**

```bash
git add web/src/components/MoodChart.tsx web/src/pages/Home.tsx
git commit -m "feat(web): add mood trend line chart on home page"
```

---

### Task 14: 前端 — i18n 翻译补充

**Files:**
- Modify: `web/src/locales/zh-Hans.json`
- Modify: `web/src/locales/en.json`

**Interfaces:**
- Produces: 心情功能相关的所有翻译 key

- [ ] **Step 1: 添加中文翻译**

在 `zh-Hans.json` 中添加：

```json
{
  "mood": {
    "select": "选择心情",
    "level": "心情档位",
    "filter": "心情筛选",
    "chart": {
      "title": "心情趋势",
      "day": "日视图",
      "week": "周视图",
      "expand": "展开图表"
    }
  },
  "setting.memo.mood-emojis": "心情 Emoji 配置",
  "setting.memo.mood-emojis-description": "自定义 7 个心情档位的表情符号。留空使用默认值。"
}
```

- [ ] **Step 2: 添加英文翻译（同样结构）**

- [ ] **Step 3: 提交**

```bash
git add web/src/locales/
git commit -m "feat(i18n): add mood feature translations for zh-Hans and en"
```

---

### Task 15: 收尾 — 全量验证与清理

**Files:**
- 无新增文件

- [ ] **Step 1: 运行全部后端测试**

```bash
go test -v -race ./server/... ./store/... ./internal/...
```

- [ ] **Step 2: 运行前端 lint 和测试**

```bash
cd web && pnpm lint && pnpm test
```

- [ ] **Step 3: 前端构建验证**

```bash
cd web && pnpm build
```

- [ ] **Step 4: 后端构建验证**

```bash
go build ./cmd/memos
```

- [ ] **Step 5: 提交收尾**

```bash
git add -A
git commit -m "chore: final verification and cleanup for life-platform phase 1+2"
```

---

## 依赖关系

```
Phase 1:
Task 1 (OAuth2) ── 独立，可先做
Task 2 (proto allowed_visibilities) ──┐
                                       ├── Task 3 (backend validation)
                                       ├── Task 4 (settings UI)
                                       └── Task 5 (visibility selector)

Phase 2:
Task 6 (proto mood) ──┬── Task 7 (migrations)
                      ├── Task 8 (backend converter)
                      └── Task 9 (frontend mood selector)
                              │
                              ├── Task 10 (settings UI)
                              ├── Task 11 (mood filter)
                              ├── Task 12 (calendar emoji)
                              └── Task 13 (mood chart)
                                      │
                                      └── Task 14 (i18n) ── Task 15 (verify)
```

Phase 1 和 Phase 2 互不依赖，可并行或顺序执行。Phase 2 内部 Task 9-13 都依赖 Task 6-9 完成后开始。
