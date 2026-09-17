import { create } from "@bufbuild/protobuf";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { useUpdateUserGeneralSetting } from "@/hooks/useUserQueries";
import { UserSetting_GeneralSetting, UserSetting_GeneralSettingSchema } from "@/types/proto/api/v1/user_service_pb";
import { loadLocale, useTranslate } from "@/utils/i18n";
import { convertVisibilityFromString, DEFAULT_VISIBILITY_OPTIONS } from "@/utils/memo";
import { loadTheme } from "@/utils/theme";
import { isMemoVisibilityEnabled, resolveDefaultMemoVisibility } from "@/utils/visibility";
import LocaleSelect from "../LocaleSelect";
import ThemeSelect from "../ThemeSelect";
import VisibilityIcon from "../VisibilityIcon";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";
import SettingSection from "./SettingSection";

const PreferencesSection = () => {
  const t = useTranslate();
  const { currentUser, userGeneralSetting: generalSetting, refetchSettings } = useAuth();
  const { mutate: updateUserGeneralSetting, isPending: isUpdatingGeneralSetting } = useUpdateUserGeneralSetting(currentUser?.name);
  const { memoRelatedSetting } = useInstance();
  const allowedVis = memoRelatedSetting.allowedVisibilities || [];

  const handleLocaleSelectChange = (locale: Locale) => {
    // Apply locale immediately for instant UI feedback and persist to localStorage
    loadLocale(locale);
    // Persist to user settings
    updateUserGeneralSetting(
      { generalSetting: { locale }, updateMask: ["locale"] },
      {
        onSuccess: () => {
          refetchSettings();
        },
      },
    );
  };

  // PUBLIC follows the instance-wide switch; PRIVATE and PROTECTED remain
  // available as personal defaults.
  const visibilityOptions = useMemo(
    () =>
      DEFAULT_VISIBILITY_OPTIONS.filter((option) => isMemoVisibilityEnabled(option.name, allowedVis)).map((option) => ({
        value: option.name,
        label: t(option.labelKey),
      })),
    [allowedVis, t],
  );
  const handleDefaultMemoVisibilityChanged = (value: string) => {
    updateUserGeneralSetting(
      { generalSetting: { memoVisibility: value }, updateMask: ["memo_visibility"] },
      {
        onSuccess: () => {
          refetchSettings();
        },
      },
    );
  };

  const handleThemeChange = (theme: string) => {
    // Apply theme immediately for instant UI feedback
    loadTheme(theme);
    // Persist to user settings
    updateUserGeneralSetting(
      { generalSetting: { theme }, updateMask: ["theme"] },
      {
        onSuccess: () => {
          refetchSettings();
        },
      },
    );
  };

  const handleSaveMediaMetadataChange = (saveMediaMetadata: boolean) => {
    updateUserGeneralSetting(
      { generalSetting: { saveMediaMetadata }, updateMask: ["save_media_metadata"] },
      {
        onSuccess: async () => {
          await refetchSettings();
        },
      },
    );
  };

  // Provide default values if setting is not loaded yet
  const setting: UserSetting_GeneralSetting =
    generalSetting ||
    create(UserSetting_GeneralSettingSchema, {
      locale: "en",
      memoVisibility: "PRIVATE",
      theme: "system",
      saveMediaMetadata: false,
    });
  const effectiveMemoVisibility = resolveDefaultMemoVisibility(setting.memoVisibility || "PRIVATE", allowedVis);
  const isSavedDefaultTemporarilyDisabled = effectiveMemoVisibility !== (setting.memoVisibility || "PRIVATE");

  return (
    <SettingSection title={t("setting.preference.label")}>
      <SettingGroup title={t("setting.preference.appearance-title")} description={t("setting.preference.appearance-description")}>
        <SettingList>
          <SettingListItem label={t("common.language")} description={t("setting.preference.language-description")}>
            <LocaleSelect value={setting.locale} onChange={handleLocaleSelectChange} />
          </SettingListItem>

          <SettingListItem label={t("setting.preference.theme")} description={t("setting.preference.theme-description")}>
            <ThemeSelect value={setting.theme} onValueChange={handleThemeChange} />
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup
        title={t("setting.preference.memo-defaults-title")}
        description={t("setting.preference.memo-defaults-description")}
        showSeparator
      >
        <SettingList>
          <SettingListItem
            label={t("setting.preference.default-memo-visibility")}
            description={
              <>
                {t("setting.preference.default-memo-visibility-description")}
                {isSavedDefaultTemporarilyDisabled && (
                  <span className="block text-amber-700 dark:text-amber-300">
                    {t("setting.preference.default-memo-visibility-disabled")}
                  </span>
                )}
              </>
            }
          >
            <Select value={effectiveMemoVisibility} items={visibilityOptions} onValueChange={handleDefaultMemoVisibilityChanged}>
              <SelectTrigger className="min-w-fit">
                <div className="flex items-center gap-2">
                  <VisibilityIcon visibility={convertVisibilityFromString(effectiveMemoVisibility)} />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {visibilityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="whitespace-nowrap">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup
        title={t("setting.preference.uploads-privacy-title")}
        description={t("setting.preference.uploads-privacy-description")}
        showSeparator
      >
        <SettingList>
          <SettingListItem
            label={t("setting.preference.save-media-metadata")}
            description={t("setting.preference.save-media-metadata-description")}
          >
            <Switch
              aria-label={t("setting.preference.save-media-metadata")}
              checked={setting.saveMediaMetadata}
              disabled={isUpdatingGeneralSetting}
              onCheckedChange={handleSaveMediaMetadataChange}
            />
          </SettingListItem>
        </SettingList>
      </SettingGroup>
    </SettingSection>
  );
};

export default PreferencesSection;
