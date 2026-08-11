package store

import (
	"context"
	"errors"
)

// FinanceTransactionType describes how a ledger transaction affects wallets.
type FinanceTransactionType string

const (
	FinanceTransactionIncome     FinanceTransactionType = "INCOME"
	FinanceTransactionExpense    FinanceTransactionType = "EXPENSE"
	FinanceTransactionTransfer   FinanceTransactionType = "TRANSFER"
	FinanceTransactionAdjustment FinanceTransactionType = "ADJUSTMENT"
)

// FinanceCategoryType restricts a category to one side of the ledger.
type FinanceCategoryType string

const (
	FinanceCategoryIncome  FinanceCategoryType = "INCOME"
	FinanceCategoryExpense FinanceCategoryType = "EXPENSE"
)

// MaxFinanceAmountMinor bounds one amount or wallet balance while leaving ample headroom for exact int64 arithmetic.
const MaxFinanceAmountMinor int64 = 9_000_000_000_000_000

var (
	// ErrFinanceWalletNotFound indicates that a wallet was not found or belongs to another user.
	ErrFinanceWalletNotFound = errors.New("finance wallet not found")
	// ErrFinanceCategoryNotFound indicates that a category was not found or belongs to another user.
	ErrFinanceCategoryNotFound = errors.New("finance category not found")
	// ErrFinanceTransactionNotFound indicates that a transaction was not found or belongs to another user.
	ErrFinanceTransactionNotFound = errors.New("finance transaction not found")
	// ErrFinanceInsufficientBalance indicates that a wallet would become negative while negative balances are disabled.
	ErrFinanceInsufficientBalance = errors.New("insufficient wallet balance")
	// ErrFinanceArchivedResource indicates that an archived wallet or category was selected for a new transaction.
	ErrFinanceArchivedResource = errors.New("archived finance resource")
	// ErrFinanceAmountOutOfRange indicates an invalid amount or a wallet balance outside the supported range.
	ErrFinanceAmountOutOfRange = errors.New("finance amount is outside the supported range")
	// ErrFinanceInvalidTransaction indicates an invalid combination of transaction fields.
	ErrFinanceInvalidTransaction = errors.New("invalid finance transaction")
)

// FinanceWallet is a user-owned account whose balance is maintained by ledger mutations.
type FinanceWallet struct {
	ID                   int32
	UID                  string
	CreatorID            int32
	CreatedTs            int64
	UpdatedTs            int64
	RowStatus            RowStatus
	Name                 string
	InitialBalanceMinor  int64
	BalanceMinor         int64
	AllowNegativeBalance bool
}

// FindFinanceWallet filters wallets.
type FindFinanceWallet struct {
	ID        *int32
	UID       *string
	CreatorID *int32
	RowStatus *RowStatus
	IDList    []int32
}

// UpdateFinanceWallet contains mutable wallet fields. Balances are changed only by ledger mutations.
type UpdateFinanceWallet struct {
	ID                   int32
	CreatorID            int32
	UpdatedTs            *int64
	Name                 *string
	RowStatus            *RowStatus
	AllowNegativeBalance *bool
}

// FinanceCategory is a user-defined income or expense classification.
type FinanceCategory struct {
	ID        int32
	UID       string
	CreatorID int32
	CreatedTs int64
	UpdatedTs int64
	RowStatus RowStatus
	Name      string
	Type      FinanceCategoryType
}

// FindFinanceCategory filters categories.
type FindFinanceCategory struct {
	ID        *int32
	UID       *string
	CreatorID *int32
	RowStatus *RowStatus
	Type      *FinanceCategoryType
}

// UpdateFinanceCategory contains mutable category fields.
type UpdateFinanceCategory struct {
	ID        int32
	CreatorID int32
	UpdatedTs *int64
	Name      *string
	RowStatus *RowStatus
}

// FinanceTransaction is an immutable ledger effect except when explicitly updated.
type FinanceTransaction struct {
	ID                   int32
	UID                  string
	CreatorID            int32
	CreatedTs            int64
	UpdatedTs            int64
	OccurredTs           int64
	Type                 FinanceTransactionType
	AmountMinor          int64
	WalletID             int32
	DestinationWalletID  *int32
	CategoryID           *int32
	Note                 string
	AdjustmentDeltaMinor int64
	BalanceBeforeMinor   int64
	BalanceAfterMinor    int64
}

// FindFinanceTransaction filters ledger transactions.
type FindFinanceTransaction struct {
	ID        *int32
	UID       *string
	CreatorID *int32
	WalletID  *int32
	Type      *FinanceTransactionType
	StartTs   *int64
	EndTs     *int64
	Limit     *int
	Offset    *int
}

// UpdateFinanceTransaction replaces the mutable business fields of a transaction.
type UpdateFinanceTransaction struct {
	ID                  int32
	CreatorID           int32
	UpdatedTs           int64
	OccurredTs          int64
	Type                FinanceTransactionType
	AmountMinor         int64
	WalletID            int32
	DestinationWalletID *int32
	CategoryID          *int32
	Note                string
}

// DeleteFinanceTransaction identifies the transaction to reverse and delete.
type DeleteFinanceTransaction struct {
	ID        int32
	CreatorID int32
}

// FinanceTransactionEffects returns signed per-wallet deltas for a transaction.
func FinanceTransactionEffects(transaction *FinanceTransaction) map[int32]int64 {
	effects := map[int32]int64{}
	switch transaction.Type {
	case FinanceTransactionIncome:
		effects[transaction.WalletID] += transaction.AmountMinor
	case FinanceTransactionExpense:
		effects[transaction.WalletID] -= transaction.AmountMinor
	case FinanceTransactionTransfer:
		effects[transaction.WalletID] -= transaction.AmountMinor
		if transaction.DestinationWalletID != nil {
			effects[*transaction.DestinationWalletID] += transaction.AmountMinor
		}
	case FinanceTransactionAdjustment:
		effects[transaction.WalletID] += transaction.AdjustmentDeltaMinor
	default:
		// Unknown transaction types do not affect wallet balances.
	}
	return effects
}

// CreateFinanceWallet creates a wallet.
func (s *Store) CreateFinanceWallet(ctx context.Context, create *FinanceWallet) (*FinanceWallet, error) {
	return s.driver.CreateFinanceWallet(ctx, create)
}

// ListFinanceWallets lists wallets.
func (s *Store) ListFinanceWallets(ctx context.Context, find *FindFinanceWallet) ([]*FinanceWallet, error) {
	return s.driver.ListFinanceWallets(ctx, find)
}

// UpdateFinanceWallet updates wallet metadata.
func (s *Store) UpdateFinanceWallet(ctx context.Context, update *UpdateFinanceWallet) (*FinanceWallet, error) {
	return s.driver.UpdateFinanceWallet(ctx, update)
}

// CreateFinanceCategory creates a category.
func (s *Store) CreateFinanceCategory(ctx context.Context, create *FinanceCategory) (*FinanceCategory, error) {
	return s.driver.CreateFinanceCategory(ctx, create)
}

// ListFinanceCategories lists categories.
func (s *Store) ListFinanceCategories(ctx context.Context, find *FindFinanceCategory) ([]*FinanceCategory, error) {
	return s.driver.ListFinanceCategories(ctx, find)
}

// UpdateFinanceCategory updates category metadata.
func (s *Store) UpdateFinanceCategory(ctx context.Context, update *UpdateFinanceCategory) (*FinanceCategory, error) {
	return s.driver.UpdateFinanceCategory(ctx, update)
}

// CreateFinanceTransaction atomically inserts a ledger row and applies its wallet effects.
func (s *Store) CreateFinanceTransaction(ctx context.Context, create *FinanceTransaction) (*FinanceTransaction, error) {
	return s.driver.CreateFinanceTransaction(ctx, create)
}

// ListFinanceTransactions lists ledger transactions.
func (s *Store) ListFinanceTransactions(ctx context.Context, find *FindFinanceTransaction) ([]*FinanceTransaction, error) {
	return s.driver.ListFinanceTransactions(ctx, find)
}

// UpdateFinanceTransaction atomically reverses the old effects and applies the replacement.
func (s *Store) UpdateFinanceTransaction(ctx context.Context, update *UpdateFinanceTransaction) (*FinanceTransaction, error) {
	return s.driver.UpdateFinanceTransaction(ctx, update)
}

// DeleteFinanceTransaction atomically reverses and deletes a transaction.
func (s *Store) DeleteFinanceTransaction(ctx context.Context, delete *DeleteFinanceTransaction) error {
	return s.driver.DeleteFinanceTransaction(ctx, delete)
}
