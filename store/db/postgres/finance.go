package postgres

import (
	"context"

	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db/financedriver"
)

func (d *DB) finance() financedriver.Adapter {
	return financedriver.Adapter{DB: d.db, Dialect: "postgres"}
}

func (d *DB) CreateFinanceWallet(ctx context.Context, value *store.FinanceWallet) (*store.FinanceWallet, error) {
	return d.finance().CreateWallet(ctx, value)
}
func (d *DB) ListFinanceWallets(ctx context.Context, value *store.FindFinanceWallet) ([]*store.FinanceWallet, error) {
	return d.finance().ListWallets(ctx, value)
}
func (d *DB) UpdateFinanceWallet(ctx context.Context, value *store.UpdateFinanceWallet) (*store.FinanceWallet, error) {
	return d.finance().UpdateWallet(ctx, value)
}
func (d *DB) CreateFinanceCategory(ctx context.Context, value *store.FinanceCategory) (*store.FinanceCategory, error) {
	return d.finance().CreateCategory(ctx, value)
}
func (d *DB) ListFinanceCategories(ctx context.Context, value *store.FindFinanceCategory) ([]*store.FinanceCategory, error) {
	return d.finance().ListCategories(ctx, value)
}
func (d *DB) UpdateFinanceCategory(ctx context.Context, value *store.UpdateFinanceCategory) (*store.FinanceCategory, error) {
	return d.finance().UpdateCategory(ctx, value)
}
func (d *DB) CreateFinanceTransaction(ctx context.Context, value *store.FinanceTransaction) (*store.FinanceTransaction, error) {
	return d.finance().CreateTransaction(ctx, value)
}
func (d *DB) ListFinanceTransactions(ctx context.Context, value *store.FindFinanceTransaction) ([]*store.FinanceTransaction, error) {
	return d.finance().ListTransactions(ctx, value)
}
func (d *DB) UpdateFinanceTransaction(ctx context.Context, value *store.UpdateFinanceTransaction) (*store.FinanceTransaction, error) {
	return d.finance().UpdateTransaction(ctx, value)
}
func (d *DB) DeleteFinanceTransaction(ctx context.Context, value *store.DeleteFinanceTransaction) error {
	return d.finance().DeleteTransaction(ctx, value)
}
