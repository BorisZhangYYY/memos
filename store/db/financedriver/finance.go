// Package financedriver provides the shared SQL implementation for the three database drivers.
package financedriver

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/usememos/memos/store"
)

// Adapter applies the small SQL syntax differences needed by a finance store driver.
type Adapter struct {
	DB      *sql.DB
	Dialect string
}

func (a Adapter) bind(query string) string {
	if a.Dialect != "postgres" {
		return query
	}
	var builder strings.Builder
	index := 1
	for _, character := range query {
		if character == '?' {
			builder.WriteString("$")
			builder.WriteString(intString(index))
			index++
		} else {
			builder.WriteRune(character)
		}
	}
	return builder.String()
}

func intString(value int) string {
	if value == 0 {
		return "0"
	}
	var digits [20]byte
	position := len(digits)
	for value > 0 {
		position--
		digits[position] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[position:])
}

func (a Adapter) lockSuffix() string {
	if a.Dialect == "mysql" || a.Dialect == "postgres" {
		return " FOR UPDATE"
	}
	return ""
}

func (a Adapter) insertID(ctx context.Context, runner sqlRunner, query string, args ...any) (int32, error) {
	if a.Dialect == "postgres" {
		var id int32
		if err := runner.QueryRowContext(ctx, a.bind(query+" RETURNING id"), args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	result, err := runner.ExecContext(ctx, a.bind(query), args...)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	return int32(id), err
}

type sqlRunner interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (a Adapter) CreateWallet(ctx context.Context, create *store.FinanceWallet) (*store.FinanceWallet, error) {
	if create.InitialBalanceMinor < -store.MaxFinanceAmountMinor || create.InitialBalanceMinor > store.MaxFinanceAmountMinor {
		return nil, store.ErrFinanceAmountOutOfRange
	}
	nowSec := time.Now().Unix()
	id, err := a.insertID(ctx, a.DB, `
		INSERT INTO finance_wallet (
			uid, creator_id, created_ts, updated_ts, row_status, name,
			initial_balance_minor, balance_minor, allow_negative_balance
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		create.UID, create.CreatorID, nowSec, nowSec, store.Normal, create.Name,
		create.InitialBalanceMinor, create.InitialBalanceMinor, create.AllowNegativeBalance)
	if err != nil {
		return nil, err
	}
	return a.getWallet(ctx, a.DB, id, create.CreatorID, false)
}

func (a Adapter) ListWallets(ctx context.Context, find *store.FindFinanceWallet) ([]*store.FinanceWallet, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ID != nil {
		where, args = append(where, "id = ?"), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = ?"), append(args, *find.UID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = ?"), append(args, *find.CreatorID)
	}
	if find.RowStatus != nil {
		where, args = append(where, "row_status = ?"), append(args, *find.RowStatus)
	}
	if len(find.IDList) > 0 {
		placeholders := make([]string, 0, len(find.IDList))
		for _, id := range find.IDList {
			placeholders = append(placeholders, "?")
			args = append(args, id)
		}
		where = append(where, "id IN ("+strings.Join(placeholders, ",")+")")
	}
	rows, err := a.DB.QueryContext(ctx, a.bind(`
		SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name,
		       initial_balance_minor, balance_minor, allow_negative_balance
		FROM finance_wallet
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY row_status ASC, id ASC`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	wallets := []*store.FinanceWallet{}
	for rows.Next() {
		wallet := &store.FinanceWallet{}
		if err := scanWallet(rows, wallet); err != nil {
			return nil, err
		}
		wallets = append(wallets, wallet)
	}
	return wallets, rows.Err()
}

func (a Adapter) UpdateWallet(ctx context.Context, update *store.UpdateFinanceWallet) (*store.FinanceWallet, error) {
	tx, err := a.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	wallet, err := a.getWallet(ctx, tx, update.ID, update.CreatorID, true)
	if err != nil {
		return nil, err
	}
	if update.AllowNegativeBalance != nil && !*update.AllowNegativeBalance && wallet.BalanceMinor < 0 {
		return nil, store.ErrFinanceInsufficientBalance
	}
	set, args := []string{}, []any{}
	if update.UpdatedTs != nil {
		set, args = append(set, "updated_ts = ?"), append(args, *update.UpdatedTs)
	}
	if update.Name != nil {
		set, args = append(set, "name = ?"), append(args, *update.Name)
	}
	if update.RowStatus != nil {
		set, args = append(set, "row_status = ?"), append(args, *update.RowStatus)
	}
	if update.AllowNegativeBalance != nil {
		set, args = append(set, "allow_negative_balance = ?"), append(args, *update.AllowNegativeBalance)
	}
	if len(set) > 0 {
		args = append(args, update.ID, update.CreatorID)
		if _, err := tx.ExecContext(ctx, a.bind("UPDATE finance_wallet SET "+strings.Join(set, ", ")+" WHERE id = ? AND creator_id = ?"), args...); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return a.getWallet(ctx, a.DB, update.ID, update.CreatorID, false)
}

func (a Adapter) CreateCategory(ctx context.Context, create *store.FinanceCategory) (*store.FinanceCategory, error) {
	nowSec := time.Now().Unix()
	id, err := a.insertID(ctx, a.DB, `
		INSERT INTO finance_category (uid, creator_id, created_ts, updated_ts, row_status, name, type)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, create.UID, create.CreatorID, nowSec, nowSec, store.Normal, create.Name, create.Type)
	if err != nil {
		return nil, err
	}
	return a.getCategory(ctx, a.DB, id, create.CreatorID)
}

func (a Adapter) ListCategories(ctx context.Context, find *store.FindFinanceCategory) ([]*store.FinanceCategory, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ID != nil {
		where, args = append(where, "id = ?"), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = ?"), append(args, *find.UID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = ?"), append(args, *find.CreatorID)
	}
	if find.RowStatus != nil {
		where, args = append(where, "row_status = ?"), append(args, *find.RowStatus)
	}
	if find.Type != nil {
		where, args = append(where, "type = ?"), append(args, *find.Type)
	}
	rows, err := a.DB.QueryContext(ctx, a.bind(`
		SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name, type
		FROM finance_category WHERE `+strings.Join(where, " AND ")+`
		ORDER BY row_status ASC, type ASC, id ASC`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	categories := []*store.FinanceCategory{}
	for rows.Next() {
		category := &store.FinanceCategory{}
		if err := scanCategory(rows, category); err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

func (a Adapter) UpdateCategory(ctx context.Context, update *store.UpdateFinanceCategory) (*store.FinanceCategory, error) {
	if _, err := a.getCategory(ctx, a.DB, update.ID, update.CreatorID); err != nil {
		return nil, err
	}
	set, args := []string{}, []any{}
	if update.UpdatedTs != nil {
		set, args = append(set, "updated_ts = ?"), append(args, *update.UpdatedTs)
	}
	if update.Name != nil {
		set, args = append(set, "name = ?"), append(args, *update.Name)
	}
	if update.RowStatus != nil {
		set, args = append(set, "row_status = ?"), append(args, *update.RowStatus)
	}
	if len(set) > 0 {
		args = append(args, update.ID, update.CreatorID)
		if _, err := a.DB.ExecContext(ctx, a.bind("UPDATE finance_category SET "+strings.Join(set, ", ")+" WHERE id = ? AND creator_id = ?"), args...); err != nil {
			return nil, err
		}
	}
	return a.getCategory(ctx, a.DB, update.ID, update.CreatorID)
}

func (a Adapter) CreateTransaction(ctx context.Context, create *store.FinanceTransaction) (*store.FinanceTransaction, error) {
	if err := validateTransactionAmounts(create); err != nil {
		return nil, err
	}
	tx, err := a.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	wallets, err := a.loadCreatorWallets(ctx, tx, create.CreatorID)
	if err != nil {
		return nil, err
	}
	if err := a.validateReferences(ctx, tx, create, wallets); err != nil {
		return nil, err
	}
	nowSec := time.Now().Unix()
	id, err := a.insertID(ctx, tx, `
		INSERT INTO finance_transaction (
			uid, creator_id, created_ts, updated_ts, occurred_ts, type, amount_minor, wallet_id,
			destination_wallet_id, category_id, note, adjustment_delta_minor, balance_before_minor, balance_after_minor
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		create.UID, create.CreatorID, nowSec, nowSec, create.OccurredTs, create.Type, create.AmountMinor, create.WalletID,
		create.DestinationWalletID, create.CategoryID, create.Note, create.AdjustmentDeltaMinor,
		create.BalanceBeforeMinor, create.BalanceAfterMinor)
	if err != nil {
		return nil, err
	}
	if err := a.rebuildLedger(ctx, tx, create.CreatorID, wallets); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return a.getTransaction(ctx, a.DB, id, create.CreatorID, false)
}

func (a Adapter) ListTransactions(ctx context.Context, find *store.FindFinanceTransaction) ([]*store.FinanceTransaction, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ID != nil {
		where, args = append(where, "id = ?"), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = ?"), append(args, *find.UID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = ?"), append(args, *find.CreatorID)
	}
	if find.WalletID != nil {
		where, args = append(where, "(wallet_id = ? OR destination_wallet_id = ?)"), append(args, *find.WalletID, *find.WalletID)
	}
	if find.Type != nil {
		where, args = append(where, "type = ?"), append(args, *find.Type)
	}
	if find.StartTs != nil {
		where, args = append(where, "occurred_ts >= ?"), append(args, *find.StartTs)
	}
	if find.EndTs != nil {
		where, args = append(where, "occurred_ts < ?"), append(args, *find.EndTs)
	}
	query := `
		SELECT id, uid, creator_id, created_ts, updated_ts, occurred_ts, type, amount_minor,
		       wallet_id, destination_wallet_id, category_id, note, adjustment_delta_minor,
		       balance_before_minor, balance_after_minor
		FROM finance_transaction WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY occurred_ts DESC, id DESC`
	if find.Limit != nil {
		query += " LIMIT ?"
		args = append(args, *find.Limit)
		if find.Offset != nil {
			query += " OFFSET ?"
			args = append(args, *find.Offset)
		}
	}
	rows, err := a.DB.QueryContext(ctx, a.bind(query), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	transactions := []*store.FinanceTransaction{}
	for rows.Next() {
		transaction := &store.FinanceTransaction{}
		if err := scanTransaction(rows, transaction); err != nil {
			return nil, err
		}
		transactions = append(transactions, transaction)
	}
	return transactions, rows.Err()
}

func (a Adapter) UpdateTransaction(ctx context.Context, update *store.UpdateFinanceTransaction) (*store.FinanceTransaction, error) {
	tx, err := a.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	wallets, err := a.loadCreatorWallets(ctx, tx, update.CreatorID)
	if err != nil {
		return nil, err
	}
	existing, err := a.getTransaction(ctx, tx, update.ID, update.CreatorID, true)
	if err != nil {
		return nil, err
	}
	if existing.Type == store.FinanceTransactionAdjustment || update.Type == store.FinanceTransactionAdjustment {
		return nil, store.ErrFinanceInvalidTransaction
	}
	replacement := &store.FinanceTransaction{
		ID: update.ID, UID: existing.UID, CreatorID: update.CreatorID, CreatedTs: existing.CreatedTs, UpdatedTs: update.UpdatedTs,
		OccurredTs: update.OccurredTs, Type: update.Type, AmountMinor: update.AmountMinor, WalletID: update.WalletID,
		DestinationWalletID: update.DestinationWalletID, CategoryID: update.CategoryID, Note: update.Note,
	}
	if err := validateTransactionAmounts(replacement); err != nil {
		return nil, err
	}
	if err := a.validateReferences(ctx, tx, replacement, wallets); err != nil {
		return nil, err
	}
	_, err = tx.ExecContext(ctx, a.bind(`
		UPDATE finance_transaction
		SET updated_ts = ?, occurred_ts = ?, type = ?, amount_minor = ?, wallet_id = ?,
		    destination_wallet_id = ?, category_id = ?, note = ?
		WHERE id = ? AND creator_id = ?`),
		update.UpdatedTs, update.OccurredTs, update.Type, update.AmountMinor, update.WalletID,
		update.DestinationWalletID, update.CategoryID, update.Note, update.ID, update.CreatorID)
	if err != nil {
		return nil, err
	}
	if err := a.rebuildLedger(ctx, tx, update.CreatorID, wallets); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return a.getTransaction(ctx, a.DB, update.ID, update.CreatorID, false)
}

func (a Adapter) DeleteTransaction(ctx context.Context, delete *store.DeleteFinanceTransaction) error {
	tx, err := a.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	wallets, err := a.loadCreatorWallets(ctx, tx, delete.CreatorID)
	if err != nil {
		return err
	}
	if _, err := a.getTransaction(ctx, tx, delete.ID, delete.CreatorID, true); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, a.bind("DELETE FROM finance_transaction WHERE id = ? AND creator_id = ?"), delete.ID, delete.CreatorID); err != nil {
		return err
	}
	if err := a.rebuildLedger(ctx, tx, delete.CreatorID, wallets); err != nil {
		return err
	}
	return tx.Commit()
}

type scanner interface {
	Scan(...any) error
}

func scanWallet(row scanner, wallet *store.FinanceWallet) error {
	return row.Scan(&wallet.ID, &wallet.UID, &wallet.CreatorID, &wallet.CreatedTs, &wallet.UpdatedTs,
		&wallet.RowStatus, &wallet.Name, &wallet.InitialBalanceMinor, &wallet.BalanceMinor, &wallet.AllowNegativeBalance)
}

func scanCategory(row scanner, category *store.FinanceCategory) error {
	return row.Scan(&category.ID, &category.UID, &category.CreatorID, &category.CreatedTs, &category.UpdatedTs,
		&category.RowStatus, &category.Name, &category.Type)
}

func scanTransaction(row scanner, transaction *store.FinanceTransaction) error {
	var destinationWalletID, categoryID sql.NullInt32
	if err := row.Scan(&transaction.ID, &transaction.UID, &transaction.CreatorID, &transaction.CreatedTs, &transaction.UpdatedTs,
		&transaction.OccurredTs, &transaction.Type, &transaction.AmountMinor, &transaction.WalletID,
		&destinationWalletID, &categoryID, &transaction.Note, &transaction.AdjustmentDeltaMinor,
		&transaction.BalanceBeforeMinor, &transaction.BalanceAfterMinor); err != nil {
		return err
	}
	if destinationWalletID.Valid {
		value := destinationWalletID.Int32
		transaction.DestinationWalletID = &value
	}
	if categoryID.Valid {
		value := categoryID.Int32
		transaction.CategoryID = &value
	}
	return nil
}

func (a Adapter) getWallet(ctx context.Context, runner sqlRunner, id, creatorID int32, lock bool) (*store.FinanceWallet, error) {
	wallet := &store.FinanceWallet{}
	query := `SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name,
	                 initial_balance_minor, balance_minor, allow_negative_balance
	          FROM finance_wallet WHERE id = ? AND creator_id = ?`
	if lock {
		query += a.lockSuffix()
	}
	err := scanWallet(runner.QueryRowContext(ctx, a.bind(query), id, creatorID), wallet)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrFinanceWalletNotFound
	}
	return wallet, err
}

func (a Adapter) getCategory(ctx context.Context, runner sqlRunner, id, creatorID int32) (*store.FinanceCategory, error) {
	category := &store.FinanceCategory{}
	err := scanCategory(runner.QueryRowContext(ctx, a.bind(`
		SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name, type
		FROM finance_category WHERE id = ? AND creator_id = ?`), id, creatorID), category)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrFinanceCategoryNotFound
	}
	return category, err
}

func (a Adapter) getTransaction(ctx context.Context, runner sqlRunner, id, creatorID int32, lock bool) (*store.FinanceTransaction, error) {
	transaction := &store.FinanceTransaction{}
	query := `SELECT id, uid, creator_id, created_ts, updated_ts, occurred_ts, type, amount_minor,
	                 wallet_id, destination_wallet_id, category_id, note, adjustment_delta_minor,
	                 balance_before_minor, balance_after_minor
	          FROM finance_transaction WHERE id = ? AND creator_id = ?`
	if lock {
		query += a.lockSuffix()
	}
	err := scanTransaction(runner.QueryRowContext(ctx, a.bind(query), id, creatorID), transaction)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrFinanceTransactionNotFound
	}
	return transaction, err
}

func (a Adapter) loadCreatorWallets(ctx context.Context, tx *sql.Tx, creatorID int32) (map[int32]*store.FinanceWallet, error) {
	query := `SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name,
	                 initial_balance_minor, balance_minor, allow_negative_balance
	          FROM finance_wallet WHERE creator_id = ? ORDER BY id ASC` + a.lockSuffix()
	rows, err := tx.QueryContext(ctx, a.bind(query), creatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	wallets := map[int32]*store.FinanceWallet{}
	for rows.Next() {
		wallet := &store.FinanceWallet{}
		if err := scanWallet(rows, wallet); err != nil {
			return nil, err
		}
		wallets[wallet.ID] = wallet
	}
	return wallets, rows.Err()
}

func (a Adapter) validateReferences(
	ctx context.Context,
	tx *sql.Tx,
	transaction *store.FinanceTransaction,
	wallets map[int32]*store.FinanceWallet,
) error {
	primaryWallet, ok := wallets[transaction.WalletID]
	if !ok {
		return store.ErrFinanceWalletNotFound
	}
	if primaryWallet.RowStatus != store.Normal {
		return store.ErrFinanceArchivedResource
	}
	if transaction.Type == store.FinanceTransactionTransfer {
		if transaction.DestinationWalletID == nil || *transaction.DestinationWalletID == transaction.WalletID {
			return store.ErrFinanceInvalidTransaction
		}
		destinationWallet, ok := wallets[*transaction.DestinationWalletID]
		if !ok {
			return store.ErrFinanceWalletNotFound
		}
		if destinationWallet.RowStatus != store.Normal {
			return store.ErrFinanceArchivedResource
		}
		if transaction.CategoryID != nil {
			return store.ErrFinanceInvalidTransaction
		}
		return nil
	}
	if transaction.Type == store.FinanceTransactionAdjustment {
		if transaction.DestinationWalletID != nil || transaction.CategoryID != nil {
			return store.ErrFinanceInvalidTransaction
		}
		return nil
	}
	if transaction.CategoryID == nil {
		return store.ErrFinanceCategoryNotFound
	}
	category, err := a.getCategory(ctx, tx, *transaction.CategoryID, transaction.CreatorID)
	if err != nil {
		return err
	}
	if category.RowStatus != store.Normal {
		return store.ErrFinanceArchivedResource
	}
	if (transaction.Type == store.FinanceTransactionIncome && category.Type != store.FinanceCategoryIncome) ||
		(transaction.Type == store.FinanceTransactionExpense && category.Type != store.FinanceCategoryExpense) {
		return store.ErrFinanceInvalidTransaction
	}
	return nil
}

// rebuildLedger recalculates every running balance in chronological order.
// Adjustment rows keep their observed balance target while their delta changes
// when an earlier transaction is inserted, updated, or deleted.
func (a Adapter) rebuildLedger(
	ctx context.Context,
	tx *sql.Tx,
	creatorID int32,
	wallets map[int32]*store.FinanceWallet,
) error {
	previousBalances := make(map[int32]int64, len(wallets))
	for walletID, wallet := range wallets {
		previousBalances[walletID] = wallet.BalanceMinor
		wallet.BalanceMinor = wallet.InitialBalanceMinor
	}

	query := `SELECT id, uid, creator_id, created_ts, updated_ts, occurred_ts, type, amount_minor,
	                 wallet_id, destination_wallet_id, category_id, note, adjustment_delta_minor,
	                 balance_before_minor, balance_after_minor
	          FROM finance_transaction WHERE creator_id = ?
	          ORDER BY occurred_ts ASC, id ASC` + a.lockSuffix()
	rows, err := tx.QueryContext(ctx, a.bind(query), creatorID)
	if err != nil {
		return err
	}
	transactions := []*store.FinanceTransaction{}
	for rows.Next() {
		transaction := &store.FinanceTransaction{}
		if err := scanTransaction(rows, transaction); err != nil {
			rows.Close()
			return err
		}
		transactions = append(transactions, transaction)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	for _, transaction := range transactions {
		primaryWallet, ok := wallets[transaction.WalletID]
		if !ok {
			return store.ErrFinanceWalletNotFound
		}
		transaction.BalanceBeforeMinor = primaryWallet.BalanceMinor
		if transaction.Type == store.FinanceTransactionAdjustment {
			targetBalance := transaction.BalanceAfterMinor
			if targetBalance < -store.MaxFinanceAmountMinor || targetBalance > store.MaxFinanceAmountMinor {
				return store.ErrFinanceAmountOutOfRange
			}
			if targetBalance < 0 && !primaryWallet.AllowNegativeBalance {
				return store.ErrFinanceInsufficientBalance
			}
			transaction.AdjustmentDeltaMinor = targetBalance - transaction.BalanceBeforeMinor
			transaction.AmountMinor = abs64(transaction.AdjustmentDeltaMinor)
			primaryWallet.BalanceMinor = targetBalance
		} else {
			transaction.AdjustmentDeltaMinor = 0
			if err := validateTransactionAmounts(transaction); err != nil {
				return err
			}
			if err := applyEffectsToWallets(wallets, store.FinanceTransactionEffects(transaction)); err != nil {
				return err
			}
			transaction.BalanceAfterMinor = primaryWallet.BalanceMinor
		}
		if _, err := tx.ExecContext(ctx, a.bind(`
			UPDATE finance_transaction
			SET amount_minor = ?, adjustment_delta_minor = ?, balance_before_minor = ?, balance_after_minor = ?
			WHERE id = ? AND creator_id = ?`),
			transaction.AmountMinor, transaction.AdjustmentDeltaMinor,
			transaction.BalanceBeforeMinor, transaction.BalanceAfterMinor,
			transaction.ID, creatorID); err != nil {
			return err
		}
	}

	nowSec := time.Now().Unix()
	for walletID, wallet := range wallets {
		if previousBalances[walletID] == wallet.BalanceMinor {
			continue
		}
		if _, err := tx.ExecContext(ctx, a.bind(
			"UPDATE finance_wallet SET balance_minor = ?, updated_ts = ? WHERE id = ? AND creator_id = ?",
		), wallet.BalanceMinor, nowSec, walletID, creatorID); err != nil {
			return err
		}
	}
	return nil
}

func applyEffectsToWallets(wallets map[int32]*store.FinanceWallet, effects map[int32]int64) error {
	for walletID, delta := range effects {
		wallet, ok := wallets[walletID]
		if !ok {
			return store.ErrFinanceWalletNotFound
		}
		next := wallet.BalanceMinor + delta
		if next < -store.MaxFinanceAmountMinor || next > store.MaxFinanceAmountMinor {
			return store.ErrFinanceAmountOutOfRange
		}
		if next < 0 && !wallet.AllowNegativeBalance {
			return store.ErrFinanceInsufficientBalance
		}
		wallet.BalanceMinor = next
	}
	return nil
}

func validateTransactionAmounts(transaction *store.FinanceTransaction) error {
	switch transaction.Type {
	case store.FinanceTransactionIncome, store.FinanceTransactionExpense, store.FinanceTransactionTransfer:
		if transaction.AmountMinor <= 0 || transaction.AmountMinor > store.MaxFinanceAmountMinor {
			return store.ErrFinanceAmountOutOfRange
		}
	case store.FinanceTransactionAdjustment:
		if transaction.BalanceAfterMinor < -store.MaxFinanceAmountMinor || transaction.BalanceAfterMinor > store.MaxFinanceAmountMinor {
			return store.ErrFinanceAmountOutOfRange
		}
	default:
		return store.ErrFinanceInvalidTransaction
	}
	return nil
}

func abs64(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}
