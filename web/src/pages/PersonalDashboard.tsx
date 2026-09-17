import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { ArrowLeftIcon, ArrowRightIcon, BellRingIcon, HeartIcon, LockKeyholeIcon, PlusIcon, WalletIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { MonthCalendar } from "@/components/ActivityCalendar/MonthCalendar";
import FinanceTransactionDialog from "@/components/Finance/FinanceTransactionDialog";
import { DEFAULT_MOOD_EMOJIS } from "@/components/MemoEditor/Toolbar/MoodSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { financeServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { financeKeys, useFinanceCategories, useFinanceSummary, useFinanceWallets } from "@/hooks/useFinanceQueries";
import { useCompleteReminder, useReminderStats, useReminders } from "@/hooks/useReminderQueries";
import { useUserStats } from "@/hooks/useUserQueries";
import { formatCNY } from "@/lib/finance";
import { ROUTES } from "@/router/routes";
import { useTranslate } from "@/utils/i18n";

const PAGE_SIZE = 12;

const PersonalDashboard = () => {
  const t = useTranslate();
  const user = useCurrentUser();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("date") ?? "";
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dayjs(dateParam).isValid() ? dayjs(dateParam) : dayjs();
  const mode = params.get("range") === "day" ? "day" : "month";
  const start = selected.startOf(mode).toDate();
  const end = selected.startOf(mode).add(1, mode).toDate();
  const startKey = dayjs(start).format("YYYY-MM-DD");
  const endKey = dayjs(end).format("YYYY-MM-DD");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const moodLevel = Number(params.get("mood") ?? 0);
  const page = Math.max(0, Number(params.get("page")) || 0);
  const [financeTokens, setFinanceTokens] = useState<string[]>([""]);
  const tokenRange = `${user?.name}:${startKey}:${endKey}`;
  const [previousRange, setPreviousRange] = useState(tokenRange);
  if (previousRange !== tokenRange) {
    setPreviousRange(tokenRange);
    setFinanceTokens([""]);
  }
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting.moodEmojis.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  // Deliberately unscoped: personal data must not inherit the remembered Space or feed filters.
  const stats = useUserStats(user?.name);
  const wallets = useFinanceWallets(user?.name);
  const categories = useFinanceCategories(user?.name);
  const summary = useFinanceSummary(user?.name, start, end, timeZone);
  const reminders = useReminders(user?.name);
  const outcomes = useReminderStats(user?.name, startKey, dayjs(end).subtract(1, "day").format("YYYY-MM-DD"));
  const complete = useCompleteReminder();
  const transactions = useQuery({
    queryKey: [...financeKeys.transactions(user?.name ?? ""), "dashboard", startKey, endKey, financeTokens.at(-1)],
    queryFn: () =>
      financeServiceClient.listFinanceTransactions({
        parent: user?.name,
        startTime: timestampFromDate(start),
        endTime: timestampFromDate(end),
        pageSize: PAGE_SIZE,
        pageToken: financeTokens.at(-1),
      }),
    enabled: !!user,
  });
  const points = useMemo(
    () =>
      (stats.data?.memoCreatedTimestamps ?? [])
        .flatMap((timestamp, index) => {
          const level = stats.data?.moodLevels[index] ?? 0;
          return level > 0 ? [{ date: timestampDate(timestamp), level, memo: stats.data?.moodMemoNames[index] }] : [];
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [stats.data],
  );
  const days: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const point of points) {
    const key = dayjs(point.date).format("YYYY-MM-DD");
    days[key] = (days[key] ?? 0) + 1;
    totals[key] = (totals[key] ?? 0) + point.level;
  }
  const moodData = Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, total / days[key]]));
  const visiblePoints = points.filter((p) => p.date >= start && p.date < end && (!moodLevel || p.level === moodLevel));
  const categoryNames = new Map(categories.data?.map((c) => [c.name, `${c.emoji ? `${c.emoji} ` : ""}${c.displayName}`]));
  const walletNames = new Map(wallets.data?.map((w) => [w.name, w.displayName]));
  const pending = [...(reminders.data ?? [])].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const [reminderPage, setReminderPage] = useState(0);
  const returnLocation = `${location.pathname}${location.search}`;
  const setRange = (date: string, range = mode) =>
    setParams((next) => {
      next.set("date", date);
      next.set("range", range);
      next.delete("page");
      return next;
    });
  const hasError = [stats, wallets, categories, summary, reminders, outcomes, transactions].some((q) => q.isError);
  const loading = [stats, wallets, summary, reminders].some((q) => q.isLoading);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 [overflow-wrap:anywhere]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <LockKeyholeIcon className="size-4" />
            {t("personal.private")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("personal.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("personal.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("personal.previous-period")}
            onClick={() => setRange(selected.subtract(1, mode).format("YYYY-MM-DD"))}
          >
            <ArrowLeftIcon />
          </Button>
          <Input
            className="w-auto"
            type={mode === "month" ? "month" : "date"}
            aria-label={t("personal.date")}
            value={selected.format(mode === "month" ? "YYYY-MM" : "YYYY-MM-DD")}
            onChange={(event) => {
              if (event.target.value) setRange(mode === "month" ? `${event.target.value}-01` : event.target.value);
            }}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={t("personal.next-period")}
            onClick={() => setRange(selected.add(1, mode).format("YYYY-MM-DD"))}
          >
            <ArrowRightIcon />
          </Button>
          <Button variant="outline" onClick={() => setRange(dayjs().format("YYYY-MM-DD"), "day")}>
            {t("personal.today")}
          </Button>
          <Button variant="outline" onClick={() => setRange(selected.format("YYYY-MM-DD"), mode === "month" ? "day" : "month")}>
            {t(mode === "month" ? "personal.day" : "personal.month")}
          </Button>
        </div>
      </header>
      {hasError && (
        <p role="alert" className="rounded-xl border border-destructive p-4 text-destructive">
          {t("personal.load-error")}{" "}
          <Button
            variant="outline"
            onClick={() => {
              for (const q of [stats, wallets, categories, summary, reminders, outcomes, transactions]) void q.refetch();
            }}
          >
            {t("personal.retry")}
          </Button>
        </p>
      )}
      {loading && <p role="status">{t("personal.loading")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [t("personal.mood-count"), stats.isError ? "—" : visiblePoints.length, "#mood"],
          [t("personal.income"), summary.data ? formatCNY(summary.data.incomeMinor) : "—", "#finance"],
          [t("personal.expense"), summary.data ? formatCNY(summary.data.expenseMinor) : "—", "#finance"],
          [t("personal.pending-global"), reminders.isError ? "—" : pending.length, "#reminders"],
        ].map(([label, value, href]) => (
          <a key={label} href={String(href)} className="min-w-0 rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/40">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
          </a>
        ))}
      </div>
      <section id="mood" className="scroll-mt-4 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold">
          <HeartIcon className="size-5 text-rose-500" />
          {t("personal.mood")}
        </h2>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <MonthCalendar
            month={selected.format("YYYY-MM")}
            data={days}
            maxCount={Math.max(1, ...Object.values(days))}
            moodData={moodData}
            selectedDate={mode === "day" ? selected.format("YYYY-MM-DD") : undefined}
            onClick={(date) => setRange(date, "day")}
          />
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((level) => (
                <Button
                  key={level}
                  variant={moodLevel === level ? "secondary" : "outline"}
                  className="h-auto min-h-8 whitespace-normal px-3 py-1.5"
                  aria-pressed={moodLevel === level}
                  onClick={() =>
                    setParams((next) => {
                      next.set("mood", String(level));
                      next.delete("page");
                      return next;
                    })
                  }
                >
                  {level ? (
                    <>
                      {emojis[level - 1]} {t(`mood.level-${level}` as Parameters<typeof t>[0])}
                    </>
                  ) : (
                    t("personal.all-moods")
                  )}
                </Button>
              ))}
            </div>
            {visiblePoints.length === 0 && !stats.isLoading && !stats.isError && (
              <p className="py-6 text-muted-foreground">{t("personal.empty-mood")}</p>
            )}
            <ul className="divide-y">
              {visiblePoints.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((point) => (
                <li key={`${point.memo}:${point.date.getTime()}`} className="py-3">
                  <Link
                    to={`/${point.memo}`}
                    state={{ from: returnLocation }}
                    className="flex flex-wrap items-center justify-between gap-3 hover:text-primary"
                  >
                    <span>
                      {emojis[point.level - 1]} {t(`mood.level-${point.level}` as Parameters<typeof t>[0])}
                    </span>
                    <time className="text-sm text-muted-foreground">{point.date.toLocaleString()}</time>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() =>
                  setParams((next) => {
                    next.set("page", String(page - 1));
                    return next;
                  })
                }
              >
                {t("personal.previous")}
              </Button>
              <Button
                variant="outline"
                disabled={(page + 1) * PAGE_SIZE >= visiblePoints.length}
                onClick={() =>
                  setParams((next) => {
                    next.set("page", String(page + 1));
                    return next;
                  })
                }
              >
                {t("personal.next")}
              </Button>
            </div>
          </div>
        </div>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section id="finance" className="min-w-0 scroll-mt-4 space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <WalletIcon className="size-5 text-emerald-600" />
              {t("personal.finance")}
            </h2>
            <Button render={<Link to={`${ROUTES.PERSONAL}?${params.toString()}&entry=finance`} />}>
              <PlusIcon />
              {t("personal.add-transaction")}
            </Button>
          </div>
          <p>
            {t("personal.net")}:{" "}
            <strong className="tabular-nums">{summary.data ? formatCNY(summary.data.incomeMinor - summary.data.expenseMinor) : "—"}</strong>
          </p>
          <div className="space-y-2">
            {wallets.data?.map((wallet) => (
              <div key={wallet.name} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 p-3">
                <span>{wallet.displayName}</span>
                <span className="font-medium tabular-nums">{formatCNY(wallet.balanceMinor)}</span>
              </div>
            ))}
          </div>
          <Link className="block text-sm text-primary underline underline-offset-4" to={`${ROUTES.SETTING}#finance`}>
            {t("personal.finance-settings")}
          </Link>
          {params.get("entry") === "finance" && user && (
            <FinanceTransactionDialog
              inline
              open
              parent={user.name}
              onOpenChange={(open) => {
                if (!open)
                  setParams((next) => {
                    next.delete("entry");
                    return next;
                  });
              }}
            />
          )}
          <ul className="divide-y">
            {transactions.data?.transactions.map((transaction) => (
              <li key={transaction.name} className="space-y-1 py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {t(
                      (transaction.type === 4
                        ? "finance.adjustment.title"
                        : `finance.type.${transaction.type === 1 ? "income" : transaction.type === 2 ? "expense" : "transfer"}`) as Parameters<
                        typeof t
                      >[0],
                    )}
                    {transaction.category ? ` · ${categoryNames.get(transaction.category) ?? transaction.category}` : ""}
                  </span>
                  <strong className="tabular-nums">
                    {transaction.type === 2 ? "−" : transaction.type === 1 ? "+" : ""}
                    {formatCNY(transaction.type === 4 ? transaction.adjustmentDeltaMinor : transaction.amountMinor)}
                  </strong>
                </div>
                <p className="text-sm text-muted-foreground">
                  {walletNames.get(transaction.wallet)}
                  {transaction.destinationWallet
                    ? ` → ${walletNames.get(transaction.destinationWallet) ?? transaction.destinationWallet}`
                    : ""}
                  {transaction.occurTime ? ` · ${timestampDate(transaction.occurTime).toLocaleString()}` : ""}
                </p>
                {transaction.note && <p className="whitespace-pre-wrap">{transaction.note}</p>}
              </li>
            ))}
          </ul>
          {!transactions.isLoading && !transactions.isError && !transactions.data?.transactions.length && (
            <p className="text-muted-foreground">{t("personal.empty-finance")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={financeTokens.length === 1}
              onClick={() => setFinanceTokens((tokens) => tokens.slice(0, -1))}
            >
              {t("personal.previous")}
            </Button>
            <Button
              variant="outline"
              disabled={!transactions.data?.nextPageToken}
              onClick={() => setFinanceTokens((tokens) => [...tokens, transactions.data?.nextPageToken ?? ""])}
            >
              {t("personal.next")}
            </Button>
          </div>
        </section>
        <section id="reminders" className="min-w-0 scroll-mt-4 space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <BellRingIcon className="size-5 text-blue-500" />
              {t("personal.reminders")}
            </h2>
            <Button render={<Link to={ROUTES.REMINDERS} />}>{t("personal.manage-reminders")}</Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("personal.reminders-scope")}</p>
          <ul className="divide-y">
            {pending.slice(reminderPage * PAGE_SIZE, (reminderPage + 1) * PAGE_SIZE).map((reminder) => (
              <li key={reminder.name} className="flex items-start gap-3 py-3">
                <input
                  className="mt-1 size-4 shrink-0"
                  type="checkbox"
                  checked={false}
                  disabled={complete.isPending}
                  aria-label={`${t("personal.complete")}: ${reminder.title}`}
                  onChange={() => complete.mutate({ name: reminder.name })}
                />
                <Link to={`${ROUTES.REMINDERS}?selected=${encodeURIComponent(reminder.name)}`} className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap">{reminder.title}</p>
                  {reminder.dueDate && <p className="mt-1 text-sm text-muted-foreground">{reminder.dueDate}</p>}
                </Link>
              </li>
            ))}
          </ul>
          {!reminders.isLoading && !reminders.isError && !pending.length && (
            <p className="text-muted-foreground">{t("personal.empty-reminders")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={reminderPage === 0} onClick={() => setReminderPage((p) => p - 1)}>
              {t("personal.previous")}
            </Button>
            <Button
              variant="outline"
              disabled={(reminderPage + 1) * PAGE_SIZE >= pending.length}
              onClick={() => setReminderPage((p) => p + 1)}
            >
              {t("personal.next")}
            </Button>
          </div>
          <h3 className="font-medium">{t("personal.outcomes-range")}</h3>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["reminder.stats-status-on-time", outcomes.data?.completedOnTimeCount],
              ["reminder.stats-late", outcomes.data?.completedLateCount],
              ["reminder.stats-skipped", outcomes.data?.skippedCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <dt className="text-sm text-muted-foreground">{t(label as Parameters<typeof t>[0])}</dt>
                <dd className="mt-2 text-xl font-semibold">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <Link className="block text-primary underline underline-offset-4" to={`${ROUTES.REMINDERS}?view=statistics`}>
            {t("personal.completion-history")}
          </Link>
        </section>
      </div>
    </div>
  );
};
export default PersonalDashboard;
