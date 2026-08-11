package v1

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/util"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

const (
	maxFinanceNameLength = 100
	maxFinanceNoteLength = 500
)

func financeWalletName(username, uid string) string {
	return BuildUserName(username) + "/wallets/" + uid
}

func financeCategoryName(username, uid string) string {
	return BuildUserName(username) + "/financeCategories/" + uid
}

func financeTransactionName(username, uid string) string {
	return BuildUserName(username) + "/financeTransactions/" + uid
}

func parseFinanceResourceName(name, collection string) (string, string, error) {
	parts := strings.Split(name, "/")
	if len(parts) != 4 || parts[0] != "users" || parts[1] == "" || parts[2] != collection || parts[3] == "" {
		return "", "", status.Errorf(codes.InvalidArgument, "invalid finance resource name: %s", name)
	}
	return parts[1], parts[3], nil
}

func (s *APIV1Service) authorizeFinanceParent(ctx context.Context, parent string) (*store.User, error) {
	user, err := ResolveUserByName(ctx, s.Store, parent)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user name: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}
	if _, err := s.authorizeUserResourceAccess(ctx, user.ID, false); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *APIV1Service) resolveFinanceWallet(ctx context.Context, name string) (*store.User, *store.FinanceWallet, error) {
	username, uid, err := parseFinanceResourceName(name, "wallets")
	if err != nil {
		return nil, nil, err
	}
	user, err := s.authorizeFinanceParent(ctx, BuildUserName(username))
	if err != nil {
		return nil, nil, err
	}
	wallets, err := s.Store.ListFinanceWallets(ctx, &store.FindFinanceWallet{UID: &uid, CreatorID: &user.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get finance wallet: %v", err)
	}
	if len(wallets) == 0 {
		return nil, nil, status.Errorf(codes.NotFound, "finance wallet not found")
	}
	return user, wallets[0], nil
}

func (s *APIV1Service) resolveFinanceCategory(ctx context.Context, name string) (*store.User, *store.FinanceCategory, error) {
	username, uid, err := parseFinanceResourceName(name, "financeCategories")
	if err != nil {
		return nil, nil, err
	}
	user, err := s.authorizeFinanceParent(ctx, BuildUserName(username))
	if err != nil {
		return nil, nil, err
	}
	categories, err := s.Store.ListFinanceCategories(ctx, &store.FindFinanceCategory{UID: &uid, CreatorID: &user.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get finance category: %v", err)
	}
	if len(categories) == 0 {
		return nil, nil, status.Errorf(codes.NotFound, "finance category not found")
	}
	return user, categories[0], nil
}

func (s *APIV1Service) resolveFinanceTransaction(ctx context.Context, name string) (*store.User, *store.FinanceTransaction, error) {
	username, uid, err := parseFinanceResourceName(name, "financeTransactions")
	if err != nil {
		return nil, nil, err
	}
	user, err := s.authorizeFinanceParent(ctx, BuildUserName(username))
	if err != nil {
		return nil, nil, err
	}
	transactions, err := s.Store.ListFinanceTransactions(ctx, &store.FindFinanceTransaction{UID: &uid, CreatorID: &user.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get finance transaction: %v", err)
	}
	if len(transactions) == 0 {
		return nil, nil, status.Errorf(codes.NotFound, "finance transaction not found")
	}
	return user, transactions[0], nil
}

func convertFinanceWalletFromStore(username string, wallet *store.FinanceWallet) *v1pb.FinanceWallet {
	return &v1pb.FinanceWallet{
		Name:                 financeWalletName(username, wallet.UID),
		DisplayName:          wallet.Name,
		InitialBalanceMinor:  wallet.InitialBalanceMinor,
		BalanceMinor:         wallet.BalanceMinor,
		AllowNegativeBalance: wallet.AllowNegativeBalance,
		State:                convertStateFromStore(wallet.RowStatus),
		CreateTime:           timestamppb.New(time.Unix(wallet.CreatedTs, 0)),
		UpdateTime:           timestamppb.New(time.Unix(wallet.UpdatedTs, 0)),
	}
}

func convertFinanceCategoryFromStore(username string, category *store.FinanceCategory) *v1pb.FinanceCategory {
	categoryType := v1pb.FinanceCategory_TYPE_UNSPECIFIED
	if category.Type == store.FinanceCategoryIncome {
		categoryType = v1pb.FinanceCategory_INCOME
	} else if category.Type == store.FinanceCategoryExpense {
		categoryType = v1pb.FinanceCategory_EXPENSE
	}
	return &v1pb.FinanceCategory{
		Name:        financeCategoryName(username, category.UID),
		DisplayName: category.Name,
		Type:        categoryType,
		State:       convertStateFromStore(category.RowStatus),
		CreateTime:  timestamppb.New(time.Unix(category.CreatedTs, 0)),
		UpdateTime:  timestamppb.New(time.Unix(category.UpdatedTs, 0)),
	}
}

func convertFinanceTransactionTypeToStore(transactionType v1pb.FinanceTransaction_Type) store.FinanceTransactionType {
	switch transactionType {
	case v1pb.FinanceTransaction_INCOME:
		return store.FinanceTransactionIncome
	case v1pb.FinanceTransaction_EXPENSE:
		return store.FinanceTransactionExpense
	case v1pb.FinanceTransaction_TRANSFER:
		return store.FinanceTransactionTransfer
	case v1pb.FinanceTransaction_ADJUSTMENT:
		return store.FinanceTransactionAdjustment
	default:
		return ""
	}
}

func convertFinanceTransactionTypeFromStore(transactionType store.FinanceTransactionType) v1pb.FinanceTransaction_Type {
	switch transactionType {
	case store.FinanceTransactionIncome:
		return v1pb.FinanceTransaction_INCOME
	case store.FinanceTransactionExpense:
		return v1pb.FinanceTransaction_EXPENSE
	case store.FinanceTransactionTransfer:
		return v1pb.FinanceTransaction_TRANSFER
	case store.FinanceTransactionAdjustment:
		return v1pb.FinanceTransaction_ADJUSTMENT
	default:
		return v1pb.FinanceTransaction_TYPE_UNSPECIFIED
	}
}

func convertFinanceTransactionFromStore(
	username string,
	transaction *store.FinanceTransaction,
	walletUIDs map[int32]string,
	categoryUIDs map[int32]string,
) *v1pb.FinanceTransaction {
	message := &v1pb.FinanceTransaction{
		Name:                 financeTransactionName(username, transaction.UID),
		Type:                 convertFinanceTransactionTypeFromStore(transaction.Type),
		AmountMinor:          transaction.AmountMinor,
		Wallet:               financeWalletName(username, walletUIDs[transaction.WalletID]),
		Note:                 transaction.Note,
		OccurTime:            timestamppb.New(time.Unix(transaction.OccurredTs, 0)),
		CreateTime:           timestamppb.New(time.Unix(transaction.CreatedTs, 0)),
		UpdateTime:           timestamppb.New(time.Unix(transaction.UpdatedTs, 0)),
		AdjustmentDeltaMinor: transaction.AdjustmentDeltaMinor,
		BalanceBeforeMinor:   transaction.BalanceBeforeMinor,
		BalanceAfterMinor:    transaction.BalanceAfterMinor,
	}
	if transaction.DestinationWalletID != nil {
		message.DestinationWallet = financeWalletName(username, walletUIDs[*transaction.DestinationWalletID])
	}
	if transaction.CategoryID != nil {
		message.Category = financeCategoryName(username, categoryUIDs[*transaction.CategoryID])
	}
	return message
}

func validateFinanceDisplayName(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return status.Error(codes.InvalidArgument, "display name is required")
	}
	if len([]rune(value)) > maxFinanceNameLength {
		return status.Errorf(codes.InvalidArgument, "display name exceeds %d characters", maxFinanceNameLength)
	}
	return nil
}

func validateFinanceAmount(amount int64) error {
	if amount <= 0 || amount > store.MaxFinanceAmountMinor {
		return status.Error(codes.InvalidArgument, "amount must be greater than zero and within the supported range")
	}
	return nil
}

func financeStoreError(err error) error {
	switch {
	case errors.Is(err, store.ErrFinanceWalletNotFound), errors.Is(err, store.ErrFinanceCategoryNotFound), errors.Is(err, store.ErrFinanceTransactionNotFound):
		return status.Error(codes.NotFound, err.Error())
	case errors.Is(err, store.ErrFinanceInsufficientBalance), errors.Is(err, store.ErrFinanceArchivedResource):
		return status.Error(codes.FailedPrecondition, err.Error())
	case errors.Is(err, store.ErrFinanceAmountOutOfRange), errors.Is(err, store.ErrFinanceInvalidTransaction):
		return status.Error(codes.InvalidArgument, err.Error())
	default:
		return status.Errorf(codes.Internal, "finance operation failed: %v", err)
	}
}

func (s *APIV1Service) ListFinanceWallets(ctx context.Context, request *v1pb.ListFinanceWalletsRequest) (*v1pb.ListFinanceWalletsResponse, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	find := &store.FindFinanceWallet{CreatorID: &user.ID}
	if request.State != v1pb.State_STATE_UNSPECIFIED {
		state := convertStateToStore(request.State)
		find.RowStatus = &state
	}
	wallets, err := s.Store.ListFinanceWallets(ctx, find)
	if err != nil {
		return nil, financeStoreError(err)
	}
	response := &v1pb.ListFinanceWalletsResponse{Wallets: make([]*v1pb.FinanceWallet, 0, len(wallets))}
	for _, wallet := range wallets {
		response.Wallets = append(response.Wallets, convertFinanceWalletFromStore(user.Username, wallet))
	}
	return response, nil
}

func (s *APIV1Service) CreateFinanceWallet(ctx context.Context, request *v1pb.CreateFinanceWalletRequest) (*v1pb.FinanceWallet, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.Wallet == nil {
		return nil, status.Error(codes.InvalidArgument, "wallet is required")
	}
	if err := validateFinanceDisplayName(request.Wallet.DisplayName); err != nil {
		return nil, err
	}
	if request.Wallet.InitialBalanceMinor < 0 && !request.Wallet.AllowNegativeBalance {
		return nil, status.Error(codes.InvalidArgument, "negative initial balance requires negative balances to be enabled")
	}
	if request.Wallet.InitialBalanceMinor < -store.MaxFinanceAmountMinor || request.Wallet.InitialBalanceMinor > store.MaxFinanceAmountMinor {
		return nil, status.Error(codes.InvalidArgument, "initial balance is outside the supported range")
	}
	uid := request.RequestId
	if uid == "" {
		uid = util.GenUUID()
	} else {
		existing, listErr := s.Store.ListFinanceWallets(ctx, &store.FindFinanceWallet{UID: &uid, CreatorID: &user.ID})
		if listErr != nil {
			return nil, financeStoreError(listErr)
		}
		if len(existing) > 0 {
			return convertFinanceWalletFromStore(user.Username, existing[0]), nil
		}
	}
	wallet, err := s.Store.CreateFinanceWallet(ctx, &store.FinanceWallet{
		UID:                  uid,
		CreatorID:            user.ID,
		Name:                 strings.TrimSpace(request.Wallet.DisplayName),
		InitialBalanceMinor:  request.Wallet.InitialBalanceMinor,
		AllowNegativeBalance: request.Wallet.AllowNegativeBalance,
	})
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceWalletFromStore(user.Username, wallet), nil
}

func (s *APIV1Service) UpdateFinanceWallet(ctx context.Context, request *v1pb.UpdateFinanceWalletRequest) (*v1pb.FinanceWallet, error) {
	if request.Wallet == nil || request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Error(codes.InvalidArgument, "wallet and update mask are required")
	}
	user, wallet, err := s.resolveFinanceWallet(ctx, request.Wallet.Name)
	if err != nil {
		return nil, err
	}
	nowSec := time.Now().Unix()
	update := &store.UpdateFinanceWallet{ID: wallet.ID, CreatorID: user.ID, UpdatedTs: &nowSec}
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "display_name":
			if err := validateFinanceDisplayName(request.Wallet.DisplayName); err != nil {
				return nil, err
			}
			name := strings.TrimSpace(request.Wallet.DisplayName)
			update.Name = &name
		case "state":
			state := convertStateToStore(request.Wallet.State)
			update.RowStatus = &state
		case "allow_negative_balance":
			value := request.Wallet.AllowNegativeBalance
			update.AllowNegativeBalance = &value
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported wallet update path: %s", path)
		}
	}
	updated, err := s.Store.UpdateFinanceWallet(ctx, update)
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceWalletFromStore(user.Username, updated), nil
}

func (s *APIV1Service) ListFinanceCategories(ctx context.Context, request *v1pb.ListFinanceCategoriesRequest) (*v1pb.ListFinanceCategoriesResponse, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	find := &store.FindFinanceCategory{CreatorID: &user.ID}
	if request.State != v1pb.State_STATE_UNSPECIFIED {
		state := convertStateToStore(request.State)
		find.RowStatus = &state
	}
	if request.Type != v1pb.FinanceCategory_TYPE_UNSPECIFIED {
		categoryType := store.FinanceCategoryType(request.Type.String())
		find.Type = &categoryType
	}
	categories, err := s.Store.ListFinanceCategories(ctx, find)
	if err != nil {
		return nil, financeStoreError(err)
	}
	response := &v1pb.ListFinanceCategoriesResponse{Categories: make([]*v1pb.FinanceCategory, 0, len(categories))}
	for _, category := range categories {
		response.Categories = append(response.Categories, convertFinanceCategoryFromStore(user.Username, category))
	}
	return response, nil
}

func (s *APIV1Service) CreateFinanceCategory(ctx context.Context, request *v1pb.CreateFinanceCategoryRequest) (*v1pb.FinanceCategory, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.Category == nil {
		return nil, status.Error(codes.InvalidArgument, "category is required")
	}
	if err := validateFinanceDisplayName(request.Category.DisplayName); err != nil {
		return nil, err
	}
	if request.Category.Type != v1pb.FinanceCategory_INCOME && request.Category.Type != v1pb.FinanceCategory_EXPENSE {
		return nil, status.Error(codes.InvalidArgument, "category type must be income or expense")
	}
	uid := request.RequestId
	if uid == "" {
		uid = util.GenUUID()
	} else {
		existing, listErr := s.Store.ListFinanceCategories(ctx, &store.FindFinanceCategory{UID: &uid, CreatorID: &user.ID})
		if listErr != nil {
			return nil, financeStoreError(listErr)
		}
		if len(existing) > 0 {
			return convertFinanceCategoryFromStore(user.Username, existing[0]), nil
		}
	}
	category, err := s.Store.CreateFinanceCategory(ctx, &store.FinanceCategory{
		UID: uid, CreatorID: user.ID, Name: strings.TrimSpace(request.Category.DisplayName), Type: store.FinanceCategoryType(request.Category.Type.String()),
	})
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceCategoryFromStore(user.Username, category), nil
}

func (s *APIV1Service) UpdateFinanceCategory(ctx context.Context, request *v1pb.UpdateFinanceCategoryRequest) (*v1pb.FinanceCategory, error) {
	if request.Category == nil || request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Error(codes.InvalidArgument, "category and update mask are required")
	}
	user, category, err := s.resolveFinanceCategory(ctx, request.Category.Name)
	if err != nil {
		return nil, err
	}
	nowSec := time.Now().Unix()
	update := &store.UpdateFinanceCategory{ID: category.ID, CreatorID: user.ID, UpdatedTs: &nowSec}
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "display_name":
			if err := validateFinanceDisplayName(request.Category.DisplayName); err != nil {
				return nil, err
			}
			name := strings.TrimSpace(request.Category.DisplayName)
			update.Name = &name
		case "state":
			state := convertStateToStore(request.Category.State)
			update.RowStatus = &state
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported category update path: %s", path)
		}
	}
	updated, err := s.Store.UpdateFinanceCategory(ctx, update)
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceCategoryFromStore(user.Username, updated), nil
}

func (s *APIV1Service) buildStoreFinanceTransaction(ctx context.Context, user *store.User, message *v1pb.FinanceTransaction) (*store.FinanceTransaction, error) {
	transactionType := convertFinanceTransactionTypeToStore(message.Type)
	if transactionType != store.FinanceTransactionIncome && transactionType != store.FinanceTransactionExpense && transactionType != store.FinanceTransactionTransfer {
		return nil, status.Error(codes.InvalidArgument, "transaction type must be income, expense, or transfer")
	}
	if err := validateFinanceAmount(message.AmountMinor); err != nil {
		return nil, err
	}
	if len([]rune(message.Note)) > maxFinanceNoteLength {
		return nil, status.Errorf(codes.InvalidArgument, "note exceeds %d characters", maxFinanceNoteLength)
	}
	if message.OccurTime == nil || !message.OccurTime.IsValid() {
		return nil, status.Error(codes.InvalidArgument, "valid occur time is required")
	}
	_, wallet, err := s.resolveFinanceWallet(ctx, message.Wallet)
	if err != nil {
		return nil, err
	}
	if wallet.CreatorID != user.ID {
		return nil, status.Error(codes.PermissionDenied, "wallet belongs to another user")
	}
	transaction := &store.FinanceTransaction{
		CreatorID: user.ID, OccurredTs: message.OccurTime.AsTime().Unix(), Type: transactionType,
		AmountMinor: message.AmountMinor, WalletID: wallet.ID, Note: strings.TrimSpace(message.Note),
	}
	if transactionType == store.FinanceTransactionTransfer {
		_, destination, resolveErr := s.resolveFinanceWallet(ctx, message.DestinationWallet)
		if resolveErr != nil {
			return nil, resolveErr
		}
		if destination.CreatorID != user.ID || destination.ID == wallet.ID {
			return nil, status.Error(codes.InvalidArgument, "transfer destination must be a different wallet owned by the user")
		}
		transaction.DestinationWalletID = &destination.ID
		if message.Category != "" {
			return nil, status.Error(codes.InvalidArgument, "transfer cannot have a category")
		}
	} else {
		_, category, resolveErr := s.resolveFinanceCategory(ctx, message.Category)
		if resolveErr != nil {
			return nil, resolveErr
		}
		transaction.CategoryID = &category.ID
	}
	return transaction, nil
}

func (s *APIV1Service) financeResourceMaps(ctx context.Context, userID int32) (map[int32]string, map[int32]string, error) {
	wallets, err := s.Store.ListFinanceWallets(ctx, &store.FindFinanceWallet{CreatorID: &userID})
	if err != nil {
		return nil, nil, err
	}
	categories, err := s.Store.ListFinanceCategories(ctx, &store.FindFinanceCategory{CreatorID: &userID})
	if err != nil {
		return nil, nil, err
	}
	walletUIDs := make(map[int32]string, len(wallets))
	for _, wallet := range wallets {
		walletUIDs[wallet.ID] = wallet.UID
	}
	categoryUIDs := make(map[int32]string, len(categories))
	for _, category := range categories {
		categoryUIDs[category.ID] = category.UID
	}
	return walletUIDs, categoryUIDs, nil
}

func (s *APIV1Service) ListFinanceTransactions(ctx context.Context, request *v1pb.ListFinanceTransactionsRequest) (*v1pb.ListFinanceTransactionsResponse, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	find := &store.FindFinanceTransaction{CreatorID: &user.ID}
	if request.StartTime != nil {
		value := request.StartTime.AsTime().Unix()
		find.StartTs = &value
	}
	if request.EndTime != nil {
		value := request.EndTime.AsTime().Unix()
		find.EndTs = &value
	}
	if request.Wallet != "" {
		_, wallet, resolveErr := s.resolveFinanceWallet(ctx, request.Wallet)
		if resolveErr != nil {
			return nil, resolveErr
		}
		find.WalletID = &wallet.ID
	}
	if request.Type != v1pb.FinanceTransaction_TYPE_UNSPECIFIED {
		value := convertFinanceTransactionTypeToStore(request.Type)
		find.Type = &value
	}
	var limit, offset int
	if request.PageToken != "" {
		var pageToken v1pb.PageToken
		if err := unmarshalPageToken(request.PageToken, &pageToken); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
		}
		limit = normalizePageSize(pageToken.Limit)
		offset = max(int(pageToken.Offset), 0)
	} else {
		limit = normalizePageSize(request.PageSize)
	}
	limitPlusOne := limit + 1
	find.Limit = &limitPlusOne
	find.Offset = &offset
	transactions, err := s.Store.ListFinanceTransactions(ctx, find)
	if err != nil {
		return nil, financeStoreError(err)
	}
	nextPageToken := ""
	if len(transactions) == limitPlusOne {
		transactions = transactions[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create page token: %v", err)
		}
	}
	walletUIDs, categoryUIDs, err := s.financeResourceMaps(ctx, user.ID)
	if err != nil {
		return nil, financeStoreError(err)
	}
	response := &v1pb.ListFinanceTransactionsResponse{Transactions: make([]*v1pb.FinanceTransaction, 0, len(transactions)), NextPageToken: nextPageToken}
	for _, transaction := range transactions {
		response.Transactions = append(response.Transactions, convertFinanceTransactionFromStore(user.Username, transaction, walletUIDs, categoryUIDs))
	}
	return response, nil
}

func (s *APIV1Service) CreateFinanceTransaction(ctx context.Context, request *v1pb.CreateFinanceTransactionRequest) (*v1pb.FinanceTransaction, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.Transaction == nil {
		return nil, status.Error(codes.InvalidArgument, "transaction is required")
	}
	uid := request.RequestId
	if uid == "" {
		uid = util.GenUUID()
	} else {
		existing, listErr := s.Store.ListFinanceTransactions(ctx, &store.FindFinanceTransaction{UID: &uid, CreatorID: &user.ID})
		if listErr != nil {
			return nil, financeStoreError(listErr)
		}
		if len(existing) > 0 {
			walletUIDs, categoryUIDs, mapErr := s.financeResourceMaps(ctx, user.ID)
			if mapErr != nil {
				return nil, financeStoreError(mapErr)
			}
			return convertFinanceTransactionFromStore(user.Username, existing[0], walletUIDs, categoryUIDs), nil
		}
	}
	transaction, err := s.buildStoreFinanceTransaction(ctx, user, request.Transaction)
	if err != nil {
		return nil, err
	}
	transaction.UID = uid
	created, err := s.Store.CreateFinanceTransaction(ctx, transaction)
	if err != nil {
		return nil, financeStoreError(err)
	}
	walletUIDs, categoryUIDs, err := s.financeResourceMaps(ctx, user.ID)
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceTransactionFromStore(user.Username, created, walletUIDs, categoryUIDs), nil
}

func (s *APIV1Service) UpdateFinanceTransaction(ctx context.Context, request *v1pb.UpdateFinanceTransactionRequest) (*v1pb.FinanceTransaction, error) {
	if request.Transaction == nil || request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Error(codes.InvalidArgument, "transaction and update mask are required")
	}
	user, existing, err := s.resolveFinanceTransaction(ctx, request.Transaction.Name)
	if err != nil {
		return nil, err
	}
	if existing.Type == store.FinanceTransactionAdjustment {
		return nil, status.Error(codes.FailedPrecondition, "balance adjustments cannot be edited")
	}
	walletUIDs, categoryUIDs, err := s.financeResourceMaps(ctx, user.ID)
	if err != nil {
		return nil, financeStoreError(err)
	}
	current := convertFinanceTransactionFromStore(user.Username, existing, walletUIDs, categoryUIDs)
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "type":
			current.Type = request.Transaction.Type
		case "amount_minor":
			current.AmountMinor = request.Transaction.AmountMinor
		case "wallet":
			current.Wallet = request.Transaction.Wallet
		case "destination_wallet":
			current.DestinationWallet = request.Transaction.DestinationWallet
		case "category":
			current.Category = request.Transaction.Category
		case "note":
			current.Note = request.Transaction.Note
		case "occur_time":
			current.OccurTime = request.Transaction.OccurTime
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported transaction update path: %s", path)
		}
	}
	replacement, err := s.buildStoreFinanceTransaction(ctx, user, current)
	if err != nil {
		return nil, err
	}
	updated, err := s.Store.UpdateFinanceTransaction(ctx, &store.UpdateFinanceTransaction{
		ID: existing.ID, CreatorID: user.ID, UpdatedTs: time.Now().Unix(), OccurredTs: replacement.OccurredTs,
		Type: replacement.Type, AmountMinor: replacement.AmountMinor, WalletID: replacement.WalletID,
		DestinationWalletID: replacement.DestinationWalletID, CategoryID: replacement.CategoryID, Note: replacement.Note,
	})
	if err != nil {
		return nil, financeStoreError(err)
	}
	walletUIDs, categoryUIDs, err = s.financeResourceMaps(ctx, user.ID)
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceTransactionFromStore(user.Username, updated, walletUIDs, categoryUIDs), nil
}

func (s *APIV1Service) DeleteFinanceTransaction(ctx context.Context, request *v1pb.DeleteFinanceTransactionRequest) (*emptypb.Empty, error) {
	user, transaction, err := s.resolveFinanceTransaction(ctx, request.Name)
	if err != nil {
		return nil, err
	}
	if err := s.Store.DeleteFinanceTransaction(ctx, &store.DeleteFinanceTransaction{ID: transaction.ID, CreatorID: user.ID}); err != nil {
		return nil, financeStoreError(err)
	}
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) AdjustFinanceWalletBalance(ctx context.Context, request *v1pb.AdjustFinanceWalletBalanceRequest) (*v1pb.FinanceTransaction, error) {
	user, wallet, err := s.resolveFinanceWallet(ctx, request.Wallet)
	if err != nil {
		return nil, err
	}
	if request.OccurTime == nil || !request.OccurTime.IsValid() {
		return nil, status.Error(codes.InvalidArgument, "valid occur time is required")
	}
	if len([]rune(request.Note)) > maxFinanceNoteLength {
		return nil, status.Errorf(codes.InvalidArgument, "note exceeds %d characters", maxFinanceNoteLength)
	}
	if request.RequestId != "" {
		existing, listErr := s.Store.ListFinanceTransactions(ctx, &store.FindFinanceTransaction{UID: &request.RequestId, CreatorID: &user.ID})
		if listErr != nil {
			return nil, financeStoreError(listErr)
		}
		if len(existing) > 0 {
			walletUIDs, categoryUIDs, mapErr := s.financeResourceMaps(ctx, user.ID)
			if mapErr != nil {
				return nil, financeStoreError(mapErr)
			}
			return convertFinanceTransactionFromStore(user.Username, existing[0], walletUIDs, categoryUIDs), nil
		}
	}
	if request.ActualBalanceMinor < -store.MaxFinanceAmountMinor || request.ActualBalanceMinor > store.MaxFinanceAmountMinor {
		return nil, status.Error(codes.InvalidArgument, "actual balance is outside the supported range")
	}
	if request.ActualBalanceMinor < 0 && !wallet.AllowNegativeBalance {
		return nil, status.Error(codes.FailedPrecondition, "negative balance is not enabled for this wallet")
	}
	if request.ActualBalanceMinor == wallet.BalanceMinor {
		return nil, status.Error(codes.InvalidArgument, "wallet already has the requested balance")
	}
	uid := request.RequestId
	if uid == "" {
		uid = util.GenUUID()
	}
	created, err := s.Store.CreateFinanceTransaction(ctx, &store.FinanceTransaction{
		UID: uid, CreatorID: user.ID, OccurredTs: request.OccurTime.AsTime().Unix(), Type: store.FinanceTransactionAdjustment,
		WalletID: wallet.ID, Note: strings.TrimSpace(request.Note), BalanceAfterMinor: request.ActualBalanceMinor,
	})
	if err != nil {
		return nil, financeStoreError(err)
	}
	walletUIDs, categoryUIDs, err := s.financeResourceMaps(ctx, user.ID)
	if err != nil {
		return nil, financeStoreError(err)
	}
	return convertFinanceTransactionFromStore(user.Username, created, walletUIDs, categoryUIDs), nil
}

func (s *APIV1Service) GetFinanceSummary(ctx context.Context, request *v1pb.GetFinanceSummaryRequest) (*v1pb.FinanceSummary, error) {
	user, err := s.authorizeFinanceParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.StartTime == nil || request.EndTime == nil || !request.StartTime.IsValid() || !request.EndTime.IsValid() {
		return nil, status.Error(codes.InvalidArgument, "valid start and end times are required")
	}
	start, end := request.StartTime.AsTime(), request.EndTime.AsTime()
	if !start.Before(end) {
		return nil, status.Error(codes.InvalidArgument, "start time must be before end time")
	}
	location, err := time.LoadLocation(request.TimeZone)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid time zone: %v", err)
	}
	startTs, endTs := start.Unix(), end.Unix()
	transactions, err := s.Store.ListFinanceTransactions(ctx, &store.FindFinanceTransaction{CreatorID: &user.ID, StartTs: &startTs, EndTs: &endTs})
	if err != nil {
		return nil, financeStoreError(err)
	}
	wallets, err := s.Store.ListFinanceWallets(ctx, &store.FindFinanceWallet{CreatorID: &user.ID})
	if err != nil {
		return nil, financeStoreError(err)
	}
	response := &v1pb.FinanceSummary{}
	for _, wallet := range wallets {
		response.TotalBalanceMinor += wallet.BalanceMinor
	}
	daily := map[string]*v1pb.FinanceDailySummary{}
	for _, transaction := range transactions {
		date := time.Unix(transaction.OccurredTs, 0).In(location).Format(time.DateOnly)
		day := daily[date]
		if day == nil {
			day = &v1pb.FinanceDailySummary{Date: date}
			daily[date] = day
		}
		switch transaction.Type {
		case store.FinanceTransactionIncome:
			response.IncomeMinor += transaction.AmountMinor
			day.IncomeMinor += transaction.AmountMinor
		case store.FinanceTransactionExpense:
			response.ExpenseMinor += transaction.AmountMinor
			day.ExpenseMinor += transaction.AmountMinor
		default:
			// Transfers and balance adjustments change wallet balances but do not inflate cash-flow statistics.
		}
	}
	response.NetMinor = response.IncomeMinor - response.ExpenseMinor
	dates := make([]string, 0, len(daily))
	for date := range daily {
		dates = append(dates, date)
	}
	slices.Sort(dates)
	for _, date := range dates {
		response.DailySummaries = append(response.DailySummaries, daily[date])
	}
	return response, nil
}
