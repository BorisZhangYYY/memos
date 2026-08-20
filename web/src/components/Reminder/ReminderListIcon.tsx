import {
  BookOpenIcon,
  BriefcaseIcon,
  CircleCheckIcon,
  DumbbellIcon,
  HouseIcon,
  ListIcon,
  type LucideIcon,
  type LucideProps,
  PlaneIcon,
  ShoppingCartIcon,
  UserIcon,
} from "lucide-react";

export const REMINDER_LIST_ICON_OPTIONS = [
  { value: "list", labelKey: "reminder.list-icon.list", icon: ListIcon },
  { value: "personal", labelKey: "reminder.list-icon.personal", icon: UserIcon },
  { value: "work", labelKey: "reminder.list-icon.work", icon: BriefcaseIcon },
  { value: "home", labelKey: "reminder.list-icon.home", icon: HouseIcon },
  { value: "shopping", labelKey: "reminder.list-icon.shopping", icon: ShoppingCartIcon },
  { value: "fitness", labelKey: "reminder.list-icon.fitness", icon: DumbbellIcon },
  { value: "study", labelKey: "reminder.list-icon.study", icon: BookOpenIcon },
  { value: "travel", labelKey: "reminder.list-icon.travel", icon: PlaneIcon },
  { value: "tasks", labelKey: "reminder.list-icon.tasks", icon: CircleCheckIcon },
] as const;

const iconByName = new Map<string, LucideIcon>(REMINDER_LIST_ICON_OPTIONS.map((option) => [option.value, option.icon]));

export const normalizeReminderListIcon = (icon?: string): string => (icon && iconByName.has(icon) ? icon : "list");

export const isDefaultReminderList = (name: string): boolean => name.endsWith("/reminderLists/default");

const ReminderListIcon = ({ icon, ...props }: { icon?: string } & LucideProps) => {
  const Icon = iconByName.get(normalizeReminderListIcon(icon)) ?? ListIcon;
  return <Icon {...props} />;
};

export default ReminderListIcon;
