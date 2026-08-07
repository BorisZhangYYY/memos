import { create } from "@bufbuild/protobuf";
import { isEqual, uniq } from "lodash-es";
import { CheckIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useInstance } from "@/contexts/InstanceContext";
import {
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSetting,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem, SettingPanel } from "./SettingList";
import SettingSection from "./SettingSection";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

const DEFAULT_MOOD_EMOJIS = ["😫", "😟", "😔", "😐", "😌", "☺️", "😆"];

type VisibilityPolicy = "all" | "no-public" | "private-only";

// Maps the stored allowed_visibilities list back to the single policy choice.
// An empty list means all levels are allowed. PUBLIC implies PROTECTED is
// allowed too (enforced server-side), so any list containing PUBLIC maps to
// the "all" policy.
const getVisibilityPolicy = (allowed: string[] | undefined): VisibilityPolicy => {
  if (!allowed || allowed.length === 0) return "all";
  if (allowed.includes("PUBLIC")) return "all";
  if (allowed.includes("PROTECTED")) return "no-public";
  return "private-only";
};

const allowedVisibilitiesForPolicy = (policy: VisibilityPolicy): string[] => {
  switch (policy) {
    case "all":
      return [];
    case "no-public":
      return ["PRIVATE", "PROTECTED"];
    case "private-only":
      return ["PRIVATE"];
  }
};

const visibilityPolicyOptions = (t: ReturnType<typeof useTranslate>) => [
  { value: "all", label: t("setting.memo.visibility-policy.all") },
  { value: "no-public", label: t("setting.memo.visibility-policy.no-public") },
  { value: "private-only", label: t("setting.memo.visibility-policy.private-only") },
];

const MemoRelatedSettings = () => {
  const t = useTranslate();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { memoRelatedSetting: originalSetting } = useInstance();
  const [memoRelatedSetting, setMemoRelatedSetting] = useState<InstanceSetting_MemoRelatedSetting>(originalSetting);
  const [editingReaction, setEditingReaction] = useState<string>("");

  useEffect(() => {
    setMemoRelatedSetting(originalSetting);
  }, [originalSetting]);

  const updatePartialSetting = (partial: Partial<InstanceSetting_MemoRelatedSetting>) => {
    const newInstanceMemoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      ...memoRelatedSetting,
      ...partial,
    });
    setMemoRelatedSetting(newInstanceMemoRelatedSetting);
  };

  const upsertReaction = () => {
    const trimmed = editingReaction.trim();
    if (!trimmed) {
      return;
    }

    updatePartialSetting({ reactions: uniq([...memoRelatedSetting.reactions, trimmed]) });
    setEditingReaction("");
  };

  const handleUpdateSetting = async () => {
    if (memoRelatedSetting.reactions.length === 0) {
      toast.error(t("setting.memo.reactions-required"));
      return;
    }

    // Normalize mood emojis so cleared inputs fall back to defaults instead of persisting blank entries.
    const normalizedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      ...memoRelatedSetting,
      moodEmojis: memoRelatedSetting.moodEmojis?.map((emoji, i) => emoji || DEFAULT_MOOD_EMOJIS[i]),
    });
    setMemoRelatedSetting(normalizedSetting);

    await saveInstanceSetting({
      key: InstanceSetting_Key.MEMO_RELATED,
      setting: create(InstanceSettingSchema, {
        name: buildInstanceSettingName(InstanceSetting_Key.MEMO_RELATED),
        value: {
          case: "memoRelatedSetting",
          value: normalizedSetting,
        },
      }),
      errorContext: "Update memo-related settings",
    });
  };

  // Visibility policy is a single choice: all levels, or progressively more
  // restricted. Disabling PUBLIC keeps PROTECTED allowed; disabling PROTECTED
  // also disables PUBLIC.
  const visibilityPolicy = getVisibilityPolicy(memoRelatedSetting.allowedVisibilities);

  const setVisibilityPolicy = (policy: VisibilityPolicy) => {
    updatePartialSetting({ allowedVisibilities: allowedVisibilitiesForPolicy(policy) });
  };

  const moodEmojis = memoRelatedSetting.moodEmojis?.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  const moodLevelLabels = [
    t("mood.level-1"),
    t("mood.level-2"),
    t("mood.level-3"),
    t("mood.level-4"),
    t("mood.level-5"),
    t("mood.level-6"),
    t("mood.level-7"),
  ];

  const updateMoodEmoji = (index: number, value: string) => {
    const next = [...moodEmojis];
    next[index] = value;
    updatePartialSetting({ moodEmojis: next });
  };

  return (
    <SettingSection title={t("setting.memo.label")}>
      <SettingGroup title={t("setting.memo.editing-title")} description={t("setting.memo.editing-description")}>
        <SettingList>
          <SettingListItem
            label={t("setting.system.enable-double-click-to-edit")}
            description={t("setting.memo.double-click-edit-description")}
          >
            <Switch
              checked={memoRelatedSetting.enableDoubleClickEdit}
              onCheckedChange={(checked) => updatePartialSetting({ enableDoubleClickEdit: checked })}
            />
          </SettingListItem>

          <SettingListItem label={t("setting.memo.content-length-limit")} description={t("setting.memo.content-length-limit-description")}>
            <div className="flex items-center gap-2">
              <Input
                className="w-28 font-mono"
                type="number"
                min={0}
                value={memoRelatedSetting.contentLengthLimit}
                onChange={(event) => updatePartialSetting({ contentLengthLimit: Number(event.target.value) })}
              />
              <span className="text-xs text-muted-foreground">{t("setting.memo.bytes-unit")}</span>
            </div>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup title={t("setting.memo.allowed-visibilities")} description={t("setting.memo.allowed-visibilities-description")}>
        <SettingList>
          <SettingListItem label={t("setting.memo.visibility-policy")}>
            <Select
              value={visibilityPolicy}
              items={visibilityPolicyOptions(t)}
              onValueChange={(value) => setVisibilityPolicy(value as VisibilityPolicy)}
            >
              <SelectTrigger size="sm" className="w-64" aria-label={t("setting.memo.visibility-policy")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibilityPolicyOptions(t).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup title={t("setting.memo.reactions")} description={t("setting.memo.reactions-description")} showSeparator>
        <SettingPanel
          header={
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{t("setting.memo.configured-reactions")}</span>
              <Badge variant="outline" className="rounded-md px-2 py-0 text-xs font-normal">
                {memoRelatedSetting.reactions.length}
              </Badge>
            </div>
          }
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="h-8 max-w-48 font-mono"
                placeholder={t("setting.memo.reaction-placeholder")}
                value={editingReaction}
                onChange={(event) => setEditingReaction(event.target.value)}
                onKeyDown={(e) => e.key === "Enter" && upsertReaction()}
              />
              <Button variant="outline" size="sm" onClick={upsertReaction} disabled={!editingReaction.trim()}>
                <CheckIcon className="w-4 h-4 mr-1.5" />
                {t("setting.memo.add-reaction")}
              </Button>
            </div>
          }
        >
          <div className="flex min-h-16 flex-wrap gap-2 px-3 py-3">
            {memoRelatedSetting.reactions.map((reactionType) => (
              <Badge key={reactionType} variant="outline" className="flex h-8 items-center gap-2 rounded-md px-2.5 font-normal">
                <span>{reactionType}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updatePartialSetting({ reactions: memoRelatedSetting.reactions.filter((r) => r !== reactionType) })}
                  aria-label={t("setting.memo.remove-reaction")}
                >
                  <X className="size-3.5" />
                </Button>
              </Badge>
            ))}
          </div>
        </SettingPanel>
      </SettingGroup>

      <SettingGroup title={t("setting.memo.mood-emojis")} description={t("setting.memo.mood-emojis-description")} showSeparator>
        <SettingList>
          {moodEmojis.map((emoji: string, i: number) => (
            <SettingListItem key={i} label={moodLevelLabels[i]}>
              <Input className="w-20 font-mono text-center text-lg" value={emoji} onChange={(e) => updateMoodEmoji(i, e.target.value)} />
            </SettingListItem>
          ))}
        </SettingList>
      </SettingGroup>

      <div className="w-full flex justify-end">
        <Button disabled={isEqual(memoRelatedSetting, originalSetting)} onClick={handleUpdateSetting}>
          {t("common.save")}
        </Button>
      </div>
    </SettingSection>
  );
};

export default MemoRelatedSettings;
