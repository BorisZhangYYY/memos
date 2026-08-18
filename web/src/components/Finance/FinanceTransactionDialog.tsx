import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { ArrowDownIcon, ArrowRightLeftIcon, ArrowUpIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useCreateFinanceTransaction, useFinanceCategories, useFinanceWallets } from "@/hooks/useFinanceQueries";
import { localDateTimeInputValue, parseYuanToMinor } from "@/lib/finance";
import { State } from "@/types/proto/api/v1/common_pb";
import { FinanceCategory_Type, FinanceTransaction_Type } from "@/types/proto/api/v1/finance_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parent: string;
  initialType?: FinanceTransaction_Type;
}

const FinanceTransactionDialog = ({ open, onOpenChange, parent, initialType = FinanceTransaction_Type.EXPENSE }: Props) => {
  const t = useTranslate();
  const { data: wallets = [] } = useFinanceWallets(parent);
  const { data: categories = [] } = useFinanceCategories(parent);
  const { mutateAsync: createTransaction, isPending } = useCreateFinanceTransaction();
  const activeWallets = useMemo(() => wallets.filter((wallet) => wallet.state === State.NORMAL), [wallets]);
  const [type, setType] = useState<FinanceTransaction_Type>(initialType);
  const [amount, setAmount] = useState("");
  const [wallet, setWallet] = useState("");
  const [destinationWallet, setDestinationWallet] = useState("");
  const [category, setCategory] = useState("");
  const [occurTime, setOccurTime] = useState(localDateTimeInputValue());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setAmount("");
    setWallet(activeWallets[0]?.name ?? "");
    setDestinationWallet("");
    setCategory("");
    setOccurTime(localDateTimeInputValue());
    setNote("");
  }, [open, initialType, activeWallets]);

  const categoryType = type === FinanceTransaction_Type.INCOME ? FinanceCategory_Type.INCOME : FinanceCategory_Type.EXPENSE;
  const matchingCategories = useMemo(
    () => categories.filter((item) => item.state === State.NORMAL && item.type === categoryType),
    [categories, categoryType],
  );
  useEffect(() => {
    if (type === FinanceTransaction_Type.TRANSFER) {
      setCategory("");
      return;
    }
    if (!matchingCategories.some((item) => item.name === category)) {
      setCategory(matchingCategories[0]?.name ?? "");
    }
  }, [type, category, matchingCategories]);
  const selectedCategory = matchingCategories.find((item) => item.name === category);

  const minor = parseYuanToMinor(amount);
  const canSubmit =
    minor !== undefined &&
    minor > 0n &&
    !!wallet &&
    !!occurTime &&
    (type === FinanceTransaction_Type.TRANSFER ? !!destinationWallet && destinationWallet !== wallet : !!category);

  const handleSubmit = async () => {
    if (!canSubmit || minor === undefined) return;
    try {
      await createTransaction({
        parent,
        transaction: {
          type,
          amountMinor: minor,
          wallet,
          destinationWallet: type === FinanceTransaction_Type.TRANSFER ? destinationWallet : "",
          category: type === FinanceTransaction_Type.TRANSFER ? "" : category,
          note: note.trim(),
          occurTime: timestampFromDate(new Date(occurTime)),
        },
      });
      toast.success(t("finance.transaction.saved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("finance.transaction.save-error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("finance.transaction.title")}</DialogTitle>
          <DialogDescription>{t("finance.transaction.description")}</DialogDescription>
        </DialogHeader>

        {activeWallets.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("finance.transaction.no-wallet")}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: FinanceTransaction_Type.EXPENSE, label: t("finance.type.expense"), icon: ArrowDownIcon },
                { value: FinanceTransaction_Type.INCOME, label: t("finance.type.income"), icon: ArrowUpIcon },
                { value: FinanceTransaction_Type.TRANSFER, label: t("finance.type.transfer"), icon: ArrowRightLeftIcon },
              ].map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={type === option.value ? "secondary" : "outline"}
                  onClick={() => setType(option.value)}
                >
                  <option.icon className="mr-1.5 size-4" />
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="finance-amount">{t("finance.amount")}</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                <Input
                  id="finance-amount"
                  className="pl-7 text-lg font-medium"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{type === FinanceTransaction_Type.TRANSFER ? t("finance.wallet.source") : t("finance.wallet.label")}</Label>
                <Select value={wallet} onValueChange={setWallet}>
                  <SelectTrigger className="w-full">
                    <span className="truncate">{activeWallets.find((item) => item.name === wallet)?.displayName}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {activeWallets.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {type === FinanceTransaction_Type.TRANSFER ? (
                <div className="space-y-1.5">
                  <Label>{t("finance.wallet.destination")}</Label>
                  <Select value={destinationWallet} onValueChange={setDestinationWallet}>
                    <SelectTrigger className="w-full">
                      <span className={destinationWallet ? "truncate" : "truncate text-muted-foreground"}>
                        {activeWallets.find((item) => item.name === destinationWallet)?.displayName ??
                          t("finance.wallet.select-destination")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {activeWallets
                        .filter((item) => item.name !== wallet)
                        .map((item) => (
                          <SelectItem key={item.name} value={item.name}>
                            {item.displayName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>{t("finance.category.label")}</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-full">
                      <span className={category ? "flex min-w-0 items-center gap-2" : "truncate text-muted-foreground"}>
                        {selectedCategory?.emoji && <span className="shrink-0 text-base">{selectedCategory.emoji}</span>}
                        <span className="truncate">{selectedCategory?.displayName ?? t("finance.category.select")}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {matchingCategories.map((item) => (
                        <SelectItem key={item.name} value={item.name}>
                          {item.emoji && <span className="text-base">{item.emoji}</span>}
                          <span>{item.displayName}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="finance-occur-time">{t("finance.occur-time")}</Label>
              <Input
                id="finance-occur-time"
                type="datetime-local"
                value={occurTime}
                onChange={(event) => setOccurTime(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="finance-note">{t("finance.note")}</Label>
              <Input
                id="finance-note"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("finance.note-placeholder")}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FinanceTransactionDialog;
