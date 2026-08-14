import { create } from "@bufbuild/protobuf";
import { BracesIcon, EyeIcon, PencilLineIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import PersonaCard from "@/components/PersonaCard";
import PersonaInterestInput from "@/components/PersonaInterestInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateUserPersonaSetting } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { normalizePersonaInterestTags } from "@/lib/persona";
import { type UserSetting_PersonaSetting, UserSetting_PersonaSettingSchema } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";

const PERSONA_FIELDS = [
  "headline",
  "preferred_address",
  "communication_style",
  "interest_tags",
  "routine_preferences",
  "life_stage",
  "goals",
];

const toLines = (values: string[]) => values.join("\n");
const parseGoals = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona?: UserSetting_PersonaSetting;
}

const EditPersonaDialog = ({ open, onOpenChange, persona }: Props) => {
  const t = useTranslate();
  const { currentUser, refetchSettings } = useAuth();
  const updatePersona = useUpdateUserPersonaSetting(currentUser?.name);
  const [draft, setDraft] = useState(() => create(UserSetting_PersonaSettingSchema, persona ?? {}));
  const [interestTags, setInterestTags] = useState(() => normalizePersonaInterestTags(persona?.interestTags ?? []));
  const [goals, setGoals] = useState(toLines(persona?.goals ?? []));
  const [view, setView] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (!open) return;
    setDraft(create(UserSetting_PersonaSettingSchema, persona ?? {}));
    setInterestTags(normalizePersonaInterestTags(persona?.interestTags ?? []));
    setGoals(toLines(persona?.goals ?? []));
    setView("edit");
  }, [open, persona]);

  const previewPersona = create(UserSetting_PersonaSettingSchema, {
    ...draft,
    interestTags,
    goals: parseGoals(goals),
  });

  const updateDraft = (partial: Partial<UserSetting_PersonaSetting>) => setDraft((current) => ({ ...current, ...partial }));

  const handleSave = async () => {
    try {
      await updatePersona.mutateAsync({
        personaSetting: create(UserSetting_PersonaSettingSchema, {
          ...draft,
          interestTags,
          goals: parseGoals(goals),
        }),
        updateMask: PERSONA_FIELDS,
      });
      await refetchSettings();
      toast.success(t("message.update-succeed"));
      onOpenChange(false);
    } catch (error) {
      handleError(error, toast.error, { context: "Update persona", fallbackMessage: t("profile.persona.save-failed") });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="h-[min(92dvh,58rem)] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-14 sm:px-7">
          <DialogTitle>{t("profile.persona.edit-title")}</DialogTitle>
          <DialogDescription>{t("profile.persona.edit-description")}</DialogDescription>
          <Tabs value={view} onValueChange={(value) => setView(value as "edit" | "preview")} className="pt-2 sm:hidden">
            <TabsList className="w-full rounded-lg bg-muted p-1">
              <TabsTrigger value="edit" className="flex-1">
                <PencilLineIcon className="size-4" />
                {t("profile.persona.edit-tab")}
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">
                <EyeIcon className="size-4" />
                {t("profile.persona.preview-tab")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 sm:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <div
            className={
              view === "preview"
                ? "hidden sm:min-h-0 sm:overflow-y-auto sm:border-r sm:border-border sm:px-7 sm:py-5 sm:block"
                : "min-h-0 overflow-y-auto border-r border-border px-5 py-5 sm:px-7"
            }
          >
            <div className="space-y-7 pb-3">
              <section className="space-y-4">
                <div>
                  <h3 className="font-semibold text-foreground">{t("profile.persona.identity-section")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("profile.persona.identity-section-description")}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="persona-headline">{t("profile.persona.headline")}</Label>
                    <Textarea
                      id="persona-headline"
                      rows={2}
                      maxLength={280}
                      value={draft.headline}
                      onChange={(event) => updateDraft({ headline: event.target.value })}
                      placeholder={t("profile.persona.headline-placeholder")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="persona-address">{t("profile.persona.preferred-address")}</Label>
                    <Input
                      id="persona-address"
                      maxLength={80}
                      value={draft.preferredAddress}
                      onChange={(event) => updateDraft({ preferredAddress: event.target.value })}
                      placeholder={t("profile.persona.preferred-address-placeholder")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="persona-interests">{t("profile.persona.interest-tags")}</Label>
                    <PersonaInterestInput
                      id="persona-interests"
                      value={interestTags}
                      onChange={setInterestTags}
                      placeholder={t("profile.persona.interest-tags-placeholder")}
                      removeLabel={(tag) => t("profile.persona.remove-interest-tag", { tag })}
                    />
                    <p className="text-xs text-muted-foreground">{t("profile.persona.interest-tags-help")}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t border-border pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{t("profile.persona.context-section")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("profile.persona.context-section-description")}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                    <BracesIcon className="size-3.5" />
                    Markdown
                  </span>
                </div>
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="persona-style">{t("profile.persona.communication-style")}</Label>
                    <Textarea
                      id="persona-style"
                      rows={5}
                      maxLength={1000}
                      value={draft.communicationStyle}
                      onChange={(event) => updateDraft({ communicationStyle: event.target.value })}
                      placeholder={t("profile.persona.communication-style-placeholder")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="persona-routine">{t("profile.persona.routine-preferences")}</Label>
                    <Textarea
                      id="persona-routine"
                      rows={6}
                      maxLength={2000}
                      value={draft.routinePreferences}
                      onChange={(event) => updateDraft({ routinePreferences: event.target.value })}
                      placeholder={t("profile.persona.routine-preferences-placeholder")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="persona-stage">{t("profile.persona.life-stage")}</Label>
                    <Textarea
                      id="persona-stage"
                      rows={5}
                      maxLength={1000}
                      value={draft.lifeStage}
                      onChange={(event) => updateDraft({ lifeStage: event.target.value })}
                      placeholder={t("profile.persona.life-stage-placeholder")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="persona-goals">{t("profile.persona.goals")}</Label>
                    <Textarea
                      id="persona-goals"
                      rows={6}
                      value={goals}
                      onChange={(event) => setGoals(event.target.value)}
                      placeholder={t("profile.persona.goals-placeholder")}
                    />
                    <p className="text-xs text-muted-foreground">{t("profile.persona.goals-help")}</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <aside
            className={
              view === "edit"
                ? "hidden sm:min-h-0 sm:overflow-y-auto sm:bg-muted/20 sm:px-5 sm:py-5 sm:block"
                : "min-h-0 overflow-y-auto bg-muted/20 px-4 py-5"
            }
          >
            <div className="mb-3 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:flex">
              <EyeIcon className="size-4" />
              {t("profile.persona.live-preview")}
            </div>
            <PersonaCard persona={previewPersona} onEdit={() => setView("edit")} onExport={() => undefined} preview />
          </aside>
        </div>
        <DialogFooter className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-7">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={updatePersona.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={updatePersona.isPending}>
            {updatePersona.isPending ? t("profile.persona.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditPersonaDialog;
