import { beforeEach, describe, expect, it } from "vitest";
import {
  readRememberedReminderList,
  rememberReminderList,
  resolveReminderListSelection,
} from "@/utils/reminder-list-selection";

const defaultList = { name: "users/demo/reminderLists/default" };
const workList = { name: "users/demo/reminderLists/work" };

describe("reminder list selection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the protected Reminders list even when it is not first", () => {
    expect(resolveReminderListSelection([workList, defaultList])).toBe(defaultList.name);
  });

  it("restores a remembered custom list while it still exists", () => {
    rememberReminderList("users/demo", workList.name);

    expect(readRememberedReminderList("users/demo")).toBe(workList.name);
    expect(resolveReminderListSelection([defaultList, workList], readRememberedReminderList("users/demo"))).toBe(workList.name);
  });

  it("falls back to the default list after the remembered list is deleted", () => {
    expect(resolveReminderListSelection([defaultList], workList.name)).toBe(defaultList.name);
  });
});
