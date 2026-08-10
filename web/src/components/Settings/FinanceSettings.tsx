import { ArchiveIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon, RefreshCcwIcon, ScaleIcon, WalletCardsIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import useCurrentUser from "@/hooks/useCurrentUser";
import {
  useAdjustFinanceWalletBalance,
  useCreateFinanceCategory,
  useCreateFinanceWallet,
  useFinanceCategories,
  useFinanceWallets,
  useUpdateFinanceCategory,
  useUpdateFinanceWallet,
} from "@/hooks/useFinanceQueries";
import { formatCNY, minorToYuanInput, parseYuanToMinor } from "@/lib/finance";
import { State } from "@/types/proto/api/v1/common_pb";
import { FinanceCategory_Type, type FinanceWallet } from "@/types/proto/api/v1/finance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList } from "./SettingList";
import SettingSection from "./SettingSection";

const FinanceSettings = () => {
  const t = useTranslate();
  const user = useCurrentUser();
  const parent = user?.name ?? "";
  const { data: wallets = [] } = useFinanceWallets(parent);
  const { data: categories = [] } = useFinanceCategories(parent);
  const { mutateAsync: createWallet, isPending: creatingWallet } = useCreateFinanceWallet();
  const { mutateAsync: updateWallet } = useUpdateFinanceWallet();
  const { mutateAsync: createCategory, isPending: creatingCategory } = useCreateFinanceCategory();
  const { mutateAsync: updateCategory } = useUpdateFinanceCategory();
  const { mutateAsync: adjustBalance, isPending: adjusting } = useAdjustFinanceWalletBalance();
  const [walletName, setWalletName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0.00");
  const [allowNegative, setAllowNegative] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState(FinanceCategory_Type.EXPENSE);
  const [adjustWallet, setAdjustWallet] = useState<FinanceWallet>();
  const [actualBalance, setActualBalance] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const initialMinor = parseYuanToMinor(initialBalance);

  const groupedCategories = useMemo(
    () =>
      [FinanceCategory_Type.EXPENSE, FinanceCategory_Type.INCOME].map((type) => ({
        type,
        rows: categories.filter((item) => item.type === type),
      })),
    [categories],
  );

  const handleCreateWallet = async () => {
    if (!walletName.trim() || initialMinor === undefined || (initialMinor < 0n && !allowNegative)) return;
    try {
      await createWallet({
        parent,
        wallet: { displayName: walletName.trim(), initialBalanceMinor: initialMinor, allowNegativeBalance: allowNegative },
      });
      setWalletName("");
      setInitialBalance("0.00");
      setAllowNegative(false);
      toast.success(t("finance.wallet.created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("finance.wallet.create-error"));
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) return;
    try {
      await createCategory({ parent, category: { displayName: categoryName.trim(), type: categoryType } });
      setCategoryName("");
      toast.success(t("finance.category.created"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("finance.category.create-error"));
    }
  };

  const toggleWallet = async (wallet: FinanceWallet) => {
    await updateWallet({
      wallet: { name: wallet.name, state: wallet.state === State.NORMAL ? State.ARCHIVED : State.NORMAL },
      updateMask: ["state"],
    });
  };

  const handleAdjustment = async () => {
    const minor = parseYuanToMinor(actualBalance);
    if (!adjustWallet || minor === undefined) return;
    try {
      await adjustBalance({ wallet: adjustWallet.name, actualBalanceMinor: minor, note: adjustNote.trim() });
      setAdjustWallet(undefined);
      toast.success(t("finance.adjustment.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("finance.adjustment.save-error"));
    }
  };
  return (
    <SettingSection title={t("setting.finance.label")} description={t("setting.finance.description")}>
      <SettingGroup title={t("finance.wallet.management")} description={t("finance.wallet.management-description")}>
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(10rem,1fr)_10rem_auto_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="new-wallet-name">{t("finance.wallet.name")}</Label>
              <Input
                id="new-wallet-name"
                value={walletName}
                onChange={(event) => setWalletName(event.target.value)}
                placeholder={t("finance.wallet.name-placeholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="initial-balance">{t("finance.wallet.initial-balance")}</Label>
              <Input
                id="initial-balance"
                inputMode="decimal"
                value={initialBalance}
                onChange={(event) => setInitialBalance(event.target.value)}
              />
            </div>
            <label className="flex h-8 items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={allowNegative} onCheckedChange={setAllowNegative} />
              {t("finance.wallet.allow-negative")}
            </label>
            <Button onClick={handleCreateWallet} disabled={!walletName.trim() || initialMinor === undefined || creatingWallet}>
              <PlusIcon className="mr-1.5 size-4" />
              {t("common.add")}
            </Button>
          </div>
        </div>

        <SettingList>
          {wallets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <WalletCardsIcon className="size-5" />
              {t("finance.wallet.empty")}
            </div>
          ) : (
            wallets.map((wallet) => (
              <div key={wallet.name} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <WalletCardsIcon className="size-4 text-muted-foreground" />
                    <span className={wallet.state === State.ARCHIVED ? "text-muted-foreground line-through" : ""}>
                      {wallet.displayName}
                    </span>
                  </div>
                  <div className="mt-1 pl-6 text-xs text-muted-foreground">
                    {t("finance.wallet.current-balance")}:{" "}
                    <span className="font-mono text-foreground">{formatCNY(wallet.balanceMinor)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={wallet.state !== State.NORMAL}
                    onClick={() => {
                      setAdjustWallet(wallet);
                      setActualBalance(minorToYuanInput(wallet.balanceMinor));
                      setAdjustNote("");
                    }}
                  >
                    <ScaleIcon className="mr-1.5 size-4" />
                    {t("finance.adjustment.action")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleWallet(wallet)}>
                    {wallet.state === State.NORMAL ? (
                      <ArchiveIcon className="mr-1.5 size-4" />
                    ) : (
                      <RefreshCcwIcon className="mr-1.5 size-4" />
                    )}
                    {wallet.state === State.NORMAL ? t("common.archive") : t("common.restore")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </SettingList>
      </SettingGroup>

      <SettingGroup title={t("finance.category.management")} description={t("finance.category.management-description")} showSeparator>
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-[9rem_minmax(10rem,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>{t("finance.category.type")}</Label>
              <Select value={String(categoryType)} onValueChange={(value) => setCategoryType(Number(value) as FinanceCategory_Type)}>
                <SelectTrigger className="w-full">
                  <span className="truncate">
                    {categoryType === FinanceCategory_Type.INCOME ? t("finance.type.income") : t("finance.type.expense")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(FinanceCategory_Type.EXPENSE)}>{t("finance.type.expense")}</SelectItem>
                  <SelectItem value={String(FinanceCategory_Type.INCOME)}>{t("finance.type.income")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-category-name">{t("finance.category.name")}</Label>
              <Input
                id="new-category-name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder={t("finance.category.name-placeholder")}
              />
            </div>
            <Button onClick={handleCreateCategory} disabled={!categoryName.trim() || creatingCategory}>
              <PlusIcon className="mr-1.5 size-4" />
              {t("common.add")}
            </Button>
          </div>
        </div>

        {groupedCategories.map((group) => (
          <div key={group.type} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {group.type === FinanceCategory_Type.INCOME ? (
                <ArrowUpIcon className="size-4 text-emerald-500" />
              ) : (
                <ArrowDownIcon className="size-4 text-rose-500" />
              )}
              {group.type === FinanceCategory_Type.INCOME ? t("finance.type.income") : t("finance.type.expense")}
            </div>
            <SettingList>
              {group.rows.length === 0 ? (
                <div className="px-3 py-5 text-center text-sm text-muted-foreground">{t("finance.category.empty")}</div>
              ) : (
                group.rows.map((category) => (
                  <div key={category.name} className="flex items-center justify-between gap-3 px-3 py-3">
                    <span className={category.state === State.ARCHIVED ? "text-sm text-muted-foreground line-through" : "text-sm"}>
                      {category.displayName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateCategory({
                          category: { name: category.name, state: category.state === State.NORMAL ? State.ARCHIVED : State.NORMAL },
                          updateMask: ["state"],
                        })
                      }
                    >
                      {category.state === State.NORMAL ? (
                        <ArchiveIcon className="mr-1.5 size-4" />
                      ) : (
                        <RefreshCcwIcon className="mr-1.5 size-4" />
                      )}
                      {category.state === State.NORMAL ? t("common.archive") : t("common.restore")}
                    </Button>
                  </div>
                ))
              )}
            </SettingList>
          </div>
        ))}
      </SettingGroup>

      <Dialog open={!!adjustWallet} onOpenChange={(open) => !open && setAdjustWallet(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finance.adjustment.title", { wallet: adjustWallet?.displayName ?? "" })}</DialogTitle>
            <DialogDescription>{t("finance.adjustment.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("finance.adjustment.actual-balance")}</Label>
              <Input inputMode="decimal" value={actualBalance} onChange={(event) => setActualBalance(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("finance.note")}</Label>
              <Input
                maxLength={500}
                value={adjustNote}
                onChange={(event) => setAdjustNote(event.target.value)}
                placeholder={t("finance.adjustment.note-placeholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustWallet(undefined)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAdjustment} disabled={parseYuanToMinor(actualBalance) === undefined || adjusting}>
              {t("finance.adjustment.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingSection>
  );
};

export default FinanceSettings;
