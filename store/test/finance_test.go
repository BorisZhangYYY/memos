package test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestFinanceLedgerMaintainsWalletBalances(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	bank, err := ts.CreateFinanceWallet(ctx, &store.FinanceWallet{
		UID: "finance-bank", CreatorID: user.ID, Name: "Bank", InitialBalanceMinor: 10_000,
	})
	require.NoError(t, err)
	wallet, err := ts.CreateFinanceWallet(ctx, &store.FinanceWallet{
		UID: "finance-wallet", CreatorID: user.ID, Name: "Wallet", InitialBalanceMinor: 2_000,
	})
	require.NoError(t, err)
	expenseCategory, err := ts.CreateFinanceCategory(ctx, &store.FinanceCategory{
		UID: "finance-drinks", CreatorID: user.ID, Name: "Drinks", Type: store.FinanceCategoryExpense,
	})
	require.NoError(t, err)
	incomeCategory, err := ts.CreateFinanceCategory(ctx, &store.FinanceCategory{
		UID: "finance-salary", CreatorID: user.ID, Name: "Salary", Type: store.FinanceCategoryIncome,
	})
	require.NoError(t, err)

	now := time.Now().Unix()
	expense, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-expense", CreatorID: user.ID, OccurredTs: now, Type: store.FinanceTransactionExpense,
		AmountMinor: 1_299, WalletID: bank.ID, CategoryID: &expenseCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(10_000), expense.BalanceBeforeMinor)
	require.Equal(t, int64(8_701), expense.BalanceAfterMinor)
	require.Equal(t, int64(8_701), financeWalletBalance(t, ctx, ts, bank.ID, user.ID))

	income, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-income", CreatorID: user.ID, OccurredTs: now, Type: store.FinanceTransactionIncome,
		AmountMinor: 5_000, WalletID: bank.ID, CategoryID: &incomeCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(8_701), income.BalanceBeforeMinor)
	require.Equal(t, int64(13_701), income.BalanceAfterMinor)
	require.Equal(t, int64(13_701), financeWalletBalance(t, ctx, ts, bank.ID, user.ID))

	transfer, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-transfer", CreatorID: user.ID, OccurredTs: now, Type: store.FinanceTransactionTransfer,
		AmountMinor: 2_000, WalletID: bank.ID, DestinationWalletID: &wallet.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(13_701), transfer.BalanceBeforeMinor)
	require.Equal(t, int64(11_701), transfer.BalanceAfterMinor)
	require.Equal(t, int64(11_701), financeWalletBalance(t, ctx, ts, bank.ID, user.ID))
	require.Equal(t, int64(4_000), financeWalletBalance(t, ctx, ts, wallet.ID, user.ID))

	updated, err := ts.UpdateFinanceTransaction(ctx, &store.UpdateFinanceTransaction{
		ID: expense.ID, CreatorID: user.ID, UpdatedTs: now + 1, OccurredTs: now,
		Type: store.FinanceTransactionExpense, AmountMinor: 500, WalletID: wallet.ID, CategoryID: &expenseCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, wallet.ID, updated.WalletID)
	require.Equal(t, int64(4_000), updated.BalanceBeforeMinor)
	require.Equal(t, int64(3_500), updated.BalanceAfterMinor)
	require.Equal(t, int64(13_000), financeWalletBalance(t, ctx, ts, bank.ID, user.ID))
	require.Equal(t, int64(3_500), financeWalletBalance(t, ctx, ts, wallet.ID, user.ID))

	require.NoError(t, ts.DeleteFinanceTransaction(ctx, &store.DeleteFinanceTransaction{ID: expense.ID, CreatorID: user.ID}))
	require.Equal(t, int64(4_000), financeWalletBalance(t, ctx, ts, wallet.ID, user.ID))

	adjustment, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-adjustment", CreatorID: user.ID, OccurredTs: now, Type: store.FinanceTransactionAdjustment,
		WalletID: wallet.ID, BalanceAfterMinor: 3_333,
	})
	require.NoError(t, err)
	require.Equal(t, int64(-667), adjustment.AdjustmentDeltaMinor)
	require.Equal(t, int64(4_000), adjustment.BalanceBeforeMinor)
	require.Equal(t, int64(3_333), financeWalletBalance(t, ctx, ts, wallet.ID, user.ID))
}

func TestFinanceRejectsInsufficientBalance(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	wallet, err := ts.CreateFinanceWallet(ctx, &store.FinanceWallet{UID: "limited-wallet", CreatorID: user.ID, Name: "Cash", InitialBalanceMinor: 100})
	require.NoError(t, err)
	category, err := ts.CreateFinanceCategory(ctx, &store.FinanceCategory{UID: "limited-category", CreatorID: user.ID, Name: "Drink", Type: store.FinanceCategoryExpense})
	require.NoError(t, err)
	_, err = ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "too-large-expense", CreatorID: user.ID, OccurredTs: time.Now().Unix(), Type: store.FinanceTransactionExpense,
		AmountMinor: 101, WalletID: wallet.ID, CategoryID: &category.ID,
	})
	require.ErrorIs(t, err, store.ErrFinanceInsufficientBalance)
	require.Equal(t, int64(100), financeWalletBalance(t, ctx, ts, wallet.ID, user.ID))
}

func TestFinanceRejectsBalanceOutsideSupportedRange(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	wallet, err := ts.CreateFinanceWallet(ctx, &store.FinanceWallet{
		UID: "maximum-wallet", CreatorID: user.ID, Name: "Maximum", InitialBalanceMinor: store.MaxFinanceAmountMinor,
	})
	require.NoError(t, err)
	category, err := ts.CreateFinanceCategory(ctx, &store.FinanceCategory{
		UID: "range-income", CreatorID: user.ID, Name: "Income", Type: store.FinanceCategoryIncome,
	})
	require.NoError(t, err)
	_, err = ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "out-of-range-income", CreatorID: user.ID, OccurredTs: time.Now().Unix(), Type: store.FinanceTransactionIncome,
		AmountMinor: 1, WalletID: wallet.ID, CategoryID: &category.ID,
	})
	require.ErrorIs(t, err, store.ErrFinanceAmountOutOfRange)
	require.Equal(t, store.MaxFinanceAmountMinor, financeWalletBalance(t, ctx, ts, wallet.ID, user.ID))
}

func financeWalletBalance(t *testing.T, ctx context.Context, ts *store.Store, walletID, userID int32) int64 {
	t.Helper()
	wallets, err := ts.ListFinanceWallets(ctx, &store.FindFinanceWallet{ID: &walletID, CreatorID: &userID})
	require.NoError(t, err)
	require.Len(t, wallets, 1)
	return wallets[0].BalanceMinor
}
