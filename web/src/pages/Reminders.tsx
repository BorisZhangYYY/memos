import {
  AlarmClockIcon,
  ArchiveIcon,
  CalendarDaysIcon,
  CheckIcon,
  CircleIcon,
  FileTextIcon,
  FlagIcon,
  InboxIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useLocation } from "react-router-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ReminderDatePicker } from "@/components/Reminder/ReminderDateTimePicker";
import ReminderDetailDialog, { type ReminderDraft } from "@/components/Reminder/ReminderDetailDialog";
import ReminderListDialog, { type ReminderListDialogValue } from "@/components/Reminder/ReminderListDialog";
import ReminderListIcon, { isDefaultReminderList } from "@/components/Reminder/ReminderListIcon";
import ReminderMetadata from "@/components/Reminder/ReminderMetadata";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import useCurrentUser from "@/hooks/useCurrentUser";
import {
  useArchiveCompletedReminders,
  useCompleteReminder,
  useCreateReminder,
  useCreateReminderList,
  useDeleteReminder,
  useDeleteReminderList,
  useReminderLists,
  useReminders,
  useUpdateReminder,
  useUpdateReminderList,
} from "@/hooks/useReminderQueries";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import {
  ListRemindersRequest_View,
  type Reminder,
  Reminder_Priority,
  Reminder_Status,
  type ReminderList,
} from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";
import { readRememberedReminderList, rememberReminderList, resolveReminderListSelection } from "@/utils/reminder-list-selection";

type SmartView = "today" | "scheduled" | "all" | "flagged" | "completed" | "archived";

const VIEW_BY_ID: Record<SmartView, ListRemindersRequest_View> = {
  today: ListRemindersRequest_View.TODAY,
  scheduled: ListRemindersRequest_View.SCHEDULED,
  all: ListRemindersRequest_View.ALL,
  flagged: ListRemindersRequest_View.FLAGGED,
  completed: ListRemindersRequest_View.COMPLETED,
  archived: ListRemindersRequest_View.ALL,
};

const listDisplayName = (list: { name: string; displayName: string }, translatedDefault: string) =>
  list.name.endsWith("/reminderLists/default") ? translatedDefault : list.displayName;

const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const ReminderRow = ({
  reminder,
  list,
  archived,
  onComplete,
  onArchive,
  onDelete,
  onOpen,
  returnLocation,
}: {
  reminder: Reminder;
  list?: ReminderList;
  archived: boolean;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onOpen: () => void;
  returnLocation: string;
}) => {
  const t = useTranslate();
  const completed = reminder.status === Reminder_Status.COMPLETED;
  return (
    <div data-reminder-row className="group flex min-h-14 items-start gap-3 border-b border-border/70 px-1 py-3 last:border-b-0">
      <button
        type="button"
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          completed
            ? "border-primary bg-primary text-primary-foreground"
            : archived
              ? "cursor-default border-muted-foreground/25"
              : "border-muted-foreground/40 hover:border-primary",
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (!completed && !archived) onComplete();
        }}
        aria-label={t("reminder.complete")}
      >
        {completed && <CheckIcon className="size-3" />}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex items-start gap-2">
          <span className={cn("min-w-0 flex-1 break-words text-[15px] leading-5", completed && "text-muted-foreground line-through")}>
            {reminder.title}
          </span>
          <span className="flex h-6 shrink-0 items-center gap-1">
            {reminder.priority !== Reminder_Priority.PRIORITY_UNSPECIFIED && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1 text-sm font-semibold leading-none text-primary">
                {"!".repeat(reminder.priority)}
              </span>
            )}
            {reminder.flagged && (
              <span className="inline-flex size-6 items-center justify-center rounded-md bg-orange-400/10 text-orange-500">
                <FlagIcon className="size-3.5 fill-current" />
              </span>
            )}
          </span>
        </div>
        <ReminderMetadata reminder={reminder} list={list} className="mt-1" />
      </button>
      {reminder.memo && (
        <Button
          nativeButton={false}
          variant="ghost"
          size="icon-sm"
          className="mt-0.5 shrink-0 text-primary"
          render={<Link to={`/${reminder.memo}`} state={{ from: returnLocation }} />}
          aria-label={t("reminder.open-linked-memo")}
          title={t("reminder.open-linked-memo")}
        >
          <FileTextIcon className="size-4" />
        </Button>
      )}
      {completed && !archived && (
        <button
          type="button"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
          aria-label={t("common.archive")}
          title={t("common.archive")}
        >
          <ArchiveIcon className="size-4" />
        </button>
      )}
      {archived && (
        <button
          type="button"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label={t("common.delete")}
          title={t("common.delete")}
        >
          <Trash2Icon className="size-4" />
        </button>
      )}
      <button
        type="button"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-primary opacity-60 transition-opacity hover:bg-primary/10 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        onClick={onOpen}
        aria-label={t("reminder.details")}
      >
        <InfoIcon className="size-5" />
      </button>
    </div>
  );
};

interface Props {
  embedded?: boolean;
  onOpenReminder?: (reminderName: string) => void;
}

const Reminders = ({ embedded = false, onOpenReminder }: Props) => {
  const user = useCurrentUser();
  const t = useTranslate();
  const location = useLocation();
  const parent = user?.name;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [activeView, setActiveView] = useState<SmartView>("all");
  const [activeList, setActiveList] = useState("");
  const [query, setQuery] = useState("");
  const [draftVisible, setDraftVisible] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draftFlagged, setDraftFlagged] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<ReminderList>();
  const [selectedReminder, setSelectedReminder] = useState<Reminder>();
  const [deleteCandidate, setDeleteCandidate] = useState<Reminder>();
  const [deleteListCandidate, setDeleteListCandidate] = useState<ReminderList>();
  const [detailDraft, setDetailDraft] = useState<ReminderDraft>();
  const draftRef = useRef<HTMLInputElement>(null);
  const draftContainerRef = useRef<HTMLDivElement>(null);
  const draftCreateAreaRef = useRef<HTMLDivElement>(null);
  const draftCommitInProgressRef = useRef(false);
  const suppressBlankClickRef = useRef(false);
  const selectionOwnerRef = useRef("");
  const returnLocation = `${location.pathname}${location.search}${location.hash}`;

  const { data: lists = [] } = useReminderLists(parent);
  const autoSelectedDefaultListRef = useRef(false);
  // 点开提醒面板后默认选中默认的提醒事项列表（即“Reminders”默认列表），
  // 这样无需用户手动先点一下列表即可直接新建提醒。
  const primaryListName = useMemo(
    () => lists.find((list) => list.name.endsWith("/reminderLists/default"))?.name ?? lists[0]?.name ?? "",
    [lists],
  );
  useEffect(() => {
    if (autoSelectedDefaultListRef.current) return;
    if (!primaryListName || activeList) return;
    autoSelectedDefaultListRef.current = true;
    setActiveList(primaryListName);
  }, [primaryListName, activeList]);
  const { data: allReminders = [] } = useReminders(parent, { view: ListRemindersRequest_View.ALL, timeZone });
  const selectedView = activeList ? ListRemindersRequest_View.ALL : VIEW_BY_ID[activeView];
  const selectedState = activeView === "archived" ? State.ARCHIVED : State.NORMAL;
  const { data: reminders = [], isLoading } = useReminders(parent, {
    view: selectedView,
    state: selectedState,
    reminderList: activeList,
    query,
    timeZone,
  });
  const createReminder = useCreateReminder();
  const completeReminder = useCompleteReminder();
  const archiveCompleted = useArchiveCompletedReminders();
  const deleteReminder = useDeleteReminder();
  const deleteReminderList = useDeleteReminderList();
  const updateReminder = useUpdateReminder();
  const createList = useCreateReminderList();
  const updateList = useUpdateReminderList();

  const today = localDate();
  const counts = useMemo(
    () => ({
      today: allReminders.filter((reminder) => reminder.dueDate && reminder.dueDate <= today).length,
      scheduled: allReminders.filter((reminder) => !!reminder.dueDate || !!reminder.remindTime).length,
      all: allReminders.length,
      flagged: allReminders.filter((reminder) => reminder.flagged).length,
    }),
    [allReminders, today],
  );

  useEffect(() => {
    if (draftVisible) requestAnimationFrame(() => draftRef.current?.focus());
  }, [draftVisible]);

  useEffect(() => {
    if (!parent || lists.length === 0) return;

    if (selectionOwnerRef.current !== parent) {
      selectionOwnerRef.current = parent;
      const selectedList = resolveReminderListSelection(lists, readRememberedReminderList(parent));
      setActiveList(selectedList);
      setActiveView("all");
      rememberReminderList(parent, selectedList);
      return;
    }

    if (activeList && !lists.some((list) => list.name === activeList)) {
      const selectedList = resolveReminderListSelection(lists);
      setActiveList(selectedList);
      setActiveView("all");
      rememberReminderList(parent, selectedList);
    }
  }, [activeList, lists, parent]);

  const selectView = (view: SmartView) => {
    // 用户手动选择智能视图时，标记已主动操作，避免列表加载完成后
    // 自动选中默认列表的逻辑覆盖用户此刻的选择。
    autoSelectedDefaultListRef.current = true;
    setActiveView(view);
    setActiveList("");
    setDraftVisible(false);
  };

  const selectList = (name: string) => {
    setActiveList(name);
    setActiveView("all");
    setDraftVisible(false);
    if (parent) rememberReminderList(parent, name);
  };

  const defaultList = activeList || resolveReminderListSelection(lists);
  const resetDraft = useCallback(() => {
    setDraftTitle("");
    setDraftDueDate("");
    setDraftFlagged(false);
    setDraftVisible(false);
  }, []);

  const commitDraft = useCallback(async () => {
    if (draftCommitInProgressRef.current) return;
    const title = draftTitle.trim();
    const reminderList = defaultList;
    const dueDate = draftDueDate || (activeView === "today" || activeView === "scheduled" ? today : "");
    const flagged = draftFlagged || activeView === "flagged";
    resetDraft();
    // 只校验标题和用户；即使默认列表尚未加载完成，也交由后端兜底
    // 自动使用默认提醒列表（后端 resolveReminderListID 在空列表名下会 ensure 默认列表）。
    if (!title || !parent) {
      return;
    }
    draftCommitInProgressRef.current = true;
    try {
      await createReminder.mutateAsync({
        parent,
        reminder: { title, reminderList, dueDate, flagged, timeZone },
      });
    } finally {
      draftCommitInProgressRef.current = false;
    }
  }, [activeView, createReminder, defaultList, draftDueDate, draftFlagged, draftTitle, parent, resetDraft, timeZone, today]);

  useEffect(() => {
    if (!draftVisible) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (draftContainerRef.current?.contains(event.target as Node)) return;
      const target = event.target as HTMLElement;
      suppressBlankClickRef.current =
        !!draftCreateAreaRef.current?.contains(target) && !target.closest("button, input, [data-reminder-row], [data-reminder-draft], h2");
      void commitDraft();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [commitDraft, draftVisible]);

  const openDraftDetails = () => {
    setDetailDraft({
      title: draftTitle,
      reminderList: defaultList,
      dueDate: draftDueDate || (activeView === "today" || activeView === "scheduled" ? today : ""),
      flagged: draftFlagged || activeView === "flagged",
    });
    resetDraft();
  };

  const openListDialog = (list?: ReminderList) => {
    setEditingList(list);
    setListDialogOpen(true);
  };

  const saveList = async ({ displayName, color, icon }: ReminderListDialogValue) => {
    if (!parent) return;
    if (editingList) {
      const updateMask = ["color", "icon"];
      if (!isDefaultReminderList(editingList.name)) updateMask.unshift("display_name");
      await updateList.mutateAsync({
        reminderList: { name: editingList.name, displayName, color, icon },
        updateMask,
      });
      toast.success(t("reminder.list-saved"));
      return;
    }

    const list = await createList.mutateAsync({
      parent,
      reminderList: {
        displayName,
        color,
        icon,
        sortOrder: lists.length,
        state: State.NORMAL,
      },
    });
    selectList(list.name);
    toast.success(t("reminder.list-saved"));
  };

  const smartViews: Array<{
    id: Exclude<SmartView, "completed" | "archived">;
    label: string;
    icon: typeof CalendarDaysIcon;
    color: string;
  }> = [
    { id: "today", label: t("common.today"), icon: CalendarDaysIcon, color: "bg-blue-500" },
    { id: "scheduled", label: t("reminder.scheduled"), icon: AlarmClockIcon, color: "bg-red-400" },
    { id: "all", label: t("common.all"), icon: InboxIcon, color: "bg-zinc-600" },
    { id: "flagged", label: t("reminder.flagged"), icon: FlagIcon, color: "bg-orange-300" },
  ];

  const pageTitle = activeList
    ? (() => {
        const list = lists.find((item) => item.name === activeList);
        return list ? listDisplayName(list, t("common.reminders")) : t("common.all");
      })()
    : activeView === "today"
      ? t("common.today")
      : activeView === "scheduled"
        ? t("reminder.scheduled")
        : activeView === "flagged"
          ? t("reminder.flagged")
          : activeView === "completed"
            ? t("reminder.completed")
            : activeView === "archived"
              ? t("common.archived")
              : t("common.all");

  const grouped = useMemo(() => {
    if (activeList) return [{ list: lists.find((item) => item.name === activeList), reminders }];
    const map = new Map<string, Reminder[]>();
    for (const reminder of reminders) map.set(reminder.reminderList, [...(map.get(reminder.reminderList) ?? []), reminder]);
    return Array.from(map.entries()).map(([name, items]) => ({ list: lists.find((list) => list.name === name), reminders: items }));
  }, [activeList, lists, reminders]);

  const draftGroupName = activeList || defaultList;
  const groupsWithDraft = useMemo(() => {
    if (!draftVisible || !draftGroupName || grouped.some((group) => group.list?.name === draftGroupName)) return grouped;
    const targetList = lists.find((list) => list.name === draftGroupName);
    if (!targetList) return grouped;

    const next = [...grouped];
    const targetOrder = lists.findIndex((list) => list.name === draftGroupName);
    const insertionIndex = next.findIndex((group) => {
      const groupOrder = lists.findIndex((list) => list.name === group.list?.name);
      return groupOrder >= 0 && groupOrder > targetOrder;
    });
    const draftGroup = { list: targetList, reminders: [] as Reminder[] };
    if (insertionIndex === -1) next.push(draftGroup);
    else next.splice(insertionIndex, 0, draftGroup);
    return next;
  }, [draftGroupName, draftVisible, grouped, lists]);

  const renderDraft = (bordered: boolean) => (
    <div ref={draftContainerRef} data-reminder-draft className={cn("py-3", bordered && "border-t")}>
      <div className="flex items-start gap-3">
        <CircleIcon className="mt-1.5 size-5 shrink-0 text-muted-foreground/40" />
        <div className="min-w-0 flex-1">
          <Input
            ref={draftRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitDraft();
              if (event.key === "Escape") {
                event.stopPropagation();
                resetDraft();
              }
            }}
            className="h-8 border-0 px-0 text-[15px] shadow-none focus-visible:ring-0"
            placeholder={t("reminder.new-reminder")}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ReminderDatePicker compact value={draftDueDate} onChange={setDraftDueDate} />
            <button
              type="button"
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground",
                draftFlagged && "bg-orange-400/15 text-orange-500",
              )}
              onClick={() => setDraftFlagged((value) => !value)}
              aria-label={t("reminder.flagged")}
            >
              <FlagIcon className={cn("size-3.5", draftFlagged && "fill-current")} />
            </button>
          </div>
        </div>
        <button
          type="button"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openDraftDetails}
          aria-label={t("reminder.details")}
        >
          <InfoIcon className="size-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex overflow-hidden bg-background text-foreground",
        embedded
          ? "m-3 h-[calc(100%-1.5rem)] min-h-0 w-[calc(100%-1.5rem)] rounded-xl border"
          : "min-h-[calc(100vh-3rem)] w-full rounded-xl border md:min-h-[calc(100vh-5rem)]",
      )}
    >
      <aside className="hidden min-h-0 w-64 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 p-3 sm:flex">
        <div className="grid grid-cols-2 gap-2">
          {smartViews.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectView(id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                activeView === id && !activeList
                  ? "border-primary/40 bg-background shadow-sm"
                  : "border-transparent hover:bg-background/70",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("flex size-7 items-center justify-center rounded-full text-white", color)}>
                  <Icon className="size-4" />
                </span>
                <span className="text-xl font-semibold tabular-nums">{counts[id]}</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{label}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{t("reminder.my-lists")}</span>
          <button type="button" onClick={() => openListDialog()} aria-label={t("reminder.new-list")}>
            <PlusIcon className="size-4" />
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {lists.map((list) => (
            <div key={list.name} className="group/list grid grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-1">
              <button
                type="button"
                onClick={() => selectList(list.name)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm",
                  activeList === list.name ? "bg-background shadow-sm" : "hover:bg-background/70",
                )}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: list.color || "#0A84FF" }}
                >
                  <ReminderListIcon icon={list.icon} className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{listDisplayName(list, t("common.reminders"))}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{list.pendingCount}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover/list:opacity-100 sm:focus-visible:opacity-100 data-popup-open:opacity-100"
                  aria-label={`${t("common.actions")}: ${listDisplayName(list, t("common.reminders"))}`}
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openListDialog(list)}>
                    <PencilIcon />
                    {t("common.edit")}
                  </DropdownMenuItem>
                  {!isDefaultReminderList(list.name) && (
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteListCandidate(list)}>
                      <Trash2Icon />
                      {t("reminder.delete-list")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => selectView("completed")}
          className={cn(
            "mt-auto flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-background/70",
            activeView === "completed" && !activeList && "bg-background text-foreground",
          )}
        >
          <CheckIcon className="size-4" /> {t("reminder.completed")}
        </button>
        <button
          type="button"
          onClick={() => selectView("archived")}
          className={cn(
            "mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-background/70",
            activeView === "archived" && !activeList && "bg-background text-foreground",
          )}
        >
          <ArchiveIcon className="size-4" /> {t("common.archived")}
        </button>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-3xl font-bold tracking-tight">{pageTitle}</h1>
            {activeView === "completed" && !activeList && reminders.length > 0 && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!parent) return;
                  const response = await archiveCompleted.mutateAsync(parent);
                  toast.success(t("reminder.archived-count", { count: response.clearedCount }));
                }}
              >
                <ArchiveIcon className="size-4" />
                {t("common.archive")}
              </Button>
            )}
          </div>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-full bg-muted/50 pl-9"
              placeholder={t("reminder.search")}
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto sm:hidden">
            {smartViews.map(({ id, label }) => (
              <Button key={id} size="sm" variant={activeView === id && !activeList ? "default" : "outline"} onClick={() => selectView(id)}>
                {label} {counts[id]}
              </Button>
            ))}
            <Button size="sm" variant={activeView === "completed" ? "default" : "outline"} onClick={() => selectView("completed")}>
              {t("reminder.completed")}
            </Button>
            <Button size="sm" variant={activeView === "archived" ? "default" : "outline"} onClick={() => selectView("archived")}>
              {t("common.archived")}
            </Button>
          </div>
        </header>

        <div
          ref={draftCreateAreaRef}
          className="min-h-0 flex-1 cursor-text overflow-y-auto overscroll-contain px-4 sm:px-6"
          onClick={(event) => {
            if (suppressBlankClickRef.current) {
              suppressBlankClickRef.current = false;
              return;
            }
            const target = event.target as HTMLElement;
            if (target.closest("button, input, [data-reminder-row], [data-reminder-draft], h2")) return;
            if (activeView !== "completed" && activeView !== "archived") {
              if (draftVisible) void commitDraft();
              else setDraftVisible(true);
            }
          }}
        >
          <div className="flex min-h-full flex-col">
            {isLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t("reminder.loading")}</p>
            ) : grouped.length === 0 && !draftVisible ? (
              <button
                type="button"
                className="flex min-h-40 w-full flex-1 items-center justify-center text-sm text-muted-foreground"
                onClick={() => activeView !== "completed" && activeView !== "archived" && !draftVisible && setDraftVisible(true)}
              >
                {activeView === "completed"
                  ? t("reminder.no-completed")
                  : activeView === "archived"
                    ? t("reminder.no-archived")
                    : t("reminder.click-empty-to-create")}
              </button>
            ) : (
              groupsWithDraft.map((group) => (
                <section key={group.list?.name ?? "unknown"}>
                  {!activeList && group.list && (
                    <h2 className="border-b pb-2 pt-3 text-lg font-bold" style={{ color: group.list.color || "#0A84FF" }}>
                      {listDisplayName(group.list, t("common.reminders"))}
                    </h2>
                  )}
                  {group.reminders.map((reminder) => (
                    <ReminderRow
                      key={reminder.name}
                      reminder={reminder}
                      list={group.list}
                      archived={activeView === "archived"}
                      onComplete={() => completeReminder.mutate(reminder.name)}
                      onArchive={async () => {
                        await updateReminder.mutateAsync({
                          reminder: { name: reminder.name, state: State.ARCHIVED },
                          updateMask: ["state"],
                        });
                        toast.success(t("reminder.archived"));
                      }}
                      onDelete={() => setDeleteCandidate(reminder)}
                      onOpen={() => (onOpenReminder ? onOpenReminder(reminder.name) : setSelectedReminder(reminder))}
                      returnLocation={returnLocation}
                    />
                  ))}
                  {draftVisible && group.list?.name === draftGroupName && renderDraft(group.reminders.length > 0)}
                </section>
              ))
            )}
            {grouped.length > 0 && !draftVisible && activeView !== "completed" && activeView !== "archived" && (
              <button
                type="button"
                className="min-h-20 w-full flex-1 cursor-text"
                onClick={(event) => {
                  event.stopPropagation();
                  setDraftVisible(true);
                }}
                aria-label={t("reminder.click-empty-to-create")}
              />
            )}
            {draftVisible && !groupsWithDraft.some((group) => group.list?.name === draftGroupName) && renderDraft(grouped.length > 0)}
          </div>
        </div>
      </main>

      {parent && (
        <ReminderDetailDialog
          reminder={selectedReminder}
          draft={detailDraft}
          lists={lists}
          parent={parent}
          open={!!selectedReminder || !!detailDraft}
          onOpenChange={(open) => {
            if (open) return;
            setSelectedReminder(undefined);
            setDetailDraft(undefined);
          }}
        />
      )}
      <ReminderListDialog
        open={listDialogOpen}
        list={editingList}
        pending={createList.isPending || updateList.isPending}
        onOpenChange={(open) => {
          setListDialogOpen(open);
          if (!open) setEditingList(undefined);
        }}
        onSave={saveList}
      />
      <ConfirmDialog
        open={!!deleteCandidate}
        onOpenChange={(open) => !open && setDeleteCandidate(undefined)}
        title={t("reminder.delete-confirm")}
        description={t("reminder.delete-confirm-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={async () => {
          if (!deleteCandidate) return;
          await deleteReminder.mutateAsync(deleteCandidate.name);
          toast.success(t("reminder.deleted"));
          setDeleteCandidate(undefined);
        }}
        confirmVariant="destructive"
      />
      <ConfirmDialog
        open={!!deleteListCandidate}
        onOpenChange={(open) => !open && setDeleteListCandidate(undefined)}
        title={t("reminder.delete-list-confirm")}
        description={t("reminder.delete-list-confirm-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={async () => {
          if (!deleteListCandidate) return;
          const defaultListName = resolveReminderListSelection(lists.filter((list) => list.name !== deleteListCandidate.name));
          await deleteReminderList.mutateAsync(deleteListCandidate.name);
          if (parent && readRememberedReminderList(parent) === deleteListCandidate.name) {
            rememberReminderList(parent, defaultListName);
          }
          if (activeList === deleteListCandidate.name) defaultListName ? selectList(defaultListName) : selectView("all");
          toast.success(t("reminder.list-deleted"));
          setDeleteListCandidate(undefined);
        }}
        confirmVariant="destructive"
      />
    </div>
  );
};

export default Reminders;
