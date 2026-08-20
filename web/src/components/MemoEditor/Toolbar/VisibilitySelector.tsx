import { CheckIcon, ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import VisibilityIcon from "@/components/VisibilityIcon";
import { useInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { convertVisibilityToString } from "@/utils/memo";
import { isMemoVisibilityEnabled } from "@/utils/visibility";
import type { VisibilitySelectorProps } from "../types";

const VisibilitySelector = (props: VisibilitySelectorProps) => {
  const { value, onChange } = props;
  const compact = props.size === "compact";
  const t = useTranslate();
  const { memoRelatedSetting } = useInstance();
  const allowedVis = memoRelatedSetting.allowedVisibilities || [];

  const allVisibilityOptions = useMemo(
    () => [
      { value: Visibility.PRIVATE, label: t("memo.visibility.private"), description: t("memo.visibility.private-description") },
      { value: Visibility.PROTECTED, label: t("memo.visibility.protected"), description: t("memo.visibility.protected-description") },
      { value: Visibility.PUBLIC, label: t("memo.visibility.public"), description: t("memo.visibility.public-description") },
    ],
    [t],
  );

  // The instance policy is binary: PRIVATE and PROTECTED always remain
  // available, while PUBLIC can be disabled by the administrator.
  const visibilityOptions = allVisibilityOptions.filter((option) =>
    isMemoVisibilityEnabled(convertVisibilityToString(option.value), allowedVis),
  );
  const currentOption = allVisibilityOptions.find((option) => option.value === value);
  const currentVisibilityAllowed = visibilityOptions.some((option) => option.value === value);

  return (
    <DropdownMenu onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center rounded-md hover:bg-accent transition-colors",
              compact ? "px-1.5 py-[3px] text-[13px] leading-5 text-foreground/85" : "h-8 px-2 text-sm text-muted-foreground",
              !currentVisibilityAllowed && "text-amber-700 dark:text-amber-300",
            )}
            title={
              !currentVisibilityAllowed && currentOption
                ? t("memo.visibility.disabled-current-title", { visibility: currentOption.label })
                : undefined
            }
          />
        }
      >
        <VisibilityIcon visibility={value} className={cn("opacity-60 mr-1.5", compact && "w-[13px]")} />
        <span className="truncate">{currentOption?.label}</span>
        {!currentVisibilityAllowed && <TriangleAlertIcon className={cn("ml-1 text-amber-600", compact ? "size-3" : "size-3.5")} />}
        <ChevronDownIcon className={cn("ml-0.5 opacity-60", compact ? "size-3.5 text-muted-foreground/70" : "w-4 h-4")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {!currentVisibilityAllowed && currentOption && (
          <>
            <div role="note" className="mx-1 mb-1 max-w-72 rounded-md bg-amber-500/10 px-2.5 py-2 text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <TriangleAlertIcon className="size-3.5 shrink-0" />
                <span>{t("memo.visibility.disabled-current-title", { visibility: currentOption.label })}</span>
              </div>
              <p className="mt-1 text-xs leading-4 text-amber-800/80 dark:text-amber-200/80">
                {t("memo.visibility.disabled-current-description", { visibility: currentOption.label })}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <VisibilityIcon visibility={currentOption.value} />
              <div className="flex flex-col">
                <span>{currentOption.label}</span>
                <span className="text-xs text-muted-foreground">{t("memo.visibility.disabled-by-policy")}</span>
              </div>
              <CheckIcon className="ml-auto w-4 h-4 text-amber-600" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {visibilityOptions.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>
            <VisibilityIcon visibility={option.value} />
            <div className="flex flex-col">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </div>
            {value === option.value && <CheckIcon className="ml-auto w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default VisibilitySelector;
