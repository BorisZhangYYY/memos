# Fork TODO

This file tracks follow-up work for fork-specific life-platform features that is intentionally outside the current implementation scope.

## Unified personal dashboard

- Design a top-level dashboard that summarizes the user's Memos activity, reminders, mood, and finance data under one shared date range.
- Keep domain-specific history and editing in drill-down views; the global dashboard should present only summary metrics, trends, and links to details.
- Rework the reminder-statistics mockup as the visual foundation for this cross-domain dashboard instead of shipping it as a reminder-only page.

## Mood history after Memo deletion

- Store mood history independently from the Memo payload so deleting a Memo does not remove its mood from historical statistics.
- Preserve the original Memo resource name in the mood snapshot. Opening a deleted Memo may return the normal not-found state.
- Define migration behavior explicitly: existing live Memo moods can be backfilled, but already deleted Memo moods cannot be reconstructed.

## Finance audit history after transaction deletion

- Replace destructive transaction deletion with a void/reversal or tombstone workflow that retains the original transaction snapshot for audit history.
- Exclude voided transactions from current wallet balances and active income/expense totals while keeping their original amount, category, occurrence time, and void time visible in audit history.
- Add a user-facing delete/void interaction only after the balance, summary, and historical-reporting semantics are covered by tests for SQLite, MySQL, and PostgreSQL.
