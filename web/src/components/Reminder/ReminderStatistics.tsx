import { CalendarCheckIcon, CheckCircle2Icon, Clock3Icon, XCircleIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useReminderOccurrences, useReminderStats } from "@/hooks/useReminderQueries";
import { ReminderOccurrence_Status } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const ReminderStatistics = ({ parent }: { parent?: string }) => {
  const t = useTranslate();
  const endDate = localDate(new Date());
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const startDate = localDate(start);
  const { data: stats, isLoading } = useReminderStats(parent, startDate, endDate);
  const { data: occurrences = [] } = useReminderOccurrences(parent, startDate, endDate);
  const percent = (value = 0) => `${Math.round(value * 100)}%`;
  const cards = [
    { label: t("reminder.stats-total"), value: stats?.totalCount ?? 0, icon: CalendarCheckIcon, tone: "text-foreground" },
    { label: t("reminder.stats-on-time-rate"), value: percent(stats?.onTimeRate), icon: CheckCircle2Icon, tone: "text-emerald-500" },
    { label: t("reminder.stats-final-rate"), value: percent(stats?.finalCompletionRate), icon: Clock3Icon, tone: "text-amber-500" },
    { label: t("reminder.stats-skipped"), value: stats?.skippedCount ?? 0, icon: XCircleIcon, tone: "text-rose-500" },
  ];

  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">{t("reminder.loading")}</p>;
  return (
    <div className="space-y-6 py-5">
      <div>
        <p className="text-sm text-muted-foreground">{t("reminder.stats-last-30-days")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border bg-card p-4 shadow-sm">
              <Icon className={`size-5 ${tone}`} />
              <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <section>
        <h2 className="border-b pb-2 text-lg font-bold">{t("reminder.stats-history")}</h2>
        {occurrences.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("reminder.stats-empty")}</p>
        ) : (
          <div>
            {occurrences.map((occurrence) => {
              const late = occurrence.status === ReminderOccurrence_Status.COMPLETED_LATE;
              const skipped = occurrence.status === ReminderOccurrence_Status.SKIPPED;
              return (
                <div key={occurrence.name} className="flex items-center gap-3 border-b py-3 last:border-0">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${skipped ? "bg-rose-500" : late ? "bg-amber-500" : "bg-emerald-500"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{occurrence.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {occurrence.scheduledDate} · {occurrence.reminderListDisplayName}
                    </div>
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
        )}
      </section>
    </div>
  );
};

export default ReminderStatistics;
