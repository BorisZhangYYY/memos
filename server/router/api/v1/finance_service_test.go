package v1

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestFinanceServicePrivateLedgerAndSummary(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	alice, err := service.Store.CreateUser(ctx, &store.User{Username: "finance-alice", Role: store.RoleUser})
	require.NoError(t, err)
	bob, err := service.Store.CreateUser(ctx, &store.User{Username: "finance-bob", Role: store.RoleUser})
	require.NoError(t, err)
	aliceCtx := userCtx(ctx, alice.ID)

	wallet, err := service.CreateFinanceWallet(aliceCtx, &v1pb.CreateFinanceWalletRequest{
		Parent: "users/finance-alice",
		Wallet: &v1pb.FinanceWallet{DisplayName: "CMB", InitialBalanceMinor: 5_000},
	})
	require.NoError(t, err)
	expenseCategory, err := service.CreateFinanceCategory(aliceCtx, &v1pb.CreateFinanceCategoryRequest{
		Parent:   "users/finance-alice",
		Category: &v1pb.FinanceCategory{DisplayName: "Drinks", Type: v1pb.FinanceCategory_EXPENSE, Emoji: "🥤"},
	})
	require.NoError(t, err)
	require.Equal(t, "🥤", expenseCategory.Emoji)
	incomeCategory, err := service.CreateFinanceCategory(aliceCtx, &v1pb.CreateFinanceCategoryRequest{
		Parent:   "users/finance-alice",
		Category: &v1pb.FinanceCategory{DisplayName: "Salary", Type: v1pb.FinanceCategory_INCOME},
	})
	require.NoError(t, err)
	expenseCategory, err = service.UpdateFinanceCategory(aliceCtx, &v1pb.UpdateFinanceCategoryRequest{
		Category:   &v1pb.FinanceCategory{Name: expenseCategory.Name, Emoji: "🍹"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"emoji"}},
	})
	require.NoError(t, err)
	require.Equal(t, "🍹", expenseCategory.Emoji)
	categories, err := service.ListFinanceCategories(aliceCtx, &v1pb.ListFinanceCategoriesRequest{Parent: "users/finance-alice"})
	require.NoError(t, err)
	require.Contains(t, categories.Categories, expenseCategory)

	occurred := time.Date(2026, time.August, 9, 12, 0, 0, 0, time.FixedZone("UTC+8", 8*60*60))
	_, err = service.CreateFinanceTransaction(aliceCtx, &v1pb.CreateFinanceTransactionRequest{
		Parent: "users/finance-alice",
		Transaction: &v1pb.FinanceTransaction{
			Type: v1pb.FinanceTransaction_EXPENSE, AmountMinor: 1_299, Wallet: wallet.Name,
			Category: expenseCategory.Name, OccurTime: timestamppb.New(occurred),
		},
	})
	require.NoError(t, err)
	_, err = service.CreateFinanceTransaction(aliceCtx, &v1pb.CreateFinanceTransactionRequest{
		Parent: "users/finance-alice",
		Transaction: &v1pb.FinanceTransaction{
			Type: v1pb.FinanceTransaction_INCOME, AmountMinor: 2_500, Wallet: wallet.Name,
			Category: incomeCategory.Name, OccurTime: timestamppb.New(occurred),
		},
	})
	require.NoError(t, err)

	summary, err := service.GetFinanceSummary(aliceCtx, &v1pb.GetFinanceSummaryRequest{
		Parent: "users/finance-alice", TimeZone: "Asia/Shanghai",
		StartTime: timestamppb.New(time.Date(2026, time.August, 9, 0, 0, 0, 0, time.FixedZone("UTC+8", 8*60*60))),
		EndTime:   timestamppb.New(time.Date(2026, time.August, 10, 0, 0, 0, 0, time.FixedZone("UTC+8", 8*60*60))),
	})
	require.NoError(t, err)
	require.Equal(t, int64(6_201), summary.TotalBalanceMinor)
	require.Equal(t, int64(2_500), summary.IncomeMinor)
	require.Equal(t, int64(1_299), summary.ExpenseMinor)
	require.Equal(t, int64(1_201), summary.NetMinor)
	require.Len(t, summary.DailySummaries, 1)
	require.Equal(t, "2026-08-09", summary.DailySummaries[0].Date)

	adjustmentRequest := &v1pb.AdjustFinanceWalletBalanceRequest{
		Wallet: wallet.Name, ActualBalanceMinor: 6_000, Note: "bank reconciliation",
		OccurTime: timestamppb.New(occurred), RequestId: "finance-adjustment-request",
	}
	adjustment, err := service.AdjustFinanceWalletBalance(aliceCtx, adjustmentRequest)
	require.NoError(t, err)
	require.Equal(t, int64(-201), adjustment.AdjustmentDeltaMinor)
	require.Equal(t, int64(6_201), adjustment.BalanceBeforeMinor)
	require.Equal(t, int64(6_000), adjustment.BalanceAfterMinor)

	// A retried request is idempotent and must not apply the adjustment twice.
	retried, err := service.AdjustFinanceWalletBalance(aliceCtx, adjustmentRequest)
	require.NoError(t, err)
	require.Equal(t, adjustment.Name, retried.Name)
	wallets, err := service.ListFinanceWallets(aliceCtx, &v1pb.ListFinanceWalletsRequest{Parent: "users/finance-alice"})
	require.NoError(t, err)
	require.Equal(t, int64(6_000), wallets.Wallets[0].BalanceMinor)

	_, err = service.ListFinanceWallets(userCtx(ctx, bob.ID), &v1pb.ListFinanceWalletsRequest{Parent: "users/finance-alice"})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}
