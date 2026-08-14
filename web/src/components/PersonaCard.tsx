import { DownloadIcon, LockKeyholeIcon, PencilIcon, UserRoundIcon } from "lucide-react";
import PersonaMarkdown from "@/components/PersonaMarkdown";
import { Button } from "@/components/ui/button";
import { normalizePersonaInterestTags } from "@/lib/persona";
import { cn } from "@/lib/utils";
import type { UserSetting_PersonaSetting } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  persona?: UserSetting_PersonaSetting;
  onEdit: () => void;
  onExport: () => void;
  preview?: boolean;
}

const hasPersonaContent = (persona?: UserSetting_PersonaSetting) =>
  !!persona &&
  [
    persona.headline,
    persona.preferredAddress,
    persona.communicationStyle,
    persona.routinePreferences,
    persona.lifeStage,
    ...persona.interestTags,
    ...persona.goals,
  ].some((value) => value.trim() !== "");

const PersonaCard = ({ persona, onEdit, onExport, preview = false }: Props) => {
  const t = useTranslate();
  const populated = hasPersonaContent(persona);
  const interestTags = normalizePersonaInterestTags(persona?.interestTags ?? []);
  const details = [
    { label: t("profile.persona.communication-style"), value: persona?.communicationStyle },
    { label: t("profile.persona.routine-preferences"), value: persona?.routinePreferences },
    { label: t("profile.persona.life-stage"), value: persona?.lifeStage },
  ].filter((item) => item.value?.trim());

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UserRoundIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{t("profile.persona.title")}</h2>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockKeyholeIcon className="size-3" />
              {t("profile.persona.private-note")}
            </p>
          </div>
        </div>
        {!preview && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExport} disabled={!populated} className="gap-1.5">
              <DownloadIcon className="size-3.5" />
              {t("profile.persona.export")}
            </Button>
            <Button size="sm" onClick={onEdit} className="gap-1.5">
              <PencilIcon className="size-3.5" />
              {populated ? t("common.edit") : t("profile.persona.create")}
            </Button>
          </div>
        )}
      </header>

      <div className="p-4">
        {populated ? (
          <div className="space-y-4">
            {(persona?.headline || persona?.preferredAddress) && (
              <div className="space-y-2 border-b border-border pb-4">
                {persona?.headline && <PersonaMarkdown content={persona.headline} className="text-base font-medium" />}
                {persona?.preferredAddress && (
                  <p className="text-sm text-muted-foreground">
                    {t("profile.persona.preferred-address")}
                    <span className="ml-1.5 font-medium text-foreground">{persona.preferredAddress}</span>
                  </p>
                )}
              </div>
            )}
            {interestTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-border pb-4">
                {interestTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-foreground/80">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {(details.length > 0 || (persona && persona.goals.length > 0)) && (
              <dl className="divide-y divide-border">
                {details.map((item) => (
                  <div key={item.label} className="py-3 first:pt-0 last:pb-0">
                    <dt className="mb-1 text-xs font-medium text-muted-foreground">{item.label}</dt>
                    <dd className="min-w-0">
                      <PersonaMarkdown content={item.value ?? ""} />
                    </dd>
                  </div>
                ))}
                {persona && persona.goals.length > 0 && (
                  <div className="py-3 first:pt-0 last:pb-0">
                    <dt className="mb-1 text-xs font-medium text-muted-foreground">{t("profile.persona.goals")}</dt>
                    <dd className="min-w-0 space-y-1">
                      {persona.goals.map((goal, index) => (
                        <PersonaMarkdown key={`${index}-${goal}`} content={goal} />
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className={cn(
              "w-full rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-left transition-colors",
              "hover:border-primary/40 hover:bg-accent/50",
            )}
          >
            <p className="text-sm font-medium text-foreground">{t("profile.persona.empty-title")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("profile.persona.empty-description")}</p>
          </button>
        )}
      </div>
    </section>
  );
};

export default PersonaCard;
