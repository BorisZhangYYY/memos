import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  ArrowUpIcon,
  HistoryIcon,
  ListIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
  WalletCardsIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useFinanceCategories,
  useFinanceSummary,
  useFinanceTransactionHistory,
  useFinanceTransactions,
  useFinanceWallets,
} from "@/hooks/useFinanceQueries";
import { financeRange, formatCNY } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";
import { FinanceTransaction_Type } from "@/types/proto/api/v1/finance_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  parent: string;
  onAdd: () => void;
  embedded?: boolean;
}

interface HistoryTotal {
  count: number;
  income: bigint;
  expense: bigint;
}

const emptyHistoryTotal = (): HistoryTotal => ({ count: 0, income: 0n, expense: 0n });

const addToHistoryTotal = (total: HistoryTotal, type: FinanceTransaction_Type, amount: bigint) => {
  total.count += 1;
  if (type === FinanceTransaction_Type.INCOME) total.income += amount;
  if (type === FinanceTransaction_Type.EXPENSE) total.expense += amount;
};

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(new Date(year, month, 1));

const FinanceDashboard = ({ parent, onAdd, embedded = false }: Props) => {
  const t = useTranslate();
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const todayRange = useMemo(() => financeRange("today"), []);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsView, setDetailsView] = useState<"7" | "30" | "history">("7");
  const detailsWindow = detailsView === "7" ? 7 : 30;
  const detailsRange = useMemo(() => financeRange(detailsWindow), [detailsWindow]);
  const [historyYear, setHistoryYear] = useState(todayRange.start.getFullYear());
  const [historyMonth, setHistoryMonth] = useState<number>();
  const [historyDate, setHistoryDate] = useState<string>();
  const { data: wallets = [] } = useFinanceWallets(parent);
  const { data: categories = [] } = useFinanceCategories(parent);
  const { data: todaySummary } = useFinanceSummary(parent, todayRange.start, todayRange.end, timeZone);
  const { data: todayTransactions = [] } = useFinanceTransactions(parent, { start: todayRange.start, end: todayRange.end, pageSize: 100 });
  const { data: detailsSummary } = useFinanceSummary(parent, detailsRange.start, detailsRange.end, timeZone);
  const { data: historyTransactions = [], isLoading: historyLoading } = useFinanceTransactionHistory(
    parent,
    detailsOpen && detailsView === "history",
  );

  const walletNames = useMemo(() => new Map(wallets.map((wallet) => [wallet.name, wallet.displayName])), [wallets]);
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.name, category.displayName])), [categories]);
  const detailsRows = useMemo(() => {
    const byDate = new Map(detailsSummary?.dailySummaries.map((item) => [item.date, item]));
    const rows: Array<{ date: string; income: bigint; expense: bigint }> = [];
    for (let cursor = dayjs(detailsRange.start); cursor.isBefore(detailsRange.end); cursor = cursor.add(1, "day")) {
      const date = cursor.format("YYYY-MM-DD");
      const item = byDate.get(date);
      rows.push({ date, income: item?.incomeMinor ?? 0n, expense: item?.expenseMinor ?? 0n });
    }
    return rows.reverse();
  }, [detailsRange.end, detailsRange.start, detailsSummary?.dailySummaries]);

  const historyYears = useMemo(
    () =>
      [
        ...new Set(
          historyTransactions.flatMap((transaction) => (transaction.occurTime ? [timestampDate(transaction.occurTime).getFullYear()] : [])),
        ),
      ].sort((a, b) => b - a),
    [historyTransactions],
  );

  useEffect(() => {
    if (historyYears.length > 0 && !historyYears.includes(historyYear)) setHistoryYear(historyYears[0]);
  }, [historyYear, historyYears]);

  const historyMonths = useMemo(() => {
    const totals = Array.from({ length: 12 }, emptyHistoryTotal);
    for (const transaction of historyTransactions) {
      if (!transaction.occurTime) continue;
      const date = timestampDate(transaction.occurTime);
      if (date.getFullYear() !== historyYear) continue;
      addToHistoryTotal(totals[date.getMonth()], transaction.type, transaction.amountMinor);
    }
    return totals;
  }, [historyTransactions, historyYear]);

  const historyDays = useMemo(() => {
    if (historyMonth === undefined) return [];
    const totals = new Map<string, HistoryTotal>();
    for (const transaction of historyTransactions) {
      if (!transaction.occurTime) continue;
      const date = timestampDate(transaction.occurTime);
      if (date.getFullYear() !== historyYear || date.getMonth() !== historyMonth) continue;
      const key = localDateKey(date);
      const total = totals.get(key) ?? emptyHistoryTotal();
      addToHistoryTotal(total, transaction.type, transaction.amountMinor);
      totals.set(key, total);
    }
    return [...totals.entries()].map(([date, total]) => ({ date, ...total })).sort((a, b) => b.date.localeCompare(a.date));
  }, [historyMonth, historyTransactions, historyYear]);

  const historyDateTransactions = useMemo(
    () =>
      historyDate
        ? historyTransactions
            .filter((transaction) => transaction.occurTime && localDateKey(timestampDate(transaction.occurTime)) === historyDate)
            .sort((a, b) => {
              const aSeconds = a.occurTime?.seconds ?? 0n;
              const bSeconds = b.occurTime?.seconds ?? 0n;
              if (aSeconds === bSeconds) return 0;
              return aSeconds < bSeconds ? 1 : -1;
            })
        : [],
    [historyDate, historyTransactions],
  );

  const transactionPresentation = (transaction: (typeof todayTransactions)[number]) => {
    switch (transaction.type) {
      case FinanceTransaction_Type.INCOME:
        return {
          icon: ArrowUpIcon,
          label: t("finance.type.income"),
          amount: `+${formatCNY(transaction.amountMinor)}`,
          color: "text-emerald-600 dark:text-emerald-400",
        };
      case FinanceTransaction_Type.EXPENSE:
        return {
          icon: ArrowDownIcon,
          label: t("finance.type.expense"),
          amount: `-${formatCNY(transaction.amountMinor)}`,
          color: "text-rose-600 dark:text-rose-400",
        };
      case FinanceTransaction_Type.TRANSFER:
        return {
          icon: ArrowRightLeftIcon,
          label: t("finance.type.transfer"),
          amount: formatCNY(transaction.amountMinor),
          color: "text-foreground",
        };
      default: {
        const signedDelta = transaction.adjustmentDeltaMinor;
        return {
          icon: WrenchIcon,
          label: t("finance.adjustment.action"),
          amount: `${signedDelta > 0n ? "+" : ""}${formatCNY(signedDelta)}`,
          color: "text-primary",
        };
      }
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex h-full min-h-64 flex-col rounded-xl border border-border bg-card p-4 text-card-foreground",
          embedded && "rounded-none border-0",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold">
              {!embedded && (
                <>
                  <WalletCardsIcon className="size-5 shrink-0 text-primary" />
                  <span className="truncate">{t("finance.dashboard.title")}</span>
                </>
              )}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {t("mood.chart.today")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" }).format(todayRange.start)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onAdd}
              title={t("finance.dashboard.add")}
              aria-label={t("finance.dashboard.add")}
            >
              <PlusIcon />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>
              <ListIcon />
              {t("finance.dashboard.view-details")}
            </Button>
          </div>
        </div>

        {wallets.length === 0 ? (
          <div className="mt-4 flex min-h-36 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground">
            <WalletCardsIcon className="size-6" />
            <Link to={`${ROUTES.SETTING}#finance`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <SettingsIcon />
              {t("finance.dashboard.setup")}
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: t("finance.dashboard.total-balance"), value: todaySummary?.totalBalanceMinor ?? 0n, className: "text-foreground" },
                {
                  label: t("finance.dashboard.income"),
                  value: todaySummary?.incomeMinor ?? 0n,
                  className: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  label: t("finance.dashboard.expense"),
                  value: todaySummary?.expenseMinor ?? 0n,
                  className: "text-rose-600 dark:text-rose-400",
                },
                { label: t("finance.dashboard.net"), value: todaySummary?.netMinor ?? 0n, className: "text-primary" },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-lg bg-muted/50 p-3">
                  <div className="truncate text-xs text-muted-foreground">{item.label}</div>
                  <div className={cn("mt-1 truncate font-mono text-base font-semibold", item.className)}>{formatCNY(item.value)}</div>
                </div>
              ))}
            </div>

            {todayTransactions.length === 0 ? (
              <div className="flex min-h-24 flex-1 items-center justify-center text-sm text-muted-foreground">
                {t("finance.dashboard.empty-today")}
              </div>
            ) : (
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                {todayTransactions.map((transaction) => {
                  const presentation = transactionPresentation(transaction);
                  const categoryName = categoryNames.get(transaction.category);
                  const destinationName = walletNames.get(transaction.destinationWallet);
                  const title = transaction.note || categoryName || presentation.label;
                  return (
                    <div key={transaction.name} className="flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2.5">
                      <span className={cn("flex size-8 items-center justify-center rounded-full bg-muted", presentation.color)}>
                        <presentation.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {walletNames.get(transaction.wallet) ?? transaction.wallet.split("/").pop()}
                          {destinationName ? ` → ${destinationName}` : ""} ·{" "}
                          {transaction.occurTime
                            ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
                                timestampDate(transaction.occurTime),
                              )
                            : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn("font-mono text-sm font-semibold", presentation.color)}>{presentation.amount}</div>
                        <div className="text-[11px] text-muted-foreground">{formatCNY(transaction.balanceAfterMinor)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent size="full" className="h-[min(42rem,calc(100vh-2rem))] gap-3 md:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-base">{t("finance.insights.title")}</DialogTitle>
            <DialogDescription className="text-xs">{t("finance.insights.description")}</DialogDescription>
          </DialogHeader>

          <Tabs
            value={detailsView}
            onValueChange={(value) => {
              setDetailsView(value as "7" | "30" | "history");
              setHistoryMonth(undefined);
              setHistoryDate(undefined);
            }}
          >
            <TabsList>
              <TabsTrigger value="7">{t("mood.chart.week")}</TabsTrigger>
              <TabsTrigger value="30">{t("mood.chart.trend")}</TabsTrigger>
              <TabsTrigger value="history">
                <HistoryIcon />
                {t("finance.insights.more-history")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {detailsView === "history" ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {historyLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  {t("finance.insights.loading")}
                </div>
              ) : historyDate ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setHistoryDate(undefined)}>
                      <ArrowLeftIcon />
                      {t("finance.insights.back-to-month")}
                    </Button>
                    <span className="text-sm font-medium">
                      {new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(
                        new Date(`${historyDate}T00:00:00`),
                      )}
                    </span>
                  </div>
                  {historyDateTransactions.length === 0 ? (
                    <div className="flex min-h-40 items-center justify-center rounded-xl border text-sm text-muted-foreground">
                      {t("finance.insights.empty-history")}
                    </div>
                  ) : (
                    <div className="divide-y rounded-xl border bg-background">
                      {historyDateTransactions.map((transaction) => {
                        const presentation = transactionPresentation(transaction);
                        const categoryName = categoryNames.get(transaction.category);
                        const destinationName = walletNames.get(transaction.destinationWallet);
                        const title = transaction.note || categoryName || presentation.label;
                        return (
                          <div key={transaction.name} className="flex items-center gap-3 px-3 py-2.5">
                            <span className={cn("flex size-8 items-center justify-center rounded-full bg-muted", presentation.color)}>
                              <presentation.icon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{title}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {walletNames.get(transaction.wallet) ?? transaction.wallet.split("/").pop()}
                                {destinationName ? ` → ${destinationName}` : ""} ·{" "}
                                {transaction.occurTime
                                  ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
                                      timestampDate(transaction.occurTime),
                                    )
                                  : ""}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={cn("font-mono text-sm font-semibold", presentation.color)}>{presentation.amount}</div>
                              <div className="text-[11px] text-muted-foreground">{formatCNY(transaction.balanceAfterMinor)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(historyYears.length > 0 ? historyYears : [todayRange.start.getFullYear()]).map((year) => (
                      <Button
                        key={year}
                        size="sm"
                        variant={historyYear === year ? "secondary" : "outline"}
                        onClick={() => {
                          setHistoryYear(year);
                          setHistoryMonth(undefined);
                        }}
                      >
                        {year}
                      </Button>
                    ))}
                  </div>

                  {historyMonth === undefined ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {historyMonths.map((total, month) => (
                        <button
                          type="button"
                          key={month}
                          disabled={total.count === 0}
                          onClick={() => setHistoryMonth(month)}
                          className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-45"
                        >
                          <div className="text-sm font-medium">{monthLabel(historyYear, month)}</div>
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            {total.count > 0 ? `${total.count} ${t("finance.insights.entries")}` : t("finance.insights.empty-history")}
                          </div>
                          {total.count > 0 && (
                            <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[11px]">
                              <span className="text-emerald-600 dark:text-emerald-400">+{formatCNY(total.income)}</span>
                              <span className="text-rose-600 dark:text-rose-400">-{formatCNY(total.expense)}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setHistoryMonth(undefined)}>
                          <ArrowLeftIcon />
                          {t("finance.insights.all-months")}
                        </Button>
                        <span className="text-sm font-medium">{monthLabel(historyYear, historyMonth)}</span>
                      </div>
                      {historyDays.length === 0 ? (
                        <div className="flex min-h-48 items-center justify-center rounded-xl border text-sm text-muted-foreground">
                          {t("finance.insights.empty-history")}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {historyDays.map((day) => (
                            <button
                              type="button"
                              key={day.date}
                              onClick={() => setHistoryDate(day.date)}
                              className="rounded-lg border bg-background p-2.5 text-left transition-colors hover:bg-accent"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                  {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" }).format(
                                    new Date(`${day.date}T00:00:00`),
                                  )}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {day.count} {t("finance.insights.entries")}
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-right font-mono text-[11px]">
                                <span className="text-emerald-600 dark:text-emerald-400">+{formatCNY(day.income)}</span>
                                <span className="text-rose-600 dark:text-rose-400">-{formatCNY(day.expense)}</span>
                                <span className="font-semibold">{formatCNY(day.income - day.expense)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                {[
                  {
                    label: t("finance.dashboard.total-balance"),
                    value: detailsSummary?.totalBalanceMinor ?? 0n,
                    className: "text-foreground",
                  },
                  {
                    label: t("finance.dashboard.income"),
                    value: detailsSummary?.incomeMinor ?? 0n,
                    className: "text-emerald-600 dark:text-emerald-400",
                  },
                  {
                    label: t("finance.dashboard.expense"),
                    value: detailsSummary?.expenseMinor ?? 0n,
                    className: "text-rose-600 dark:text-rose-400",
                  },
                  { label: t("finance.dashboard.net"), value: detailsSummary?.netMinor ?? 0n, className: "text-primary" },
                ].map((item) => (
                  <div key={item.label} className="min-w-0 rounded-lg bg-muted/60 p-2.5">
                    <div className="truncate text-[11px] text-muted-foreground">{item.label}</div>
                    <div className={cn("mt-0.5 truncate font-mono text-base font-semibold", item.className)}>{formatCNY(item.value)}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {wallets.map((wallet) => (
                  <div key={wallet.name} className="min-w-40 shrink-0 rounded-lg border bg-background px-3 py-2">
                    <div className="truncate text-xs text-muted-foreground">{wallet.displayName}</div>
                    <div className="mt-0.5 truncate font-mono text-sm font-semibold">{formatCNY(wallet.balanceMinor)}</div>
                  </div>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
                <div className="divide-y">
                  {detailsRows.map((row) => {
                    const net = row.income - row.expense;
                    return (
                      <div
                        key={row.date}
                        className="grid grid-cols-[minmax(7rem,1fr)_repeat(3,minmax(5rem,auto))] items-center gap-3 p-2.5 sm:gap-5 sm:px-3"
                      >
                        <div className="text-sm font-medium">
                          {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" }).format(
                            new Date(`${row.date}T00:00:00`),
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-muted-foreground">{t("finance.dashboard.income")}</div>
                          <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{formatCNY(row.income)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-muted-foreground">{t("finance.dashboard.expense")}</div>
                          <div className="font-mono text-xs text-rose-600 dark:text-rose-400">{formatCNY(row.expense)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-muted-foreground">{t("finance.dashboard.net")}</div>
                          <div className="font-mono text-xs font-semibold">{formatCNY(net)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FinanceDashboard;
