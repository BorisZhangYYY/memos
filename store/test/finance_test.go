package test

import (
	"context"
	"fmt"
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
		UID: "finance-drinks", CreatorID: user.ID, Name: "Drinks", Type: store.FinanceCategoryExpense, Emoji: "🥤",
	})
	require.NoError(t, err)
	require.Equal(t, "🥤", expenseCategory.Emoji)
	incomeCategory, err := ts.CreateFinanceCategory(ctx, &store.FinanceCategory{
		UID: "finance-salary", CreatorID: user.ID, Name: "Salary", Type: store.FinanceCategoryIncome,
	})
	require.NoError(t, err)

	nowSec := time.Now().Unix()
	expense, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-expense", CreatorID: user.ID, OccurredTs: nowSec, Type: store.FinanceTransactionExpense,
		AmountMinor: 1_299, WalletID: bank.ID, CategoryID: &expenseCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(10_000), expense.BalanceBeforeMinor)
	require.Equal(t, int64(8_701), expense.BalanceAfterMinor)
	require.Equal(t, int64(8_701), financeWalletBalance(ctx, t, ts, bank.ID, user.ID))

	income, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-income", CreatorID: user.ID, OccurredTs: nowSec + 10, Type: store.FinanceTransactionIncome,
		AmountMinor: 5_000, WalletID: bank.ID, CategoryID: &incomeCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(8_701), income.BalanceBeforeMinor)
	require.Equal(t, int64(13_701), income.BalanceAfterMinor)
	require.Equal(t, int64(13_701), financeWalletBalance(ctx, t, ts, bank.ID, user.ID))

	transfer, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-transfer", CreatorID: user.ID, OccurredTs: nowSec + 20, Type: store.FinanceTransactionTransfer,
		AmountMinor: 2_000, WalletID: bank.ID, DestinationWalletID: &wallet.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(13_701), transfer.BalanceBeforeMinor)
	require.Equal(t, int64(11_701), transfer.BalanceAfterMinor)
	require.Equal(t, int64(11_701), financeWalletBalance(ctx, t, ts, bank.ID, user.ID))
	require.Equal(t, int64(4_000), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))

	updated, err := ts.UpdateFinanceTransaction(ctx, &store.UpdateFinanceTransaction{
		ID: expense.ID, CreatorID: user.ID, UpdatedTs: nowSec + 1, OccurredTs: nowSec,
		Type: store.FinanceTransactionExpense, AmountMinor: 500, WalletID: wallet.ID, CategoryID: &expenseCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, wallet.ID, updated.WalletID)
	require.Equal(t, int64(2_000), updated.BalanceBeforeMinor)
	require.Equal(t, int64(1_500), updated.BalanceAfterMinor)
	require.Equal(t, int64(13_000), financeWalletBalance(ctx, t, ts, bank.ID, user.ID))
	require.Equal(t, int64(3_500), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))
	income = financeTransactionByUID(ctx, t, ts, income.UID, user.ID)
	transfer = financeTransactionByUID(ctx, t, ts, transfer.UID, user.ID)
	require.Equal(t, int64(10_000), income.BalanceBeforeMinor)
	require.Equal(t, int64(15_000), income.BalanceAfterMinor)
	require.Equal(t, int64(15_000), transfer.BalanceBeforeMinor)
	require.Equal(t, int64(13_000), transfer.BalanceAfterMinor)

	require.NoError(t, ts.DeleteFinanceTransaction(ctx, &store.DeleteFinanceTransaction{ID: expense.ID, CreatorID: user.ID}))
	require.Equal(t, int64(4_000), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))
	income = financeTransactionByUID(ctx, t, ts, income.UID, user.ID)
	transfer = financeTransactionByUID(ctx, t, ts, transfer.UID, user.ID)
	require.Equal(t, int64(10_000), income.BalanceBeforeMinor)
	require.Equal(t, int64(15_000), income.BalanceAfterMinor)
	require.Equal(t, int64(15_000), transfer.BalanceBeforeMinor)
	require.Equal(t, int64(13_000), transfer.BalanceAfterMinor)

	adjustment, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-adjustment", CreatorID: user.ID, OccurredTs: nowSec + 30, Type: store.FinanceTransactionAdjustment,
		WalletID: wallet.ID, BalanceAfterMinor: 3_333,
	})
	require.NoError(t, err)
	require.Equal(t, int64(-667), adjustment.AdjustmentDeltaMinor)
	require.Equal(t, int64(4_000), adjustment.BalanceBeforeMinor)
	require.Equal(t, int64(3_333), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))

	backdated, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: "finance-backdated-income", CreatorID: user.ID, OccurredTs: nowSec + 25, Type: store.FinanceTransactionIncome,
		AmountMinor: 500, WalletID: wallet.ID, CategoryID: &incomeCategory.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(4_000), backdated.BalanceBeforeMinor)
	require.Equal(t, int64(4_500), backdated.BalanceAfterMinor)
	adjustment = financeTransactionByUID(ctx, t, ts, adjustment.UID, user.ID)
	require.Equal(t, int64(-1_167), adjustment.AdjustmentDeltaMinor)
	require.Equal(t, int64(4_500), adjustment.BalanceBeforeMinor)
	require.Equal(t, int64(3_333), adjustment.BalanceAfterMinor)
	require.Equal(t, int64(3_333), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))

	require.NoError(t, ts.DeleteFinanceTransaction(ctx, &store.DeleteFinanceTransaction{ID: backdated.ID, CreatorID: user.ID}))
	adjustment = financeTransactionByUID(ctx, t, ts, adjustment.UID, user.ID)
	require.Equal(t, int64(-667), adjustment.AdjustmentDeltaMinor)
	require.Equal(t, int64(4_000), adjustment.BalanceBeforeMinor)
	require.Equal(t, int64(3_333), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))
}

func TestFinanceSupportsConcurrentWrites(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	wallet, err := ts.CreateFinanceWallet(ctx, &store.FinanceWallet{
		UID: "concurrent-wallet", CreatorID: user.ID, Name: "Concurrent", InitialBalanceMinor: 0,
	})
	require.NoError(t, err)
	category, err := ts.CreateFinanceCategory(ctx, &store.FinanceCategory{
		UID: "concurrent-income", CreatorID: user.ID, Name: "Concurrent income", Type: store.FinanceCategoryIncome,
	})
	require.NoError(t, err)

	const transactionCount = 8
	start := make(chan struct{})
	errors := make(chan error, transactionCount)
	nowSec := time.Now().Unix()
	for i := range transactionCount {
		go func() {
			<-start
			_, err := ts.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
				UID: fmt.Sprintf("concurrent-income-%d", i), CreatorID: user.ID, OccurredTs: nowSec,
				Type: store.FinanceTransactionIncome, AmountMinor: 100, WalletID: wallet.ID, CategoryID: &category.ID,
			})
			errors <- err
		}()
	}
	close(start)
	for range transactionCount {
		require.NoError(t, <-errors)
	}

	require.Equal(t, int64(transactionCount*100), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))
	transactions, err := ts.ListFinanceTransactions(ctx, &store.FindFinanceTransaction{CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, transactions, transactionCount)
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
	require.Equal(t, int64(100), financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))
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
	require.Equal(t, store.MaxFinanceAmountMinor, financeWalletBalance(ctx, t, ts, wallet.ID, user.ID))
}

func financeWalletBalance(ctx context.Context, t *testing.T, ts *store.Store, walletID, userID int32) int64 {
	t.Helper()
	wallets, err := ts.ListFinanceWallets(ctx, &store.FindFinanceWallet{ID: &walletID, CreatorID: &userID})
	require.NoError(t, err)
	require.Len(t, wallets, 1)
	return wallets[0].BalanceMinor
}

func financeTransactionByUID(ctx context.Context, t *testing.T, ts *store.Store, uid string, userID int32) *store.FinanceTransaction {
	t.Helper()
	transactions, err := ts.ListFinanceTransactions(ctx, &store.FindFinanceTransaction{UID: &uid, CreatorID: &userID})
	require.NoError(t, err)
	require.Len(t, transactions, 1)
	return transactions[0]
}
