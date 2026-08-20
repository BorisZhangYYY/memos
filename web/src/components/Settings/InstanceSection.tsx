import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { identityProviderServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import useDialog from "@/hooks/useDialog";
import { IdentityProvider } from "@/types/proto/api/v1/idp_service_pb";
import {
  InstanceSetting_GeneralSetting,
  InstanceSetting_GeneralSettingSchema,
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import { isPublicMemoEnabled } from "@/utils/visibility";
import UpdateCustomizedProfileDialog from "../UpdateCustomizedProfileDialog";
import SettingGroup from "./SettingGroup";
import { SettingCodeEditor, SettingList, SettingListItem } from "./SettingList";
import SettingSection from "./SettingSection";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

const normalizeInstanceURL = (raw: string): string | undefined => {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return undefined;
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
};

const InstanceSection = () => {
  const t = useTranslate();
  const customizeDialog = useDialog();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { generalSetting: originalSetting, memoRelatedSetting, profile } = useInstance();
  const [instanceGeneralSetting, setInstanceGeneralSetting] = useState<InstanceSetting_GeneralSetting>(originalSetting);
  const originalPublicAccessEnabled = isPublicMemoEnabled(memoRelatedSetting.allowedVisibilities);
  const [publicAccessEnabled, setPublicAccessEnabled] = useState(originalPublicAccessEnabled);
  const [identityProviderList, setIdentityProviderList] = useState<IdentityProvider[]>([]);
  const effectiveInstanceURL = instanceGeneralSetting.instanceUrl ?? profile.instanceUrl;
  const normalizedInstanceURL = normalizeInstanceURL(effectiveInstanceURL);
  const instanceURLInvalid = normalizedInstanceURL === undefined;

  useEffect(() => {
    setInstanceGeneralSetting(originalSetting);
  }, [originalSetting]);

  useEffect(() => {
    setPublicAccessEnabled(originalPublicAccessEnabled);
  }, [originalPublicAccessEnabled]);

  const fetchIdentityProviderList = async () => {
    const { identityProviders } = await identityProviderServiceClient.listIdentityProviders({});
    setIdentityProviderList(identityProviders);
  };

  useEffect(() => {
    fetchIdentityProviderList();
  }, []);

  const weekStartDayOptions = useMemo(
    () => [
      { value: "-1", label: t("setting.instance.saturday") },
      { value: "0", label: t("setting.instance.sunday") },
      { value: "1", label: t("setting.instance.monday") },
    ],
    [t],
  );

  const updatePartialSetting = (partial: Partial<InstanceSetting_GeneralSetting>) => {
    setInstanceGeneralSetting(
      create(InstanceSetting_GeneralSettingSchema, {
        ...instanceGeneralSetting,
        ...partial,
      }),
    );
  };

  const handleSaveSettings = async () => {
    if (instanceURLInvalid) {
      toast.error(t("setting.instance.instance-url-invalid"));
      return;
    }

    const savePublicAccessSetting = () =>
      saveInstanceSetting({
        key: InstanceSetting_Key.MEMO_RELATED,
        setting: create(InstanceSettingSchema, {
          name: buildInstanceSettingName(InstanceSetting_Key.MEMO_RELATED),
          value: {
            case: "memoRelatedSetting",
            value: create(InstanceSetting_MemoRelatedSettingSchema, {
              ...memoRelatedSetting,
              allowedVisibilities: publicAccessEnabled ? [] : ["PRIVATE", "PROTECTED"],
            }),
          },
        }),
        errorContext: "Update public access setting",
        showSuccess: false,
      });

    // Close public access first, but only open it after the URL has saved.
    // This prevents a combined update from exposing content in between requests.
    if (publicAccessEnabled !== originalPublicAccessEnabled && !publicAccessEnabled && !(await savePublicAccessSetting())) {
      return;
    }

    if (!isEqual(instanceGeneralSetting, originalSetting)) {
      const settingToSave =
        instanceGeneralSetting.instanceUrl === undefined
          ? instanceGeneralSetting
          : create(InstanceSetting_GeneralSettingSchema, { ...instanceGeneralSetting, instanceUrl: normalizedInstanceURL });
      if (
        !(await saveInstanceSetting({
          key: InstanceSetting_Key.GENERAL,
          setting: create(InstanceSettingSchema, {
            name: buildInstanceSettingName(InstanceSetting_Key.GENERAL),
            value: {
              case: "generalSetting",
              value: settingToSave,
            },
          }),
          errorContext: "Update general settings",
          showSuccess: false,
        }))
      ) {
        return;
      }
    }

    if (publicAccessEnabled !== originalPublicAccessEnabled && publicAccessEnabled && !(await savePublicAccessSetting())) {
      return;
    }

    if (!isEqual(instanceGeneralSetting, originalSetting) || publicAccessEnabled !== originalPublicAccessEnabled) {
      toast.success(t("message.update-succeed"));
    }
  };

  return (
    <SettingSection title={t("setting.system.label")}>
      <SettingGroup title={t("common.basic")} description={t("setting.system.basic-description")}>
        <SettingList>
          <SettingListItem label={t("setting.system.server-name")} description={instanceGeneralSetting.customProfile?.title || "Memos"}>
            <Button variant="outline" onClick={customizeDialog.open}>
              {t("common.edit")}
            </Button>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup title={t("setting.system.custom-code-title")} description={t("setting.system.custom-code-description")} showSeparator>
        <SettingCodeEditor
          label={t("setting.system.additional-style")}
          description={t("setting.system.additional-style-description")}
          placeholder={t("setting.system.additional-style-placeholder")}
          value={instanceGeneralSetting.additionalStyle}
          onChange={(additionalStyle) => updatePartialSetting({ additionalStyle })}
        />

        <SettingCodeEditor
          label={t("setting.system.additional-script")}
          description={t("setting.system.additional-script-description")}
          placeholder={t("setting.system.additional-script-placeholder")}
          value={instanceGeneralSetting.additionalScript}
          onChange={(additionalScript) => updatePartialSetting({ additionalScript })}
        />
      </SettingGroup>

      <SettingGroup title={t("setting.instance.access-title")} description={t("setting.instance.access-description")} showSeparator>
        <SettingList>
          <SettingListItem
            label={t("setting.instance.instance-url")}
            description={
              <>
                {t("setting.instance.instance-url-description")}
                {instanceURLInvalid && <span className="block text-destructive">{t("setting.instance.instance-url-invalid")}</span>}
              </>
            }
            controlClassName="w-full sm:w-96"
          >
            <Input
              type="url"
              aria-label={t("setting.instance.instance-url")}
              placeholder="https://memos.example.com"
              value={effectiveInstanceURL}
              onChange={(event) => updatePartialSetting({ instanceUrl: event.target.value })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.public-access")}
            description={
              effectiveInstanceURL
                ? t("setting.instance.public-access-description")
                : `${t("setting.instance.public-access-description")} ${t("setting.instance.public-access-instance-url-required")}`
            }
          >
            <Switch
              aria-label={t("setting.instance.public-access")}
              checked={publicAccessEnabled}
              onCheckedChange={setPublicAccessEnabled}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-user-registration")}
            description={t("setting.instance.disallow-user-registration-description")}
          >
            <Switch
              disabled={profile.demo}
              checked={instanceGeneralSetting.disallowUserRegistration}
              onCheckedChange={(checked) => updatePartialSetting({ disallowUserRegistration: checked })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-password-auth")}
            description={t("setting.instance.disallow-password-auth-description")}
          >
            <Switch
              disabled={profile.demo || (identityProviderList.length === 0 && !instanceGeneralSetting.disallowPasswordAuth)}
              checked={instanceGeneralSetting.disallowPasswordAuth}
              onCheckedChange={(checked) => updatePartialSetting({ disallowPasswordAuth: checked })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-change-username")}
            description={t("setting.instance.disallow-change-username-description")}
          >
            <Switch
              checked={instanceGeneralSetting.disallowChangeUsername}
              onCheckedChange={(checked) => updatePartialSetting({ disallowChangeUsername: checked })}
            />
          </SettingListItem>

          <SettingListItem
            label={t("setting.instance.disallow-change-nickname")}
            description={t("setting.instance.disallow-change-nickname-description")}
          >
            <Switch
              checked={instanceGeneralSetting.disallowChangeNickname}
              onCheckedChange={(checked) => updatePartialSetting({ disallowChangeNickname: checked })}
            />
          </SettingListItem>

          <SettingListItem label={t("setting.instance.week-start-day")} description={t("setting.instance.week-start-day-description")}>
            <Select
              value={instanceGeneralSetting.weekStartDayOffset.toString()}
              items={weekStartDayOptions}
              onValueChange={(value) => {
                updatePartialSetting({ weekStartDayOffset: parseInt(value) || 0 });
              }}
            >
              <SelectTrigger className="min-w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekStartDayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <div className="w-full flex justify-end">
        <Button
          disabled={
            instanceURLInvalid || (isEqual(instanceGeneralSetting, originalSetting) && publicAccessEnabled === originalPublicAccessEnabled)
          }
          onClick={handleSaveSettings}
        >
          {t("common.save")}
        </Button>
      </div>

      <UpdateCustomizedProfileDialog
        open={customizeDialog.isOpen}
        onOpenChange={customizeDialog.setOpen}
        onSuccess={() => {
          toast.success(t("message.update-succeed"));
        }}
      />
    </SettingSection>
  );
};

export default InstanceSection;
