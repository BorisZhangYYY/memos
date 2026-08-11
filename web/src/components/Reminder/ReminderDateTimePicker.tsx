import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseDate = (value: string) => (value ? new Date(`${value}T12:00:00`) : new Date());

const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(parseDate(value))
    : "";

interface DateProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  compact?: boolean;
}

export const ReminderDatePicker = ({ value, onChange, className, compact = false }: DateProps) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const date = parseDate(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const date = parseDate(value);
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [open, value]);

  const days = useMemo(() => {
    const firstWeekday = viewMonth.getDay();
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), index - firstWeekday + 1);
      return { date, key: localDateKey(date), currentMonth: date.getMonth() === viewMonth.getMonth() };
    });
  }, [viewMonth]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(new Date(2026, 7, 9 + index)),
      ),
    [],
  );
  const today = localDateKey(new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={compact ? "ghost" : "outline"}
            size={compact ? "sm" : "default"}
            className={cn(
              compact ? "h-7 rounded-full bg-muted px-2.5 text-xs" : "w-full justify-start font-normal",
              value ? "text-foreground" : "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarDaysIcon className="size-4" />
        {value ? formatDate(value) : t("reminder.add-date")}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">{new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(viewMonth)}</div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
              aria-label={t("reminder.previous-month")}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
              aria-label={t("reminder.next-month")}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
          {weekdayLabels.map((label, index) => (
            <span key={`${label}-${index}`} className="py-1">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-sm hover:bg-accent",
                !item.currentMonth && "text-muted-foreground/40",
                item.key === today && item.key !== value && "font-semibold text-primary",
                item.key === value && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
              )}
              onClick={() => {
                onChange(item.key);
                setOpen(false);
              }}
            >
              {item.date.getDate()}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {t("common.clear")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            {t("common.today")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface TimeProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const ReminderTimePicker = ({ value, onChange, disabled }: TimeProps) => {
  const t = useTranslate();
  const options = useMemo(() => {
    const values = Array.from({ length: 48 }, (_, index) => {
      const minutes = index * 30;
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    });
    if (value && !values.includes(value)) values.push(value);
    return values.sort();
  }, [value]);

  return (
    <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)} disabled={disabled}>
      <SelectTrigger className="w-full">
        <ClockIcon className="size-4" />
        <SelectValue>{value || t("reminder.no-specific-time")}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64">
        <SelectItem value="none">{t("reminder.no-specific-time")}</SelectItem>
        {options.map((time) => (
          <SelectItem key={time} value={time}>
            {time}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
