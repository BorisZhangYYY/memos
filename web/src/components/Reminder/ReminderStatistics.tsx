import { ArrowLeftIcon, CalendarCheckIcon, CheckCircle2Icon, Clock3Icon, HistoryIcon, XCircleIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReminderOccurrences, useReminderStats } from "@/hooks/useReminderQueries";
import { type ReminderOccurrence, ReminderOccurrence_Status } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(new Date(year, month, 1));

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));

const ReminderStatistics = ({ parent }: { parent?: string }) => {
  const t = useTranslate();
  const [detailsView, setDetailsView] = useState<"7" | "30" | "history">("7");
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyMonth, setHistoryMonth] = useState<number>();
  const endDate = localDate(new Date());
  const start = new Date();
  if (detailsView !== "history") start.setDate(start.getDate() - (Number(detailsView) - 1));
  const startDate = detailsView === "history" ? "1970-01-01" : localDate(start);
  const { data: stats, isLoading } = useReminderStats(parent, startDate, endDate);
  const { data: occurrences = [] } = useReminderOccurrences(parent, startDate, endDate);
  const sortedOccurrences = useMemo(() => [...occurrences].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)), [occurrences]);
  const historyYears = useMemo(
    () =>
      [...new Set(sortedOccurrences.map((occurrence) => Number(occurrence.scheduledDate.slice(0, 4))).filter(Number.isFinite))].sort(
        (a, b) => b - a,
      ),
    [sortedOccurrences],
  );
  useEffect(() => {
    if (historyYears.length > 0 && !historyYears.includes(historyYear)) setHistoryYear(historyYears[0]);
  }, [historyYear, historyYears]);
  const historyMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) => ({
        month,
        occurrences: sortedOccurrences.filter((occurrence) => {
          const date = new Date(`${occurrence.scheduledDate}T00:00:00`);
          return date.getFullYear() === historyYear && date.getMonth() === month;
        }),
      })),
    [historyYear, sortedOccurrences],
  );
  const visibleOccurrences = useMemo(
    () =>
      detailsView === "history" && historyMonth !== undefined
        ? (historyMonths[historyMonth]?.occurrences ?? [])
        : detailsView === "history"
          ? []
          : sortedOccurrences,
    [detailsView, historyMonth, historyMonths, sortedOccurrences],
  );
  const dateGroups = useMemo(() => {
    const groups = new Map<string, ReminderOccurrence[]>();
    for (const occurrence of visibleOccurrences) {
      const group = groups.get(occurrence.scheduledDate) ?? [];
      group.push(occurrence);
      groups.set(occurrence.scheduledDate, group);
    }
    return [...groups.entries()];
  }, [visibleOccurrences]);
  const percent = (value = 0) => `${Math.round(value * 100)}%`;
  const cards = [
    {
      label: t("reminder.stats-status-on-time"),
      value: stats?.completedOnTimeCount ?? 0,
      icon: CheckCircle2Icon,
      tone: "text-emerald-500",
    },
    { label: t("reminder.stats-late"), value: stats?.completedLateCount ?? 0, icon: Clock3Icon, tone: "text-amber-500" },
    { label: t("reminder.stats-skipped"), value: stats?.skippedCount ?? 0, icon: XCircleIcon, tone: "text-rose-500" },
    {
      label: t("reminder.stats-final-rate"),
      value: percent(stats?.finalCompletionRate),
      icon: CalendarCheckIcon,
      tone: "text-foreground",
    },
  ];

  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">{t("reminder.loading")}</p>;
  return (
    <div className="space-y-6 py-5">
      <div>
        <Tabs value={detailsView} onValueChange={(value) => setDetailsView(value as "7" | "30" | "history")}>
          <TabsList>
            <TabsTrigger value="7">{t("mood.chart.week")}</TabsTrigger>
            <TabsTrigger value="30">{t("mood.chart.trend")}</TabsTrigger>
            <TabsTrigger value="history">
              <HistoryIcon />
              {t("reminder.stats-more-history")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {detailsView !== "history" && (
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
                <Icon className={`size-5 ${tone}`} />
                <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <section className="space-y-3">
        {detailsView === "history" && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(historyYears.length > 0 ? historyYears : [new Date().getFullYear()]).map((year) => (
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
            {historyMonth === undefined && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {historyMonths.map(({ month, occurrences: monthOccurrences }) => {
                  const completed = monthOccurrences.filter(
                    (item) =>
                      item.status === ReminderOccurrence_Status.COMPLETED_ON_TIME ||
                      item.status === ReminderOccurrence_Status.COMPLETED_LATE,
                  ).length;
                  return (
                    <button
                      type="button"
                      key={month}
                      disabled={monthOccurrences.length === 0}
                      onClick={() => setHistoryMonth(month)}
                      className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-45"
                    >
                      <div className="text-sm font-medium">{monthLabel(historyYear, month)}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {monthOccurrences.length} {t("reminder.stats-occurrences")}
                      </div>
                      {monthOccurrences.length > 0 && (
                        <div className="mt-1 flex gap-2 text-[11px]">
                          <span className="text-emerald-600">{t("reminder.stats-month-completed", { count: completed })}</span>
                          <span className="text-rose-500">
                            {t("reminder.stats-month-skipped", { count: monthOccurrences.length - completed })}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {detailsView === "history" && historyMonth !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => setHistoryMonth(undefined)}>
              <ArrowLeftIcon />
              {t("reminder.stats-all-months")}
            </Button>
            <span className="text-sm font-medium">{monthLabel(historyYear, historyMonth)}</span>
          </div>
        )}
        {(detailsView !== "history" || historyMonth !== undefined) &&
          (dateGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("reminder.stats-empty-range")}</p>
          ) : (
            <div className="space-y-3">
              {dateGroups.map(([date, dayOccurrences]) => (
                <div key={date} className="overflow-hidden rounded-xl border bg-background">
                  <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                    <span className="text-sm font-medium">{dayLabel(date)}</span>
                    <span className="text-xs text-muted-foreground">
                      {dayOccurrences.length} {t("reminder.stats-occurrences")}
                    </span>
                  </div>
                  <div className="divide-y">
                    {dayOccurrences.map((occurrence) => {
                      const late = occurrence.status === ReminderOccurrence_Status.COMPLETED_LATE;
                      const skipped = occurrence.status === ReminderOccurrence_Status.SKIPPED;
                      return (
                        <div key={occurrence.name} className="flex items-center gap-3 px-3 py-3">
                          <span
                            className={`size-2.5 shrink-0 rounded-full ${skipped ? "bg-rose-500" : late ? "bg-amber-500" : "bg-emerald-500"}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{occurrence.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{occurrence.reminderListDisplayName}</div>
                          </div>
                          <div className="shrink-0 text-right text-xs">
                            <div className={skipped ? "text-rose-500" : late ? "text-amber-500" : "text-emerald-500"}>
                              {skipped
                                ? t("reminder.stats-status-skipped")
                                : late
                                  ? t("reminder.stats-status-late", { days: occurrence.lateDays })
                                  : t("reminder.stats-status-on-time")}
                            </div>
                            {occurrence.memo && (
                              <Link className="mt-1 inline-block text-primary hover:underline" to={`/${occurrence.memo}`}>
                                {t("reminder.open-linked-memo")}
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </section>
    </div>
  );
};

export default ReminderStatistics;
