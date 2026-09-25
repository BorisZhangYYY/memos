import { BellIcon, EyeOffIcon, HeartIcon, ShieldCheckIcon, WalletCardsIcon } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateUserGeneralSetting } from "@/hooks/useUserQueries";
import { type UserSetting_GeneralSetting, UserSetting_GeneralSetting_PersonalFeaturePrivacy } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";
import SettingSection from "./SettingSection";

const PersonalFeaturesSection = () => {
  const t = useTranslate();
  const { currentUser, userGeneralSetting, refetchSettings } = useAuth();
  const { mutateAsync: update, isPending } = useUpdateUserGeneralSetting(currentUser?.name);

  const save = async (generalSetting: Partial<UserSetting_GeneralSetting>, updateMask: string[]) => {
    await update({ generalSetting, updateMask });
    await refetchSettings();
  };

  const setFeature = async (field: "disableReminders" | "disableFinance" | "disableMood", enabled: boolean) => {
    const mask = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    await save({ [field]: !enabled }, [mask]);
  };

  const disableAll = async () => {
    await save({ disableReminders: true, disableFinance: true, disableMood: true }, [
      "disable_reminders",
      "disable_finance",
      "disable_mood",
    ]);
    toast.success(t("setting.personal-features.all-disabled"));
  };

  const privacyEnabled =
    (userGeneralSetting?.personalFeaturePrivacy ?? UserSetting_GeneralSetting_PersonalFeaturePrivacy.VISIBLE) !==
    UserSetting_GeneralSetting_PersonalFeaturePrivacy.VISIBLE;

  return (
    <SettingSection
      title={t("setting.personal-features.label")}
      description={t("setting.personal-features.description")}
      actions={
        <Button variant="outline" size="sm" onClick={() => void disableAll()} disabled={isPending}>
          {t("setting.personal-features.disable-all")}
        </Button>
      }
    >
      <SettingGroup title={t("setting.personal-features.features-title")} description={t("setting.personal-features.features-description")}>
        <SettingList>
          <SettingListItem
            icon={<BellIcon className="size-4" />}
            label={t("setting.personal-features.reminders")}
            description={t("setting.personal-features.reminders-description")}
          >
            <Switch
              checked={!userGeneralSetting?.disableReminders}
              disabled={isPending}
              onCheckedChange={(enabled) => void setFeature("disableReminders", enabled)}
            />
          </SettingListItem>
          <SettingListItem
            icon={<WalletCardsIcon className="size-4" />}
            label={t("setting.personal-features.finance")}
            description={t("setting.personal-features.finance-description")}
          >
            <Switch
              checked={!userGeneralSetting?.disableFinance}
              disabled={isPending}
              onCheckedChange={(enabled) => void setFeature("disableFinance", enabled)}
            />
          </SettingListItem>
          <SettingListItem
            icon={<HeartIcon className="size-4" />}
            label={t("setting.personal-features.mood")}
            description={t("setting.personal-features.mood-description")}
          >
            <Switch
              checked={!userGeneralSetting?.disableMood}
              disabled={isPending}
              onCheckedChange={(enabled) => void setFeature("disableMood", enabled)}
            />
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup
        title={t("setting.personal-features.privacy-title")}
        description={t("setting.personal-features.privacy-description")}
        showSeparator
      >
        <SettingList>
          <SettingListItem
            icon={<EyeOffIcon className="size-4" />}
            label={t("setting.personal-features.home-privacy")}
            description={t("setting.personal-features.home-privacy-description")}
          >
            <Switch
              checked={privacyEnabled}
              disabled={isPending}
              onCheckedChange={(enabled) =>
                void save(
                  {
                    personalFeaturePrivacy: enabled
                      ? UserSetting_GeneralSetting_PersonalFeaturePrivacy.BLURRED
                      : UserSetting_GeneralSetting_PersonalFeaturePrivacy.VISIBLE,
                  },
                  ["personal_feature_privacy"],
                )
              }
            />
          </SettingListItem>
          <SettingListItem
            icon={<ShieldCheckIcon className="size-4" />}
            label={t("setting.personal-features.password-unlock")}
            description={t("setting.personal-features.password-unlock-description")}
          >
            <Switch
              checked={userGeneralSetting?.requirePasswordForPrivateContent ?? false}
              disabled={isPending}
              onCheckedChange={(enabled) =>
                void save({ requirePasswordForPrivateContent: enabled }, ["require_password_for_private_content"])
              }
            />
          </SettingListItem>
        </SettingList>
      </SettingGroup>
    </SettingSection>
  );
};

export default PersonalFeaturesSection;
